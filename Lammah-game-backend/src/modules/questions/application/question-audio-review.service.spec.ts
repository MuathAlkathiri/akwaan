import { QuestionAudioReviewService } from './question-audio-review.service';
import { AudioRequestIdentityService } from './audio-request-identity.service';
import {
  AssetStatus,
  AudioAssetStatus,
  AudioCandidateStatus,
  AudioQuestionKind,
  AudioReviewStatus,
  QuestionAssetType,
  QuestionPrimaryAsset,
  QuestionType,
} from '../schemas/question.schema';
import { AudioRetryMode } from './question-audio-job.types';
import { stat } from 'fs/promises';

jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  stat: jest.fn(),
}));

const mockedStat = jest.mocked(stat);

describe('QuestionAudioReviewService retry identity', () => {
  const populate = jest.fn();
  const save = jest.fn();
  const question = {
    requiresAudio: true,
    audioRequest: {
      kind: AudioQuestionKind.IDENTIFY_CHARACTER,
      searchQuery: 'Naruto voice',
      preferredStartSeconds: undefined as number | null | undefined,
      preferredDurationSeconds: undefined as number | undefined,
      requestVersion: 1,
      requestHash: 'old-hash',
      requestedAt: '2026-01-01T00:00:00.000Z',
      selectedCandidateId: 'old-candidate',
      candidateSetVersion: 1,
    },
    audioCandidates: [
      {
        id: 'old-candidate',
        title: 'Old',
        provider: 'youtube',
        queryUsed: 'old',
        rank: 1,
        status: AudioCandidateStatus.SELECTED,
        requestVersion: 1,
        requestHash: 'old-hash',
      },
    ],
    audioAsset: { provider: 'youtube', duration: 8, metadata: {} },
    audioDiagnostics: { failedAfterCandidateSelection: true },
    audioRequestStale: false,
    populate,
    save,
  };
  const repository = { findDocumentById: jest.fn() };
  const jobs = { enqueue: jest.fn().mockReturnValue(true) };
  const service = new QuestionAudioReviewService(
    repository as never,
    jobs as never,
    {} as never,
    {} as never,
    {} as never,
    new AudioRequestIdentityService(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findDocumentById.mockResolvedValue(question);
    save.mockResolvedValue(question);
    populate.mockResolvedValue(question);
    question.audioRequest = {
      kind: AudioQuestionKind.IDENTIFY_CHARACTER,
      searchQuery: 'Naruto voice',
      preferredStartSeconds: undefined,
      preferredDurationSeconds: undefined,
      requestVersion: 1,
      requestHash: 'old-hash',
      requestedAt: '2026-01-01T00:00:00.000Z',
      selectedCandidateId: 'old-candidate',
      candidateSetVersion: 1,
    };
    question.audioCandidates = [
      {
        id: 'old-candidate',
        title: 'Old',
        provider: 'youtube',
        queryUsed: 'old',
        rank: 1,
        status: AudioCandidateStatus.SELECTED,
        requestVersion: 1,
        requestHash: 'old-hash',
      },
    ];
    question.audioDiagnostics = { failedAfterCandidateSelection: true };
    question.audioRequestStale = false;
  });

  it('increments identity, clears candidates, and researches after an edit', async () => {
    await service.updateRequest('question-1', {
      kind: AudioQuestionKind.IDENTIFY_CHARACTER,
      searchQuery: 'Naruto Uzumaki Japanese clean dialogue',
      targetName: 'Naruto Uzumaki',
      sourceTitle: 'Naruto',
    });
    expect(question.audioRequest.requestVersion).toBe(2);
    expect(question.audioRequest.requestHash).not.toBe('old-hash');
    expect(question.audioRequest.selectedCandidateId).toBeNull();
    expect(question.audioCandidates).toEqual([]);
    expect(jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ mode: AudioRetryMode.RESEARCH }),
    );
  });

  it('defaults to processing-only retry after a selected-candidate failure', async () => {
    await service.retry('question-1');
    expect(jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: AudioRetryMode.RETRY_PROCESSING,
        candidateId: 'old-candidate',
      }),
    );
  });

  it('defaults to research when the selected candidate belongs to an old request', async () => {
    question.audioRequest.requestVersion = 2;
    question.audioRequest.requestHash = 'new-hash';
    await service.retry('question-1');
    expect(question.audioRequest.selectedCandidateId).toBeNull();
    expect(question.audioCandidates).toEqual([]);
    expect(jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ mode: AudioRetryMode.RESEARCH }),
    );
  });

  it('allows explicit processing retry whenever the selected candidate is current', async () => {
    question.audioDiagnostics = { failedAfterCandidateSelection: false };
    question.audioRequestStale = true;
    await service.retry('question-1', AudioRetryMode.RETRY_PROCESSING);
    expect(jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: AudioRetryMode.RETRY_PROCESSING,
        candidateId: 'old-candidate',
      }),
    );
  });

  it('selects and enqueues only a candidate from the current request', async () => {
    await service.selectCandidate('question-1', 'old-candidate');
    expect(jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'old-candidate',
        mode: AudioRetryMode.RETRY_PROCESSING,
      }),
    );
  });

  it('previews the selected source with exact submitted seconds', async () => {
    await service.previewClip('question-1', {
      startTimeSeconds: 74,
      durationSeconds: 10,
    });
    expect(question.audioRequest).toMatchObject({
      preferredStartSeconds: 74,
      preferredDurationSeconds: 10,
      selectedCandidateId: 'old-candidate',
      requestVersion: 2,
    });
    expect(question.audioRequest.requestHash).not.toBe('old-hash');
    expect(jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: AudioRetryMode.RETRY_PROCESSING,
        candidateId: 'old-candidate',
        requestVersion: 2,
        requestHash: question.audioRequest.requestHash,
      }),
    );
  });

  it('uses the existing defaults only when preview timing is absent', async () => {
    await service.previewClip('question-1', {});
    expect(question.audioRequest.preferredStartSeconds).toBeNull();
    expect(question.audioRequest.preferredDurationSeconds).toBeUndefined();
  });
});

