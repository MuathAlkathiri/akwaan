import { Connection, Model, Types } from 'mongoose';
import {
  connectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import { ContentExposureRepository } from '../../src/modules/match/persistence/content-exposure.repository';
import { ContentExposureService } from '../../src/modules/match/application/content-exposure.service';
import {
  ContentExposureDocument,
  ContentExposureSchema,
} from '../../src/modules/match/persistence/content-exposure.schema';
import { ContentItemSchema } from '../../src/modules/world-content/schemas/content-item.schema';
import { ContentItemRepository } from '../../src/modules/world-content/persistence/content-item.repository';
import { MatchContentSelector } from '../../src/modules/match/application/match-content-selection.service';
import { MatchContentExhaustedError } from '../../src/modules/match/application/content-exposure.service';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  WorldChallengeSlotKey,
} from '../../src/modules/world-content/domain/world-content.constants';

/**
 * The exposure ledger against real Mongo.
 *
 * Mocks cannot prove any of this: the uniqueness that makes a duplicate write a
 * no-op, the atomic claim that stops two concurrent Matches of one account
 * drawing the same question, and the index the selection query depends on are all
 * database behaviour.
 */
describe('content exposure ledger', () => {
  let database: Connection;
  let exposures: ContentExposureService;
  let repository: ContentExposureRepository;

  const KEY = 'content-exposure';
  const NOW = new Date('2026-08-20T10:00:00.000Z');

  const ACCOUNT_A = 'account-a';
  const ACCOUNT_B = 'account-b';
  const BOMB = 'bomb';
  const RYO = 'read-your-opponent';

  const scope = (
    overrides: {
      ownerAccountId?: string;
      challengeTypeKey?: string;
      matchId?: string;
    } = {},
  ) => ({
    ownerAccountId: overrides.ownerAccountId ?? ACCOUNT_A,
    challengeTypeKey: overrides.challengeTypeKey ?? BOMB,
    matchId: overrides.matchId ?? 'match-1',
  });

  beforeAll(async () => {
    // The ledger's guarantees are database behaviour — uniqueness, the atomic
    // claim, the index — so this drives the real model directly rather than
    // booting the whole application around it.
    database = await connectTestDatabase(KEY);
    await resetTestDatabase(database);
    const model = database.model(
      ContentExposureDocument.name,
      ContentExposureSchema,
    ) as unknown as Model<ContentExposureDocument>;
    await model.syncIndexes();
    repository = new ContentExposureRepository(model);
    exposures = new ContentExposureService(repository);
  }, 180_000);

  afterAll(async () => {
    await resetTestDatabase(database);
    await database?.close();
  });

  beforeEach(async () => {
    await database.collection('content_exposures').deleteMany({});
  });

  // Every test below re-establishes whatever history it needs, so none depends on
  // the order the suite happens to run in.

  const seen = (key: { ownerAccountId: string; challengeTypeKey: string }) =>
    repository.listForOwner(key);

  describe('the exposure triple', () => {
    it('never offers the same item twice in the same mechanic', async () => {
      await exposures.recordPresented(scope(), ['i1'], NOW);

      await expect(
        exposures.selectable(scope(), ['i1', 'i2'], NOW),
      ).resolves.toEqual(['i2']);
    });

    it('leaves the item eligible in a different mechanic', async () => {
      // Seeing a fact presented one way does not spend it in every other. This is
      // the difference between a per-mechanic ledger and burning the catalog.
      await exposures.recordPresented(
        scope({ challengeTypeKey: BOMB }),
        ['i1'],
        NOW,
      );

      await expect(
        exposures.selectable(scope({ challengeTypeKey: RYO }), ['i1'], NOW),
      ).resolves.toEqual(['i1']);
    });

    it('leaves the item eligible for a different account', async () => {
      await exposures.recordPresented(
        scope({ ownerAccountId: ACCOUNT_A }),
        ['i1'],
        NOW,
      );

      await expect(
        exposures.selectable(scope({ ownerAccountId: ACCOUNT_B }), ['i1'], NOW),
      ).resolves.toEqual(['i1']);
    });

    it('applies the same history to a different group on the same account', async () => {
      // Exposure belongs to the account, so tonight's players are irrelevant —
      // there is no participant or device dimension for them to change.
      await exposures.recordPresented(
        scope({ matchId: 'match-1' }),
        ['i1'],
        NOW,
      );

      await expect(
        exposures.selectable(
          scope({ matchId: 'a-totally-different-match' }),
          ['i1'],
          NOW,
        ),
      ).resolves.toEqual([]);
    });
  });

  describe('selection is not exposure', () => {
    it('a reservation does not spend the item', async () => {
      await exposures.reserve(scope(), ['i1', 'i2'], NOW);

      const rows = await seen(scope());
      expect(rows.every((row) => row.state === 'reserved')).toBe(true);
      expect(rows).toHaveLength(2);
    });

    it('releases what a challenge drew but never showed', async () => {
      await exposures.reserve(scope(), ['i1', 'i2', 'i3'], NOW);
      // Only i1 reached a player.
      await exposures.recordPresented(scope(), ['i1'], NOW);

      await exposures.releaseUnseen('match-1');

      const rows = await seen(scope());
      expect(rows).toEqual([{ contentItemId: 'i1', state: 'exposed' }]);
      // The unshown two are eligible again for any future Match.
      await expect(
        exposures.selectable(
          scope({ matchId: 'match-2' }),
          ['i1', 'i2', 'i3'],
          NOW,
        ),
      ).resolves.toEqual(['i2', 'i3']);
    });

    it('a release cannot un-see anything', async () => {
      await exposures.recordPresented(scope(), ['i1'], NOW);
      await exposures.releaseUnseen('match-1');
      await expect(exposures.selectable(scope(), ['i1'], NOW)).resolves.toEqual(
        [],
      );
    });
  });

  describe('idempotency', () => {
    it('recording the same presentation twice leaves one row', async () => {
      await exposures.recordPresented(scope(), ['i1'], NOW);
      await exposures.recordPresented(scope(), ['i1'], NOW);

      expect(await seen(scope())).toHaveLength(1);
    });

    it('a reconnect that replays the whole presented set costs nothing', async () => {
      // The hook reports the cumulative set, so a resync re-reports items 1..n.
      await exposures.recordPresented(scope(), ['i1', 'i2'], NOW);
      await exposures.recordPresented(scope(), ['i1', 'i2'], NOW);
      await exposures.recordPresented(scope(), ['i1', 'i2', 'i3'], NOW);

      const rows = await seen(scope());
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.state === 'exposed')).toBe(true);
    });

    it('keeps the first presentation time when reported again', async () => {
      const later = new Date(NOW.getTime() + 60_000);
      await exposures.recordPresented(scope(), ['i1'], NOW);
      await exposures.recordPresented(scope(), ['i1'], later);

      const row = await database
        .collection('content_exposures')
        .findOne({ contentItemId: 'i1' });
      expect(new Date(row!.exposedAt as Date).toISOString()).toBe(
        NOW.toISOString(),
      );
    });

    it('presenting an item that was never reserved still records it', async () => {
      await exposures.recordPresented(scope(), ['never-reserved'], NOW);
      expect(await seen(scope())).toEqual([
        { contentItemId: 'never-reserved', state: 'exposed' },
      ]);
    });
  });

  describe('concurrency between two Matches of one account', () => {
    it('only one Match can claim an item', async () => {
      const [first, second] = await Promise.all([
        exposures.reserve(scope({ matchId: 'match-1' }), ['i1'], NOW),
        exposures.reserve(scope({ matchId: 'match-2' }), ['i1'], NOW),
      ]);

      // Exactly one holds it; the other is told it lost.
      const claims = [first.claimed.length, second.claimed.length].sort();
      expect(claims).toEqual([0, 1]);
      const losses = [first.lost.length, second.lost.length].sort();
      expect(losses).toEqual([0, 1]);
      expect(await seen(scope())).toHaveLength(1);
    });

    it('lets a Match re-claim what it already holds, so a retry is not refused', async () => {
      // A recovered or retried launch re-draws the same items. Nothing is inserted
      // the second time, and treating that as "lost" would refuse a launch its own
      // predecessor had already reserved.
      await exposures.reserve(scope({ matchId: 'match-1' }), ['i1', 'i2'], NOW);

      const again = await exposures.reserve(
        scope({ matchId: 'match-1' }),
        ['i1', 'i2'],
        NOW,
      );
      expect(again.claimed.sort()).toEqual(['i1', 'i2']);
      expect(again.lost).toEqual([]);
    });

    it('hides another live Match reservation from selection', async () => {
      await exposures.reserve(scope({ matchId: 'match-1' }), ['i1'], NOW);

      await expect(
        exposures.selectable(scope({ matchId: 'match-2' }), ['i1', 'i2'], NOW),
      ).resolves.toEqual(['i2']);
    });

    it('still shows a Match its own reservation, so a retried draw is stable', async () => {
      await exposures.reserve(scope({ matchId: 'match-1' }), ['i1'], NOW);

      await expect(
        exposures.selectable(scope({ matchId: 'match-1' }), ['i1'], NOW),
      ).resolves.toEqual(['i1']);
    });

    it('stops withholding once a reservation has expired', async () => {
      await exposures.reserve(scope({ matchId: 'match-1' }), ['i1'], NOW);
      // A process that died mid-challenge must not hold content forever.
      const wellLater = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

      await expect(
        exposures.selectable(scope({ matchId: 'match-2' }), ['i1'], wellLater),
      ).resolves.toEqual(['i1']);
    });

    it('an exposure is never treated as expired', async () => {
      await exposures.recordPresented(scope(), ['i1'], NOW);
      const wellLater = new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000);

      await expect(
        exposures.selectable(scope({ matchId: 'match-2' }), ['i1'], wellLater),
      ).resolves.toEqual([]);
    });
  });

  describe('the index the ledger is designed around', () => {
    it('enforces one row per (account, mechanic, item)', async () => {
      const indexes = await database.collection('content_exposures').indexes();
      const unique = indexes.find(
        (index) =>
          index.unique &&
          JSON.stringify(index.key) ===
            JSON.stringify({
              ownerAccountId: 1,
              challengeTypeKey: 1,
              contentItemId: 1,
            }),
      );
      expect(unique).toBeDefined();
    });

    it('answers the selection query from that index alone', async () => {
      await exposures.recordPresented(scope(), ['i1', 'i2'], NOW);
      const plan = await database
        .collection('content_exposures')
        .find({
          ownerAccountId: ACCOUNT_A,
          challengeTypeKey: BOMB,
          contentItemId: { $in: ['i1', 'i2', 'i3'] },
        })
        .explain('queryPlanner');

      // No collection scan: the account's history is never read whole.
      expect(JSON.stringify(plan)).toContain('IXSCAN');
      expect(JSON.stringify(plan)).not.toContain('"stage":"COLLSCAN"');
    });
  });

  describe('end to end through the real selector', () => {
    const WORLD = new Types.ObjectId();
    const SCOPE = new Types.ObjectId();
    const RYO_TYPE = new Types.ObjectId();
    const BOMB_TYPE = new Types.ObjectId();
    let selector: MatchContentSelector;
    let itemIds: string[];

    beforeAll(async () => {
      const items = database.model(
        'ContentItem',
        ContentItemSchema,
        'content_items',
      );
      selector = new MatchContentSelector(
        new ContentItemRepository(items as never),
        exposures,
      );
      // Six items, each playable through *both* mechanics — which is what makes
      // the per-mechanic distinction observable at all.
      const created = await items.insertMany(
        Array.from({ length: 6 }, (_, index) => ({
          scopeId: SCOPE,
          worldId: WORLD,
          prompt: { ar: `سؤال ${index + 1}` },
          compatibleChallengeTypeIds: [RYO_TYPE, BOMB_TYPE],
          answerPayload: {
            mode: ChallengeAnswerMode.MATCH,
            acceptedAnswers: [`a${index}`],
          },
          status: ContentItemStatus.READY,
          isReusableAcrossSessions: false,
        })),
      );
      itemIds = created.map((doc) => String(doc._id));
    }, 120_000);

    const draw = (
      challengeTypeKey: string,
      challengeTypeId: Types.ObjectId,
      contentItemCount = 3,
    ) =>
      selector.select({
        matchId: 'match-e2e',
        occurrenceIndex: 0,
        worldId: String(WORLD),
        selectedScopeIds: [String(SCOPE)],
        slotKey: WorldChallengeSlotKey.SLOT_1,
        challengeTypeId: String(challengeTypeId),
        requirements: {
          contentItemCount,
          requiresPhones: false,
          isPlayableItem: () => true,
        } as never,
        usedContentItemIds: [],
        exposureScope: {
          ownerAccountId: ACCOUNT_A,
          challengeTypeKey,
          matchId: 'match-e2e',
        },
        now: NOW,
      });

    it('excludes an item the account played in that same mechanic', async () => {
      await exposures.recordPresented(
        scope({ challengeTypeKey: RYO }),
        [itemIds[0], itemIds[1], itemIds[2]],
        NOW,
      );

      const drawn = await draw(RYO, RYO_TYPE);
      for (const burned of itemIds.slice(0, 3)) {
        expect(drawn).not.toContain(burned);
      }
      expect(drawn).toHaveLength(3);
    });

    it('still offers those same items in a different mechanic', async () => {
      // The whole point of keying on the triple: three items are spent in
      // اقرأ خصمك and completely untouched in القنبلة.
      await exposures.recordPresented(
        scope({ challengeTypeKey: RYO }),
        itemIds.slice(0, 3),
        NOW,
      );

      const drawn = await draw(BOMB, BOMB_TYPE, 6);
      expect(drawn).toHaveLength(6);
      for (const burned of itemIds.slice(0, 3)) {
        expect(drawn).toContain(burned);
      }
    });

    it('refuses with account exhaustion once the mechanic is played out', async () => {
      // Every item spent in اقرأ خصمك.
      await exposures.recordPresented(
        scope({ challengeTypeKey: RYO }),
        itemIds,
        NOW,
      );

      const error = await draw(RYO, RYO_TYPE).catch(
        (cause: MatchContentExhaustedError) => cause,
      );
      expect(error).toBeInstanceOf(MatchContentExhaustedError);
      expect((error as MatchContentExhaustedError).getResponse()).toMatchObject(
        {
          code: 'MATCH_CONTENT_EXHAUSTED_FOR_ACCOUNT',
        },
      );
      // And القنبلة is still perfectly playable for the same account.
      await expect(draw(BOMB, BOMB_TYPE, 6)).resolves.toHaveLength(6);
    });

    it('leaves a different account untouched by all of it', async () => {
      const drawn = await selector.select({
        matchId: 'match-other-account',
        occurrenceIndex: 0,
        worldId: String(WORLD),
        selectedScopeIds: [String(SCOPE)],
        slotKey: WorldChallengeSlotKey.SLOT_1,
        challengeTypeId: String(RYO_TYPE),
        requirements: {
          contentItemCount: 6,
          requiresPhones: false,
          isPlayableItem: () => true,
        } as never,
        usedContentItemIds: [],
        exposureScope: {
          ownerAccountId: ACCOUNT_B,
          challengeTypeKey: RYO,
          matchId: 'match-other-account',
        },
        now: NOW,
      });
      expect(drawn).toHaveLength(6);
    });
  });
});
