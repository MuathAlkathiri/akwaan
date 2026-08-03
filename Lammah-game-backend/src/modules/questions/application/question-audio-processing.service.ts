import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetService } from '../../ai-agent/application/asset.service';
import type {
  AssetPipelineResult,
  AssetRequest,
} from '../../ai-agent/contracts/asset-provider.interface';
import { WigoloClient } from '../../ai-agent/infrastructure/wigolo/wigolo-client';
import { QuestionRepository } from '../persistence/question.repository';
import {
  AudioAssetStatus,
  AudioCandidateStatus,
  AudioQuestionKind,
  AudioReviewStatus,
  AssetStatus,
  QuestionAssetType,
  QuestionAudioCandidate,
  QuestionAudioRequest,
  QuestionStatus,
  QuestionType,
} from '../schemas/question.schema';
import { AudioSearchQueryBuilder } from './audio-search-query-builder.service';
import { AudioRetryMode, QuestionAudioJob } from './question-audio-job.types';

export const AUDIO_CLIP_DEFAULTS: Record<AudioQuestionKind, number> = {
  [AudioQuestionKind.IDENTIFY_SONG]: 12,
  [AudioQuestionKind.IDENTIFY_ARTIST]: 12,
  [AudioQuestionKind.IDENTIFY_CHARACTER]: 8,
  [AudioQuestionKind.IDENTIFY_VOICE]: 8,
  [AudioQuestionKind.IDENTIFY_GAME]: 8,
  [AudioQuestionKind.IDENTIFY_MOVIE]: 8,
  [AudioQuestionKind.IDENTIFY_DIALOGUE_SOURCE]: 8,
  [AudioQuestionKind.IDENTIFY_SOUND_EFFECT]: 5,
  [AudioQuestionKind.CUSTOM]: 8,
};

export type AudioProcessingOutcome =
  'awaitingCandidateSelection' | 'ready' | 'failed' | 'stale';

export function createMediaClipFingerprint(input: {
  sourceUrl: string;
  startTimeSeconds?: number | null;
  durationSeconds: number;
}) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        input.sourceUrl.trim(),
        input.startTimeSeconds ?? null,
        input.durationSeconds,
      ]),
    )
    .digest('hex');
}

@Injectable()
export class QuestionAudioProcessingService {
  private readonly logger = new Logger(QuestionAudioProcessingService.name);

  constructor(
    private readonly questions: QuestionRepository,
    private readonly assets: AssetService,
    private readonly wigolo: WigoloClient,
    private readonly queryBuilder: AudioSearchQueryBuilder,
    private readonly config: ConfigService,
  ) {}

