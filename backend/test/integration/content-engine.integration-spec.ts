import { ConfigModule } from '@nestjs/config';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Types, mongo } from 'mongoose';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { CreateContentItemDto } from '../../src/modules/world-content/dto/content-item.dto';
import { extractContentIdentity } from '../../src/modules/content-engine/domain/content-identity.policy';
import { ContentEngineModule } from '../../src/modules/content-engine/content-engine.module';
import { EngineBudgetService } from '../../src/modules/content-engine/application/engine-budget.service';
import {
  GenerationJobService,
  SubmitJobInput,
} from '../../src/modules/content-engine/application/generation-job.service';
import {
  BudgetExceededError,
  LeaseLostError,
  MAX_JOB_ATTEMPTS,
  ENGINE_AI_PROVIDER,
  MICROS_PER_SAR,
  PROVIDER_OUTPUT_TOKENS_EXHAUSTED,
  sarToMicros,
} from '../../src/modules/content-engine/domain/content-engine.constants';
import { FakeAiProvider } from '../../src/modules/content-engine/testing/fake-ai.provider';
import { OpenRouterEmptyCompletionError } from '../../src/modules/content-engine/infrastructure/openrouter-ai.provider';

import { AuthoringContextService } from '../../src/modules/content-engine/application/authoring-context.service';
import { CandidateGeneratorService } from '../../src/modules/content-engine/application/candidate-generator.service';
import { DeterministicScreenService } from '../../src/modules/content-engine/application/deterministic-screen.service';
import { ContentEngineOrchestratorService } from '../../src/modules/content-engine/application/content-engine-orchestrator.service';
import { ContentEngineReviewService } from '../../src/modules/content-engine/application/content-engine-review.service';
import { ContentItemService } from '../../src/modules/world-content/application/content-item.service';
import { FACT_EVIDENCE_RETRIEVER } from '../../src/modules/content-engine/domain/fact-verification.types';
import { resolve as resolvePath } from 'path';
import { isolatedTestDatabaseUri } from '../helpers/test-database';

/**
 * Concurrency cannot be proved with mocks.
 *
 * Every guarantee in this module — idempotent submission, single-winner claims,
 * lease fencing, and a budget that cannot be overdrawn by parallel reservations
 * — is a property of an atomic MongoDB operation. A mocked model would prove
 * only that the code calls the methods the author expected. So this suite runs
 * against a real, isolated `_test` database and races real operations.
 *
 * No paid API call occurs anywhere here: the only provider is `FakeAiProvider`.
 */
