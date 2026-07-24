import {
  createMediaClipFingerprint,
  QuestionAudioProcessingService,
} from './question-audio-processing.service';
import {
  AssetStatus,
  AudioAssetStatus,
  AudioCandidateStatus,
  AudioQuestionKind,
  AudioReviewStatus,
  QuestionAssetType,
  QuestionType,
} from '../schemas/question.schema';
import { AudioRetryMode } from './question-audio-job.types';

describe('QuestionAudioProcessingService', () => {
  const save = jest.fn().mockResolvedValue(undefined);
  const request = {
    kind: AudioQuestionKind.IDENTIFY_CHARACTER,
    searchQuery: 'Naruto Uzumaki Japanese voice clip',
    targetName: 'Naruto Uzumaki',
    sourceTitle: 'Naruto',
    preferredDurationSeconds: 8,
    preferredStartSeconds: undefined as number | null | undefined,
    requestVersion: 2,
    requestHash: 'hash-2',
    requestedAt: '2026-01-01T00:00:00.000Z',
    selectedCandidateId: 'candidate-1' as string | null,
    candidateSetVersion: 2,
  };
  const candidate = {
    id: 'candidate-1',
    title: 'Naruto Japanese Voice Lines',
    sourceUrl: 'https://youtube.com/watch?v=naruto',
    provider: 'youtube',
    queryUsed: 'Naruto Uzumaki Japanese voice clip clean dialogue',
    rank: 1,
    status: AudioCandidateStatus.SELECTED,
    requestVersion: 2,
    requestHash: 'hash-2',
  };
  const question = {
    type: QuestionType.AUDIO,
    requiresAudio: true,
    audioRequest: { ...request },
    audioCandidates: [{ ...candidate }],
    audioDiagnostics: {},
    save,
  };
  const repository = {
    findDocumentById: jest.fn().mockResolvedValue(question),
  };
  const assets = { process: jest.fn() };
  const wigolo = {
    callToolDetailed: jest.fn().mockResolvedValue({
      data: {
        results: [
          {
            id: 'candidate-new',
            title: 'Naruto clean voice',
            url: 'https://youtube.com/watch?v=new',
          },
        ],
      },
    }),
  };
  const queryBuilder = {
    build: jest
      .fn()
      .mockReturnValue([
        'Naruto Uzumaki Naruto Japanese voice clip clean dialogue',
      ]),
  };
  const config = { get: jest.fn().mockReturnValue('false') };
  const service = new QuestionAudioProcessingService(
    repository as never,
    assets as never,
    wigolo as never,
    queryBuilder as never,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    question.audioRequest = { ...request };
    question.audioCandidates = [{ ...candidate }];
    question.audioDiagnostics = {};
    question.type = QuestionType.AUDIO;
    Object.assign(question, {
      audioStatus: AudioAssetStatus.PENDING,
      assetStatus: AssetStatus.PENDING,
      audioReviewStatus: AudioReviewStatus.PENDING,
      audioRequestStale: false,
      audioAsset: null,
      primaryAsset: null,
      mediaUrl: undefined,
    });
    repository.findDocumentById.mockResolvedValue(question);
  });

  it('persists bounded candidates and does not auto-select the first candidate', async () => {
    question.audioRequest.selectedCandidateId = null;
    question.audioCandidates = [];
    wigolo.callToolDetailed.mockResolvedValueOnce({
      data: {
        results: Array.from({ length: 7 }, (_, index) => ({
          id: `candidate-${index + 1}`,
          title: `Naruto voice result ${index + 1}`,
          url: `https://youtube.com/watch?v=result-${index + 1}`,
        })),
      },
    });
    const outcome = await service.process({
      questionId: 'question-1',
      requestVersion: 2,
      requestHash: 'hash-2',
      mode: AudioRetryMode.RESEARCH,
    });
    expect(outcome).toBe('awaitingCandidateSelection');
    expect(wigolo.callToolDetailed).toHaveBeenCalledWith('search', {
      query: 'Naruto Uzumaki Naruto Japanese voice clip clean dialogue',
      max_results: 5,
    });
    expect(question.audioCandidates).toHaveLength(5);
    expect(question.audioRequest.selectedCandidateId).toBeNull();
    expect(assets.process).not.toHaveBeenCalled();
  });

  it('processes only the explicitly selected candidate', async () => {
    assets.process.mockResolvedValue({
      assetStatus: 'READY',
      asset: {
        type: 'audio',
        url: '/uploads/question-assets/audio/test.m4a',
        localPath: '/tmp/test.m4a',
        source: 'youtube',
        provider: 'youtube',
        duration: 8,
      },
    });
    const outcome = await service.process({
      questionId: 'question-1',
      requestVersion: 2,
      requestHash: 'hash-2',
      mode: AudioRetryMode.RETRY_PROCESSING,
      candidateId: 'candidate-1',
    });
    expect(outcome).toBe('ready');
    expect(assets.process).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedSourceUrl: candidate.sourceUrl,
        selectedCandidate: expect.objectContaining({ id: 'candidate-1' }),
      }),
    );
    expect(question).toMatchObject({
      audioStatus: AudioAssetStatus.READY,
      assetStatus: AssetStatus.READY,
      audioReviewStatus: AudioReviewStatus.PENDING,
      audioRequestStale: false,
      audioAsset: {
        metadata: expect.objectContaining({
          requestHash: 'hash-2',
          candidateId: 'candidate-1',
        }),
      },
    });
    expect(repository.findDocumentById).toHaveBeenLastCalledWith('question-1');
  });

  it('reuses candidate processing while preserving a video asset', async () => {
    question.type = QuestionType.VIDEO;
    question.audioRequest.preferredStartSeconds = 74;
    question.audioRequest.preferredDurationSeconds = 10;
    assets.process.mockResolvedValue({
      assetStatus: 'READY',
      asset: {
        type: 'video',
        url: '/uploads/question-assets/video/test.mp4',
        localPath: '/tmp/test.mp4',
        source: 'youtube',
        provider: 'youtube',
        duration: 8,
      },
    });
    const outcome = await service.process({
      questionId: 'question-1',
      requestVersion: 2,
      requestHash: 'hash-2',
      mode: AudioRetryMode.RETRY_PROCESSING,
      candidateId: 'candidate-1',
    });
    expect(outcome).toBe('ready');
    expect(assets.process).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'video',
        selectedSourceUrl: candidate.sourceUrl,
        duration: 10,
        preferredStartSeconds: 74,
        mediaFingerprint: createMediaClipFingerprint({
          sourceUrl: candidate.sourceUrl,
          startTimeSeconds: 74,
          durationSeconds: 10,
        }),
      }),
    );
    expect(question).toMatchObject({
      audioStatus: AudioAssetStatus.READY,
      assetStatus: AssetStatus.READY,
      audioReviewStatus: AudioReviewStatus.PENDING,
      audioRequestStale: false,
      audioAsset: {
        type: QuestionAssetType.VIDEO,
        url: '/uploads/question-assets/video/test.mp4',
      },
      primaryAsset: { type: QuestionAssetType.VIDEO },
      mediaUrl: '/uploads/question-assets/video/test.mp4',
    });
  });

  it('changes the media fingerprint when source timing changes', () => {
    const first = createMediaClipFingerprint({
      sourceUrl: candidate.sourceUrl,
      startTimeSeconds: 74,
      durationSeconds: 10,
    });
    expect(
      createMediaClipFingerprint({
        sourceUrl: candidate.sourceUrl,
        startTimeSeconds: 120,
        durationSeconds: 10,
      }),
    ).not.toBe(first);
    expect(
      createMediaClipFingerprint({
        sourceUrl: 'https://youtube.com/watch?v=other',
        startTimeSeconds: 74,
        durationSeconds: 10,
      }),
    ).not.toBe(first);
  });

  it('keeps the draft and records a processing-only failure', async () => {
    assets.process.mockResolvedValue({
      assetStatus: 'FAILED',
      assetFailureReason: 'download failed',
      assetFailureStep: 'download',
    });
    await service.process({
      questionId: 'question-1',
      requestVersion: 2,
      requestHash: 'hash-2',
      mode: AudioRetryMode.RETRY_PROCESSING,
      candidateId: 'candidate-1',
    });
    expect(question).toMatchObject({
      status: 'draft',
      audioStatus: AudioAssetStatus.FAILED,
      assetStatus: AssetStatus.FAILED,
      audioDiagnostics: expect.objectContaining({
        code: 'AUDIO_DOWNLOAD_FAILED',
        failedAfterCandidateSelection: true,
      }),
    });
  });

  it('does not attach an old asset when the queued identity is stale', async () => {
    question.audioRequest.requestVersion = 3;
    question.audioRequest.requestHash = 'hash-3';
    const outcome = await service.process({
      questionId: 'question-1',
      requestVersion: 2,
      requestHash: 'hash-2',
      mode: AudioRetryMode.RETRY_PROCESSING,
      candidateId: 'candidate-1',
    });
    expect(outcome).toBe('stale');
    expect(assets.process).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
