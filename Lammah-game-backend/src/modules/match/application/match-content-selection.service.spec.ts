import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ChallengeAnswerMode } from '../../world-content/domain/world-content.constants';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { MatchChallengeLaunchRequirements } from './challenge-launcher.registry';
import { MatchContentSelector } from './match-content-selection.service';

const ANIME = 'world-anime';
const MATCH_ID = 'match-1';
const RYO_TYPE = 'type-ryo';

interface FakeItem {
  _id: string;
  worldId: string;
  scopeId: string;
  answerPayload: { mode: string };
  mechanicPayload?: Record<string, unknown>;
}

const item = (
  id: string,
  scopeId: string,
  overrides: Partial<FakeItem> = {},
): FakeItem => ({
  _id: id,
  worldId: ANIME,
  scopeId,
  answerPayload: { mode: ChallengeAnswerMode.MULTIPLE_CHOICE },
  ...overrides,
});

/**
 * Behaves like the real query: only ready items of this World, in these Scopes,
 * compatible with this mechanic, ever reach the selector.
 */
function selector(items: FakeItem[]) {
  const queries: Array<{
    worldId: string;
    scopeIds: string[];
    challengeTypeId: string;
  }> = [];
  const repository = {
    listPlayableForOccurrence: (query: {
      worldId: string;
      scopeIds: string[];
      challengeTypeId: string;
    }) => {
      queries.push(query);
      return Promise.resolve(
        items.filter(
          (candidate) =>
            candidate.worldId === query.worldId &&
            query.scopeIds.includes(candidate.scopeId),
        ),
      );
    },
  } as unknown as ContentItemRepository;
  return { selector: new MatchContentSelector(repository), queries };
}

const RYO_REQUIREMENTS: MatchChallengeLaunchRequirements = {
  contentItemCount: 3,
  requiresPhones: true,
  isPlayableItem: (candidate) =>
    candidate.answerMode === ChallengeAnswerMode.MULTIPLE_CHOICE ||
    candidate.answerMode === ChallengeAnswerMode.CLOSEST,
};

const POOL_0 = ['s0', 's1', 's2', 's3'];
const POOL_2 = ['s4', 's5', 's6', 's7'];

/** Two items in each of eight Scopes: four for occurrence 0, four for occurrence 2. */
const library = () =>
  [...POOL_0, ...POOL_2].flatMap((scopeId) => [
    item(`${scopeId}-a`, scopeId),
    item(`${scopeId}-b`, scopeId),
  ]);

const select = (
  items: FakeItem[],
  overrides: {
    occurrenceIndex?: number;
    selectedScopeIds?: string[];
    slotKey?: WorldChallengeSlotKey;
    requirements?: MatchChallengeLaunchRequirements;
    usedContentItemIds?: string[];
    matchId?: string;
  } = {},
) => {
  const context = selector(items);
  return {
    ...context,
    result: context.selector.select({
      matchId: overrides.matchId ?? MATCH_ID,
      occurrenceIndex: overrides.occurrenceIndex ?? 0,
      worldId: ANIME,
      selectedScopeIds: overrides.selectedScopeIds ?? POOL_0,
      slotKey: overrides.slotKey ?? WorldChallengeSlotKey.SLOT_2,
      challengeTypeId: RYO_TYPE,
      requirements: overrides.requirements ?? RYO_REQUIREMENTS,
      usedContentItemIds: overrides.usedContentItemIds ?? [],
    }),
  };
};

