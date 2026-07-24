import { AiAgentService } from './ai-agent.service';
import type {
  AssetMetadata,
  AssetRequest,
} from './contracts/asset-provider.interface';
import type {
  EntityVerificationRequest,
  VerifiedEntity,
} from './application/entity-verification.types';

type ProcessedDraft = Record<string, unknown> & {
  verificationDiagnostics?: Record<string, unknown>;
};

type AiAgentHarness = {
  promptBuilder: { normalizeGameplayConfig: jest.Mock };
  assetService: { process: jest.Mock };
  entityVerification: { verify: jest.Mock; diagnostics: jest.Mock };
  processDraftAssets: (questions: unknown[]) => Promise<ProcessedDraft[]>;
};

const baseVerified = (
  overrides: Partial<VerifiedEntity> = {},
): VerifiedEntity => ({
  verificationStatus: 'VERIFIED',
  canonicalEntity: 'Canonical Entity',
  canonicalAnswer: 'Canonical Entity',
  entityType: 'song',
  aliases: ['Canonical Entity'],
  originalLanguageAliases: [],
  transliterations: [],
  confidence: { overall: 0.9, identity: 0.9, answer: 0.9, association: 0.9 },
  evidence: [
    {
      sourceTitle: 'source',
      sourceDomain: 'music.apple.com',
      sourceTier: 'structured-platform',
      supportsIdentity: true,
      supportsAnswer: true,
      supportsAssociation: true,
    },
  ],
  searchHints: {
    requiredTerms: ['Canonical Entity'],
    trustedAliases: ['Canonical Entity'],
    franchiseTerms: [],
    providerHints: [],
    prohibitedGenericTerms: [],
  },
  issues: ['ENTITY_VERIFICATION_SUCCEEDED'],
  ...overrides,
});

const draft = (assetRequest: AssetRequest) => ({
  question: 'ما اسم هذه الأغنية؟',
  correctAnswer: 'uncertain raw spelling',
  wrongAnswers: ['أ', 'ب', 'ج'],
  difficulty: 'medium' as const,
  gameMode: 'identifySong' as const,
  type: assetRequest.type,
  assetRequest,
  assetStatus: 'PENDING' as const,
  asset: null,
  primaryAssetRequest: assetRequest,
  primaryAssetStatus: 'PENDING' as const,
  primaryAsset: null,
  coverImageRequest: null,
  coverImageStatus: 'FAILED' as const,
  coverImage: null,
  explanation: 'fixture',
  qualityScore: 8,
  issues: [],
});

const createService = (
  verified: VerifiedEntity,
  options: { assetStatus?: 'READY' | 'FAILED'; locallyGrounded?: boolean } = {},
) => {
  const verificationCalls: EntityVerificationRequest[] = [];
  const assetCalls: AssetRequest[] = [];
  const service = Object.create(AiAgentService.prototype) as AiAgentHarness;
  service.promptBuilder = {
    normalizeGameplayConfig: jest.fn().mockReturnValue({
      supportedAssetTypes: ['text', 'image', 'audio'],
      maxAudioDuration: 12,
    }),
  };
  service.assetService = {
    process: jest.fn(async (request?: AssetRequest) => {
      if (request) assetCalls.push(request);
      if (!request) return { assetStatus: 'NOT_REQUIRED' };
      if (options.assetStatus === 'FAILED') {
        return {
          assetStatus: 'FAILED',
          assetFailureReason: 'provider failed safely',
          assetFailureStep: 'provider-search',
          assetFailureDiagnostics: { provider: request.provider },
        };
      }
      return {
        assetStatus: 'READY',
        asset: {
          type: request.type,
          localPath: 'question-assets/fixture',
          url: '/uploads/question-assets/fixture',
          source: request.provider ?? 'fixture',
          provider: request.provider ?? 'fixture',
        } satisfies AssetMetadata,
      };
    }),
  };
  service.entityVerification = {
    verify: jest.fn(async (request: EntityVerificationRequest) => {
      verificationCalls.push(request);
      return options.locallyGrounded
        ? baseVerified({
            ...verified,
            verificationStatus: 'VERIFIED',
            cacheHit: true,
          })
        : verified;
    }),
    diagnostics: jest.fn((entity: VerifiedEntity, required: boolean) => ({
      verificationRequired: required,
      verificationProvider: required ? 'wigolo' : 'local-knowledge',
      verificationStatus: entity.verificationStatus,
      verificationCacheHit: Boolean(entity.cacheHit),
      canonicalEntity: entity.canonicalEntity,
      canonicalAnswer: entity.canonicalAnswer,
      verifiedAliasesCount: entity.aliases.length,
      evidenceSourceCount: entity.evidence.length,
      evidenceTierCounts: {},
      overallConfidence: entity.confidence.overall,
      identityConfidence: entity.confidence.identity,
      answerConfidence: entity.confidence.answer,
      associationConfidence: entity.confidence.association,
      verificationDurationMs: entity.durationMs ?? 0,
      verificationIssueCodes: entity.issues,
      canonicalArtist: entity.song?.artist,
      verifiedFranchise: entity.franchise,
    })),
  };
  return { service, verificationCalls, assetCalls };
};