describe('QuestionAudioReviewService video reuse', () => {
  const populate = jest.fn();
  const save = jest.fn();
  const storage = {
    saveQuestionMedia: jest.fn(),
    allocateQuestionMediaClip: jest.fn(),
    delete: jest.fn(),
  };
  const inspector = {
    videoDurationSeconds: jest.fn(),
    audioDurationSeconds: jest.fn(),
  };
  const processor = {
    createMp4Snippet: jest.fn(),
    createMp3Snippet: jest.fn(),
  };
  const question = {
    type: QuestionType.VIDEO,
    requiresAudio: true,
    audioRequest: {
      kind: AudioQuestionKind.CUSTOM,
      searchQuery: 'landmark video',
      preferredStartSeconds: 2,
      preferredDurationSeconds: 8,
    },
    audioAsset: null as QuestionPrimaryAsset | null,
    primaryAsset: null as QuestionPrimaryAsset | null,
    mediaUrl: undefined as string | undefined,
    status: 'draft',
    audioStatus: AudioAssetStatus.PENDING,
    assetStatus: 'PENDING',
    audioReviewStatus: 'pending',
    audioRequestStale: false,
    audioDiagnostics: {},
    populate,
    save,
  };
  const repository = {
    findDocumentById: jest.fn().mockResolvedValue(question),
  };
  const service = new QuestionAudioReviewService(
    repository as never,
    { enqueue: jest.fn() } as never,
    storage as never,
    inspector as never,
    processor as never,
    new AudioRequestIdentityService(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    question.type = QuestionType.VIDEO;
    question.audioAsset = null;
    question.primaryAsset = null;
    question.audioRequestStale = false;
    save.mockResolvedValue(question);
    populate.mockResolvedValue(question);
    storage.saveQuestionMedia.mockResolvedValue({
      filename: 'source.mp4',
      absolutePath: '/tmp/source.mp4',
      url: '/uploads/question-assets/video/source.mp4',
    });
    storage.allocateQuestionMediaClip.mockResolvedValue({
      filename: 'clip.mp4',
      absolutePath: '/tmp/clip.mp4',
      url: '/uploads/question-assets/video/clip.mp4',
    });
    inspector.videoDurationSeconds
      .mockResolvedValueOnce(30)
      .mockResolvedValueOnce(8);
    mockedStat.mockResolvedValue({
      size: 2048,
    } as Awaited<ReturnType<typeof stat>>);
  });

  it('uploads, trims, stores, and serializes an MP4 through shared services', async () => {
    await service.upload('question-1', {
      originalname: 'source.mp4',
      mimetype: 'video/mp4',
      size: 1024,
      buffer: Buffer.from('video'),
    });
    expect(storage.saveQuestionMedia).toHaveBeenCalledWith(
      expect.objectContaining({ mimetype: 'video/mp4' }),
      'video',
    );
    expect(processor.createMp4Snippet).toHaveBeenCalledWith({
      inputPath: '/tmp/source.mp4',
      outputPath: '/tmp/clip.mp4',
      startSecond: 2,
      durationSeconds: 8,
    });
    expect(question).toMatchObject({
      audioStatus: AudioAssetStatus.READY,
      audioAsset: {
        type: QuestionAssetType.VIDEO,
        url: '/uploads/question-assets/video/clip.mp4',
        duration: 8,
        metadata: { mimetype: 'video/mp4' },
      },
      primaryAsset: { type: QuestionAssetType.VIDEO },
      mediaUrl: '/uploads/question-assets/video/clip.mp4',
    });
  });

  it('removes a stored video using the same storage service', async () => {
    question.audioAsset = {
      type: QuestionAssetType.VIDEO,
      url: '/uploads/question-assets/video/clip.mp4',
      source: 'admin-upload',
      localPath: '/tmp/clip.mp4',
    };
    question.primaryAsset = question.audioAsset;
    await service.removeAsset('question-1');
    expect(storage.delete).toHaveBeenCalledWith({
      absolutePath: '/tmp/clip.mp4',
    });
    expect(question.audioAsset).toBeNull();
    expect(question.primaryAsset).toBeNull();
  });

  it('approves a ready canonical video asset and verifies the fresh database state', async () => {
    question.audioStatus = AudioAssetStatus.READY;
    question.assetStatus = AssetStatus.READY;
    question.audioReviewStatus = AudioReviewStatus.PENDING;
    question.audioAsset = {
      type: QuestionAssetType.VIDEO,
      url: '/uploads/question-assets/video/clip.mp4',
      source: 'youtube',
      localPath: '/tmp/clip.mp4',
      metadata: { mediaAssetId: 'video-asset-1' },
    };
    question.primaryAsset = question.audioAsset;

    await service.approve('question-1');

    expect(question.audioReviewStatus).toBe(AudioReviewStatus.APPROVED);
    expect(repository.findDocumentById).toHaveBeenLastCalledWith('question-1');
  });
});

