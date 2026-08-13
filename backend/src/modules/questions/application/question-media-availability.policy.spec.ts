import {
  AssetStatus,
  AudioAssetStatus,
  AudioReviewStatus,
  QuestionAssetType,
  QuestionType,
} from '../schemas/question.schema';
import { resolveQuestionMediaAvailability } from './question-media-availability.policy';

describe('resolveQuestionMediaAvailability', () => {
  it.each([
    [undefined, 'MISSING_ASSET'],
    [{ type: QuestionAssetType.IMAGE, url: '/image.jpg' }, 'NOT_READY'],
  ])('falls an unavailable image back to text', (primaryAsset, reason) => {
    expect(
      resolveQuestionMediaAvailability({
        type: QuestionType.IMAGE,
        primaryAsset,
        assetStatus: AssetStatus.NOT_REQUIRED,
      }),
    ).toMatchObject({
      effectivePresentationType: 'text',
      mediaAvailable: false,
      mediaFallbackReason: reason,
    });
  });

  it('uses a ready image', () => {
    expect(
      resolveQuestionMediaAvailability({
        type: QuestionType.IMAGE,
        primaryAsset: {
          type: QuestionAssetType.IMAGE,
          url: '/image.jpg',
        },
        assetStatus: AssetStatus.READY,
      }),
    ).toMatchObject({
      effectivePresentationType: 'image',
      mediaUrl: '/image.jpg',
      mediaFallbackReason: null,
    });
  });

  it.each([
    [AudioAssetStatus.PENDING, AudioReviewStatus.PENDING, 'PROCESSING'],
    [AudioAssetStatus.FAILED, AudioReviewStatus.PENDING, 'FAILED'],
    [AudioAssetStatus.READY, AudioReviewStatus.PENDING, 'NOT_READY'],
  ])(
    'falls unavailable audio back to text',
    (audioStatus, audioReviewStatus, reason) => {
      const asset = {
        type: QuestionAssetType.AUDIO,
        url: '/audio.m4a',
      };
      expect(
        resolveQuestionMediaAvailability({
          type: QuestionType.AUDIO,
          primaryAsset: asset,
          audioAsset: asset,
          assetStatus: AssetStatus.READY,
          audioStatus,
          audioReviewStatus,
        }),
      ).toMatchObject({
        effectivePresentationType: 'text',
        mediaFallbackReason: reason,
      });
    },
  );

  it.each([
    [QuestionType.AUDIO, QuestionAssetType.AUDIO, 'audio'],
    [QuestionType.VIDEO, QuestionAssetType.VIDEO, 'video'],
  ])('uses ready reviewed %s', (type, assetType, effective) => {
    const asset = { type: assetType, url: `/${effective}` };
    expect(
      resolveQuestionMediaAvailability({
        type,
        primaryAsset: asset,
        audioAsset: asset,
        assetStatus: AssetStatus.READY,
        audioStatus: AudioAssetStatus.READY,
        audioReviewStatus: AudioReviewStatus.APPROVED,
      }),
    ).toMatchObject({
      effectivePresentationType: effective,
      mediaAvailable: true,
    });
  });

  it('classifies stale media as text', () => {
    expect(
      resolveQuestionMediaAvailability({
        type: QuestionType.VIDEO,
        audioRequestStale: true,
      }),
    ).toMatchObject({
      effectivePresentationType: 'text',
      mediaFallbackReason: 'STALE',
    });
  });

  it('uses an explicitly attached ready image for a text preference', () => {
    expect(
      resolveQuestionMediaAvailability({
        type: QuestionType.TEXT,
        primaryAsset: {
          type: QuestionAssetType.IMAGE,
          url: '/supporting.jpg',
        },
        assetStatus: AssetStatus.READY,
      }),
    ).toMatchObject({
      preferredPresentationType: 'text',
      effectivePresentationType: 'image',
    });
  });
});
