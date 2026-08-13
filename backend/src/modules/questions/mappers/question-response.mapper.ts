import { createHash } from 'crypto';
import { QuestionResponseDto } from '../dto/question-response.dto';
import {
  AudioAssetStatus,
  QuestionGameplayType,
} from '../schemas/question.schema';
import { resolveQuestionMediaAvailability } from '../application/question-media-availability.policy';

export class QuestionResponseMapper {
  static toResponse(value: unknown): QuestionResponseDto {
    const availabilitySource =
      value && typeof value === 'object' && '_doc' in value
        ? ((value as { _doc?: Record<string, unknown> })._doc ?? {})
        : ((value ?? {}) as Record<string, unknown>);
    const availability = resolveQuestionMediaAvailability(availabilitySource);
    const source = this.toPlainObject(value);
    const {
      __v: _version,
      verificationDiagnostics: _verificationDiagnostics,
      aiMetadata: _aiMetadata,
      verificationProvider: _verificationProvider,
      verificationStatus: _verificationStatus,
      verificationCacheHit: _verificationCacheHit,
      evidenceSourceCount: _evidenceSourceCount,
      sourceDomains: _sourceDomains,
      confidence: _confidence,
      ...safe
    } = source;
    void _version;
    void _verificationDiagnostics;
    void _aiMetadata;
    void _verificationProvider;
    void _verificationStatus;
    void _verificationCacheHit;
    void _evidenceSourceCount;
    void _sourceDomains;
    void _confidence;
    const primaryAsset = this.safeAsset(safe.primaryAsset);
    const audioAsset = this.safeAsset(safe.audioAsset ?? safe.primaryAsset);
    const coverImage = this.safeAsset(safe.coverImage);
    const category = this.safeRelatedDocument(safe.category);
    const audioRequest = this.safeAudioRequest(safe.audioRequest, safe);
    return {
      ...safe,
      ...(safe.category !== undefined ? { category } : {}),
      ...(safe.primaryAsset !== undefined ? { primaryAsset } : {}),
      ...(audioAsset !== undefined ? { audioAsset } : {}),
      requiresAudio:
        safe.requiresAudio ??
        (safe.type === 'audio' ||
          safe.type === 'video' ||
          ['audio', 'video'].includes(
            String(this.assetType(safe.primaryAsset)),
          )),
      audioStatus:
        safe.audioStatus ?? this.fromLegacyAssetStatus(safe.assetStatus),
      ...(audioRequest !== undefined ? { audioRequest } : {}),
      ...(Array.isArray(safe.audioCandidates)
        ? { audioCandidates: safe.audioCandidates.slice(0, 5) }
        : {}),
      ...(safe.coverImage !== undefined ? { coverImage } : {}),
      _id: String(safe._id ?? ''),
      question: String(safe.question ?? ''),
      questionType:
        (safe.questionType as QuestionGameplayType | undefined) ??
        QuestionGameplayType.STANDARD,
      preferredPresentationType: availability.preferredPresentationType,
      effectivePresentationType: availability.effectivePresentationType,
      mediaAvailable: availability.mediaAvailable,
      mediaFallbackReason: availability.mediaFallbackReason,
      resolvedMedia: availability.resolvedMedia,
      wrongAnswers: Array.isArray(safe.wrongAnswers) ? safe.wrongAnswers : [],
      status: String(safe.status ?? ''),
      source: String(safe.source ?? ''),
    } as QuestionResponseDto;
  }

  private static fromLegacyAssetStatus(value: unknown): AudioAssetStatus {
    switch (value) {
      case 'PENDING':
        return AudioAssetStatus.PENDING;
      case 'READY':
        return AudioAssetStatus.READY;
      case 'FAILED':
        return AudioAssetStatus.FAILED;
      default:
        return AudioAssetStatus.NOT_REQUIRED;
    }
  }

  private static assetType(value: unknown): unknown {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>).type
      : undefined;
  }

  private static safeAudioRequest(
    value: unknown,
    question: Record<string, unknown>,
  ): Record<string, unknown> | null | undefined {
    if (value === null) return null;
    if (!value || typeof value !== 'object') return undefined;
    const request = { ...(value as Record<string, unknown>) };
    const normalized = [
      String(request.kind ?? ''),
      this.normalizedText(request.searchQuery),
      this.normalizedText(request.targetName),
      this.normalizedText(request.sourceTitle),
      this.normalizedText(request.language).toLowerCase(),
      request.preferredDurationSeconds ?? null,
      request.preferredStartSeconds ?? null,
      this.normalizedText(request.provider).toLowerCase(),
    ];
    return {
      ...request,
      requestVersion: Math.max(1, Number(request.requestVersion) || 1),
      requestHash:
        request.requestHash ||
        createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
      requestedAt:
        request.requestedAt ??
        question.createdAt ??
        question.updatedAt ??
        new Date(0).toISOString(),
      selectedCandidateId: request.selectedCandidateId ?? null,
      candidateSetVersion: request.candidateSetVersion ?? null,
    };
  }

  private static normalizedText(value: unknown): string {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  static toResponseList(values: unknown[]): QuestionResponseDto[] {
    return values.map((value) => this.toResponse(value));
  }

  private static safeAsset(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value;
    const { localPath: _localPath, ...safe } = value as Record<string, unknown>;
    void _localPath;
    return safe;
  }

  private static safeRelatedDocument(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value;
    const source = this.toPlainObject(value);
    const { __v: _version, ...safe } = source;
    void _version;
    return safe;
  }

  private static toPlainObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && 'toObject' in value) {
      const document = value as { toObject(): Record<string, unknown> };
      return document.toObject();
    }
    return (value ?? {}) as Record<string, unknown>;
  }
}
