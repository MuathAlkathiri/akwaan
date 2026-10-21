import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
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

  describe('preflight', () => {
    it('prices a resolvable combination and reports the budget', async () => {
      const body = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send(PILOT)
          .expect(201)
      ).body.data;

      expect(body.resolvable).toBe(true);
      expect(body.pricingConfigured).toBe(true);
      expect(body.engineEnabled).toBe(true);
      // Live mode is off, so no paid call is possible even now.
      expect(body.liveProviderEnabled).toBe(false);
      expect(body.estimatedMicros).toBeGreaterThan(0);
      expect(body.budget.capMicros).toBe(100_000_000);
      expect(body.contextHash).toHaveLength(64);
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

    it('rejects a batch size outside the allowed range', async () => {
      await asAdmin(api().post('/admin/content-engine/jobs'))
        .send({ ...PILOT, targetCount: 500 })
        .expect(400);
    });
  });

  describe('submission and execution', () => {
    let jobId: string;

    it('submits idempotently — a double click is one job', async () => {
      const [first, second] = await Promise.all([
        asAdmin(api().post('/admin/content-engine/jobs')).send(PILOT),
        asAdmin(api().post('/admin/content-engine/jobs')).send(PILOT),
      ]);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.body.data.jobId).toBe(second.body.data.jobId);
      expect(
        [first.body.data.created, second.body.data.created].filter(Boolean),
      ).toHaveLength(1);
      jobId = first.body.data.jobId;

      expect(await database.collection('engine_jobs').countDocuments()).toBe(1);
    });

    it('runs the job to the human-review queue', async () => {
      const run = (
        await asAdmin(api().post('/admin/content-engine/jobs/run'))
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

    it('is a no-op when there is nothing left to run', async () => {
      const run = (
        await asAdmin(api().post('/admin/content-engine/jobs/run'))
          .send({})
          .expect(201)
      ).body.data;
      expect(run.jobId).toBeNull();
    });

    it('404s for an unknown job', async () => {
      await asAdmin(
        api().get('/admin/content-engine/jobs/ffffffffffffffffffffffff'),
      ).expect(404);
    });
  });

  describe('cancellation', () => {
    it('stops a submitted job before it runs', async () => {
      const submitted = (
        await asAdmin(api().post('/admin/content-engine/jobs'))
          .send({ ...PILOT, targetCount: 2 })
          .expect(201)
      ).body.data;

      await asAdmin(
        api().post(`/admin/content-engine/jobs/${submitted.jobId}/cancel`),
      ).expect(201);

      const status = (
        await asAdmin(
          api().get(`/admin/content-engine/jobs/${submitted.jobId}`),
        ).expect(200)
      ).body.data;
      expect(status.status).toBe('cancelled');

      // And it is not picked up afterwards.
      const run = (
        await asAdmin(api().post('/admin/content-engine/jobs/run'))
          .send({})
          .expect(201)
      ).body.data;
      expect(run.jobId).toBeNull();
    });
  });
});
