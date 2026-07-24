import { QuestionResponseMapper } from './question-response.mapper';

describe('QuestionResponseMapper', () => {
  it('normalizes ids, missing arrays and removes mongoose version metadata', () => {
    const response = QuestionResponseMapper.toResponse({
      _id: { toString: () => 'question-id' },
      question: 'Question?',
      status: 'draft',
      source: 'ai',
      requiresAudio: false,
      audioStatus: 'not_required',
      __v: 4,
    });

    expect(response).toEqual({
      _id: 'question-id',
      question: 'Question?',
      questionType: 'standard',
      preferredPresentationType: 'text',
      effectivePresentationType: 'text',
      mediaAvailable: false,
      mediaFallbackReason: 'NO_MEDIA',
      resolvedMedia: null,
      status: 'draft',
      source: 'ai',
      wrongAnswers: [],
      requiresAudio: false,
      audioStatus: 'not_required',
    });
  });

  it('removes local storage paths from public asset metadata', () => {
    const response = QuestionResponseMapper.toResponse({
      _id: 'question-id',
      question: 'Question?',
      status: 'draft',
      source: 'ai',
      primaryAsset: {
        type: 'image',
        url: '/uploads/image.webp',
        source: 'wikimedia',
        localPath: '/private/uploads/image.webp',
      },
    });

    expect(response.primaryAsset).toEqual({
      type: 'image',
      url: '/uploads/image.webp',
      source: 'wikimedia',
    });
  });

  it('strips Wigolo verification metadata from question DTOs', () => {
    const response = QuestionResponseMapper.toResponse({
      _id: 'question-id',
      question: 'Question?',
      status: 'draft',
      source: 'ai',
      verificationDiagnostics: {
        verificationProvider: 'wigolo',
        evidenceSourceCount: 2,
      },
      aiMetadata: {
        verificationDiagnostics: {
          confidence: 0.9,
          sourceDomains: ['music.apple.com'],
        },
      },
      verificationProvider: 'wigolo',
      verificationStatus: 'VERIFIED',
      verificationCacheHit: true,
      evidenceSourceCount: 2,
      sourceDomains: ['music.apple.com'],
      confidence: { overall: 0.9 },
    });

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('wigolo');
    expect(serialized).not.toContain('verification');
    expect(serialized).not.toContain('music.apple.com');
    expect(serialized).not.toContain('confidence');
  });

  it('supplies safe identity defaults for legacy audio requests', () => {
    const response = QuestionResponseMapper.toResponse({
      _id: 'legacy-audio-question',
      question: 'من صاحب هذا الصوت؟',
      status: 'draft',
      source: 'manual',
      requiresAudio: true,
      audioStatus: 'pending',
      audioRequest: {
        kind: 'identify_character',
        searchQuery: 'Naruto voice',
      },
    });

    expect(response.audioRequest).toEqual(
      expect.objectContaining({
        requestVersion: 1,
        requestHash: expect.any(String),
        requestedAt: expect.any(String),
        selectedCandidateId: null,
        candidateSetVersion: null,
      }),
    );
  });

  it('serializes a video primary asset without exposing its local path', () => {
    const response = QuestionResponseMapper.toResponse({
      _id: 'video-question',
      question: 'ما هذا المشهد؟',
      type: 'video',
      requiresAudio: true,
      audioStatus: 'ready',
      status: 'draft',
      source: 'manual',
      primaryAsset: {
        type: 'video',
        url: '/uploads/question-assets/video/clip.mp4',
        source: 'youtube',
        localPath: '/private/uploads/clip.mp4',
        duration: 8,
      },
      audioAsset: {
        type: 'video',
        url: '/uploads/question-assets/video/clip.mp4',
        source: 'youtube',
        localPath: '/private/uploads/clip.mp4',
        duration: 8,
      },
    });
    expect(response.primaryAsset).toEqual({
      type: 'video',
      url: '/uploads/question-assets/video/clip.mp4',
      source: 'youtube',
      duration: 8,
    });
    expect(response.audioAsset).toEqual(response.primaryAsset);
    expect(response).toMatchObject({
      preferredPresentationType: 'video',
      effectivePresentationType: 'text',
      mediaAvailable: false,
      mediaFallbackReason: 'NOT_READY',
    });
  });

  it('exposes only a ready reviewed canonical audio asset at runtime', () => {
    const asset = {
      type: 'audio',
      url: '/uploads/ready.m4a',
      source: 'youtube',
      duration: 10,
    };
    const response = QuestionResponseMapper.toResponse({
      _id: 'audio-question',
      question: 'ما الأغنية؟',
      type: 'audio',
      primaryAsset: asset,
      audioAsset: asset,
      assetStatus: 'READY',
      audioStatus: 'ready',
      audioReviewStatus: 'approved',
      status: 'approved',
      source: 'manual',
    });
    expect(response).toMatchObject({
      effectivePresentationType: 'audio',
      mediaAvailable: true,
      resolvedMedia: {
        type: 'audio',
        url: '/uploads/ready.m4a',
        duration: 10,
      },
    });
  });
});
