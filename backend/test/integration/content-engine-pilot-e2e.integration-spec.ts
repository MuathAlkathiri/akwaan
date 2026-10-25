import { INestApplication } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { AiProvider } from '../../src/modules/ai-agent/domain/ai-provider.interface';
import { ENGINE_AI_PROVIDER } from '../../src/modules/content-engine/domain/content-engine.constants';
import { FakeAiProvider } from '../../src/modules/content-engine/testing/fake-ai.provider';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { loginForToken } from '../helpers/auth-helper';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

/**
 * The whole pipeline, driven the way a human will drive it: authenticated HTTP.
 *
 * Phase 1d left the engine implemented and unreachable — every service tested,
 * no way to start one. This proves the seam that closes that gap, end to end,
 * on a fake provider: submit → run → generate → screen → verify → judge →
 * human-review queue.
 *
 * The provider is `FakeAiProvider`, bound by overriding the engine's own slot.
 * No paid call is reachable: `ENGINE_LIVE_PROVIDER_ENABLED` is never set here,
 * and even if it were, the factory also demands a provider name and an API key.
 */
describe('Content Engine pilot — fake end-to-end over Admin HTTP', () => {
  let app: INestApplication;
  let database: Connection;
  let adminToken: string;
  let userToken: string;
  let fake: FakeAiProvider;

  const PILOT = {
    mechanicKey: 'read-your-opponent',
    worldKey: 'video-games',
    scopeKey: 'overwatch',
    targetCount: 3,
  };

  /** Three candidates: two clean, one that must fail deterministic screening. */
  const CANDIDATES = JSON.stringify({
    candidates: [
      {
        prompt: 'أي بطل يملك قدرة الشفاء الجماعي في أوفرواتش؟',
        options: [
          { id: 'a', label: 'مرسي' },
          { id: 'b', label: 'لوسيو' },
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
      {
        // Leaks its own answer — screening must block this one.
        prompt: 'هل مرسي هي بطلة الدعم؟',
        options: [
          { id: 'a', label: 'مرسي' },
          { id: 'b', label: 'آنا' },
        ],
        correctOptionId: 'a',
        factualClaims: ['Mercy is a support hero'],
      },
    ],
  });

  const api = () => request(app.getHttpServer());
  const asAdmin = <T extends request.Test>(value: T): T =>
    value.set('Authorization', `Bearer ${adminToken}`) as T;

  beforeAll(async () => {
    fake = new FakeAiProvider({
      text: CANDIDATES,
      model: 'fake-model',
      usage: { promptTokens: 1200, completionTokens: 800 },
    });

    database = await connectTestDatabase();
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: {
        CONTENT_ENGINE_ENABLED: 'true',
        ENGINE_AUTHORING_ROOT: process.cwd().replace(/\/backend$/, ''),
        ENGINE_PROVIDER_NAME: 'fake',
        ENGINE_GENERATION_MODEL: 'fake-model',
        ENGINE_QUALITY_MODEL: 'fake-model',
        ENGINE_MONTHLY_CAP_SAR: '100',
        ENGINE_BATCH_CAP_SAR: '25',
        ENGINE_MODEL_PRICING: JSON.stringify({
          'fake/fake-model': {
            inputMicrosPerMillion: 1_000,
            outputMicrosPerMillion: 2_000,
          },
        }),
      },
      configure: (builder) =>
        builder
          .overrideProvider(ENGINE_AI_PROVIDER)
          .useValue(fake as AiProvider),
    });
    adminToken = await loginForToken(app, fixtureCredentials.admin);
    userToken = await loginForToken(app, fixtureCredentials.user);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  describe('authorization', () => {
    it('refuses GET /admin/content-engine/options without an admin token', async () => {
      await api().get('/admin/content-engine/options').expect(401);
      await api()
        .get('/admin/content-engine/options')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it.each([
      ['post', '/admin/content-engine/jobs'],
      ['post', '/admin/content-engine/jobs/preflight'],
      ['post', '/admin/content-engine/jobs/run'],
    ])('refuses %s %s without a token', async (_method, path) => {
      await api().post(path).send(PILOT).expect(401);
    });

    it('refuses a non-admin user', async () => {
      await api()
        .post('/admin/content-engine/jobs')
        .set('Authorization', `Bearer ${userToken}`)
        .send(PILOT)
        .expect(403);
    });
  });

  describe('options and preflight', () => {
    it('returns server-derived authoring options with RYO difficulty support and Closest deferral', async () => {
      const body = (
        await asAdmin(api().get('/admin/content-engine/options')).expect(200)
      ).body.data;

      expect(body.specVersion).toBe('generation-spec-v1');
      expect(body.limits).toMatchObject({
        minTargetCount: 1,
        maxTargetCount: 10,
        maxBatchGuidanceLength: 1000,
      });
      const ryo = body.mechanics.find(
        (m: { mechanicKey: string }) => m.mechanicKey === 'read-your-opponent',
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
      const closest = body.mechanics.find(
        (m: { mechanicKey: string }) => m.mechanicKey === 'closest',
      );
      expect(closest).toMatchObject({
        eligible: true,
        generatorSupported: true,
        supportsDifficultySelection: false,
        difficultyDeferredReason: 'CLOSEST_DIFFICULTY_DEFERRED',
      });
    });

    it('prices a resolvable combination, reports the budget, and remains strictly read-only', async () => {
      const jobsBefore = await database
        .collection('engine_jobs')
        .countDocuments();
      const budgetBefore = await database
        .collection('engine_budget')
        .countDocuments();

      const body = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send(PILOT)
          .expect(201)
      ).body.data;

      expect(body.resolvable).toBe(true);
      expect(body.submissionReady).toBe(true);
      expect(body.planDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(body.generationSpec).toMatchObject({
        specVersion: 'generation-spec-v1',
        mechanicKey: PILOT.mechanicKey,
        worldKey: PILOT.worldKey,
        scopeKey: PILOT.scopeKey,
        targetCount: PILOT.targetCount,
        difficulty: 'mixed',
      });
      expect(body.pricingConfigured).toBe(true);
      expect(body.engineEnabled).toBe(true);
      // Live mode is off, so no paid call is possible even now.
      expect(body.liveProviderEnabled).toBe(false);
      expect(body.estimatedMicros).toBeGreaterThan(0);
      expect(body.budget.capMicros).toBe(100_000_000);
      expect(body.contextHash).toHaveLength(64);

      expect(await database.collection('engine_jobs').countDocuments()).toBe(
        jobsBefore,
      );
      expect(await database.collection('engine_budget').countDocuments()).toBe(
        budgetBefore,
      );
    });

    it('refuses an unauthorable combination with the canonical reason', async () => {
      const body = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send({ ...PILOT, scopeKey: 'does-not-exist' })
          .expect(201)
      ).body.data;
      expect(body.resolvable).toBe(false);
      expect(body.blockedReason).toContain('UNKNOWN_SCOPE');
    });

    it('rejects a batch size exceeding actual generation capacity rather than truncating', async () => {
      const preflightOver = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send({ ...PILOT, targetCount: 11 })
          .expect(201)
      ).body.data;
      expect(preflightOver.resolvable).toBe(false);
      expect(preflightOver.blockedCode).toBe(
        'CANDIDATE_COUNT_EXCEEDS_CAPACITY',
      );

      await asAdmin(api().post('/admin/content-engine/jobs'))
        .send({ ...PILOT, targetCount: 11, planDigest: 'a'.repeat(64) })
        .expect(400);

      await asAdmin(api().post('/admin/content-engine/jobs'))
        .send({ ...PILOT, targetCount: 500 })
        .expect(400);
    });

    it('rejects submission when planDigest is missing or has drifted since preflight', async () => {
      const preflight = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send({
            ...PILOT,
            difficulty: 'easy',
            batchGuidance: 'Focus on hero abilities.',
          })
          .expect(201)
      ).body.data;

      await asAdmin(api().post('/admin/content-engine/jobs'))
        .send({
          ...PILOT,
          difficulty: 'easy',
          batchGuidance: 'Focus on hero abilities.',
        })
        .expect(400);

      const drifted = await asAdmin(
        api().post('/admin/content-engine/jobs'),
      ).send({
        ...PILOT,
        difficulty: 'medium',
        batchGuidance: 'Focus on hero abilities.',
        planDigest: preflight.planDigest,
      });
      expect(drifted.status).toBe(409);
      expect(drifted.body.code ?? drifted.body.message).toBeDefined();
    });
  });

  describe('submission and execution', () => {
    let planDigest: string;
    let jobId: string;

    it('submits idempotently — a double click is one job, with authenticated Admin attribution', async () => {
      const preflight = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send(PILOT)
          .expect(201)
      ).body.data;
      planDigest = preflight.planDigest;

      const payload = { ...PILOT, planDigest };
      const [first, second] = await Promise.all([
        asAdmin(api().post('/admin/content-engine/jobs')).send(payload),
        asAdmin(api().post('/admin/content-engine/jobs')).send(payload),
      ]);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.data.jobId).toBe(second.body.data.jobId);
      expect(
        [first.body.data.created, second.body.data.created].filter(Boolean),
      ).toHaveLength(1);
      expect(first.body.data.createdBy).toBeTruthy();
      expect(first.body.data.createdByEmail).toBe(
        fixtureCredentials.admin.email,
      );
      jobId = first.body.data.jobId;

      expect(await database.collection('engine_jobs').countDocuments()).toBe(1);
    });

    it('rejects untargeted run requests or client-supplied owner spoofing', async () => {
      await asAdmin(api().post('/admin/content-engine/jobs/run'))
        .send({})
        .expect(400);

      await asAdmin(api().post('/admin/content-engine/jobs/run'))
        .send({ jobId, owner: 'spoofed-owner' })
        .expect(400);
    });

    it('runs the exact targeted job to the human-review queue', async () => {
      const run = (
        await asAdmin(api().post(`/admin/content-engine/jobs/${jobId}/run`))
          .send({})
          .expect(201)
      ).body.data;
      expect(run.jobId).toBe(jobId);

      const status = (
        await asAdmin(api().get(`/admin/content-engine/jobs/${jobId}`)).expect(
          200,
        )
      ).body.data;

      // It reached review, not completion: a human still decides.
      // Surface the engine's own reason when it did not, so a failure here
      // names the cause instead of just the mismatch.
      expect({ status: status.status, lastError: status.lastError }).toEqual({
        status: 'awaiting_review',
        lastError: null,
      });
      expect(status.provenanceComplete).toBe(true);
      expect(status.createdByEmail).toBe(fixtureCredentials.admin.email);
      expect(status.lastExecutedByEmail).toBe(fixtureCredentials.admin.email);
      expect(status.spentMicros).toBeGreaterThan(0);
    });

    it('generated, screened and judged the batch', async () => {
      const rows = await database
        .collection('engine_candidates')
        .find({ jobId })
        .toArray();
      expect(rows).toHaveLength(3);

      // The leaking candidate must have been blocked deterministically.
      const blocked = rows.filter((row) =>
        (row.findings ?? []).some(
          (finding: { code: string; severity: string }) =>
            finding.code === 'ANSWER_LEAKAGE' &&
            finding.severity === 'blocking',
        ),
      );
      expect(blocked).toHaveLength(1);
      expect(blocked[0].status).toBe('screened_reject');
    });

    it('left every factual claim UNRESOLVED with no retriever configured', async () => {
      const rows = await database
        .collection('engine_candidates')
        .find({ jobId })
        .toArray();
      const states = rows
        .map((row) => row.factVerification?.state)
        .filter(Boolean);
      expect(states.length).toBeGreaterThan(0);
      // Fail-closed: nothing may advance on unverified facts.
      expect(new Set(states)).toEqual(new Set(['UNRESOLVED']));
      for (const row of rows) {
        expect(row.factVerification?.automaticAdvance ?? false).toBe(false);
      }
    });

    it('created no ContentItem, promoted nothing to READY', async () => {
      expect(await database.collection('contentitems').countDocuments()).toBe(
        0,
      );
      expect(
        await database.collection('engine_draft_publications').countDocuments(),
      ).toBe(0);
    });

    it('made no paid call — every generation went through the fake provider', () => {
      expect(fake.calls.length).toBeGreaterThan(0);
      expect(fake.calls[0].prompt).toContain(
        'MECHANIC PROFILE (read-your-opponent)',
      );
    });

    it('reports spending for the job', async () => {
      const spending = (
        await asAdmin(
          api().get(`/admin/content-engine/jobs/${jobId}/spending`),
        ).expect(200)
      ).body.data;
      expect(spending).toBeDefined();
    });

    it('reconciled every reservation it made', async () => {
      const outstanding = await database
        .collection('engine_cost_ledger')
        .countDocuments({ jobId, status: 'reserved' });
      expect(outstanding).toBe(0);
    });

    it('refuses to re-run a job that has already reached awaiting_review', async () => {
      await asAdmin(api().post('/admin/content-engine/jobs/run'))
        .send({ jobId })
        .expect(409);
    });

    it('404s for an unknown job', async () => {
      await asAdmin(
        api().get('/admin/content-engine/jobs/ffffffffffffffffffffffff'),
      ).expect(404);
      await asAdmin(api().post('/admin/content-engine/jobs/run'))
        .send({ jobId: 'ffffffffffffffffffffffff' })
        .expect(404);
    });
  });

  describe('distinct job identity, exact-job isolation, cancellation, and legacy provenance', () => {
    it('creates distinct jobs for different guidance/difficulty and executes only the targeted job', async () => {
      const reqA = {
        ...PILOT,
        targetCount: 2,
        difficulty: 'easy',
        batchGuidance: 'Focus on support heroes.',
      };
      const reqB = {
        ...PILOT,
        targetCount: 2,
        difficulty: 'relatively_difficult',
        batchGuidance: 'Focus on map lore.',
      };

      const planA = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send(reqA)
          .expect(201)
      ).body.data;
      const planB = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send(reqB)
          .expect(201)
      ).body.data;

      const subA = (
        await asAdmin(api().post('/admin/content-engine/jobs'))
          .send({ ...reqA, planDigest: planA.planDigest })
          .expect(201)
      ).body.data;
      const subB = (
        await asAdmin(api().post('/admin/content-engine/jobs'))
          .send({ ...reqB, planDigest: planB.planDigest })
          .expect(201)
      ).body.data;

      expect(subA.jobId).not.toBe(subB.jobId);

      // Cancel jobA before running jobB; verify jobA stays cancelled and jobB runs alone.
      await asAdmin(
        api().post(`/admin/content-engine/jobs/${subA.jobId}/cancel`),
      ).expect(201);

      const statusA = (
        await asAdmin(
          api().get(`/admin/content-engine/jobs/${subA.jobId}`),
        ).expect(200)
      ).body.data;
      expect(statusA.status).toBe('cancelled');

      await asAdmin(api().post('/admin/content-engine/jobs/run'))
        .send({ jobId: subA.jobId })
        .expect(409);

      const runB = (
        await asAdmin(api().post('/admin/content-engine/jobs/run'))
          .send({ jobId: subB.jobId })
          .expect(201)
      ).body.data;
      expect(runB.jobId).toBe(subB.jobId);

      const statusB = (
        await asAdmin(
          api().get(`/admin/content-engine/jobs/${subB.jobId}`),
        ).expect(200)
      ).body.data;
      expect(statusB.status).toBe('awaiting_review');
    });

    it('preserves read access to legacy jobs without generationSpec and fails closed on execution', async () => {
      const legacyObjectId = Types.ObjectId.createFromTime(
        Math.floor(Date.now() / 1000) - 3600,
      );
      const inserted = await database.collection('engine_jobs').insertOne({
        _id: legacyObjectId,
        requestHash: 'legacy-request-hash',
        mechanicKey: PILOT.mechanicKey,
        worldKey: PILOT.worldKey,
        scopeKey: PILOT.scopeKey,
        targetCount: 2,
        status: 'queued',
        leaseOwner: null,
        leaseExpiresAt: null,
        leaseEpoch: 0,
        attempts: 0,
        cancellationRequested: false,
        reservedMicros: 0,
        spentMicros: 0,
        pipelineStage: 'pending',
        stageCheckpoints: {},
        awaitingReviewReason: null,
      });
      const legacyId = String(inserted.insertedId);

      const legacyStatus = (
        await asAdmin(
          api().get(`/admin/content-engine/jobs/${legacyId}`),
        ).expect(200)
      ).body.data;
      expect(legacyStatus).toMatchObject({
        jobId: legacyId,
        status: 'queued',
        provenanceComplete: false,
        generationSpec: null,
      });

      await asAdmin(api().post(`/admin/content-engine/jobs/${legacyId}/run`))
        .send({})
        .expect(409);
    });

    it('matches preflight generation cost estimate exactly to ledger reservation and executes using pinned generationSpec despite post-submission env drift', async () => {
      const req = {
        ...PILOT,
        targetCount: 2,
        difficulty: 'relatively_difficult',
        batchGuidance: 'Focus on ultimate abilities and cooldown trade-offs.',
      };

      const preflight = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send(req)
          .expect(201)
      ).body.data;

      expect(preflight.judgeEligible).toBe(false);
      expect(preflight.conditionalJudgeEstimatedMicros).toBe(0);
      expect(preflight.estimatedMicros).toBe(
        preflight.generationEstimatedMicros,
      );

      const submitted = (
        await asAdmin(api().post('/admin/content-engine/jobs'))
          .send({ ...req, planDigest: preflight.planDigest })
          .expect(201)
      ).body.data;

      // Mutate process.env after submission to simulate live config drift before execution
      const prevTemp = process.env.ENGINE_GENERATION_TEMPERATURE;
      const prevTokens = process.env.ENGINE_OUTPUT_TOKENS_PER_CANDIDATE;
      process.env.ENGINE_GENERATION_TEMPERATURE = '1.9';
      process.env.ENGINE_OUTPUT_TOKENS_PER_CANDIDATE = '300';
      try {
        fake.calls.length = 0;

        await asAdmin(
          api().post(`/admin/content-engine/jobs/${submitted.jobId}/run`),
        )
          .send({})
          .expect(201);

        expect(fake.calls).toHaveLength(1);
        const call = fake.calls[0];
        expect(call.model).toBe('fake-model');
        expect(call.promptVersion).toBe('mc-v2');
        expect(call.temperature).toBe(0.8);
        expect(call.maxOutputTokens).toBe(2 * 800);
        expect(call.prompt).toContain(
          'Focus on ultimate abilities and cooldown trade-offs.',
        );
        expect(call.prompt).toContain(
          '- requested difficulty mode: relatively_difficult',
        );

        const ledgerEntry = await database
          .collection('engine_cost_ledger')
          .findOne({ jobId: submitted.jobId, stage: 'generation' });
        expect(ledgerEntry).toBeDefined();
        expect(ledgerEntry!.reservedMicros).toBe(
          preflight.generationEstimatedMicros,
        );
        expect(ledgerEntry!.reservedMicros).toBe(preflight.estimatedMicros);
      } finally {
        if (prevTemp === undefined) {
          delete process.env.ENGINE_GENERATION_TEMPERATURE;
        } else {
          process.env.ENGINE_GENERATION_TEMPERATURE = prevTemp;
        }
        if (prevTokens === undefined) {
          delete process.env.ENGINE_OUTPUT_TOKENS_PER_CANDIDATE;
        } else {
          process.env.ENGINE_OUTPUT_TOKENS_PER_CANDIDATE = prevTokens;
        }
      }
    });

    it('provides read-only Admin-protected paginated job listing (GET /admin/content-engine/jobs) with filtering, bounded limits, cursor pagination, and stable ordering', async () => {
      // Unauthenticated requests are rejected
      await api().get('/admin/content-engine/jobs').expect(401);

      // Submit two distinct jobs
      const req1 = {
        ...PILOT,
        targetCount: 1,
        difficulty: 'easy',
        batchGuidance: 'Job list test batch one',
      };
      const pf1 = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send(req1)
          .expect(201)
      ).body.data;
      const job1 = (
        await asAdmin(api().post('/admin/content-engine/jobs'))
          .send({ ...req1, planDigest: pf1.planDigest })
          .expect(201)
      ).body.data;

      const req2 = {
        ...PILOT,
        targetCount: 2,
        difficulty: 'medium',
        batchGuidance: 'Job list test batch two',
      };
      const pf2 = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send(req2)
          .expect(201)
      ).body.data;
      const job2 = (
        await asAdmin(api().post('/admin/content-engine/jobs'))
          .send({ ...req2, planDigest: pf2.planDigest })
          .expect(201)
      ).body.data;

      const countBefore = await database
        .collection('engine_jobs')
        .countDocuments();

      // Page 1 with limit=1 returns newest job first (`job2`) and `nextCursor = job2.jobId`
      const page1 = (
        await asAdmin(
          api().get('/admin/content-engine/jobs?limit=1&status=queued'),
        ).expect(200)
      ).body.data;

      expect(page1.items).toHaveLength(1);
      expect(page1.items[0]).toMatchObject({
        jobId: job2.jobId,
        worldKey: PILOT.worldKey,
        scopeKey: PILOT.scopeKey,
        mechanicKey: PILOT.mechanicKey,
        targetCount: 2,
        status: 'queued',
        provenanceComplete: true,
      });
      expect(page1.nextCursor).toBe(job2.jobId);

      // Page 2 using `cursor` returns the next newest job (`job1`)
      const page2 = (
        await asAdmin(
          api().get(
            `/admin/content-engine/jobs?limit=1&status=queued&cursor=${page1.nextCursor}`,
          ),
        ).expect(200)
      ).body.data;

      expect(page2.items).toHaveLength(1);
      expect(page2.items[0].jobId).toBe(job1.jobId);

      // Invalid cursor or out-of-range limit fails closed with 400
      await asAdmin(
        api().get('/admin/content-engine/jobs?cursor=not-an-object-id'),
      ).expect(400);
      await asAdmin(api().get('/admin/content-engine/jobs?limit=100')).expect(
        400,
      );

      // No database mutations occurred during listing
      const countAfter = await database
        .collection('engine_jobs')
        .countDocuments();
      expect(countAfter).toBe(countBefore);
    });
  });
});