describe('Content Engine foundation (roadmap §30, Phase 1a)', () => {
  let database: Connection;
  let jobs: GenerationJobService;
  let budget: EngineBudgetService;
  let context: AuthoringContextService;
  let generator: CandidateGeneratorService;
  let screen: DeterministicScreenService;
  let fakeProvider: FakeAiProvider;
  let orchestrator: ContentEngineOrchestratorService;
  let review: ContentEngineReviewService;
  let contentItems: ContentItemService;
  let timeoutQuality = false;

  const PRICING = JSON.stringify({
    'fake/fake-model': {
      inputMicrosPerMillion: MICROS_PER_SAR,
      outputMicrosPerMillion: MICROS_PER_SAR,
    },
    // Production rates, for the Pilot 01 settlement regression.
    'openrouter/anthropic/claude-sonnet-5.5': {
      inputMicrosPerMillion: 7_500_000,
      outputMicrosPerMillion: 37_500_000,
      reasoningMicrosPerMillion: 37_500_000,
    },
  });

  /** 1 SAR per reservation at these token counts, for arithmetic that reads. */
  const ONE_SAR_CALL = { promptTokens: 1_000_000, maxOutputTokens: 0 };

  const request = (
    overrides: Partial<SubmitJobInput> = {},
  ): SubmitJobInput => ({
    mechanicKey: 'read-your-opponent',
    worldKey: 'video-games',
    scopeKey: 'overwatch',
    targetCount: 10,
    contextRevision: 'v1',
    ...overrides,
  });

  const PILOT = {
    mechanicKey: 'read-your-opponent',
    worldKey: 'video-games',
    scopeKey: 'overwatch',
  };

  const startJob = async (revision: string) => {
    const { jobId } = await jobs.submit(request({ contextRevision: revision }));
    const held = await jobs.lease({ owner: `worker-${revision}` });
    return { jobId, held: held! };
  };

  /** One clean candidate, used where the point is the gate, not the batch. */
  const ONE_CANDIDATE = JSON.stringify({
    candidates: [
      {
        prompt: 'أي بطل يملك قدرة الشفاء الجماعي؟',
        options: [
          { id: 'a', label: 'مرسي' },
          { id: 'b', label: 'لوسيو' },
        ],
        correctOptionId: 'a',
        factualClaims: ['Mercy has a group healing ultimate'],
      },
    ],
  });

  const TWO_CANDIDATES = JSON.stringify({
    candidates: [
      {
        prompt: 'أي بطل يملك قدرة الشفاء الجماعي؟',
        options: [
          { id: 'a', label: 'مرسي' },
          { id: 'b', label: 'جنجي' },
        ],
        correctOptionId: 'a',
        factualClaims: ['Mercy has a group healing ultimate'],
      },
      {
        prompt: 'أي خريطة تدور أحداثها في مصر؟',
        options: [
          { id: 'a', label: 'تمبل أوف أنوبيس' },
          { id: 'b', label: 'إيتشنواليا' },
        ],
        correctOptionId: 'a',
        factualClaims: ['Temple of Anubis is set in Egypt'],
      },
    ],
  });

  const QUALITY_RESULT = JSON.stringify({
    scores: {
      mechanicNativeGameplay: 4,
      nonTriviality: 4,
      unambiguity: 5,
      recognizabilityAndFairness: 4,
      teamInteraction: 4,
      difficultyFit: 4,
      answerLeakageSafety: 5,
      overallPlayability: 4,
    },
    reasons: {
      mechanicNativeGameplay: 'Uses the mechanic well.',
      nonTriviality: 'Requires useful recall.',
      unambiguity: 'Has one clear answer.',
      recognizabilityAndFairness: 'The subject is recognizable.',
      teamInteraction: 'Invites discussion.',
      difficultyFit: 'Fits the intended audience.',
      answerLeakageSafety: 'Does not reveal the answer.',
      overallPlayability: 'Playable after human review.',
    },
    difficulty: 'medium',
    recommendation: 'PASS',
    rejectionFeedback: [],
  });

  beforeAll(async () => {
    fakeProvider = new FakeAiProvider({
      text: (generationRequest) =>
        'candidates' in
        ((generationRequest.responseSchema?.properties as object) ?? {})
          ? TWO_CANDIDATES
          : QUALITY_RESULT,
      timeout: (generationRequest) =>
        timeoutQuality &&
        !(
          'candidates' in
          ((generationRequest.responseSchema?.properties as object) ?? {})
        ),
      model: 'fake-model',
      usage: { promptTokens: 1000, completionTokens: 500 },
    });
    const uri = isolatedTestDatabaseUri('content-engine');
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
              ENGINE_GENERATION_MODEL: 'fake-model',
              ENGINE_BATCH_SIZE: '10',
              ENGINE_MODEL_PRICING: PRICING,
              ENGINE_MONTHLY_CAP_SAR: '100',
              ENGINE_BATCH_CAP_SAR: '25',
            }),
          ],
        }),
        MongooseModule.forRoot(uri),
        ContentEngineModule,
      ],
    })
      // The only provider in this suite. No paid call is reachable.
      .overrideProvider(ENGINE_AI_PROVIDER)
      .useValue(fakeProvider)
      .overrideProvider(FACT_EVIDENCE_RETRIEVER)
      .useValue({
        retrieve: async () => [
          {
            sourceId: 'official:test',
            sourceName: 'Official fixture',
            url: 'https://example.test/evidence',
            excerpt: 'Retrieved fixture evidence.',
            retrievedAt: '2026-10-15T00:00:00.000Z',
            relation: 'supports',
          },
        ],
      })
      .compile();

    jobs = moduleRef.get(GenerationJobService);
    context = moduleRef.get(AuthoringContextService);
    generator = moduleRef.get(CandidateGeneratorService);
    screen = moduleRef.get(DeterministicScreenService);
    budget = moduleRef.get(EngineBudgetService);
    orchestrator = moduleRef.get(ContentEngineOrchestratorService);
    review = moduleRef.get(ContentEngineReviewService);
    contentItems = moduleRef.get(ContentItemService);
    database = moduleRef.get<Connection>(getConnectionToken());
    // Indexes are the locks these tests rely on; build them before racing.
    await database.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await database?.dropDatabase();
    await database?.close();
  });

  beforeEach(async () => {
    timeoutQuality = false;
    await Promise.all(
      [
        'engine_jobs',
        'engine_budget',
        'engine_cost_ledger',
        'engine_candidates',
        'engine_draft_publications',
        'content_items',
        'worlds',
        'scopes',
        'challenge_types',
      ].map((name) => database.collection(name).deleteMany({})),
    );
  });

  const seedInventoryTarget = async (
    connection: Connection,
    worldKey: string,
    scopeKey: string,
  ) => {
    const worldId = new Types.ObjectId();
    await connection.collection('worlds').insertOne({
      _id: worldId,
      slug: worldKey,
      name: worldKey,
      status: 'active',
    });
    await connection
      .collection('scopes')
      .insertOne({ worldId, slug: scopeKey, name: scopeKey, status: 'active' });
  };

  describe('feature flag', () => {
    it('is the first thing checked, and defaults to disabled', async () => {
      // The suite enables it explicitly; absent configuration must not.
      const disabled = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => ({})],
          }),
          MongooseModule.forRoot(isolatedTestDatabaseUri('content-engine-off')),
          ContentEngineModule,
        ],
      }).compile();
      const offJobs = disabled.get(GenerationJobService);
      expect(offJobs.enabled()).toBe(false);
      await expect(offJobs.submit(request())).rejects.toThrow(
        /CONTENT_ENGINE_ENABLED/,
      );
      const conn = disabled.get<Connection>(getConnectionToken());
      await conn.dropDatabase();
      await conn.close();
    }, 60_000);
  });

  describe('job identity and claiming', () => {
    it('collapses two concurrent identical submissions into one job', async () => {
      const [a, b] = await Promise.all([
        jobs.submit(request()),
        jobs.submit(request()),
      ]);
      expect(a.jobId).toBe(b.jobId);
      expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
      expect(await database.collection('engine_jobs').countDocuments()).toBe(1);
    });

    it('treats a changed context revision as different work', async () => {
      const a = await jobs.submit(request());
      const b = await jobs.submit(request({ contextRevision: 'v2' }));
      expect(a.jobId).not.toBe(b.jobId);
    });

    it('gives a job to exactly one of two racing workers', async () => {
      await jobs.submit(request());
      const [first, second] = await Promise.all([
        jobs.lease({ owner: 'worker-a' }),
        jobs.lease({ owner: 'worker-b' }),
      ]);
      const winners = [first, second].filter(Boolean);
      expect(winners).toHaveLength(1);
    });

    it('issues a strictly increasing fencing epoch on every claim', async () => {
      const { jobId } = await jobs.submit(request());
      const first = await jobs.lease({ owner: 'worker-a', leaseMs: -1 });
      const second = await jobs.lease({ owner: 'worker-b' });
      expect(second!.jobId).toBe(jobId);
      expect(second!.leaseEpoch).toBeGreaterThan(first!.leaseEpoch);
    });
  });

  describe('lease fencing', () => {
    it('refuses a stale worker that wakes after losing its lease', async () => {
      await jobs.submit(request());
      const stale = await jobs.lease({ owner: 'worker-a', leaseMs: -1 }); // already expired
      const fresh = await jobs.lease({ owner: 'worker-b' });
      expect(fresh!.leaseEpoch).toBeGreaterThan(stale!.leaseEpoch);

      // The stale holder still believes it owns the job. Every write it makes
      // carries its old epoch, so none of them match.
      expect(await jobs.holdsLease(stale!.jobId, stale!.leaseEpoch)).toBe(
        false,
      );
      expect(
        await jobs.renew({
          jobId: stale!.jobId,
          leaseEpoch: stale!.leaseEpoch,
        }),
      ).toBe(false);
      await expect(
        jobs.complete(stale!.jobId, stale!.leaseEpoch),
      ).rejects.toThrow(LeaseLostError);

      // The real holder is unaffected.
      await expect(
        jobs.complete(fresh!.jobId, fresh!.leaseEpoch),
      ).resolves.toBeUndefined();
    });

    it('is idempotent for the rightful holder completing twice', async () => {
      await jobs.submit(request());
      const held = await jobs.lease({ owner: 'worker-a' });
      await jobs.complete(held!.jobId, held!.leaseEpoch);
      await expect(
        jobs.complete(held!.jobId, held!.leaseEpoch),
      ).resolves.toBeUndefined();
    });

    it('requeues an expired lease, and fails it once attempts are exhausted', async () => {
      await jobs.submit(request());
      for (let i = 0; i < MAX_JOB_ATTEMPTS; i += 1) {
        await jobs.lease({ owner: `worker-${i}`, leaseMs: -1 });
        await jobs.recoverExpiredLeases();
      }
      const job = await jobs.findById(
        String((await database.collection('engine_jobs').findOne({}))!._id),
      );
      expect(job!.attempts).toBe(MAX_JOB_ATTEMPTS);
      expect(job!.status).toBe('failed');
      // A crash loop cannot keep spending.
      expect(await jobs.lease({ owner: 'worker-x' })).toBeNull();
    });
  });

  describe('cancellation', () => {
    it('stops an unclaimed job immediately', async () => {
      const { jobId } = await jobs.submit(request());
      expect(await jobs.requestCancellation(jobId)).toBe(true);
      expect((await jobs.findById(jobId))!.status).toBe('cancelled');
      expect(await jobs.lease({ owner: 'worker-a' })).toBeNull();
    });

    it('flags a leased job rather than interrupting it, and still settles its money', async () => {
      await jobs.submit(request());
      const held = await jobs.lease({ owner: 'worker-a' });
      await budget.reserve({
        reservationId: 'r-cancel',
        jobId: held!.jobId,
        stage: 'generation',
        provider: 'fake',
        model: 'fake-model',
        expected: ONE_SAR_CALL,
      });

      expect(await jobs.requestCancellation(held!.jobId)).toBe(true);
      expect(await jobs.isCancellationRequested(held!.jobId)).toBe(true);
      // Still 'leased': an in-flight provider call cannot be unsent.
      expect((await jobs.findById(held!.jobId))!.status).toBe('leased');

      // The outstanding reservation must still reconcile, or the money strands.
      const settled = await budget.settle({
        reservationId: 'r-cancel',
        usage: { promptTokens: 1_000_000 },
      });
      expect(settled!.actualMicros).toBe(sarToMicros(1));
      const state = await budget.snapshot();
      expect(state.reservedMicros).toBe(0);
      expect(state.spentMicros).toBe(sarToMicros(1));
    });
  });

  describe('budget', () => {
    it('refuses a model with no configured price, before reserving anything', async () => {
      await expect(
        budget.reserve({
          reservationId: 'r-nopricing',
          jobId: 'j',
          stage: 'generation',
          provider: 'fake',
          model: 'unpriced-model',
          expected: ONE_SAR_CALL,
        }),
      ).rejects.toThrow(/No configured pricing/);
      expect(
        await database.collection('engine_cost_ledger').countDocuments(),
      ).toBe(0);
      expect((await budget.snapshot()).reservedMicros).toBe(0);
    });

    it('counts outstanding reservations, not just settled spend', async () => {
      await budget.reserve({
        reservationId: 'r-1',
        jobId: 'j',
        stage: 'generation',
        provider: 'fake',
        model: 'fake-model',
        expected: ONE_SAR_CALL,
      });
      const state = await budget.snapshot();
      expect(state.reservedMicros).toBe(sarToMicros(1));
      expect(state.spentMicros).toBe(0);
      expect(state.availableMicros).toBe(sarToMicros(99));
    });

    it('never admits more than the cap under concurrent reservations', async () => {
      // 100 SAR cap, 150 parallel reservations of 1 SAR each.
      // One job per reservation: the per-job batch cap (25 SAR) has its own
      // unit coverage, and sharing one job would test it instead of the
      // monthly cap this race is about.
      const attempts = await Promise.allSettled(
        Array.from({ length: 150 }, (_, i) =>
          budget.reserve({
            reservationId: `race-${i}`,
            jobId: `race-job-${i}`,
            stage: 'generation',
            provider: 'fake',
            model: 'fake-model',
            expected: ONE_SAR_CALL,
          }),
        ),
      );
      const granted = attempts.filter((r) => r.status === 'fulfilled').length;
      const refused = attempts.filter(
        (r) =>
          r.status === 'rejected' && r.reason instanceof BudgetExceededError,
      ).length;

      expect(granted).toBe(100);
      expect(refused).toBe(50);
      const state = await budget.snapshot();
      expect(state.reservedMicros).toBe(sarToMicros(100));
      expect(state.spentMicros + state.reservedMicros).toBeLessThanOrEqual(
        state.capMicros,
      );
    }, 60_000);

    it('never admits more than the per-job cap under concurrent reservations', async () => {
      // 25 SAR job cap, 40 parallel reservations of 1 SAR each on one job.
      const attempts = await Promise.allSettled(
        Array.from({ length: 40 }, (_, i) =>
          budget.reserve({
            reservationId: `job-race-${i}`,
            jobId: 'one-job',
            stage: 'generation',
            provider: 'fake',
            model: 'fake-model',
            expected: ONE_SAR_CALL,
          }),
        ),
      );
      expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(25);
      expect(
        attempts.filter(
          (r) =>
            r.status === 'rejected' && r.reason instanceof BudgetExceededError,
        ),
      ).toHaveLength(15);
      expect((await budget.snapshot()).reservedMicros).toBe(sarToMicros(25));
    }, 60_000);

    it('rejects a single call larger than the per-batch cap', async () => {
      await expect(
        budget.reserve({
          reservationId: 'r-huge',
          jobId: 'j',
          stage: 'generation',
          provider: 'fake',
          model: 'fake-model',
          expected: { promptTokens: 30_000_000, maxOutputTokens: 0 }, // 30 SAR > 25
        }),
      ).rejects.toThrow(BudgetExceededError);
    });

    it('is idempotent when the same reservation id is submitted twice', async () => {
      const first = await budget.reserve({
        reservationId: 'r-dup',
        jobId: 'j',
        stage: 'generation',
        provider: 'fake',
        model: 'fake-model',
        expected: ONE_SAR_CALL,
      });
      const second = await budget.reserve({
        reservationId: 'r-dup',
        jobId: 'j',
        stage: 'generation',
        provider: 'fake',
        model: 'fake-model',
        expected: ONE_SAR_CALL,
      });
      expect(second.reservedMicros).toBe(first.reservedMicros);
      expect((await budget.snapshot()).reservedMicros).toBe(sarToMicros(1));
    });
  });

  describe('reconciliation', () => {
    const reserve = (id: string) =>
      budget.reserve({
        reservationId: id,
        jobId: 'j',
        stage: 'generation',
        provider: 'fake',
        model: 'fake-model',
        expected: { promptTokens: 2_000_000, maxOutputTokens: 0 }, // reserve 2 SAR
      });

    it('Pilot 01: settles the exact exhausted call at 220,433 micro-SAR, once', async () => {
      // Production reserved 242,948 micros for this call (20,393 estimated
      // prompt tokens + a 2,400-token ceiling at Sonnet 5.5 rates).
      const before = await budget.snapshot();
      const reserved = await budget.reserve({
        reservationId: 'pilot-01-generation',
        jobId: 'pilot-01',
        stage: 'generation',
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5.5',
        expected: { promptTokens: 20_393, maxOutputTokens: 2_400 },
      });
      expect(reserved.reservedMicros).toBe(242_948);
      const settle = () =>
        budget.settle({
          reservationId: 'pilot-01-generation',
          usage: { promptTokens: 17_391, completionTokens: 2_400 },
          diagnostics: {
            finishReason: 'length',
            nativeFinishReason: 'max_tokens',
            reasoningTokens: 2_400,
            providerReportedCostUsd: 0.058782,
          },
        });
      const first = await settle();
      expect(first!.actualMicros).toBe(220_433);
      expect(first!.usageSource).toBe('reported');
      // Idempotent: the same attempt can never be charged twice.
      expect(await settle()).toBeNull();
      const after = await budget.snapshot();
      expect(after.spentMicros - before.spentMicros).toBe(220_433);
      expect(after.reservedMicros).toBe(before.reservedMicros);
      const entry = await database
        .collection('engine_cost_ledger')
        .findOne({ reservationId: 'pilot-01-generation' });
      expect(entry!.usageKnown).toBe(true);
      expect(entry!.providerDiagnostics).toMatchObject({
        finishReason: 'length',
        reasoningTokens: 2_400,
      });
    });

    it('records provider-measured diagnostics beside the settlement', async () => {
      // A reasoning model's spend is only auditable if the reasoning split is
      // kept. It is observation: the charge still comes from configured rates.
      await reserve('r-diagnostics');
      const settled = await budget.settle({
        reservationId: 'r-diagnostics',
        usage: { promptTokens: 1_000_000 },
        diagnostics: { reasoningTokens: 1_290, providerReportedCostUsd: 0.033 },
      });
      expect(settled!.actualMicros).toBe(sarToMicros(1));
      const entry = await database
        .collection('engine_cost_ledger')
        .findOne({ reservationId: 'r-diagnostics' });
      expect(entry!.providerDiagnostics).toEqual({
        reasoningTokens: 1_290,
        providerReportedCostUsd: 0.033,
      });
    });

    it('never lets a provider-reported cost change what is charged', async () => {
      // The ledger prices tokens in SAR micros at configured rates. A USD
      // figure from the provider sits beside that for comparison; folding it in
      // would bake an exchange-rate assumption into settled money.
      await reserve('r-diag-noeffect');
      const settled = await budget.settle({
        reservationId: 'r-diag-noeffect',
        usage: { promptTokens: 1_000_000 },
        diagnostics: { providerReportedCostUsd: 99 },
      });
      expect(settled!.actualMicros).toBe(sarToMicros(1));
    });

    it('leaves diagnostics null when the provider reports none', async () => {
      await reserve('r-diag-absent');
      await budget.settle({
        reservationId: 'r-diag-absent',
        usage: { promptTokens: 1_000_000 },
      });
      const entry = await database
        .collection('engine_cost_ledger')
        .findOne({ reservationId: 'r-diag-absent' });
      expect(entry!.providerDiagnostics).toBeNull();
    });

    it('releases the reservation when the provider refused to run the request', async () => {
      // A GPT-5 batch was rejected with HTTP 400 for an invalid schema. No
      // inference ran and OpenRouter billed nothing, but the ledger charged
      // the full reservation — SAR 0.195 of spend that never happened.
      await reserve('r-rejected');
      const settled = await budget.settle({
        reservationId: 'r-rejected',
        providerRejected: true,
      });
      expect(settled!.actualMicros).toBe(0);
      expect(settled!.usageSource).toBe('provider-rejected');
      const state = await budget.snapshot();
      expect(state.spentMicros).toBe(0);
      // And the money goes back to the cap, not into limbo.
      expect(state.reservedMicros).toBe(0);
      expect(state.availableMicros).toBe(state.capMicros);
    });

    it('still charges in full when billing is genuinely unknown', async () => {
      // The conservative default is unchanged: only an explicit provider
      // refusal is free, never an ambiguous failure.
      await reserve('r-ambiguous');
      const settled = await budget.settle({
        reservationId: 'r-ambiguous',
        timedOut: true,
      });
      expect(settled!.actualMicros).toBe(sarToMicros(2));
      expect(settled!.usageSource).toBe('unknown-timeout');
      expect((await budget.snapshot()).spentMicros).toBe(sarToMicros(2));
    });

    it('settles once and ignores a repeated settle', async () => {
      await reserve('r-once');
      const first = await budget.settle({
        reservationId: 'r-once',
        usage: { promptTokens: 1_000_000 },
      });
      const second = await budget.settle({
        reservationId: 'r-once',
        usage: { promptTokens: 1_000_000 },
      });
      expect(first!.actualMicros).toBe(sarToMicros(1));
      expect(second).toBeNull();
      const state = await budget.snapshot();
      expect(state.spentMicros).toBe(sarToMicros(1)); // charged once
      expect(state.reservedMicros).toBe(0);
    });

    it('settles two concurrent settles exactly once', async () => {
      await reserve('r-race');
      const [a, b] = await Promise.all([
        budget.settle({
          reservationId: 'r-race',
          usage: { promptTokens: 1_000_000 },
        }),
        budget.settle({
          reservationId: 'r-race',
          usage: { promptTokens: 1_000_000 },
        }),
      ]);
      expect([a, b].filter(Boolean)).toHaveLength(1);
      expect((await budget.snapshot()).spentMicros).toBe(sarToMicros(1));
    });

    it('charges the reservation when the provider reports no usage', async () => {
      await reserve('r-silent');
      const settled = await budget.settle({ reservationId: 'r-silent' });
      expect(settled!.usageSource).toBe('estimated');
      expect(settled!.actualMicros).toBe(sarToMicros(2)); // the reservation
      const entry = await database
        .collection('engine_cost_ledger')
        .findOne({ reservationId: 'r-silent' });
      expect(entry!.usageKnown).toBe(false);
    });

    it('charges the reservation after an ambiguous timeout', async () => {
      // The provider may or may not have billed us. Nothing observable settles
      // it, so the engine assumes it did — safe for the cap, possibly an
      // over-count of real spend. The opposite assumption breaks the cap.
      const provider = new FakeAiProvider({ timeout: true });
      await reserve('r-timeout');
      await expect(provider.generateText({ prompt: 'x' })).rejects.toThrow(
        /timeout/,
      );
      const settled = await budget.settle({
        reservationId: 'r-timeout',
        timedOut: true,
      });
      expect(settled!.usageSource).toBe('unknown-timeout');
      expect(settled!.actualMicros).toBe(sarToMicros(2));
      expect((await budget.snapshot()).spentMicros).toBe(sarToMicros(2));
    });

    it('records an actual cost above the reservation instead of hiding it', async () => {
      await reserve('r-over'); // reserved 2 SAR
      const settled = await budget.settle({
        reservationId: 'r-over',
        usage: { promptTokens: 5_000_000 }, // actually 5 SAR
      });
      expect(settled!.exceededReservation).toBe(true);
      expect(settled!.actualMicros).toBe(sarToMicros(5));
      const state = await budget.snapshot();
      // The overage lands in spend. A reservation bounds an estimate, not a bill.
      expect(state.spentMicros).toBe(sarToMicros(5));
      expect(state.reservedMicros).toBe(0);
    });

    it('releases a reservation for a call that never happened', async () => {
      await reserve('r-released');
      expect(await budget.release('r-released')).toBe(true);
      const state = await budget.snapshot();
      expect(state.reservedMicros).toBe(0);
      expect(state.spentMicros).toBe(0);
      expect(await budget.release('r-released')).toBe(false); // idempotent
    });

    it('reclaims a reservation stranded by a crash, charging it conservatively', async () => {
      await reserve('r-crashed');
      // Nothing settled it — the process died between reserve and settle.
      const reclaimed = await budget.reclaimStaleReservations({
        staleAfterMs: -1,
      });
      expect(reclaimed).toBe(1);
      const state = await budget.snapshot();
      expect(state.reservedMicros).toBe(0);
      expect(state.spentMicros).toBe(sarToMicros(2));
      const entry = await database
        .collection('engine_cost_ledger')
        .findOne({ reservationId: 'r-crashed' });
      expect(entry!.status).toBe('orphaned');
      expect(entry!.usageKnown).toBe(false);
    });
  });

  describe('Phase 1b — context, generation, screening', () => {
    it('resolves the pilot authoring context and hashes it', () => {
      const resolved = context.resolve(PILOT);
      expect(resolved.mechanicKey).toBe('read-your-opponent');
      expect(resolved.knowledge.length).toBeGreaterThan(0);
      expect(resolved.contextHash).toHaveLength(64);
    });

    it('refuses an unsupported combination before anything is generated', () => {
      expect(() =>
        context.resolve({ ...PILOT, scopeKey: 'nonexistent' }),
      ).toThrow(/UNKNOWN_SCOPE/);
    });

    it('generates, persists and reserves budget for a batch', async () => {
      const { held } = await startJob('gen-1');
      const resolved = context.resolve(PILOT);
      const produced = await generator.generate({
        jobId: held.jobId,
        leaseEpoch: held.leaseEpoch,
        attempt: held.attempts,
        context: resolved,
        count: 2,
      });

      expect(produced).toHaveLength(2);
      expect(
        await database.collection('engine_candidates').countDocuments(),
      ).toBe(2);
      const stored = await database
        .collection('engine_candidates')
        .findOne({ jobId: held.jobId, ordinal: 0 });
      expect(stored!.contextHash).toBe(resolved.contextHash);
      expect(stored!.promptVersion).toBe('mc-v2');
      expect(stored!.status).toBe('generated');

      // The call was reserved and settled — never unaccounted.
      const entry = await database
        .collection('engine_cost_ledger')
        .findOne({ jobId: held.jobId, stage: 'generation' });
      expect(entry!.status).toBe('reconciled');
      expect(entry!.usageKnown).toBe(true);
    });

    it('sends the canonical context to the provider, not a paraphrase', async () => {
      const { held } = await startJob('gen-prompt');
      const resolved = context.resolve(PILOT);
      fakeProvider.calls.length = 0;
      await generator.generate({
        jobId: held.jobId,
        leaseEpoch: held.leaseEpoch,
        attempt: held.attempts,
        context: resolved,
        count: 2,
      });
      const sent = fakeProvider.calls.at(-1)!;
      expect(sent.prompt).toContain('MECHANIC PROFILE (read-your-opponent)');
      expect(sent.prompt).toContain(resolved.knowledge.slice(0, 40));
      expect(sent.responseSchema).toBeDefined();
    });

    it('refills the same slots when a job is regenerated, rather than duplicating', async () => {
      const { held } = await startJob('gen-idem');
      const resolved = context.resolve(PILOT);
      const args = {
        jobId: held.jobId,
        leaseEpoch: held.leaseEpoch,
        attempt: held.attempts,
        context: resolved,
        count: 2,
      };
      const first = await generator.generate(args);
      const second = await generator.generate({
        ...args,
        attempt: held.attempts + 1,
      });

      expect(
        await database.collection('engine_candidates').countDocuments(),
      ).toBe(2);
      expect(second.map((c) => c.candidateId)).toEqual(
        first.map((c) => c.candidateId),
      );
    });

    it('refuses to generate for a worker that lost its lease', async () => {
      const { held } = await startJob('gen-stale');
      await jobs.lease({
        owner: 'thief',
        now: new Date(Date.now() + 10 * 60_000),
      });
      await expect(
        generator.generate({
          jobId: held.jobId,
          leaseEpoch: held.leaseEpoch,
          attempt: held.attempts,
          context: context.resolve(PILOT),
          count: 2,
        }),
      ).rejects.toThrow(LeaseLostError);
      // And it spent nothing: the lease is checked before the reservation.
      expect(
        await database.collection('engine_candidates').countDocuments(),
      ).toBe(0);
    });

    it('fails loudly on malformed structured output, and still settles the call', async () => {
      const broken = new FakeAiProvider({ text: 'not json at all' });
      const { held } = await startJob('gen-bad');
      const generatorWithBroken = new CandidateGeneratorService(
        database.model('EngineCandidateDocument') as never,
        jobs,
        budget,
        {
          get: (k: string) =>
            ({ AI_PROVIDER: 'fake', ENGINE_GENERATION_MODEL: 'fake-model' })[k],
        } as never,
        broken,
      );
      await expect(
        generatorWithBroken.generate({
          jobId: held.jobId,
          leaseEpoch: held.leaseEpoch,
          attempt: held.attempts,
          context: context.resolve(PILOT),
          count: 2,
        }),
      ).rejects.toThrow(/CANDIDATE_JSON_INVALID/);

      const entry = await database
        .collection('engine_cost_ledger')
        .findOne({ jobId: held.jobId, stage: 'generation' });
      expect(entry!.status).toBe('reconciled'); // the call happened; it is charged
    });

    it('charges an ambiguous provider timeout instead of regenerating blindly', async () => {
      const timingOut = new FakeAiProvider({ timeout: true });
      const { held } = await startJob('gen-timeout');
      const generatorWithTimeout = new CandidateGeneratorService(
        database.model('EngineCandidateDocument') as never,
        jobs,
        budget,
        {
          get: (k: string) =>
            ({ AI_PROVIDER: 'fake', ENGINE_GENERATION_MODEL: 'fake-model' })[k],
        } as never,
        timingOut,
      );
      await expect(
        generatorWithTimeout.generate({
          jobId: held.jobId,
          leaseEpoch: held.leaseEpoch,
          attempt: held.attempts,
          context: context.resolve(PILOT),
          count: 2,
        }),
      ).rejects.toThrow(/timeout/);

      const entry = await database
        .collection('engine_cost_ledger')
        .findOne({ jobId: held.jobId, stage: 'generation' });
      expect(entry!.status).toBe('reconciled');
      expect(entry!.usageSource).toBe('unknown-timeout');
      expect(entry!.usageKnown).toBe(false);
      expect(
        await database.collection('engine_candidates').countDocuments(),
      ).toBe(0);
    });

    it('screens a generated batch and records the findings', async () => {
      const { held } = await startJob('gen-screen');
      const produced = await generator.generate({
        jobId: held.jobId,
        leaseEpoch: held.leaseEpoch,
        attempt: held.attempts,
        context: context.resolve(PILOT),
        count: 2,
      });

      screen.beginBatch();
      for (const candidate of produced) {
        const result = screen.screen(candidate.draft);
        await database.collection('engine_candidates').updateOne(
          { candidateId: candidate.candidateId },
          {
            $set: {
              status: result.passed ? 'screened_pass' : 'screened_reject',
              findings: result.findings,
            },
          },
        );
      }
      const passed = await database
        .collection('engine_candidates')
        .countDocuments({ status: 'screened_pass' });
      expect(passed).toBe(2);
      const stored = await database
        .collection('engine_candidates')
        .findOne({ candidateId: produced[0].candidateId });
      // Deferred checks are recorded, so a pass never over-claims.
      expect(
        stored!.findings.map((f: { code: string }) => f.code),
      ).not.toContain('COMPATIBILITY_POLICY_NOT_RUN');
    });
  });

  describe('Phase 1c durable orchestration', () => {
    beforeEach(async () =>
      seedInventoryTarget(database, 'video-games', 'overwatch'),
    );
    it('runs every stage and stops in an explicit human-review state', async () => {
      const { jobId } = await jobs.submit(
        request({ contextRevision: 'phase-1c-complete', targetCount: 2 }),
      );
      await expect(orchestrator.runNext('phase-1c-worker')).resolves.toEqual({
        jobId,
      });

      const job = await jobs.findById(jobId);
      expect(job!.status).toBe('awaiting_review');
      expect(job!.pipelineStage).toBe('awaiting_review');
      expect(Object.keys(job!.stageCheckpoints)).toEqual(
        expect.arrayContaining([
          'context_resolved',
          'generated',
          'screened',
          'verified',
          'compatibility_checked',
          'judged',
          'awaiting_review',
        ]),
      );
      const candidates = await database
        .collection('engine_candidates')
        .find({ jobId })
        .toArray();
      expect(candidates).toHaveLength(2);
      expect(
        candidates.every((item) => item.status === 'awaiting_review'),
      ).toBe(true);
      expect(candidates.every((item) => item.factVerification)).toBe(true);
      expect(candidates.every((item) => item.qualityEvaluation)).toBe(true);
      expect(candidates.every((item) => item.compatibilityEvaluation)).toBe(
        true,
      );
    });

    it('resumes after generation without paying for duplicate generation', async () => {
      const { held } = await startJob('phase-1c-recovery');
      await generator.generate({
        jobId: held.jobId,
        leaseEpoch: held.leaseEpoch,
        attempt: held.attempts,
        context: context.resolve(PILOT),
        count: 2,
      });
      const generationCallsBefore = fakeProvider.calls.filter(
        (call) =>
          'candidates' in ((call.responseSchema?.properties as object) ?? {}),
      ).length;
      await orchestrator.run(held);
      const generationCallsAfter = fakeProvider.calls.filter(
        (call) =>
          'candidates' in ((call.responseSchema?.properties as object) ?? {}),
      ).length;
      expect(generationCallsAfter).toBe(generationCallsBefore);
      expect((await jobs.findById(held.jobId))!.status).toBe('awaiting_review');
    });

    it('never lets a strong judge override a deterministic blocker', async () => {
      const { held } = await startJob('phase-1c-blocker');
      await database.collection('engine_candidates').insertOne({
        candidateId: 'blocked-candidate',
        jobId: held.jobId,
        ordinal: 0,
        status: 'generated',
        draft: {
          prompt: { ar: 'الإجابة مرسي فمن تختار؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'مرسي' } },
              { id: 'b', label: { ar: 'جنجي' } },
            ],
            correctOptionId: 'a',
          },
        },
        findings: [],
        contextHash: 'fixture',
        promptVersion: 'fixture',
        provider: 'fake',
        model: 'fake-model',
        attempt: held.attempts,
        factualClaims: [],
        writeEpoch: held.leaseEpoch,
      });
      const qualityCallsBefore = fakeProvider.calls.filter(
        (call) =>
          !(
            'candidates' in ((call.responseSchema?.properties as object) ?? {})
          ),
      ).length;
      await orchestrator.run(held);
      const qualityCallsAfter = fakeProvider.calls.filter(
        (call) =>
          !(
            'candidates' in ((call.responseSchema?.properties as object) ?? {})
          ),
      ).length;
      expect(qualityCallsAfter).toBe(qualityCallsBefore);
      const stored = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'blocked-candidate' });
      expect(stored!.status).toBe('screened_reject');
      expect(stored!.qualityEvaluation ?? null).toBeNull();
    });

    it('honours cancellation before the next stage', async () => {
      const { held } = await startJob('phase-1c-cancel');
      await jobs.requestCancellation(held.jobId);
      await orchestrator.run(held);
      expect((await jobs.findById(held.jobId))!.status).toBe('cancelled');
      expect(
        await database
          .collection('engine_candidates')
          .countDocuments({ jobId: held.jobId }),
      ).toBe(0);
    });

    it('Pilot 01: a token-exhausted judgement is settled at reported usage and handed to a human, not parked as ambiguous', async () => {
      const { held } = await startJob('phase-1c-quality-exhausted');
      await generator.generate({
        jobId: held.jobId,
        leaseEpoch: held.leaseEpoch,
        attempt: held.attempts,
        context: context.resolve(PILOT),
        count: 2,
      });
      const original = fakeProvider.generateText.bind(fakeProvider);
      const spy = jest
        .spyOn(fakeProvider, 'generateText')
        .mockImplementation(async (request) => {
          const isJudge = !(
            'candidates' in
            ((request.responseSchema?.properties as object) ?? {})
          );
          if (!isJudge) return original(request);
          throw new OpenRouterEmptyCompletionError({
            finishReason: 'length',
            nativeFinishReason: 'max_tokens',
            promptTokens: 3_000,
            completionTokens: 900,
            reasoningTokens: 900,
          });
        });
      try {
        await orchestrator.run(held);
      } finally {
        spy.mockRestore();
      }
      const job = await jobs.findById(held.jobId);
      expect(job!.status).toBe('awaiting_review');
      expect(job!.pipelineStage).not.toBe('provider_outcome_ambiguous');
      const rows = await database
        .collection('engine_candidates')
        .find({ jobId: held.jobId })
        .toArray();
      const judged = rows.filter((row) => row.qualityEvaluation);
      expect(judged.length).toBeGreaterThan(0);
      for (const row of judged) {
        expect(row.qualityEvaluation.error).toBe(
          PROVIDER_OUTPUT_TOKENS_EXHAUSTED,
        );
        expect(row.status).toBe('awaiting_review');
      }
      const entries = await database
        .collection('engine_cost_ledger')
        .find({ jobId: held.jobId, stage: 'quality' })
        .toArray();
      expect(entries.length).toBe(judged.length);
      for (const entry of entries) {
        expect(entry.status).toBe('reconciled');
        expect(entry.usageSource).toBe('reported');
        expect(entry.usageKnown).toBe(true);
        // 3,000 + 900 tokens at 1 SAR per million (fake rates).
        expect(entry.actualMicros).toBe(3_900);
      }
    });

    it('stops for human reconciliation after an ambiguous judge timeout', async () => {
      const { held } = await startJob('phase-1c-quality-timeout');
      await generator.generate({
        jobId: held.jobId,
        leaseEpoch: held.leaseEpoch,
        attempt: held.attempts,
        context: context.resolve(PILOT),
        count: 2,
      });
      timeoutQuality = true;
      await orchestrator.run(held);
      const job = await jobs.findById(held.jobId);
      expect(job!.status).toBe('awaiting_review');
      expect(job!.pipelineStage).toBe('provider_outcome_ambiguous');
      const entry = await database
        .collection('engine_cost_ledger')
        .findOne({ jobId: held.jobId, stage: 'quality' });
      expect(entry!.usageSource).toBe('unknown-timeout');
      expect(entry!.usageKnown).toBe(false);
    });
  });

  describe('Phase 2d — closest generation for the Puzzles pilot', () => {
    const CLOSEST_BATCH = JSON.stringify({
      candidates: [
        {
          prompt: 'كم يبلغ ارتفاع برج المملكة في الرياض بالأمتار تقريبًا؟',
          domainDescription: 'Heights of tall buildings, in metres',
          min: 0,
          max: 500,
          step: 5,
          correctValue: 300,
          unit: 'متر',
          factualClaims: ['Kingdom Centre is about 300 metres tall.'],
        },
      ],
    });

    const runClosest = async (text: string) => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                CONTENT_ENGINE_ENABLED: 'true',
                ENGINE_AUTHORING_ROOT: resolvePath(__dirname, '../../..'),
                ENGINE_PROVIDER_NAME: 'fake',
                ENGINE_GENERATION_MODEL: 'fake-model',
                ENGINE_QUALITY_MODEL: 'fake-model',
                ENGINE_MODEL_PRICING: PRICING,
                ENGINE_MONTHLY_CAP_SAR: '100',
                ENGINE_BATCH_CAP_SAR: '25',
              }),
            ],
          }),
          MongooseModule.forRoot(isolatedTestDatabaseUri('engine-closest')),
          ContentEngineModule,
        ],
      })
        .overrideProvider(ENGINE_AI_PROVIDER)
        .useValue(
          new FakeAiProvider({
            text,
            model: 'fake-model',
            usage: { promptTokens: 300, completionTokens: 120 },
          }),
        )
        .compile();

      const localJobs = moduleRef.get(GenerationJobService);
      const localOrchestrator = moduleRef.get(ContentEngineOrchestratorService);
      const conn = moduleRef.get<Connection>(getConnectionToken());
      await conn.syncIndexes();
      await seedInventoryTarget(conn, 'puzzles', 'numbers-estimation');
      for (const name of [
        'engine_jobs',
        'engine_candidates',
        'engine_cost_ledger',
        'engine_budget',
      ]) {
        await conn.collection(name).deleteMany({});
      }

      const submitted = await localJobs.submit({
        mechanicKey: 'closest',
        worldKey: 'puzzles',
        scopeKey: 'numbers-estimation',
        targetCount: 1,
        contextRevision: `closest-${Date.now()}-${Math.random()}`,
      });
      await localOrchestrator.runNext('closest-worker');

      const row = await conn.collection('engine_candidates').findOne({});
      // One job per isolated database here; read it directly rather than
      // casting a string id into an ObjectId filter.
      void submitted;
      const job = await conn.collection('engine_jobs').findOne({});
      const contentItems = await conn
        .collection('contentitems')
        .countDocuments();
      await conn.dropDatabase();
      await conn.close();
      return { row, job, contentItems };
    };

    it('resolves the canonical puzzles / numbers-estimation / closest context', () => {
      const resolved = context.resolve({
        mechanicKey: 'closest',
        worldKey: 'puzzles',
        scopeKey: 'numbers-estimation',
      });
      expect(resolved.mechanicKey).toBe('closest');
      expect(resolved.scope.length).toBeGreaterThan(0);
      expect(resolved.knowledge.length).toBeGreaterThan(0);
    });

    it('generates a canonical closest payload and passes screening', async () => {
      const { row, contentItems } = await runClosest(CLOSEST_BATCH);
      expect(row).toBeTruthy();
      expect(row!.promptVersion).toBe('closest-v2');

      const draft = row!.draft as {
        answerPayload: {
          mode: string;
          correctValue: number;
          acceptedTolerance?: number;
        };
        mechanicPayload: { closestSlider: Record<string, unknown> };
      };
      expect(draft.answerPayload.mode).toBe('closest');
      expect(draft.answerPayload.correctValue).toBe(300);
      // No tolerance is authored: the Closest runtime never reads one.
      expect(draft.answerPayload.acceptedTolerance).toBeUndefined();
      expect(draft.mechanicPayload.closestSlider).toMatchObject({
        mode: 'numeric-range',
        min: 0,
        max: 500,
        step: 5,
        unit: 'متر',
      });

      const blocking = (row!.findings as { severity: string }[]).filter(
        (finding) => finding.severity === 'blocking',
      );
      expect(blocking).toEqual([]);
      // Still a draft candidate only — nothing canonical was created.
      expect(contentItems).toBe(0);
    }, 60_000);

    it('blocks a target the slider cannot reach', async () => {
      const { row } = await runClosest(
        CLOSEST_BATCH.replace('"correctValue":300', '"correctValue":302'),
      );
      expect(
        (row!.findings as { code: string }[]).map((finding) => finding.code),
      ).toContain('CLOSEST_SLIDER_TARGET_STEP_INVALID');
      expect(row!.status).toBe('screened_reject');
    }, 60_000);

    it('blocks a target outside the authored span', async () => {
      const { row } = await runClosest(
        CLOSEST_BATCH.replace('"correctValue":300', '"correctValue":900'),
      );
      expect(
        (row!.findings as { code: string }[]).map((finding) => finding.code),
      ).toContain('CLOSEST_SLIDER_TARGET_OUT_OF_RANGE');
    }, 60_000);

    it('fails the batch when a numeric field is not a number', async () => {
      // Caught at parse: a NaN must never reach a stored document.
      const { job } = await runClosest(
        CLOSEST_BATCH.replace('"min":0', '"min":"zero"'),
      );
      expect(job!.lastError).toContain('CLOSEST_NUMERIC_FIELD_INVALID');
    }, 60_000);

    it('leaves the multiple-choice pipeline untouched', async () => {
      // The same engine, the RYO mechanic, the MC schema and version.
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                CONTENT_ENGINE_ENABLED: 'true',
                ENGINE_AUTHORING_ROOT: resolvePath(__dirname, '../../..'),
                ENGINE_PROVIDER_NAME: 'fake',
                ENGINE_GENERATION_MODEL: 'fake-model',
                ENGINE_MODEL_PRICING: PRICING,
                ENGINE_MONTHLY_CAP_SAR: '100',
                ENGINE_BATCH_CAP_SAR: '25',
              }),
            ],
          }),
          MongooseModule.forRoot(isolatedTestDatabaseUri('engine-mc-regress')),
          ContentEngineModule,
        ],
      })
        .overrideProvider(ENGINE_AI_PROVIDER)
        .useValue(
          new FakeAiProvider({
            text: ONE_CANDIDATE,
            model: 'fake-model',
            usage: { promptTokens: 100, completionTokens: 50 },
          }),
        )
        .compile();
      const localJobs = moduleRef.get(GenerationJobService);
      const localOrchestrator = moduleRef.get(ContentEngineOrchestratorService);
      const conn = moduleRef.get<Connection>(getConnectionToken());
      await conn.syncIndexes();
      await seedInventoryTarget(conn, 'video-games', 'overwatch');
      await localJobs.submit({
        mechanicKey: 'read-your-opponent',
        worldKey: 'video-games',
        scopeKey: 'overwatch',
        targetCount: 1,
        contextRevision: `mc-regress-${Date.now()}`,
      });
      await localOrchestrator.runNext('mc-worker');
      const row = await conn.collection('engine_candidates').findOne({});
      expect(row!.promptVersion).toBe('mc-v2');
      expect(
        (row!.draft as { answerPayload: { mode: string } }).answerPayload.mode,
      ).toBe('multiple_choice');
      await conn.dropDatabase();
      await conn.close();
    }, 60_000);
  });

  describe('Phase 2b — the judge is gated on verified facts', () => {
    /**
     * The live smoke test ran with no retriever and spent exactly one call:
     * the judge never fired because `mayJudge` requires SUPPORTED facts. That
     * is the engine refusing to pay for an opinion on an unverified claim, and
     * it is worth pinning — the cheap path must stay cheap.
     */
    const withRetriever = async (
      retrieve: () => Promise<unknown[]>,
    ): Promise<{ facts: string; judged: boolean; qualityCalls: number }> => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                CONTENT_ENGINE_ENABLED: 'true',
                ENGINE_AUTHORING_ROOT: resolvePath(__dirname, '../../..'),
                ENGINE_PROVIDER_NAME: 'fake',
                ENGINE_GENERATION_MODEL: 'fake-model',
                ENGINE_QUALITY_MODEL: 'fake-model',
                ENGINE_MODEL_PRICING: PRICING,
                ENGINE_MONTHLY_CAP_SAR: '100',
                ENGINE_BATCH_CAP_SAR: '25',
              }),
            ],
          }),
          MongooseModule.forRoot(isolatedTestDatabaseUri('engine-facts')),
          ContentEngineModule,
        ],
      })
        .overrideProvider(ENGINE_AI_PROVIDER)
        .useValue(
          new FakeAiProvider({
            text: ONE_CANDIDATE,
            model: 'fake-model',
            usage: { promptTokens: 100, completionTokens: 50 },
          }),
        )
        .overrideProvider(FACT_EVIDENCE_RETRIEVER)
        .useValue({ retrieve })
        .compile();

      const localJobs = moduleRef.get(GenerationJobService);
      const localOrchestrator = moduleRef.get(ContentEngineOrchestratorService);
      const conn = moduleRef.get<Connection>(getConnectionToken());
      await conn.syncIndexes();
      await seedInventoryTarget(conn, 'video-games', 'overwatch');
      for (const name of [
        'engine_jobs',
        'engine_candidates',
        'engine_cost_ledger',
        'engine_budget',
      ]) {
        await conn.collection(name).deleteMany({});
      }

      await localJobs.submit({
        mechanicKey: 'read-your-opponent',
        worldKey: 'video-games',
        scopeKey: 'overwatch',
        targetCount: 1,
        contextRevision: `facts-${Date.now()}`,
      });
      await localOrchestrator.runNext('facts-worker');

      const row = await conn.collection('engine_candidates').findOne({});
      const qualityCalls = await conn
        .collection('engine_cost_ledger')
        .countDocuments({ stage: 'quality' });
      const facts =
        (row?.factVerification as { state?: string })?.state ?? 'NONE';
      const judged = Boolean(row?.qualityEvaluation);
      await conn.dropDatabase();
      await conn.close();
      return { facts, judged, qualityCalls };
    };

    it('judges when retrieved evidence supports the claim', async () => {
      const result = await withRetriever(async () => [
        {
          sourceId: 'official:1',
          sourceName: 'Official',
          url: 'https://example.test/a',
          excerpt: 'Corroborating retrieved text.',
          retrievedAt: '2026-10-15T00:00:00.000Z',
          relation: 'supports',
        },
      ]);
      expect(result.facts).toBe('SUPPORTED');
      expect(result.judged).toBe(true);
      expect(result.qualityCalls).toBeGreaterThan(0);
    }, 60_000);

    it('skips the judge — and the spend — when nothing supports the claim', async () => {
      const result = await withRetriever(async () => [
        {
          sourceId: 'official:1',
          sourceName: 'Official',
          url: 'https://example.test/a',
          excerpt: 'Text that only mentions the subject.',
          retrievedAt: '2026-10-15T00:00:00.000Z',
          relation: 'mentions',
        },
      ]);
      expect(result.facts).toBe('UNSUPPORTED');
      expect(result.judged).toBe(false);
      expect(result.qualityCalls).toBe(0);
    }, 60_000);

    it('skips the judge when retrieval fails outright', async () => {
      // Retrieval failure is a different fact from "no evidence exists", and
      // both must stop short of a paid judgement.
      const result = await withRetriever(async () => {
        throw new Error('retrieval unavailable');
      });
      expect(result.facts).toBe('UNRESOLVED');
      expect(result.judged).toBe(false);
      expect(result.qualityCalls).toBe(0);
    }, 60_000);

    it('skips the judge when evidence contradicts the claim', async () => {
      const result = await withRetriever(async () => [
        {
          sourceId: 'official:1',
          sourceName: 'Official',
          url: 'https://example.test/a',
          excerpt: 'Retrieved text that refutes the claim.',
          retrievedAt: '2026-10-15T00:00:00.000Z',
          relation: 'contradicts',
        },
      ]);
      expect(result.facts).toBe('CONTRADICTED');
      expect(result.judged).toBe(false);
      expect(result.qualityCalls).toBe(0);
    }, 60_000);
  });

  describe('Phase 1d human review and canonical draft creation', () => {
    const actor = {
      id: 'admin-reviewer',
      fullName: 'Admin Reviewer',
      email: 'reviewer@example.test',
      role: 'admin',
      subscriptionStatus: 'active',
      freeGamesUsed: 0,
    } as never;

    const seedReviewCandidate = async (candidateId: string) => {
      const worldId = new Types.ObjectId();
      const scopeId = new Types.ObjectId();
      const challengeTypeId = new Types.ObjectId();
      await database.collection('worlds').insertOne({
        _id: worldId,
        name: 'Video Games',
        slug: 'video-games',
        status: 'draft',
        sortOrder: 0,
      });
      await database.collection('scopes').insertOne({
        _id: scopeId,
        worldId,
        name: 'Overwatch',
        slug: 'overwatch',
        excludedChallengeTypeIds: [],
        status: 'draft',
        sortOrder: 0,
      });
      await database.collection('challenge_types').insertOne({
        _id: challengeTypeId,
        name: 'Read Your Opponent',
        slug: 'read-your-opponent',
        family: 'ryo',
        itemStructure: 'discrete_triple',
        answerMode: 'ryo',
        defaultPresentation: {
          inputType: 'multiple_choice',
          timerSeconds: null,
        },
        scoringRuleId: 'ryo-payoff-matrix',
        status: 'draft',
        sortOrder: 0,
      });
      const jobId = new Types.ObjectId();
      await database.collection('engine_jobs').insertOne({
        _id: jobId,
        requestHash: `review-${candidateId}`,
        mechanicKey: 'read-your-opponent',
        worldKey: 'video-games',
        scopeKey: 'overwatch',
        targetCount: 1,
        status: 'awaiting_review',
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseEpoch: 1,
        attempts: 1,
        cancellationRequested: false,
        reservedMicros: 0,
        spentMicros: 0,
        pipelineStage: 'awaiting_review',
        stageCheckpoints: {},
      });
      await database.collection('engine_candidates').insertOne({
        candidateId,
        jobId: String(jobId),
        ordinal: 0,
        status: 'awaiting_review',
        draft: {
          prompt: { ar: 'أي بطل يملك قدرة الشفاء الجماعي؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'مرسي' } },
              { id: 'b', label: { ar: 'جنجي' } },
            ],
            correctOptionId: 'a',
          },
          metadata: { source: 'content-engine' },
        },
        findings: [],
        contextHash: 'review-fixture',
        promptVersion: 'ryo-v1',
        provider: 'fake',
        model: 'fake-model',
        attempt: 1,
        failureReason: null,
        factualClaims: ['Mercy can heal allies'],
        factVerification: {
          state: 'SUPPORTED',
          claims: [],
          automaticAdvance: false,
        },
        qualityEvaluation: { recommendation: 'PASS' },
        compatibilityEvaluation: { preDraft: { blockers: [] } },
        reviewRevision: 0,
        reviewStatus: 'pending',
        humanAssessment: null,
        reviewDecision: null,
        reviewEvents: [],
        publishedContentItemId: null,
        writeEpoch: 1,
      });
      return { jobId: String(jobId), worldId, scopeId, challengeTypeId };
    };

    const assessSupported = (candidateId: string, expectedRevision = 0) =>
      review.assess(
        candidateId,
        {
          expectedRevision,
          factualState: 'SUPPORTED',
          factualExplanation: 'Checked against official evidence.',
          evidence: [
            {
              url: 'https://example.test/official-evidence',
              title: 'Official evidence',
            },
          ],
          quality: {
            correctness: 5,
            mechanicFit: 4,
            clarity: 5,
            multiplayerFit: 4,
            originality: 4,
            explanation: 'Clear and suitable for multiplayer review.',
          },
        },
        actor,
      );

    const approve = (candidateId: string, expectedRevision = 1) =>
      review.approve(
        candidateId,
        { expectedRevision, explanation: 'Approved after human review.' },
        actor,
      );

    it('persists a fresh non-blocking historical notice atomically with approval', async () => {
      const { worldId, scopeId } = await seedReviewCandidate(
        'approval-inconclusive',
      );
      await assessSupported('approval-inconclusive');
      await database.collection('content_items').insertOne({
        worldId,
        scopeId,
        status: 'ready',
        prompt: { ar: 'من فينا يفضل تناول الفطور مع الأصدقاء كل صباح؟' },
        answerPayload: { mode: 'vote', consensusRule: 'majority' },
      });
      const approved = await approve('approval-inconclusive');
      expect(approved.reviewStatus).toBe('approved');
      const detail = await review.detail('approval-inconclusive');
      expect(detail.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'SUBJECTIVE_COMPARISON_INCONCLUSIVE',
            severity: 'deferred',
          }),
        ]),
      );
    });

    it('persists a newly discovered notice atomically with DRAFT creation', async () => {
      const { worldId, scopeId } =
        await seedReviewCandidate('draft-inconclusive');
      await assessSupported('draft-inconclusive');
      await approve('draft-inconclusive');
      await database.collection('content_items').insertOne({
        worldId,
        scopeId,
        status: 'ready',
        prompt: { ar: 'من فينا يفضل تناول الفطور مع الأصدقاء كل صباح؟' },
        answerPayload: { mode: 'vote', consensusRule: 'majority' },
      });
      const result = await review.createDraft('draft-inconclusive', 2, actor);
      expect(result.alreadyCreated).toBe(false);
      const detail = await review.detail('draft-inconclusive');
      expect(detail.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'SUBJECTIVE_COMPARISON_INCONCLUSIVE',
            severity: 'deferred',
          }),
        ]),
      );
      expect(
        (await review.createDraft('draft-inconclusive', 2, actor))
          .alreadyCreated,
      ).toBe(true);
    });

    it('does not overwrite newer findings when approval races a candidate update', async () => {
      const { worldId, scopeId } = await seedReviewCandidate(
        'approval-notice-cas',
      );
      await assessSupported('approval-notice-cas');
      await database.collection('content_items').insertOne({
        worldId,
        scopeId,
        status: 'ready',
        prompt: { ar: 'من فينا يفضل تناول الفطور مع الأصدقاء كل صباح؟' },
        answerPayload: { mode: 'vote', consensusRule: 'majority' },
      });
      const original = screen.loadHistoricalScope.bind(screen);
      let entered!: () => void;
      let release!: () => void;
      const reached = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = jest
        .spyOn(screen, 'loadHistoricalScope')
        .mockImplementationOnce(async (...args) => {
          const result = await original(...args);
          entered();
          await held;
          return result;
        });
      const approval = approve('approval-notice-cas').then(
        () => null,
        (error) => error,
      );
      try {
        await reached;
        const update = await database.collection('engine_candidates').updateOne(
          { candidateId: 'approval-notice-cas', reviewRevision: 1 },
          {
            $set: {
              findings: [
                {
                  code: 'NEWER_FINDING',
                  severity: 'warning',
                  message: 'newer',
                },
              ],
            },
            $inc: { reviewRevision: 1 },
          },
        );
        expect(update.modifiedCount).toBe(1);
        release();
        expect(await approval).toBeTruthy();
        const current = await database
          .collection('engine_candidates')
          .findOne({ candidateId: 'approval-notice-cas' });
        expect(current?.reviewRevision).toBe(2);
        expect(current?.reviewStatus).toBe('pending');
        expect(current?.findings).toEqual([
          expect.objectContaining({ code: 'NEWER_FINDING' }),
        ]);
      } finally {
        release();
        spy.mockRestore();
        await approval;
      }
    });

    it('blocks both already-approved duplicate drafts without weakening screening', async () => {
      const { scopeId } = await seedReviewCandidate('draft-approved-race-a');
      await assessSupported('draft-approved-race-a');
      await approve('draft-approved-race-a');
      const original = await database.collection('engine_candidates').findOne({
        candidateId: 'draft-approved-race-a',
      });
      const { _id, ...copy } = original!;
      expect(_id).toBeDefined();
      await database.collection('engine_candidates').insertOne({
        ...copy,
        candidateId: 'draft-approved-race-b',
        ordinal: 1,
      });
      const fenceModel = database.model('EngineInventoryFence');
      const realUpdate = fenceModel.updateOne.bind(fenceModel);
      let arrivals = 0;
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = jest.spyOn(fenceModel, 'updateOne').mockImplementation(((
        ...args: any[]
      ) => {
        const query = (realUpdate as any)(...args);
        if (args[2]?.session) {
          const execute = query.exec.bind(query);
          query.exec = async () => {
            if (++arrivals <= 2) {
              if (arrivals === 2) release();
              await barrier;
            }
            return execute();
          };
        }
        return query;
      }) as any);
      const timer = setTimeout(release, 5000);
      try {
        const outcomes = await Promise.allSettled([
          review.createDraft('draft-approved-race-a', 2, actor),
          review.createDraft('draft-approved-race-b', 2, actor),
        ]);
        expect(arrivals).toBeGreaterThanOrEqual(2);
        expect(outcomes.every((result) => result.status === 'rejected')).toBe(
          true,
        );
        for (const outcome of outcomes) {
          expect(String((outcome as PromiseRejectedResult).reason)).toContain(
            'Historical duplicate screening changed',
          );
        }
        expect(
          await database.collection('content_items').countDocuments(),
        ).toBe(0);
        expect(
          await database
            .collection('engine_draft_publications')
            .countDocuments(),
        ).toBe(0);
        const candidates = await database
          .collection('engine_candidates')
          .find({
            candidateId: {
              $in: ['draft-approved-race-a', 'draft-approved-race-b'],
            },
          })
          .toArray();
        expect(candidates).toHaveLength(2);
        for (const candidate of candidates) {
          expect(candidate.reviewStatus).toBe('approved');
          expect(candidate.publishedContentItemId).toBeNull();
          expect(candidate.reviewRevision).toBe(2);
          expect(
            candidate.reviewEvents.filter(
              (event: { action: string }) => event.action === 'draft_created',
            ),
          ).toHaveLength(0);
        }
        expect(
          (
            await database
              .collection('engine_inventory_fences')
              .findOne({ _id: scopeId })
          )?.revision,
        ).toBe(1);
      } finally {
        clearTimeout(timer);
        release();
        spy.mockRestore();
      }
      await review.reject(
        'draft-approved-race-b',
        {
          expectedRevision: 2,
          reasonCode: 'LOW_QUALITY',
          explanation: 'Reviewer resolved the duplicate conflict.',
        },
        actor,
      );
      const rescreened = await review.rescreenCandidate(
        'draft-approved-race-a',
        2,
        actor,
      );
      expect(
        rescreened.findings.some((finding: { code: string }) =>
          finding.code.startsWith('DUPLICATE_'),
        ),
      ).toBe(false);
      await assessSupported('draft-approved-race-a', 3);
      await approve('draft-approved-race-a', 4);
      const published = await review.createDraft(
        'draft-approved-race-a',
        5,
        actor,
      );
      expect(published.status).toBe('draft');
      expect(await database.collection('content_items').countDocuments()).toBe(
        1,
      );
      expect(
        await database.collection('engine_draft_publications').countDocuments(),
      ).toBe(1);
    });

    it('fences approval racing with publication across the inventory transition', async () => {
      await seedReviewCandidate('draft-approval-race-a');
      const original = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'draft-approval-race-a' });
      const { _id, ...copy } = original!;
      expect(_id).toBeDefined();
      await database.collection('engine_candidates').insertOne({
        ...copy,
        candidateId: 'draft-approval-race-b',
        ordinal: 1,
      });
      await assessSupported('draft-approval-race-a');
      await assessSupported('draft-approval-race-b');
      await approve('draft-approval-race-a');
      const fence = database.model('EngineInventoryFence');
      const update = fence.updateOne.bind(fence);
      let arrivals = 0;
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = jest.spyOn(fence, 'updateOne').mockImplementation(((
        ...args: any[]
      ) => {
        const query = (update as any)(...args);
        if (args[2]?.session) {
          const execute = query.exec.bind(query);
          query.exec = async () => {
            if (++arrivals <= 2) {
              if (arrivals === 2) release();
              await barrier;
            }
            return execute();
          };
        }
        return query;
      }) as any);
      const timer = setTimeout(release, 5000);
      try {
        const [draft, approval] = await Promise.allSettled([
          review.createDraft('draft-approval-race-a', 2, actor),
          approve('draft-approval-race-b'),
        ]);
        expect(arrivals).toBeGreaterThanOrEqual(2);
        expect(draft.status).toBe('fulfilled');
        expect(approval.status).toBe('rejected');
        expect(String((approval as PromiseRejectedResult).reason)).toContain(
          'Historical duplicate screening changed',
        );
        expect(
          await database.collection('content_items').countDocuments(),
        ).toBe(1);
        expect(
          await database
            .collection('engine_draft_publications')
            .countDocuments(),
        ).toBe(1);
        const b = await database
          .collection('engine_candidates')
          .findOne({ candidateId: 'draft-approval-race-b' });
        expect(b?.reviewStatus).toBe('pending');
        expect(
          b?.reviewEvents.filter(
            (event: { action: string }) => event.action === 'approved',
          ),
        ).toHaveLength(0);
      } finally {
        clearTimeout(timer);
        release();
        spy.mockRestore();
      }
    });

    it('rejects duplicate approval when it acquires the fence before draft creation', async () => {
      const { scopeId } = await seedReviewCandidate('draft-reverse-a');
      const original = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'draft-reverse-a' });
      const { _id, ...copy } = original!;
      expect(_id).toBeDefined();
      await database
        .collection('engine_candidates')
        .insertOne({ ...copy, candidateId: 'draft-reverse-b', ordinal: 1 });
      await assessSupported('draft-reverse-a');
      await assessSupported('draft-reverse-b');
      await approve('draft-reverse-a');
      let entered!: () => void;
      let attempted!: () => void;
      let release!: () => void;
      const reached = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const draftAttempted = new Promise<void>((resolve) => {
        attempted = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const load = screen.loadHistoricalScope.bind(screen);
      let firstLoad = true;
      const loadSpy = jest
        .spyOn(screen, 'loadHistoricalScope')
        .mockImplementation(async (params, screening) => {
          if (params.mongoSession && firstLoad) {
            firstLoad = false;
            entered();
            await held;
          }
          return load(params, screening);
        });
      const fences = database.model('EngineInventoryFence');
      const update = fences.updateOne.bind(fences);
      let draftStarted = false;
      const fenceSpy = jest.spyOn(fences, 'updateOne').mockImplementation(((
        ...args: any[]
      ) => {
        const query = (update as any)(...args);
        if (args[2]?.session && draftStarted) {
          const execute = query.exec.bind(query);
          query.exec = async () => {
            attempted();
            return execute();
          };
        }
        return query;
      }) as any);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('reverse fence ordering timed out')),
          5000,
        );
      });
      const approval = approve('draft-reverse-b');
      const observedApproval = approval.catch((error) => error);
      let draft: ReturnType<typeof review.createDraft> | undefined;
      try {
        await Promise.race([reached, timeout]);
        draftStarted = true;
        draft = review.createDraft('draft-reverse-a', 2, actor);
        await Promise.race([draftAttempted, timeout]);
        release();
        expect(String(await observedApproval)).toContain(
          'Historical duplicate screening changed',
        );
        expect((await draft).status).toBe('draft');
        const a = await database
          .collection('engine_candidates')
          .findOne({ candidateId: 'draft-reverse-a' });
        const b = await database
          .collection('engine_candidates')
          .findOne({ candidateId: 'draft-reverse-b' });
        expect(a?.reviewRevision).toBe(3);
        expect(a?.publishedContentItemId).toBeTruthy();
        expect(
          a?.reviewEvents.filter(
            (e: { action: string }) => e.action === 'draft_created',
          ),
        ).toHaveLength(1);
        expect(b?.reviewStatus).toBe('pending');
        expect(b?.reviewRevision).toBe(1);
        expect(b?.publishedContentItemId).toBeNull();
        expect(
          b?.reviewEvents.filter(
            (e: { action: string }) => e.action === 'approved',
          ),
        ).toHaveLength(0);
        expect(
          await database.collection('content_items').countDocuments(),
        ).toBe(1);
        expect(
          await database
            .collection('engine_draft_publications')
            .countDocuments(),
        ).toBe(1);
        expect(
          (
            await database
              .collection('engine_inventory_fences')
              .findOne({ _id: scopeId })
          )?.revision,
        ).toBe(2);
      } finally {
        release();
        if (timer) clearTimeout(timer);
        loadSpy.mockRestore();
        fenceSpy.mockRestore();
        await observedApproval;
        if (draft) await draft.catch(() => undefined);
      }
    });

    it('allows independent Scope drafts while one Scope transaction is held', async () => {
      const { worldId, jobId } = await seedReviewCandidate('draft-scope-a');
      await database.collection('scopes').insertOne({
        _id: new Types.ObjectId(),
        worldId,
        name: 'FIFA',
        slug: 'fifa',
        status: 'draft',
        excludedChallengeTypeIds: [],
      });
      const job = await database
        .collection('engine_jobs')
        .findOne({ _id: new Types.ObjectId(jobId) });
      const otherJobId = new Types.ObjectId();
      await database.collection('engine_jobs').insertOne({
        ...job!,
        _id: otherJobId,
        requestHash: 'draft-other-scope',
        scopeKey: 'fifa',
      });
      const original = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'draft-scope-a' });
      const { _id, ...copy } = original!;
      expect(_id).toBeDefined();
      await database.collection('engine_candidates').insertOne({
        ...copy,
        candidateId: 'draft-scope-b',
        jobId: String(otherJobId),
      });
      await assessSupported('draft-scope-a');
      await assessSupported('draft-scope-b');
      await approve('draft-scope-a');
      await approve('draft-scope-b');
      let entered!: () => void;
      let release!: () => void;
      const reached = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const load = screen.loadHistoricalScope.bind(screen);
      const spy = jest
        .spyOn(screen, 'loadHistoricalScope')
        .mockImplementation(async (params, session) => {
          if (params.mongoSession && params.scopeKey === 'overwatch') {
            entered();
            await held;
          }
          return load(params, session);
        });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('other Scope draft did not progress')),
          5000,
        );
      });
      const first = review.createDraft('draft-scope-a', 2, actor);
      try {
        await Promise.race([reached, timeout]);
        const second = await Promise.race([
          review.createDraft('draft-scope-b', 2, actor),
          timeout,
        ]);
        expect(second.status).toBe('draft');
      } finally {
        release();
        if (timer) clearTimeout(timer);
        spy.mockRestore();
      }
      expect((await first).status).toBe('draft');
      expect(await database.collection('content_items').countDocuments()).toBe(
        2,
      );
      expect(
        await database.collection('engine_draft_publications').countDocuments(),
      ).toBe(2);
    });

    it('returns the current revision when approval becomes stale before its transaction', async () => {
      await seedReviewCandidate('approval-cas-race');
      await assessSupported('approval-cas-race');
      const fences = database.model('EngineInventoryFence');
      const update = fences.updateOne.bind(fences);
      let reached!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = jest.spyOn(fences, 'updateOne').mockImplementation(((
        ...args: any[]
      ) => {
        const query = (update as any)(...args);
        if (args[2]?.upsert) {
          const execute = query.exec.bind(query);
          query.exec = async () => {
            reached();
            await held;
            return execute();
          };
        }
        return query;
      }) as any);
      const approval = approve('approval-cas-race');
      const observed = approval.catch((error) => error);
      try {
        await entered;
        await database
          .collection('engine_candidates')
          .updateOne(
            { candidateId: 'approval-cas-race' },
            { $inc: { reviewRevision: 1 } },
          );
        release();
        expect(await observed).toMatchObject({
          response: { expectedRevision: 1, currentRevision: 2 },
        });
        const row = await database
          .collection('engine_candidates')
          .findOne({ candidateId: 'approval-cas-race' });
        expect(row?.reviewStatus).toBe('pending');
        expect(
          row?.reviewEvents.filter(
            (event: { action: string }) => event.action === 'approved',
          ),
        ).toHaveLength(0);
      } finally {
        release();
        spy.mockRestore();
        await observed;
      }
    });

    it('blocks a saved in-batch overlap with no stable reference without changing approval state', async () => {
      await seedReviewCandidate('unacknowledged-batch-overlap');
      await assessSupported('unacknowledged-batch-overlap');
      await database.collection('engine_candidates').updateOne(
        { candidateId: 'unacknowledged-batch-overlap' },
        {
          $set: {
            findings: [
              {
                code: 'POTENTIAL_OVERLAP_IN_BATCH',
                severity: 'warning',
                message: 'possible overlap',
              },
            ],
          },
        },
      );
      await expect(
        approve('unacknowledged-batch-overlap'),
      ).rejects.toMatchObject({
        response: { code: 'OVERLAP_EVIDENCE_UNVERIFIABLE' },
      });
      const row = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'unacknowledged-batch-overlap' });
      expect(row?.reviewStatus).toBe('pending');
      expect(row?.reviewRevision).toBe(1);
      expect(
        row?.reviewEvents.filter(
          (event: { action: string }) => event.action === 'approved',
        ),
      ).toHaveLength(0);
      // R4-B: this candidate has no earlier sibling in its batch, so a fresh
      // re-screen proves the legacy claim no longer holds and records why.
      const rescreened = await review.rescreenCandidate(
        'unacknowledged-batch-overlap',
        1,
        actor,
      );
      expect(
        rescreened.findings.some(
          (f: { code: string }) => f.code === 'POTENTIAL_OVERLAP_IN_BATCH',
        ),
      ).toBe(false);
      expect(
        rescreened.reviewEvents.at(-1)?.details?.legacyBatchOverlapRecovery,
      ).toEqual({ legacy: 1, rebuilt: 0, resolved: 1, kept: 0 });
      await assessSupported('unacknowledged-batch-overlap', 2);
      const approved = await approve('unacknowledged-batch-overlap', 3);
      expect(approved.reviewStatus).toBe('approved');
    });

    it('blocks DRAFT creation for an approved candidate with an unacknowledged overlap', async () => {
      await seedReviewCandidate('approved-with-unacknowledged-overlap');
      await assessSupported('approved-with-unacknowledged-overlap');
      await approve('approved-with-unacknowledged-overlap');
      await database.collection('engine_candidates').updateOne(
        { candidateId: 'approved-with-unacknowledged-overlap' },
        {
          $set: {
            findings: [
              {
                code: 'POTENTIAL_OVERLAP_IN_BATCH',
                severity: 'warning',
                message: 'possible overlap',
              },
            ],
          },
        },
      );
      await expect(
        review.createDraft('approved-with-unacknowledged-overlap', 2, actor),
      ).rejects.toMatchObject({
        response: { code: 'OVERLAP_EVIDENCE_UNVERIFIABLE' },
      });
      expect(await database.collection('content_items').countDocuments()).toBe(
        0,
      );
      expect(
        await database.collection('engine_draft_publications').countDocuments(),
      ).toBe(0);
    });

    describe('R4-A overlap acknowledgment contract', () => {
      const telephone = {
        prompt: { ar: 'من مخترع الهاتف؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: '1', label: { ar: 'ألكسندر غراهام بيل' } },
            { id: '2', label: { ar: 'توماس إديسون' } },
          ],
          correctOptionId: '1',
        },
      };
      const telephoneVariant = {
        prompt: { ar: 'من مخترع التليفون؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'ألكسندر غراهام بيل' } },
            { id: 'b', label: { ar: 'نيكولا تيسلا' } },
          ],
          correctOptionId: 'a',
        },
        metadata: { source: 'content-engine' },
      };

      const seedOverlapCandidate = async (candidateId: string) => {
        const seeded = await seedReviewCandidate(candidateId);
        await database
          .collection('engine_candidates')
          .updateOne({ candidateId }, { $set: { draft: telephoneVariant } });
        return seeded;
      };
      const insertReady = (
        worldId: Types.ObjectId,
        scopeId: Types.ObjectId,
        draft: Record<string, unknown> = telephone,
      ) =>
        database
          .collection('content_items')
          .insertOne({ worldId, scopeId, status: 'ready', ...draft });
      const approveWith = (
        candidateId: string,
        expectedRevision: number,
        fingerprints: string[],
      ) =>
        review.approve(
          candidateId,
          {
            expectedRevision,
            explanation: 'Overlap reviewed; the angle is distinct.',
            overlapAcknowledgments: fingerprints.map((fingerprint) => ({
              fingerprint,
            })),
          },
          actor,
        );
      const rejection = (promise: Promise<unknown>) =>
        promise.then(
          () => {
            throw new Error('expected a rejection');
          },
          (error: { response?: any }) => error,
        );
      const row = (candidateId: string) =>
        database.collection('engine_candidates').findOne({ candidateId });
      const approvedEvents = (doc: any) =>
        (doc?.reviewEvents ?? []).filter(
          (event: { action: string }) => event.action === 'approved',
        );

      it('requires acknowledgment of the exact current evidence, then persists it atomically with approval', async () => {
        const { worldId, scopeId } = await seedOverlapCandidate('r4a-valid');
        const item = await insertReady(worldId, scopeId);
        await assessSupported('r4a-valid');

        const missing = await rejection(approve('r4a-valid'));
        expect(missing.response.code).toBe('OVERLAP_ACKNOWLEDGMENT_REQUIRED');
        const [overlap] = missing.response.details.overlaps;
        expect(missing.response.details.overlaps).toHaveLength(1);
        expect(overlap).toMatchObject({
          code: 'POTENTIAL_OVERLAP_HISTORICAL_CONTENT',
          reference: { kind: 'CANONICAL_READY', id: String(item.insertedId) },
        });
        expect(overlap.fingerprint).toMatch(/^ovl1:[0-9a-f]{64}$/);
        let current = await row('r4a-valid');
        expect(current?.reviewStatus).toBe('pending');
        expect(current?.reviewRevision).toBe(1);
        expect(approvedEvents(current)).toHaveLength(0);
        expect(
          (
            await database
              .collection('engine_inventory_fences')
              .findOne({ _id: scopeId })
          )?.revision,
        ).toBe(0);

        // A well-formed but invented fingerprint is never accepted.
        const forged = `ovl1:${'0'.repeat(64)}`;
        const forgedOnly = await rejection(
          approveWith('r4a-valid', 1, [forged]),
        );
        expect(forgedOnly.response.code).toBe(
          'OVERLAP_ACKNOWLEDGMENT_REQUIRED',
        );
        expect(forgedOnly.response.details.stale).toEqual([forged]);
        const extra = await rejection(
          approveWith('r4a-valid', 1, [overlap.fingerprint, forged]),
        );
        expect(extra.response.code).toBe('OVERLAP_ACKNOWLEDGMENT_STALE');
        expect((await row('r4a-valid'))?.reviewStatus).toBe('pending');

        const approved = await approveWith('r4a-valid', 1, [
          overlap.fingerprint,
        ]);
        expect(approved.reviewStatus).toBe('approved');
        current = await row('r4a-valid');
        expect(current?.reviewDecision.overlapAcknowledgments).toEqual([
          expect.objectContaining({
            fingerprint: overlap.fingerprint,
            code: 'POTENTIAL_OVERLAP_HISTORICAL_CONTENT',
            acknowledgedRevision: 1,
            reference: expect.objectContaining({
              kind: 'CANONICAL_READY',
              id: String(item.insertedId),
            }),
          }),
        ]);
        expect(approvedEvents(current)).toHaveLength(1);
        expect(
          approvedEvents(current)[0].details.overlapAcknowledgments,
        ).toEqual([overlap.fingerprint]);

        // DRAFT creation revalidates the persisted acknowledgment and passes.
        const draft = await review.createDraft('r4a-valid', 2, actor);
        expect(draft.alreadyCreated).toBe(false);
        expect(
          await database.collection('content_items').countDocuments(),
        ).toBe(2);
      });

      it('refuses an acknowledgment submitted against a stale revision', async () => {
        const { worldId, scopeId } = await seedOverlapCandidate('r4a-stale');
        await insertReady(worldId, scopeId);
        await assessSupported('r4a-stale');
        const missing = await rejection(approve('r4a-stale'));
        const fingerprint = missing.response.details.overlaps[0].fingerprint;
        const stale = await rejection(
          approveWith('r4a-stale', 0, [fingerprint]),
        );
        expect(stale.response).toMatchObject({
          expectedRevision: 0,
          currentRevision: 1,
        });
        const current = await row('r4a-stale');
        expect(current?.reviewStatus).toBe('pending');
        expect(current?.reviewDecision).toBeNull();
      });

      it('treats changed reference evidence as unacknowledged', async () => {
        const { worldId, scopeId } = await seedOverlapCandidate('r4a-changed');
        const item = await insertReady(worldId, scopeId);
        await assessSupported('r4a-changed');
        const first = await rejection(approve('r4a-changed'));
        const original = first.response.details.overlaps[0].fingerprint;
        await database.collection('content_items').updateOne(
          { _id: item.insertedId },
          {
            $set: {
              'answerPayload.options.1.label.ar': 'غوليلمو ماركوني',
            },
          },
        );
        const changed = await rejection(
          approveWith('r4a-changed', 1, [original]),
        );
        expect(changed.response.code).toMatch(
          /^OVERLAP_ACKNOWLEDGMENT_(REQUIRED|STALE)$/,
        );
        expect(changed.response.details.stale).toEqual([original]);
        expect(
          changed.response.details.overlaps.map(
            (o: { fingerprint: string }) => o.fingerprint,
          ),
        ).not.toContain(original);
        expect((await row('r4a-changed'))?.reviewStatus).toBe('pending');
      });

      it('keeps proven duplicates blocked regardless of acknowledgments', async () => {
        const { worldId, scopeId } = await seedOverlapCandidate('r4a-dup');
        await insertReady(worldId, scopeId, telephoneVariant);
        await assessSupported('r4a-dup');
        await expect(
          approveWith('r4a-dup', 1, [`ovl1:${'1'.repeat(64)}`]),
        ).rejects.toThrow('Historical duplicate screening changed');
        expect((await row('r4a-dup'))?.reviewStatus).toBe('pending');
      });

      it('identifies the referenced batch candidate and revalidates it at DRAFT creation', async () => {
        const { jobId } = await seedOverlapCandidate('r4a-batch');
        const target = await row('r4a-batch');
        const { _id, ...copy } = target!;
        expect(_id).toBeDefined();
        await database.collection('engine_candidates').insertOne({
          ...copy,
          candidateId: 'r4a-batch-sibling',
          ordinal: 1,
          draft: { ...telephone, metadata: { source: 'content-engine' } },
        });
        const batch = screen.createSession({
          worldKey: 'video-games',
          scopeKey: 'overwatch',
        });
        screen.screen(
          { ...telephone, metadata: { source: 'content-engine' } },
          null,
          {
            candidateId: 'r4a-batch-sibling',
            worldKey: 'video-games',
            scopeKey: 'overwatch',
            session: batch,
          },
        );
        const screened = screen.screen(telephoneVariant, null, {
          candidateId: 'r4a-batch',
          worldKey: 'video-games',
          scopeKey: 'overwatch',
          session: batch,
        });
        const stored = screened.findings.filter(
          (f) => f.code === 'POTENTIAL_OVERLAP_IN_BATCH',
        );
        expect(stored).toHaveLength(1);
        expect(stored[0].evidence?.reference).toMatchObject({
          kind: 'BATCH_CANDIDATE',
          id: 'r4a-batch-sibling',
        });
        await database
          .collection('engine_candidates')
          .updateOne(
            { candidateId: 'r4a-batch' },
            { $set: { findings: stored } },
          );
        await assessSupported('r4a-batch');

        const missing = await rejection(approve('r4a-batch'));
        expect(missing.response.code).toBe('OVERLAP_ACKNOWLEDGMENT_REQUIRED');
        expect(missing.response.details.overlaps).toEqual([
          expect.objectContaining({
            fingerprint: stored[0].fingerprint,
            reference: expect.objectContaining({
              kind: 'BATCH_CANDIDATE',
              id: 'r4a-batch-sibling',
            }),
          }),
        ]);
        await approveWith('r4a-batch', 1, [stored[0].fingerprint!]);
        expect((await row('r4a-batch'))?.reviewStatus).toBe('approved');
        expect(jobId).toBeDefined();

        // The sibling changes after approval: the acknowledged evidence is gone.
        await database.collection('engine_candidates').updateOne(
          { candidateId: 'r4a-batch-sibling' },
          {
            $set: {
              'draft.answerPayload.options.1.label.ar': 'غوليلمو ماركوني',
            },
          },
        );
        await expect(
          review.createDraft('r4a-batch', 2, actor),
        ).rejects.toMatchObject({
          response: { code: 'OVERLAP_ACKNOWLEDGMENT_REQUIRED' },
        });
        expect(
          await database
            .collection('engine_draft_publications')
            .countDocuments(),
        ).toBe(0);
        expect(
          await database.collection('content_items').countDocuments(),
        ).toBe(0);

        // A rejected sibling can no longer enter inventory without screening
        // against this candidate, so its batch evidence no longer applies.
        await database
          .collection('engine_candidates')
          .updateOne(
            { candidateId: 'r4a-batch-sibling' },
            { $set: { reviewStatus: 'rejected' } },
          );
        const created = await review.createDraft('r4a-batch', 2, actor);
        expect(created.alreadyCreated).toBe(false);
      });

      it('blocks DRAFT creation on a new overlap and returns the candidate to review on re-screen', async () => {
        const { worldId, scopeId } = await seedOverlapCandidate('r4a-new');
        await assessSupported('r4a-new');
        await approve('r4a-new');
        expect(
          (await row('r4a-new'))?.reviewDecision.overlapAcknowledgments,
        ).toEqual([]);
        await insertReady(worldId, scopeId);

        const blocked = await rejection(
          review.createDraft('r4a-new', 2, actor),
        );
        expect(blocked.response.code).toBe('OVERLAP_ACKNOWLEDGMENT_REQUIRED');
        const fingerprint = blocked.response.details.overlaps[0].fingerprint;
        expect(
          await database.collection('content_items').countDocuments(),
        ).toBe(1);
        expect(
          await database
            .collection('engine_draft_publications')
            .countDocuments(),
        ).toBe(0);
        let current = await row('r4a-new');
        expect(current?.reviewStatus).toBe('approved');
        expect(current?.reviewRevision).toBe(2);

        // Re-screen surfaces the evidence and revokes the stale approval.
        await review.rescreenCandidate('r4a-new', 2, actor);
        current = await row('r4a-new');
        expect(current?.reviewStatus).toBe('pending');
        expect(current?.reviewDecision).toBeNull();
        expect(current?.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'POTENTIAL_OVERLAP_HISTORICAL_CONTENT',
              fingerprint,
            }),
          ]),
        );
        const revocation = current?.reviewEvents.at(-1);
        expect(revocation.details.approvalRevoked).toMatchObject({
          reasons: ['OVERLAP_EVIDENCE_UNACKNOWLEDGED'],
          unacknowledgedFingerprints: [fingerprint],
          previousDecisionRevision: 2,
        });

        await assessSupported('r4a-new', 3);
        await approveWith('r4a-new', 4, [fingerprint]);
        const created = await review.createDraft('r4a-new', 5, actor);
        expect(created.alreadyCreated).toBe(false);
      });

      it('keeps an approval whose acknowledged evidence is unchanged on re-screen', async () => {
        const { worldId, scopeId } = await seedOverlapCandidate('r4a-keep');
        await insertReady(worldId, scopeId);
        await assessSupported('r4a-keep');
        const missing = await rejection(approve('r4a-keep'));
        const fingerprint = missing.response.details.overlaps[0].fingerprint;
        await approveWith('r4a-keep', 1, [fingerprint]);
        expect((await row('r4a-keep'))?.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'POTENTIAL_OVERLAP_HISTORICAL_CONTENT',
              fingerprint,
            }),
          ]),
        );
        await review.rescreenCandidate('r4a-keep', 2, actor);
        const current = await row('r4a-keep');
        expect(current?.reviewStatus).toBe('approved');
        expect(
          current?.reviewEvents.at(-1).details.approvalRevoked,
        ).toBeUndefined();
        expect(current?.reviewDecision.overlapAcknowledgments).toEqual([
          expect.objectContaining({ fingerprint }),
        ]);
        // R4-C (owner-approved Option B): the unchanged re-screen carried the
        // approval forward, so the DRAFT is accepted at the new revision.
        expect(current?.reviewEvents.at(-1).action).toBe(
          'approval_carried_forward',
        );
        await database.collection('content_items').insertOne({
          worldId,
          scopeId,
          status: 'ready',
          prompt: { ar: 'من فينا يفضل تناول الفطور مع الأصدقاء كل صباح؟' },
          answerPayload: { mode: 'vote', consensusRule: 'majority' },
        });
        const created = await review.createDraft('r4a-keep', 3, actor);
        expect(created.alreadyCreated).toBe(false);
        const published = await row('r4a-keep');
        expect(published?.reviewDecision.overlapAcknowledgments).toEqual([
          expect.objectContaining({ fingerprint }),
        ]);
        expect(published?.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'SUBJECTIVE_COMPARISON_INCONCLUSIVE',
            }),
          ]),
        );
      });

      it('rolls back approval, acknowledgment and fence together when the write fails', async () => {
        const { worldId, scopeId } = await seedOverlapCandidate('r4a-rollback');
        await insertReady(worldId, scopeId);
        await assessSupported('r4a-rollback');
        const missing = await rejection(approve('r4a-rollback'));
        const fingerprint = missing.response.details.overlaps[0].fingerprint;
        const model = database.model('EngineCandidateDocument');
        const spy = jest
          .spyOn(model, 'findOneAndUpdate')
          .mockImplementationOnce((() => ({
            lean: () => ({
              exec: async () => {
                throw new Error('simulated approval write failure');
              },
            }),
          })) as any);
        try {
          await expect(
            approveWith('r4a-rollback', 1, [fingerprint]),
          ).rejects.toThrow('simulated approval write failure');
        } finally {
          spy.mockRestore();
        }
        const current = await row('r4a-rollback');
        expect(current?.reviewStatus).toBe('pending');
        expect(current?.reviewDecision).toBeNull();
        expect(current?.reviewRevision).toBe(1);
        expect(approvedEvents(current)).toHaveLength(0);
        expect(
          (
            await database
              .collection('engine_inventory_fences')
              .findOne({ _id: scopeId })
          )?.revision,
        ).toBe(0);
      });

      it('retries a transient failure and persists one approval with its acknowledgment', async () => {
        const { worldId, scopeId } = await seedOverlapCandidate('r4a-retry');
        await insertReady(worldId, scopeId);
        await assessSupported('r4a-retry');
        const missing = await rejection(approve('r4a-retry'));
        const fingerprint = missing.response.details.overlaps[0].fingerprint;
        const transient = new mongo.MongoServerError({
          message: 'simulated transient approval write',
        });
        transient.addErrorLabel('TransientTransactionError');
        const model = database.model('EngineCandidateDocument');
        const spy = jest
          .spyOn(model, 'findOneAndUpdate')
          .mockImplementationOnce((() => ({
            lean: () => ({
              exec: async () => {
                throw transient;
              },
            }),
          })) as any);
        try {
          const approved = await approveWith('r4a-retry', 1, [fingerprint]);
          expect(approved.reviewStatus).toBe('approved');
          expect(spy).toHaveBeenCalledTimes(2);
        } finally {
          spy.mockRestore();
        }
        const current = await row('r4a-retry');
        expect(approvedEvents(current)).toHaveLength(1);
        expect(current?.reviewDecision.overlapAcknowledgments).toHaveLength(1);
        expect(
          (
            await database
              .collection('engine_inventory_fences')
              .findOne({ _id: scopeId })
          )?.revision,
        ).toBe(1);
      });

      describe('R4-B workflow and legacy recovery', () => {
        const persistScreening = async (
          candidateId: string,
          draft: Record<string, unknown>,
        ) => {
          // The orchestrator's screening stage: fresh inventory, real screen,
          // findings persisted as generated.
          const session = screen.createSession({
            worldKey: 'video-games',
            scopeKey: 'overwatch',
          });
          const inventory = await screen.loadHistoricalScope(
            { worldKey: 'video-games', scopeKey: 'overwatch' },
            session,
          );
          expect(inventory.status).toBe('COMPLETE');
          const result = screen.screen(draft, null, {
            candidateId,
            worldKey: 'video-games',
            scopeKey: 'overwatch',
            session,
          });
          await database
            .collection('engine_candidates')
            .updateOne(
              { candidateId },
              { $set: { findings: result.findings } },
            );
          return result.findings;
        };

        it('runs screen → review → acknowledge → approve → rescreen → DRAFT end to end', async () => {
          const { worldId, scopeId } = await seedOverlapCandidate('r4b-flow');
          await insertReady(worldId, scopeId);
          const findings = await persistScreening('r4b-flow', telephoneVariant);
          const stored = findings.find(
            (f) => f.code === 'POTENTIAL_OVERLAP_HISTORICAL_CONTENT',
          );
          expect(stored?.fingerprint).toMatch(/^ovl1:[0-9a-f]{64}$/);

          // Review: the detail view exposes the stored evidence.
          await assessSupported('r4b-flow');
          const detail = await review.detail('r4b-flow');
          expect(detail.findings).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                fingerprint: stored!.fingerprint,
                evidence: expect.objectContaining({
                  reference: expect.objectContaining({
                    kind: 'CANONICAL_READY',
                  }),
                }),
              }),
            ]),
          );

          // Approval without the acknowledgment is refused; with the stored
          // (screen-time) fingerprint it is accepted: both paths agree.
          await expect(approve('r4b-flow')).rejects.toMatchObject({
            response: { code: 'OVERLAP_ACKNOWLEDGMENT_REQUIRED' },
          });
          await approveWith('r4b-flow', 1, [stored!.fingerprint!]);
          let current = await review.detail('r4b-flow');
          expect(current.reviewStatus).toBe('approved');
          expect(current.reviewEligibility.canCreateDraft).toBe(true);
          expect(current.reviewEligibility.draftBlockers).toEqual([]);

          // Unchanged re-screen: R4-C carries the approval forward, so it
          // stays approved and DRAFT-eligible at the new revision.
          await review.rescreenCandidate('r4b-flow', 2, actor);
          current = await review.detail('r4b-flow');
          expect(current.reviewStatus).toBe('approved');
          expect(current.reviewRevision).toBe(3);
          expect(current.reviewEligibility.canCreateDraft).toBe(true);
          expect(current.reviewEligibility.draftBlockers).toEqual([]);

          // The DRAFT is created once at the carried-forward revision.
          const created = await review.createDraft('r4b-flow', 3, actor);
          expect(created.alreadyCreated).toBe(false);
          const again = await review.createDraft('r4b-flow', 3, actor);
          expect(again).toMatchObject({
            alreadyCreated: true,
            contentItemId: created.contentItemId,
          });
          expect(
            await database
              .collection('engine_draft_publications')
              .countDocuments({ candidateId: 'r4b-flow' }),
          ).toBe(1);
        });

        it('blocks the DRAFT step when the referenced item changes after approval', async () => {
          const { worldId, scopeId } =
            await seedOverlapCandidate('r4b-blocked');
          const item = await insertReady(worldId, scopeId);
          const findings = await persistScreening(
            'r4b-blocked',
            telephoneVariant,
          );
          const fingerprint = findings.find((f) => f.fingerprint)!.fingerprint!;
          await assessSupported('r4b-blocked');
          await approveWith('r4b-blocked', 1, [fingerprint]);
          await database.collection('content_items').updateOne(
            { _id: item.insertedId },
            {
              $set: { 'answerPayload.options.1.label.ar': 'غوليلمو ماركوني' },
            },
          );
          const blocked = await rejection(
            review.createDraft('r4b-blocked', 2, actor),
          );
          expect(blocked.response.code).toBe('OVERLAP_ACKNOWLEDGMENT_REQUIRED');
          expect(
            await database
              .collection('engine_draft_publications')
              .countDocuments(),
          ).toBe(0);
          const fence = await database
            .collection('engine_inventory_fences')
            .findOne({ _id: scopeId });
          // Approval committed its fence increment; the refused DRAFT rolled back.
          expect(fence?.revision).toBe(1);
        });

        const seedLegacy = async (siblingDraft: Record<string, unknown>) => {
          await seedOverlapCandidate('r4b-legacy');
          const target = await row('r4b-legacy');
          const { _id, ...copy } = target!;
          expect(_id).toBeDefined();
          await database.collection('engine_candidates').updateOne(
            { candidateId: 'r4b-legacy' },
            {
              $set: {
                ordinal: 1,
                findings: [
                  {
                    code: 'POTENTIAL_OVERLAP_IN_BATCH',
                    severity: 'warning',
                    message:
                      'another candidate in this batch potentially overlaps',
                  },
                ],
              },
            },
          );
          await database.collection('engine_candidates').insertOne({
            ...copy,
            candidateId: 'r4b-legacy-sibling',
            ordinal: 0,
            draft: siblingDraft,
            findings: [],
          });
        };

        it('reconstructs a legacy in-batch overlap into referenced, acknowledgeable evidence on re-screen', async () => {
          await seedLegacy({
            ...telephone,
            metadata: { source: 'content-engine' },
          });
          await assessSupported('r4b-legacy');
          await expect(approve('r4b-legacy')).rejects.toMatchObject({
            response: { code: 'OVERLAP_EVIDENCE_UNVERIFIABLE' },
          });
          await review.rescreenCandidate('r4b-legacy', 1, actor);
          const current = await row('r4b-legacy');
          const rebuilt = current?.findings.filter(
            (f: { code: string }) => f.code === 'POTENTIAL_OVERLAP_IN_BATCH',
          );
          expect(rebuilt).toHaveLength(1);
          expect(rebuilt[0].fingerprint).toMatch(/^ovl1:[0-9a-f]{64}$/);
          expect(rebuilt[0].evidence.reference).toMatchObject({
            kind: 'BATCH_CANDIDATE',
            id: 'r4b-legacy-sibling',
          });
          expect(
            current?.reviewEvents.at(-1).details.legacyBatchOverlapRecovery,
          ).toEqual({ legacy: 1, rebuilt: 1, resolved: 0, kept: 0 });
          await assessSupported('r4b-legacy', 2);
          await expect(approve('r4b-legacy', 3)).rejects.toMatchObject({
            response: { code: 'OVERLAP_ACKNOWLEDGMENT_REQUIRED' },
          });
          await approveWith('r4b-legacy', 3, [rebuilt[0].fingerprint]);
          expect((await row('r4b-legacy'))?.reviewStatus).toBe('approved');
        });

        it('keeps a legacy in-batch overlap fail-closed when a sibling cannot be compared', async () => {
          await seedLegacy({
            ...telephone,
            metadata: { source: 'content-engine', familyKey: 'a' },
          });
          await database
            .collection('engine_candidates')
            .updateOne(
              { candidateId: 'r4b-legacy-sibling' },
              { $set: { authoring: { familyKey: 'b' } } },
            );
          await review.rescreenCandidate('r4b-legacy', 0, actor);
          const current = await row('r4b-legacy');
          const legacy = current?.findings.filter(
            (f: { code: string }) => f.code === 'POTENTIAL_OVERLAP_IN_BATCH',
          );
          expect(legacy).toHaveLength(1);
          expect(legacy[0].fingerprint).toBeUndefined();
          expect(
            current?.reviewEvents.at(-1).details.legacyBatchOverlapRecovery,
          ).toEqual({ legacy: 1, rebuilt: 0, resolved: 0, kept: 1 });
          await assessSupported('r4b-legacy', 1);
          await expect(approve('r4b-legacy', 2)).rejects.toMatchObject({
            response: { code: 'OVERLAP_EVIDENCE_UNVERIFIABLE' },
          });
        });
      });

      describe('R4-C approval carry-forward on unchanged re-screen', () => {
        const approvedCandidate = async (
          candidateId: string,
          options: { overlap?: boolean } = {},
        ) => {
          const seeded = await seedOverlapCandidate(candidateId);
          const item = options.overlap
            ? await insertReady(seeded.worldId, seeded.scopeId)
            : null;
          await assessSupported(candidateId);
          let fingerprints: string[] = [];
          if (options.overlap) {
            const missing = await rejection(approve(candidateId));
            fingerprints = missing.response.details.overlaps.map(
              (o: { fingerprint: string }) => o.fingerprint,
            );
          }
          await approveWith(candidateId, 1, fingerprints);
          return { ...seeded, item, fingerprints };
        };
        const events = async (candidateId: string) =>
          ((await row(candidateId))?.reviewEvents ?? []) as Array<{
            action: string;
            revision: number;
            actorEmail: string;
            details: any;
          }>;
        const fenceRevision = async (scopeId: Types.ObjectId) =>
          (
            await database
              .collection('engine_inventory_fences')
              .findOne({ _id: scopeId })
          )?.revision;
        const expectRevoked = async (candidateId: string, reason: string) => {
          const current = await row(candidateId);
          expect(current?.reviewStatus).toBe('pending');
          expect(current?.reviewDecision).toBeNull();
          const last = current?.reviewEvents.at(-1);
          expect(last.action).toBe('edited');
          expect(last.details.approvalRevoked.reasons).toContain(reason);
          expect(
            current?.reviewEvents.some(
              (e: { action: string }) =>
                e.action === 'approval_carried_forward',
            ),
          ).toBe(false);
          await expect(
            review.createDraft(candidateId, current!.reviewRevision, actor),
          ).rejects.toThrow();
          return current;
        };

        it('1-3. carries an unchanged approval forward, keeps it DRAFT-eligible, and references the original human approval', async () => {
          const { scopeId, fingerprints } = await approvedCandidate(
            'r4c-keep',
            {
              overlap: true,
            },
          );
          expect(fingerprints).toHaveLength(1);
          const before = await row('r4c-keep');
          expect(before?.reviewDecision.approvedEvidence.contentHash).toMatch(
            /^[0-9a-f]{64}$/,
          );

          await review.rescreenCandidate('r4c-keep', 2, actor);
          const after = await row('r4c-keep');
          expect(after?.reviewStatus).toBe('approved');
          expect(after?.reviewRevision).toBe(3);
          // The human decision is untouched: no new or rewritten human approval.
          expect(after?.reviewDecision).toEqual(before?.reviewDecision);
          const all = await events('r4c-keep');
          expect(all.filter((e) => e.action === 'approved')).toHaveLength(1);
          const carried = all.at(-1)!;
          expect(carried).toMatchObject({
            action: 'approval_carried_forward',
            revision: 3,
            actorEmail: 'reviewer@example.test',
          });
          expect(carried.details).toMatchObject({
            fromRevision: 2,
            toRevision: 3,
            originalApproval: {
              revision: 2,
              reviewerId: 'admin-reviewer',
              reviewerEmail: 'reviewer@example.test',
            },
            verifiedEvidence: {
              contentHash: before?.reviewDecision.approvedEvidence.contentHash,
              target: before?.reviewDecision.approvedEvidence.target,
              inventoryStatus: 'COMPLETE',
              overlapFingerprints: fingerprints,
            },
          });
          expect(carried.details.approvalRevoked).toBeUndefined();
          expect(await fenceRevision(scopeId)).toBe(2);

          const detail = await review.detail('r4c-keep');
          expect(detail.reviewEligibility.canCreateDraft).toBe(true);
          const created = await review.createDraft('r4c-keep', 3, actor);
          expect(created.alreadyCreated).toBe(false);
          const publication = await database
            .collection('engine_draft_publications')
            .findOne({ candidateId: 'r4c-keep' });
          expect(publication?.reviewRevision).toBe(3);
          // The published, carried-forward candidate keeps the inventory healthy.
          const inventory = await screen.loadHistoricalScope(
            { worldKey: 'video-games', scopeKey: 'overwatch' },
            screen.createSession({
              worldKey: 'video-games',
              scopeKey: 'overwatch',
            }),
          );
          expect(inventory.status).toBe('COMPLETE');
        });

        it('4. keeps provenance auditable across repeated unchanged re-screens', async () => {
          await approvedCandidate('r4c-repeat');
          for (const revision of [2, 3, 4]) {
            await review.rescreenCandidate('r4c-repeat', revision, actor);
          }
          const all = await events('r4c-repeat');
          const carried = all.filter(
            (e) => e.action === 'approval_carried_forward',
          );
          expect(
            carried.map((e) => [e.details.fromRevision, e.revision]),
          ).toEqual([
            [2, 3],
            [3, 4],
            [4, 5],
          ]);
          expect(
            carried.every((e) => e.details.originalApproval.revision === 2),
          ).toBe(true);
          const current = await row('r4c-repeat');
          expect(current?.reviewRevision).toBe(5);
          expect(current?.reviewDecision.revision).toBe(2);
          expect(
            (await review.createDraft('r4c-repeat', 5, actor)).alreadyCreated,
          ).toBe(false);
        });

        it('5. does not carry an approval forward when the content changed', async () => {
          await approvedCandidate('r4c-content');
          await database
            .collection('engine_candidates')
            .updateOne(
              { candidateId: 'r4c-content' },
              { $set: { 'draft.prompt.ar': 'من الذي اخترع الهاتف أولاً؟' } },
            );
          await review.rescreenCandidate('r4c-content', 2, actor);
          await expectRevoked('r4c-content', 'CONTENT_CHANGED');
        });

        it('6. does not carry an approval forward when identity metadata changed', async () => {
          await approvedCandidate('r4c-metadata');
          await database
            .collection('engine_candidates')
            .updateOne(
              { candidateId: 'r4c-metadata' },
              { $set: { 'draft.metadata.entityId': 'inventor-bell' } },
            );
          await review.rescreenCandidate('r4c-metadata', 2, actor);
          await expectRevoked('r4c-metadata', 'CONTENT_CHANGED');
        });

        it('7. does not carry an approval forward when a new overlap appears', async () => {
          const { worldId, scopeId } =
            await approvedCandidate('r4c-new-overlap');
          await insertReady(worldId, scopeId);
          await review.rescreenCandidate('r4c-new-overlap', 2, actor);
          const current = await expectRevoked(
            'r4c-new-overlap',
            'OVERLAP_EVIDENCE_UNACKNOWLEDGED',
          );
          expect(
            current?.findings.some(
              (f: { code: string; fingerprint?: string }) =>
                f.code === 'POTENTIAL_OVERLAP_HISTORICAL_CONTENT' &&
                Boolean(f.fingerprint),
            ),
          ).toBe(true);
        });

        it('8. does not carry an approval forward when an acknowledged overlap fingerprint changed', async () => {
          const { item, fingerprints } = await approvedCandidate(
            'r4c-changed-overlap',
            { overlap: true },
          );
          await database.collection('content_items').updateOne(
            { _id: item!.insertedId },
            {
              $set: { 'answerPayload.options.1.label.ar': 'غوليلمو ماركوني' },
            },
          );
          await review.rescreenCandidate('r4c-changed-overlap', 2, actor);
          const current = await expectRevoked(
            'r4c-changed-overlap',
            'OVERLAP_EVIDENCE_CHANGED',
          );
          expect(
            current?.reviewEvents.at(-1).details.approvalRevoked
              .withdrawnFingerprints,
          ).toEqual(fingerprints);
        });

        it('9. does not carry an approval forward over a proven duplicate', async () => {
          const { worldId, scopeId } = await approvedCandidate('r4c-duplicate');
          await insertReady(worldId, scopeId, telephoneVariant);
          await review.rescreenCandidate('r4c-duplicate', 2, actor);
          const current = await expectRevoked(
            'r4c-duplicate',
            'PROVEN_DUPLICATE',
          );
          expect(current?.status).toBe('screened_reject');
        });

        it('10. does not carry an approval forward when historical inventory is incomplete', async () => {
          await approvedCandidate('r4c-incomplete');
          const spy = jest
            .spyOn(screen, 'loadHistoricalScope')
            .mockImplementationOnce(async (_input, session) => {
              const result = {
                status: 'UNAVAILABLE' as const,
                recordCount: 0,
                isTruncated: false,
                error: 'simulated inventory outage',
              };
              if (session) {
                session.historicalScopeStatus = result;
                session.historicalRecords = [];
              }
              return result;
            });
          try {
            await review.rescreenCandidate('r4c-incomplete', 2, actor);
          } finally {
            spy.mockRestore();
          }
          const current = await expectRevoked(
            'r4c-incomplete',
            'HISTORICAL_INVENTORY_INCOMPLETE',
          );
          // The actionable evidence is preserved on the candidate.
          expect(
            current?.findings.some(
              (f: { code: string }) =>
                f.code === 'HISTORICAL_INVENTORY_UNAVAILABLE',
            ),
          ).toBe(true);
        });

        it('11. fails closed on missing or untrusted approval provenance', async () => {
          // (a) the human approval event is missing
          await approvedCandidate('r4c-untrusted');
          await database
            .collection('engine_candidates')
            .updateOne(
              { candidateId: 'r4c-untrusted' },
              { $pull: { reviewEvents: { action: 'approved' } } as never },
            );
          await review.rescreenCandidate('r4c-untrusted', 2, actor);
          await expectRevoked(
            'r4c-untrusted',
            'APPROVAL_PROVENANCE_UNVERIFIABLE',
          );
        });

        it('11b. fails closed on an approval that recorded no verified evidence', async () => {
          await approvedCandidate('r4c-legacy-approval');
          await database
            .collection('engine_candidates')
            .updateOne(
              { candidateId: 'r4c-legacy-approval' },
              { $unset: { 'reviewDecision.approvedEvidence': '' } },
            );
          await review.rescreenCandidate('r4c-legacy-approval', 2, actor);
          await expectRevoked(
            'r4c-legacy-approval',
            'APPROVAL_EVIDENCE_UNRECORDED',
          );
        });

        it('11c. refuses a DRAFT on a forged or broken carry-forward chain', async () => {
          await approvedCandidate('r4c-forged');
          await database.collection('engine_candidates').updateOne(
            { candidateId: 'r4c-forged' },
            {
              $inc: { reviewRevision: 1 },
              $push: {
                reviewEvents: {
                  action: 'approval_carried_forward',
                  actorId: 'someone',
                  actorEmail: 'someone@example.test',
                  occurredAt: new Date(),
                  revision: 3,
                  reasonCode: null,
                  explanation: 'forged',
                  details: {
                    fromRevision: 2,
                    toRevision: 3,
                    originalApproval: {
                      revision: 2,
                      reviewerId: 'someone-else',
                      reviewerEmail: 'reviewer@example.test',
                    },
                  },
                },
              } as never,
            },
          );
          await expect(
            review.createDraft('r4c-forged', 3, actor),
          ).rejects.toThrow(
            'Candidate approval decision is stale for the current revision',
          );
          expect(
            (await review.detail('r4c-forged')).reviewEligibility
              .canCreateDraft,
          ).toBe(false);
          expect(
            await database
              .collection('engine_draft_publications')
              .countDocuments(),
          ).toBe(0);
        });

        const holdBothFenceWrites = () => {
          const fenceModel = database.model('EngineInventoryFence');
          const realUpdate = fenceModel.updateOne.bind(fenceModel);
          let arrivals = 0;
          let release!: () => void;
          const barrier = new Promise<void>((resolve) => {
            release = resolve;
          });
          const spy = jest.spyOn(fenceModel, 'updateOne').mockImplementation(((
            ...args: any[]
          ) => {
            const query = (realUpdate as any)(...args);
            if (args[2]?.session) {
              const execute = query.exec.bind(query);
              query.exec = async () => {
                if (++arrivals <= 2) {
                  if (arrivals === 2) release();
                  await barrier;
                }
                return execute();
              };
            }
            return query;
          }) as any);
          const timer = setTimeout(() => release(), 5000);
          return {
            arrivals: () => arrivals,
            restore: () => {
              clearTimeout(timer);
              release();
              spy.mockRestore();
            },
          };
        };

        it('12. serializes a concurrent re-screen and DRAFT creation at the Scope fence', async () => {
          await approvedCandidate('r4c-race-draft');
          const hold = holdBothFenceWrites();
          let outcomes: PromiseSettledResult<unknown>[];
          try {
            outcomes = await Promise.allSettled([
              review.rescreenCandidate('r4c-race-draft', 2, actor),
              review.createDraft('r4c-race-draft', 2, actor),
            ]);
            expect(hold.arrivals()).toBeGreaterThanOrEqual(3);
          } finally {
            hold.restore();
          }
          expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(
            1,
          );
          const current = await row('r4c-race-draft');
          const all = current?.reviewEvents as Array<{
            action: string;
            revision: number;
          }>;
          const publications = await database
            .collection('engine_draft_publications')
            .find({ candidateId: 'r4c-race-draft' })
            .toArray();
          const carried = all.filter(
            (e) => e.action === 'approval_carried_forward',
          );
          const drafted = all.filter((e) => e.action === 'draft_created');
          // Exactly one side committed; never both, never a half-state.
          expect(carried.length + drafted.length).toBe(1);
          expect(publications).toHaveLength(drafted.length);
          expect(current?.reviewRevision).toBe(3);
          expect(new Set(all.map((e) => e.revision)).size).toBe(all.length);
          if (drafted.length) {
            expect(outcomes[0].status).toBe('rejected');
            expect(current?.publishedContentItemId).toBe(
              publications[0].contentItemId,
            );
          } else {
            expect(outcomes[1].status).toBe('rejected');
            expect(current?.publishedContentItemId).toBeNull();
            expect(current?.reviewStatus).toBe('approved');
          }
        });

        it('13. refuses a re-screen that races a concurrent candidate modification', async () => {
          const { scopeId } = await approvedCandidate('r4c-race-edit');
          const fenceModel = database.model('EngineInventoryFence');
          const realUpdate = fenceModel.updateOne.bind(fenceModel);
          let reached!: () => void;
          const entered = new Promise<void>((resolve) => {
            reached = resolve;
          });
          let release!: () => void;
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          const spy = jest.spyOn(fenceModel, 'updateOne').mockImplementation(((
            ...args: any[]
          ) => {
            const query = (realUpdate as any)(...args);
            if (args[2]?.session) {
              const execute = query.exec.bind(query);
              query.exec = async () => {
                reached();
                await held;
                return execute();
              };
            }
            return query;
          }) as any);
          const rescreen = review
            .rescreenCandidate('r4c-race-edit', 2, actor)
            .then(
              () => null,
              (error) => error,
            );
          try {
            await entered;
            // A human re-assessment commits while the re-screen is in flight.
            await assessSupported('r4c-race-edit', 2);
            release();
            const error = await rescreen;
            expect(error?.response).toMatchObject({
              expectedRevision: 2,
              currentRevision: 3,
            });
          } finally {
            release();
            spy.mockRestore();
            await rescreen;
          }
          const current = await row('r4c-race-edit');
          expect(current?.reviewRevision).toBe(3);
          expect(current?.reviewStatus).toBe('pending');
          expect(current?.reviewEvents.at(-1).action).toBe('assessed');
          expect(
            current?.reviewEvents.some(
              (e: { action: string }) =>
                e.action === 'approval_carried_forward',
            ),
          ).toBe(false);
          // The aborted re-screen's fence increment rolled back.
          expect(await fenceRevision(scopeId)).toBe(1);
        });

        it('14. leaves no partial carry-forward when the write fails', async () => {
          const { scopeId } = await approvedCandidate('r4c-rollback');
          const model = database.model('EngineCandidateDocument');
          const spy = jest
            .spyOn(model, 'findOneAndUpdate')
            .mockImplementationOnce((() => ({
              lean: () => ({
                exec: async () => {
                  throw new Error('simulated carry-forward write failure');
                },
              }),
            })) as any);
          try {
            await expect(
              review.rescreenCandidate('r4c-rollback', 2, actor),
            ).rejects.toThrow('simulated carry-forward write failure');
          } finally {
            spy.mockRestore();
          }
          const current = await row('r4c-rollback');
          expect(current?.reviewRevision).toBe(2);
          expect(current?.reviewStatus).toBe('approved');
          expect(current?.reviewEvents.at(-1).action).toBe('approved');
          expect(await fenceRevision(scopeId)).toBe(1);
        });

        it('15. retries a transient failure without duplicating the carry-forward event', async () => {
          const { scopeId } = await approvedCandidate('r4c-retry');
          const transient = new mongo.MongoServerError({
            message: 'simulated transient carry-forward write',
          });
          transient.addErrorLabel('TransientTransactionError');
          const model = database.model('EngineCandidateDocument');
          const spy = jest
            .spyOn(model, 'findOneAndUpdate')
            .mockImplementationOnce((() => ({
              lean: () => ({
                exec: async () => {
                  throw transient;
                },
              }),
            })) as any);
          try {
            await review.rescreenCandidate('r4c-retry', 2, actor);
            expect(spy).toHaveBeenCalledTimes(2);
          } finally {
            spy.mockRestore();
          }
          const all = await events('r4c-retry');
          expect(
            all.filter((e) => e.action === 'approval_carried_forward'),
          ).toHaveLength(1);
          expect((await row('r4c-retry'))?.reviewRevision).toBe(3);
          expect(await fenceRevision(scopeId)).toBe(2);
        });
      });
    });

    it('serializes concurrent duplicate approvals at the Scope fence', async () => {
      const { scopeId } = await seedReviewCandidate('fence-race-a');
      const original = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'fence-race-a' });
      const { _id, ...copy } = original!;
      expect(_id).toBeDefined();
      await database
        .collection('engine_candidates')
        .insertOne({ ...copy, candidateId: 'fence-race-b', ordinal: 1 });
      for (const id of ['fence-race-a', 'fence-race-b']) {
        const screening = screen.createSession({
          worldKey: 'video-games',
          scopeKey: 'overwatch',
        });
        const inventory = await screen.loadHistoricalScope(
          { worldKey: 'video-games', scopeKey: 'overwatch' },
          screening,
        );
        expect(inventory.status).toBe('COMPLETE');
        const result = screen.screen(copy.draft, null, {
          candidateId: id,
          worldKey: 'video-games',
          scopeKey: 'overwatch',
          session: screening,
        });
        expect(
          result.findings.some(
            (finding) =>
              finding.code.startsWith('DUPLICATE_HISTORICAL') ||
              finding.code === 'DUPLICATE_APPROVED_CANDIDATE',
          ),
        ).toBe(false);
        await assessSupported(id);
      }
      const fenceModel = database.model('EngineInventoryFence');
      const realUpdate = fenceModel.updateOne.bind(fenceModel);
      let arrivals = 0;
      let initializationArrivals = 0;
      let releaseInitialization!: () => void;
      const initializationBarrier = new Promise<void>((resolve) => {
        releaseInitialization = resolve;
      });
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = jest.spyOn(fenceModel, 'updateOne').mockImplementation(((
        ...args: any[]
      ) => {
        const query = (realUpdate as any)(...args);
        if (args[2]?.upsert) {
          const execute = query.exec.bind(query);
          query.exec = async () => {
            if (++initializationArrivals === 2) releaseInitialization();
            await initializationBarrier;
            return execute();
          };
        } else if (args[2]?.session) {
          const execute = query.exec.bind(query);
          query.exec = async () => {
            if (++arrivals <= 2) {
              if (arrivals === 2) release();
              await barrier;
            }
            return execute();
          };
        }
        return query;
      }) as any);
      const timer = setTimeout(() => {
        releaseInitialization();
        release();
      }, 5000);
      try {
        const outcomes = await Promise.allSettled([
          approve('fence-race-a'),
          approve('fence-race-b'),
        ]);
        expect(initializationArrivals).toBe(2);
        expect(arrivals).toBeGreaterThanOrEqual(3);
        expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(
          1,
        );
        const rejected = outcomes.find(
          (o) => o.status === 'rejected',
        ) as PromiseRejectedResult;
        expect(String(rejected.reason)).toContain(
          'Historical duplicate screening changed',
        );
        const rows = await database
          .collection('engine_candidates')
          .find({ candidateId: { $in: ['fence-race-a', 'fence-race-b'] } })
          .toArray();
        expect(
          rows.filter((row) => row.reviewStatus === 'approved'),
        ).toHaveLength(1);
        expect(
          rows.filter((row) => row.reviewStatus === 'pending'),
        ).toHaveLength(1);
        expect(
          rows.flatMap((row) =>
            row.reviewEvents.filter(
              (event: { action: string }) => event.action === 'approved',
            ),
          ),
        ).toHaveLength(1);
        expect(
          rows.filter((row) => row.reviewStatus === 'pending')[0]
            .reviewRevision,
        ).toBe(1);
        const fence = await database
          .collection('engine_inventory_fences')
          .findOne({ _id: scopeId });
        expect(fence?.revision).toBe(1);
      } finally {
        clearTimeout(timer);
        releaseInitialization();
        release();
        spy.mockRestore();
      }
    });

    it('allows a different Scope to approve while another Scope holds its fence', async () => {
      const { worldId, jobId } = await seedReviewCandidate('fence-other-a');
      await database.collection('scopes').insertOne({
        _id: new Types.ObjectId(),
        worldId,
        name: 'FIFA',
        slug: 'fifa',
        status: 'draft',
        excludedChallengeTypeIds: [],
      });
      const job = await database
        .collection('engine_jobs')
        .findOne({ _id: new Types.ObjectId(jobId) });
      const otherJobId = new Types.ObjectId();
      await database.collection('engine_jobs').insertOne({
        ...job!,
        _id: otherJobId,
        requestHash: 'other-scope-job',
        scopeKey: 'fifa',
      });
      const candidate = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'fence-other-a' });
      const { _id, ...copy } = candidate!;
      expect(_id).toBeDefined();
      await database.collection('engine_candidates').insertOne({
        ...copy,
        candidateId: 'fence-other-b',
        jobId: String(otherJobId),
      });
      await assessSupported('fence-other-a');
      await assessSupported('fence-other-b');
      let entered!: () => void;
      let release!: () => void;
      const reached = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const originalLoad = screen.loadHistoricalScope.bind(screen);
      const spy = jest
        .spyOn(screen, 'loadHistoricalScope')
        .mockImplementation(async (params, session) => {
          if (params.mongoSession && params.scopeKey === 'overwatch') {
            entered();
            await held;
          }
          return originalLoad(params, session);
        });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('other Scope did not progress')),
          5000,
        );
      });
      const first = approve('fence-other-a');
      try {
        await Promise.race([reached, timeout]);
        const other = await Promise.race([approve('fence-other-b'), timeout]);
        expect(other.reviewStatus).toBe('approved');
      } finally {
        release();
        if (timer) clearTimeout(timer);
        spy.mockRestore();
      }
      expect((await first).reviewStatus).toBe('approved');
    });

    it('rejects an approval if fresh inventory contains an approved duplicate', async () => {
      const { scopeId } = await seedReviewCandidate('fresh-check-target');
      await assessSupported('fresh-check-target');
      const current = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'fresh-check-target' });
      const { _id, ...duplicate } = current!;
      expect(_id).toBeDefined();
      await database.collection('engine_candidates').insertOne({
        ...duplicate,
        candidateId: 'fresh-check-approved',
        ordinal: 1,
        reviewStatus: 'approved',
        reviewRevision: 2,
        reviewDecision: {
          decision: 'approved',
          reviewerId: 'admin',
          reviewerEmail: 'admin@example.test',
          revision: 2,
        },
        reviewEvents: [
          {
            action: 'approved',
            actorId: 'admin',
            actorEmail: 'admin@example.test',
            revision: 2,
          },
        ],
      });
      await expect(approve('fresh-check-target')).rejects.toThrow(
        'Historical duplicate screening changed',
      );
      const after = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'fresh-check-target' });
      expect(after?.reviewStatus).toBe('pending');
      expect(after?.reviewRevision).toBe(1);
      expect(
        after?.reviewEvents.filter(
          (event: { action: string }) => event.action === 'approved',
        ),
      ).toHaveLength(0);
      const fence = await database
        .collection('engine_inventory_fences')
        .findOne({ _id: scopeId });
      expect(fence?.revision).toBe(0);
    });

    it('retries a transient transaction failure without duplicating approval events', async () => {
      await seedReviewCandidate('retry-check-target');
      await assessSupported('retry-check-target');
      const transient = new mongo.MongoServerError({
        message: 'simulated transient inventory read',
      });
      transient.addErrorLabel('TransientTransactionError');
      const spy = jest
        .spyOn(screen, 'loadHistoricalScope')
        .mockImplementationOnce(async () => {
          throw transient;
        });
      try {
        const approved = await approve('retry-check-target');
        expect(approved.reviewStatus).toBe('approved');
        expect(
          approved.reviewEvents.filter(
            (event: { action: string }) => event.action === 'approved',
          ),
        ).toHaveLength(1);
        expect(spy).toHaveBeenCalledTimes(2);
      } finally {
        spy.mockRestore();
      }
    });

    it('aborts approval when the historical target is ambiguous', async () => {
      await seedReviewCandidate('ambiguous-check-target');
      await assessSupported('ambiguous-check-target');
      await database.collection('worlds').insertOne({
        name: 'عالم الالعاب الالكترونية',
        slug: 'another-world',
        status: 'draft',
      });
      await expect(approve('ambiguous-check-target')).rejects.toThrow(
        'ambiguous',
      );
      const after = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'ambiguous-check-target' });
      expect(after?.reviewStatus).toBe('pending');
      expect(after?.reviewRevision).toBe(1);
    });

    it('rolls back the fence and approval when inventory is unavailable', async () => {
      const { scopeId } = await seedReviewCandidate(
        'inventory-unavailable-target',
      );
      await assessSupported('inventory-unavailable-target');
      const spy = jest
        .spyOn(screen, 'loadHistoricalScope')
        .mockResolvedValueOnce({
          status: 'UNAVAILABLE',
          recordCount: 0,
          canonicalCount: 0,
          candidateCount: 0,
          isTruncated: false,
        });
      try {
        await expect(approve('inventory-unavailable-target')).rejects.toThrow(
          'Historical inventory is incomplete',
        );
      } finally {
        spy.mockRestore();
      }
      const after = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'inventory-unavailable-target' });
      const fence = await database
        .collection('engine_inventory_fences')
        .findOne({ _id: scopeId });
      expect(after?.reviewStatus).toBe('pending');
      expect(after?.reviewRevision).toBe(1);
      expect(fence?.revision).toBe(0);
    });

    it('records assessment, approval, reviewer identity and audit events', async () => {
      await seedReviewCandidate('review-approved');
      await assessSupported('review-approved');
      const approved = await approve('review-approved');
      expect(approved.reviewStatus).toBe('approved');
      expect(approved.reviewRevision).toBe(2);
      expect(approved.reviewDecision).toMatchObject({
        reviewerId: 'admin-reviewer',
        reviewerEmail: 'reviewer@example.test',
      });
      expect(
        approved.reviewEvents.map((event: { action: string }) => event.action),
      ).toEqual(['assessed', 'approved']);
    });

    it('rejects draft publication when a new duplicate appears after approval', async () => {
      const { worldId, scopeId } = await seedReviewCandidate(
        'draft-fresh-duplicate',
      );
      await assessSupported('draft-fresh-duplicate');
      await approve('draft-fresh-duplicate');
      const candidate = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'draft-fresh-duplicate' });
      await database
        .collection('content_items')
        .insertOne({ worldId, scopeId, status: 'ready', ...candidate!.draft });
      await expect(
        review.createDraft('draft-fresh-duplicate', 2, actor),
      ).rejects.toThrow('Historical duplicate screening changed');
      const after = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'draft-fresh-duplicate' });
      expect(after?.publishedContentItemId).toBeNull();
      expect(after?.reviewRevision).toBe(2);
      expect(
        await database
          .collection('engine_draft_publications')
          .countDocuments({ candidateId: 'draft-fresh-duplicate' }),
      ).toBe(0);
      expect(
        await database.collection('content_items').countDocuments({ scopeId }),
      ).toBe(1);
      const fence = await database
        .collection('engine_inventory_fences')
        .findOne({ _id: scopeId });
      expect(fence?.revision).toBe(1);
    });

    it('aborts draft publication when historical inventory is incomplete', async () => {
      const { scopeId } = await seedReviewCandidate(
        'draft-inventory-unavailable',
      );
      await assessSupported('draft-inventory-unavailable');
      await approve('draft-inventory-unavailable');
      const spy = jest
        .spyOn(screen, 'loadHistoricalScope')
        .mockResolvedValueOnce({
          status: 'UNAVAILABLE',
          recordCount: 0,
          canonicalCount: 0,
          candidateCount: 0,
          isTruncated: false,
        });
      try {
        await expect(
          review.createDraft('draft-inventory-unavailable', 2, actor),
        ).rejects.toThrow('Historical inventory is incomplete');
      } finally {
        spy.mockRestore();
      }
      expect(
        await database
          .collection('engine_draft_publications')
          .countDocuments({ candidateId: 'draft-inventory-unavailable' }),
      ).toBe(0);
      expect(
        await database.collection('content_items').countDocuments({ scopeId }),
      ).toBe(0);
      expect(
        (
          await database
            .collection('engine_inventory_fences')
            .findOne({ _id: scopeId })
        )?.revision,
      ).toBe(1);
    });

    it('refuses draft publication for approval without trusted provenance', async () => {
      await seedReviewCandidate('draft-untrusted');
      await assessSupported('draft-untrusted');
      await approve('draft-untrusted');
      await database
        .collection('engine_candidates')
        .updateOne(
          { candidateId: 'draft-untrusted' },
          { $set: { reviewEvents: [] } },
        );
      await expect(
        review.createDraft('draft-untrusted', 2, actor),
      ).rejects.toThrow('trusted candidate approval provenance');
      expect(
        await database
          .collection('engine_draft_publications')
          .countDocuments({ candidateId: 'draft-untrusted' }),
      ).toBe(0);
    });

    it('retries transient draft inventory failures without duplicating publication', async () => {
      const { scopeId } = await seedReviewCandidate('draft-retry-fence');
      await assessSupported('draft-retry-fence');
      await approve('draft-retry-fence');
      const transient = new mongo.MongoServerError({
        message: 'simulated transient draft inventory read',
      });
      transient.addErrorLabel('TransientTransactionError');
      const spy = jest
        .spyOn(screen, 'loadHistoricalScope')
        .mockImplementationOnce(async () => {
          throw transient;
        });
      try {
        const result = await review.createDraft('draft-retry-fence', 2, actor);
        expect(result.status).toBe('draft');
        expect(spy).toHaveBeenCalledTimes(2);
      } finally {
        spy.mockRestore();
      }
      expect(
        await database
          .collection('engine_draft_publications')
          .countDocuments({ candidateId: 'draft-retry-fence' }),
      ).toBe(1);
      expect(
        await database.collection('content_items').countDocuments({ scopeId }),
      ).toBe(1);
      const after = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'draft-retry-fence' });
      expect(
        after?.reviewEvents.filter(
          (event: { action: string }) => event.action === 'draft_created',
        ),
      ).toHaveLength(1);
      expect(
        (
          await database
            .collection('engine_inventory_fences')
            .findOne({ _id: scopeId })
        )?.revision,
      ).toBe(2);
    });

    it('persists review decisions and audit fields in MongoDB', async () => {
      await seedReviewCandidate('review-persisted-audit');
      await assessSupported('review-persisted-audit');
      await approve('review-persisted-audit');

      const persisted = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'review-persisted-audit' });

      expect(persisted).toMatchObject({
        candidateId: 'review-persisted-audit',
        reviewStatus: 'approved',
        reviewRevision: 2,
        reviewDecision: {
          decision: 'approved',
          explanation: 'Approved after human review.',
          reviewerId: actor.id,
          reviewerEmail: actor.email,
          revision: 2,
        },
      });
      expect(persisted?.reviewDecision.decidedAt).toEqual(expect.any(Date));
      expect(persisted?.reviewEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'assessed',
            actorId: actor.id,
            actorEmail: actor.email,
            revision: 1,
            occurredAt: expect.any(Date),
          }),
          expect.objectContaining({
            action: 'approved',
            actorId: actor.id,
            actorEmail: actor.email,
            revision: 2,
            explanation: 'Approved after human review.',
            occurredAt: expect.any(Date),
          }),
        ]),
      );
    });

    it('supports structured rejection and refuses rejected publication', async () => {
      await seedReviewCandidate('review-rejected');
      const rejected = await review.reject(
        'review-rejected',
        {
          expectedRevision: 0,
          reasonCode: 'FACTUAL_ERROR',
          explanation: 'The answer is contradicted by the cited source.',
        },
        actor,
      );
      expect(rejected.reviewDecision).toMatchObject({
        decision: 'rejected',
        reasonCode: 'FACTUAL_ERROR',
      });
      await expect(
        review.createDraft('review-rejected', 1, actor),
      ).rejects.toThrow(/Rejected candidates/);
    });

    it('voids the model step arithmetic when a human edits the numbers', async () => {
      // `stepsFromMin` is the model's claim about the draft the model wrote.
      // Once a reviewer changes min/step/correctValue the claim describes
      // nothing, so it must not survive to block the person fixing the item —
      // CLOSEST_SLIDER_TARGET_STEP_INVALID still checks the edited draft, and
      // that is the authority. The prose rationale is kept.
      await seedReviewCandidate('review-closest-edit');
      await database.collection('engine_candidates').updateOne(
        { candidateId: 'review-closest-edit' },
        {
          $set: {
            authoring: {
              concept: 'Height of a tall building',
              playerReasoningStrategy: 'Floors times storey height.',
              stepsFromMin: 60,
            },
            draft: {
              prompt: { ar: 'كم يبلغ ارتفاع البرج بالأمتار تقريبًا؟' },
              answerPayload: { mode: 'closest', correctValue: 300 },
              mechanicPayload: {
                closestSlider: {
                  mode: 'numeric-range',
                  min: 0,
                  max: 500,
                  step: 5,
                },
              },
            },
          },
        },
      );

      const edited = await review.edit(
        'review-closest-edit',
        {
          expectedRevision: 0,
          explanation: 'Corrected the target to the verified height.',
          factualClaims: ['The tower is about 302 metres tall.'],
          draft: {
            prompt: { ar: 'كم يبلغ ارتفاع البرج بالأمتار تقريبًا؟' },
            answerPayload: { mode: 'closest', correctValue: 302 },
            mechanicPayload: {
              closestSlider: {
                mode: 'numeric-range',
                min: 0,
                max: 500,
                step: 2,
              },
            },
          },
        },
        actor,
      );

      const authoring = edited.authoring as Record<string, unknown> | null;
      expect(authoring?.stepsFromMin).toBeUndefined();
      expect(authoring?.concept).toBe('Height of a tall building');
      // 302 is reachable from 0 in steps of 2, so the human's edit stands.
      expect(
        edited.findings
          .filter((finding) => finding.severity === 'blocking')
          .map((finding) => finding.code),
      ).toEqual([]);
    });

    it('invalidates assessments and reruns validation after an edit', async () => {
      await seedReviewCandidate('review-edited');
      await assessSupported('review-edited');
      const edited = await review.edit(
        'review-edited',
        {
          expectedRevision: 1,
          explanation: 'Corrected the answer options.',
          factualClaims: ['Updated claim'],
          draft: {
            prompt: { ar: 'أي بطل يملك هذه القدرة؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: 'a', label: { ar: 'مرسي' } },
                { id: 'b', label: { ar: 'جنجي' } },
              ],
              correctOptionId: 'a',
            },
          },
        },
        actor,
      );
      expect(edited.humanAssessment).toBeNull();
      expect(edited.factVerification).toBeNull();
      expect(edited.qualityEvaluation).toBeNull();
      expect(edited.reviewStatus).toBe('pending');
      await expect(
        review.approve(
          'review-edited',
          { expectedRevision: 2, explanation: 'stale assessment' },
          actor,
        ),
      ).rejects.toThrow(/requires human assessment/);
    });

    it('allows only one of two concurrent reviewers to decide a revision', async () => {
      await seedReviewCandidate('review-race');
      await assessSupported('review-race');
      const outcomes = await Promise.allSettled([
        approve('review-race'),
        review.reject(
          'review-race',
          {
            expectedRevision: 1,
            reasonCode: 'LOW_QUALITY',
            explanation: 'A second reviewer disagreed.',
          },
          actor,
        ),
      ]);
      expect(
        outcomes.filter((outcome) => outcome.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        outcomes.filter((outcome) => outcome.status === 'rejected'),
      ).toHaveLength(1);
    });

    it('escalates contradicted claims until a reviewer records an explicit resolution', async () => {
      await seedReviewCandidate('review-contradicted');
      await review.assess(
        'review-contradicted',
        {
          expectedRevision: 0,
          factualState: 'CONTRADICTED',
          factualExplanation: 'One official source contradicts the answer.',
          evidence: [
            {
              url: 'https://example.test/contradiction',
              title: 'Official patch note contradiction',
              note: 'Official balance patch contradicts character ability detail.',
            },
          ],
          quality: {
            correctness: 2,
            mechanicFit: 4,
            clarity: 4,
            multiplayerFit: 4,
            originality: 4,
            explanation: 'Playable only if the factual conflict is resolved.',
          },
        },
        actor,
      );
      await expect(approve('review-contradicted')).rejects.toThrow(
        /requires explicit resolution/,
      );
      const approved = await review.approve(
        'review-contradicted',
        {
          expectedRevision: 1,
          explanation: 'Approved with a documented resolution.',
          factualOverrideCode: 'ACCEPTED_WITH_EVIDENCE',
          factualOverrideExplanation:
            'A newer official source resolves the conflict.',
        },
        actor,
      );
      expect(approved.reviewStatus).toBe('approved');
    });

    it('publishes an RYO draft carrying no authoring rationale at all', async () => {
      // The rationale explains why each wrong option is tempting and how hard
      // the question is. Either would hand the game away if it reached a
      // player's phone, so the guarantee is structural: it lives beside the
      // draft, and only the draft becomes a ContentItem.
      await seedReviewCandidate('review-ryo-privacy');
      await database.collection('engine_candidates').updateOne(
        { candidateId: 'review-ryo-privacy' },
        {
          $set: {
            authoring: {
              concept: 'People reach for oxygen before nitrogen.',
              distractorRationale: [
                { optionId: 'b', why: 'The breathing association.' },
              ],
              estimatedConfidence: { band: 'even', why: 'A misconception.' },
            },
          },
        },
      );
      await assessSupported('review-ryo-privacy');
      await approve('review-ryo-privacy');
      const created = await review.createDraft('review-ryo-privacy', 2, actor);

      const item = await database
        .collection('content_items')
        .findOne({ _id: new Types.ObjectId(created.contentItemId) });
      expect(item).toBeTruthy();
      // Nothing from the rationale survives anywhere in the document.
      const serialized = JSON.stringify(item);
      expect(serialized).not.toContain('distractorRationale');
      expect(serialized).not.toContain('estimatedConfidence');
      expect(serialized).not.toContain('authoring');
      expect(serialized).not.toContain('breathing association');
      expect(serialized).not.toContain('oxygen before nitrogen');
      // And the candidate still has it, for the reviewer.
      const candidate = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'review-ryo-privacy' });
      expect(candidate!.authoring).toMatchObject({
        estimatedConfidence: { band: 'even' },
      });
    });

    it('creates one canonical draft through retries and leaves it in draft', async () => {
      await seedReviewCandidate('review-publish-once');
      await assessSupported('review-publish-once');
      await approve('review-publish-once');
      const fence = database.model('EngineInventoryFence');
      const update = fence.updateOne.bind(fence);
      let arrivals = 0;
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = jest.spyOn(fence, 'updateOne').mockImplementation(((
        ...args: any[]
      ) => {
        const query = (update as any)(...args);
        if (args[2]?.session) {
          const execute = query.exec.bind(query);
          query.exec = async () => {
            if (++arrivals <= 2) {
              if (arrivals === 2) release();
              await barrier;
            }
            return execute();
          };
        }
        return query;
      }) as any);
      const timer = setTimeout(release, 5000);
      let first: Awaited<ReturnType<typeof review.createDraft>>;
      let concurrent: Awaited<ReturnType<typeof review.createDraft>>;
      try {
        [first, concurrent] = await Promise.all([
          review.createDraft('review-publish-once', 2, actor),
          review.createDraft('review-publish-once', 2, actor),
        ]);
        expect(arrivals).toBeGreaterThanOrEqual(2);
      } finally {
        clearTimeout(timer);
        release();
        spy.mockRestore();
      }
      expect(concurrent.contentItemId).toBe(first.contentItemId);
      const retried = await review.createDraft('review-publish-once', 2, actor);
      expect(retried.contentItemId).toBe(first.contentItemId);
      expect(retried.alreadyCreated).toBe(true);
      expect(
        await database
          .collection('content_items')
          .countDocuments({ status: 'draft' }),
      ).toBe(1);
      expect(
        await database.collection('engine_draft_publications').countDocuments({
          candidateId: 'review-publish-once',
        }),
      ).toBe(1);
      const candidate = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'review-publish-once' });
      expect(
        candidate?.reviewEvents.filter(
          (event: { action: string }) => event.action === 'draft_created',
        ),
      ).toHaveLength(1);
    });

    it('rejects a second publication linkage for the same ContentItem', async () => {
      await seedReviewCandidate('review-publication-unique');
      await assessSupported('review-publication-unique');
      await approve('review-publication-unique');
      const created = await review.createDraft(
        'review-publication-unique',
        2,
        actor,
      );

      let duplicateError: unknown;
      try {
        await database.collection('engine_draft_publications').insertOne({
          candidateId: 'different-candidate',
          jobId: 'different-job',
          reviewRevision: 2,
          contentItemId: created.contentItemId,
          createdBy: actor.id,
          createdByEmail: actor.email,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (error) {
        duplicateError = error;
      }

      expect(duplicateError).toMatchObject({ code: 11000 });
      const original = await database
        .collection('engine_draft_publications')
        .findOne({ contentItemId: created.contentItemId });
      expect(original).toMatchObject({
        candidateId: 'review-publication-unique',
        contentItemId: created.contentItemId,
      });
      expect(
        await database
          .collection('engine_draft_publications')
          .countDocuments({ contentItemId: created.contentItemId }),
      ).toBe(1);
    });

    it('rolls back a failed draft transaction and recovers on retry', async () => {
      const { scopeId } = await seedReviewCandidate('review-crash');
      await assessSupported('review-crash');
      await approve('review-crash');
      const originalCreate = contentItems.create.bind(contentItems);
      const create = jest.spyOn(contentItems, 'create');
      create.mockImplementationOnce(async (dto, options) => {
        await originalCreate(dto, options);
        throw new Error('simulated crash after canonical insert');
      });
      await expect(
        review.createDraft('review-crash', 2, actor),
      ).rejects.toThrow(/simulated crash after canonical insert/);
      expect(
        await database.collection('engine_draft_publications').countDocuments(),
      ).toBe(0);
      expect(await database.collection('content_items').countDocuments()).toBe(
        0,
      );
      const unchanged = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'review-crash' });
      expect(unchanged?.reviewStatus).toBe('approved');
      expect(unchanged?.reviewRevision).toBe(2);
      expect(unchanged?.publishedContentItemId).toBeNull();
      expect(
        unchanged?.reviewEvents.filter(
          (event: { action: string }) => event.action === 'draft_created',
        ),
      ).toHaveLength(0);
      expect(
        (
          await database
            .collection('engine_inventory_fences')
            .findOne({ _id: scopeId })
        )?.revision,
      ).toBe(1);
      create.mockRestore();
      await expect(
        review.createDraft('review-crash', 2, actor),
      ).resolves.toMatchObject({
        status: 'draft',
        alreadyCreated: false,
      });
    });

    it('refuses canonical creation when approved content was mutated after approval', async () => {
      await seedReviewCandidate('review-mutated');
      await assessSupported('review-mutated');
      await approve('review-mutated');
      // Rewrite the approved draft directly, keeping approval state intact so
      // only the R4-C approved-content binding can refuse it.
      await database
        .collection('engine_candidates')
        .updateOne(
          { candidateId: 'review-mutated' },
          { $set: { 'draft.prompt': { ar: 'سؤال مختلف بعد الاعتماد؟' } } },
        );
      await expect(
        review.createDraft('review-mutated', 2, actor),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'APPROVED_CONTENT_CHANGED' },
      });
      expect(await database.collection('content_items').countDocuments()).toBe(
        0,
      );
      expect(
        await database.collection('engine_draft_publications').countDocuments(),
      ).toBe(0);
    });

    it('refuses canonical creation when compatibility becomes invalid after approval', async () => {
      const { scopeId, challengeTypeId } =
        await seedReviewCandidate('review-invalid');
      await assessSupported('review-invalid');
      await approve('review-invalid');
      const approved = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'review-invalid' });
      // The Scope now excludes the job's ChallengeType. Neither the draft, the
      // identity metadata, nor the target keys/scopeId change, so the approval
      // and its approvedEvidence stay valid and the canonical compatibility
      // validator is the guard that must refuse.
      await database
        .collection('scopes')
        .updateOne(
          { _id: scopeId },
          { $set: { excludedChallengeTypeIds: [challengeTypeId] } },
        );
      const error = await review.createDraft('review-invalid', 2, actor).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toMatchObject({
        status: 400,
        response: {
          message: 'Candidate is incompatible with canonical World Content',
          blockers: expect.arrayContaining([
            expect.objectContaining({
              code: 'CHALLENGE_TYPE_EXCLUDED_BY_SCOPE',
            }),
          ]),
        },
      });
      const unchanged = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'review-invalid' });
      expect(unchanged?.reviewStatus).toBe('approved');
      expect(unchanged?.reviewRevision).toBe(2);
      expect(unchanged?.reviewDecision).toEqual(approved?.reviewDecision);
      expect(unchanged?.publishedContentItemId).toBeNull();
      expect(await database.collection('content_items').countDocuments()).toBe(
        0,
      );
      expect(
        await database.collection('engine_draft_publications').countDocuments(),
      ).toBe(0);
      // Control: the exclusion was the only blocker. Lifting it lets the same,
      // untouched approval create the DRAFT, so the approval evidence was valid.
      await database
        .collection('scopes')
        .updateOne(
          { _id: scopeId },
          { $set: { excludedChallengeTypeIds: [] } },
        );
      await expect(
        review.createDraft('review-invalid', 2, actor),
      ).resolves.toMatchObject({ status: 'draft' });
      expect(await database.collection('content_items').countDocuments()).toBe(
        1,
      );
    });

    describe('Phase C — candidate review hardening', () => {
      it('preserves candidate identity in DTO, persisted draft and historical screening', async () => {
        await seedReviewCandidate('identity-roundtrip');
        const metadata = {
          source: 'fixture',
          familyKey: 'identity-family',
          subject: 'mercy',
          entityId: 'hero-mercy',
          tags: ['healer'],
          notes: 'editor note',
        };
        await database
          .collection('engine_candidates')
          .updateOne(
            { candidateId: 'identity-roundtrip' },
            { $set: { 'draft.metadata': metadata } },
          );
        const before = await database
          .collection('engine_candidates')
          .findOne({ candidateId: 'identity-roundtrip' });
        const candidateIdentity = extractContentIdentity({
          worldKey: 'video-games',
          scopeKey: 'overwatch',
          ...before!.draft,
        });
        await assessSupported('identity-roundtrip');
        await approve('identity-roundtrip');
        const approved = await database
          .collection('engine_candidates')
          .findOne({ candidateId: 'identity-roundtrip' });
        expect(
          extractContentIdentity({
            worldKey: 'video-games',
            scopeKey: 'overwatch',
            ...approved!.draft,
          }),
        ).toEqual(candidateIdentity);
        const approvedInventory = screen.createSession({
          worldKey: 'video-games',
          scopeKey: 'overwatch',
        });
        expect(
          (
            await screen.loadHistoricalScope(
              { worldKey: 'video-games', scopeKey: 'overwatch' },
              approvedInventory,
            )
          ).status,
        ).toBe('COMPLETE');
        expect(
          approvedInventory.historicalRecords.find(
            (r) => r.id === 'identity-roundtrip',
          )?.identity,
        ).toEqual(candidateIdentity);
        const result = await review.createDraft('identity-roundtrip', 2, actor);
        const stored = await database
          .collection('content_items')
          .findOne({ _id: new Types.ObjectId(result.contentItemId) });
        expect(stored?.metadata).toMatchObject(metadata);
        const dto = plainToInstance(CreateContentItemDto, stored);
        expect((instanceToPlain(dto) as any).metadata).toMatchObject(metadata);
        expect(
          extractContentIdentity({
            worldKey: 'video-games',
            scopeKey: 'overwatch',
            ...stored,
          }),
        ).toEqual(candidateIdentity);
        const historical = screen.createSession({
          worldKey: 'video-games',
          scopeKey: 'overwatch',
        });
        expect(
          (
            await screen.loadHistoricalScope(
              { worldKey: 'video-games', scopeKey: 'overwatch' },
              historical,
            )
          ).status,
        ).toBe('COMPLETE');
        const record = historical.historicalRecords.find(
          (r) => r.id === result.contentItemId,
        );
        expect(record?.identity).toEqual(candidateIdentity);
        expect(
          screen
            .screen(before!.draft, null, {
              worldKey: 'video-games',
              scopeKey: 'overwatch',
              session: historical,
            })
            .findings.some((f) => f.code === 'DUPLICATE_HISTORICAL_DRAFT'),
        ).toBe(true);
      });

      it('preserves legacy authoring identity in the canonical draft', async () => {
        await seedReviewCandidate('identity-authoring-fallback');
        const authoring = {
          familyKey: 'legacy-family',
          subject: 'mercy',
          entityId: 'hero-mercy',
          tags: ['healer'],
          source: 'legacy-source',
        };
        await database
          .collection('engine_candidates')
          .updateOne(
            { candidateId: 'identity-authoring-fallback' },
            { $set: { authoring, 'draft.metadata': { notes: 'legacy note' } } },
          );
        await assessSupported('identity-authoring-fallback');
        await approve('identity-authoring-fallback');
        const result = await review.createDraft(
          'identity-authoring-fallback',
          2,
          actor,
        );
        const stored = await database
          .collection('content_items')
          .findOne({ _id: new Types.ObjectId(result.contentItemId) });
        expect(stored?.metadata).toMatchObject({
          ...authoring,
          notes: 'legacy note',
        });
        const historical = screen.createSession({
          worldKey: 'video-games',
          scopeKey: 'overwatch',
        });
        expect(
          (
            await screen.loadHistoricalScope(
              { worldKey: 'video-games', scopeKey: 'overwatch' },
              historical,
            )
          ).status,
        ).toBe('COMPLETE');
        const candidate = await database
          .collection('engine_candidates')
          .findOne({ candidateId: 'identity-authoring-fallback' });
        expect(
          screen
            .screen(candidate!.draft, authoring, {
              worldKey: 'video-games',
              scopeKey: 'overwatch',
              session: historical,
            })
            .findings.some((f) => f.code === 'DUPLICATE_HISTORICAL_DRAFT'),
        ).toBe(true);
      });

      it('normalizes padded identity consistently from approval through persisted historical screening', async () => {
        await seedReviewCandidate('identity-padded');
        await database.collection('engine_candidates').updateOne(
          { candidateId: 'identity-padded' },
          {
            $set: {
              'draft.metadata': {
                familyKey: ' family ',
                subject: ' hero ',
                entityId: ' id ',
                source: ' source ',
              },
              authoring: {
                familyKey: 'family',
                subject: 'hero',
                entityId: 'id',
                source: 'source',
              },
            },
          },
        );
        await assessSupported('identity-padded');
        await approve('identity-padded');
        const before = screen.createSession({
          worldKey: 'video-games',
          scopeKey: 'overwatch',
        });
        expect(
          (
            await screen.loadHistoricalScope(
              { worldKey: 'video-games', scopeKey: 'overwatch' },
              before,
            )
          ).status,
        ).toBe('COMPLETE');
        const identity = before.historicalRecords.find(
          (r) => r.id === 'identity-padded',
        )?.identity;
        expect(identity?.metadata).toMatchObject({
          familyKey: 'family',
          subject: 'hero',
          entityId: 'id',
          source: 'source',
        });
        const published = await review.createDraft('identity-padded', 2, actor);
        const after = screen.createSession({
          worldKey: 'video-games',
          scopeKey: 'overwatch',
        });
        expect(
          (
            await screen.loadHistoricalScope(
              { worldKey: 'video-games', scopeKey: 'overwatch' },
              after,
            )
          ).status,
        ).toBe('COMPLETE');
        expect(
          after.historicalRecords.find((r) => r.id === published.contentItemId)
            ?.identity,
        ).toEqual(identity);
      });

      it.each(['familyKey', 'subject', 'entityId', 'tags', 'source'])(
        'invalidates assessment after changing identity metadata %s',
        async (key) => {
          await seedReviewCandidate(`identity-edit-${key}`);
          await assessSupported(`identity-edit-${key}`);
          const candidate = await database
            .collection('engine_candidates')
            .findOne({ candidateId: `identity-edit-${key}` });
          const edited = await review.edit(
            `identity-edit-${key}`,
            {
              expectedRevision: 1,
              explanation: 'Changed identity metadata.',
              factualClaims: ['Mercy can heal allies'],
              draft: {
                ...candidate!.draft,
                metadata: {
                  ...candidate!.draft.metadata,
                  [key]: key === 'tags' ? ['new-tag'] : 'new-value',
                },
              },
            },
            actor,
          );
          expect(edited.humanAssessment).toBeNull();
          expect(edited.reviewEligibility.canApprove).toBe(false);
          expect(
            edited.reviewEvents.some(
              (event: { action: string }) =>
                event.action === 'assessment_invalidated',
            ),
          ).toBe(true);
        },
      );
      it('prevents retargeting World, Scope, Mechanic, or non-DRAFT status during candidate edit', async () => {
        const seeded = await seedReviewCandidate('phase-c-target-immutable');
        await expect(
          review.edit(
            'phase-c-target-immutable',
            {
              expectedRevision: 0,
              explanation: 'Attempt to retarget scopeId',
              factualClaims: ['Mercy can heal allies'],
              draft: {
                prompt: { ar: 'أي بطل يملك قدرة الشفاء الجماعي؟' },
                scopeId: String(new Types.ObjectId()),
                answerPayload: {
                  mode: 'multiple_choice',
                  options: [
                    { id: 'a', label: { ar: 'مرسي' } },
                    { id: 'b', label: { ar: 'جنجي' } },
                  ],
                  correctOptionId: 'a',
                },
              },
            },
            actor,
          ),
        ).rejects.toThrow(/pinned|immutable|cannot be changed/i);

        await expect(
          review.edit(
            'phase-c-target-immutable',
            {
              expectedRevision: 0,
              explanation: 'Attempt to promote status to ready',
              factualClaims: ['Mercy can heal allies'],
              draft: {
                prompt: { ar: 'أي بطل يملك قدرة الشفاء الجماعي؟' },
                scopeId: String(seeded.scopeId),
                status: 'ready',
                answerPayload: {
                  mode: 'multiple_choice',
                  options: [
                    { id: 'a', label: { ar: 'مرسي' } },
                    { id: 'b', label: { ar: 'جنجي' } },
                  ],
                  correctOptionId: 'a',
                },
              },
            },
            actor,
          ),
        ).rejects.toThrow(/status|draft/i);
      });

      it('preserves assessments and approval on non-material metadata-only edits while recording audit events', async () => {
        await seedReviewCandidate('phase-c-non-material');
        await assessSupported('phase-c-non-material');
        const edited = await review.edit(
          'phase-c-non-material',
          {
            expectedRevision: 1,
            explanation: 'Added editorial review note in metadata only.',
            factualClaims: ['Mercy can heal allies'],
            draft: {
              prompt: { ar: 'أي بطل يملك قدرة الشفاء الجماعي؟' },
              answerPayload: {
                mode: 'multiple_choice',
                options: [
                  { id: 'a', label: { ar: 'مرسي' } },
                  { id: 'b', label: { ar: 'جنجي' } },
                ],
                correctOptionId: 'a',
              },
              metadata: {
                source: 'content-engine',
                notes: 'Checked by senior editor',
              },
            },
          },
          actor,
        );

        expect(edited.reviewRevision).toBe(2);
        expect(edited.factVerification).toMatchObject({ state: 'SUPPORTED' });
        expect(edited.qualityEvaluation).toMatchObject({
          recommendation: 'PASS',
        });
        expect(edited.humanAssessment).toMatchObject({
          factualState: 'SUPPORTED',
          assessedRevision: 2,
          previousAssessedRevision: 1,
        });
        expect(edited.reviewEligibility.canApprove).toBe(true);

        // Approval succeeds at revision 2 without needing to re-run human assessment.
        const approved = await review.approve(
          'phase-c-non-material',
          { expectedRevision: 2, explanation: 'Approved after metadata edit.' },
          actor,
        );
        expect(approved.reviewStatus).toBe('approved');
      });

      it('preserves historical assessment snapshot and records assessment_invalidated on material edits', async () => {
        await seedReviewCandidate('phase-c-material-history');
        await assessSupported('phase-c-material-history');

        const edited = await review.edit(
          'phase-c-material-history',
          {
            expectedRevision: 1,
            explanation: 'Updated the prompt wording and options.',
            factualClaims: ['Mercy heals allies with Caduceus Staff'],
            draft: {
              prompt: { ar: 'أي بطل يستخدم عصا الكادوسيوس للشفاء؟' },
              answerPayload: {
                mode: 'multiple_choice',
                options: [
                  { id: 'a', label: { ar: 'مرسي' } },
                  { id: 'b', label: { ar: 'جنجي' } },
                ],
                correctOptionId: 'a',
              },
            },
          },
          actor,
        );

        expect(edited.humanAssessment).toBeNull();
        expect(edited.factVerification).toBeNull();
        expect(edited.qualityEvaluation).toBeNull();
        expect(edited.lastInvalidatedAssessments).toMatchObject({
          invalidatedAtRevision: 2,
          previousRevision: 1,
          factVerification: { state: 'SUPPORTED' },
          qualityEvaluation: { recommendation: 'PASS' },
          humanAssessment: expect.objectContaining({
            factualState: 'SUPPORTED',
            assessedRevision: 1,
          }),
        });
        expect(edited.reviewEligibility.assessmentStale).toBe(true);
        expect(
          edited.reviewEvents.map((event: { action: string }) => event.action),
        ).toEqual(['assessed', 'edited', 'assessment_invalidated']);
      });

      it('enforces evidence URLs for ACCEPTED_WITH_EVIDENCE and forbids weak overrides on CONTRADICTED claims', async () => {
        await seedReviewCandidate('phase-c-factual-safety');
        await review.assess(
          'phase-c-factual-safety',
          {
            expectedRevision: 0,
            factualState: 'UNSUPPORTED',
            factualExplanation: 'Automated retrieval found no direct snippet.',
            evidence: [],
            quality: {
              correctness: 4,
              mechanicFit: 4,
              clarity: 4,
              multiplayerFit: 4,
              originality: 4,
              explanation: 'Good question structure.',
            },
          },
          actor,
        );

        // Cannot use ACCEPTED_WITH_EVIDENCE without evidence URLs in humanAssessment.
        await expect(
          review.approve(
            'phase-c-factual-safety',
            {
              expectedRevision: 1,
              explanation: 'Try approving with evidence override',
              factualOverrideCode: 'ACCEPTED_WITH_EVIDENCE',
              factualOverrideExplanation: 'No evidence attached',
            },
            actor,
          ),
        ).rejects.toThrow(/evidence URL/i);

        // CLAIM_NOT_ANSWER_CRITICAL is allowed for UNSUPPORTED when explicitly explained.
        const approved = await review.approve(
          'phase-c-factual-safety',
          {
            expectedRevision: 1,
            explanation:
              'Approved because the claim is background flavour only.',
            factualOverrideCode: 'CLAIM_NOT_ANSWER_CRITICAL',
            factualOverrideExplanation:
              'The prompt is answerable without relying on the secondary claim.',
          },
          actor,
        );
        expect(approved.reviewStatus).toBe('approved');
        expect(approved.reviewDecision).toMatchObject({
          factualOverrideCode: 'CLAIM_NOT_ANSWER_CRITICAL',
          exceptionalOverride: true,
        });
      });

      it('validates normalized duplicate options, option count, and Closest slider math on edit', async () => {
        await seedReviewCandidate('phase-c-edit-validation');

        // Duplicate normalized Arabic options ('أحمد' vs 'احمد') must fail.
        await expect(
          review.edit(
            'phase-c-edit-validation',
            {
              expectedRevision: 0,
              explanation: 'Duplicate options test',
              factualClaims: ['Claim'],
              draft: {
                prompt: { ar: 'من هو اللاعب؟' },
                answerPayload: {
                  mode: 'multiple_choice',
                  options: [
                    { id: 'a', label: { ar: 'أحمد' } },
                    { id: 'b', label: { ar: 'احمد' } },
                  ],
                  correctOptionId: 'a',
                },
              },
            },
            actor,
          ),
        ).rejects.toThrow(/duplicates another option/i);

        // 5 options (above max 4) must fail.
        await expect(
          review.edit(
            'phase-c-edit-validation',
            {
              expectedRevision: 0,
              explanation: 'Too many options test',
              factualClaims: ['Claim'],
              draft: {
                prompt: { ar: 'من هو اللاعب؟' },
                answerPayload: {
                  mode: 'multiple_choice',
                  options: [
                    { id: 'a', label: { ar: 'خيار ١' } },
                    { id: 'b', label: { ar: 'خيار ٢' } },
                    { id: 'c', label: { ar: 'خيار ٣' } },
                    { id: 'd', label: { ar: 'خيار ٤' } },
                    { id: 'e', label: { ar: 'خيار ٥' } },
                  ],
                  correctOptionId: 'a',
                },
              },
            },
            actor,
          ),
        ).rejects.toThrow(/between 2 and 4 options/i);
      });

      it('fails closed during review when legacy job or candidate provenance is corrupted or mismatched', async () => {
        const seeded = await seedReviewCandidate('phase-c-corrupted-spec');
        await assessSupported('phase-c-corrupted-spec');

        // Corrupt the job's generationSpec so its worldKey disagrees with job.worldKey
        await database.collection('engine_jobs').updateOne(
          { _id: new Types.ObjectId(seeded.jobId) },
          {
            $set: {
              specVersion: 'generation-spec-v1',
              generationSpec: {
                specVersion: 'generation-spec-v1',
                worldKey: 'different-world',
                scopeKey: 'overwatch',
                mechanicKey: 'read-your-opponent',
              },
            },
          },
        );

        await expect(
          review.approve(
            'phase-c-corrupted-spec',
            { expectedRevision: 1, explanation: 'Should fail closed' },
            actor,
          ),
        ).rejects.toThrow(/generation specification/i);
      });

      describe('Phase C Final Safety Audit regression guarantees', () => {
        it('rejects bare or unrelated URLs and requires claim-level evidence on contradicted candidates', async () => {
          await seedReviewCandidate('safety-contradicted-bare-url');
          await database.collection('engine_candidates').updateOne(
            { candidateId: 'safety-contradicted-bare-url' },
            {
              $set: {
                status: 'fact_blocked',
                factVerification: { state: 'CONTRADICTED', confidence: 0.95 },
                factualClaims: [
                  'Mercy can heal allies',
                  'Genji uses shurikens',
                ],
              },
            },
          );

          // Bare URL without explanatory note or claim association fails
          await expect(
            review.assess(
              'safety-contradicted-bare-url',
              {
                expectedRevision: 0,
                factualState: 'CONTRADICTED',
                factualExplanation: 'Contradiction identified.',
                evidence: [{ url: 'https://example.test/unrelated' }],
                quality: {
                  correctness: 2,
                  mechanicFit: 4,
                  clarity: 4,
                  multiplayerFit: 4,
                  originality: 4,
                  explanation: 'Quality requires review.',
                },
              },
              actor,
            ),
          ).rejects.toThrow(
            /Evidence for contradicted claims must include an explanatory title or note/,
          );

          // Multiple claims without claimIndex or claimText fails
          await expect(
            review.assess(
              'safety-contradicted-bare-url',
              {
                expectedRevision: 0,
                factualState: 'CONTRADICTED',
                factualExplanation: 'Contradiction identified.',
                evidence: [
                  {
                    url: 'https://example.test/patch-note',
                    title: 'Valid title for patch',
                    note: 'Valid explanatory note refuting contradiction.',
                  },
                ],
                quality: {
                  correctness: 2,
                  mechanicFit: 4,
                  clarity: 4,
                  multiplayerFit: 4,
                  originality: 4,
                  explanation: 'Quality requires review.',
                },
              },
              actor,
            ),
          ).rejects.toThrow(
            /Evidence for contradicted claims must be associated with a specific factual claim/,
          );

          // Invalid claimIndex fails
          await expect(
            review.assess(
              'safety-contradicted-bare-url',
              {
                expectedRevision: 0,
                factualState: 'CONTRADICTED',
                factualExplanation: 'Contradiction identified.',
                evidence: [
                  {
                    url: 'https://example.test/patch-note',
                    claimIndex: 99,
                    title: 'Valid title for patch',
                    note: 'Valid explanatory note refuting contradiction.',
                  },
                ],
                quality: {
                  correctness: 2,
                  mechanicFit: 4,
                  clarity: 4,
                  multiplayerFit: 4,
                  originality: 4,
                  explanation: 'Quality requires review.',
                },
              },
              actor,
            ),
          ).rejects.toThrow(/out of bounds for candidate factual claims/);
        });

        it('disallows silently turning contradicted automated verification into SUPPORTED during human assessment', async () => {
          await seedReviewCandidate('safety-contradicted-to-supported');
          await database.collection('engine_candidates').updateOne(
            { candidateId: 'safety-contradicted-to-supported' },
            {
              $set: {
                status: 'fact_blocked',
                factVerification: { state: 'CONTRADICTED', confidence: 0.9 },
                factualClaims: ['Mercy can heal allies'],
              },
            },
          );

          await expect(
            review.assess(
              'safety-contradicted-to-supported',
              {
                expectedRevision: 0,
                factualState: 'SUPPORTED',
                factualExplanation:
                  'Attempting to mask contradiction as supported.',
                evidence: [
                  {
                    url: 'https://example.test/proof',
                    claimIndex: 0,
                    title: 'Title of proof',
                    note: 'Explanatory note of proof.',
                  },
                ],
                quality: {
                  correctness: 4,
                  mechanicFit: 4,
                  clarity: 4,
                  multiplayerFit: 4,
                  originality: 4,
                  explanation: 'Quality is sound.',
                },
              },
              actor,
            ),
          ).rejects.toThrow(
            /contradictory automated factual verification; it cannot be marked SUPPORTED directly/,
          );
        });

        it('executes valid explicit override for CONTRADICTED candidate and preserves contradiction history in DB and events', async () => {
          await seedReviewCandidate('safety-valid-override');
          await database.collection('engine_candidates').updateOne(
            { candidateId: 'safety-valid-override' },
            {
              $set: {
                status: 'fact_blocked',
                factVerification: { state: 'CONTRADICTED', confidence: 0.92 },
                factualClaims: ['Mercy can heal allies'],
              },
            },
          );

          // Correct assessment with claim-associated evidence and note
          await review.assess(
            'safety-valid-override',
            {
              expectedRevision: 0,
              factualState: 'CONTRADICTED',
              factualExplanation:
                'Automated check found contradiction in legacy dataset.',
              evidence: [
                {
                  url: 'https://example.test/official-patch-2026',
                  claimIndex: 0,
                  claimText: 'Mercy can heal allies',
                  title: 'Overwatch Patch Notes 2026',
                  note: 'Official Blizzard documentation confirms healing ability.',
                },
              ],
              quality: {
                correctness: 4,
                mechanicFit: 4,
                clarity: 4,
                multiplayerFit: 4,
                originality: 4,
                explanation: 'Excellent gameplay structure.',
              },
            },
            actor,
          );

          // Missing or short override explanation fails
          await expect(
            review.approve(
              'safety-valid-override',
              {
                expectedRevision: 1,
                explanation: 'Approved by admin.',
                factualOverrideCode: 'ACCEPTED_WITH_EVIDENCE',
                factualOverrideExplanation: 'too short',
              },
              actor,
            ),
          ).rejects.toThrow(/factualOverrideExplanation must be meaningful/);

          // Valid approval with meaningful override explanation succeeds
          const approved = await review.approve(
            'safety-valid-override',
            {
              expectedRevision: 1,
              explanation: 'Approved after verifying official documentation.',
              factualOverrideCode: 'ACCEPTED_WITH_EVIDENCE',
              factualOverrideExplanation:
                'Official Blizzard patch notes 2026 explicitly verify this character mechanic.',
            },
            actor,
          );

          expect(approved.reviewStatus).toBe('approved');
          expect(approved.reviewRevision).toBe(2);

          const candidateInDb = await database
            .collection('engine_candidates')
            .findOne({ candidateId: 'safety-valid-override' });

          expect(candidateInDb).toMatchObject({
            reviewStatus: 'approved',
            reviewDecision: {
              decision: 'approved',
              exceptionalOverride: true,
              automatedContradictionOverridden: true,
              factualOverrideCode: 'ACCEPTED_WITH_EVIDENCE',
              originalFactVerification: {
                state: 'CONTRADICTED',
                confidence: 0.92,
              },
            },
          });

          const approvedEvent = candidateInDb?.reviewEvents.find(
            (e: { action: string }) => e.action === 'approved',
          );
          expect(approvedEvent).toMatchObject({
            action: 'approved',
            actorId: actor.id,
            revision: 2,
            details: {
              exceptionalOverride: true,
              automatedContradictionOverridden: true,
              originalFactVerificationState: 'CONTRADICTED',
            },
          });

          // Draft creation verifies safety invariants and succeeds
          const draft = await review.createDraft(
            'safety-valid-override',
            2,
            actor,
          );
          expect(draft.status).toBe('draft');
          expect(draft.alreadyCreated).toBe(false);
        });

        it('verifies non-material edit after approval voids prior approval, requiring re-approval before DRAFT creation', async () => {
          await seedReviewCandidate('safety-post-approval-edit');
          await assessSupported('safety-post-approval-edit');
          await approve('safety-post-approval-edit');

          // Candidate is currently approved at revision 2
          const beforeEdit = await review.detail('safety-post-approval-edit');
          expect(beforeEdit.reviewStatus).toBe('approved');
          expect(beforeEdit.reviewRevision).toBe(2);

          // Admin performs non-material metadata edit at revision 2 -> advances to revision 3
          const afterEdit = await review.edit(
            'safety-post-approval-edit',
            {
              expectedRevision: 2,
              explanation: 'Updated editorial notes post-approval.',
              factualClaims: ['Mercy can heal allies'],
              draft: {
                prompt: { ar: 'أي بطل يملك قدرة الشفاء الجماعي؟' },
                answerPayload: {
                  mode: 'multiple_choice',
                  options: [
                    { id: 'a', label: { ar: 'مرسي' } },
                    { id: 'b', label: { ar: 'جنجي' } },
                  ],
                  correctOptionId: 'a',
                },
                metadata: {
                  source: 'content-engine',
                  notes: 'Post-approval editorial note',
                },
              },
            },
            actor,
          );

          expect(afterEdit.reviewRevision).toBe(3);
          expect(afterEdit.reviewStatus).toBe('pending');
          expect(afterEdit.reviewDecision).toBeNull();
          // Human assessment is preserved and carried forward
          expect(afterEdit.humanAssessment).toMatchObject({
            factualState: 'SUPPORTED',
            assessedRevision: 3,
            previousAssessedRevision: 1,
          });
          expect(afterEdit.reviewEligibility.canApprove).toBe(true);
          expect(afterEdit.reviewEligibility.canCreateDraft).toBe(false);

          // Calling createDraft at revision 3 fails closed because approval was voided
          await expect(
            review.createDraft('safety-post-approval-edit', 3, actor),
          ).rejects.toThrow(/Candidate must be approved by a human reviewer/);

          // Admin re-approves at revision 3 -> advances to revision 4
          const reApproved = await review.approve(
            'safety-post-approval-edit',
            {
              expectedRevision: 3,
              explanation: 'Re-approved after confirming metadata update.',
            },
            actor,
          );
          expect(reApproved.reviewRevision).toBe(4);
          expect(reApproved.reviewStatus).toBe('approved');
          expect(reApproved.reviewEligibility.canCreateDraft).toBe(true);

          // Draft creation at revision 4 succeeds
          const draft = await review.createDraft(
            'safety-post-approval-edit',
            4,
            actor,
          );
          expect(draft.status).toBe('draft');
        });

        it('enforces revision CAS checks and prevents concurrent overwrites or stale draft creation', async () => {
          await seedReviewCandidate('safety-cas-enforcement');
          await assessSupported('safety-cas-enforcement');

          // Stale expectedRevision on approve throws ConflictException
          await expect(
            review.approve(
              'safety-cas-enforcement',
              { expectedRevision: 0, explanation: 'Stale approval attempt.' },
              actor,
            ),
          ).rejects.toThrow(/Candidate changed; reload before reviewing/);

          // Valid approval at revision 1 -> advances to revision 2
          await review.approve(
            'safety-cas-enforcement',
            { expectedRevision: 1, explanation: 'Valid approval.' },
            actor,
          );

          // Stale draft creation with revision 1 when candidate is at revision 2 fails
          await expect(
            review.createDraft('safety-cas-enforcement', 1, actor),
          ).rejects.toThrow(
            /Candidate changed; reload before creating a draft/,
          );

          // Concurrent edit attempt with stale revision 1 fails
          await expect(
            review.edit(
              'safety-cas-enforcement',
              {
                expectedRevision: 1,
                explanation: 'Concurrent edit attempt with stale revision.',
                factualClaims: ['Mercy can heal allies'],
                draft: {
                  prompt: { ar: 'أي بطل يملك قدرة الشفاء الجماعي؟' },
                  answerPayload: {
                    mode: 'multiple_choice',
                    options: [
                      { id: 'a', label: { ar: 'مرسي' } },
                      { id: 'b', label: { ar: 'جنجي' } },
                    ],
                    correctOptionId: 'a',
                  },
                },
              },
              actor,
            ),
          ).rejects.toThrow(/Candidate changed; reload before reviewing/);

          // Valid draft creation at revision 2 succeeds
          const draft1 = await review.createDraft(
            'safety-cas-enforcement',
            2,
            actor,
          );
          expect(draft1.alreadyCreated).toBe(false);

          // Duplicate draft creation returns idempotent response
          const draft2 = await review.createDraft(
            'safety-cas-enforcement',
            2,
            actor,
          );
          expect(draft2.alreadyCreated).toBe(true);
          expect(draft2.contentItemId).toBe(draft1.contentItemId);
        });
      });
    });
  });

  describe('Phase 1a safety review', () => {
    const reserveFor = (id: string, jobId: string) =>
      budget.reserve({
        reservationId: id,
        jobId,
        stage: 'generation',
        provider: 'fake',
        model: 'fake-model',
        expected: { promptTokens: 2_000_000, maxOutputTokens: 0 },
      });

    it('never settles the ledger without moving the budget', async () => {
      // The Phase 1a hole: ledger marked reconciled, budget still holding the
      // reservation, and the reclaim sweep blind to it because it only looks
      // at `reserved`. Capacity leaked permanently. Both writes now commit
      // together, so the two can never disagree.
      await reserveFor('r-atomic', 'j-atomic');
      await budget.settle({
        reservationId: 'r-atomic',
        usage: { promptTokens: 1_000_000 },
      });

      const entry = await database
        .collection('engine_cost_ledger')
        .findOne({ reservationId: 'r-atomic' });
      const state = await budget.snapshot();
      expect(entry!.status).toBe('reconciled');
      expect(state.reservedMicros).toBe(0); // the hold really was released
      expect(state.spentMicros).toBe(sarToMicros(1));
    });

    it('leaves nothing half-applied when a settle is interrupted and retried', async () => {
      await reserveFor('r-interrupted', 'j-interrupted');

      // Interrupt at the exact boundary: the transaction is aborted after the
      // ledger write would have happened. Nothing may be observable.
      const connection = database as unknown as {
        startSession: Connection['startSession'];
      };
      const session = await connection.startSession();
      try {
        await session.withTransaction(async () => {
          await database
            .collection('engine_cost_ledger')
            .updateOne(
              { reservationId: 'r-interrupted' },
              { $set: { status: 'reconciled', actualMicros: 1 } },
              { session },
            );
          throw new Error('simulated crash before the budget write');
        });
      } catch {
        /* expected */
      } finally {
        await session.endSession();
      }

      const afterCrash = await database
        .collection('engine_cost_ledger')
        .findOne({ reservationId: 'r-interrupted' });
      expect(afterCrash!.status).toBe('reserved'); // rolled back entirely

      // The retry therefore still works, and charges exactly once.
      const settled = await budget.settle({
        reservationId: 'r-interrupted',
        usage: { promptTokens: 1_000_000 },
      });
      expect(settled!.actualMicros).toBe(sarToMicros(1));
      const state = await budget.snapshot();
      expect(state.spentMicros).toBe(sarToMicros(1));
      expect(state.reservedMicros).toBe(0);
    });

    it('refuses to reclaim a reservation whose worker still holds its lease', async () => {
      // The race: a slow provider call under a valid lease looks identical to
      // a crashed worker if you judge by reservation age alone.
      const { jobId } = await jobs.submit(
        request({ contextRevision: 'lease-live' }),
      );
      const held = await jobs.lease({ owner: 'worker-live' });
      expect(held!.jobId).toBe(jobId);
      await reserveFor('r-live', jobId);

      const reclaimed = await budget.reclaimStaleReservations({
        staleAfterMs: -1,
      });
      expect(reclaimed).toBe(0);

      const entry = await database
        .collection('engine_cost_ledger')
        .findOne({ reservationId: 'r-live' });
      expect(entry!.status).toBe('reserved'); // untouched

      // The rightful owner can still settle it, which is the whole point.
      const settled = await budget.settle({
        reservationId: 'r-live',
        usage: { promptTokens: 1_000_000 },
      });
      expect(settled!.actualMicros).toBe(sarToMicros(1));
    });

    it('reclaims once that same lease has lapsed', async () => {
      const { jobId } = await jobs.submit(
        request({ contextRevision: 'lease-dead' }),
      );
      const held = await jobs.lease({ owner: 'worker-dead', leaseMs: -1 }); // expired
      expect(held!.jobId).toBe(jobId);
      await reserveFor('r-dead', jobId);

      expect(await budget.reclaimStaleReservations({ staleAfterMs: -1 })).toBe(
        1,
      );
      const entry = await database
        .collection('engine_cost_ledger')
        .findOne({ reservationId: 'r-dead' });
      expect(entry!.status).toBe('orphaned');
      expect(entry!.usageKnown).toBe(false); // conservative for ambiguity
      const state = await budget.snapshot();
      expect(state.spentMicros).toBe(sarToMicros(2)); // charged, not forgiven
      expect(state.reservedMicros).toBe(0);
    });

    it('reclaims a reservation whose job no longer exists', async () => {
      await reserveFor('r-orphan-job', 'j-vanished');
      expect(await budget.reclaimStaleReservations({ staleAfterMs: -1 })).toBe(
        1,
      );
    });
  });

  describe('retries respect the cap', () => {
    it('makes every attempt reserve again rather than reusing a grant', async () => {
      await jobs.submit(request());
      const first = await jobs.lease({ owner: 'worker-a', leaseMs: -1 });
      await budget.reserve({
        reservationId: `${first!.jobId}:generation:${first!.attempts}`,
        jobId: first!.jobId,
        stage: 'generation',
        provider: 'fake',
        model: 'fake-model',
        expected: ONE_SAR_CALL,
      });
      await jobs.recoverExpiredLeases();

      const retry = await jobs.lease({ owner: 'worker-b' });
      expect(retry!.attempts).toBe(first!.attempts + 1);
      // A different attempt means a different reservation id, so the retry is
      // charged — it cannot ride on the first attempt's grant.
      await budget.reserve({
        reservationId: `${retry!.jobId}:generation:${retry!.attempts}`,
        jobId: retry!.jobId,
        stage: 'generation',
        provider: 'fake',
        model: 'fake-model',
        expected: ONE_SAR_CALL,
      });
      expect((await budget.snapshot()).reservedMicros).toBe(sarToMicros(2));
    });
  });
});
