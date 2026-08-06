import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ScopeRepository } from '../../world-content/persistence/scope.repository';
import {
  ContentItemStatus,
  WorldContentStatus,
} from '../../world-content/domain/world-content.constants';
import { MatchContentPool } from './match-content-pool.service';

const WORLD_ID = 'world-football';

interface FakeScope {
  _id: string;
  worldId: string;
  name: string;
  status: WorldContentStatus;
  excludedChallengeTypeIds?: string[];
}

interface FakeItem {
  _id: string;
  worldId: string;
  scopeId: string;
  status: ContentItemStatus;
  compatibleChallengeTypeIds: string[];
}

const scope = (
  id: string,
  name: string,
  overrides: Partial<FakeScope> = {},
): FakeScope => ({
  _id: id,
  worldId: WORLD_ID,
  name,
  status: WorldContentStatus.ACTIVE,
  excludedChallengeTypeIds: [],
  ...overrides,
});

function pool(
  options: {
    scopes?: FakeScope[];
    readyCounts?: Record<string, number>;
    items?: FakeItem[];
  } = {},
) {
  const scopes = options.scopes ?? [
    scope('s1', 'كأس العالم'),
    scope('s2', 'الدوري الإنجليزي'),
    scope('s3', 'الدوري السعودي'),
    scope('s4', 'أبطال أوروبا'),
    scope('s5', 'مؤرشف', { status: WorldContentStatus.ARCHIVED }),
  ];
  const readyCounts = options.readyCounts ?? {
    s1: 40,
    s2: 30,
    s3: 22,
    s4: 18,
    s5: 12,
  };
  const items = options.items ?? [];

  const scopeRepository = {
    listByWorld: (worldId: string) =>
      Promise.resolve(scopes.filter((entry) => entry.worldId === worldId)),
    findById: (id: string) =>
      Promise.resolve(scopes.find((entry) => entry._id === id) ?? null),
  } as unknown as ScopeRepository;
  const itemRepository = {
    readyCountsByScope: () =>
      Promise.resolve(new Map(Object.entries(readyCounts))),
    findById: (id: string) =>
      Promise.resolve(items.find((item) => item._id === id) ?? null),
  } as unknown as ContentItemRepository;

  return new MatchContentPool(scopeRepository, itemRepository);
}

const item = (
  id: string,
  scopeId: string,
  overrides: Partial<FakeItem> = {},
): FakeItem => ({
  _id: id,
  worldId: WORLD_ID,
  scopeId,
  status: ContentItemStatus.READY,
  compatibleChallengeTypeIds: ['type-ryo'],
  ...overrides,
});

