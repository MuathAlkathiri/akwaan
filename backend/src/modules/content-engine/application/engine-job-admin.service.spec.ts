import { ConfigService } from '@nestjs/config';
import {
  ChallengeAnswerMode,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../world-content/domain/world-content.constants';
import { PricingUnavailableError } from '../domain/content-engine.constants';
import {
  GENERATION_SPEC_VERSION,
  computeGenerationRequestHash,
} from '../domain/generation-specification';
import {
  AuthoringContextService,
  AuthoringContextUnavailableError,
} from './authoring-context.service';
import { EngineJobAdminService } from './engine-job-admin.service';

const budgetSnapshot = {
  periodKey: '2026-10',
  capMicros: 1_000_000,
  spentMicros: 0,
  reservedMicros: 0,
  availableMicros: 1_000_000,
};

const request = (mechanicKey: string) => ({
  mechanicKey,
  worldKey: 'puzzles',
  scopeKey: 'wordplay-letters',
  targetCount: 3,
});

const context = (mechanicKey: string) => ({
  mechanicKey,
  worldKey: 'puzzles',
  scopeKey: 'wordplay-letters',
  contextHash: 'c'.repeat(64),
  effectiveRules: {
    version: 1 as const,
    digest: 'r'.repeat(64),
    rules: [],
    resolved: [],
    conflicts: [],
    structuredSources: [],
  },
});

const makeConfig = (overrides: Record<string, string | undefined> = {}) =>
  ({
    get: jest.fn((key: string) => {
      const defaults: Record<string, string | undefined> = {
        CONTENT_ENGINE_ENABLED: 'true',
        ENGINE_PROVIDER_NAME: 'fake',
        ENGINE_GENERATION_MODEL: 'fake-model',
        ENGINE_QUALITY_MODEL: 'fake-model',
        ...overrides,
      };
      return defaults[key];
    }),
  }) as unknown as ConfigService;

const build = (
  mechanicKey: string,
  configOverrides: Record<string, string | undefined> = {},
) => {
  const contexts = { resolve: jest.fn(() => context(mechanicKey)) };
  const config = makeConfig(configOverrides);
  const budget = {
    snapshot: jest.fn(async () => budgetSnapshot),
    estimate: jest.fn(() => 1_000),
    batchCapMicros: jest.fn(() => 100_000),
  };
  const service = new EngineJobAdminService(
    {} as never,
    {} as never,
    budget as never,
    contexts as never,
    {} as never,
    config,
  );
  return { service, contexts, budget, config };
};

describe('Content Engine generator capability preflight & Generation Contract Foundation', () => {
  it.each(['read-your-opponent', 'closest'])(
    'marks %s as generator-supported with a deterministic planDigest and generationSpec',
    async (mechanicKey) => {
      const { service } = build(mechanicKey);

      const result = await service.preflight(request(mechanicKey));

      expect(result.resolvable).toBe(true);
      expect(result.submissionReady).toBe(true);
      expect(result.generatorSupported).toBe(true);
      expect(result.diagnostic).toBeUndefined();
      expect(result.pricingConfigured).toBe(true);
      expect(result.planDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(result.generationSpec).toMatchObject({
        specVersion: GENERATION_SPEC_VERSION,
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey,
        targetCount: 3,
        provider: 'fake',
        generationModel: 'fake-model',
        qualityModel: 'fake-model',
        temperature: 0.8,
        batchGuidance: null,
        difficulty: mechanicKey === 'read-your-opponent' ? 'mixed' : null,
      });
      expect(Object.isFrozen(result.generationSpec)).toBe(true);
    },
  );

  it.each(['moving-xo', 'bomb'])(
    'keeps %s authoring-resolvable but blocks generation capability',
    async (mechanicKey) => {
      const { service, budget } = build(mechanicKey);

      const result = await service.preflight(request(mechanicKey));

      expect(result.resolvable).toBe(true);
      expect(result.submissionReady).toBe(false);
      expect(result.generatorSupported).toBe(false);
      expect(result.diagnostic).toEqual({
        code: 'MECHANIC_NOT_GENERATABLE',
        message: `MECHANIC_NOT_GENERATABLE: no authored answer mode for mechanic "${mechanicKey}"`,
      });
      expect(result.blockedReason).toBe(result.diagnostic?.message);
      expect(result.pricingConfigured).toBe(false);
      expect(budget.estimate).not.toHaveBeenCalled();
    },
  );

  it('returns the resolver blocker for retained-inactive Rakkibha', async () => {
    const budget = {
      snapshot: jest.fn(async () => budgetSnapshot),
      estimate: jest.fn(() => 1_000),
    };
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;
    const service = new EngineJobAdminService(
      {} as never,
      {} as never,
      budget as never,
      new AuthoringContextService(config),
      {} as never,
      config,
    );

    const result = await service.preflight(request('rakkibha'));

    expect(result.resolvable).toBe(false);
    expect(result.blockedReason).toContain('MECHANIC_NOT_AUTHORABLE');
    expect(result.generatorSupported).toBeUndefined();
    expect(result.diagnostic).toBeUndefined();
  });

  it('preserves authoring errors for invalid World/Scope combinations', async () => {
    const { service, contexts } = build('moving-xo');
    contexts.resolve.mockImplementation(() => {
      throw new AuthoringContextUnavailableError(
        'MECHANIC_WORLD_MISMATCH',
        'moving-xo is bound to puzzles',
      );
    });

    const result = await service.preflight(request('moving-xo'));

    expect(result.resolvable).toBe(false);
    expect(result.blockedReason).toContain('MECHANIC_WORLD_MISMATCH');
    expect(result.generatorSupported).toBeUndefined();
    expect(result.diagnostic).toBeUndefined();
  });

  it.each(['moving-xo', 'bomb'])(
    'rejects unsupported %s before job persistence when preflight is skipped',
    async (mechanicKey) => {
      const jobs = {
        submit: jest.fn(async () => ({
          jobId: `job-${mechanicKey}`,
          created: true,
        })),
      };
      const contexts = {
        resolve: jest.fn(() => context(mechanicKey)),
      };
      const budget = {
        snapshot: jest.fn(async () => budgetSnapshot),
      };
      const config = {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService;
      const service = new EngineJobAdminService(
        {} as never,
        jobs as never,
        budget as never,
        contexts as never,
        {} as never,
        config,
      );

      await expect(service.submit(request(mechanicKey))).rejects.toMatchObject({
        response: {
          code: 'MECHANIC_NOT_GENERATABLE',
          message: `MECHANIC_NOT_GENERATABLE: no authored answer mode for mechanic "${mechanicKey}"`,
        },
      });
      expect(jobs.submit).not.toHaveBeenCalled();
      expect(budget.snapshot).not.toHaveBeenCalled();
    },
  );

  it.each(['read-your-opponent', 'closest'])(
    'preserves submission for generator-supported %s with immutable generationSpec',
    async (mechanicKey) => {
      const jobs = {
        submit: jest.fn(async (input: { generationSpec: unknown }) => ({
          jobId: `job-${mechanicKey}`,
          created: true,
          generationSpec: input.generationSpec,
        })),
      };
      const contexts = {
        resolve: jest.fn(() => context(mechanicKey)),
      };
      const config = {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService;
      const service = new EngineJobAdminService(
        {} as never,
        jobs as never,
        {} as never,
        contexts as never,
        {} as never,
        config,
      );

      const result = await service.submit(request(mechanicKey));

      expect(result).toMatchObject({
        jobId: `job-${mechanicKey}`,
        created: true,
        contextHash: 'c'.repeat(64),
      });
      expect(jobs.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          mechanicKey,
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          targetCount: 3,
          contextRevision: 'c'.repeat(64),
          generationSpec: expect.objectContaining({
            specVersion: GENERATION_SPEC_VERSION,
            mechanicKey,
            worldKey: 'puzzles',
            scopeKey: 'wordplay-letters',
            targetCount: 3,
            contextHash: 'c'.repeat(64),
          }),
        }),
      );
    },
  );

  describe('Authoring options discovery (options())', () => {
    it('derives eligible Worlds, Scopes, and Mechanics from canonical manifest, generator capability, and runtime compatibility', async () => {
      const config = makeConfig();
      const authoringContexts = new AuthoringContextService(config);
      const runtimeWorlds = [
        {
          _id: 'w-puzzles',
          slug: 'puzzles',
          name: 'الألغاز',
          status: WorldContentStatus.ACTIVE,
        },
        {
          _id: 'w-cars',
          slug: 'cars',
          name: 'السيارات',
          status: WorldContentStatus.ARCHIVED,
        },
      ];
      const runtimeChallengeTypes = [
        {
          _id: 'ct-ryo',
          slug: 'read-your-opponent',
          name: 'اقرأ خصمك',
          status: WorldContentStatus.ACTIVE,
          answerMode: ChallengeAnswerMode.RYO,
        },
        {
          _id: 'ct-closest',
          slug: 'closest',
          name: 'الأقرب',
          status: WorldContentStatus.ACTIVE,
          answerMode: ChallengeAnswerMode.CLOSEST,
        },
        {
          _id: 'ct-mxo',
          slug: 'moving-xo',
          name: 'XO المتحركة',
          status: WorldContentStatus.ACTIVE,
          answerMode: ChallengeAnswerMode.MOVING_XO,
        },
      ];
      const runtimeScopes = [
        {
          _id: 's-wordplay',
          worldId: 'w-puzzles',
          slug: 'wordplay-letters',
          name: 'التلاعب اللفظي والحروف',
          status: WorldContentStatus.ACTIVE,
          excludedChallengeTypeIds: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: 's-numbers',
          worldId: 'w-puzzles',
          slug: 'numbers-estimation',
          name: 'الأرقام والتقدير',
          status: WorldContentStatus.ACTIVE,
          excludedChallengeTypeIds: ['ct-ryo'],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const runtimeBoardConfigs = [
        {
          _id: 'bc-1',
          worldId: 'w-puzzles',
          slotKey: WorldChallengeSlotKey.SLOT_2,
          challengeTypeId: 'ct-ryo',
        },
      ];

      const budget = {
        snapshot: jest.fn(async () => budgetSnapshot),
        estimate: jest.fn(() => 1_000),
      };

      const service = new EngineJobAdminService(
        {} as never,
        {} as never,
        budget as never,
        authoringContexts,
        {} as never,
        config,
        { list: jest.fn(async () => runtimeWorlds) } as never,
        { list: jest.fn(async () => runtimeScopes) } as never,
        { list: jest.fn(async () => runtimeChallengeTypes) } as never,
        { list: jest.fn(async () => runtimeBoardConfigs) } as never,
      );

      const options = await service.options();

      expect(options.specVersion).toBe(GENERATION_SPEC_VERSION);
      expect(options.limits).toMatchObject({
        minTargetCount: 1,
        maxTargetCount: 10,
        maxBatchGuidanceLength: 1000,
      });

      const ryo = options.mechanics.find(
        (m) => m.mechanicKey === 'read-your-opponent',
      );
      expect(ryo).toMatchObject({
        eligible: true,
        generatorSupported: true,
        supportsDifficultySelection: true,
        supportedDifficulties: [
          'mixed',
          'easy',
          'medium',
          'relatively_difficult',
        ],
        defaultDifficulty: 'mixed',
      });

      const closest = options.mechanics.find(
        (m) => m.mechanicKey === 'closest',
      );
      expect(closest).toMatchObject({
        eligible: true,
        generatorSupported: true,
        supportsDifficultySelection: false,
        supportedDifficulties: [],
        difficultyDeferredReason: 'CLOSEST_DIFFICULTY_DEFERRED',
      });

      const rakkibha = options.mechanics.find(
        (m) =>
          m.mechanicKey === 'distributed-information' ||
          m.aliases.includes('rakkibha'),
      );
      expect(rakkibha).toMatchObject({
        mechanicKey: 'distributed-information',
        aliases: ['rakkibha'],
        eligible: false,
        blockedCode: 'MECHANIC_NOT_AUTHORABLE',
      });

      const puzzlesWorld = options.worlds.find(
        (w) => w.worldKey === 'puzzles',
      )!;
      expect(puzzlesWorld.eligible).toBe(true);

      const wordplayScope = puzzlesWorld.scopes.find(
        (s) => s.scopeKey === 'wordplay-letters',
      )!;
      const wordplayRyo = wordplayScope.mechanics.find(
        (m) => m.mechanicKey === 'read-your-opponent',
      )!;
      expect(wordplayRyo).toMatchObject({
        eligible: true,
        onBoard: true,
        offBoardAuthoringAllowed: false,
        boardSlotKeys: [WorldChallengeSlotKey.SLOT_2],
      });

      const wordplayClosest = wordplayScope.mechanics.find(
        (m) => m.mechanicKey === 'closest',
      )!;
      expect(wordplayClosest).toMatchObject({
        eligible: true,
        onBoard: false,
        offBoardAuthoringAllowed: true,
        boardSlotKeys: [],
      });

      // numbers-estimation excludes read-your-opponent in runtime Scope config
      const numbersScope = puzzlesWorld.scopes.find(
        (s) => s.scopeKey === 'numbers-estimation',
      )!;
      const numbersRyo = numbersScope.mechanics.find(
        (m) => m.mechanicKey === 'read-your-opponent',
      )!;
      expect(numbersRyo).toMatchObject({
        eligible: false,
        runtimeCompatible: false,
        blockedCode: 'CHALLENGE_TYPE_EXCLUDED_BY_SCOPE',
      });

      // Archived cars world is blocked
      const carsWorld = options.worlds.find((w) => w.worldKey === 'cars')!;
      expect(carsWorld).toMatchObject({
        eligible: false,
        blockedCode: 'WORLD_ARCHIVED',
      });
    });
  });

  describe('Preflight plan digest, drift detection, and specification hashing', () => {
    it('produces distinct requestHashes and planDigests when difficulty, guidance, model, temperature, or count changes', async () => {
      const { service: s1 } = build('read-your-opponent');
      const base = await s1.preflight({
        ...request('read-your-opponent'),
        difficulty: 'mixed',
        batchGuidance: 'Focus on word roots.',
      });
      const diffEasy = await s1.preflight({
        ...request('read-your-opponent'),
        difficulty: 'easy',
        batchGuidance: 'Focus on word roots.',
      });
      const diffGuidance = await s1.preflight({
        ...request('read-your-opponent'),
        difficulty: 'mixed',
        batchGuidance: 'Focus on proverbs.',
      });
      const diffCount = await s1.preflight({
        ...request('read-your-opponent'),
        targetCount: 5,
        difficulty: 'mixed',
        batchGuidance: 'Focus on word roots.',
      });
      const { service: sModel } = build('read-your-opponent', {
        ENGINE_GENERATION_MODEL: 'fake-model-v2',
      });
      const diffModel = await sModel.preflight({
        ...request('read-your-opponent'),
        difficulty: 'mixed',
        batchGuidance: 'Focus on word roots.',
      });
      const { service: sTemp } = build('read-your-opponent', {
        ENGINE_GENERATION_TEMPERATURE: '0.4',
      });
      const diffTemp = await sTemp.preflight({
        ...request('read-your-opponent'),
        difficulty: 'mixed',
        batchGuidance: 'Focus on word roots.',
      });

      const hashes = [
        computeGenerationRequestHash(base.generationSpec!),
        computeGenerationRequestHash(diffEasy.generationSpec!),
        computeGenerationRequestHash(diffGuidance.generationSpec!),
        computeGenerationRequestHash(diffCount.generationSpec!),
        computeGenerationRequestHash(diffModel.generationSpec!),
        computeGenerationRequestHash(diffTemp.generationSpec!),
      ];
      expect(new Set(hashes).size).toBe(hashes.length);

      const digests = [
        base.planDigest,
        diffEasy.planDigest,
        diffGuidance.planDigest,
        diffCount.planDigest,
        diffModel.planDigest,
        diffTemp.planDigest,
      ];
      expect(new Set(digests).size).toBe(digests.length);
    });

    it('rejects submission when planDigest is missing or has drifted since preflight', async () => {
      const jobs = {
        submit: jest.fn(async () => ({ jobId: 'job-1', created: true })),
      };
      const contexts = {
        resolve: jest.fn(() => context('read-your-opponent')),
      };
      const config = makeConfig();
      const budget = {
        snapshot: jest.fn(async () => budgetSnapshot),
        estimate: jest.fn(() => 1_000),
      };
      const service = new EngineJobAdminService(
        {} as never,
        jobs as never,
        budget as never,
        contexts as never,
        {} as never,
        config,
      );

      const plan = await service.preflight({
        ...request('read-your-opponent'),
        difficulty: 'easy',
        batchGuidance: 'Keep stems concise.',
      });

      // Missing planDigest -> 400 PREFLIGHT_PLAN_DIGEST_REQUIRED
      await expect(
        service.submit({
          ...request('read-your-opponent'),
          difficulty: 'easy',
          batchGuidance: 'Keep stems concise.',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'PREFLIGHT_PLAN_DIGEST_REQUIRED',
        },
      });

      // Drifted guidance with old planDigest -> 409 PREFLIGHT_PLAN_DRIFT
      await expect(
        service.submit({
          ...request('read-your-opponent'),
          difficulty: 'easy',
          batchGuidance: 'Changed guidance after preflight.',
          planDigest: plan.planDigest,
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'PREFLIGHT_PLAN_DRIFT',
        },
      });
      expect(jobs.submit).not.toHaveBeenCalled();

      // Exact matching planDigest succeeds and attributes authenticated Admin
      const submitted = await service.submit(
        {
          ...request('read-your-opponent'),
          difficulty: 'easy',
          batchGuidance: 'Keep stems concise.',
          planDigest: plan.planDigest,
        },
        {
          actorId: 'admin-42',
          actorEmail: 'admin42@akwaan.test',
        },
      );

      expect(submitted).toMatchObject({
        jobId: 'job-1',
        created: true,
        planDigest: plan.planDigest,
        createdBy: 'admin-42',
        createdByEmail: 'admin42@akwaan.test',
      });
      expect(jobs.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          planDigest: plan.planDigest,
          createdBy: 'admin-42',
          createdByEmail: 'admin42@akwaan.test',
        }),
      );
    });
  });

  describe('Candidate count limits, difficulty, guidance, and provider fail-closed guards', () => {
    it('rejects candidate counts exceeding configured capacity rather than truncating', async () => {
      const { service } = build('read-your-opponent', {
        ENGINE_BATCH_SIZE: '10',
      });

      const preflight = await service.preflight({
        ...request('read-your-opponent'),
        targetCount: 11,
      });
      expect(preflight.resolvable).toBe(false);
      expect(preflight.blockedCode).toBe('CANDIDATE_COUNT_EXCEEDS_CAPACITY');

      await expect(
        service.submit({
          ...request('read-your-opponent'),
          targetCount: 11,
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'CANDIDATE_COUNT_EXCEEDS_CAPACITY',
        },
      });
    });

    it('rejects difficulty selection for closest and rejects quality-judge "hard" for RYO', async () => {
      const { service: closestService } = build('closest');
      const closestPreflight = await closestService.preflight({
        ...request('closest'),
        difficulty: 'easy',
      });
      expect(closestPreflight.resolvable).toBe(false);
      expect(closestPreflight.blockedCode).toBe(
        'DIFFICULTY_SELECTION_NOT_SUPPORTED',
      );

      const { service: ryoService } = build('read-your-opponent');
      const ryoHardPreflight = await ryoService.preflight({
        ...request('read-your-opponent'),
        difficulty: 'hard',
      });
      expect(ryoHardPreflight.resolvable).toBe(false);
      expect(ryoHardPreflight.blockedCode).toBe('INVALID_DIFFICULTY_SELECTION');
    });

    it('rejects batchGuidance exceeding 1,000 characters', async () => {
      const { service } = build('read-your-opponent');
      const overLimit = 'أ'.repeat(1001);

      const preflight = await service.preflight({
        ...request('read-your-opponent'),
        batchGuidance: overLimit,
      });
      expect(preflight.resolvable).toBe(false);
      expect(preflight.blockedCode).toBe('BATCH_GUIDANCE_TOO_LONG');

      await expect(
        service.submit({
          ...request('read-your-opponent'),
          batchGuidance: overLimit,
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'BATCH_GUIDANCE_TOO_LONG',
        },
      });
    });

    it('fails closed on submission when engine, provider, model, live flag, or pricing is incomplete', async () => {
      const jobs = { submit: jest.fn() };
      const contexts = {
        resolve: jest.fn(() => context('read-your-opponent')),
      };

      // 1. Engine disabled
      const disabledService = new EngineJobAdminService(
        {} as never,
        jobs as never,
        {
          snapshot: jest.fn(async () => budgetSnapshot),
          estimate: jest.fn(() => 1000),
        } as never,
        contexts as never,
        {} as never,
        makeConfig({ CONTENT_ENGINE_ENABLED: 'false' }),
      );
      await expect(
        disabledService.submit(request('read-your-opponent')),
      ).rejects.toMatchObject({
        response: { code: 'ENGINE_DISABLED' },
      });

      // 2. Live provider flag disabled for non-fake provider
      const liveDisabledService = new EngineJobAdminService(
        {} as never,
        jobs as never,
        {
          snapshot: jest.fn(async () => budgetSnapshot),
          estimate: jest.fn(() => 1000),
        } as never,
        contexts as never,
        {} as never,
        makeConfig({
          ENGINE_PROVIDER_NAME: 'openrouter',
          ENGINE_LIVE_PROVIDER_ENABLED: 'false',
        }),
      );
      await expect(
        liveDisabledService.submit(request('read-your-opponent')),
      ).rejects.toMatchObject({
        response: { code: 'LIVE_PROVIDER_DISABLED' },
      });

      // 3. Pricing missing
      const unpricedService = new EngineJobAdminService(
        {} as never,
        jobs as never,
        {
          snapshot: jest.fn(async () => budgetSnapshot),
          estimate: jest.fn(() => {
            throw new PricingUnavailableError('fake', 'fake-model');
          }),
        } as never,
        contexts as never,
        {} as never,
        makeConfig(),
      );
      await expect(
        unpricedService.submit(request('read-your-opponent')),
      ).rejects.toMatchObject({
        response: { code: 'PRICING_NOT_CONFIGURED' },
      });

      expect(jobs.submit).not.toHaveBeenCalled();
    });
  });

  describe('Exact-job execution and legacy job fail-closed provenance', () => {
    it('executes only the exact targeted jobId and attributes execution to the authenticated Admin', async () => {
      const { service: preflightService } = build('read-your-opponent');
      const plan = await preflightService.preflight(
        request('read-your-opponent'),
      );

      const jobs = {
        findById: jest.fn(async (id: string) =>
          id === 'job-target'
            ? {
                _id: 'job-target',
                status: 'queued',
                mechanicKey: 'read-your-opponent',
                worldKey: 'puzzles',
                scopeKey: 'wordplay-letters',
                targetCount: 3,
                cancellationRequested: false,
                generationSpec: plan.generationSpec,
              }
            : null,
        ),
      };
      const orchestrator = {
        runJob: jest.fn(async (jobId: string) => ({ jobId })),
        runNext: jest.fn(),
      };
      const service = new EngineJobAdminService(
        {} as never,
        jobs as never,
        {} as never,
        {} as never,
        orchestrator as never,
        makeConfig(),
      );

      const res = await service.runJob('job-target', {
        actorId: 'admin-99',
        actorEmail: 'admin99@akwaan.test',
      });

      expect(res).toEqual({ jobId: 'job-target', alreadyRunning: false });
      expect(orchestrator.runJob).toHaveBeenCalledWith(
        'job-target',
        'admin:admin-99',
        {
          actorId: 'admin-99',
          actorEmail: 'admin99@akwaan.test',
        },
      );
      expect(orchestrator.runNext).not.toHaveBeenCalled();
    });

    it('fails closed when attempting to execute a legacy job without complete generationSpec, while keeping status() readable', async () => {
      const legacyJob = {
        _id: 'legacy-job-1',
        status: 'queued',
        pipelineStage: 'queued',
        attempts: 0,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 3,
        cancellationRequested: false,
        awaitingReviewReason: null,
        lastError: null,
        // No generationSpec persisted on legacy record
      };
      const candidates = {
        aggregate: jest.fn(async () => []),
      };
      const jobs = {
        findById: jest.fn(async () => legacyJob),
      };
      const budget = {
        spentForJob: jest.fn(async () => ({
          spentMicros: 0,
          reservedMicros: 0,
          calls: 0,
        })),
      };
      const orchestrator = {
        runJob: jest.fn(),
      };
      const service = new EngineJobAdminService(
        candidates as never,
        jobs as never,
        budget as never,
        {} as never,
        orchestrator as never,
        makeConfig(),
      );

      const status = await service.status('legacy-job-1');
      expect(status).toMatchObject({
        jobId: 'legacy-job-1',
        status: 'queued',
        provenanceComplete: false,
        generationSpec: null,
      });

      await expect(
        service.runJob('legacy-job-1', {
          actorId: 'admin-1',
          actorEmail: 'admin1@akwaan.test',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'JOB_PROVENANCE_INSUFFICIENT',
        },
      });
      expect(orchestrator.runJob).not.toHaveBeenCalled();
    });
  });

  describe('Cost planning parity with execution (prompt composition, token limits, conditional judge allowance)', () => {
    it('computes preflight cost from the actual composed prompt and outputTokensPerCandidate, and omits judge cost when fact retriever is disabled while still validating qualityModel pricing', async () => {
      const estimateCalls: Array<{
        provider: string;
        model: string;
        callsExpected: number;
        expected: { promptTokens: number; maxOutputTokens: number };
      }> = [];
      const budget = {
        snapshot: jest.fn(async () => budgetSnapshot),
        estimate: jest.fn(
          (call: {
            provider: string;
            model: string;
            callsExpected: number;
            expected: { promptTokens: number; maxOutputTokens: number };
          }) => {
            estimateCalls.push(call);
            return (
              call.callsExpected *
              (call.expected.promptTokens + call.expected.maxOutputTokens)
            );
          },
        ),
        batchCapMicros: jest.fn(() => 100_000_000),
      };
      const contexts = {
        resolve: jest.fn(() => ({
          ...context('read-your-opponent'),
          global: 'GLOBAL RULES TEXT',
          mechanic: 'RYO MECHANIC SKILL TEXT',
          world: 'WORLD PROFILE TEXT',
          scope: 'SCOPE PROFILE TEXT',
          knowledge: 'SCOPE KNOWLEDGE TEXT',
          exemplars: 'EXEMPLAR TEXT',
        })),
      };
      const config = makeConfig({
        ENGINE_OUTPUT_TOKENS_PER_CANDIDATE: '950',
        ENGINE_QUALITY_MODEL: 'quality-judge-v1',
      });

      const serviceWithoutRetriever = new EngineJobAdminService(
        {} as never,
        {} as never,
        budget as never,
        contexts as never,
        {} as never,
        config,
      );

      const preflightWithoutGuidance = await serviceWithoutRetriever.preflight({
        ...request('read-your-opponent'),
        targetCount: 4,
      });

      expect(preflightWithoutGuidance.judgeEligible).toBe(false);
      expect(preflightWithoutGuidance.conditionalJudgeEstimatedMicros).toBe(0);
      expect(preflightWithoutGuidance.maxJudgeEstimatedMicros).toBeGreaterThan(
        0,
      );
      expect(preflightWithoutGuidance.estimatedMicros).toBe(
        preflightWithoutGuidance.generationEstimatedMicros,
      );

      // Verify exact token ceiling: 4 candidates * 950 tokens = 3800 maxOutputTokens for generation
      // and 4 candidates * 900 maxOutputTokens for quality judge pricing validation
      const genCall = estimateCalls.find(
        (c) =>
          c.model === 'fake-model' && c.expected.maxOutputTokens === 4 * 950,
      );
      const judgeCall = estimateCalls.find(
        (c) =>
          c.model === 'quality-judge-v1' &&
          c.callsExpected === 4 &&
          c.expected.maxOutputTokens === 900,
      );
      expect(genCall).toBeDefined();
      expect(judgeCall).toBeDefined();

      // Adding operator batchGuidance lengthens the composed prompt and increases generationPromptTokens & estimatedMicros
      const preflightWithGuidance = await serviceWithoutRetriever.preflight({
        ...request('read-your-opponent'),
        targetCount: 4,
        batchGuidance: 'Focus on classical Arabic poetry and literary figures.',
      });
      expect(preflightWithGuidance.generationEstimatedMicros).toBeGreaterThan(
        preflightWithoutGuidance.generationEstimatedMicros!,
      );
      expect(preflightWithGuidance.planDigest).not.toBe(
        preflightWithoutGuidance.planDigest,
      );

      // When FACT_EVIDENCE_RETRIEVER is bound, conditionalJudgeEstimatedMicros is included (1 call per candidate)
      const serviceWithRetriever = new EngineJobAdminService(
        {} as never,
        {} as never,
        budget as never,
        contexts as never,
        {} as never,
        config,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { retrieve: jest.fn() } as never,
      );

      const preflightWithRetriever = await serviceWithRetriever.preflight({
        ...request('read-your-opponent'),
        targetCount: 4,
      });

      expect(preflightWithRetriever.judgeEligible).toBe(true);
      expect(preflightWithRetriever.conditionalJudgeEstimatedMicros).toBe(
        preflightWithRetriever.maxJudgeEstimatedMicros,
      );
      expect(preflightWithRetriever.estimatedMicros).toBe(
        preflightWithRetriever.generationEstimatedMicros! +
          preflightWithRetriever.conditionalJudgeEstimatedMicros!,
      );
    });
  });

  describe('Read-only paginated job listing (listJobs)', () => {
    it('returns jobs ordered newest-first with candidate status counts, ledger spend, and nextCursor', async () => {
      const { service: preflightService } = build('read-your-opponent');
      const plan = await preflightService.preflight(
        request('read-your-opponent'),
      );

      const jobRows = [
        {
          _id: '671000000000000000000002',
          mechanicKey: 'read-your-opponent',
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          targetCount: 3,
          status: 'awaiting_review',
          pipelineStage: 'awaiting_review',
          attempts: 1,
          cancellationRequested: false,
          awaitingReviewReason: '3 of 3 candidates await human review',
          lastError: null,
          specVersion: 1,
          generationSpec: plan.generationSpec,
          planDigest: plan.planDigest,
          createdBy: 'admin-1',
          createdByEmail: 'admin1@akwaan.test',
          lastExecutedBy: 'admin-1',
          lastExecutedByEmail: 'admin1@akwaan.test',
          createdAt: new Date('2026-04-20T10:05:00.000Z'),
          updatedAt: new Date('2026-04-20T10:06:00.000Z'),
        },
        {
          _id: '671000000000000000000001',
          mechanicKey: 'closest',
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          targetCount: 2,
          status: 'queued',
          pipelineStage: 'pending',
          attempts: 0,
          cancellationRequested: false,
          awaitingReviewReason: null,
          lastError: null,
          specVersion: null,
          generationSpec: null,
          planDigest: null,
          createdBy: null,
          createdByEmail: null,
          lastExecutedBy: null,
          lastExecutedByEmail: null,
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-20T10:00:00.000Z'),
        },
      ];

      const jobs = {
        list: jest.fn(async () => ({
          items: jobRows,
          nextCursor: '671000000000000000000001',
        })),
      };
      const candidates = {
        aggregate: jest.fn(async () => [
          {
            _id: {
              jobId: '671000000000000000000002',
              status: 'awaiting_review',
            },
            count: 3,
          },
        ]),
      };
      const budget = {
        spentForJob: jest.fn(async (jobId: string) =>
          jobId === '671000000000000000000002'
            ? { spentMicros: 250_000, reservedMicros: 0, calls: 1 }
            : { spentMicros: 0, reservedMicros: 0, calls: 0 },
        ),
      };

      const service = new EngineJobAdminService(
        candidates as never,
        jobs as never,
        budget as never,
        {} as never,
        {} as never,
        makeConfig(),
      );

      const res = await service.listJobs({ limit: 2, worldKey: 'puzzles' });

      expect(jobs.list).toHaveBeenCalledWith({ limit: 2, worldKey: 'puzzles' });
      expect(res.nextCursor).toBe('671000000000000000000001');
      expect(res.items).toHaveLength(2);
      expect(res.items[0]).toMatchObject({
        jobId: '671000000000000000000002',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        targetCount: 3,
        status: 'awaiting_review',
        provenanceComplete: true,
        candidates: { awaiting_review: 3 },
        spentMicros: 250_000,
        spentSar: 0.25,
      });
      expect(res.items[1]).toMatchObject({
        jobId: '671000000000000000000001',
        mechanicKey: 'closest',
        status: 'queued',
        provenanceComplete: false,
        candidates: {},
        spentMicros: 0,
      });
    });
  });
});
