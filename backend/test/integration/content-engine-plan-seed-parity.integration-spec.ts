import { ConfigModule } from '@nestjs/config';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { resolve as resolvePath } from 'path';
import { ContentEngineModule } from '../../src/modules/content-engine/content-engine.module';
import { CandidateGeneratorService } from '../../src/modules/content-engine/application/candidate-generator.service';
import { ContentEngineOrchestratorService } from '../../src/modules/content-engine/application/content-engine-orchestrator.service';
import { EngineJobAdminService } from '../../src/modules/content-engine/application/engine-job-admin.service';
import {
  APPROVED_PLAN_CHECKPOINT_STAGE,
  GenerationJobService,
} from '../../src/modules/content-engine/application/generation-job.service';
import {
  GenerationPlan,
  GenerationPlannerService,
  computeGenerationPlanDigest,
} from '../../src/modules/content-engine/application/generation-planner.service';
import {
  ENGINE_AI_PROVIDER,
  MICROS_PER_SAR,
} from '../../src/modules/content-engine/domain/content-engine.constants';
import { FACT_EVIDENCE_RETRIEVER } from '../../src/modules/content-engine/domain/fact-verification.types';
import {
  GenerationSpecification,
  computeGenerationPlanSeed,
} from '../../src/modules/content-engine/domain/generation-specification';
import { FakeAiProvider } from '../../src/modules/content-engine/testing/fake-ai.provider';
import { isolatedTestDatabaseUri } from '../helpers/test-database';

/**
 * C-9 approved-plan persistence, against real Mongoose models.
 *
 * Each `boot()` is a fresh Nest module with its own Mongoose connection to the
 * same isolated `_test` database, so "restart" here means what it means in
 * production: a new process that knows nothing except what MongoDB holds.
 *
 * No paid call is reachable: the engine's provider slot is a FakeAiProvider and
 * ENGINE_LIVE_PROVIDER_ENABLED is never set.
 */
