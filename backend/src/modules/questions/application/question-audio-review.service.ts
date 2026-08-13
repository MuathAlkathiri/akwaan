import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { stat } from 'fs/promises';
import type {
  StoredLocalAudio,
  UploadedAudioFile,
} from '../../../common/uploads/local-audio-storage.service';
import { LocalAudioStorageService } from '../../../common/uploads/local-audio-storage.service';
import { QuestionAudioRequestDto } from '../dto/create-question.dto';
import { QuestionRepository } from '../persistence/question.repository';
import {
  AudioAssetStatus,
  AudioCandidateStatus,
  AudioReviewStatus,
  QuestionAssetType,
  AssetStatus,
  QuestionStatus,
  QuestionType,
} from '../schemas/question.schema';
import { QuestionAudioJobService } from './question-audio-job.service';
import { AudioRequestIdentityService } from './audio-request-identity.service';
import { AudioRetryMode } from './question-audio-job.types';
import { MediaInspectorService } from '../../../infrastructure/media/media-inspector.service';
import { AudioProcessorService } from '../../../infrastructure/media/audio-processor.service';
import { PreviewQuestionMediaClipDto } from '../dto/question-audio.dto';
import { processingApprovalIssue } from './question-media-lifecycle.policy';

@Injectable()
export class QuestionAudioReviewService {
  private readonly logger = new Logger(QuestionAudioReviewService.name);

  constructor(
    private readonly questions: QuestionRepository,
    private readonly jobs: QuestionAudioJobService,
    private readonly storage: LocalAudioStorageService,
    private readonly inspector: MediaInspectorService,
    private readonly audioProcessor: AudioProcessorService,
    private readonly identities: AudioRequestIdentityService,
  ) {}

  async retry(id: string, requestedMode?: AudioRetryMode) {
    const question = await this.required(id);
    if (!question.requiresAudio || !question.audioRequest)
      throw new BadRequestException({
        code: 'AUDIO_REQUEST_REQUIRED',
        message: 'This question has no audio request to retry.',
      });
    question.audioRequest = this.identities.ensure(question.audioRequest);
    const hasCurrentSelectedCandidate = Boolean(
      question.audioRequest.selectedCandidateId &&
      question.audioCandidates?.some(
        (candidate) =>
          candidate.id === question.audioRequest?.selectedCandidateId &&
          candidate.requestVersion === question.audioRequest?.requestVersion &&
          candidate.requestHash === question.audioRequest?.requestHash,
      ),
    );
    const shouldRetryProcessing = Boolean(
      hasCurrentSelectedCandidate &&
      question.audioDiagnostics?.failedAfterCandidateSelection === true,
    );
    const mode =
      requestedMode ??
      (shouldRetryProcessing
        ? AudioRetryMode.RETRY_PROCESSING
        : AudioRetryMode.RESEARCH);
    if (
      mode === AudioRetryMode.RETRY_PROCESSING &&
      !hasCurrentSelectedCandidate
    )
      throw new BadRequestException({
        code: 'AUDIO_CANDIDATE_NOT_REUSABLE',
        message:
          'Retry processing requires a selected candidate from the active request.',
      });
    if (mode === AudioRetryMode.RESEARCH) {
      question.audioCandidates = [];
      question.audioRequest.selectedCandidateId = null;
      question.audioRequest.candidateSetVersion = null;
      question.audioRequestStale = Boolean(question.audioAsset);
    }
    question.status = QuestionStatus.DRAFT;
    question.audioStatus = AudioAssetStatus.PENDING;
    question.audioReviewStatus = AudioReviewStatus.PENDING;
    question.audioDiagnostics = {
      retryMode: mode,
      retryRequestedAt: new Date().toISOString(),
    };
    await question.save();
    const enqueued = this.jobs.enqueue({
      questionId: id,
      requestVersion: question.audioRequest.requestVersion!,
      requestHash: question.audioRequest.requestHash!,
      mode,
      ...(mode === AudioRetryMode.RETRY_PROCESSING
        ? { candidateId: question.audioRequest.selectedCandidateId! }
        : {}),
    });
    question.audioDiagnostics = {
      ...question.audioDiagnostics,
      jobEnqueued: enqueued,
    };
    await question.save();
    return question.populate('category');
  }