describe('AiAgentService Wigolo verification integration', () => {
  it('builds Gulf music drafts from verified rows without requiring an LLM response', () => {
    const service = Object.create(
      AiAgentService.prototype,
    ) as AiAgentHarness & {
      buildGulfMusicDrafts: (
        songs: Array<{
          title: string;
          artist: string;
          country: string;
          difficulty: 'easy' | 'medium' | 'hard';
          titleAliases: string[];
          artistAliases: string[];
          releaseYear?: number;
        }>,
        difficulty: 'easy' | 'medium' | 'hard',
        count: number,
        duration: number,
      ) => ProcessedDraft[];
    };
    const songs = [
      {
        title: 'الأماكن',
        artist: 'محمد عبده',
        country: 'Saudi Arabia',
        difficulty: 'easy' as const,
        titleAliases: ['الأماكن'],
        artistAliases: ['محمد عبده'],
      },
      {
        title: 'يا طيب القلب',
        artist: 'عبدالمجيد عبدالله',
        country: 'Saudi Arabia',
        difficulty: 'easy' as const,
        titleAliases: ['يا طيب القلب'],
        artistAliases: ['عبدالمجيد عبدالله'],
      },
      {
        title: 'مذهلة',
        artist: 'محمد عبده',
        country: 'Saudi Arabia',
        difficulty: 'medium' as const,
        titleAliases: ['مذهلة'],
        artistAliases: ['محمد عبده'],
      },
      {
        title: 'تناديك',
        artist: 'ماجد المهندس',
        country: 'Iraq/Gulf',
        difficulty: 'easy' as const,
        titleAliases: ['تناديك'],
        artistAliases: ['ماجد المهندس'],
      },
    ];

    const result = service.buildGulfMusicDrafts(songs, 'easy', 3, 15);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      gameMode: 'identifySong',
      type: 'audio',
      assetStatus: 'PENDING',
      issues: [],
      assetRequest: {
        type: 'audio',
        provider: 'youtube',
        mediaIntent: 'music',
        duration: 15,
      },
    });
    expect(
      result.every((draft) => draft.question === 'ما اسم هذه الأغنية؟'),
    ).toBe(true);
  });

  it('verifies Gulf song identity before YouTube and sends only canonical title and artist', async () => {
    const { service, verificationCalls, assetCalls } = createService(
      baseVerified({
        canonicalEntity: 'الأماكن',
        canonicalAnswer: 'الأماكن',
        entityType: 'song',
        aliases: ['الأماكن', 'Al Amaken'],
        song: {
          title: 'الأماكن',
          artist: 'محمد عبده',
          titleAliases: ['الأماكن'],
          artistAliases: ['Mohammed Abdo'],
        },
      }),
    );

    const [result] = await service['processDraftAssets']([
      draft({
        type: 'audio',
        provider: 'youtube',
        entityType: 'song',
        entity: 'raw uncertain song',
        artist: 'raw uncertain artist',
      }),
    ]);

    expect(verificationCalls).toHaveLength(1);
    expect(assetCalls[0]).toMatchObject({
      provider: 'youtube',
      entity: 'الأماكن',
      canonicalEntity: 'الأماكن',
      artist: 'محمد عبده',
    });
    expect(JSON.stringify(assetCalls[0])).not.toContain('raw uncertain song');
    expect(result.assetStatus).toBe('READY');
  });

  it('blocks provider calls when verification rejects', async () => {
    const { service, assetCalls } = createService(
      baseVerified({
        verificationStatus: 'REJECTED',
        confidence: {
          overall: 0.1,
          identity: 0.1,
          answer: 0.1,
          association: 0.1,
        },
        evidence: [],
        issues: ['ENTITY_VERIFICATION_REJECTED'],
      }),
    );

    const [result] = await service['processDraftAssets']([
      draft({ type: 'audio', provider: 'youtube', entity: 'fake song' }),
    ]);

    expect(assetCalls).toHaveLength(0);
    expect(result.assetStatus).toBe('FAILED');
    expect(result.assetFailureStep).toBe('entity-verification');
  });

  it('uses cache hits without repeated research calls at the service boundary', async () => {
    const { service } = createService(
      baseVerified({
        canonicalEntity: 'الأماكن',
        cacheHit: true,
        song: {
          title: 'الأماكن',
          artist: 'محمد عبده',
          titleAliases: ['الأماكن'],
          artistAliases: [],
        },
      }),
    );
    const request = draft({
      type: 'audio',
      provider: 'youtube',
      entityType: 'song',
      entity: 'الأماكن',
      artist: 'محمد عبده',
    });

    await service['processDraftAssets']([request]);
    await service['processDraftAssets']([request]);

    expect(service.entityVerification.verify).toHaveBeenCalledTimes(2);
    expect(service.entityVerification.diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ cacheHit: true }),
      true,
    );
  });

  it('requires Wigolo verification for hardcoded catalog songs', async () => {
    const { service, verificationCalls, assetCalls } = createService(
      baseVerified({
        canonicalEntity: 'الأماكن',
        song: {
          title: 'الأماكن',
          artist: 'محمد عبده',
          titleAliases: [],
          artistAliases: [],
        },
      }),
    );
    const locallyGrounded = {
      ...draft({
        type: 'audio',
        provider: 'youtube',
        entityType: 'song',
        entity: 'الأماكن',
        artist: 'محمد عبده',
      }),
      musicMetadata: {
        title: 'الأماكن',
        artist: 'محمد عبده',
        region: 'gulf' as const,
        language: 'ar' as const,
      },
    };

    const [result] = await service['processDraftAssets']([locallyGrounded]);

    expect(verificationCalls[0].locallyGrounded).toBe(false);
    expect(result.verificationDiagnostics?.verificationProvider).toBe('wigolo');
    expect(assetCalls[0].entity).toBe('الأماكن');
  });

  it('verifies anime image identity before Jikan and uses canonical aliases', async () => {
    const { service, assetCalls } = createService(
      baseVerified({
        canonicalEntity: 'Deidara',
        canonicalAnswer: 'Deidara',
        entityType: 'anime-character',
        aliases: ['Deidara', 'ديدارا'],
        franchise: 'Naruto',
      }),
    );

    const [result] = await service['processDraftAssets']([
      {
        ...draft({
          type: 'image',
          provider: 'jikan',
          entityType: 'character',
          categoryType: 'anime',
          entity: 'ديدارا',
          franchise: 'Naruto',
        }),
        gameMode: 'identifyImage',
      },
    ]);

    expect(assetCalls[0]).toMatchObject({
      provider: 'jikan',
      entity: 'Deidara',
      franchise: 'Naruto',
      aliases: ['Deidara', 'ديدارا'],
    });
    expect(result.assetStatus).toBe('READY');
  });

  it('blocks Jikan when franchise verification fails', async () => {
    const { service, assetCalls } = createService(
      baseVerified({
        verificationStatus: 'REJECTED',
        entityType: 'anime-character',
        franchise: 'Bleach',
        confidence: {
          overall: 0.1,
          identity: 0.9,
          answer: 0.9,
          association: 0.1,
        },
        issues: ['ENTITY_VERIFICATION_FRANCHISE_MISMATCH'],
      }),
    );

    const [result] = await service['processDraftAssets']([
      {
        ...draft({
          type: 'image',
          provider: 'jikan',
          entityType: 'character',
          entity: 'شخصية تستخدم الطين',
          franchise: 'Naruto',
        }),
        gameMode: 'identifyImage',
      },
    ]);

    expect(assetCalls).toHaveLength(0);
    expect(result.issues).toContain('ENTITY_VERIFICATION_FRANCHISE_MISMATCH');
  });

  it('verifies anime voice before YouTube and avoids the full generated question as query', async () => {
    const { service, assetCalls } = createService(
      baseVerified({
        canonicalEntity: 'Deidara',
        entityType: 'anime-character',
        aliases: ['Deidara'],
        franchise: 'Naruto',
      }),
    );

    await service['processDraftAssets']([
      {
        ...draft({
          type: 'audio',
          provider: 'youtube',
          entityType: 'character',
          entity: 'ديدارا',
          franchise: 'Naruto',
          mediaIntent: 'voice',
        }),
        question: 'من صاحب هذا الصوت في أنمي ناروتو؟',
        gameMode: 'identifyVoice',
      },
    ]);

    expect(assetCalls[0]).toMatchObject({
      provider: 'youtube',
      entity: 'Deidara',
      franchise: 'Naruto',
    });
    expect(assetCalls[0].query).toBeUndefined();
    expect(JSON.stringify(assetCalls[0])).not.toContain('من صاحب هذا الصوت');
  });

  it.each([
    ['historical-person', 'historical-figure'],
    ['person', 'unknown'],
    ['place', 'place'],
    ['organization', 'unknown'],
    ['event', 'unknown'],
    ['generic-topic', 'unknown'],
  ])(
    'verifies Wikimedia %s flow before provider search',
    async (entityType) => {
      const { service, assetCalls } = createService(
        baseVerified({
          canonicalEntity: 'Verified Wikimedia Entity',
          aliases: ['Verified Wikimedia Entity', 'Alias'],
        }),
      );

      const [result] = await service['processDraftAssets']([
        draft({
          type: 'image',
          provider: 'wikimedia',
          entityType,
          entity: 'generic description that must not leak',
        }),
      ]);

      expect(assetCalls[0]).toMatchObject({
        provider: 'wikimedia',
        entity: 'Verified Wikimedia Entity',
        aliases: ['Verified Wikimedia Entity', 'Alias'],
      });
      expect(JSON.stringify(assetCalls[0])).not.toContain(
        'generic description',
      );
      expect(result.assetStatus).toBe('READY');
    },
  );

  it('keeps provider failure safe after successful verification', async () => {
    const { service } = createService(baseVerified(), {
      assetStatus: 'FAILED',
    });

    const [result] = await service['processDraftAssets']([
      draft({
        type: 'image',
        provider: 'wikimedia',
        entity: 'Verified Entity',
      }),
    ]);

    expect(result.assetStatus).toBe('FAILED');
    expect(result.assetFailureStep).toBe('provider-search');
    expect(result.asset).toBeNull();
  });

  it('preserves LLM asset search context and inherits draft metadata', () => {
    const service = Object.create(AiAgentService.prototype) as unknown as {
      normalizeReviewedQuestion: (
        rawQuestion: unknown,
        requestedDifficulty: 'easy' | 'medium' | 'hard',
        index: number,
      ) => Record<string, unknown>;
    };

    const result = service.normalizeReviewedQuestion(
      {
        question: 'من هذه الشخصية؟',
        correctAnswer: 'شيكامارو نارا',
        wrongAnswers: ['ناروتو', 'ساسكي', 'كاكاشي'],
        difficulty: 'medium',
        gameMode: 'identifyCharacter',
        type: 'image',
        primaryAssetRequest: {
          type: 'image',
          entity: 'Shikamaru Nara',
          searchEntity: 'Shikamaru Nara',
          searchContext: 'Naruto anime character portrait',
          aliases: ['شيكامارو نارا', 'Shikamaru'],
          entityType: 'character',
          purpose: 'gameplay',
        },
        metadata: {
          franchise: 'Naruto',
          categoryType: 'anime',
          originalName: '奈良シカマル',
        },
      },
      'medium',
      0,
    );

    expect(result.primaryAssetRequest).toMatchObject({
      entity: 'Shikamaru Nara',
      searchEntity: 'Shikamaru Nara',
      searchContext: 'Naruto anime character portrait',
      franchise: 'Naruto',
      categoryType: 'anime',
      originalName: '奈良シカマル',
      aliases: ['شيكامارو نارا', 'Shikamaru'],
    });
  });
});
