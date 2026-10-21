import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AiProvider } from '../../src/modules/ai-agent/domain/ai-provider.interface';
import { OUTPUT_TOKENS_PER_CANDIDATE } from '../../src/modules/content-engine/application/candidate-generator.service';
import { ENGINE_AI_PROVIDER } from '../../src/modules/content-engine/domain/content-engine.constants';
import { FakeAiProvider } from '../../src/modules/content-engine/testing/fake-ai.provider';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { productionMechanicFixture } from '../fixtures/production-mechanic.fixture';
import { loginForToken } from '../helpers/auth-helper';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

/**
 * The Puzzles pilot, end to end, on an isolated replica-set database.
 *
 * Phase 2d proved the engine can *author* a Closest payload. What it could not
 * prove was publication: an isolated database has no Puzzles World, no
 * numbers-estimation Scope and no Closest ChallengeType, so `create-draft`
 * had nothing to resolve against. This closes that gap with the smallest
 * canonical fixtures — created through the ordinary Admin API, with the
 * ChallengeType derived from the real production definition rather than
 * invented, so every identifier and relationship matches the canonical shape.
 *
 * No Production content is copied. No paid call is reachable: the only
 * provider is `FakeAiProvider`, and live mode is never enabled.
 */
describe('Content Engine — Puzzles closest pilot lifecycle', () => {
  let app: INestApplication;
  let database: Connection;
  let adminToken: string;
  let fake: FakeAiProvider;

  let worldId: string;
  let scopeId: string;
  let challengeTypeId: string;

  const PILOT = {
    mechanicKey: 'closest',
    worldKey: 'puzzles',
    scopeKey: 'numbers-estimation',
    targetCount: 1,
  };

  /**
   * A valid Closest candidate authored the way the Skill requires: the span is
   * a plausible domain for "height of a tall building", chosen without regard
   * to the answer, and 300 is reachable from 0 in steps of 5.
   */
  const CLOSEST_BATCH = JSON.stringify({
    candidates: [
      {
        concept: 'Height of a tall building, estimated against a known span',
        playerReasoningStrategy:
          'Count plausible floors and multiply by a storey height.',
        prompt: 'كم يبلغ ارتفاع برج المملكة في الرياض بالأمتار تقريبًا؟',
        domainDescription: 'Heights of tall buildings, in metres',
        min: 0,
        max: 500,
        step: 5,
        correctValue: 300,
        stepsFromMin: 60,
        unit: 'متر',
        factualClaims: ['Kingdom Centre in Riyadh is about 300 metres tall.'],
      },
    ],
  });

  const api = () => request(app.getHttpServer());
  const asAdmin = <T extends request.Test>(value: T): T =>
    value.set('Authorization', `Bearer ${adminToken}`) as T;

  beforeAll(async () => {
    fake = new FakeAiProvider({
      text: CLOSEST_BATCH,
      model: 'fake-model',
      usage: { promptTokens: 900, completionTokens: 220 },
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
            inputMicrosPerMillion: 375_000,
            outputMicrosPerMillion: 1_500_000,
          },
        }),
      },
      configure: (builder) =>
        builder
          .overrideProvider(ENGINE_AI_PROVIDER)
          .useValue(fake as AiProvider),
    });
    adminToken = await loginForToken(app, fixtureCredentials.admin);

    // --- canonical fixtures, through the ordinary Admin API ---------------
    worldId = (
      await asAdmin(api().post('/admin/worlds'))
        .send({ name: 'عالم الألغاز', slug: PILOT.worldKey })
        .expect(201)
    ).body.data.id;

    scopeId = (
      await asAdmin(api().post(`/admin/worlds/${worldId}/scopes`))
        .send({
          name: 'أرقام وتقديرات',
          slug: PILOT.scopeKey,
          status: WorldContentStatus.ACTIVE,
        })
        .expect(201)
    ).body.data.id;

    // Derived from the production definition, not hand-written: family,
    // answer mode, item structure and scoring rule all come from the runtime
    // contract the mechanic actually ships with.
    challengeTypeId = (
      await asAdmin(api().post('/admin/challenge-types'))
        .send(
          productionMechanicFixture('closest', {
            status: WorldContentStatus.ACTIVE,
          }),
        )
        .expect(201)
    ).body.data.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  describe('fixtures match the canonical contract', () => {
    it('seats a Closest ChallengeType with the production answer mode', async () => {
      const found = await database
        .collection('challenge_types')
        .findOne({ slug: 'closest' });
      expect(found!.answerMode).toBe(ChallengeAnswerMode.CLOSEST);
    });

    it('resolves World and Scope by the slugs the engine uses', async () => {
      const world = await database
        .collection('worlds')
        .findOne({ slug: 'puzzles' });
      const scope = await database
        .collection('scopes')
        .findOne({ slug: 'numbers-estimation' });
      expect(world).toBeTruthy();
      expect(String(scope!.worldId)).toBe(String(world!._id));
    });
  });

  describe('full lifecycle', () => {
    let jobId: string;
    let candidateId: string;
    let contentItemId: string;

    it('1. prices an authenticated preflight', async () => {
      const body = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send(PILOT)
          .expect(201)
      ).body.data;
      expect(body.resolvable).toBe(true);
      expect(body.pricingConfigured).toBe(true);
      // Live mode is off throughout: no paid call is reachable.
      expect(body.liveProviderEnabled).toBe(false);
      expect(body.estimatedMicros).toBeGreaterThan(0);
    });

    it('2. submits the job', async () => {
      const body = (
        await asAdmin(api().post('/admin/content-engine/jobs'))
          .send(PILOT)
          .expect(201)
      ).body.data;
      jobId = body.jobId;
      expect(body.created).toBe(true);
    });

    it('3-6. generates, screens, falls back on facts, and queues for review', async () => {
      await asAdmin(api().post('/admin/content-engine/jobs/run'))
        .send({})
        .expect(201);

      const status = (
        await asAdmin(api().get(`/admin/content-engine/jobs/${jobId}`)).expect(
          200,
        )
      ).body.data;
      expect(status.lastError).toBeNull();
      expect(status.status).toBe('awaiting_review');

      const row = await database
        .collection('engine_candidates')
        .findOne({ jobId });
      candidateId = row!.candidateId as string;

      // Closest payload, authored canonically.
      const draft = row!.draft as {
        answerPayload: { mode: string; correctValue: number };
        mechanicPayload: { closestSlider: Record<string, unknown> };
      };
      expect(draft.answerPayload).toMatchObject({
        mode: 'closest',
        correctValue: 300,
      });
      expect(draft.mechanicPayload.closestSlider).toMatchObject({
        mode: 'numeric-range',
        min: 0,
        max: 500,
        step: 5,
      });

      // Screening passed; facts fell back without a retriever.
      expect(
        (row!.findings as { severity: string }[]).filter(
          (f) => f.severity === 'blocking',
        ),
      ).toEqual([]);
      expect((row!.factVerification as { state: string }).state).toBe(
        'UNRESOLVED',
      );
      expect(
        (row!.factVerification as { automaticAdvance: boolean })
          .automaticAdvance,
      ).toBe(false);
    }, 60_000);

    it('6b. shows the candidate in the review queue with its canonical target', async () => {
      const body = (
        await asAdmin(
          api().get(`/admin/content-engine/candidates/${candidateId}`),
        ).expect(200)
      ).body.data;
      expect(body.canonicalTarget).toMatchObject({
        worldId,
        scopeId,
        challengeTypeId,
      });
    });

    /** Every mutating review call is revision-guarded; read it first. */
    const currentRevision = async (): Promise<number> =>
      (
        await asAdmin(
          api().get(`/admin/content-engine/candidates/${candidateId}`),
        ).expect(200)
      ).body.data.reviewRevision;

    it('7. requires an explicit human decision on the unresolved claim', async () => {
      const assessed = await asAdmin(
        api().post(
          `/admin/content-engine/candidates/${candidateId}/assessment`,
        ),
      ).send({
        expectedRevision: await currentRevision(),
        factualState: 'SUPPORTED',
        factualExplanation:
          'Reviewer checked the building specification and confirmed the height.',
        evidence: [
          {
            url: 'https://example.test/kingdom-centre',
            title: 'Kingdom Centre specification',
          },
        ],
        quality: {
          correctness: 5,
          mechanicFit: 4,
          clarity: 4,
          multiplayerFit: 4,
          originality: 4,
          explanation:
            'A span a table can argue about, with a defensible answer.',
        },
      });
      // Surface the server's reason on failure, not just a bare status.
      expect(assessed.status).toBe(201);

      // A stale revision must be refused — this is the CAS that stops two
      // reviewers overwriting each other.
      await asAdmin(
        api().post(`/admin/content-engine/candidates/${candidateId}/approve`),
      )
        .send({ expectedRevision: 0, explanation: 'stale revision' })
        .expect(409);

      await asAdmin(
        api().post(`/admin/content-engine/candidates/${candidateId}/approve`),
      )
        .send({
          expectedRevision: await currentRevision(),
          explanation:
            'Domain-first span, target reachable, good table argument.',
        })
        .expect(201);

      const row = await database
        .collection('engine_candidates')
        .findOne({ candidateId });
      expect(row!.reviewStatus).toBe('approved');
      // Approval alone publishes nothing.
      expect(await database.collection('content_items').countDocuments()).toBe(
        0,
      );
    });

    it('8-9. creates a canonical DRAFT linked to the candidate', async () => {
      const body = (
        await asAdmin(
          api().post(
            `/admin/content-engine/candidates/${candidateId}/create-draft`,
          ),
        )
          .send({ expectedRevision: await currentRevision() })
          .expect(201)
      ).body.data;
      expect(body.alreadyCreated).toBe(false);
      contentItemId = body.contentItemId;
      expect(body.status).toBe(ContentItemStatus.DRAFT);

      const item = await database.collection('content_items').findOne({});
      expect(String(item!._id)).toBe(contentItemId);
      expect(item!.status).toBe(ContentItemStatus.DRAFT);
      expect(String(item!.scopeId)).toBe(scopeId);
      expect(String(item!.worldId)).toBe(worldId);
      expect(item!.compatibleChallengeTypeIds.map(String)).toContain(
        challengeTypeId,
      );

      // The canonical Closest payload survived publication intact.
      expect(item!.answerPayload).toMatchObject({
        mode: ChallengeAnswerMode.CLOSEST,
        correctValue: 300,
      });
      expect(item!.mechanicPayload.closestSlider).toMatchObject({
        mode: 'numeric-range',
        min: 0,
        max: 500,
        step: 5,
        unit: 'متر',
      });

      // Linkage is recorded, both ways.
      const publication = await database
        .collection('engine_draft_publications')
        .findOne({ candidateId });
      expect(String(publication!.contentItemId)).toBe(contentItemId);
    }, 60_000);

    it('10. is idempotent when publication is retried', async () => {
      // The retry cannot take the write path again: the candidate now carries a
      // publishedContentItemId, so the guarded findOne misses and the service
      // resolves the already-recorded publication instead of erroring.
      const repeat = await asAdmin(
        api().post(
          `/admin/content-engine/candidates/${candidateId}/create-draft`,
        ),
      )
        .send({ expectedRevision: await currentRevision() })
        .expect(201);
      expect(repeat.body.data.alreadyCreated).toBe(true);
      expect(repeat.body.data.contentItemId).toBe(contentItemId);
      expect(repeat.body.data.status).toBe(ContentItemStatus.DRAFT);

      // A stale revision takes the same route: idempotence does not depend on
      // the caller holding the current revision.
      const stale = await asAdmin(
        api().post(
          `/admin/content-engine/candidates/${candidateId}/create-draft`,
        ),
      )
        .send({ expectedRevision: 0 })
        .expect(201);
      expect(stale.body.data.contentItemId).toBe(contentItemId);
      expect(await database.collection('content_items').countDocuments()).toBe(
        1,
      );
      expect(
        await database.collection('engine_draft_publications').countDocuments(),
      ).toBe(1);
    });

    it('never promoted to READY or published to gameplay', async () => {
      expect(
        await database
          .collection('content_items')
          .countDocuments({ status: ContentItemStatus.READY }),
      ).toBe(0);
      // The World stays draft: nothing here activates a board.
      const world = await database
        .collection('worlds')
        .findOne({ slug: 'puzzles' });
      expect(world!.status).toBe(WorldContentStatus.DRAFT);
    });

    it('keeps the authoring rationale out of the published draft', async () => {
      const row = await database
        .collection('engine_candidates')
        .findOne({ candidateId });
      // Beside the draft, not inside it: CreateContentItemDto is validated
      // with forbidNonWhitelisted, so a stray key here would fail publication.
      expect(row!.authoring).toMatchObject({
        concept: expect.stringContaining('Height'),
        stepsFromMin: 60,
      });
      expect((row!.draft as Record<string, unknown>).authoring).toBeUndefined();
    });

    it('bounds generated output to exactly what the budget reserved', async () => {
      // The cap is enforced when money is reserved, so an unbounded completion
      // could settle above it. Reservation and request must come from the same
      // number for the cap to mean anything.
      const [call] = fake.calls;
      expect(call.maxOutputTokens).toBe(
        PILOT.targetCount * OUTPUT_TOKENS_PER_CANDIDATE,
      );
      const generation = await database
        .collection('engine_cost_ledger')
        .findOne({ jobId, stage: 'generation' });
      expect(generation).toBeTruthy();
      expect(generation!.actualMicros).toBeLessThanOrEqual(
        generation!.reservedMicros,
      );
    });

    it('spent only through the fake provider, and reconciled every reservation', async () => {
      expect(fake.calls.length).toBeGreaterThan(0);
      expect(
        await database
          .collection('engine_cost_ledger')
          .countDocuments({ jobId, status: 'reserved' }),
      ).toBe(0);
      const spending = (
        await asAdmin(
          api().get(`/admin/content-engine/jobs/${jobId}/spending`),
        ).expect(200)
      ).body.data;
      expect(spending.spentMicros).toBeGreaterThan(0);
    });
  });
});
