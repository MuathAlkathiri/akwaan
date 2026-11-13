import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  GenerationSpecValidationError,
  GenerationSpecification,
  buildGenerationSpecification,
  computeGenerationPlanSeed,
  computeGenerationRequestHash,
  freezeGenerationSpecification,
  isGenerationSpecificationComplete,
} from '../domain/generation-specification';
import { CanonicalFamilyCatalog } from '../domain/canonical-family.types';
import { CandidateGeneratorService } from './candidate-generator.service';
import { ContentEngineOrchestratorService } from './content-engine-orchestrator.service';
import { EngineJobAdminService } from './engine-job-admin.service';
import {
  QUALITY_JUDGE_DRAFT_TOKEN_ALLOWANCE,
  QUALITY_JUDGE_MAX_OUTPUT_TOKENS,
  QualityJudgeService,
  estimateQualityJudgePromptTokens,
} from './quality-judge.service';
import {
  EngineJobListQueryDto,
  EngineJobRequestDto,
} from '../presentation/content-engine-jobs.dto';
import {
  APPROVED_PLAN_CHECKPOINT_STAGE,
  GenerationJobService,
  SubmitJobInput,
  requestHashOf,
} from './generation-job.service';
import {
  GenerationPlan,
  GenerationPlannerService,
  computeGenerationPlanDigest,
} from './generation-planner.service';

/**
 * C-9 — Generation Plan Seed Parity.
 *
 * Preflight prices a plan, Submit approves it, Runtime executes it. All three
 * must see the same creative slots, or the estimate the Admin approved is not
 * the reservation the engine makes. The seed is derived from the generation
 * specification (job identity), and the approved plan is persisted at Submit.
 */

beforeEach(() => {
  jest
    .spyOn(
      EngineJobAdminService.prototype as any,
      'historicalInventoryComplete',
    )
    .mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

const WORLD = 'puzzles';
const SCOPE = 'wordplay-letters';
const MECHANIC = 'read-your-opponent';

const FAMILY_KEYS = [
  'anagram-rearrange',
  'plural-form',
  'palindrome-symmetry',
  'root-derivation',
  'rhyme-pair',
  'letter-count',
];

const catalog: CanonicalFamilyCatalog = {
  version: 1,
  worldKey: WORLD,
  scopeKey: SCOPE,
  digest: 'f'.repeat(64),
  structuredSources: ['profiles/puzzles/wordplay.md'],
  families: FAMILY_KEYS.map((familyKey, idx) => ({
    familyKey,
    name: `عائلة ${idx + 1}`,
    description: `وصف العائلة ${familyKey}`,
    playerSolve: `حل العائلة ${familyKey}`,
    scopeKey: SCOPE,
    worldKey: WORLD,
    modality: 'letter-permutation',
    source: 'profiles/puzzles/wordplay.md',
    mechanicFit: { [MECHANIC]: idx % 2 === 0 ? 'EXCELLENT' : 'GOOD' },
  })),
} as CanonicalFamilyCatalog;

const coverageReport = (counts: Record<string, number>) => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    worldKey: WORLD,
    scopeKey: SCOPE,
    totals: {
      operationalApproved: total,
      humanApproved: total,
      approvalUnknown: 0,
      uniquePlayable: total,
      uniquePending: 0,
      uniqueUnclassified: 0,
      uniqueApproved: total,
    },
    families: Object.fromEntries(
      Object.entries(counts).map(([familyKey, humanApprovedCount]) => [
        familyKey,
        { familyKey, humanApprovedCount },
      ]),
    ),
    diagnostics: { warnings: [] },
  };
};

const resolvedCtx = {
  mechanicKey: MECHANIC,
  worldKey: WORLD,
  scopeKey: SCOPE,
  global: 'GLOBAL RULES TEXT',
  mechanic: 'RYO MECHANIC SKILL TEXT',
  world: 'WORLD PROFILE TEXT',
  scope: 'SCOPE PROFILE TEXT',
  knowledge: 'SCOPE KNOWLEDGE TEXT',
  exemplars: 'EXEMPLAR TEXT',
  historicalExemplars: '',
  exemplarDiagnostics: [],
  contextHash: 'a'.repeat(64),
  effectiveRules: {
    version: 1 as const,
    digest: 'b'.repeat(64),
    rules: [],
    resolved: [],
    conflicts: [],
    structuredSources: [],
  },
};

const makeConfig = () =>
  ({
    get: jest.fn(
      (key: string) =>
        ({
          CONTENT_ENGINE_ENABLED: 'true',
          ENGINE_PROVIDER_NAME: 'fake',
          ENGINE_GENERATION_MODEL: 'fake-model',
          ENGINE_QUALITY_MODEL: 'quality-judge-v1',
          ENGINE_OUTPUT_TOKENS_PER_CANDIDATE: '800',
        })[key],
    ),
  }) as unknown as ConfigService;

/** Price = 1 micro per expected token, so estimates are exact token counts. */
const estimateFn = (call: {
  callsExpected: number;
  expected: { promptTokens: number; maxOutputTokens: number };
}) =>
  call.callsExpected *
  (call.expected.promptTokens + call.expected.maxOutputTokens);

const budgetSnapshot = {
  periodKey: '2026-11',
  capMicros: 100_000_000,
  spentMicros: 0,
  reservedMicros: 0,
  availableMicros: 100_000_000,
};

const TARGET = 5;

const ryoRequest = (overrides: Record<string, unknown> = {}) => ({
  mechanicKey: MECHANIC,
  worldKey: WORLD,
  scopeKey: SCOPE,
  targetCount: TARGET,
  ...overrides,
});