describe('MatchContentSelector', () => {
  it('draws exactly the count the mechanic declares', async () => {
    for (const contentItemCount of [1, 2, 3]) {
      const { result } = select(library(), {
        requirements: { ...RYO_REQUIREMENTS, contentItemCount },
      });
      const selected = await result;
      expect(selected).toHaveLength(contentItemCount);
      expect(new Set(selected).size).toBe(contentItemCount);
    }
  });

  it('asks World Content only for this occurrence World, Scopes and mechanic', async () => {
    const { queries, result } = select(library(), {
      occurrenceIndex: 2,
      selectedScopeIds: POOL_2,
    });
    await result;

    expect(queries).toEqual([
      { worldId: ANIME, scopeIds: POOL_2, challengeTypeId: RYO_TYPE },
    ]);
  });

  it('draws only from the occurrence Scope pool it was given', async () => {
    const selected = await select(library(), {
      occurrenceIndex: 2,
      selectedScopeIds: POOL_2,
    }).result;

    expect(selected).toHaveLength(3);
    for (const id of selected) {
      expect(POOL_2.some((scopeId) => id.startsWith(scopeId))).toBe(true);
      expect(POOL_0.some((scopeId) => id.startsWith(scopeId))).toBe(false);
    }
  });

  /** The case a repeated World must survive: same worldId, different pools. */
  it('keeps two occurrences of one World on their own pools', async () => {
    const first = await select(library(), {
      occurrenceIndex: 0,
      selectedScopeIds: POOL_0,
    }).result;
    const repeated = await select(library(), {
      occurrenceIndex: 2,
      selectedScopeIds: POOL_2,
    }).result;

    expect(first.some((id) => repeated.includes(id))).toBe(false);
    expect(first.every((id) => POOL_0.some((s) => id.startsWith(s)))).toBe(
      true,
    );
    expect(repeated.every((id) => POOL_2.some((s) => id.startsWith(s)))).toBe(
      true,
    );
  });

  it('spreads the draw across different Scopes rather than draining one', async () => {
    const selected = await select(library()).result;
    const scopes = selected.map((id) => id.split('-')[0]);

    expect(new Set(scopes).size).toBe(3);
  });

  it('never replays content this occurrence already used', async () => {
    const items = library().filter((candidate) =>
      ['s0', 's1'].includes(candidate.scopeId),
    );
    const used = ['s0-a', 's1-a'];
    const selected = await select(items, {
      selectedScopeIds: POOL_0,
      usedContentItemIds: used,
      requirements: { ...RYO_REQUIREMENTS, contentItemCount: 2 },
    }).result;

    expect(selected.sort()).toEqual(['s0-b', 's1-b']);
    expect(selected.some((id) => used.includes(id))).toBe(false);
  });

  it('refuses an item the mechanic itself would refuse', async () => {
    const items = [
      // Compatible and ready, but not machine-checkable, so RYO cannot play it.
      ...POOL_0.map((scopeId) =>
        item(`${scopeId}-open`, scopeId, {
          answerPayload: { mode: ChallengeAnswerMode.MATCH },
        }),
      ),
      item('s0-ok', 's0'),
      item('s1-ok', 's1'),
      item('s2-ok', 's2'),
    ];
    const selected = await select(items).result;

    expect(selected.sort()).toEqual(['s0-ok', 's1-ok', 's2-ok']);
  });

  it('honours a payload contract beyond the answer mode', async () => {
    const requirements: MatchChallengeLaunchRequirements = {
      contentItemCount: 1,
      requiresPhones: true,
      isPlayableItem: (candidate) =>
        candidate.mechanicVariant === 'poison-deck' &&
        candidate.authorSafetyConfirmation === true,
    };
    const items = [
      item('wrong-variant', 's0', {
        mechanicPayload: { variant: 'other', authorSafetyConfirmation: true },
      }),
      item('unconfirmed', 's1', {
        mechanicPayload: {
          variant: 'poison-deck',
          authorSafetyConfirmation: false,
        },
      }),
      item('usable', 's2', {
        mechanicPayload: {
          variant: 'poison-deck',
          authorSafetyConfirmation: true,
        },
      }),
    ];

    expect(await select(items, { requirements }).result).toEqual(['usable']);
  });

  describe('determinism', () => {
    it('draws the same set for the same Match and position', async () => {
      const first = await select(library()).result;
      const again = await select(library()).result;

      expect(again).toEqual(first);
    });

    it('draws a different set for a different position of the same Match', async () => {
      const slotTwo = await select(library()).result;
      const slotThree = await select(library(), {
        slotKey: WorldChallengeSlotKey.SLOT_3,
      }).result;

      // Not a guarantee of disjointness, but the two positions must not be
      // pinned to the same draw.
      expect(slotThree).not.toEqual(slotTwo);
    });

    it('draws a different set for a different Match at the same position', async () => {
      const one = await select(library()).result;
      const other = await select(library(), { matchId: 'match-2' }).result;

      expect(other).not.toEqual(one);
    });
  });

  describe('insufficient content', () => {
    const expectRefusal = async (
      items: FakeItem[],
      overrides: Parameters<typeof select>[1] = {},
    ) => {
      await expect(select(items, overrides).result).rejects.toMatchObject({
        response: { code: 'MATCH_INSUFFICIENT_PLAYABLE_CONTENT' },
      });
    };

    it('refuses rather than launching with too little content', async () => {
      await expectRefusal([item('s0-a', 's0'), item('s1-a', 's1')]);
    });

    it('counts only items this occurrence can still play', async () => {
      const items = [
        item('s0-a', 's0'),
        item('s1-a', 's1'),
        item('s2-a', 's2'),
      ];
      // Enough on paper, but one is already played.
      await expectRefusal(items, { usedContentItemIds: ['s2-a'] });
      await expect(select(items).result).resolves.toHaveLength(3);
    });

    it('names the occurrence that ran short', async () => {
      await expect(
        select([item('s4-a', 's4')], {
          occurrenceIndex: 2,
          selectedScopeIds: POOL_2,
        }).result,
      ).rejects.toMatchObject({
        response: {
          message: expect.stringContaining('occurrence 2'),
        },
      });
    });
  });
});