  async updateRequest(id: string, request: QuestionAudioRequestDto) {
    const question = await this.required(id);
    const previous = question.audioRequest
      ? this.identities.ensure(question.audioRequest)
      : undefined;
    const next = this.identities.create(
      request,
      (previous?.requestVersion ?? 0) + 1,
    );
    question.requiresAudio = true;
    question.audioKind = request.kind;
    question.audioRequest = next;
    question.audioCandidates = [];
    question.status = QuestionStatus.DRAFT;
    question.audioRequestStale = Boolean(question.audioAsset);
    question.audioStatus = AudioAssetStatus.PENDING;
    question.assetStatus = AssetStatus.PENDING;
    question.audioReviewStatus = AudioReviewStatus.PENDING;
    question.audioDiagnostics = {
      code: 'AUDIO_REQUEST_INVALIDATED',
      message: 'The previous candidate and clip no longer match this request.',
      requestInvalidatedAt: new Date().toISOString(),
      previousRequestVersion: previous?.requestVersion,
      ...(question.audioAsset
        ? {
            previousAsset: {
              provider: question.audioAsset.provider,
              duration: question.audioAsset.duration,
              sourceId: question.audioAsset.metadata?.sourceId,
              title: question.audioAsset.metadata?.title,
            },
          }
        : {}),
    };
    await question.save();
    const enqueued = this.jobs.enqueue({
      questionId: id,
      requestVersion: next.requestVersion!,
      requestHash: next.requestHash!,
      mode: AudioRetryMode.RESEARCH,
    });
    question.audioDiagnostics = {
      ...question.audioDiagnostics,
      retryMode: AudioRetryMode.RESEARCH,
      jobEnqueued: enqueued,
    };
    return (await question.save()).populate('category');
  }

  async updateClip(
    id: string,
    clip: { preferredStartSeconds?: number; preferredDurationSeconds?: number },
  ) {
    const question = await this.required(id);
    if (!question.audioRequest)
      throw new BadRequestException({
        code: 'AUDIO_REQUEST_REQUIRED',
        message: 'This question has no audio request.',
      });
    return this.updateRequest(id, {
      ...question.audioRequest,
      ...clip,
    } as QuestionAudioRequestDto);
  }

  async previewClip(id: string, timing: PreviewQuestionMediaClipDto) {
    const question = await this.required(id);
    if (!question.audioRequest)
      throw new BadRequestException({
        code: 'AUDIO_REQUEST_REQUIRED',
        message: 'This question has no media request.',
      });
    const current = this.identities.ensure(question.audioRequest);
    const candidate = question.audioCandidates?.find(
      (item) =>
        item.id === current.selectedCandidateId &&
        item.requestVersion === current.requestVersion &&
        item.requestHash === current.requestHash,
    );
    if (!candidate)
      throw new BadRequestException({
        code: 'AUDIO_CANDIDATE_NOT_REUSABLE',
        message:
          'Preview requires a selected candidate from the active request.',
      });
    if (
      question.type === QuestionType.VIDEO &&
      timing.durationSeconds !== undefined &&
      (timing.durationSeconds < 5 || timing.durationSeconds > 15)
    )
      throw new BadRequestException({
        code: 'VIDEO_DURATION_INVALID',
        message: 'Video preview duration must be between 5 and 15 seconds.',
      });

    const next = this.identities.create(
      {
        ...current,
        preferredStartSeconds: timing.startTimeSeconds ?? null,
        preferredDurationSeconds: timing.durationSeconds,
      },
      (current.requestVersion ?? 0) + 1,
    );
    const candidates = (question.audioCandidates ?? []).map((item) => ({
      ...item,
      requestVersion: next.requestVersion!,
      requestHash: next.requestHash!,
      status:
        item.id === candidate.id
          ? AudioCandidateStatus.SELECTED
          : AudioCandidateStatus.AVAILABLE,
    }));
    next.selectedCandidateId = candidate.id;
    next.candidateSetVersion = next.requestVersion;
    question.audioRequest = next;
    question.audioCandidates = candidates;
    question.status = QuestionStatus.DRAFT;
    question.audioStatus = AudioAssetStatus.PENDING;
    question.assetStatus = AssetStatus.PENDING;
    question.audioReviewStatus = AudioReviewStatus.PENDING;
    question.audioRequestStale = Boolean(question.audioAsset);
    question.audioDiagnostics = {
      code: 'MEDIA_PREVIEW_REQUESTED',
      previewRequestedAt: new Date().toISOString(),
      startTimeSeconds: timing.startTimeSeconds ?? 0,
      durationSeconds: timing.durationSeconds,
      sourceUrl: candidate.sourceUrl,
    };
    await question.save();
    const enqueued = this.jobs.enqueue({
      questionId: id,
      requestVersion: next.requestVersion!,
      requestHash: next.requestHash!,
      mode: AudioRetryMode.RETRY_PROCESSING,
      candidateId: candidate.id,
    });
    question.audioDiagnostics = {
      ...question.audioDiagnostics,
      jobEnqueued: enqueued,
    };
    return (await question.save()).populate('category');
  }

