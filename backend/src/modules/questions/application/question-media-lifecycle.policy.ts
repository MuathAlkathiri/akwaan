import {
  AssetStatus,
  AudioAssetStatus,
  QuestionAssetType,
  QuestionPrimaryAsset,
  QuestionType,
} from '../schemas/question.schema';

export type MediaLifecycleState = {
  type?: QuestionType;
  audioStatus?: AudioAssetStatus;
  assetStatus?: AssetStatus;
  audioRequestStale?: boolean;
  audioAsset?: QuestionPrimaryAsset | null;
  primaryAsset?: QuestionPrimaryAsset | null;
};

export type MediaLifecycleIssue = {
  code: string;
  message: string;
};

export function expectedMediaAssetType(
  state: MediaLifecycleState,
): QuestionAssetType.AUDIO | QuestionAssetType.VIDEO {
  return state.type === QuestionType.VIDEO
    ? QuestionAssetType.VIDEO
    : QuestionAssetType.AUDIO;
}

export function processingApprovalIssue(
  state: MediaLifecycleState,
): MediaLifecycleIssue | undefined {
  const mediaType = expectedMediaAssetType(state);
  const label = mediaType === QuestionAssetType.VIDEO ? 'VIDEO' : 'AUDIO';
  const asset = state.audioAsset;
  if (
    !asset ||
    asset.type !== mediaType ||
    state.primaryAsset?.url !== asset.url
  )
    return {
      code: `${label}_ASSET_REQUIRED`,
      message: `A canonical current ${mediaType} asset is required.`,
    };
  if (
    state.audioStatus !== AudioAssetStatus.READY ||
    state.assetStatus !== AssetStatus.READY
  )
    return {
      code: `${label}_NOT_READY`,
      message: `The current ${mediaType} asset has not completed processing.`,
    };
  if (state.audioRequestStale)
    return {
      code: `${label}_ASSET_STALE`,
      message: `The current ${mediaType} asset does not match the active request.`,
    };
  return undefined;
}