  async process(job: QuestionAudioJob): Promise<AudioProcessingOutcome> {
    const processingJobId =
      job.jobId ??
      createHash('sha256')
        .update(
          [
            job.questionId,
            job.requestVersion,
            job.requestHash,
            job.mode,
            job.candidateId ?? '',
          ].join(':'),
        )
        .digest('hex')
        .slice(0, 24);
    let question = await this.current(job, 'start');
    if (!question?.requiresAudio || !question.audioRequest) return 'stale';

    if (job.mode === AudioRetryMode.RESEARCH) {
      question.audioStatus = AudioAssetStatus.SEARCHING;
      question.audioReviewStatus = AudioReviewStatus.PENDING;
      question.audioDiagnostics = {
        startedAt: new Date().toISOString(),
        retryMode: job.mode,
        requestVersion: job.requestVersion,
      };
      await question.save();

      const discovery = await this.discover(job, question.audioRequest);
      question = await this.current(job, 'persist-candidates');
      if (!question?.audioRequest) return 'stale';
      question.audioCandidates = discovery.candidates;
      question.audioRequest.candidateSetVersion = job.requestVersion;
      question.audioRequest.selectedCandidateId = null;
      question.audioReviewStatus = AudioReviewStatus.PENDING;

      if (!discovery.candidates.length) {
        question.status = QuestionStatus.DRAFT;
        question.audioStatus = AudioAssetStatus.FAILED;
        question.assetStatus = AssetStatus.FAILED;
        question.audioDiagnostics = {
          code: 'AUDIO_SEARCH_NO_RESULTS',
          message: 'No usable audio candidates were found.',
          retryMode: job.mode,
          generatedSearchQueries: discovery.queries,
          resultCounts: discovery.resultCounts,
          failedAt: new Date().toISOString(),
        };
        await question.save();
        return 'failed';
      }

      if (!this.autoSelectFirstCandidate()) {
        question.audioStatus = AudioAssetStatus.PENDING;
        question.assetStatus = AssetStatus.PENDING;
        question.audioDiagnostics = {
          code: 'AUDIO_CANDIDATE_SELECTION_REQUIRED',
          message: 'Select a candidate to start audio processing.',
          retryMode: job.mode,
          generatedSearchQueries: discovery.queries,
          resultCounts: discovery.resultCounts,
          candidateCount: discovery.candidates.length,
          discoveredAt: new Date().toISOString(),
        };
        await question.save();
        return 'awaitingCandidateSelection';
      }

      const first = discovery.candidates[0];
      first.status = AudioCandidateStatus.SELECTED;
      question.audioRequest.selectedCandidateId = first.id;
      await question.save();
      job = { ...job, candidateId: first.id };
    }

    question = await this.current(job, 'before-processing');
    if (!question?.audioRequest) return 'stale';
    const selectedId =
      job.candidateId ?? question.audioRequest.selectedCandidateId;
    const selected = question.audioCandidates?.find(
      (candidate) =>
        candidate.id === selectedId &&
        candidate.requestVersion === job.requestVersion &&
        candidate.requestHash === job.requestHash,
    );
    if (!selected) {
      const previousProcessingStatus = question.audioStatus;
      const previousReviewStatus = question.audioReviewStatus;
      question.status = QuestionStatus.DRAFT;
      question.audioStatus = AudioAssetStatus.FAILED;
      question.assetStatus = AssetStatus.FAILED;
      question.audioReviewStatus = AudioReviewStatus.PENDING;
      question.audioRequestStale = true;
      question.audioDiagnostics = {
        code: 'AUDIO_SELECTED_CANDIDATE_REQUIRED',
        message: 'The selected candidate is missing or no longer current.',
        retryMode: job.mode,
      };
      await question.save();
      this.logLifecycle({
        event: 'media.lifecycle.processing-failed',
        questionId: job.questionId,
        candidateId: selectedId ?? null,
        mediaAssetId: null,
        mediaType: question.type,
        processingJobId,
        sourceUrl: null,
        outputStorageKey: null,
        previousProcessingStatus,
        nextProcessingStatus: AudioAssetStatus.FAILED,
        previousReviewStatus,
        nextReviewStatus: AudioReviewStatus.PENDING,
        persistenceResult: true,
        caughtError: 'The selected candidate is missing or no longer current.',
      });
      return 'failed';
    }

    question.audioCandidates = question.audioCandidates?.map((candidate) => ({
      ...candidate,
      status:
        candidate.id === selected.id
          ? AudioCandidateStatus.SELECTED
          : AudioCandidateStatus.AVAILABLE,
    }));
    question.audioRequest.selectedCandidateId = selected.id;
    const previousProcessingStatus = question.audioStatus;
    const previousReviewStatus = question.audioReviewStatus;
    question.audioStatus = AudioAssetStatus.PROCESSING;
    question.assetStatus = AssetStatus.PENDING;
    question.audioReviewStatus = AudioReviewStatus.PENDING;
    question.audioRequestStale = true;
    question.assetFailureReason = undefined;
    question.assetFailureStep = undefined;
    question.assetFailureDiagnostics = undefined;
    question.audioDiagnostics = {
      ...this.boundedDiscoveryDiagnostics(question.audioDiagnostics),
      retryMode: job.mode,
      candidateSelected: {
        id: selected.id,
        title: selected.title,
        provider: selected.provider,
        queryUsed: selected.queryUsed,
      },
      processingStartedAt: new Date().toISOString(),
      processingJobId,
    };
    await question.save();
    this.logLifecycle({
      event: 'media.lifecycle.processing-started',
      questionId: job.questionId,
      candidateId: selected.id,
      mediaAssetId: null,
      mediaType: question.type,
      processingJobId,
      sourceUrl: selected.sourceUrl ?? null,
      outputStorageKey: null,
      previousProcessingStatus,
      nextProcessingStatus: AudioAssetStatus.PROCESSING,
      previousReviewStatus,
      nextReviewStatus: AudioReviewStatus.PENDING,
      persistenceResult: true,
    });

    if (!(await this.current(job, 'provider-processing'))) return 'stale';
    let result: AssetPipelineResult;
    let caughtError: string | undefined;
    const assetType =
      question.type === QuestionType.VIDEO
        ? QuestionAssetType.VIDEO
        : QuestionAssetType.AUDIO;
    try {
      result = await this.assets.process(
        this.toAssetRequest(question.audioRequest, selected, assetType),
      );
    } catch (error) {
      caughtError =
        error instanceof Error ? error.message.slice(0, 300) : String(error);
      result = {
        assetStatus: 'FAILED',
        assetFailureReason: caughtError,
        assetFailureStep: 'processing',
      };
    }

    const latest = await this.current(job, 'persist-asset');
    if (!latest?.audioRequest) return 'stale';
    if (result.assetStatus === 'READY') {
      const mediaAssetId =
        String(result.asset.metadata?.mediaFingerprint ?? '').trim() ||
        createHash('sha256')
          .update(
            [
              result.asset.url,
              selected.id,
              job.requestHash,
              result.asset.duration ?? '',
            ].join(':'),
          )
          .digest('hex');
      const storageKey =
        result.asset.url.split('/uploads/')[1] ?? result.asset.url;
      const readyPreviousReviewStatus = latest.audioReviewStatus;
      const mediaFingerprint =
        String(result.asset.metadata?.mediaFingerprint ?? '').trim() ||
        createMediaClipFingerprint({
          sourceUrl: selected.sourceUrl ?? selected.id,
          startTimeSeconds: latest.audioRequest.preferredStartSeconds,
          durationSeconds:
            result.asset.duration ??
            latest.audioRequest.preferredDurationSeconds ??
            AUDIO_CLIP_DEFAULTS[latest.audioRequest.kind],
        });
      const asset = {
        ...result.asset,
        type: assetType,
        metadata: {
          ...result.asset.metadata,
          mediaFingerprint,
          mediaAssetId,
          processingJobId,
          requestVersion: job.requestVersion,
          requestHash: job.requestHash,
          candidateId: selected.id,
          sourceUrl: selected.sourceUrl,
          storageKey,
          mimetype:
            result.asset.metadata?.mimetype ??
            (assetType === QuestionAssetType.VIDEO ? 'video/mp4' : 'audio/mp4'),
        },
      };
      latest.audioAsset = asset;
      latest.primaryAsset = asset;
      latest.mediaUrl = result.asset.url;
      latest.audioStatus = AudioAssetStatus.READY;
      latest.assetStatus = AssetStatus.READY;
      latest.audioReviewStatus = AudioReviewStatus.PENDING;
      latest.audioRequestStale = false;
      latest.assetFailureReason = undefined;
      latest.assetFailureStep = undefined;
      latest.assetFailureDiagnostics = undefined;
      latest.audioDiagnostics = {
        ...this.boundedDiscoveryDiagnostics(latest.audioDiagnostics),
        retryMode: job.mode,
        candidateSelected: {
          id: selected.id,
          title: selected.title,
          provider: selected.provider,
          queryUsed: selected.queryUsed,
        },
        completedAt: new Date().toISOString(),
        sourceProvider: result.asset.provider,
        sourceTitle: result.asset.metadata?.title,
        clipStartSeconds:
          result.asset.metadata?.selectedWindowStartSeconds ?? 0,
        clipDurationSeconds: result.asset.duration,
        processingJobId,
        mediaAssetId,
      };
      await latest.save();
      const persisted = await this.questions.findDocumentById(job.questionId);
      const persistenceResult = Boolean(
        persisted?.audioStatus === AudioAssetStatus.READY &&
        persisted.assetStatus === AssetStatus.READY &&
        persisted.audioAsset?.url === asset.url &&
        persisted.primaryAsset?.url === asset.url &&
        persisted.audioRequestStale === false,
      );
      this.logLifecycle({
        event: 'media.lifecycle.processing-ready',
        questionId: job.questionId,
        candidateId: selected.id,
        mediaAssetId,
        mediaType: assetType,
        processingJobId,
        sourceUrl: selected.sourceUrl ?? null,
        outputStorageKey: storageKey,
        previousProcessingStatus: AudioAssetStatus.PROCESSING,
        nextProcessingStatus: AudioAssetStatus.READY,
        previousReviewStatus: readyPreviousReviewStatus,
        nextReviewStatus: AudioReviewStatus.PENDING,
        persistenceResult,
      });
      if (!persistenceResult) {
        latest.status = QuestionStatus.DRAFT;
        latest.audioStatus = AudioAssetStatus.FAILED;
        latest.assetStatus = AssetStatus.FAILED;
        latest.audioAsset = null;
        latest.primaryAsset = null;
        latest.mediaUrl = undefined;
        latest.audioRequestStale = true;
        latest.audioDiagnostics = {
          code: 'MEDIA_READY_PERSISTENCE_VERIFICATION_FAILED',
          message:
            'Generated media could not be verified after database persistence.',
          processingJobId,
          failedAt: new Date().toISOString(),
        };
        await latest.save();
        return 'failed';
      }
      return 'ready';
    }

    latest.status = QuestionStatus.DRAFT;
    latest.audioStatus = AudioAssetStatus.FAILED;
    latest.assetStatus = AssetStatus.FAILED;
    latest.audioReviewStatus = AudioReviewStatus.PENDING;
    latest.audioRequestStale = true;
    latest.audioDiagnostics = {
      ...this.boundedDiscoveryDiagnostics(latest.audioDiagnostics),
      code:
        result.assetStatus === 'FAILED'
          ? this.failureCode(result.assetFailureStep)
          : 'AUDIO_CLIP_PROCESSING_FAILED',
      message:
        result.assetStatus === 'FAILED'
          ? result.assetFailureReason
          : 'Audio provider returned no asset.',
      retryMode: job.mode,
      candidateSelected: {
        id: selected.id,
        title: selected.title,
        provider: selected.provider,
        queryUsed: selected.queryUsed,
      },
      failedAfterCandidateSelection: true,
      failedAt: new Date().toISOString(),
      processingJobId,
    };
    await latest.save();
    const persisted = await this.questions.findDocumentById(job.questionId);
    this.logLifecycle({
      event: 'media.lifecycle.processing-failed',
      questionId: job.questionId,
      candidateId: selected.id,
      mediaAssetId: latest.audioAsset?.metadata?.mediaAssetId ?? null,
      mediaType: assetType,
      processingJobId,
      sourceUrl: selected.sourceUrl ?? null,
      outputStorageKey:
        latest.audioAsset?.metadata?.storageKey ??
        latest.audioAsset?.url ??
        null,
      previousProcessingStatus: AudioAssetStatus.PROCESSING,
      nextProcessingStatus: AudioAssetStatus.FAILED,
      previousReviewStatus: latest.audioReviewStatus,
      nextReviewStatus: AudioReviewStatus.PENDING,
      persistenceResult:
        persisted?.audioStatus === AudioAssetStatus.FAILED &&
        persisted.assetStatus === AssetStatus.FAILED,
      caughtError:
        caughtError ??
        (result.assetStatus === 'FAILED'
          ? result.assetFailureReason.slice(0, 300)
          : undefined),
    });
    return 'failed';
  }

