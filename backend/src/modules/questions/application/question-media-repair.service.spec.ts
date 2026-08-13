import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  AssetStatus,
  AudioAssetStatus,
  AudioQuestionKind,
  AudioReviewStatus,
  QuestionAssetType,
  QuestionType,
} from '../schemas/question.schema';
import { createMediaClipFingerprint } from './question-audio-processing.service';
import { QuestionMediaRepairService } from './question-media-repair.service';

describe('QuestionMediaRepairService', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'akwaan-media-repair-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it.each([
    [QuestionType.AUDIO, QuestionAssetType.AUDIO],
    [QuestionType.VIDEO, QuestionAssetType.VIDEO],
  ])(
    'reconciles a pending but verified %s asset and verifies a fresh read',
    async (type, assetType) => {
      const localPath = join(directory, 'clip.mp4');
      await writeFile(localPath, Buffer.from('verified media'));
      const sourceUrl = 'https://youtube.com/watch?v=verified';
      const request = {
        kind: AudioQuestionKind.CUSTOM,
        searchQuery: 'verified media',
        preferredStartSeconds: 74,
        preferredDurationSeconds: 10,
        requestHash: 'request-hash',
        selectedCandidateId: 'candidate-1',
      };
      const asset = {
        type: assetType,
        url: `/uploads/question-assets/${assetType}/clip.mp4`,
        localPath,
        source: 'youtube',
        sourceUrl,
        duration: 10,
        metadata: {
          mediaFingerprint: createMediaClipFingerprint({
            sourceUrl,
            startTimeSeconds: 74,
            durationSeconds: 10,
          }),
        },
      };
      const question = {
        _id: '507f1f77bcf86cd799439012',
        type,
        requiresAudio: true,
        audioStatus: AudioAssetStatus.PENDING,
        assetStatus: AssetStatus.PENDING,
        audioReviewStatus: AudioReviewStatus.PENDING,
        audioRequestStale: true,
        audioRequest: request,
        audioAsset: asset,
        primaryAsset: asset,
        save: jest.fn(),
      };
      question.save.mockResolvedValue(question as never);
      const repository = {
        findPendingMediaAssets: jest.fn().mockResolvedValue([question]),
        findDocumentById: jest.fn().mockImplementation(async () => question),
      };
      const inspector = {
        audioDurationSeconds: jest.fn().mockResolvedValue(10),
        videoDurationSeconds: jest.fn().mockResolvedValue(10),
      };
      const service = new QuestionMediaRepairService(
        repository as never,
        inspector as never,
      );

      await expect(
        service.repairPendingValidAssets({ apply: true }),
      ).resolves.toEqual([
        {
          questionId: '507f1f77bcf86cd799439012',
          outcome: 'REPAIRED',
          mediaType: assetType,
        },
      ]);
      expect(question).toMatchObject({
        audioStatus: AudioAssetStatus.READY,
        assetStatus: AssetStatus.READY,
        audioReviewStatus: AudioReviewStatus.PENDING,
        audioRequestStale: false,
        audioAsset: {
          metadata: expect.objectContaining({
            size: expect.any(Number),
            storageKey: expect.any(String),
          }),
        },
      });
      expect(repository.findDocumentById).toHaveBeenCalled();
    },
  );

  it('does not blindly repair a pending file without request identity proof', async () => {
    const localPath = join(directory, 'ambiguous.mp4');
    await writeFile(localPath, Buffer.from('playable but ambiguous'));
    const asset = {
      type: QuestionAssetType.AUDIO,
      url: '/uploads/question-assets/audio/ambiguous.mp4',
      localPath,
      source: 'youtube',
      duration: 10,
      metadata: {},
    };
    const question = {
      _id: '507f1f77bcf86cd799439012',
      type: QuestionType.AUDIO,
      audioStatus: AudioAssetStatus.PENDING,
      audioRequest: {
        kind: AudioQuestionKind.CUSTOM,
        searchQuery: 'ambiguous media',
        preferredDurationSeconds: 10,
      },
      audioAsset: asset,
      primaryAsset: asset,
      save: jest.fn(),
    };
    const repository = {
      findPendingMediaAssets: jest.fn().mockResolvedValue([question]),
      findDocumentById: jest.fn(),
    };
    const inspector = {
      audioDurationSeconds: jest.fn().mockResolvedValue(10),
    };
    const service = new QuestionMediaRepairService(
      repository as never,
      inspector as never,
    );

    await expect(
      service.repairPendingValidAssets({ apply: true }),
    ).resolves.toEqual([
      expect.objectContaining({
        outcome: 'SKIPPED',
        reason: 'MEDIA_REQUEST_IDENTITY_UNVERIFIED',
      }),
    ]);
    expect(question.save).not.toHaveBeenCalled();
  });
});