  async candidates(id: string) {
    const question = await this.required(id);
    if (!question.audioRequest) return [];
    const current = this.identities.ensure(question.audioRequest);
    return (question.audioCandidates ?? [])
      .filter(
        (candidate) =>
          candidate.requestVersion === current.requestVersion &&
          candidate.requestHash === current.requestHash,
      )
      .slice(0, 5);
  }

  async selectCandidate(id: string, candidateId: string) {
    const question = await this.required(id);
    if (!question.audioRequest)
      throw new BadRequestException({
        code: 'AUDIO_REQUEST_REQUIRED',
        message: 'This question has no audio request.',
      });
    question.audioRequest = this.identities.ensure(question.audioRequest);
    const candidate = question.audioCandidates?.find(
      (item) =>
        item.id === candidateId &&
        item.requestVersion === question.audioRequest?.requestVersion &&
        item.requestHash === question.audioRequest?.requestHash,
    );
    if (!candidate)
      throw new BadRequestException({
        code: 'AUDIO_CANDIDATE_NOT_CURRENT',
        message: 'This candidate does not belong to the active audio request.',
      });
    question.audioRequest.selectedCandidateId = candidate.id;
    question.audioCandidates = question.audioCandidates?.map((item) => ({
      ...item,
      status:
        item.id === candidate.id
          ? AudioCandidateStatus.SELECTED
          : AudioCandidateStatus.AVAILABLE,
    }));
    question.status = QuestionStatus.DRAFT;
    question.audioStatus = AudioAssetStatus.PENDING;
    question.assetStatus = AssetStatus.PENDING;
    question.audioReviewStatus = AudioReviewStatus.PENDING;
    question.audioRequestStale = Boolean(question.audioAsset);
    question.audioDiagnostics = {
      candidateSelected: {
        id: candidate.id,
        title: candidate.title,
        provider: candidate.provider,
        queryUsed: candidate.queryUsed,
      },
      retryMode: AudioRetryMode.RETRY_PROCESSING,
      selectedAt: new Date().toISOString(),
    };
    await question.save();
    const enqueued = this.jobs.enqueue({
      questionId: id,
      requestVersion: question.audioRequest.requestVersion!,
      requestHash: question.audioRequest.requestHash!,
      mode: AudioRetryMode.RETRY_PROCESSING,
      candidateId: candidate.id,
    });
    question.audioDiagnostics = {
      ...question.audioDiagnostics,
      jobEnqueued: enqueued,
    };
    return (await question.save()).populate('category');
  }

  async approve(id: string) {
    const question = await this.required(id);
    const issue = processingApprovalIssue(question);
    if (issue) throw new BadRequestException(issue);
    const previousReviewStatus = question.audioReviewStatus;
    question.audioReviewStatus = AudioReviewStatus.APPROVED;
    await question.save();
    const persisted = await this.questions.findDocumentById(id);
    const persistenceResult =
      persisted?.audioReviewStatus === AudioReviewStatus.APPROVED;
    this.logger.log(
      JSON.stringify({
        event: 'media.lifecycle.review-approved',
        questionId: id,
        candidateId: question.audioRequest?.selectedCandidateId ?? null,
        mediaAssetId:
          question.audioAsset?.metadata?.mediaAssetId ??
          question.audioAsset?.url ??
          null,
        mediaType: question.audioAsset?.type ?? question.type,
        processingJobId: question.audioAsset?.metadata?.processingJobId ?? null,
        sourceUrl: question.audioAsset?.sourceUrl ?? null,
        outputStorageKey:
          question.audioAsset?.metadata?.storageKey ??
          question.audioAsset?.url ??
          null,
        previousProcessingStatus: question.audioStatus,
        nextProcessingStatus: question.audioStatus,
        previousReviewStatus,
        nextReviewStatus: AudioReviewStatus.APPROVED,
        persistenceResult,
      }),
    );
    if (!persisted || !persistenceResult)
      throw new InternalServerErrorException({
        code: 'MEDIA_REVIEW_PERSISTENCE_FAILED',
        message: 'Media review approval was not persisted.',
      });
    return persisted.populate('category');
  }

  async reject(id: string) {
    const question = await this.required(id);
    question.status = QuestionStatus.DRAFT;
    question.audioStatus = AudioAssetStatus.REJECTED;
    question.audioReviewStatus = AudioReviewStatus.REJECTED;
    return (await question.save()).populate('category');
  }