describe('QuestionAudioReviewService canonical audio approval', () => {
  it('persists approval on the same ready audio asset used by validation', async () => {
    const question = {
      type: QuestionType.AUDIO,
      audioStatus: AudioAssetStatus.READY,
      assetStatus: AssetStatus.READY,
      audioReviewStatus: AudioReviewStatus.PENDING,
      audioRequestStale: false,
      audioRequest: {
        kind: AudioQuestionKind.CUSTOM,
        searchQuery: 'ready audio',
        selectedCandidateId: 'candidate-1',
      },
      audioAsset: {
        type: QuestionAssetType.AUDIO,
        url: '/uploads/question-assets/audio/clip.m4a',
        source: 'youtube',
        metadata: { mediaAssetId: 'audio-asset-1' },
      },
      primaryAsset: {
        type: QuestionAssetType.AUDIO,
        url: '/uploads/question-assets/audio/clip.m4a',
        source: 'youtube',
      },
      save: jest.fn(),
      populate: jest.fn(),
    };
    question.save.mockResolvedValue(question as never);
    question.populate.mockResolvedValue(question as never);
    const repository = {
      findDocumentById: jest.fn().mockResolvedValue(question),
    };
    const service = new QuestionAudioReviewService(
      repository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new AudioRequestIdentityService(),
    );

    await service.approve('question-1');

    expect(question.audioReviewStatus).toBe(AudioReviewStatus.APPROVED);
    expect(repository.findDocumentById).toHaveBeenCalledTimes(2);
  });
});