describe('MatchContentPool', () => {
  describe('choosing the four Scopes', () => {
    it('offers only active Scopes of the World that hold ready content', async () => {
      const selectable = await pool({
        readyCounts: { s1: 40, s2: 30, s3: 0, s4: 18, s5: 12 },
      }).listSelectableScopes(WORLD_ID);

      expect(selectable.map((scope) => scope.scopeId)).toEqual([
        's1',
        's2',
        's4',
      ]);
      // An archived Scope and an empty Scope are both unusable as a pool member.
      expect(selectable.map((scope) => scope.scopeId)).not.toContain('s5');
      expect(selectable.map((scope) => scope.scopeId)).not.toContain('s3');
    });

    it('accepts exactly four eligible Scopes', async () => {
      await expect(
        pool().assertSelectableScopes(WORLD_ID, ['s1', 's2', 's3', 's4']),
      ).resolves.toBeUndefined();
    });

    it('refuses any count other than four', async () => {
      for (const scopeIds of [
        ['s1'],
        ['s1', 's2', 's3'],
        ['s1', 's2', 's3', 's4', 's5'],
      ]) {
        await expect(
          pool().assertSelectableScopes(WORLD_ID, scopeIds),
        ).rejects.toMatchObject({
          response: { code: 'SCOPE_SELECTION_COUNT_INVALID' },
        });
      }
    });

    it('refuses a duplicate Scope', async () => {
      await expect(
        pool().assertSelectableScopes(WORLD_ID, ['s1', 's1', 's2', 's3']),
      ).rejects.toMatchObject({
        response: { code: 'SCOPE_SELECTION_DUPLICATED' },
      });
    });

    it('refuses a Scope from another World, an inactive one, or an empty one', async () => {
      // A Scope of another World never appears in this World's listing.
      await expect(
        pool().assertSelectableScopes(WORLD_ID, [
          's1',
          's2',
          's3',
          'other-world-scope',
        ]),
      ).rejects.toMatchObject({ response: { code: 'SCOPE_NOT_SELECTABLE' } });

      await expect(
        pool().assertSelectableScopes(WORLD_ID, ['s1', 's2', 's3', 's5']),
      ).rejects.toMatchObject({ response: { code: 'SCOPE_NOT_SELECTABLE' } });

      await expect(
        pool({
          readyCounts: { s1: 40, s2: 30, s3: 22, s4: 0 },
        }).assertSelectableScopes(WORLD_ID, ['s1', 's2', 's3', 's4']),
      ).rejects.toMatchObject({ response: { code: 'SCOPE_NOT_SELECTABLE' } });
    });
  });

  describe('playing ContentItems from the pool', () => {
    const selectedScopeIds = ['s1', 's2', 's3', 's4'];
    const items = [
      item('i1', 's1'),
      item('i2', 's2'),
      item('i3', 's4'),
      item('outside', 'unselected-scope'),
      item('draft', 's1', { status: ContentItemStatus.DRAFT }),
      item('other-mechanic', 's1', {
        compatibleChallengeTypeIds: ['type-top10'],
      }),
    ];

    const assert = (
      contentItemIds: string[],
      usedContentItemIds: string[] = [],
    ) =>
      pool({ items }).assertPlayableItems({
        occurrenceIndex: 0,
        worldId: WORLD_ID,
        contentItemIds,
        selectedScopeIds,
        challengeTypeId: 'type-ryo',
        usedContentItemIds,
      });

    it('accepts three RYO items drawn from three different selected Scopes', async () => {
      await expect(assert(['i1', 'i2', 'i3'])).resolves.toBeUndefined();
    });

    it('accepts one Top 10 item from the pool', async () => {
      await expect(assert(['i2'])).resolves.toBeUndefined();
    });

    it('refuses an item from a Scope that was not selected', async () => {
      await expect(assert(['i1', 'i2', 'outside'])).rejects.toMatchObject({
        response: { code: 'CONTENT_ITEM_OUTSIDE_SCOPE_POOL' },
      });
    });

    it('refuses an item this occurrence already played', async () => {
      await expect(assert(['i1', 'i2', 'i3'], ['i2'])).rejects.toMatchObject({
        response: { code: 'CONTENT_ITEM_ALREADY_PLAYED' },
      });
    });

    it('refuses the same item twice inside one challenge', async () => {
      await expect(assert(['i1', 'i1', 'i2'])).rejects.toMatchObject({
        response: { code: 'CONTENT_ITEM_DUPLICATED' },
      });
    });

    it('refuses an unready or incompatible item', async () => {
      await expect(assert(['draft'])).rejects.toMatchObject({
        response: { code: 'CONTENT_ITEM_NOT_READY' },
      });
      await expect(assert(['other-mechanic'])).rejects.toMatchObject({
        response: { code: 'CONTENT_ITEM_INCOMPATIBLE' },
      });
    });

    it('refuses an item that does not exist rather than skipping it', async () => {
      await expect(assert(['i1', 'missing', 'i2'])).rejects.toMatchObject({
        response: { code: 'CONTENT_ITEM_NOT_FOUND' },
      });
    });

    it('refuses an item belonging to another World than the occurrence', async () => {
      const foreign = pool({
        items: [item('foreign', 's1', { worldId: 'world-anime' })],
      });
      await expect(
        foreign.assertPlayableItems({
          occurrenceIndex: 1,
          worldId: WORLD_ID,
          contentItemIds: ['foreign'],
          selectedScopeIds,
          challengeTypeId: 'type-ryo',
          usedContentItemIds: [],
        }),
      ).rejects.toMatchObject({
        response: { code: 'CONTENT_ITEM_OUTSIDE_OCCURRENCE_WORLD' },
      });
    });
  });

  /**
   * The case a Match with a repeated World must survive: two occurrences share a
   * worldId and nothing else, so neither may reach the other's Scopes.
   */
  describe('isolating the pools of two occurrences of the same World', () => {
    const items = [item('anime-a', 's1'), item('football-a', 's3')];
    const play = (occurrenceIndex: number, ids: string[], pools: string[]) =>
      pool({ items }).assertPlayableItems({
        occurrenceIndex,
        worldId: WORLD_ID,
        contentItemIds: ids,
        selectedScopeIds: pools,
        challengeTypeId: 'type-ryo',
        usedContentItemIds: [],
      });

    it('accepts each occurrence playing only from its own four Scopes', async () => {
      await expect(
        play(0, ['anime-a'], ['s1', 's2', 's5', 's6']),
      ).resolves.toBeUndefined();
      await expect(
        play(2, ['football-a'], ['s3', 's4', 's7', 's8']),
      ).resolves.toBeUndefined();
    });

    it('refuses occurrence 2 playing content from occurrence 0 pool', async () => {
      await expect(
        play(2, ['anime-a'], ['s3', 's4', 's7', 's8']),
      ).rejects.toMatchObject({
        response: { code: 'CONTENT_ITEM_OUTSIDE_SCOPE_POOL' },
      });
      await expect(
        play(0, ['football-a'], ['s1', 's2', 's5', 's6']),
      ).rejects.toMatchObject({
        response: { code: 'CONTENT_ITEM_OUTSIDE_SCOPE_POOL' },
      });
    });
  });

  describe('validating one configured occurrence pool', () => {
    const board = ['type-ryo', 'type-top10', 'type-relational', 'type-coop'];
    const assertPool = (
      scopeIds: string[],
      options: Parameters<typeof pool>[0] = {},
    ) =>
      pool(options).assertOccurrencePool({
        occurrenceIndex: 1,
        worldId: WORLD_ID,
        scopeIds,
        boardChallengeTypeIds: board,
      });

    it('accepts four active in-World Scopes with ready content', async () => {
      await expect(
        assertPool(['s1', 's2', 's3', 's4']),
      ).resolves.toBeUndefined();
    });

    it('names the exact reason a Scope cannot join the pool', async () => {
      const scopes = [
        scope('s1', 'كأس العالم'),
        scope('s2', 'الدوري الإنجليزي'),
        scope('s3', 'الدوري السعودي'),
        scope('s4', 'أبطال أوروبا'),
        scope('archived', 'مؤرشف', { status: WorldContentStatus.ARCHIVED }),
        scope('foreign', 'عالم آخر', { worldId: 'world-anime' }),
        scope('empty', 'بلا محتوى'),
        scope('excluded', 'مستبعد', { excludedChallengeTypeIds: board }),
      ];
      const readyCounts = {
        s1: 4,
        s2: 4,
        s3: 4,
        s4: 4,
        archived: 4,
        foreign: 4,
        empty: 0,
        excluded: 4,
      };
      const cases: Array<[string, string]> = [
        ['missing', 'SCOPE_NOT_FOUND'],
        ['foreign', 'SCOPE_NOT_IN_OCCURRENCE_WORLD'],
        ['archived', 'SCOPE_NOT_ACTIVE'],
        ['empty', 'SCOPE_HAS_NO_READY_CONTENT'],
        ['excluded', 'SCOPE_HAS_NO_USABLE_SLOT'],
      ];
      for (const [scopeId, code] of cases) {
        await expect(
          assertPool(['s1', 's2', 's3', scopeId], { scopes, readyCounts }),
        ).rejects.toMatchObject({ response: { code } });
      }
    });

    it('keeps a repeated World on one pool per occurrence', async () => {
      // A World appearing at occurrences 0 and 2: same worldId, two disjoint
      // pools. The check is scoped to one occurrence's own four Scopes, so a
      // repeated World validates twice independently rather than collapsing into
      // a single world-level pool. (Which of the two pools a launch draws from is
      // decided by the setup, which names the occurrence.)
      const scopes = [
        scope('s1', 'كأس العالم'),
        scope('s2', 'الدوري الإنجليزي'),
        scope('s3', 'الدوري السعودي'),
        scope('s4', 'أبطال أوروبا'),
        scope('s5', 'أفلام الأنمي'),
        scope('s6', 'دراما'),
        scope('s7', 'ألعاب'),
        scope('s8', 'موسيقى'),
      ];
      const readyCounts = {
        s1: 4,
        s2: 4,
        s3: 4,
        s4: 4,
        s5: 4,
        s6: 4,
        s7: 4,
        s8: 4,
      };

      await expect(
        pool({ scopes, readyCounts }).assertOccurrencePool({
          occurrenceIndex: 0,
          worldId: WORLD_ID,
          scopeIds: ['s1', 's2', 's3', 's4'],
          boardChallengeTypeIds: board,
        }),
      ).resolves.toBeUndefined();
      await expect(
        pool({ scopes, readyCounts }).assertOccurrencePool({
          occurrenceIndex: 2,
          worldId: WORLD_ID,
          scopeIds: ['s5', 's6', 's7', 's8'],
          boardChallengeTypeIds: board,
        }),
      ).resolves.toBeUndefined();
    });
  });
});