/** Admin service wired to the real planner, with mutable coverage. */
const buildAdmin = (opts: { catalogThrows?: boolean } = {}) => {
  const state = {
    coverage: coverageReport({ 'anagram-rearrange': 3, 'plural-form': 1 }),
  };
  const contexts = {
    resolve: jest.fn(() => resolvedCtx),
    resolveCanonicalFamiliesForScope: jest.fn(() => {
      if (opts.catalogThrows) {
        throw new Error('FAMILY_CATALOG_MALFORMED: unparsable family block');
      }
      return catalog;
    }),
  };
  const historicalCoverage = {
    getCoverage: jest.fn(async () => state.coverage),
  };
  const budget = {
    snapshot: jest.fn(async () => budgetSnapshot),
    estimate: jest.fn(estimateFn),
    batchCapMicros: jest.fn(() => 100_000_000),
  };
  const jobs = {
    submit: jest.fn<
      Promise<{ jobId: string; created: boolean }>,
      [SubmitJobInput]
    >(async () => ({
      jobId: 'job-c9-parity',
      created: true,
    })),
  };
  const service = new EngineJobAdminService(
    {} as never,
    jobs as never,
    budget as never,
    contexts as never,
    {} as never,
    makeConfig(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    historicalCoverage as never,
  );
  return { service, jobs, budget, contexts, historicalCoverage, state };
};

const slotSignature = (plan: GenerationPlan | undefined) =>
  (plan?.slots ?? [])
    .map((s) => `${s.familyKey}/${s.difficulty}/${s.mode}`)
    .join('|');

/** Orchestrator harness that stops observing at generation. */
const buildOrchestrator = (opts: {
  storedJob?: Record<string, unknown> | null;
  planner?: GenerationPlannerService;
}) => {
  const checkpoint = jest.fn(async () => undefined);
  const awaitReview = jest.fn(async () => undefined);
  const generate = jest.fn(async () => []);
  const orchestrator = new ContentEngineOrchestratorService(
    {
      find: () => ({
        sort: () => ({ lean: () => ({ exec: async () => [] }) }),
      }),
    } as never,
    {
      findById: async () => opts.storedJob ?? null,
      checkpoint,
      awaitReview,
      releaseForRetry: jest.fn(),
      holdsLease: async () => true,
      isCancellationRequested: async () => false,
    } as never,
    { hasLedgerEntry: async () => false } as never,
    { resolve: () => resolvedCtx } as never,
    { generate } as never,
    {
      createSession: () => undefined,
      loadHistoricalScope: async () => ({ status: 'COMPLETE' }),
      beginBatch: jest.fn(),
      screen: jest.fn(),
    } as never,
    { verify: jest.fn() } as never,
    { evaluate: jest.fn() } as never,
    { judge: jest.fn() } as never,
    opts.planner,
  );
  return { orchestrator, checkpoint, awaitReview, generate };
};

const leasedJob = (spec: GenerationSpecification, jobId = 'job-c9-parity') => ({
  jobId,
  leaseEpoch: 1,
  attempts: 1,
  mechanicKey: MECHANIC,
  worldKey: WORLD,
  scopeKey: SCOPE,
  targetCount: spec.targetCount,
  generationSpec: spec,
});

/** Re-digests a plan after a field change, so only the targeted guard fires. */
const redigest = (plan: GenerationPlan): GenerationPlan => ({
  ...plan,
  digest: computeGenerationPlanDigest(plan),
});

describe('C-9 Generation Plan Seed Parity', () => {
  describe('seed identity', () => {
    it('derives one stable seed per specification, bound to job identity', async () => {
      const { service } = buildAdmin();
      const preflight = await service.preflight(ryoRequest());
      const spec = preflight.generationSpec!;

      const seed = computeGenerationPlanSeed(spec);
      expect(seed).toBe(computeGenerationPlanSeed({ ...spec }));
      // Same canonical payload as requestHash: unique exactly when the job is.
      expect(seed).toBe(`plan-seed:v1:${computeGenerationRequestHash(spec)}`);
      expect(preflight.generationPlan!.seed).toBe(seed);

      expect(
        computeGenerationPlanSeed({ ...spec, batchGuidance: 'Batch 2' }),
      ).not.toBe(seed);
      // Not the static fallback every batch in this Scope used to share.
      expect(seed).not.toContain(`${WORLD}:${SCOPE}:${MECHANIC}`);
    });
  });

  describe('Preflight → Submit → Runtime parity', () => {
    it('Runtime re-planning from the spec allocates exactly the Preflight plan, and reserves exactly the Preflight estimate', async () => {
      const { service, contexts, historicalCoverage } = buildAdmin();
      const preflight = await service.preflight(ryoRequest());
      const spec = preflight.generationSpec!;
      const approved = preflight.generationPlan!;
      expect(approved.slots).toHaveLength(TARGET);

      const submitted = await service.submit({
        ...ryoRequest(),
        planDigest: preflight.planDigest,
      });
      expect(submitted.planDigest).toBe(preflight.planDigest);

      // No persisted plan: Runtime plans for itself, with the real planner and
      // the same catalog/coverage. The spec-derived seed must reproduce it.
      const planner = new GenerationPlannerService(
        contexts as never,
        historicalCoverage as never,
      );
      const plannerSpy = jest.spyOn(planner, 'planWithResolvedContext');
      const { orchestrator, generate, awaitReview } = buildOrchestrator({
        planner,
      });
      await orchestrator.run(leasedJob(spec) as never);

      expect(awaitReview).not.toHaveBeenCalled();
      expect(plannerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ seed: computeGenerationPlanSeed(spec) }),
      );
      const runtimePlan = (
        generate.mock.calls[0] as unknown as [
          { generationPlan: GenerationPlan },
        ]
      )[0].generationPlan;
      expect(runtimePlan.digest).toBe(approved.digest);
      expect(runtimePlan.slots).toEqual(approved.slots);

      // Budget parity: the runtime reservation is the approved estimate.
      const reserve = jest.fn(async () => ({ reservedMicros: 0 }));
      const generator = new CandidateGeneratorService(
        { updateOne: jest.fn(() => ({ exec: async () => ({}) })) } as never,
        { holdsLease: jest.fn(async () => true) } as never,
        {
          estimate: jest.fn(estimateFn),
          reserve,
          settle: jest.fn(async () => undefined),
        } as never,
        makeConfig(),
        {
          generateText: jest.fn(async () => {
            throw new Error('provider not under test');
          }),
        } as never,
      );
      await expect(
        generator.generate({
          jobId: 'job-c9-parity',
          leaseEpoch: 1,
          attempt: 1,
          context: resolvedCtx as never,
          count: TARGET,
          generationPlan: runtimePlan,
          generationSpec: spec,
        }),
      ).rejects.toThrow();
      expect(reserve).toHaveBeenCalledTimes(1);
      const reserved = (
        reserve.mock.calls[0] as unknown as [
          { expected: { promptTokens: number; maxOutputTokens: number } },
        ]
      )[0].expected;
      expect(reserved.promptTokens + reserved.maxOutputTokens).toBe(
        preflight.generationEstimatedMicros,
      );
    });

    it('the pre-C-9 seeds (static fallback, jobId) would not have reproduced the Preflight plan', async () => {
      const { service, contexts, historicalCoverage } = buildAdmin();
      const preflight = await service.preflight(ryoRequest());
      const planner = new GenerationPlannerService(
        contexts as never,
        historicalCoverage as never,
      );
      const base = {
        worldKey: WORLD,
        scopeKey: SCOPE,
        mechanicKey: MECHANIC,
        count: TARGET,
        difficulty: preflight.generationSpec!.difficulty,
      };
      const staticFallback = await planner.planWithResolvedContext(base);
      const jobIdSeeded = await planner.planWithResolvedContext({
        ...base,
        seed: 'job-c9-parity',
      });
      // Guard that this fixture is seed-sensitive, so the parity test above
      // would have caught the regression.
      expect(slotSignature(staticFallback)).not.toBe(
        slotSignature(jobIdSeeded),
      );
      expect(
        [slotSignature(staticFallback), slotSignature(jobIdSeeded)].filter(
          (sig) => sig === slotSignature(preflight.generationPlan),
        ).length,
      ).toBeLessThan(2);
    });
  });

  describe('approved plan persistence', () => {
    it('Submit hands the exact Preflight plan to job creation', async () => {
      const { service, jobs } = buildAdmin();
      const preflight = await service.preflight(ryoRequest());
      await service.submit({
        ...ryoRequest(),
        planDigest: preflight.planDigest,
      });

      const input = jobs.submit.mock.calls[0][0];
      expect(input.approvedPlan).toEqual(preflight.generationPlan);
      expect(input.planDigest).toBe(preflight.planDigest);
    });

    it('records the approved plan in the pending checkpoint without changing request identity or idempotency', async () => {
      const { service } = buildAdmin();
      const preflight = await service.preflight(ryoRequest());
      const plan = preflight.generationPlan!;
      const spec = preflight.generationSpec!;

      const db = new Map<string, Record<string, unknown>>();
      const model = {
        findOneAndUpdate: jest.fn(
          (
            query: { requestHash: string },
            update: { $setOnInsert: Record<string, unknown> },
          ) => ({
            lean: () => ({
              exec: async () => {
                const existing = db.get(query.requestHash);
                if (existing) return existing;
                db.set(query.requestHash, {
                  _id: `job-${db.size + 1}`,
                  ...update.$setOnInsert,
                });
                return null;
              },
            }),
          }),
        ),
        findOne: jest.fn((query: { requestHash: string }) => ({
          lean: () => ({ exec: async () => db.get(query.requestHash) }),
        })),
      };
      const jobService = new GenerationJobService(
        model as never,
        new ConfigService({ CONTENT_ENGINE_ENABLED: 'true' }),
      );
      const base: SubmitJobInput = {
        mechanicKey: MECHANIC,
        worldKey: WORLD,
        scopeKey: SCOPE,
        targetCount: TARGET,
        contextRevision: spec.contextHash,
        generationSpec: spec,
        planDigest: preflight.planDigest,
      };

      expect(requestHashOf({ ...base, approvedPlan: plan })).toBe(
        requestHashOf(base),
      );

      const first = await jobService.submit({ ...base, approvedPlan: plan });
      expect(first.created).toBe(true);
      const stored = db.get(requestHashOf(base))!;
      const pending = (
        stored.stageCheckpoints as Record<string, Record<string, unknown>>
      )[APPROVED_PLAN_CHECKPOINT_STAGE];
      expect(pending.approvedPlan).toEqual(plan);
      expect(pending.generationPlanDigest).toBe(plan.digest);
      expect(pending.planSeed).toBe(computeGenerationPlanSeed(spec));

      // A repeated click is the same job; the first approval is kept.
      const other = redigest({ ...plan, slots: [...plan.slots!].reverse() });
      const again = await jobService.submit({ ...base, approvedPlan: other });
      expect(again.created).toBe(false);
      expect(again.jobId).toBe(first.jobId);
      expect(
        (stored.stageCheckpoints as Record<string, Record<string, unknown>>)[
          APPROVED_PLAN_CHECKPOINT_STAGE
        ].approvedPlan,
      ).toEqual(plan);
    });

    it('a degraded V1 fallback plan is priced but never persisted as the approved plan', async () => {
      const { service, jobs } = buildAdmin({ catalogThrows: true });
      const preflight = await service.preflight(ryoRequest());
      expect(preflight.generationPlan!.slots).toBeUndefined();
      await service.submit({
        ...ryoRequest(),
        planDigest: preflight.planDigest,
      });
      expect(jobs.submit.mock.calls[0][0].approvedPlan).toBeUndefined();
    });
  });

  describe('drift guards', () => {
    it('Submit rejects PREFLIGHT_PLAN_DRIFT when the plan moved after Preflight, before any job is created', async () => {
      const { service, jobs, state } = buildAdmin();
      const preflight = await service.preflight(ryoRequest());

      state.coverage = coverageReport({
        'anagram-rearrange': 40,
        'plural-form': 40,
        'palindrome-symmetry': 2,
      });

      await expect(
        service.submit({ ...ryoRequest(), planDigest: preflight.planDigest }),
      ).rejects.toMatchObject({ response: { code: 'PREFLIGHT_PLAN_DRIFT' } });
      expect(jobs.submit).not.toHaveBeenCalled();

      // A fresh Preflight against the new coverage is accepted.
      const refreshed = await service.preflight(ryoRequest());
      expect(refreshed.planDigest).not.toBe(preflight.planDigest);
      await service.submit({
        ...ryoRequest(),
        planDigest: refreshed.planDigest,
      });
      expect(jobs.submit.mock.calls[0][0].approvedPlan!.digest).toBe(
        refreshed.generationPlan!.digest,
      );
    });

    it('the plan digest itself is bound: drift is caught even when the estimate is unchanged', async () => {
      const { service, jobs, state } = buildAdmin();
      const preflight = await service.preflight(ryoRequest());

      // Totals enter coverageDigest but not slot weights: the plan's
      // provenance changes while its slots and price stay identical.
      state.coverage = {
        ...state.coverage,
        totals: { ...state.coverage.totals, humanApproved: 999 },
      };
      const moved = await service.preflight(ryoRequest());
      expect(moved.generationPlan!.slots).toEqual(
        preflight.generationPlan!.slots,
      );
      expect(moved.estimatedMicros).toBe(preflight.estimatedMicros);
      expect(moved.generationPlan!.digest).not.toBe(
        preflight.generationPlan!.digest,
      );

      await expect(
        service.submit({ ...ryoRequest(), planDigest: preflight.planDigest }),
      ).rejects.toMatchObject({ response: { code: 'PREFLIGHT_PLAN_DRIFT' } });
      expect(jobs.submit).not.toHaveBeenCalled();
    });

    it.each([
      [
        'tampered slot',
        (p: GenerationPlan) => ({
          ...p,
          slots: [
            { ...p.slots![0], familyKey: 'forged' },
            ...p.slots!.slice(1),
          ],
        }),
        'APPROVED_PLAN_DIGEST_MISMATCH',
      ],
      [
        'foreign batch seed',
        (p: GenerationPlan) => redigest({ ...p, seed: 'plan-seed:v1:other' }),
        'APPROVED_PLAN_SEED_MISMATCH',
      ],
      [
        'wrong target',
        (p: GenerationPlan) => redigest({ ...p, count: p.count + 1 }),
        'APPROVED_PLAN_TARGET_MISMATCH',
      ],
      [
        'missing digest',
        (p: GenerationPlan) => ({ ...p, digest: '' }),
        'APPROVED_PLAN_MALFORMED',
      ],
    ])(
      'Runtime fails closed on an approved plan with a %s',
      async (_label, corrupt, reason) => {
        const { service } = buildAdmin();
        const preflight = await service.preflight(ryoRequest());
        const spec = preflight.generationSpec!;
        const planWithResolvedContext = jest.fn();
        const { orchestrator, awaitReview, generate } = buildOrchestrator({
          storedJob: {
            stageCheckpoints: {
              [APPROVED_PLAN_CHECKPOINT_STAGE]: {
                approvedPlan: corrupt(preflight.generationPlan!),
              },
            },
          },
          planner: { planWithResolvedContext } as never,
        });
        await orchestrator.run(leasedJob(spec) as never);

        expect(awaitReview).toHaveBeenCalledWith(
          expect.objectContaining({
            reason: expect.stringMatching(new RegExp(`^${reason}:`)),
          }),
        );
        expect(planWithResolvedContext).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
      },
    );

    it('Runtime fails closed on a pinned plan that records another batch seed', async () => {
      const { service } = buildAdmin();
      const preflight = await service.preflight(ryoRequest());
      const foreign = redigest({
        ...preflight.generationPlan!,
        seed: 'plan-seed:v1:other',
      });
      const { orchestrator, awaitReview, generate } = buildOrchestrator({
        storedJob: {
          stageCheckpoints: { context_resolved: { pinnedPlan: foreign } },
        },
      });
      await orchestrator.run(leasedJob(preflight.generationSpec!) as never);
      expect(awaitReview).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: expect.stringMatching(/^PINNED_PLAN_SEED_MISMATCH:/),
        }),
      );
      expect(generate).not.toHaveBeenCalled();
    });
  });

  describe('runtime execution and recovery', () => {
    it('executes the approved plan without re-planning even after coverage moved, pins it, and keeps it across a retry', async () => {
      const { service, jobs, state } = buildAdmin();
      const preflight = await service.preflight(ryoRequest());
      await service.submit({
        ...ryoRequest(),
        planDigest: preflight.planDigest,
      });
      const approvedPlan = jobs.submit.mock.calls[0][0].approvedPlan!;
      const spec = preflight.generationSpec!;

      // Coverage moves between Submit and the worker picking the job up.
      state.coverage = coverageReport({ 'anagram-rearrange': 90 });

      const planWithResolvedContext = jest.fn();
      const pending = { [APPROVED_PLAN_CHECKPOINT_STAGE]: { approvedPlan } };
      const first = buildOrchestrator({
        storedJob: { stageCheckpoints: pending },
        planner: { planWithResolvedContext } as never,
      });
      await first.orchestrator.run(leasedJob(spec) as never);

      expect(first.awaitReview).not.toHaveBeenCalled();
      expect(planWithResolvedContext).not.toHaveBeenCalled();
      expect(first.checkpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: 'context_resolved',
          details: expect.objectContaining({
            pinnedPlan: approvedPlan,
            planDigest: preflight.generationPlan!.digest,
          }),
        }),
      );
      expect(first.generate).toHaveBeenCalledWith(
        expect.objectContaining({ generationPlan: approvedPlan }),
      );

      // Retry after a lost lease: the pinned copy wins, nothing is re-rolled.
      const retry = buildOrchestrator({
        storedJob: {
          stageCheckpoints: {
            ...pending,
            context_resolved: { pinnedPlan: approvedPlan },
          },
        },
        planner: { planWithResolvedContext } as never,
      });
      await retry.orchestrator.run({
        ...leasedJob(spec),
        leaseEpoch: 2,
        attempts: 2,
      } as never);
      expect(planWithResolvedContext).not.toHaveBeenCalled();
      expect(retry.generate).toHaveBeenCalledWith(
        expect.objectContaining({ generationPlan: approvedPlan }),
      );
    });

    it('a pinned plan from before C-9 (no recorded seed) is still honoured', async () => {
      const { service } = buildAdmin();
      const preflight = await service.preflight(ryoRequest());
      const unseeded: GenerationPlan = { ...preflight.generationPlan! };
      delete unseeded.seed;
      const legacyPinned = redigest(unseeded);
      const { orchestrator, awaitReview, generate } = buildOrchestrator({
        storedJob: {
          stageCheckpoints: { context_resolved: { pinnedPlan: legacyPinned } },
        },
      });
      await orchestrator.run(leasedJob(preflight.generationSpec!) as never);
      expect(awaitReview).not.toHaveBeenCalled();
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({ generationPlan: legacyPinned }),
      );
    });
  });

  describe('cross-batch diversity', () => {
    it('independent batches in one Scope get distinct seeds and diverse slots; a repeat is identical', async () => {
      const { service } = buildAdmin();
      const batches = await Promise.all(
        ['A', 'B', 'C', 'D', 'E', 'F'].map((tag) =>
          service.preflight(ryoRequest({ batchGuidance: `Batch ${tag}` })),
        ),
      );
      const seeds = new Set(batches.map((b) => b.generationPlan!.seed));
      expect(seeds.size).toBe(batches.length);
      const signatures = new Set(
        batches.map((b) => slotSignature(b.generationPlan)),
      );
      expect(signatures.size).toBeGreaterThan(1);

      const repeat = await service.preflight(
        ryoRequest({ batchGuidance: 'Batch A' }),
      );
      expect(repeat.generationPlan!.digest).toBe(
        batches[0].generationPlan!.digest,
      );
      expect(repeat.planDigest).toBe(batches[0].planDigest);
    });
  });

  describe('independent batch identity (batchIntentId)', () => {
    const INTENT_A = '3f1c9a7e-2b4d-4c8e-9f10-5a6b7c8d9e0f';
    const INTENT_B = 'b7a1d2c3-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

    /** The canonical payload exactly as it was hashed before batch intents. */
    const historicalRequestHash = (spec: GenerationSpecification) =>
      createHash('sha256')
        .update(
          JSON.stringify({
            specVersion: spec.specVersion,
            worldKey: spec.worldKey,
            scopeKey: spec.scopeKey,
            mechanicKey: spec.mechanicKey,
            answerMode: spec.answerMode,
            targetCount: spec.targetCount,
            difficulty: spec.difficulty,
            ryoDifficultyTargets: spec.ryoDifficultyTargets
              ? {
                  easy: spec.ryoDifficultyTargets.easy,
                  medium: spec.ryoDifficultyTargets.medium,
                  relativelyDifficult:
                    spec.ryoDifficultyTargets.relativelyDifficult,
                }
              : null,
            batchGuidance: spec.batchGuidance,
            contextHash: spec.contextHash,
            ruleSetDigest: spec.ruleSetDigest,
            promptVersion: spec.promptVersion,
            provider: spec.provider,
            generationModel: spec.generationModel,
            qualityModel: spec.qualityModel,
            temperature: spec.temperature,
            omitTemperature: spec.omitTemperature,
            reasoningEffort: spec.reasoningEffort,
            outputTokensPerCandidate: spec.outputTokensPerCandidate,
            maxOutputTokens: spec.maxOutputTokens,
          }),
          'utf8',
        )
        .digest('hex');

    const specFor = (batchIntentId?: unknown) =>
      buildGenerationSpecification({
        config: makeConfig(),
        context: resolvedCtx,
        targetCount: TARGET,
        difficulty: 'mixed',
        batchIntentId,
      });

    it('the API accepts a well-formed intent and rejects a malformed one under the production ValidationPipe', async () => {
      // Same options as configureApiApplication: unknown fields are refused,
      // so the DTO must declare batchIntentId or every intent would 400.
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });
      const meta = { type: 'body' as const, metatype: EngineJobRequestDto };
      const body = { ...ryoRequest(), planDigest: 'd'.repeat(64) };
      await expect(
        pipe.transform({ ...body, batchIntentId: INTENT_A }, meta),
      ).resolves.toMatchObject({ batchIntentId: INTENT_A });
      await expect(pipe.transform(body, meta)).resolves.not.toHaveProperty(
        'batchIntentId',
      );
      await expect(
        pipe.transform({ ...body, batchIntentId: 'bad intent' }, meta),
      ).rejects.toThrow();
    });

    it('leaves every intent-less specification on its historical request hash, seed and shape', () => {
      const legacy = specFor();
      expect('batchIntentId' in legacy).toBe(false);
      expect(computeGenerationRequestHash(legacy)).toBe(
        historicalRequestHash(legacy),
      );
      expect(computeGenerationPlanSeed(legacy)).toBe(
        `plan-seed:v1:${historicalRequestHash(legacy)}`,
      );
      // A persisted legacy spec, as read back from MongoDB, still validates.
      expect(isGenerationSpecificationComplete({ ...legacy })).toBe(true);
      expect(
        isGenerationSpecificationComplete({ ...legacy, batchIntentId: null }),
      ).toBe(true);
      expect(
        computeGenerationRequestHash({
          ...legacy,
          batchIntentId: null,
        } as unknown as GenerationSpecification),
      ).toBe(historicalRequestHash(legacy));
    });

    it('makes the intent part of identity: same intent → same hash and seed; different intent → different', () => {
      const a = specFor(INTENT_A);
      expect(a.batchIntentId).toBe(INTENT_A);
      expect(freezeGenerationSpecification(a).batchIntentId).toBe(INTENT_A);
      expect(isGenerationSpecificationComplete(a)).toBe(true);

      expect(computeGenerationRequestHash(specFor(INTENT_A))).toBe(
        computeGenerationRequestHash(a),
      );
      const hashes = new Set(
        [specFor(), a, specFor(INTENT_B)].map(computeGenerationRequestHash),
      );
      expect(hashes.size).toBe(3);
      const seeds = new Set(
        [specFor(), a, specFor(INTENT_B)].map(computeGenerationPlanSeed),
      );
      expect(seeds.size).toBe(3);
    });

    it.each([['short'], ['has space in it'], ['../../etc/passwd'], [42], ['']])(
      'refuses a malformed intent %p rather than silently dropping it',
      (bad) => {
        expect(() => specFor(bad)).toThrow(GenerationSpecValidationError);
        expect(() => specFor(bad)).toThrow(/BATCH_INTENT_INVALID/);
        expect(
          isGenerationSpecificationComplete({
            ...specFor(),
            batchIntentId: bad,
          }),
        ).toBe(false);
      },
    );

    it('Preflight: identical requests with different intents get different seeds, slots provenance and plan digests', async () => {
      const { service } = buildAdmin();
      const a = await service.preflight(
        ryoRequest({ batchIntentId: INTENT_A }),
      );
      const a2 = await service.preflight(
        ryoRequest({ batchIntentId: INTENT_A }),
      );
      const b = await service.preflight(
        ryoRequest({ batchIntentId: INTENT_B }),
      );

      expect(a.generationSpec!.batchIntentId).toBe(INTENT_A);
      expect(a.generationPlan!.seed).toBe(
        computeGenerationPlanSeed(a.generationSpec!),
      );
      // Re-running Preflight for the same intent is stable.
      expect(a2.planDigest).toBe(a.planDigest);
      expect(a2.generationPlan!.digest).toBe(a.generationPlan!.digest);
      // A different intent is a different batch.
      expect(b.generationPlan!.seed).not.toBe(a.generationPlan!.seed);
      expect(b.generationPlan!.digest).not.toBe(a.generationPlan!.digest);
      expect(b.planDigest).not.toBe(a.planDigest);
    });

    it('Preflight reports a malformed intent as a diagnostic; Submit rejects it', async () => {
      const { service, jobs } = buildAdmin();
      const preflight = await service.preflight(
        ryoRequest({ batchIntentId: 'bad intent' }),
      );
      expect(preflight.resolvable).toBe(false);
      expect(preflight.blockedCode).toBe('BATCH_INTENT_INVALID');
      await expect(
        service.submit({
          ...ryoRequest({ batchIntentId: 'bad intent' }),
          planDigest: 'x'.repeat(64),
        }),
      ).rejects.toMatchObject({ response: { code: 'BATCH_INTENT_INVALID' } });
      expect(jobs.submit).not.toHaveBeenCalled();
    });

    it('Submit carries the intent into the persisted spec and approved plan, and refuses another intent’s planDigest', async () => {
      const { service, jobs } = buildAdmin();
      const a = await service.preflight(
        ryoRequest({ batchIntentId: INTENT_A }),
      );

      await expect(
        service.submit({
          ...ryoRequest({ batchIntentId: INTENT_B }),
          planDigest: a.planDigest,
        }),
      ).rejects.toMatchObject({ response: { code: 'PREFLIGHT_PLAN_DRIFT' } });
      expect(jobs.submit).not.toHaveBeenCalled();

      await service.submit({
        ...ryoRequest({ batchIntentId: INTENT_A }),
        planDigest: a.planDigest,
      });
      const input = jobs.submit.mock.calls[0][0];
      expect(input.generationSpec!.batchIntentId).toBe(INTENT_A);
      expect(input.approvedPlan).toEqual(a.generationPlan);
      expect(input.approvedPlan!.seed).toBe(
        computeGenerationPlanSeed(input.generationSpec!),
      );
    });

    it('job identity: same intent dedupes, different intents create independent jobs, no intent keeps legacy dedupe', async () => {
      const db = new Map<string, Record<string, unknown>>();
      const model = {
        findOneAndUpdate: jest.fn(
          (
            query: { requestHash: string },
            update: { $setOnInsert: Record<string, unknown> },
          ) => ({
            lean: () => ({
              exec: async () => {
                const existing = db.get(query.requestHash);
                if (existing) return existing;
                db.set(query.requestHash, {
                  _id: `job-${db.size + 1}`,
                  ...update.$setOnInsert,
                });
                return null;
              },
            }),
          }),
        ),
        findOne: jest.fn((query: { requestHash: string }) => ({
          lean: () => ({ exec: async () => db.get(query.requestHash) }),
        })),
      };
      const jobService = new GenerationJobService(
        model as never,
        new ConfigService({ CONTENT_ENGINE_ENABLED: 'true' }),
      );
      const submit = (spec: GenerationSpecification) =>
        jobService.submit({
          mechanicKey: MECHANIC,
          worldKey: WORLD,
          scopeKey: SCOPE,
          targetCount: TARGET,
          contextRevision: spec.contextHash,
          generationSpec: spec,
        });

      const a1 = await submit(specFor(INTENT_A));
      const a2 = await submit(specFor(INTENT_A));
      const b = await submit(specFor(INTENT_B));
      const legacy1 = await submit(specFor());
      const legacy2 = await submit(specFor());

      expect(a1.created).toBe(true);
      expect(a2).toMatchObject({ created: false, jobId: a1.jobId });
      expect(b.created).toBe(true);
      expect(b.jobId).not.toBe(a1.jobId);
      expect(legacy1.created).toBe(true);
      expect(legacy2).toMatchObject({ created: false, jobId: legacy1.jobId });
      expect(db.size).toBe(3);
      expect(a2.generationSpec!.batchIntentId).toBe(INTENT_A);
      expect(
        (
          db.get(computeGenerationRequestHash(specFor()))!
            .generationSpec as GenerationSpecification
        ).batchIntentId,
      ).toBeUndefined();
    });

    it('job history can be looked up by exact intent, so a lost Submit is reconcilable', async () => {
      const filters: Array<Record<string, unknown>> = [];
      const model = {
        find: jest.fn((filter: Record<string, unknown>) => {
          filters.push(filter);
          return {
            sort: () => ({
              limit: () => ({ lean: () => ({ exec: async () => [] }) }),
            }),
          };
        }),
      };
      const jobService = new GenerationJobService(
        model as never,
        new ConfigService({ CONTENT_ENGINE_ENABLED: 'true' }),
      );

      await jobService.list({ batchIntentId: INTENT_A, limit: 1 });
      expect(filters[0]).toEqual({ 'generationSpec.batchIntentId': INTENT_A });
      // Without the parameter the listing is unchanged.
      await jobService.list({ limit: 1 });
      expect(filters[1]).toEqual({});
      await expect(
        jobService.list({ batchIntentId: 'bad intent' }),
      ).rejects.toMatchObject({ response: { code: 'BATCH_INTENT_INVALID' } });

      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });
      const meta = { type: 'query' as const, metatype: EngineJobListQueryDto };
      await expect(
        pipe.transform({ batchIntentId: INTENT_A, limit: '1' }, meta),
      ).resolves.toMatchObject({ batchIntentId: INTENT_A, limit: 1 });
      await expect(
        pipe.transform({ batchIntentId: 'bad intent' }, meta),
      ).rejects.toThrow();
    });

    it('Runtime: a persisted intent-bearing spec passes provenance and seeds re-planning with the intent seed', async () => {
      const { service, contexts, historicalCoverage } = buildAdmin();
      const a = await service.preflight(
        ryoRequest({ batchIntentId: INTENT_A }),
      );
      const spec = a.generationSpec!;
      const planner = new GenerationPlannerService(
        contexts as never,
        historicalCoverage as never,
      );
      const plannerSpy = jest.spyOn(planner, 'planWithResolvedContext');
      const { orchestrator, generate, awaitReview } = buildOrchestrator({
        planner,
      });
      await orchestrator.run(leasedJob(spec) as never);

      expect(awaitReview).not.toHaveBeenCalled();
      expect(plannerSpy).toHaveBeenCalledWith(
        expect.objectContaining({ seed: computeGenerationPlanSeed(spec) }),
      );
      const runtimePlan = (
        generate.mock.calls[0] as unknown as [
          { generationPlan: GenerationPlan },
        ]
      )[0].generationPlan;
      expect(runtimePlan.digest).toBe(a.generationPlan!.digest);
    });
  });

  describe('Quality Judge cost parity (Preflight allowance vs Runtime reservation)', () => {
    const judgeConfig = () =>
      ({
        get: jest.fn(
          (key: string) =>
            ({
              CONTENT_ENGINE_ENABLED: 'true',
              ENGINE_PROVIDER_NAME: 'fake',
              ENGINE_GENERATION_MODEL: 'fake-model',
              ENGINE_QUALITY_MODEL: 'quality-judge-v1',
              ENGINE_OUTPUT_TOKENS_PER_CANDIDATE: '800',
              ENGINE_BATCH_SIZE: '20',
            })[key],
        ),
      }) as unknown as ConfigService;

    const arabic = (seed: string, length: number) =>
      `${seed} `.repeat(Math.ceil(length / (seed.length + 1))).slice(0, length);

    /** Arabic RYO model output; `promptLength`/`labelLength` size the draft. */
    const modelCandidate = (
      slotIndex: number,
      promptLength: number,
      labelLength: number,
    ) => ({
      slotIndex,
      prompt: `${arabic('أي من هذه الكلمات يحمل المعنى الأدق للفعل المذكور في الجملة', promptLength)}؟`,
      options: ['a', 'b', 'c', 'd'].map((id, idx) => ({
        id,
        label: arabic(`خيار عربي رقم ${idx + 1} بصياغة واضحة`, labelLength),
      })),
      correctOptionId: 'a',
      explanation: 'تفسير واضح يشرح سبب صحة الإجابة الأولى بشكل مباشر.',
      bluffHook: 'فخ نفسي مقنع يجعل الخيارات الأخرى تبدو جذابة للمنافس.',
      factualClaims: ['ادعاء لغوي قابل للتحقق'],
      concept: 'فكرة السؤال',
      distractorRationale: [{ optionId: 'b', why: 'سبب جاذبية الخيار' }],
    });

    /** Drafts exactly as Runtime persists them, via the generator's parser. */
    const draftsFor = (
      count: number,
      promptLength: number,
      labelLength: number,
    ) =>
      (
        new CandidateGeneratorService(
          {} as never,
          {} as never,
          {} as never,
          judgeConfig(),
          {} as never,
        ) as unknown as {
          parse: (
            raw: string,
            count: number,
            mode: string,
          ) => Array<{ draft: Record<string, unknown> }>;
        }
      )
        .parse(
          JSON.stringify({
            candidates: Array.from({ length: count }, (_, idx) =>
              modelCandidate(idx, promptLength, labelLength),
            ),
          }),
          count,
          'multiple_choice',
        )
        .map((parsed) => parsed.draft);

    /** Sum of what QualityJudgeService actually reserves, at the same price. */
    const runtimeJudgeMicros = async (drafts: Record<string, unknown>[]) => {
      let micros = 0;
      const judge = new QualityJudgeService(
        {
          reserve: jest.fn(
            async (input: {
              expected: { promptTokens: number; maxOutputTokens: number };
            }) => {
              micros += estimateFn({
                callsExpected: 1,
                expected: input.expected,
              });
            },
          ),
          settle: jest.fn(async () => undefined),
        } as never,
        judgeConfig(),
        {
          generateText: jest.fn(async () => ({ text: '{}', usage: {} })),
        } as never,
      );
      for (const [idx, draft] of drafts.entries()) {
        await judge
          .judge({
            jobId: 'job-judge-parity',
            candidateId: `cand-${idx}`,
            attempt: 1,
            draft,
            context: resolvedCtx as never,
          })
          .catch(() => undefined); // the stub verdict does not parse; the reservation is what is under test
      }
      return micros;
    };

    const preflightFor = async (count: number) => {
      const service = new EngineJobAdminService(
        {} as never,
        {} as never,
        {
          snapshot: jest.fn(async () => budgetSnapshot),
          estimate: jest.fn(estimateFn),
          batchCapMicros: jest.fn(() => 100_000_000),
        } as never,
        { resolve: jest.fn(() => resolvedCtx) } as never,
        {} as never,
        judgeConfig(),
      );
      return service.preflight(ryoRequest({ targetCount: count }));
    };

    it.each([
      ['short', 60, 12],
      ['typical', 180, 25],
      ['long-context', 350, 60],
      ['output-budget-filling', 1900, 110],
    ])(
      'never under-reserves the judge for %s Arabic MC drafts at 1, 5 and 20 candidates',
      async (_profile, promptLength, labelLength) => {
        for (const count of [1, 5, 20]) {
          const preflight = await preflightFor(count);
          const runtime = await runtimeJudgeMicros(
            draftsFor(count, promptLength, labelLength),
          );
          expect(runtime).toBeLessThanOrEqual(
            preflight.conditionalJudgeEstimatedMicros!,
          );
          // And the approved total still bounds generation + judge spend.
          expect(
            preflight.generationEstimatedMicros! + runtime,
          ).toBeLessThanOrEqual(preflight.totalEstimatedMicros!);
        }
      },
    );

    it('documents the defect: the flat 200-token allowance under-reserved a long Arabic draft', async () => {
      const [draft] = draftsFor(1, 350, 60);
      expect(JSON.stringify(draft).length).toBeGreaterThan(
        3 * QUALITY_JUDGE_DRAFT_TOKEN_ALLOWANCE,
      );
      const flatPerCall = estimateFn({
        callsExpected: 1,
        expected: {
          promptTokens: estimateQualityJudgePromptTokens(resolvedCtx.mechanic),
          maxOutputTokens: QUALITY_JUDGE_MAX_OUTPUT_TOKENS,
        },
      });
      expect(await runtimeJudgeMicros([draft])).toBeGreaterThan(flatPerCall);
    });
  });
});
