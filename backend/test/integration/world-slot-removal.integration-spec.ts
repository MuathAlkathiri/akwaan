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
import { RYO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/ryo-gameplay.plugin';
import { CLOSEST_MODE_KEY } from '../../src/modules/live-game-sessions/domain/closest-gameplay.plugin';
import { ONE_CLUE_MODE_KEY } from '../../src/modules/live-game-sessions/domain/one-clue-gameplay.plugin';
import { LAQATHA_MODE_KEY } from '../../src/modules/live-game-sessions/domain/laqatha-gameplay.plugin';
import { productionMechanicFixture } from '../fixtures/production-mechanic.fixture';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  WorldChallengeSlotKey,
  WorldContentStatus,
  ONE_CLUE_VALUES,
} from '../../src/modules/world-content/domain/world-content.constants';

/**
 * Removing one mechanic from one World board position, against real Mongo.
 *
 * The rule this suite exists for cannot be proved with mocks: the blast radius is
 * a *query*. Two Worlds are configured with the same mechanics and the same shape
 * of content, and every assertion checks that operating on one leaves the other
 * exactly as it was — including the global ChallengeType, which is never the thing
 * being deleted.
 */
describe('world slot mechanic removal', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;

  const KEY = 'world-slot-removal';

  beforeAll(async () => {
    database = await connectTestDatabase(KEY);
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri(KEY) },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  const http = () => request(app.getHttpServer());
  const bearer = <T extends request.Test>(value: T): T =>
    value.set('Authorization', `Bearer ${token}`) as T;
  const unwrap = <T>(response: request.Response): T =>
    (response.body?.data ?? response.body) as T;

  const SLOTS = [
    WorldChallengeSlotKey.SLOT_1,
    WorldChallengeSlotKey.SLOT_2,
    WorldChallengeSlotKey.SLOT_3,
    WorldChallengeSlotKey.SLOT_4,
  ];

  /**
   * The four mechanics this suite seats on every board.
   *
   * Canonical, because one of these tests asserts the board reports **no**
   * blockers once a slot is refilled, and readiness correctly refuses a slot no
   * launcher answers to. Which four is not arbitrary: every other canonical
   * mechanic demands its own content pattern — a ركّبها assembly, a bomb run, a
   * Marhala difficulty — and this suite is about counting a slot's content, not
   * about authoring six different item shapes. These four need at most a ladder
   * of clues.
   */
  const BOARD_MECHANICS = [
    RYO_MODE_KEY,
    CLOSEST_MODE_KEY,
    ONE_CLUE_MODE_KEY,
    LAQATHA_MODE_KEY,
  ] as const;

  /**
   * A ready item for one mechanic.
   *
   * بدليل and القطها read a MATCH answer plus the five-clue ladder they both
   * require; أقرب and اقرأ خصمك both accept a numeric CLOSEST item.
   */
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
        };

  let mechanics: Array<{ id: string; slug: string }>;

  /** Four mechanics shared by every World in this suite, as the catalog is. */
  const seedMechanics = async () => {
    // Four real mechanics. One of these tests asserts the board reports **no**
    // blockers once a slot is refilled, and readiness correctly refuses a slot
    // holding a mechanic no launcher answers to — so invented slugs cannot
    // stand here. These four are the canonical mechanics with no extra
    // per-mechanic content structure, which keeps this suite about counting a
    // slot's content rather than about authoring four different item shapes.
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
    return created;
  };

  /**
   * A World with all four slots filled and `perMechanic` items for each mechanic.
   *
   * Deliberately identical between the two Worlds so a leak across them shows up
   * as a count that is too large rather than as a subtle difference.
   */
  const seedWorld = async (slug: string, perMechanic: number) => {
    const world = unwrap<{ id: string }>(
      await bearer(http().post('/admin/worlds'))
        .send({ name: `عالم ${slug}`, slug })
        .expect(201),
    );
    const worldId = String(world.id);
    const scope = unwrap<{ id: string }>(
      await bearer(http().post(`/admin/worlds/${worldId}/scopes`))
        .send({ name: `نطاق ${slug}`, slug: `${slug}-scope` })
        .expect(201),
    );
    const scopeId = String(scope.id);

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

    for (const mechanic of mechanics) {
      for (let copy = 0; copy < perMechanic; copy += 1) {
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId,
            prompt: { ar: `${slug} ${mechanic.slug} ${copy}` },
            compatibleChallengeTypeIds: [mechanic.id],
            ...itemFor(mechanic.slug, `${slug}-${mechanic.slug}-${copy}`),
            status: ContentItemStatus.READY,
          })
          .expect(201);
      }
    }
    return { worldId, scopeId, configurations };
  };

  /** Counted straight from Mongo, so the assertion does not trust the API. */
  const countItems = (worldId: string, challengeTypeId: string) =>
    database.collection('content_items').countDocuments({
      worldId: new Types.ObjectId(worldId),
      compatibleChallengeTypeIds: new Types.ObjectId(challengeTypeId),
    });

  const board = async (worldId: string) =>
    unwrap<{
      configurations: Array<{
        id: string;
        slotKey: string;
        challengeTypeId: string;
      }>;
      board: { blockers: unknown[] };
    }>(
      await bearer(
        http().get(`/admin/worlds/${worldId}/challenge-configurations`),
      ).expect(200),
    );

  const readiness = async (worldId: string) =>
    unwrap<{ boardReady: boolean }>(
      await bearer(http().get(`/admin/worlds/${worldId}/readiness`)).expect(
        200,
      ),
    );

  beforeAll(async () => {
    mechanics = await seedMechanics();
  }, 120_000);

  describe('preview is scoped to one World', () => {
    let subject: Awaited<ReturnType<typeof seedWorld>>;
    let bystander: Awaited<ReturnType<typeof seedWorld>>;

    beforeAll(async () => {
      subject = await seedWorld('wsr-subject', 5);
      bystander = await seedWorld('wsr-bystander', 5);
    }, 120_000);

    it('counts only the selected World content for the mechanic', async () => {
      // Both Worlds hold 5 items for this mechanic. A preview that reported 10
      // would mean the query lost its World scope.
      const preview = unwrap<{
        content: {
          total: number;
          ready: number;
          exclusive: number;
          shared: number;
        };
        challengeTypeSlug: string;
        boardWillBecomeIncomplete: boolean;
      }>(
        await bearer(
          http().get(
            `/admin/challenge-configurations/${subject.configurations[WorldChallengeSlotKey.SLOT_2]}/removal-preview`,
          ),
        ).expect(200),
      );

      expect(preview.content.total).toBe(5);
      expect(preview.content.ready).toBe(5);
      expect(preview.content.exclusive).toBe(5);
      expect(preview.content.shared).toBe(0);
      expect(preview.challengeTypeSlug).toBe(mechanics[1].slug);
      expect(preview.boardWillBecomeIncomplete).toBe(true);
      // And the bystander really does hold its own 5.
      await expect(
        countItems(bystander.worldId, mechanics[1].id),
      ).resolves.toBe(5);
    });

    it('changes nothing', async () => {
      await expect(countItems(subject.worldId, mechanics[1].id)).resolves.toBe(
        5,
      );
      expect((await board(subject.worldId)).configurations).toHaveLength(4);
    });
  });

  describe('removal', () => {
    let subject: Awaited<ReturnType<typeof seedWorld>>;
    let bystander: Awaited<ReturnType<typeof seedWorld>>;
    let releasedConfigurationId: string;

    beforeAll(async () => {
      subject = await seedWorld('wsr-remove', 3);
      bystander = await seedWorld('wsr-keep', 3);
      releasedConfigurationId =
        subject.configurations[WorldChallengeSlotKey.SLOT_2];
    }, 120_000);

    it('removes exactly this World items and empties the slot', async () => {
      const result = unwrap<{
        deletedContentItems: number;
        detachedSharedItems: number;
        slotNowEmpty: boolean;
        boardReady: boolean;
      }>(
        await bearer(
          http().post(
            `/admin/challenge-configurations/${releasedConfigurationId}/release`,
          ),
        )
          .send({ expectedChallengeTypeId: mechanics[1].id })
          .expect(201),
      );

      expect(result.deletedContentItems).toBe(3);
      expect(result.detachedSharedItems).toBe(0);
      expect(result.slotNowEmpty).toBe(true);
      expect(result.boardReady).toBe(false);
      await expect(countItems(subject.worldId, mechanics[1].id)).resolves.toBe(
        0,
      );
    });

    it('leaves the other World content completely untouched', async () => {
      await expect(
        countItems(bystander.worldId, mechanics[1].id),
      ).resolves.toBe(3);
    });

    it('leaves the global ChallengeType in the catalog', async () => {
      const type = unwrap<{ id: string; slug: string }>(
        await bearer(
          http().get(`/admin/challenge-types/${mechanics[1].id}`),
        ).expect(200),
      );
      expect(type.slug).toBe(mechanics[1].slug);
    });

    it('leaves the other World board binding for the same mechanic', async () => {
      const bystanderBoard = await board(bystander.worldId);
      expect(bystanderBoard.configurations).toHaveLength(4);
      expect(
        bystanderBoard.configurations.some(
          (configuration) => configuration.challengeTypeId === mechanics[1].id,
        ),
      ).toBe(true);
    });

    it('leaves this World other three slots and their content alone', async () => {
      const subjectBoard = await board(subject.worldId);
      expect(
        subjectBoard.configurations.map((entry) => entry.slotKey).sort(),
      ).toEqual(
        [
          WorldChallengeSlotKey.SLOT_1,
          WorldChallengeSlotKey.SLOT_3,
          WorldChallengeSlotKey.SLOT_4,
        ].sort(),
      );
      for (const index of [0, 2, 3]) {
        await expect(
          countItems(subject.worldId, mechanics[index].id),
        ).resolves.toBe(3);
      }
    });

    it('reports the board as not ready while the slot is empty', async () => {
      await expect(readiness(subject.worldId)).resolves.toMatchObject({
        boardReady: false,
      });
      expect(
        (await board(subject.worldId)).board.blockers.length,
      ).toBeGreaterThan(0);
    });

    it('refuses a match selection that includes the incomplete World', async () => {
      const response = await bearer(
        http().post('/admin/worlds/validate-match-selection'),
      ).send({
        worldIds: [subject.worldId, bystander.worldId, bystander.worldId],
      });
      const body = unwrap<{ structurallyValid: boolean }>(response);
      expect(body.structurallyValid).toBe(false);
    });

    it('restores readiness when the slot is filled again', async () => {
      await bearer(
        http().post(
          `/admin/worlds/${subject.worldId}/challenge-configurations`,
        ),
      )
        .send({
          challengeTypeId: mechanics[1].id,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          isEnabled: true,
          sortOrder: 1,
        })
        .expect(201);

      const restored = await board(subject.worldId);
      expect(restored.configurations).toHaveLength(4);
      expect(restored.board.blockers).toEqual([]);
    });
  });

  describe('shared content and stale confirmations', () => {
    let subject: Awaited<ReturnType<typeof seedWorld>>;

    beforeAll(async () => {
      subject = await seedWorld('wsr-shared', 2);
    }, 120_000);

    it('detaches an item another mechanic can still play', async () => {
      // One item compatible with two mechanics. Removing one of them must cost
      // the item a relationship, not its existence.
      const scopeId = subject.scopeId;
      const shared = unwrap<{ id: string }>(
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId,
            prompt: { ar: 'سؤال مشترك' },
            compatibleChallengeTypeIds: [mechanics[2].id, mechanics[3].id],
            // Both of those read the clue ladder, so a shared item carries it.
            ...itemFor(ONE_CLUE_MODE_KEY, 'مشترك'),
            status: ContentItemStatus.READY,
          })
          .expect(201),
      );

      const configurationId =
        subject.configurations[WorldChallengeSlotKey.SLOT_3];
      const preview = unwrap<{
        content: { exclusive: number; shared: number };
      }>(
        await bearer(
          http().get(
            `/admin/challenge-configurations/${configurationId}/removal-preview`,
          ),
        ).expect(200),
      );
      expect(preview.content).toMatchObject({ exclusive: 2, shared: 1 });

      const result = unwrap<{
        deletedContentItems: number;
        detachedSharedItems: number;
      }>(
        await bearer(
          http().post(
            `/admin/challenge-configurations/${configurationId}/release`,
          ),
        )
          .send({ expectedChallengeTypeId: mechanics[2].id })
          .expect(201),
      );
      expect(result).toMatchObject({
        deletedContentItems: 2,
        detachedSharedItems: 1,
      });

      // The shared item survived, minus one relationship.
      const survivor = unwrap<{ compatibleChallengeTypeIds: string[] }>(
        await bearer(http().get(`/admin/content-items/${shared.id}`)).expect(
          200,
        ),
      );
      expect(survivor.compatibleChallengeTypeIds).toEqual([mechanics[3].id]);
    });

    it('refuses a confirmation aimed at a mechanic the slot no longer holds', async () => {
      const configurationId =
        subject.configurations[WorldChallengeSlotKey.SLOT_4];
      const before = await countItems(subject.worldId, mechanics[3].id);

      const response = await bearer(
        http().post(
          `/admin/challenge-configurations/${configurationId}/release`,
        ),
      ).send({ expectedChallengeTypeId: mechanics[0].id });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'BOARD_SLOT_REBOUND' });
      // Nothing was deleted and the binding is intact.
      await expect(countItems(subject.worldId, mechanics[3].id)).resolves.toBe(
        before,
      );
      const stillThere = await board(subject.worldId);
      expect(
        stillThere.configurations.some(
          (entry) => entry.slotKey === WorldChallengeSlotKey.SLOT_4,
        ),
      ).toBe(true);
    });
  });
});
