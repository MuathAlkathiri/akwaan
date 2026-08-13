import {
  AssetStatus,
  AudioAssetStatus,
  QuestionAssetType,
  QuestionType,
} from '../schemas/question.schema';
import { processingApprovalIssue } from './question-media-lifecycle.policy';

describe('question media lifecycle policy', () => {
  const state = (type: QuestionType.AUDIO | QuestionType.VIDEO) => {
    const assetType =
      type === QuestionType.VIDEO
        ? QuestionAssetType.VIDEO
        : QuestionAssetType.AUDIO;
    const asset = {
      type: assetType,
      url: `/uploads/question-assets/${assetType}/ready.mp4`,
      source: 'youtube',
    };
    return {
      type,
      audioStatus: AudioAssetStatus.READY,
      assetStatus: AssetStatus.READY,
      audioRequestStale: false,
      audioAsset: asset,
      primaryAsset: asset,
    };
  };

  it.each<QuestionType.AUDIO | QuestionType.VIDEO>([
    QuestionType.AUDIO,
    QuestionType.VIDEO,
  ])('uses the same canonical lifecycle rules for %s', (type) => {
    expect(processingApprovalIssue(state(type))).toBeUndefined();
  });

  it('returns an explicit not-ready code for media approval', () => {
    expect(
      processingApprovalIssue({
        ...state(QuestionType.AUDIO),
        audioStatus: AudioAssetStatus.PENDING,
      }),
    ).toMatchObject({ code: 'AUDIO_NOT_READY' });
  });

  it('rejects a stale or non-canonical asset even when its URL is playable', () => {
    expect(
      processingApprovalIssue({
        ...state(QuestionType.AUDIO),
        primaryAsset: {
          type: QuestionAssetType.AUDIO,
          url: '/uploads/question-assets/audio/old.mp4',
          source: 'youtube',
        },
      }),
    ).toMatchObject({ code: 'AUDIO_ASSET_REQUIRED' });
    expect(
      processingApprovalIssue({
        ...state(QuestionType.AUDIO),
        audioRequestStale: true,
      }),
    ).toMatchObject({ code: 'AUDIO_ASSET_STALE' });
  });
});
