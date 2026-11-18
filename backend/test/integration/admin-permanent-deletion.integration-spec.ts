import { randomUUID } from 'crypto';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
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
import { loginForToken } from '../helpers/auth-helper';
import { productionMechanicFixture } from '../fixtures/production-mechanic.fixture';
import { RYO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/ryo-gameplay.plugin';
import { CLOSEST_MODE_KEY } from '../../src/modules/live-game-sessions/domain/closest-gameplay.plugin';
import { ONE_CLUE_MODE_KEY } from '../../src/modules/live-game-sessions/domain/one-clue-gameplay.plugin';
import { LAQATHA_MODE_KEY } from '../../src/modules/live-game-sessions/domain/laqatha-gameplay.plugin';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  ONE_CLUE_VALUES,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { WorldContentReferenceRegistry } from '../../src/modules/world-content/application/world-content-reference.registry';
import { MatchCreationFence } from '../../src/modules/match/application/match-creation.fence';
import { MOVING_XO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/moving-xo-board';

/**
 * Admin permanent deletion and World detach (roadmap §19.1), against real Mongo.
 *
 * Every rule here is a query or a transaction, so none of it can be proved with
 * mocks: the blast radius of each operation, shared content surviving a
 * mechanic's deletion, the Match rules, the stale-preview and idempotency
 * guards, atomic rollback, and the fence that serialises Match creation against
 * deletion.
 */
describe('admin permanent deletion', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let userToken: string;

  const KEY = 'admin-permanent-deletion';
  const FIXTURE_ADMIN_ID = '700000000000000000000002';

  beforeAll(async () => {
    database = await connectTestDatabase(KEY);
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: {
        MONGODB_URI: isolatedTestDatabaseUri(KEY),
        // The fixture admin (integration.fixture.ts) is the one operator
        // authorised to execute permanent deletion in this suite.
        PERMANENT_DELETION_ADMIN_IDS: FIXTURE_ADMIN_ID,
      },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    userToken = await loginForToken(app, fixtureCredentials.user);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  const http = () => request(app.getHttpServer());
  const bearer = <T extends request.Test>(value: T, as = token): T =>
    value.set('Authorization', `Bearer ${as}`) as T;
  const unwrap = <T>(response: request.Response): T =>
    (response.body?.data ?? response.body) as T;
  const oid = (id: string) => new Types.ObjectId(id);

  const SLOTS = [
    WorldChallengeSlotKey.SLOT_1,
    WorldChallengeSlotKey.SLOT_2,
    WorldChallengeSlotKey.SLOT_3,
    WorldChallengeSlotKey.SLOT_4,
  ];
  /** Canonical mechanics needing no extra content structure (see world-slot suites). */
  const BOARD_MECHANICS = [
    RYO_MODE_KEY,
    CLOSEST_MODE_KEY,
    ONE_CLUE_MODE_KEY,
    LAQATHA_MODE_KEY,
  ] as const;

  const itemFor = (slug: string, answer: string) =>
    slug === ONE_CLUE_MODE_KEY || slug === LAQATHA_MODE_KEY
      ? {
          answerPayload: {
            mode: ChallengeAnswerMode.MATCH,
            acceptedAnswers: [answer],
          },
          mechanicPayload: {
            clues: ONE_CLUE_VALUES.map((value, index) => ({
              order: index + 1,
              value,
              text: { ar: `دليل ${index + 1}` },
            })),
          },
        }
      : {
          answerPayload: {
            mode: ChallengeAnswerMode.CLOSEST,
            correctValue: 42,
          },
          mechanicPayload: {
            closestSlider: { mode: 'numeric-range', min: 0, max: 100, step: 1 },
          },
        };

  let mechanics: Array<{ id: string; slug: string }>;
  const mechanic = (slug: string) =>
    mechanics.find((entry) => entry.slug === slug)!;

  type SeededWorld = {
    worldId: string;
    scopeIds: string[];
    configurations: Record<string, string>;
  };

  /**
   * A World with all four slots bound, two Scopes, and `perMechanic` READY items
   * per mechanic in the first Scope. Two Worlds are always seeded per scenario so
   * a leak across Worlds shows up as a wrong count.
   */
  const seedWorld = async (
    slug: string,
    perMechanic: number,
  ): Promise<SeededWorld> => {
    const world = unwrap<{ id: string }>(
      await bearer(http().post('/admin/worlds'))
        .send({ name: `عالم ${slug}`, slug })
        .expect(201),
    );
    const worldId = String(world.id);
    const scopeIds: string[] = [];
    for (const suffix of ['a', 'b']) {
      const scope = unwrap<{ id: string }>(
        await bearer(http().post(`/admin/worlds/${worldId}/scopes`))
          .send({ name: `نطاق ${slug} ${suffix}`, slug: `${slug}-${suffix}` })
          .expect(201),
      );
      scopeIds.push(String(scope.id));
    }
    const configurations: Record<string, string> = {};
    for (const [index, slotKey] of SLOTS.entries()) {
      const configuration = unwrap<{ id: string }>(
        await bearer(
          http().post(`/admin/worlds/${worldId}/challenge-configurations`),
        )
          .send({
            challengeTypeId: mechanics[index].id,
            slotKey,
            isEnabled: true,
            sortOrder: index,
          })
          .expect(201),
      );
      configurations[slotKey] = String(configuration.id);
    }
    for (const entry of mechanics) {
      for (let copy = 0; copy < perMechanic; copy += 1) {
        await createItem(
          scopeIds[0],
          [entry.slug],
          `${slug}-${entry.slug}-${copy}`,
        );
      }
    }
    return { worldId, scopeIds, configurations };
  };

  const createItem = async (
    scopeId: string,
    slugs: string[],
    label: string,
  ): Promise<string> => {
    const item = unwrap<{ id: string }>(
      await bearer(http().post('/admin/content-items'))
        .send({
          scopeId,
          prompt: { ar: label },
          compatibleChallengeTypeIds: slugs.map((slug) => mechanic(slug).id),
          ...itemFor(slugs[0], label),
          status: ContentItemStatus.READY,
        })
        .expect(201),
    );
    return String(item.id);
  };

  const count = (collection: string, filter: Record<string, unknown> = {}) =>
    database.collection(collection).countDocuments(filter);

  type Preview = {
    safe: boolean;
    safeWithHistoryPurge: boolean;
    requiresHistoryPurge: boolean;
    reversible: boolean;
    fingerprint: string;
    blockers: Array<{ code: string; clearedByHistoryPurge?: boolean }>;
    impact: {
      worlds: number;
      scopes: number;
      configurations: number;
      content: { toDelete: number; sharedPreserved: number };
      external: Record<string, Record<string, number>>;
    };
  };

  const preview = async (path: string): Promise<Preview> =>
    unwrap<Preview>(await bearer(http().get(path)).expect(200));

  const execute = (
    path: string,
    body: {
      previewFingerprint: string;
      requestId?: string;
      purgeDisposableHistory?: boolean;
    },
    as = token,
  ) =>
    bearer(http().post(path), as).send({
      requestId: body.requestId ?? randomUUID(),
      ...body,
    });

  beforeAll(async () => {
    const created: Array<{ id: string; slug: string }> = [];
    for (const slug of BOARD_MECHANICS) {
      const type = unwrap<{ id: string }>(
        await bearer(http().post('/admin/challenge-types'))
          .send({
            ...productionMechanicFixture(slug),
            status: WorldContentStatus.ACTIVE,
          })
          .expect(201),
      );
      created.push({ id: String(type.id), slug });
    }
    mechanics = created;
  }, 120_000);

  describe('authorization', () => {
    let subject: SeededWorld;
    beforeAll(async () => {
      subject = await seedWorld('pd-auth', 1);
    }, 120_000);

    it('refuses preview and execute to a non-admin', async () => {
      await bearer(
        http().get(`/admin/worlds/${subject.worldId}/deletion-preview`),
        userToken,
      ).expect(403);
      await execute(
        `/admin/worlds/${subject.worldId}/permanent-delete`,
        { previewFingerprint: 'a'.repeat(64) },
        userToken,
      ).expect(403);
      await http()
        .post(`/admin/worlds/${subject.worldId}/permanent-delete`)
        .send({ previewFingerprint: 'a'.repeat(64), requestId: randomUUID() })
        .expect(401);
      await expect(
        count('worlds', { _id: oid(subject.worldId) }),
      ).resolves.toBe(1);
    });
  });

  describe('detach from World', () => {
    let subject: SeededWorld;
    let bystander: SeededWorld;
    beforeAll(async () => {
      subject = await seedWorld('pd-detach', 3);
      bystander = await seedWorld('pd-detach-keep', 3);
    }, 120_000);

    it('removes only the binding: content, mechanic and other Worlds are untouched', async () => {
      const configurationId =
        subject.configurations[WorldChallengeSlotKey.SLOT_2];
      const closest = mechanic(CLOSEST_MODE_KEY);
      const itemsBefore = await count('content_items', {
        worldId: oid(subject.worldId),
      });
      const planned = await preview(
        `/admin/challenge-configurations/${configurationId}/detach-preview`,
      );
      expect(planned.safe).toBe(true);
      expect(planned.impact.configurations).toBe(1);
      expect(planned.impact.content.toDelete).toBe(0);

      await execute(
        `/admin/challenge-configurations/${configurationId}/detach`,
        {
          previewFingerprint: planned.fingerprint,
        },
      ).expect(201);

      await expect(
        count('world_challenge_configurations', { _id: oid(configurationId) }),
      ).resolves.toBe(0);
      await expect(
        count('content_items', { worldId: oid(subject.worldId) }),
      ).resolves.toBe(itemsBefore);
      await expect(
        count('content_items', {
          worldId: oid(subject.worldId),
          compatibleChallengeTypeIds: oid(closest.id),
        }),
      ).resolves.toBe(3);
      await expect(
        count('challenge_types', { _id: oid(closest.id) }),
      ).resolves.toBe(1);
      await expect(
        count('world_challenge_configurations', {
          worldId: oid(bystander.worldId),
        }),
      ).resolves.toBe(4);
    });

    it('refuses a confirmation made for a slot that was rebound since', async () => {
      const configurationId =
        subject.configurations[WorldChallengeSlotKey.SLOT_3];
      const planned = await preview(
        `/admin/challenge-configurations/${configurationId}/detach-preview`,
      );
      // Rebind the slot to another mechanic between preview and confirm.
      await database
        .collection('world_challenge_configurations')
        .updateOne(
          { _id: oid(configurationId) },
          { $set: { challengeTypeId: oid(mechanic(CLOSEST_MODE_KEY).id) } },
        );
      const response = await execute(
        `/admin/challenge-configurations/${configurationId}/detach`,
        { previewFingerprint: planned.fingerprint },
      ).expect(409);
      expect(response.body.code).toBe('DELETION_PREVIEW_STALE');
      await expect(
        count('world_challenge_configurations', { _id: oid(configurationId) }),
      ).resolves.toBe(1);
    });
  });

  describe('Scope and ContentItem', () => {
    let subject: SeededWorld;
    beforeAll(async () => {
      subject = await seedWorld('pd-scope', 2);
    }, 120_000);

    it('deletes a Scope and only its content', async () => {
      const [withContent, other] = subject.scopeIds;
      const otherItem = await createItem(
        other,
        [RYO_MODE_KEY],
        'pd-scope-other',
      );
      const planned = await preview(
        `/admin/scopes/${withContent}/deletion-preview`,
      );
      expect(planned.impact.content.toDelete).toBe(8);
      await execute(`/admin/scopes/${withContent}/permanent-delete`, {
        previewFingerprint: planned.fingerprint,
      }).expect(201);
      await expect(count('scopes', { _id: oid(withContent) })).resolves.toBe(0);
      await expect(
        count('content_items', { scopeId: oid(withContent) }),
      ).resolves.toBe(0);
      await expect(
        count('content_items', { _id: oid(otherItem) }),
      ).resolves.toBe(1);
      await expect(
        count('worlds', { _id: oid(subject.worldId) }),
      ).resolves.toBe(1);
    });

    it('deletes one ContentItem and its exposure-ledger rows', async () => {
      const itemId = await createItem(
        subject.scopeIds[1],
        [RYO_MODE_KEY],
        'pd-item',
      );
      await database.collection('content_exposures').insertOne({
        ownerAccountId: 'owner-1',
        challengeTypeKey: RYO_MODE_KEY,
        contentItemId: itemId,
        state: 'exposed',
        matchId: 'match-exposure',
        exposedAt: new Date(),
      });
      const planned = await preview(
        `/admin/content-items/${itemId}/deletion-preview`,
      );
      expect(planned.impact.external.matches.exposuresRemoved).toBe(1);
      await execute(`/admin/content-items/${itemId}/permanent-delete`, {
        previewFingerprint: planned.fingerprint,
      }).expect(201);
      await expect(count('content_items', { _id: oid(itemId) })).resolves.toBe(
        0,
      );
      await expect(
        count('content_exposures', { contentItemId: itemId }),
      ).resolves.toBe(0);
    });

    it('refuses a stale preview and changes nothing', async () => {
      const scopeId = subject.scopeIds[1];
      const planned = await preview(
        `/admin/scopes/${scopeId}/deletion-preview`,
      );
      const added = await createItem(scopeId, [RYO_MODE_KEY], 'pd-stale');
      const response = await execute(
        `/admin/scopes/${scopeId}/permanent-delete`,
        {
          previewFingerprint: planned.fingerprint,
        },
      ).expect(409);
      expect(response.body.code).toBe('DELETION_PREVIEW_STALE');
      await expect(count('scopes', { _id: oid(scopeId) })).resolves.toBe(1);
      await expect(count('content_items', { _id: oid(added) })).resolves.toBe(
        1,
      );
    });

    it('returns the stored result for a repeated request id, and deletes once', async () => {
      const itemId = await createItem(
        subject.scopeIds[1],
        [RYO_MODE_KEY],
        'pd-idem',
      );
      const planned = await preview(
        `/admin/content-items/${itemId}/deletion-preview`,
      );
      const requestId = randomUUID();
      const first = unwrap<{ auditId: string; replayed: boolean }>(
        await execute(`/admin/content-items/${itemId}/permanent-delete`, {
          previewFingerprint: planned.fingerprint,
          requestId,
        }).expect(201),
      );
      const second = unwrap<{ auditId: string; replayed: boolean }>(
        await execute(`/admin/content-items/${itemId}/permanent-delete`, {
          previewFingerprint: planned.fingerprint,
          requestId,
        }).expect(201),
      );
      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.auditId).toBe(first.auditId);
      await expect(count('admin_deletion_log', { requestId })).resolves.toBe(1);
    });

    it('reports media still used elsewhere as in use, and never deletes it', async () => {
      const url = '/uploads/world-content/content-items/shared-test.png';
      const [first, second] = [
        await createItem(subject.scopeIds[1], [RYO_MODE_KEY], 'pd-media-1'),
        await createItem(subject.scopeIds[1], [RYO_MODE_KEY], 'pd-media-2'),
      ];
      await database
        .collection('content_items')
        .updateMany(
          { _id: { $in: [oid(first), oid(second)] } },
          { $set: { media: { type: 'image', assets: [{ url }] } } },
        );
      const deleteOne = async (id: string) => {
        const planned = await preview(
          `/admin/content-items/${id}/deletion-preview`,
        );
        return unwrap<{ unreferencedMediaCandidates: string[] }>(
          await execute(`/admin/content-items/${id}/permanent-delete`, {
            previewFingerprint: planned.fingerprint,
          }).expect(201),
        );
      };
      expect((await deleteOne(first)).unreferencedMediaCandidates).toEqual([]);
      expect((await deleteOne(second)).unreferencedMediaCandidates).toEqual([
        url,
      ]);
    });
  });

  describe('World', () => {
    let subject: SeededWorld;
    let bystander: SeededWorld;
    beforeAll(async () => {
      subject = await seedWorld('pd-world', 2);
      bystander = await seedWorld('pd-world-keep', 2);
    }, 120_000);

    it('cascades its Scopes, content and bindings, and touches nothing else', async () => {
      const typesBefore = await count('challenge_types');
      const planned = await preview(
        `/admin/worlds/${subject.worldId}/deletion-preview`,
      );
      expect(planned.impact).toMatchObject({
        worlds: 1,
        scopes: 2,
        configurations: 4,
        content: { toDelete: 8, sharedPreserved: 0 },
      });
      await execute(`/admin/worlds/${subject.worldId}/permanent-delete`, {
        previewFingerprint: planned.fingerprint,
      }).expect(201);
      await expect(
        count('worlds', { _id: oid(subject.worldId) }),
      ).resolves.toBe(0);
      await expect(
        count('scopes', { worldId: oid(subject.worldId) }),
      ).resolves.toBe(0);
      await expect(
        count('content_items', { worldId: oid(subject.worldId) }),
      ).resolves.toBe(0);
      await expect(
        count('world_challenge_configurations', {
          worldId: oid(subject.worldId),
        }),
      ).resolves.toBe(0);
      await expect(count('challenge_types')).resolves.toBe(typesBefore);
      await expect(
        count('content_items', { worldId: oid(bystander.worldId) }),
      ).resolves.toBe(8);
      const log = await database
        .collection('admin_deletion_log')
        .findOne({ 'entity.kind': 'world', 'entity.id': subject.worldId });
      expect(log?.counts).toMatchObject({ worldsDeleted: 1, scopesDeleted: 2 });
    });
  });

  describe('Matches', () => {
    let subject: SeededWorld;
    const sessionId = `pd-session-${randomUUID()}`;
    const matchId = `pd-match-${randomUUID()}`;
    const runtimeId = `pd-runtime-${randomUUID()}`;

    beforeAll(async () => {
      subject = await seedWorld('pd-match', 1);
      await database.collection('live_game_sessions').insertOne({
        sessionId,
        status: 'active',
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      await database.collection('gameplay_runtimes').insertOne({
        runtimeId,
        sessionId,
        modeKey: RYO_MODE_KEY,
        status: 'completed',
      });
      await database.collection('matches').insertOne({
        matchId,
        liveSessionId: sessionId,
        status: 'active',
        occurrences: [
          {
            worldId: subject.worldId,
            selectedScopeIds: subject.scopeIds,
            slots: { [WorldChallengeSlotKey.SLOT_1]: { runtimeId } },
          },
        ],
        configuredBoardPositions: [],
        challengeResults: [],
      });
    }, 120_000);

    const path = () => `/admin/worlds/${subject.worldId}`;

    it('never deletes under a live Match, even with history purge', async () => {
      const planned = await preview(`${path()}/deletion-preview`);
      expect(planned.safe).toBe(false);
      expect(planned.safeWithHistoryPurge).toBe(false);
      expect(planned.blockers.map((blocker) => blocker.code)).toContain(
        'LIVE_MATCH_IN_PROGRESS',
      );
      const response = await execute(`${path()}/permanent-delete`, {
        previewFingerprint: planned.fingerprint,
        purgeDisposableHistory: true,
      }).expect(409);
      expect(response.body.code).toBe('DELETION_BLOCKED');
      await expect(
        count('worlds', { _id: oid(subject.worldId) }),
      ).resolves.toBe(1);
    });

    it('treats an abandoned Match as disposable history, removed only on request', async () => {
      await database
        .collection('live_game_sessions')
        .updateOne({ sessionId }, { $set: { status: 'finished' } });
      const planned = await preview(`${path()}/deletion-preview`);
      expect(planned.requiresHistoryPurge).toBe(true);
      const refused = await execute(`${path()}/permanent-delete`, {
        previewFingerprint: planned.fingerprint,
      }).expect(409);
      expect(refused.body.code).toBe('DELETION_REQUIRES_HISTORY_PURGE');

      await execute(`${path()}/permanent-delete`, {
        previewFingerprint: planned.fingerprint,
        purgeDisposableHistory: true,
      }).expect(201);
      await expect(count('matches', { matchId })).resolves.toBe(0);
      await expect(count('gameplay_runtimes', { runtimeId })).resolves.toBe(0);
      await expect(
        count('worlds', { _id: oid(subject.worldId) }),
      ).resolves.toBe(0);
      // Sessions carry no World reference and are left to the session cleanup.
      await expect(count('live_game_sessions', { sessionId })).resolves.toBe(1);
    });
  });

  describe('safety review additions', () => {
    let subject: SeededWorld;
    let bystander: SeededWorld;
    beforeAll(async () => {
      subject = await seedWorld('pd-safety', 1);
      bystander = await seedWorld('pd-safety-keep', 1);
    }, 120_000);

    it('tells an authorised operator they may execute', async () => {
      const planned = await preview(
        `/admin/worlds/${bystander.worldId}/deletion-preview`,
      );
      expect(
        (planned as unknown as { actorMayExecute: boolean }).actorMayExecute,
      ).toBe(true);
    });

    it('blocks deleting an item while a live Moving XO Match in its World can re-read it', async () => {
      const itemId = await createItem(
        subject.scopeIds[1],
        [RYO_MODE_KEY],
        'pd-reread',
      );
      const sessionId = `pd-reread-${randomUUID()}`;
      const matchId = `pd-reread-match-${randomUUID()}`;
      await database.collection('live_game_sessions').insertOne({
        sessionId,
        status: 'active',
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      await database.collection('matches').insertOne({
        matchId,
        liveSessionId: sessionId,
        status: 'active',
        occurrences: [
          { worldId: subject.worldId, selectedScopeIds: subject.scopeIds },
        ],
        currentChallenge: {
          challengeKey: MOVING_XO_MODE_KEY,
          contentItemIds: [],
        },
      });
      try {
        const planned = await preview(
          `/admin/content-items/${itemId}/deletion-preview`,
        );
        expect(planned.safeWithHistoryPurge).toBe(false);
        expect(planned.blockers.map((blocker) => blocker.code)).toContain(
          'LIVE_MATCH_IN_PROGRESS',
        );
      } finally {
        await database.collection('matches').deleteOne({ matchId });
        await database
          .collection('live_game_sessions')
          .deleteOne({ sessionId });
      }
      // The same item in a World with no such Match is deletable.
      const clear = await preview(
        `/admin/content-items/${itemId}/deletion-preview`,
      );
      expect(clear.safe).toBe(true);
    });

    it('deletes items owned through a Scope even if their worldId disagrees', async () => {
      const stray = await createItem(
        subject.scopeIds[0],
        [RYO_MODE_KEY],
        'pd-stray',
      );
      await database
        .collection('content_items')
        .updateOne(
          { _id: oid(stray) },
          { $set: { worldId: oid(bystander.worldId) } },
        );
      const planned = await preview(
        `/admin/worlds/${subject.worldId}/deletion-preview`,
      );
      await execute(`/admin/worlds/${subject.worldId}/permanent-delete`, {
        previewFingerprint: planned.fingerprint,
      }).expect(201);
      await expect(count('content_items', { _id: oid(stray) })).resolves.toBe(
        0,
      );
      await expect(
        count('content_items', { scopeId: { $in: subject.scopeIds.map(oid) } }),
      ).resolves.toBe(0);
      await expect(
        count('content_items', { worldId: oid(bystander.worldId) }),
      ).resolves.toBe(4);
    });
  });

  describe('atomicity and races', () => {
    it('rolls everything back when any step of the transaction fails', async () => {
      const subject = await seedWorld('pd-rollback', 1);
      let fail = true;
      app.get(WorldContentReferenceRegistry).registerDeletionParticipant({
        source: 'test-failure-injection',
        describe: async () => ({
          source: 'test-failure-injection',
          counts: {},
          blockers: [],
        }),
        apply: async () => {
          if (fail) throw new Error('injected failure');
          return {};
        },
      });
      try {
        const planned = await preview(
          `/admin/worlds/${subject.worldId}/deletion-preview`,
        );
        await execute(`/admin/worlds/${subject.worldId}/permanent-delete`, {
          previewFingerprint: planned.fingerprint,
        }).expect(500);
        await expect(
          count('worlds', { _id: oid(subject.worldId) }),
        ).resolves.toBe(1);
        await expect(
          count('content_items', { worldId: oid(subject.worldId) }),
        ).resolves.toBe(4);
        await expect(
          count('admin_deletion_log', { 'entity.id': subject.worldId }),
        ).resolves.toBe(0);
      } finally {
        fail = false;
      }
    }, 120_000);

    it('never commits a Match against a World a concurrent deletion removed', async () => {
      const fence = app.get(MatchCreationFence);
      for (let round = 0; round < 4; round += 1) {
        const subject = await seedWorld(`pd-race-${round}`, 0);
        const raceSession = `pd-race-session-${round}-${randomUUID()}`;
        const raceMatch = `pd-race-match-${round}-${randomUUID()}`;
        await database.collection('live_game_sessions').insertOne({
          sessionId: raceSession,
          status: 'active',
          expiresAt: new Date(Date.now() + 3_600_000),
        });
        const planned = await preview(
          `/admin/worlds/${subject.worldId}/deletion-preview`,
        );

        // Mirrors createUnified: re-validate the World inside the fenced
        // transaction, then insert the Match in the same transaction.
        const create = fence
          .run([subject.worldId], async (session) => {
            const world = await database
              .collection('worlds')
              .findOne({ _id: oid(subject.worldId) });
            if (!world) throw new Error('WORLD_NOT_FOUND');
            await database.collection('matches').insertOne(
              {
                matchId: raceMatch,
                liveSessionId: raceSession,
                status: 'active',
                occurrences: [
                  { worldId: subject.worldId, selectedScopeIds: [] },
                ],
              },
              { session },
            );
          })
          .then(() => 'created' as const)
          .catch(() => 'refused' as const);
        const remove = execute(
          `/admin/worlds/${subject.worldId}/permanent-delete`,
          {
            previewFingerprint: planned.fingerprint,
          },
        ).then((response) => response.status);

        const [created, removedStatus] = await Promise.all([create, remove]);
        const worldExists =
          (await count('worlds', { _id: oid(subject.worldId) })) === 1;
        const matchExists =
          (await count('matches', { matchId: raceMatch })) === 1;

        // Exactly one side wins, and never a Match pointing at a deleted World.
        expect(matchExists && !worldExists).toBe(false);
        if (created === 'created') {
          expect(matchExists).toBe(true);
          expect(worldExists).toBe(true);
          expect(removedStatus).toBe(409);
        } else {
          expect(removedStatus).toBe(201);
          expect(worldExists).toBe(false);
        }
        await database.collection('matches').deleteMany({ matchId: raceMatch });
      }
    }, 240_000);
  });

  describe('mechanic (ChallengeType)', () => {
    let subject: SeededWorld;
    let bystander: SeededWorld;
    let sharedItem: string;

    beforeAll(async () => {
      subject = await seedWorld('pd-mech', 2);
      bystander = await seedWorld('pd-mech-keep', 2);
      // Playable through both أقرب and اقرأ خصمك: it must survive أقرب's deletion.
      sharedItem = await createItem(
        subject.scopeIds[1],
        [CLOSEST_MODE_KEY, RYO_MODE_KEY],
        'pd-shared',
      );
    }, 120_000);

    it('deletes exclusive content globally, keeps shared content, and cleans bindings', async () => {
      const closest = mechanic(CLOSEST_MODE_KEY);
      const ryo = mechanic(RYO_MODE_KEY);
      const planned = await preview(
        `/admin/challenge-types/${closest.id}/deletion-preview`,
      );
      expect(planned.impact.content.sharedPreserved).toBe(1);
      expect(planned.impact.content.toDelete).toBeGreaterThanOrEqual(4);

      await execute(`/admin/challenge-types/${closest.id}/permanent-delete`, {
        previewFingerprint: planned.fingerprint,
      }).expect(201);

      await expect(
        count('challenge_types', { _id: oid(closest.id) }),
      ).resolves.toBe(0);
      await expect(
        count('content_items', { compatibleChallengeTypeIds: oid(closest.id) }),
      ).resolves.toBe(0);
      const shared = await database
        .collection('content_items')
        .findOne({ _id: oid(sharedItem) });
      expect(shared?.compatibleChallengeTypeIds.map(String)).toEqual([ryo.id]);
      await expect(
        count('world_challenge_configurations', {
          challengeTypeId: oid(closest.id),
        }),
      ).resolves.toBe(0);
      // Other mechanics' content in both Worlds is untouched.
      for (const world of [subject, bystander]) {
        await expect(
          count('content_items', {
            worldId: oid(world.worldId),
            compatibleChallengeTypeIds: oid(ryo.id),
          }),
        ).resolves.toBeGreaterThanOrEqual(2);
        await expect(
          count('world_challenge_configurations', {
            worldId: oid(world.worldId),
          }),
        ).resolves.toBe(3);
      }
      // A production mechanic is tombstoned so provisioning does not recreate it.
      await expect(
        count('production_mechanic_lifecycle', {
          slug: CLOSEST_MODE_KEY,
          state: 'deleted_by_admin',
        }),
      ).resolves.toBe(1);
    });
  });
});
