import { Injectable, Logger } from '@nestjs/common';
import { stat } from 'fs/promises';
import { MediaInspectorService } from '../../../infrastructure/media/media-inspector.service';
import { QuestionRepository } from '../persistence/question.repository';
import {
  AssetStatus,
  AudioAssetStatus,
  AudioReviewStatus,
  QuestionAssetType,
} from '../schemas/question.schema';
import {
  AUDIO_CLIP_DEFAULTS,
  createMediaClipFingerprint,
} from './question-audio-processing.service';
import { expectedMediaAssetType } from './question-media-lifecycle.policy';

export type MediaRepairResult = {
  questionId: string;
  outcome: 'REPAIRED' | 'REPAIRABLE' | 'SKIPPED';
  reason?: string;
  mediaType?: QuestionAssetType;
};

@Injectable()
export class QuestionMediaRepairService {
  private readonly logger = new Logger(QuestionMediaRepairService.name);

  constructor(
    private readonly questions: QuestionRepository,
    private readonly inspector: MediaInspectorService,
  ) {}

  async repairPendingValidAssets(options?: {
    apply?: boolean;
    questionId?: string;
  }): Promise<MediaRepairResult[]> {
    const apply = options?.apply === true;
    const questions = await this.questions.findPendingMediaAssets(
      options?.questionId,
    );
    const results: MediaRepairResult[] = [];
    for (const question of questions) {
      const questionId = String(question._id);
      const asset = question.audioAsset;
      const mediaType = expectedMediaAssetType(question);
      const skip = (reason: string): MediaRepairResult => ({
        questionId,
        outcome: 'SKIPPED',
        reason,
        mediaType,
      });
      if (
        !asset ||
        asset.type !== mediaType ||
        question.primaryAsset?.url !== asset.url
      ) {
        results.push(skip('CANONICAL_ASSET_MISMATCH'));
        continue;
      }
      if (!asset.url || !asset.localPath || !asset.source) {
        results.push(skip('REQUIRED_ASSET_METADATA_MISSING'));
        continue;
      }
      try {
        const file = await stat(asset.localPath);
        if (!file.isFile() || file.size <= 0) {
          results.push(skip('STORED_FILE_INVALID'));
          continue;
        }
        const duration =
          mediaType === QuestionAssetType.VIDEO
            ? await this.inspector.videoDurationSeconds(asset.localPath)
            : await this.inspector.audioDurationSeconds(asset.localPath);
        const minimum = mediaType === QuestionAssetType.VIDEO ? 5 : 3;
        if (!Number.isFinite(duration) || duration < minimum) {
          results.push(skip('STORED_MEDIA_DURATION_INVALID'));
          continue;
        }
        const request = question.audioRequest;
        if (!request) {
          results.push(skip('ACTIVE_REQUEST_MISSING'));
          continue;
        }
        const requestedDuration =
          request.preferredDurationSeconds ?? AUDIO_CLIP_DEFAULTS[request.kind];
        if (
          asset.duration === undefined ||
          Math.abs(asset.duration - requestedDuration) > 0.25
        ) {
          results.push(skip('DURATION_IDENTITY_MISMATCH'));
          continue;
        }
        const sourceUrl =
          asset.sourceUrl ??
          (typeof asset.metadata?.sourceUrl === 'string'
            ? asset.metadata.sourceUrl
            : undefined);
        const fingerprint =
          typeof asset.metadata?.mediaFingerprint === 'string'
            ? asset.metadata.mediaFingerprint
            : undefined;
        const requestHash =
          typeof asset.metadata?.requestHash === 'string'
            ? asset.metadata.requestHash
            : undefined;
        const fingerprintMatches = Boolean(
          fingerprint &&
          sourceUrl &&
          fingerprint ===
            createMediaClipFingerprint({
              sourceUrl,
              startTimeSeconds: request.preferredStartSeconds,
              durationSeconds: requestedDuration,
            }),
        );
        const requestHashMatches = Boolean(
          requestHash &&
          request.requestHash &&
          requestHash === request.requestHash,
        );
        if (!fingerprintMatches && !requestHashMatches) {
          results.push(skip('MEDIA_REQUEST_IDENTITY_UNVERIFIED'));
          continue;
        }

        if (apply) {
          const previousProcessingStatus = question.audioStatus;
          const previousReviewStatus = question.audioReviewStatus;
          question.audioAsset = {
            ...asset,
            duration,
            metadata: {
              ...asset.metadata,
              mimetype:
                asset.metadata?.mimetype ??
                (mediaType === QuestionAssetType.VIDEO
                  ? 'video/mp4'
                  : 'audio/mp4'),
              size: file.size,
              storageKey:
                asset.metadata?.storageKey ??
                asset.url.split('/uploads/')[1] ??
                asset.url,
              repairedAt: new Date().toISOString(),
            },
          };
          question.primaryAsset = question.audioAsset;
          question.mediaUrl = asset.url;
          question.audioStatus = AudioAssetStatus.READY;
          question.assetStatus = AssetStatus.READY;
          question.audioReviewStatus = AudioReviewStatus.PENDING;
          question.audioRequestStale = false;
          question.audioDiagnostics = {
            code: 'MEDIA_PENDING_ASSET_RECONCILED',
            repairedAt: new Date().toISOString(),
          };
          await question.save();
          const persisted = await this.questions.findDocumentById(questionId);
          const persistenceResult =
            persisted?.audioStatus === AudioAssetStatus.READY &&
            persisted.assetStatus === AssetStatus.READY &&
            persisted.audioAsset?.url === asset.url &&
            persisted.audioRequestStale === false;
          this.logger.log(
            JSON.stringify({
              event: 'media.lifecycle.repaired',
              questionId,
              candidateId: request.selectedCandidateId ?? null,
              mediaAssetId: asset.metadata?.mediaAssetId ?? fingerprint ?? null,
              mediaType,
              processingJobId: asset.metadata?.processingJobId ?? null,
              sourceUrl: sourceUrl ?? null,
              outputStorageKey:
                asset.metadata?.storageKey ??
                asset.url.split('/uploads/')[1] ??
                asset.url,
              previousProcessingStatus,
              nextProcessingStatus: AudioAssetStatus.READY,
              previousReviewStatus,
              nextReviewStatus: AudioReviewStatus.PENDING,
              persistenceResult,
            }),
          );
          if (!persistenceResult) {
            results.push(skip('REPAIR_PERSISTENCE_FAILED'));
            continue;
          }
        }
        results.push({
          questionId,
          outcome: apply ? 'REPAIRED' : 'REPAIRABLE',
          mediaType,
        });
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'media.lifecycle.repair-skipped',
            questionId,
            mediaType,
            caughtError:
              error instanceof Error
                ? error.message.slice(0, 300)
                : String(error),
          }),
        );
        results.push(skip('STORED_MEDIA_VERIFICATION_FAILED'));
      }
    }
    return results.slice(0, 250);
  }
}
