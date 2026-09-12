import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  isolatedTestDatabaseUri,
  resetTestDatabase,
} from '../helpers/test-database';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { productionMechanicFixture } from '../fixtures/production-mechanic.fixture';
import { loginForToken } from '../helpers/auth-helper';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  ContentMediaType,
  EKSHIFNI_REGION_ROLES,
  EKSHIFNI_SLUG,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';

/**
 * A World may only be switched on if its board can actually deal a challenge.
 *
 * The state this exists for is a real one: عالم المشاهير reached Production
 * active, with a complete four-slot board, five Scopes and **zero** content
 * items. Match selection accepted it on structure alone, and every challenge
 * would then have failed at launch. The gate belongs at the write boundary —
 * activation — rather than in every public catalogue read.
 */

const SLOTS = [
  WorldChallengeSlotKey.SLOT_1,
  WorldChallengeSlotKey.SLOT_2,
  WorldChallengeSlotKey.SLOT_3,
  WorldChallengeSlotKey.SLOT_4,
];
/** The Celebrities board exactly: Signature + RYO + Closest + Bomb. */
const BOARD = [EKSHIFNI_SLUG, 'read-your-opponent', 'closest', 'bomb'];

describe('World activation requires playable board content', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let mechanicIds: string[];

  const http = () => request(app.getHttpServer());
  const admin = <T extends request.Test>(value: T): T =>
    value.set('Authorization', `Bearer ${token}`) as T;
  const unwrap = <T>(response: request.Response): T =>
    (response.body?.data ?? response.body) as T;

  beforeAll(async () => {
    database = await connectTestDatabase('world-activation-content');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('world-activation-content') },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    mechanicIds = [];
    for (const slug of BOARD) {
      mechanicIds.push(
        unwrap<{ id: string }>(
          await admin(http().post('/admin/challenge-types'))
            .send(
              productionMechanicFixture(slug, {
                status: WorldContentStatus.ACTIVE,
              }),
            )
            .expect(201),
        ).id,
      );
    }
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    if (database) await resetTestDatabase(database);
    await database?.close();
  });

  /** A draft World with the canonical four-slot board and one active Scope. */
  const seedWorld = async (slug: string) => {
    const world = unwrap<{ id: string }>(
      await admin(http().post('/admin/worlds'))
        .send({ name: `عالم ${slug}`, slug })
        .expect(201),
    );
    for (const [index, slotKey] of SLOTS.entries()) {
      await admin(
        http().post(`/admin/worlds/${world.id}/challenge-configurations`),
      )
        .send({
          challengeTypeId: mechanicIds[index],
          slotKey,
          isEnabled: true,
          sortOrder: index,
        })
        .expect(201);
    }
    const scope = unwrap<{ id: string }>(
      await admin(http().post(`/admin/worlds/${world.id}/scopes`))
        .send({
          name: 'نطاق',
          slug: `${slug}-scope`,
          status: WorldContentStatus.ACTIVE,
        })
        .expect(201),
    );
    return { worldId: world.id, scopeId: scope.id };
  };

  /** اكشفني authors six masks over one image; the gate must count real items. */
  const ekshifniExtras = (index: number) => ({
    media: {
      type: ContentMediaType.IMAGE,
      assets: [{ url: `https://cdn.test/celebrity-${index}.webp` }],
    },
    mechanicPayload: {
      variant: 'ekshifni',
      regions: EKSHIFNI_REGION_ROLES.map((role, position) => ({
        localId: `region-${position + 1}`,
        role,
        shape: {
          x: (position % 3) * 0.32 + 0.02,
          y: position < 3 ? 0.05 : 0.5,
          width: 0.28,
          height: 0.4,
        },
      })),
    },
  });

  const addItems = async (
    scopeId: string,
    challengeTypeId: string,
    mode: ChallengeAnswerMode,
    count: number,
    extras:
      ((index: number) => Record<string, unknown>) | undefined = undefined,
  ) => {
    for (let index = 0; index < count; index += 1) {
      await admin(http().post('/admin/content-items'))
        .send({
          scopeId,
          prompt: { ar: `سؤال ${index}` },
          compatibleChallengeTypeIds: [challengeTypeId],
          ...(extras ? extras(index) : {}),
          answerPayload:
            mode === ChallengeAnswerMode.MULTIPLE_CHOICE
              ? {
                  mode,
                  options: [
                    { id: 'a', label: { ar: 'أ' } },
                    { id: 'b', label: { ar: 'ب' } },
                  ],
                  correctOptionId: 'a',
                }
              : mode === ChallengeAnswerMode.CLOSEST
                ? { mode, correctValue: 42 }
                : { mode, acceptedAnswers: [`إجابة ${index}`] },
          status: ContentItemStatus.READY,
        })
        .expect(201);
    }
  };

  /** Everything the four canonical launchers ask for: 3 / 3 / 3 / 10. */
  const fillBoard = async (scopeId: string, skip?: number) => {
    const plan: Array<[ChallengeAnswerMode, number]> = [
      [ChallengeAnswerMode.MATCH, 3],
      [ChallengeAnswerMode.MULTIPLE_CHOICE, 3],
      [ChallengeAnswerMode.CLOSEST, 3],
      [ChallengeAnswerMode.MATCH, 10],
    ];
    for (const [index, [mode, count]] of plan.entries()) {
      if (index === skip) continue;
      await addItems(
        scopeId,
        mechanicIds[index],
        mode,
        count,
        index === 0 ? ekshifniExtras : undefined,
      );
    }
  };

  const activate = (worldId: string) =>
    admin(http().patch(`/admin/worlds/${worldId}`)).send({
      status: WorldContentStatus.ACTIVE,
    });

  it('refuses a valid four-slot board with no content at all', async () => {
    // The عالم المشاهير state, reproduced.
    const { worldId } = await seedWorld('zero-content');
    const response = await activate(worldId).expect(400);
    const codes = (response.body.issues ?? response.body.details ?? []).map(
      (problem: { code: string }) => problem.code,
    );
    expect(codes).toContain('WORLD_BOARD_HAS_NO_PLAYABLE_CONTENT');
    // It stays a draft, and stays out of the selectable catalogue.
    const world = unwrap<{ status: string }>(
      await admin(http().get(`/admin/worlds/${worldId}`)).expect(200),
    );
    expect(world.status).toBe(WorldContentStatus.DRAFT);
    const listed = (await http().get('/worlds').expect(200)).body
      .data as Array<{ id: string; availability: string }>;
    expect(listed.find((entry) => entry.id === worldId)?.availability).toBe(
      'upcoming',
    );
  }, 120_000);

  it('allows activation while one position is still being authored', async () => {
    // Deliberate, and the boundary of this gate. A World with one thin slot is
    // a normal shipped state — عالم كرة القدم runs that way today — and the
    // runtime already answers it at launch with
    // `MATCH_INSUFFICIENT_PLAYABLE_CONTENT`. Refusing here would make that
    // designed error unreachable and would forbid switching a World on and then
    // authoring into it.
    const { worldId, scopeId } = await seedWorld('one-slot-short');
    // Everything except القنبلة, which needs ten.
    await fillBoard(scopeId, 3);
    await activate(worldId).expect(200);
  }, 120_000);

  it('refuses while every position that needs content is short', async () => {
    const { worldId, scopeId } = await seedWorld('all-slots-short');
    // One item against اكشفني's three: present, but not enough to deal.
    await addItems(
      scopeId,
      mechanicIds[0],
      ChallengeAnswerMode.MATCH,
      1,
      ekshifniExtras,
    );
    const response = await activate(worldId).expect(400);
    const codes = (response.body.issues ?? response.body.details ?? []).map(
      (problem: { code: string }) => problem.code,
    );
    expect(codes).toContain('WORLD_BOARD_HAS_NO_PLAYABLE_CONTENT');
  }, 120_000);

  it('allows activation once every slot can deal its first challenge', async () => {
    const { worldId, scopeId } = await seedWorld('fully-stocked');
    await fillBoard(scopeId);
    await activate(worldId).expect(200);

    // And the catalogue promotes it with no client change.
    const listed = (await http().get('/worlds').expect(200)).body
      .data as Array<{ id: string; availability: string }>;
    expect(listed.find((entry) => entry.id === worldId)?.availability).toBe(
      'available',
    );
  }, 120_000);

  it('still lets an already-active World be edited when a slot runs thin', async () => {
    // A live World must stay repairable: the gate guards the transition, not
    // every write to something already switched on.
    const { worldId, scopeId } = await seedWorld('goes-thin');
    await fillBoard(scopeId);
    await activate(worldId).expect(200);
    await admin(http().patch(`/admin/worlds/${worldId}`))
      .send({ description: 'وصف محدّث بعد التفعيل' })
      .expect(200);
  }, 120_000);
});
