import { BadRequestException } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { CategoryAudioPolicy } from '../categories/schemas/category.schema';
import {
  AssetStatus,
  AudioAssetStatus,
  AudioQuestionKind,
  AudioReviewStatus,
  DifficultyLevel,
  QuestionPoints,
  QuestionType,
  QuestionAssetType,
  QuestionStatus,
} from './schemas/question.schema';
import { AudioRequestIdentityService } from './application/audio-request-identity.service';
import { RankedListQuestionPolicy } from './application/ranked-list-question.policy';
import { BombQuestionPolicy } from './application/bomb-question.policy';
import { resolveQuestionMediaAvailability } from './application/question-media-availability.policy';

describe('QuestionsService manual audio policy', () => {
  const repository = {
    create: jest.fn(),
    findDocumentById: jest.fn(),
    updateById: jest.fn(),
    bulkSetAiStatus: jest.fn(),
  };
  const categories = { findByIdForQuestionAuthoring: jest.fn() };
  const duplicates = { check: jest.fn() };
  const jobs = { enqueue: jest.fn() };
  const imageStorage = { save: jest.fn(), delete: jest.fn() };
  const service = new QuestionsService(
    repository as never,
    categories as never,
    {} as never,
    imageStorage as never,
    { delete: jest.fn() } as never,
    duplicates as never,
    jobs as never,
    new AudioRequestIdentityService(),
    new RankedListQuestionPolicy(),
    new BombQuestionPolicy(),
    { assertHierarchy: jest.fn() } as never,
  );
  const base = {
    category: '507f1f77bcf86cd799439011',
    question: 'ما اسم هذه الشخصية؟',
    answer: 'كريتوس',
    difficulty: DifficultyLevel.EASY,
    points: QuestionPoints.LOW,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    duplicates.check.mockResolvedValue({
      exactMatch: false,
      highestSimilarity: 0,
      matches: [],
    });
    repository.create.mockImplementation(async (payload) => ({
      ...payload,
      _id: 'question-1',
      populate: jest.fn().mockResolvedValue(payload),
    }));
  });

  it('keeps a normal optional-category question text-only', async () => {
    categories.findByIdForQuestionAuthoring.mockResolvedValue({
      audioPolicy: CategoryAudioPolicy.OPTIONAL,
    });
    await service.create(base);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresAudio: false,
        audioStatus: AudioAssetStatus.NOT_REQUIRED,
      }),
    );
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it('allows the same question text to be authored with a different answer', async () => {
    categories.findByIdForQuestionAuthoring.mockResolvedValue({
      audioPolicy: CategoryAudioPolicy.OPTIONAL,
    });
    duplicates.check.mockResolvedValue({
      exactMatch: true,
      highestSimilarity: 1,
      matches: [{ questionId: 'existing-question', similarity: 1 }],
    });

    await expect(
      service.create({ ...base, answer: 'إجابة بديلة' }),
    ).resolves.toEqual(expect.objectContaining({ answer: 'إجابة بديلة' }));
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: 'إجابة بديلة',
        duplicateDiagnostics: expect.objectContaining({ exactMatch: true }),
      }),
    );
  });

  it('forces required audio, persists a draft, and only enqueues background work', async () => {
    categories.findByIdForQuestionAuthoring.mockResolvedValue({
      audioPolicy: CategoryAudioPolicy.REQUIRED,
    });
    await service.create({
      ...base,
      audioRequest: {
        kind: AudioQuestionKind.IDENTIFY_CHARACTER,
        searchQuery: 'Kratos voice line God of War',
      },
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresAudio: true,
        status: QuestionStatus.DRAFT,
        audioStatus: AudioAssetStatus.PENDING,
      }),
    );
    expect(jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        questionId: 'question-1',
        requestVersion: 1,
        requestHash: expect.any(String),
        mode: 'research',
      }),
    );
  });

  it('rejects audio when category policy is disabled', async () => {
    categories.findByIdForQuestionAuthoring.mockResolvedValue({
      audioPolicy: CategoryAudioPolicy.DISABLED,
    });
    await expect(
      service.create({
        ...base,
        requiresAudio: true,
        audioRequest: {
          kind: AudioQuestionKind.CUSTOM,
          searchQuery: 'test audio',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a video draft through the existing media request pipeline', async () => {
    categories.findByIdForQuestionAuthoring.mockResolvedValue({
      audioPolicy: CategoryAudioPolicy.DISABLED,
    });
    await service.create({
      ...base,
      type: QuestionType.VIDEO,
      audioRequest: {
        kind: AudioQuestionKind.CUSTOM,
        searchQuery: 'Saudi Arabia landmark video clip',
        preferredDurationSeconds: 8,
      },
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QuestionType.VIDEO,
        requiresAudio: true,
        status: QuestionStatus.DRAFT,
        audioStatus: AudioAssetStatus.PENDING,
      }),
    );
    expect(jobs.enqueue).toHaveBeenCalled();
  });

  it('creates a preferred video question without requiring media', async () => {
    categories.findByIdForQuestionAuthoring.mockResolvedValue({
      audioPolicy: CategoryAudioPolicy.OPTIONAL,
    });
    await service.create({
      ...base,
      type: QuestionType.VIDEO,
      status: QuestionStatus.APPROVED,
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QuestionType.VIDEO,
        requiresAudio: false,
        audioStatus: AudioAssetStatus.NOT_REQUIRED,
        status: QuestionStatus.APPROVED,
      }),
    );
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it('approves a question while optional audio is still pending', async () => {
    const asset = {
      type: QuestionAssetType.AUDIO,
      url: '/uploads/question-assets/audio/pending.m4a',
      source: 'youtube',
    };
    const existing = {
      category: base.category,
      type: QuestionType.AUDIO,
      requiresAudio: true,
      audioRequest: {
        kind: AudioQuestionKind.CUSTOM,
        searchQuery: 'test audio',
      },
      audioStatus: AudioAssetStatus.PENDING,
      assetStatus: AssetStatus.PENDING,
      audioReviewStatus: AudioReviewStatus.PENDING,
      audioRequestStale: false,
      audioAsset: asset,
      primaryAsset: asset,
    };
    repository.findDocumentById.mockResolvedValue(existing);
    repository.updateById.mockImplementation(async (_id, payload) => payload);
    categories.findByIdForQuestionAuthoring.mockResolvedValue({
      audioPolicy: CategoryAudioPolicy.REQUIRED,
    });
    await expect(
      service.update('507f1f77bcf86cd799439012', {
        status: QuestionStatus.APPROVED,
      }),
    ).resolves.toMatchObject({ status: QuestionStatus.APPROVED });
  });

  it('approves a question while optional video media is invalid', async () => {
    const existing = {
      category: base.category,
      type: QuestionType.VIDEO,
      requiresAudio: true,
      audioRequest: {
        kind: AudioQuestionKind.CUSTOM,
        searchQuery: 'test video',
      },
      audioStatus: AudioAssetStatus.READY,
      assetStatus: AssetStatus.READY,
      audioReviewStatus: AudioReviewStatus.APPROVED,
      audioRequestStale: false,
      audioAsset: { type: QuestionAssetType.AUDIO },
    };
    repository.findDocumentById.mockResolvedValue(existing);
    repository.updateById.mockImplementation(async (_id, payload) => payload);
    categories.findByIdForQuestionAuthoring.mockResolvedValue({
      audioPolicy: CategoryAudioPolicy.OPTIONAL,
    });
    await expect(
      service.update('507f1f77bcf86cd799439012', {
        status: QuestionStatus.APPROVED,
      }),
    ).resolves.toMatchObject({ status: QuestionStatus.APPROVED });
  });

  it('approves an image question without an image asset', async () => {
    repository.findDocumentById.mockResolvedValue({
      ...base,
      type: QuestionType.IMAGE,
      status: QuestionStatus.DRAFT,
      requiresAudio: false,
      assetStatus: AssetStatus.NOT_REQUIRED,
    });
    repository.updateById.mockImplementation(async (_id, payload) => payload);
    categories.findByIdForQuestionAuthoring.mockResolvedValue({
      audioPolicy: CategoryAudioPolicy.OPTIONAL,
    });
    await expect(
      service.update('507f1f77bcf86cd799439012', {
        status: QuestionStatus.APPROVED,
      }),
    ).resolves.toMatchObject({ status: QuestionStatus.APPROVED });
  });

  it('bulk approval does not inspect optional media readiness', async () => {
    repository.bulkSetAiStatus.mockResolvedValue({
      modifiedCount: 1,
    });
    await expect(
      service.bulkAction(['507f1f77bcf86cd799439012'], 'approve'),
    ).resolves.toEqual({ modifiedCount: 1 });
    expect(repository.findDocumentById).not.toHaveBeenCalled();
  });

  it('does not reset a ready playable asset when editable request fields are unchanged', async () => {
    const identity = new AudioRequestIdentityService();
    const storedRequest = identity.create(
      {
        kind: AudioQuestionKind.CUSTOM,
        searchQuery: 'Saudi landmark video',
        preferredStartSeconds: 74,
        preferredDurationSeconds: 10,
      },
      3,
    );
    storedRequest.selectedCandidateId = 'candidate-1';
    const asset = {
      type: QuestionAssetType.VIDEO,
      url: '/uploads/question-assets/video/ready.mp4',
      source: 'youtube',
    };
    const existing = {
      category: base.category,
      type: QuestionType.VIDEO,
      requiresAudio: true,
      answer: base.answer,
      audioRequest: storedRequest,
      audioStatus: AudioAssetStatus.READY,
      assetStatus: AssetStatus.READY,
      audioReviewStatus: AudioReviewStatus.APPROVED,
      audioRequestStale: false,
      audioAsset: asset,
      primaryAsset: asset,
    };
    repository.findDocumentById.mockResolvedValue(existing);
    repository.updateById.mockImplementation(async (_id, payload) => payload);
    categories.findByIdForQuestionAuthoring.mockResolvedValue({
      audioPolicy: CategoryAudioPolicy.OPTIONAL,
    });

    await service.update('507f1f77bcf86cd799439012', {
      question: 'ما اسم هذا المعلم؟',
      audioRequest: {
        kind: AudioQuestionKind.CUSTOM,
        searchQuery: 'Saudi landmark video',
        preferredStartSeconds: 74,
        preferredDurationSeconds: 10,
      },
    });

    expect(repository.updateById).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        audioRequest: expect.objectContaining({
          requestVersion: 3,
          requestHash: storedRequest.requestHash,
          selectedCandidateId: 'candidate-1',
        }),
      }),
    );
    const update =
      repository.updateById.mock.calls[
        repository.updateById.mock.calls.length - 1
      ]?.[1];
    expect(update).not.toMatchObject({
      audioRequestStale: true,
      audioReviewStatus: AudioReviewStatus.PENDING,
      status: QuestionStatus.DRAFT,
    });
  });

  it('allows question approval only after canonical processing and review are ready', async () => {
    const asset = {
      type: QuestionAssetType.AUDIO,
      url: '/uploads/question-assets/audio/ready.m4a',
      source: 'youtube',
    };
    repository.findDocumentById.mockResolvedValue({
      category: base.category,
      type: QuestionType.AUDIO,
      requiresAudio: true,
      answer: base.answer,
      audioRequest: {
        kind: AudioQuestionKind.CUSTOM,
        searchQuery: 'ready audio',
      },
      audioStatus: AudioAssetStatus.READY,
      assetStatus: AssetStatus.READY,
      audioReviewStatus: AudioReviewStatus.APPROVED,
      audioRequestStale: false,
      audioAsset: asset,
      primaryAsset: asset,
    });
    repository.updateById.mockImplementation(async (_id, payload) => payload);
    categories.findByIdForQuestionAuthoring.mockResolvedValue({
      audioPolicy: CategoryAudioPolicy.OPTIONAL,
    });

    await expect(
      service.update('507f1f77bcf86cd799439012', {
        status: QuestionStatus.APPROVED,
      }),
    ).resolves.toMatchObject({ status: QuestionStatus.APPROVED });
  });

  it('replaces an image only through the dedicated upload action', async () => {
    const existing = {
      category: base.category,
      requiresAudio: false,
      answer: base.answer,
      status: QuestionStatus.APPROVED,
      primaryAsset: {
        type: QuestionAssetType.IMAGE,
        localPath: 'uploads/questions/images/old.webp',
      },
    };
    const stored = {
      filename: 'new.webp',
      path: 'uploads/questions/images/new.webp',
      url: '/uploads/questions/images/new.webp',
      mimetype: 'image/webp',
      size: 4,
    };
    repository.findDocumentById.mockResolvedValue(existing);
    repository.updateById.mockImplementation(async (_id, payload) => payload);
    imageStorage.save.mockResolvedValue(stored);
    const result = await service.uploadImage('507f1f77bcf86cd799439012', {
      originalname: 'new.webp',
      mimetype: 'image/webp',
      size: 4,
      buffer: Buffer.from('test'),
    });
    expect(result).toMatchObject({
      $set: {
        type: 'image',
        mediaUrl: stored.url,
        assetStatus: AssetStatus.READY,
        primaryAsset: {
          url: stored.url,
          source: 'admin-upload',
        },
      },
    });
    const persisted = result as unknown as {
      $set: {
        type: QuestionType;
        primaryAsset: {
          type: QuestionAssetType;
          url: string;
        };
        assetStatus: AssetStatus;
      };
    };
    expect(persisted.$set).not.toHaveProperty('status');
    expect(
      resolveQuestionMediaAvailability({
        type: persisted.$set.type,
        primaryAsset: persisted.$set.primaryAsset,
        assetStatus: persisted.$set.assetStatus,
      }),
    ).toMatchObject({
      preferredPresentationType: 'image',
      effectivePresentationType: 'image',
      mediaAvailable: true,
      mediaFallbackReason: null,
      resolvedMedia: { type: 'image', url: stored.url },
    });
    expect(imageStorage.delete).toHaveBeenCalledWith({
      path: 'uploads/questions/images/old.webp',
    });
  });

  it('keeps canonical media unchanged during a regular content update', async () => {
    repository.findDocumentById.mockResolvedValue({
      category: base.category,
      requiresAudio: false,
      answer: base.answer,
      primaryAsset: {
        type: QuestionAssetType.IMAGE,
        url: '/uploads/questions/images/current.webp',
      },
      mediaUrl: '/uploads/questions/images/current.webp',
      assetStatus: AssetStatus.READY,
    });
    repository.updateById.mockImplementation(async (_id, payload) => payload);
    categories.findByIdForQuestionAuthoring.mockResolvedValue({
      audioPolicy: CategoryAudioPolicy.OPTIONAL,
    });

    const result = await service.update('507f1f77bcf86cd799439012', {
      question: 'ما اسم هذه الشخصية بعد التحديث؟',
      primaryAsset: null,
      mediaUrl: '',
      assetStatus: AssetStatus.NOT_REQUIRED,
    } as never);

    expect(result).not.toHaveProperty('primaryAsset');
    expect(result).not.toHaveProperty('mediaUrl');
    expect(result).not.toHaveProperty('assetStatus');
    expect(imageStorage.save).not.toHaveBeenCalled();
    expect(imageStorage.delete).not.toHaveBeenCalled();
  });

  it('preserves the old image when storing its replacement fails', async () => {
    repository.findDocumentById.mockResolvedValue({
      primaryAsset: {
        type: QuestionAssetType.IMAGE,
        localPath: 'uploads/questions/images/old.webp',
      },
    });
    imageStorage.save.mockRejectedValue(new Error('storage failed'));

    await expect(
      service.uploadImage('507f1f77bcf86cd799439012', {
        originalname: 'new.webp',
        mimetype: 'image/webp',
        size: 4,
        buffer: Buffer.from('test'),
      }),
    ).rejects.toThrow('storage failed');
    expect(repository.updateById).not.toHaveBeenCalled();
    expect(imageStorage.delete).not.toHaveBeenCalled();
  });

  it('cleans up the new image but preserves the old image when persistence fails', async () => {
    const stored = {
      filename: 'new.webp',
      path: 'uploads/questions/images/new.webp',
      url: '/uploads/questions/images/new.webp',
      mimetype: 'image/webp',
      size: 4,
    };
    repository.findDocumentById.mockResolvedValue({
      primaryAsset: {
        type: QuestionAssetType.IMAGE,
        localPath: 'uploads/questions/images/old.webp',
      },
    });
    imageStorage.save.mockResolvedValue(stored);
    repository.updateById.mockRejectedValue(new Error('database failed'));

    await expect(
      service.uploadImage('507f1f77bcf86cd799439012', {
        originalname: 'new.webp',
        mimetype: 'image/webp',
        size: 4,
        buffer: Buffer.from('test'),
      }),
    ).rejects.toThrow('database failed');
    expect(imageStorage.delete).toHaveBeenCalledTimes(1);
    expect(imageStorage.delete).toHaveBeenCalledWith(stored);
    expect(imageStorage.delete).not.toHaveBeenCalledWith({
      path: 'uploads/questions/images/old.webp',
    });
  });

  it('removes only the current image and preserves question content and status', async () => {
    repository.findDocumentById.mockResolvedValue({
      primaryAsset: {
        type: QuestionAssetType.IMAGE,
        localPath: 'uploads/questions/images/current.webp',
      },
    });
    repository.updateById.mockImplementation(async (_id, payload) => payload);

    const result = await service.removeImage('507f1f77bcf86cd799439012');

    expect(result).toMatchObject({
      $set: { assetStatus: AssetStatus.NOT_REQUIRED },
      $unset: { primaryAsset: 1, mediaUrl: 1, mediaKey: 1 },
    });
    const persisted = result as unknown as {
      $set: { assetStatus: AssetStatus };
    };
    expect(persisted.$set).not.toHaveProperty('status');
    expect(persisted.$set).not.toHaveProperty('question');
    expect(
      resolveQuestionMediaAvailability({
        type: QuestionType.IMAGE,
        assetStatus: persisted.$set.assetStatus,
      }),
    ).toMatchObject({
      effectivePresentationType: 'text',
      mediaAvailable: false,
      mediaFallbackReason: 'MISSING_ASSET',
    });
    expect(imageStorage.delete).toHaveBeenCalledWith({
      path: 'uploads/questions/images/current.webp',
    });
  });
});