  private logLifecycle(value: Record<string, unknown>) {
    this.logger.log(JSON.stringify(value));
  }

  private async discover(job: QuestionAudioJob, request: QuestionAudioRequest) {
    const queries = this.queryBuilder.build(request);
    const candidates = new Map<string, QuestionAudioCandidate>();
    const resultCounts: Array<{
      query: string;
      resultCount: number;
      issueCode?: string;
    }> = [];
    for (const query of queries) {
      if (!(await this.current(job, 'wigolo-search'))) break;
      try {
        const response = await this.wigolo.callToolDetailed('search', {
          query,
          max_results: 5,
        });
        const results = Array.isArray(response.data.results)
          ? response.data.results.slice(0, 5)
          : [];
        resultCounts.push({ query, resultCount: results.length });
        for (const value of results) {
          const candidate = this.safeCandidate(
            value,
            query,
            candidates.size + 1,
            job,
          );
          if (candidate && !candidates.has(candidate.id))
            candidates.set(candidate.id, candidate);
          if (candidates.size >= 5) break;
        }
      } catch {
        resultCounts.push({
          query,
          resultCount: 0,
          issueCode: 'AUDIO_SEARCH_PROVIDER_UNAVAILABLE',
        });
      }
      if (candidates.size >= 5) break;
    }
    return {
      queries,
      resultCounts: resultCounts.slice(0, 6),
      candidates: [...candidates.values()].slice(0, 5),
    };
  }