  async upload(id: string, file?: UploadedAudioFile) {
    if (!file)
      throw new BadRequestException({
        code: 'AUDIO_FILE_REQUIRED',
        message: 'An audio file is required.',
      });
    const question = await this.required(id);
    const isVideo = question.type === QuestionType.VIDEO;
    if (isVideo && file.mimetype !== 'video/mp4')
      throw new BadRequestException({
        code: 'VIDEO_FORMAT_UNSUPPORTED',
        message: 'Video must be an MP4 file.',
      });
    if (!isVideo && !file.mimetype.startsWith('audio/'))
      throw new BadRequestException({
        code: 'AUDIO_FORMAT_UNSUPPORTED',
        message: 'Audio must be mp3, m4a, wav, ogg, or webm.',
      });
    const mediaType = isVideo ? 'video' : 'audio';
    const previousPath = question.audioAsset?.localPath;
    const previousProcessingStatus = question.audioStatus;
    const previousReviewStatus = question.audioReviewStatus;
    question.audioStatus = AudioAssetStatus.PROCESSING;
    question.assetStatus = AssetStatus.PENDING;
    question.audioReviewStatus = AudioReviewStatus.PENDING;
    question.audioRequestStale = true;
    question.assetFailureReason = undefined;
    question.assetFailureStep = undefined;
    question.assetFailureDiagnostics = undefined;
    await question.save();
    this.logger.log(
      JSON.stringify({
        event: 'media.lifecycle.processing-started',
        questionId: id,
        candidateId: null,
        mediaAssetId: null,
        mediaType,
        processingJobId: null,
        sourceUrl: 'admin-upload',
        outputStorageKey: null,
        previousProcessingStatus,
        nextProcessingStatus: AudioAssetStatus.PROCESSING,
        previousReviewStatus,
        nextReviewStatus: AudioReviewStatus.PENDING,
        persistenceResult: true,
      }),
    );
    let original: StoredLocalAudio | undefined;
    let stored: StoredLocalAudio | undefined;
    try {
      original = await this.storage.saveQuestionMedia(file, mediaType);
      stored = await this.storage.allocateQuestionMediaClip(
        original.filename,
        mediaType,
      );
      const sourceDuration = isVideo
        ? await this.inspector.videoDurationSeconds(original.absolutePath)
        : await this.inspector.audioDurationSeconds(original.absolutePath);
      const minimumDuration = isVideo ? 5 : 3;
      const maximumDuration = isVideo ? 15 : 20;
      const start = Math.min(
        question.audioRequest?.preferredStartSeconds ?? 0,
        Math.max(0, sourceDuration - minimumDuration),
      );
      const duration = Math.min(
        question.audioRequest?.preferredDurationSeconds ?? 8,
        maximumDuration,
        sourceDuration - start,
      );
      if (duration < minimumDuration)
        throw new BadRequestException({
          code: isVideo ? 'VIDEO_DURATION_INVALID' : 'AUDIO_DURATION_INVALID',
          message: isVideo
            ? 'Uploaded video must contain at least five usable seconds.'
            : 'Uploaded audio must contain at least three usable seconds.',
        });
      if (isVideo)
        await this.audioProcessor.createMp4Snippet({
          inputPath: original.absolutePath,
          outputPath: stored.absolutePath,
          startSecond: start,
          durationSeconds: duration,
        });
      else
        await this.audioProcessor.createMp3Snippet({
          inputPath: original.absolutePath,
          outputPath: stored.absolutePath,
          startSecond: start,
          durationSeconds: duration,
        });
      await this.storage.publish(stored);
      const storedDuration = isVideo
        ? await this.inspector.videoDurationSeconds(stored.absolutePath)
        : await this.inspector.audioDurationSeconds(stored.absolutePath);
      const storedFile = await stat(stored.absolutePath);
      question.requiresAudio = true;
      question.status = QuestionStatus.DRAFT;
      question.audioAsset = {
        type: isVideo ? QuestionAssetType.VIDEO : QuestionAssetType.AUDIO,
        url: stored.url,
        source: 'admin-upload',
        provider: 'admin-upload',
        localPath: stored.absolutePath,
        duration: storedDuration,
        metadata: {
          mimetype: isVideo ? 'video/mp4' : 'audio/mpeg',
          size: storedFile.size,
          mediaAssetId: stored.filename,
          storageKey: stored.url.split('/uploads/')[1] ?? stored.url,
          sourceUrl: 'admin-upload',
          startSeconds: start,
          sourceDurationSeconds: sourceDuration,
        },
      };
      question.primaryAsset = question.audioAsset;
      question.mediaUrl = stored.url;
      question.audioStatus = AudioAssetStatus.READY;
      question.assetStatus = AssetStatus.READY;
      question.audioReviewStatus = AudioReviewStatus.PENDING;
      question.audioRequestStale = false;
      question.audioDiagnostics = { uploadedAt: new Date().toISOString() };
      await question.save();
      const persisted = await this.questions.findDocumentById(id);
      const persistenceResult = Boolean(
        persisted?.audioStatus === AudioAssetStatus.READY &&
        persisted.assetStatus === AssetStatus.READY &&
        persisted.audioAsset?.url === stored.url &&
        persisted.primaryAsset?.url === stored.url &&
        persisted.audioRequestStale === false,
      );
      this.logger.log(
        JSON.stringify({
          event: 'media.lifecycle.processing-ready',
          questionId: id,
          candidateId: null,
          mediaAssetId: stored.filename,
          mediaType,
          processingJobId: null,
          sourceUrl: 'admin-upload',
          outputStorageKey: stored.url.split('/uploads/')[1] ?? stored.url,
          previousProcessingStatus: AudioAssetStatus.PROCESSING,
          nextProcessingStatus: AudioAssetStatus.READY,
          previousReviewStatus: AudioReviewStatus.PENDING,
          nextReviewStatus: AudioReviewStatus.PENDING,
          persistenceResult,
        }),
      );
      if (!persisted || !persistenceResult)
        throw new Error('MEDIA_READY_PERSISTENCE_VERIFICATION_FAILED');
      await this.storage.delete(original);
      if (previousPath && previousPath !== stored.absolutePath)
        await this.storage.delete({ absolutePath: previousPath });
      return persisted.populate('category');
    } catch (error) {
      await this.storage.delete(original);
      await this.storage.delete(stored);
      const caughtError =
        error instanceof Error ? error.message.slice(0, 300) : String(error);
      question.status = QuestionStatus.DRAFT;
      question.audioStatus = AudioAssetStatus.FAILED;
      question.assetStatus = AssetStatus.FAILED;
      question.audioReviewStatus = AudioReviewStatus.PENDING;
      question.audioRequestStale = true;
      question.audioAsset = null;
      if (
        question.primaryAsset?.type === QuestionAssetType.AUDIO ||
        question.primaryAsset?.type === QuestionAssetType.VIDEO
      )
        question.primaryAsset = null;
      question.mediaUrl = undefined;
      question.assetFailureReason = caughtError;
      question.assetFailureStep = 'processing';
      question.audioDiagnostics = {
        code: isVideo
          ? 'VIDEO_UPLOAD_PROCESSING_FAILED'
          : 'AUDIO_UPLOAD_PROCESSING_FAILED',
        message: caughtError,
        failedAt: new Date().toISOString(),
      };
      await question.save();
      this.logger.warn(
        JSON.stringify({
          event: 'media.lifecycle.processing-failed',
          questionId: id,
          candidateId: null,
          mediaAssetId: null,
          mediaType,
          processingJobId: null,
          sourceUrl: 'admin-upload',
          outputStorageKey: stored?.url ?? null,
          previousProcessingStatus: AudioAssetStatus.PROCESSING,
          nextProcessingStatus: AudioAssetStatus.FAILED,
          previousReviewStatus: AudioReviewStatus.PENDING,
          nextReviewStatus: AudioReviewStatus.PENDING,
          persistenceResult: true,
          caughtError,
        }),
      );
      throw error;
    }
  }

  async removeAsset(id: string) {
    const question = await this.required(id);
    const previousPath = question.audioAsset?.localPath;
    question.status = QuestionStatus.DRAFT;
    question.audioAsset = null;
    if (
      question.primaryAsset?.type === QuestionAssetType.AUDIO ||
      question.primaryAsset?.type === QuestionAssetType.VIDEO
    )
      question.primaryAsset = null;
    question.mediaUrl = undefined;
    question.audioStatus = AudioAssetStatus.PENDING;
    question.assetStatus = AssetStatus.PENDING;
    question.audioReviewStatus = AudioReviewStatus.PENDING;
    question.audioRequestStale = false;
    question.audioDiagnostics = {
      code: 'MEDIA_ASSET_REMOVED',
      removedAt: new Date().toISOString(),
    };
    const saved = await question.save();
    if (previousPath) await this.storage.delete({ absolutePath: previousPath });
    return saved.populate('category');
  }

  private async required(id: string) {
    const question = await this.questions.findDocumentById(id);
    if (!question)
      throw new NotFoundException(`Question with ID "${id}" not found`);
    return question;
  }
}