describe('C-9 approved generation plan — persistence across restart and retry (real MongoDB)', () => {
  const uri = isolatedTestDatabaseUri('engine-plan-seed');
  const TARGET = {
    mechanicKey: 'read-your-opponent',
    worldKey: 'puzzles',
    scopeKey: 'wordplay-letters',
    targetCount: 3,
  };

  /** Slots the fake model answers for; set from the plan under test. */
  let answerSlots: GenerationPlan['slots'] = [];

  const QUALITY_RESULT = JSON.stringify({
    scores: {
      mechanicNativeGameplay: 4,
      nonTriviality: 4,
      unambiguity: 4,
      recognizabilityAndFairness: 4,
      teamInteraction: 4,
      difficultyFit: 4,
      answerLeakageSafety: 4,
      overallPlayability: 4,
    },
    reasons: {
      mechanicNativeGameplay: 'ok',
      nonTriviality: 'ok',
      unambiguity: 'ok',
      recognizabilityAndFairness: 'ok',
      teamInteraction: 'ok',
      difficultyFit: 'ok',
      answerLeakageSafety: 'ok',
      overallPlayability: 'ok',
    },
    difficulty: 'medium',
    recommendation: 'PASS',
    rejectionFeedback: [],
  });

  const isGeneration = (request: { responseSchema?: unknown }) =>
    'candidates' in
    (((request.responseSchema as { properties?: object })?.properties ??
      {}) as object);

  const candidatesFor = (slots: NonNullable<GenerationPlan['slots']>) =>
    JSON.stringify({
      candidates: slots.map((slot, idx) => ({
        slotIndex: slot.slotIndex,
        familyKey: slot.familyKey,
        difficulty: slot.difficulty,
        prompt: `ما الكلمة الصحيحة في اللغز التجريبي رقم ${idx + 1}؟`,
        options: [
          { id: 'a', label: `كلمة أولى ${idx}` },
          { id: 'b', label: `كلمة ثانية ${idx}` },
          { id: 'c', label: `كلمة ثالثة ${idx}` },
          { id: 'd', label: `كلمة رابعة ${idx}` },
        ],
        correctOptionId: 'a',
        explanation: 'تفسير واضح يشرح سبب صحة الإجابة الأولى بشكل مباشر.',
        bluffHook: 'فخ نفسي مقنع يجعل الخيارات الأخرى تبدو جذابة للمنافس.',
        factualClaims: [`ادعاء لغوي تجريبي ${idx}`],
      })),
    });

  interface Booted {
    moduleRef: TestingModule;
    database: Connection;
    admin: EngineJobAdminService;
    jobs: GenerationJobService;
    orchestrator: ContentEngineOrchestratorService;
    planner: GenerationPlannerService;
    generator: CandidateGeneratorService;
    provider: FakeAiProvider;
  }
  const open: Booted[] = [];

  const boot = async (): Promise<Booted> => {
    const provider = new FakeAiProvider({
      text: (request) =>
        isGeneration(request)
          ? candidatesFor(answerSlots ?? [])
          : QUALITY_RESULT,
      model: 'fake-model',
      usage: { promptTokens: 1000, completionTokens: 500 },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              CONTENT_ENGINE_ENABLED: 'true',
              ENGINE_AUTHORING_ROOT: resolvePath(__dirname, '../../..'),
              AI_PROVIDER: 'fake',
              ENGINE_PROVIDER_NAME: 'fake',
              ENGINE_GENERATION_MODEL: 'fake-model',
              ENGINE_BATCH_SIZE: '10',
              ENGINE_MODEL_PRICING: JSON.stringify({
                'fake/fake-model': {
                  inputMicrosPerMillion: MICROS_PER_SAR,
                  outputMicrosPerMillion: MICROS_PER_SAR,
                },
              }),
              ENGINE_MONTHLY_CAP_SAR: '100',
              ENGINE_BATCH_CAP_SAR: '25',
            }),
          ],
        }),
        MongooseModule.forRoot(uri),
        ContentEngineModule,
      ],
    })
      .overrideProvider(ENGINE_AI_PROVIDER)
      .useValue(provider)
      .overrideProvider(FACT_EVIDENCE_RETRIEVER)
      .useValue({
        retrieve: async () => [
          {
            sourceId: 'official:test',
            sourceName: 'Official fixture',
            url: 'https://example.test/evidence',
            excerpt: 'Retrieved fixture evidence.',
            retrievedAt: '2026-11-11T00:00:00.000Z',
            relation: 'supports',
          },
        ],
      })
      .compile();
    const booted: Booted = {
      moduleRef,
      database: moduleRef.get<Connection>(getConnectionToken()),
      admin: moduleRef.get(EngineJobAdminService),
      jobs: moduleRef.get(GenerationJobService),
      orchestrator: moduleRef.get(ContentEngineOrchestratorService),
      planner: moduleRef.get(GenerationPlannerService),
      generator: moduleRef.get(CandidateGeneratorService),
      provider,
    };
    open.push(booted);
    return booted;
  };

  /** Simulates a process exit: the module and its connection are gone. */
  const shutdown = async (booted: Booted) => {
    await booted.moduleRef.close();
    open.splice(open.indexOf(booted), 1);
  };

  const rawJob = async (database: Connection, jobId: string) =>
    database
      .collection('engine_jobs')
      .findOne({ _id: new Types.ObjectId(jobId) });

  const checkpoints = (job: Record<string, unknown> | null) =>
    (job?.stageCheckpoints ?? {}) as Record<string, Record<string, unknown>>;

  const generationPrompts = (provider: FakeAiProvider) =>
    provider.calls.filter(isGeneration).map((call) => JSON.stringify(call));

  let setup: Booted;

  beforeAll(async () => {
    setup = await boot();
    await setup.database.dropDatabase();
    await setup.database.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    const last = open[0] ?? (await boot());
    await last.database.dropDatabase();
    for (const booted of [...open]) await shutdown(booted);
  });

  beforeEach(async () => {
    if (!open.length) setup = await boot();
    setup = open[open.length - 1];
    await Promise.all(
      [
        'engine_jobs',
        'engine_budget',
        'engine_cost_ledger',
        'engine_candidates',
        'content_items',
        'worlds',
        'scopes',
      ].map((name) => setup.database.collection(name).deleteMany({})),
    );
    // Historical inventory must be verifiable, or preflight/runtime refuse.
    const worldId = new Types.ObjectId();
    await setup.database.collection('worlds').insertOne({
      _id: worldId,
      slug: TARGET.worldKey,
      name: TARGET.worldKey,
      status: 'active',
    });
    await setup.database.collection('scopes').insertOne({
      worldId,
      slug: TARGET.scopeKey,
      name: TARGET.scopeKey,
      status: 'active',
    });
    answerSlots = [];
  });

  /** Preflight → Submit on one process, then that process exits. */
  const approveAndSubmit = async () => {
    const preflight = await setup.admin.preflight(TARGET);
    expect(preflight.submissionReady).toBe(true);
    const submitted = await setup.admin.submit({
      ...TARGET,
      planDigest: preflight.planDigest,
    });
    return { preflight, submitted };
  };

  it('1. Preflight → Submit persists the exact approved plan, digest-intact after a BSON round-trip, idempotently', async () => {
    const { preflight, submitted } = await approveAndSubmit();
    const plan = preflight.generationPlan!;
    const spec = preflight.generationSpec!;

    // The fixture must exercise seeded creative slots, not a V1 plan.
    expect(plan.slots?.length).toBe(TARGET.targetCount);
    expect(plan.seed).toBe(computeGenerationPlanSeed(spec));
    expect(submitted.created).toBe(true);

    const stored = await rawJob(setup.database, submitted.jobId);
    const pending = checkpoints(stored)[APPROVED_PLAN_CHECKPOINT_STAGE];
    const storedPlan = pending.approvedPlan as GenerationPlan;
    expect(storedPlan).toEqual(plan);
    expect(storedPlan.digest).toBe(plan.digest);
    // Recomputed from what MongoDB returned, not from the in-memory object.
    expect(computeGenerationPlanDigest(storedPlan)).toBe(storedPlan.digest);
    expect(pending.generationPlanDigest).toBe(plan.digest);
    expect(pending.planSeed).toBe(computeGenerationPlanSeed(spec));
    expect(stored!.planDigest).toBe(preflight.planDigest);
    expect(stored!.pipelineStage).toBe('pending');
    expect(stored!.status).toBe('queued');

    // A repeated Submit is the same job and leaves the approval untouched.
    const again = await setup.admin.submit({
      ...TARGET,
      planDigest: preflight.planDigest,
    });
    expect(again.created).toBe(false);
    expect(again.jobId).toBe(submitted.jobId);
    expect(
      checkpoints(await rawJob(setup.database, submitted.jobId))[
        APPROVED_PLAN_CHECKPOINT_STAGE
      ],
    ).toEqual(pending);
    expect(
      await setup.database.collection('engine_jobs').countDocuments(),
    ).toBe(1);
  });

  it('2+3. a restarted worker executes the approved plan; a crash-retry on another restart keeps the pinned plan and seed', async () => {
    const { preflight, submitted } = await approveAndSubmit();
    const approved = preflight.generationPlan!;
    const spec = preflight.generationSpec as GenerationSpecification;
    const seed = computeGenerationPlanSeed(spec);
    answerSlots = approved.slots;
    await shutdown(setup);

    // ── Worker process B: pins the approved plan, then crashes before generating.
    const workerB = await boot();
    const plannerB = jest.spyOn(workerB.planner, 'planWithResolvedContext');
    jest
      .spyOn(workerB.generator, 'generate')
      .mockRejectedValueOnce(new Error('worker crashed after pinning'));
    await workerB.orchestrator.runJob(submitted.jobId, 'worker-b');

    expect(plannerB).not.toHaveBeenCalled();
    expect(generationPrompts(workerB.provider)).toHaveLength(0);
    const afterCrash = await rawJob(workerB.database, submitted.jobId);
    expect(afterCrash!.status).toBe('queued');
    expect(afterCrash!.attempts).toBe(1);
    const pinnedB = checkpoints(afterCrash).context_resolved;
    expect(pinnedB.pinnedPlan).toEqual(approved);
    expect(pinnedB.planDigest).toBe(approved.digest);
    expect((pinnedB.pinnedPlan as GenerationPlan).seed).toBe(seed);
    await shutdown(workerB);

    // ── Worker process C: the retry. Nothing is re-planned or re-rolled.
    const workerC = await boot();
    const plannerC = jest.spyOn(workerC.planner, 'planWithResolvedContext');
    await workerC.orchestrator.runJob(submitted.jobId, 'worker-c');

    expect(plannerC).not.toHaveBeenCalled();
    const finalJob = await rawJob(workerC.database, submitted.jobId);
    expect(finalJob!.status).toBe('awaiting_review');
    expect(finalJob!.attempts).toBe(2);
    const cps = checkpoints(finalJob);
    expect(cps.context_resolved.pinnedPlan).toEqual(approved);
    expect((cps.context_resolved.pinnedPlan as GenerationPlan).seed).toBe(seed);
    expect(cps[APPROVED_PLAN_CHECKPOINT_STAGE].approvedPlan).toEqual(approved);

    // The provider was prompted with exactly the approved slots.
    const prompts = generationPrompts(workerC.provider);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain(`Plan Digest: ${approved.digest}`);
    for (const slot of approved.slots!) {
      expect(prompts[0]).toContain(`[${slot.familyKey}]`);
    }

    // Candidates are bound to the approved slots.
    const candidates = await workerC.database
      .collection('engine_candidates')
      .find({ jobId: submitted.jobId })
      .sort({ ordinal: 1 })
      .toArray();
    expect(candidates).toHaveLength(TARGET.targetCount);
    expect(
      candidates.map(
        (c) =>
          (c.authoring as { assignedSlot?: { familyKey?: string } })
            ?.assignedSlot?.familyKey,
      ),
    ).toEqual(approved.slots!.map((s) => s.familyKey));

    // Budget parity: the one generation reservation equals the approved estimate.
    const ledger = await workerC.database
      .collection('engine_cost_ledger')
      .find({ jobId: submitted.jobId, stage: 'generation' })
      .toArray();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].reservedMicros).toBe(preflight.generationEstimatedMicros);
  }, 60_000);

  it('4a. a pre-C-9 queued job (spec, no approved plan) plans with the spec seed and reproduces the Preflight plan', async () => {
    const preflight = await setup.admin.preflight(TARGET);
    const spec = preflight.generationSpec!;
    // Exactly what Submit wrote before C-9: no approvedPlan, empty checkpoints.
    const { jobId } = await setup.jobs.submit({
      ...TARGET,
      contextRevision: preflight.contextHash!,
      generationSpec: spec,
      planDigest: preflight.planDigest,
    });
    expect(checkpoints(await rawJob(setup.database, jobId))).toEqual({});
    answerSlots = preflight.generationPlan!.slots;
    await shutdown(setup);

    const worker = await boot();
    const planner = jest.spyOn(worker.planner, 'planWithResolvedContext');
    await worker.orchestrator.runJob(jobId, 'legacy-worker');

    expect(planner).toHaveBeenCalledTimes(1);
    expect(planner).toHaveBeenCalledWith(
      expect.objectContaining({ seed: computeGenerationPlanSeed(spec) }),
    );
    const job = await rawJob(worker.database, jobId);
    expect(job!.status).toBe('awaiting_review');
    expect(checkpoints(job).context_resolved.pinnedPlan).toEqual(
      preflight.generationPlan,
    );
  }, 60_000);

  it('4b. a plan pinned before C-9 (jobId-seeded, no recorded seed) is honoured unchanged', async () => {
    const preflight = await setup.admin.preflight(TARGET);
    const { jobId } = await setup.jobs.submit({
      ...TARGET,
      contextRevision: preflight.contextHash!,
      generationSpec: preflight.generationSpec,
      planDigest: preflight.planDigest,
    });
    // The pre-C-9 shape: allocated from jobId, digest without a seed field.
    const jobIdPlan = await setup.planner.planWithResolvedContext({
      worldKey: TARGET.worldKey,
      scopeKey: TARGET.scopeKey,
      mechanicKey: TARGET.mechanicKey,
      count: TARGET.targetCount,
      difficulty: preflight.generationSpec!.difficulty,
      seed: jobId,
    });
    const legacyPinned: GenerationPlan = { ...jobIdPlan };
    delete legacyPinned.seed;
    legacyPinned.digest = computeGenerationPlanDigest(legacyPinned);
    await setup.database.collection('engine_jobs').updateOne(
      { _id: new Types.ObjectId(jobId) },
      {
        $set: {
          'stageCheckpoints.context_resolved': {
            completedAt: new Date().toISOString(),
            pinnedPlan: legacyPinned,
            planDigest: legacyPinned.digest,
          },
        },
      },
    );
    answerSlots = legacyPinned.slots;
    await shutdown(setup);

    const worker = await boot();
    const planner = jest.spyOn(worker.planner, 'planWithResolvedContext');
    await worker.orchestrator.runJob(jobId, 'legacy-pinned-worker');

    expect(planner).not.toHaveBeenCalled();
    const job = await rawJob(worker.database, jobId);
    expect(job!.status).toBe('awaiting_review');
    expect(job!.awaitingReviewReason).toBe('PHASE_1C_EVALUATION_COMPLETE');
    const pinned = checkpoints(job).context_resolved
      .pinnedPlan as GenerationPlan;
    expect(pinned).toEqual(legacyPinned);
    expect(pinned.seed).toBeUndefined();
    expect(generationPrompts(worker.provider)[0]).toContain(
      `Plan Digest: ${legacyPinned.digest}`,
    );
  }, 60_000);

  it('5. batch intents: identical specs with different intents are independent jobs, each with its own seed; the same intent dedupes; no intent keeps legacy dedupe', async () => {
    const INTENT_A = '3f1c9a7e-2b4d-4c8e-9f10-5a6b7c8d9e0f';
    const INTENT_B = 'b7a1d2c3-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
    const submitWith = async (batchIntentId?: string) => {
      const request = batchIntentId ? { ...TARGET, batchIntentId } : TARGET;
      const preflight = await setup.admin.preflight(request);
      expect(preflight.submissionReady).toBe(true);
      const submitted = await setup.admin.submit({
        ...request,
        planDigest: preflight.planDigest,
      });
      return { preflight, submitted };
    };

    const a = await submitWith(INTENT_A);
    const aRetry = await submitWith(INTENT_A);
    const b = await submitWith(INTENT_B);
    const legacy = await submitWith();
    const legacyRetry = await submitWith();

    expect(a.submitted.created).toBe(true);
    expect(aRetry.submitted).toMatchObject({
      created: false,
      jobId: a.submitted.jobId,
    });
    expect(b.submitted.created).toBe(true);
    expect(b.submitted.jobId).not.toBe(a.submitted.jobId);
    expect(legacy.submitted.created).toBe(true);
    expect(legacyRetry.submitted).toMatchObject({
      created: false,
      jobId: legacy.submitted.jobId,
    });
    expect(
      await setup.database.collection('engine_jobs').countDocuments(),
    ).toBe(3);

    const seedA = computeGenerationPlanSeed(a.preflight.generationSpec!);
    const seedB = computeGenerationPlanSeed(b.preflight.generationSpec!);
    expect(seedA).not.toBe(seedB);
    for (const [run, seed, intent] of [
      [a, seedA, INTENT_A],
      [b, seedB, INTENT_B],
    ] as const) {
      const stored = await rawJob(setup.database, run.submitted.jobId);
      expect(
        (stored!.generationSpec as GenerationSpecification).batchIntentId,
      ).toBe(intent);
      expect(
        (
          checkpoints(stored)[APPROVED_PLAN_CHECKPOINT_STAGE]
            .approvedPlan as GenerationPlan
        ).seed,
      ).toBe(seed);
    }
    // Reconciliation lookup: the exact intent finds exactly its job.
    const byIntentA = await setup.admin.listJobs({
      batchIntentId: INTENT_A,
      limit: 1,
    });
    expect(byIntentA.items.map((item) => item.jobId)).toEqual([
      a.submitted.jobId,
    ]);
    expect(
      (
        await setup.admin.listJobs({
          batchIntentId: 'never-submitted-intent-0001',
          limit: 1,
        })
      ).items,
    ).toEqual([]);
    const legacyStored = await rawJob(setup.database, legacy.submitted.jobId);
    expect(legacyStored!.generationSpec).not.toHaveProperty('batchIntentId');
    await shutdown(setup);

    // A restarted worker executes each batch under its own intent's seed.
    const worker = await boot();
    for (const [run, seed] of [
      [a, seedA],
      [b, seedB],
    ] as const) {
      answerSlots = run.preflight.generationPlan!.slots;
      await worker.orchestrator.runJob(run.submitted.jobId, 'intent-worker');
      const job = await rawJob(worker.database, run.submitted.jobId);
      expect(job!.status).toBe('awaiting_review');
      const pinned = checkpoints(job).context_resolved
        .pinnedPlan as GenerationPlan;
      expect(pinned).toEqual(run.preflight.generationPlan);
      expect(pinned.seed).toBe(seed);
    }
  }, 60_000);
});
