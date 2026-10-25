import { ConfigModule } from '@nestjs/config';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
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
  sarToMicros,
} from '../../src/modules/content-engine/domain/content-engine.constants';
import { FakeAiProvider } from '../../src/modules/content-engine/testing/fake-ai.provider';

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
      const attempts = await Promise.allSettled(
        Array.from({ length: 150 }, (_, i) =>
          budget.reserve({
            reservationId: `race-${i}`,
            jobId: 'j',
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
          evidence: [{ url: 'https://example.test/contradiction' }],
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
      const [first, concurrent] = await Promise.all([
        review.createDraft('review-publish-once', 2, actor),
        review.createDraft('review-publish-once', 2, actor),
      ]);
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
      await seedReviewCandidate('review-crash');
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
      create.mockRestore();
      await expect(
        review.createDraft('review-crash', 2, actor),
      ).resolves.toMatchObject({
        status: 'draft',
        alreadyCreated: false,
      });
    });

    it('refuses canonical creation when compatibility is invalid', async () => {
      await seedReviewCandidate('review-invalid');
      await database.collection('engine_candidates').updateOne(
        { candidateId: 'review-invalid' },
        {
          $set: {
            reviewStatus: 'approved',
            reviewRevision: 2,
            draft: {
              prompt: { ar: 'سؤال غير متوافق' },
              answerPayload: { mode: 'match', acceptedAnswers: ['إجابة'] },
            },
          },
        },
      );
      await expect(
        review.createDraft('review-invalid', 2, actor),
      ).rejects.toThrow(/incompatible|pattern|Candidate/);
      expect(await database.collection('content_items').countDocuments()).toBe(
        0,
      );
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