  private safeCandidate(
    value: unknown,
    queryUsed: string,
    rank: number,
    job: QuestionAudioJob,
  ): QuestionAudioCandidate | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const item = value as Record<string, unknown>;
    const title = this.safeText(item.title, 160);
    const sourceUrl = this.safeUrl(item.url);
    // `wigolo` is a generic web-search tool, not a media provider — its
    // results don't carry a meaningful `provider` field, so fall back to
    // detecting the real host (only YouTube links can currently be
    // auto-downloaded, see YouTubeAssetProvider) instead of naming the
    // internal search tool as if it were the source.
    const provider =
      this.safeText(item.provider, 40) || this.inferProvider(sourceUrl);
    const providerReference = this.safeText(item.id, 180) || sourceUrl;
    if (!title || !providerReference) return undefined;
    const id = createHash('sha256')
      .update(`${provider}:${providerReference}`)
      .digest('hex')
      .slice(0, 24);
    const duration = Number(item.durationSeconds ?? item.duration);
    return {
      id,
      title,
      ...(sourceUrl ? { sourceUrl } : {}),
      provider,
      ...(Number.isFinite(duration) && duration > 0
        ? { durationSeconds: duration }
        : {}),
      ...(this.safeUrl(item.thumbnail)
        ? { thumbnail: this.safeUrl(item.thumbnail) }
        : {}),
      queryUsed,
      rank,
      status: AudioCandidateStatus.AVAILABLE,
      requestVersion: job.requestVersion,
      requestHash: job.requestHash,
    };
  }

  private async current(job: QuestionAudioJob, stage: string) {
    const question = await this.questions.findDocumentById(job.questionId);
    const request = question?.audioRequest;
    if (
      !question ||
      !request ||
      request.requestVersion !== job.requestVersion ||
      request.requestHash !== job.requestHash
    ) {
      this.logger.log(
        JSON.stringify({
          event: 'audio.stale_job_ignored',
          questionId: job.questionId,
          requestVersion: job.requestVersion,
          mode: job.mode,
          stage,
        }),
      );
      return undefined;
    }
    return question;
  }

  private toAssetRequest(
    request: QuestionAudioRequest,
    selected: QuestionAudioCandidate,
    assetType: QuestionAssetType.AUDIO | QuestionAssetType.VIDEO,
  ): AssetRequest {
    const music = [
      AudioQuestionKind.IDENTIFY_SONG,
      AudioQuestionKind.IDENTIFY_ARTIST,
    ].includes(request.kind);
    const duration =
      request.preferredDurationSeconds ?? AUDIO_CLIP_DEFAULTS[request.kind];
    return {
      type: assetType,
      provider: request.provider ?? 'youtube',
      query: selected.queryUsed,
      selectedCandidate: {
        id: selected.id,
        title: selected.title,
        sourceUrl: selected.sourceUrl,
        provider: selected.provider,
        durationSeconds: selected.durationSeconds,
        queryUsed: selected.queryUsed,
      },
      selectedSourceUrl: selected.sourceUrl,
      entity: request.targetName ?? request.searchQuery,
      title: request.targetName,
      artist: music ? request.sourceTitle : undefined,
      franchise: music ? undefined : request.sourceTitle,
      language: request.language,
      duration,
      preferredStartSeconds: request.preferredStartSeconds,
      mediaFingerprint: createMediaClipFingerprint({
        sourceUrl: selected.sourceUrl ?? selected.id,
        startTimeSeconds: request.preferredStartSeconds,
        durationSeconds: duration,
      }),
      mediaIntent: music ? 'music' : 'voice',
      sourceType: music ? 'song' : 'speech',
      gameMode: music ? 'identifySong' : 'identifyVoice',
    };
  }

  private autoSelectFirstCandidate(): boolean {
    return (
      this.config
        .get<string>('AUDIO_AUTO_SELECT_FIRST_CANDIDATE')
        ?.trim()
        .toLowerCase() === 'true'
    );
  }

  private boundedDiscoveryDiagnostics(value: unknown) {
    if (!value || typeof value !== 'object') return {};
    const source = value as Record<string, unknown>;
    return {
      ...(Array.isArray(source.generatedSearchQueries)
        ? { generatedSearchQueries: source.generatedSearchQueries.slice(0, 6) }
        : {}),
      ...(Array.isArray(source.resultCounts)
        ? { resultCounts: source.resultCounts.slice(0, 6) }
        : {}),
      ...(typeof source.candidateCount === 'number'
        ? { candidateCount: source.candidateCount }
        : {}),
    };
  }

  private safeText(value: unknown, max: number): string {
    return typeof value === 'string'
      ? value
          .replace(/[\r\n\t]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, max)
      : '';
  }

  private safeUrl(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol)
        ? url.toString().slice(0, 500)
        : undefined;
    } catch {
      return undefined;
    }
  }

  private inferProvider(sourceUrl?: string): string {
    if (!sourceUrl) return 'web';
    try {
      const hostname = new URL(sourceUrl).hostname
        .replace(/^www\.|^m\./, '')
        .toLowerCase();
      if (hostname === 'youtube.com' || hostname === 'youtu.be')
        return 'youtube';
      return 'web';
    } catch {
      return 'web';
    }
  }

  private failureCode(step?: string): string {
    if (step === 'search' || step === 'select-video')
      return 'AUDIO_SEARCH_NO_RESULTS';
    if (step === 'download') return 'AUDIO_DOWNLOAD_FAILED';
    if (step === 'inspect') return 'AUDIO_INVALID_STREAM';
    if (step === 'store') return 'AUDIO_STORAGE_FAILED';
    return 'AUDIO_CLIP_PROCESSING_FAILED';
  }
}
