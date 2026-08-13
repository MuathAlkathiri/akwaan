import { Injectable } from '@nestjs/common';
import {
  AssetStatus,
  AudioAssetStatus,
  AudioReviewStatus,
  QuestionAssetType,
  QuestionType,
} from '../schemas/question.schema';

export type EffectivePresentationType = 'text' | 'image' | 'audio' | 'video';
export type MediaFallbackReason =
  | 'NO_MEDIA'
  | 'NOT_READY'
  | 'PROCESSING'
  | 'FAILED'
  | 'REJECTED'
  | 'STALE'
  | 'MISSING_ASSET'
  | 'INVALID_ASSET';

export type ResolvedQuestionMedia = {
  type: Exclude<EffectivePresentationType, 'text'>;
  url: string;
  duration?: number;
};

export type QuestionMediaAvailability = {
  preferredPresentationType: QuestionType;
  effectivePresentationType: EffectivePresentationType;
  usableMediaType: Exclude<EffectivePresentationType, 'text'> | null;
  mediaUrl: string | null;
  mediaAvailable: boolean;
  isMediaUsable: boolean;
  mediaFallbackReason: MediaFallbackReason | null;
  resolvedMedia: ResolvedQuestionMedia | null;
};

export type MediaAvailabilityInput = {
  type?: QuestionType | string | null;
  primaryAsset?: {
    type?: QuestionAssetType | string;
    url?: string;
    duration?: number;
  } | null;
  audioAsset?: {
    type?: QuestionAssetType | string;
    url?: string;
    duration?: number;
  } | null;
  assetStatus?: AssetStatus | string | null;
  audioStatus?: AudioAssetStatus | string | null;
  audioReviewStatus?: AudioReviewStatus | string | null;
  audioRequestStale?: boolean;
};

const preferredType = (value: MediaAvailabilityInput['type']): QuestionType =>
  Object.values(QuestionType).includes(value as QuestionType)
    ? (value as QuestionType)
    : QuestionType.TEXT;

const fallback = (
  preferredPresentationType: QuestionType,
  reason: MediaFallbackReason,
): QuestionMediaAvailability => ({
  preferredPresentationType,
  effectivePresentationType: 'text',
  usableMediaType: null,
  mediaUrl: null,
  mediaAvailable: false,
  isMediaUsable: false,
  mediaFallbackReason: reason,
  resolvedMedia: null,
});

const ready = (
  preferredPresentationType: QuestionType,
  type: 'image' | 'audio' | 'video',
  asset: NonNullable<MediaAvailabilityInput['primaryAsset']>,
): QuestionMediaAvailability => {
  const resolvedMedia: ResolvedQuestionMedia = {
    type,
    url: asset.url!.trim(),
    ...(Number.isFinite(asset.duration) && Number(asset.duration) > 0
      ? { duration: Number(asset.duration) }
      : {}),
  };
  return {
    preferredPresentationType,
    effectivePresentationType: type,
    usableMediaType: type,
    mediaUrl: resolvedMedia.url,
    mediaAvailable: true,
    isMediaUsable: true,
    mediaFallbackReason: null,
    resolvedMedia,
  };
};

/**
 * Resolves optional supporting media without mutating the question.
 * A failed resolution always produces a safe text presentation.
 */
export function resolveQuestionMediaAvailability(
  question: MediaAvailabilityInput,
): QuestionMediaAvailability {
  const preferredPresentationType = preferredType(question.type);
  const attachedType = question.primaryAsset?.type;
  const requestedType =
    preferredPresentationType === QuestionType.TEXT &&
    [
      QuestionAssetType.IMAGE,
      QuestionAssetType.AUDIO,
      QuestionAssetType.VIDEO,
    ].includes(attachedType as QuestionAssetType)
      ? (attachedType as QuestionAssetType)
      : preferredPresentationType;

  if (
    requestedType !== QuestionType.IMAGE &&
    requestedType !== QuestionType.AUDIO &&
    requestedType !== QuestionType.VIDEO
  )
    return fallback(preferredPresentationType, 'NO_MEDIA');

  if (question.audioRequestStale)
    return fallback(preferredPresentationType, 'STALE');

  if (requestedType === QuestionType.IMAGE) {
    const asset = question.primaryAsset;
    if (!asset) return fallback(preferredPresentationType, 'MISSING_ASSET');
    if (
      asset.type !== QuestionAssetType.IMAGE ||
      typeof asset.url !== 'string' ||
      !asset.url.trim()
    )
      return fallback(preferredPresentationType, 'INVALID_ASSET');
    if (question.assetStatus === AssetStatus.FAILED)
      return fallback(preferredPresentationType, 'FAILED');
    if (question.assetStatus === AssetStatus.PENDING)
      return fallback(preferredPresentationType, 'PROCESSING');
    if (question.assetStatus !== AssetStatus.READY)
      return fallback(preferredPresentationType, 'NOT_READY');
    return ready(preferredPresentationType, 'image', asset);
  }

  const expectedType =
    requestedType === QuestionType.VIDEO
      ? QuestionAssetType.VIDEO
      : QuestionAssetType.AUDIO;
  const asset = question.audioAsset;
  if (!asset) return fallback(preferredPresentationType, 'MISSING_ASSET');
  if (
    asset.type !== expectedType ||
    question.primaryAsset?.type !== expectedType ||
    question.primaryAsset?.url !== asset.url ||
    typeof asset.url !== 'string' ||
    !asset.url.trim()
  )
    return fallback(preferredPresentationType, 'INVALID_ASSET');
  if (question.audioStatus === AudioAssetStatus.FAILED)
    return fallback(preferredPresentationType, 'FAILED');
  if (
    question.audioStatus === AudioAssetStatus.REJECTED ||
    question.audioReviewStatus === AudioReviewStatus.REJECTED
  )
    return fallback(preferredPresentationType, 'REJECTED');
  if (
    question.audioStatus === AudioAssetStatus.PENDING ||
    question.audioStatus === AudioAssetStatus.SEARCHING ||
    question.audioStatus === AudioAssetStatus.PROCESSING
  )
    return fallback(preferredPresentationType, 'PROCESSING');
  if (
    question.audioStatus !== AudioAssetStatus.READY ||
    question.assetStatus !== AssetStatus.READY ||
    question.audioReviewStatus !== AudioReviewStatus.APPROVED
  )
    return fallback(preferredPresentationType, 'NOT_READY');
  return ready(
    preferredPresentationType,
    requestedType === QuestionType.VIDEO ? 'video' : 'audio',
    asset,
  );
}

@Injectable()
export class QuestionMediaAvailabilityPolicy {
  resolve(question: MediaAvailabilityInput): QuestionMediaAvailability {
    return resolveQuestionMediaAvailability(question);
  }
}
