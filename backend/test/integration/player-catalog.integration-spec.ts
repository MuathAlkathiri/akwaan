import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { loginForToken } from '../helpers/auth-helper';
import { expectSafeResponse } from '../helpers/response-safety';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ContentItemStatus,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../../src/modules/scoring/domain/scoring-rule';

/**
 * The player read surface.
 *
 * The player journey used to call the admin endpoints, so every non-admin
 * session was answered with 403 and the UI rendered that as "nothing is ready".
 * These tests pin the two things that must both hold from now on: a normal
 * player can read active content, and a player still cannot read anything an
 * admin owns — neither a draft nor an authoring field.
 */
describe('player catalog HTTP integration', () => {
  let app: INestApplication;
  let database: Connection;
  let adminToken: string;
  let playerToken: string;
  let activeWorldId: string;
  let draftWorldId: string;
  let activeScopeIds: string[];
  let draftScopeId: string;

  const http = () => request(app.getHttpServer());
  const as = <T extends request.Test>(token: string, value: T): T =>
    value.set('Authorization', `Bearer ${token}`) as T;
  const admin = <T extends request.Test>(value: T): T => as(adminToken, value);
  const player = <T extends request.Test>(value: T): T =>
    as(playerToken, value);

  function unwrap<T>(response: request.Response): T {
    return response.body.data as T;
  }

  const presentation = {
    inputType: 'phone-text',
    timerSeconds: 25,
    soundPack: null,
    revealStyle: null,
  };

  /**
   * One activated World with a full board, three active Scopes and one draft
   * Scope, plus a second World left in draft.
   */
  const seed = async () => {
    const challengeType = async (
      name: string,
      slug: string,
      family: ChallengeFamily,
      answerMode: ChallengeAnswerMode,
      scoringRuleId: string,
    ) =>
      unwrap<{ id: string }>(
        await admin(http().post('/admin/challenge-types'))
          .send({
            name,
            slug,
            family,
            answerMode,
            scoringRuleId,
            defaultPresentation: presentation,
            status: WorldContentStatus.ACTIVE,
          })
          .expect(201),
      );

    const mechanics = [
      await challengeType(
        'أفضل 5',
        'player-top-5',
        ChallengeFamily.SIGNATURE,
        ChallengeAnswerMode.MULTIPLE_CHOICE,
        SCORING_RULE_IDS.SIGNATURE_DECLARED_BY_MECHANIC,
      ),
      await challengeType(
        'اقرأ خصمك',
        'player-ryo',
        ChallengeFamily.RYO,
        ChallengeAnswerMode.RYO,
        SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      ),
      await challengeType(
        'تعاون',
        'player-coop',
        ChallengeFamily.COOP,
        ChallengeAnswerMode.CLOSEST,
        SCORING_RULE_IDS.COOP_ITEM_SUCCESS,
      ),
      await challengeType(
        'علاقات',
        'player-relational',
        ChallengeFamily.RELATIONAL,
        ChallengeAnswerMode.VOTE,
        SCORING_RULE_IDS.RELATIONAL_ITEM_SUCCESS,
      ),
    ];

    const world = unwrap<{ id: string }>(
      await admin(http().post('/admin/worlds'))
        .send({
          name: 'كرة قدم',
          slug: 'player-football',
          description: 'عالم كرة القدم',
          sortOrder: 1,
        })
        .expect(201),
    );
    activeWorldId = world.id;

    const slots = [
      WorldChallengeSlotKey.SLOT_1,
      WorldChallengeSlotKey.SLOT_2,
      WorldChallengeSlotKey.SLOT_3,
      WorldChallengeSlotKey.SLOT_4,
    ];
    for (const [index, slotKey] of slots.entries()) {
      await admin(
        http().post(`/admin/worlds/${activeWorldId}/challenge-configurations`),
      )
        .send({
          challengeTypeId: mechanics[index].id,
          slotKey,
          isEnabled: true,
          sortOrder: index,
        })
        .expect(201);
    }

    const scope = async (name: string, slug: string, status: string) =>
      unwrap<{ id: string }>(
        await admin(http().post(`/admin/worlds/${activeWorldId}/scopes`))
          .send({ name, slug, status, description: `وصف ${name}` })
          .expect(201),
      );
    const first = await scope(
      'الدوري السعودي',
      'player-scope-saudi',
      WorldContentStatus.ACTIVE,
    );
    const second = await scope(
      'كأس العالم',
      'player-scope-world-cup',
      WorldContentStatus.ACTIVE,
    );
    activeScopeIds = [first.id, second.id];
    draftScopeId = (
      await scope(
        'نطاق قيد التحرير',
        'player-scope-draft',
        WorldContentStatus.DRAFT,
      )
    ).id;

    for (const scopeId of [...activeScopeIds, draftScopeId]) {
      await admin(http().post('/admin/content-items'))
        .send({
          scopeId,
          prompt: { ar: 'من هو أفضل لاعب؟' },
          compatibleChallengeTypeIds: [mechanics[0].id],
          answerPayload: {
            mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
            options: [
              { id: 'a', label: { ar: 'الأول' } },
              { id: 'b', label: { ar: 'الثاني' } },
            ],
            correctOptionId: 'a',
          },
          status: ContentItemStatus.READY,
        })
        .expect(201);
    }

    await admin(http().patch(`/admin/worlds/${activeWorldId}`))
      .send({ status: WorldContentStatus.ACTIVE })
      .expect(200);

    draftWorldId = unwrap<{ id: string }>(
      await admin(http().post('/admin/worlds'))
        .send({ name: 'عالم قيد التحرير', slug: 'player-draft-world' })
        .expect(201),
    ).id;
  };

  beforeAll(async () => {
    database = await connectTestDatabase();
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp();
    adminToken = await loginForToken(app, fixtureCredentials.admin);
    playerToken = await loginForToken(app, fixtureCredentials.user);
    await seed();
  });

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  it('still serves the admin surface to an admin only', async () => {
    const worlds = await admin(http().get('/admin/worlds')).expect(200);
    expect(worlds.body.data.map((world: { id: string }) => world.id)).toEqual(
      expect.arrayContaining([activeWorldId, draftWorldId]),
    );
    // The admin projection keeps everything the authoring UI depends on.
    const authored = worlds.body.data.find(
      (world: { id: string }) => world.id === activeWorldId,
    );
    expect(authored.readiness).toBeDefined();
    expect(authored.contentItemCount).toBeGreaterThan(0);

    const scopes = await admin(
      http().get(`/admin/worlds/${activeWorldId}/scopes`),
    ).expect(200);
    expect(scopes.body.data).toHaveLength(3);
    expect(scopes.body.data[0].compatibility).toBeDefined();

    // A player is still refused the admin surface.
    await player(http().get('/admin/worlds')).expect(403);
    await player(http().get(`/admin/worlds/${activeWorldId}/scopes`)).expect(
      403,
    );
  });

  it('serves active Worlds to an anonymous visitor', async () => {
    const response = await http().get('/worlds').expect(200);
    const worlds = response.body.data as Array<Record<string, unknown>>;

    expect(worlds.map((world) => world.id)).toEqual([activeWorldId]);
    expect(worlds[0]).toMatchObject({
      id: activeWorldId,
      name: 'كرة قدم',
      slug: 'player-football',
      description: 'عالم كرة القدم',
      sortOrder: 1,
      scopeCount: 3,
      challengeConfigurationCount: 4,
    });
    expectSafeResponse(response.body);
    expect(response.body).toMatchObject({ statusCode: 200, data: worlds });
  });

  it('serves one active World without authoring fields', async () => {
    const response = await http().get(`/worlds/${activeWorldId}`).expect(200);
    expect(response.body.data).toMatchObject({
      id: activeWorldId,
      name: 'كرة قدم',
      slug: 'player-football',
      scopeCount: 3,
      challengeConfigurationCount: 4,
    });
    expect(response.body.data).not.toHaveProperty('status');
    expect(response.body.data).not.toHaveProperty('readiness');
  });

  it('serves active Scopes of an active World to an anonymous visitor', async () => {
    const response = await http()
      .get(`/worlds/${activeWorldId}/scopes`)
      .expect(200);
    const scopes = response.body.data as Array<Record<string, unknown>>;

    expect(scopes.map((scope) => scope.id).sort()).toEqual(
      [...activeScopeIds].sort(),
    );
    expect(scopes.map((scope) => scope.id)).not.toContain(draftScopeId);
    expect(scopes[0]).toMatchObject({
      worldId: activeWorldId,
      readyContentItemCount: 1,
    });
    // usableSlots is the playability signal the player journey filters on.
    expect((scopes[0].usableSlots as unknown[]).length).toBeGreaterThan(0);
    expectSafeResponse(response.body);
  });

  it('hides authoring internals from the public projections', async () => {
    const worlds = (await http().get('/worlds').expect(200)).body.data as Array<
      Record<string, unknown>
    >;
    for (const field of [
      'readiness',
      'contentItemCount',
      'soundPack',
      'timerProfile',
      'toneProfile',
    ]) {
      expect(worlds[0]).not.toHaveProperty(field);
    }

    const scopes = (
      await http().get(`/worlds/${activeWorldId}/scopes`).expect(200)
    ).body.data as Array<Record<string, unknown>>;
    for (const field of [
      'compatibility',
      'contentItemCount',
      'excludedChallengeTypeIds',
    ]) {
      expect(scopes[0]).not.toHaveProperty(field);
    }
    for (const slot of scopes[0].usableSlots as Array<
      Record<string, unknown>
    >) {
      expect(slot).toMatchObject({
        slotKey: expect.any(String),
        challengeTypeSlug: expect.any(String),
        family: expect.any(String),
        displayName: expect.any(String),
        sortOrder: expect.any(Number),
      });
      for (const field of [
        'configurationId',
        'challengeTypeId',
        'itemStructure',
        'answerMode',
        'scoringRuleId',
        'blockers',
        'warnings',
        'answerPayload',
        'acceptedAnswers',
        'correctOptionId',
      ]) {
        expect(slot).not.toHaveProperty(field);
      }
    }
  });

  it('does not expose a draft World to a player, by list or by id', async () => {
    const worlds = (await http().get('/worlds').expect(200)).body
      .data as Array<{ id: string }>;
    expect(worlds.map((world) => world.id)).not.toContain(draftWorldId);

    // A draft is indistinguishable from a missing World.
    await http().get(`/worlds/${draftWorldId}/scopes`).expect(404);
    await http().get(`/worlds/${draftWorldId}`).expect(404);
    await http().get('/worlds/000000000000000000000000').expect(404);
  });

  it('keeps admin and Match mutations protected for anonymous visitors', async () => {
    await http().get('/admin/worlds').expect(401);
    await http().post('/admin/worlds').send({ name: 'مرفوض' }).expect(401);
    await http().post('/live-game-sessions').send({}).expect(401);
  });
});
