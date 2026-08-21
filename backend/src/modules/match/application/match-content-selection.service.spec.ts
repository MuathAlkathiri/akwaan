import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ChallengeAnswerMode } from '../../world-content/domain/world-content.constants';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { MatchChallengeLaunchRequirements } from './challenge-launcher.registry';
import { MatchContentSelector } from './match-content-selection.service';
import {
  ContentExposureService,
  MatchContentExhaustedError,
} from './content-exposure.service';

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
  // No account history in these tests: exposure is covered by its own suites, and
  // a pass-through keeps every assertion here about the draw itself.
  return {
    selector: new MatchContentSelector(repository, {
      selectable: (_scope: unknown, ids: string[]) => Promise.resolve(ids),
      reserve: (_scope: unknown, ids: string[]) =>
        Promise.resolve({ claimed: ids, lost: [] }),
      recordPresented: () => Promise.resolve(0),
      releaseUnseen: () => Promise.resolve(0),
    } as unknown as ContentExposureService),
    queries,
  };
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

  describe('selectionStrata', () => {
    const STAGE_SCOPES = ['s0', 's1', 's2', 's3'];

    const stagedItem = (id: string, scopeId: string, stage: number) =>
      item(id, scopeId, {
        answerPayload: { mode: ChallengeAnswerMode.MATCH },
        mechanicPayload: { comboStage: stage },
      });

    const stagedLibrary = (copies = 3) =>
      STAGE_SCOPES.flatMap((scopeId) =>
        [1, 2, 3, 4].flatMap((stage) =>
          Array.from({ length: copies }, (_, copy) =>
            stagedItem(`${scopeId}-${stage}-${copy}`, scopeId, stage),
          ),
        ),
      );

    const STRATA_REQUIREMENTS: MatchChallengeLaunchRequirements = {
      contentItemCount: 8,
      requiresPhones: true,
      isPlayableItem: (candidate) =>
        candidate.answerMode === ChallengeAnswerMode.MATCH,
      selectionStrata: {
        stratumOf: (candidate) => candidate.comboStage,
        strata: [1, 2, 3, 4],
        perStratum: 2,
      },
    };

    const selectStrata = (
      items: FakeItem[],
      overrides: {
        occurrenceIndex?: number;
        selectedScopeIds?: string[];
        slotKey?: WorldChallengeSlotKey;
        matchId?: string;
        usedContentItemIds?: string[];
        requirements?: MatchChallengeLaunchRequirements;
      } = {},
    ) =>
      select(items, {
        selectedScopeIds: STAGE_SCOPES,
        requirements: STRATA_REQUIREMENTS,
        ...overrides,
      });

    it('returns exactly the requested count from each stratum', async () => {
      const { result } = selectStrata(stagedLibrary());
      const selected = await result;

      expect(selected).toHaveLength(8);
      const byStage = new Map<number, string[]>();
      for (const id of selected) {
        const stage = Number(id.split('-')[1]);
        byStage.set(stage, [...(byStage.get(stage) ?? []), id]);
      }
      for (const stage of [1, 2, 3, 4]) {
        expect(byStage.get(stage)).toHaveLength(2);
      }
    });

    it('is deterministic for the same seed, input and strata definition', async () => {
      const first = await selectStrata(stagedLibrary()).result;
      const again = await selectStrata(stagedLibrary()).result;

      expect(again).toEqual(first);
    });

    it('spreads across Scopes within each stratum when enough exist', async () => {
      const selected = await selectStrata(stagedLibrary()).result;

      for (const stage of [1, 2, 3, 4]) {
        const atStage = selected.filter(
          (id) => Number(id.split('-')[1]) === stage,
        );
        const scopes = atStage.map((id) => id.split('-')[0]);
        expect(new Set(scopes).size).toBe(atStage.length);
      }
    });

    it('fails cleanly when a stratum lacks enough items, without borrowing', async () => {
      const items = stagedLibrary().filter(
        (candidate) => !/\-4\-/.test(candidate._id),
      );
      await expect(selectStrata(items).result).rejects.toMatchObject({
        response: { code: 'MATCH_INSUFFICIENT_PLAYABLE_CONTENT' },
      });
      const pool2 = STAGE_SCOPES.slice(0, 2);
      const shortItems = [
        ...pool2.flatMap((scopeId) =>
          [1, 2, 3].flatMap((stage) =>
            Array.from({ length: 3 }, (_, copy) =>
              stagedItem(`${scopeId}-${stage}-${copy}`, scopeId, stage),
            ),
          ),
        ),
        stagedItem('s0-4-0', 's0', 4),
      ];
      await expect(
        selectStrata(shortItems, { selectedScopeIds: pool2 }).result,
      ).rejects.toMatchObject({
        response: { code: 'MATCH_INSUFFICIENT_PLAYABLE_CONTENT' },
      });
    });

    it('names the starved stratum in the shortage error', async () => {
      const items = stagedLibrary().filter(
        (candidate) => !/\-4\-/.test(candidate._id),
      );
      await expect(selectStrata(items).result).rejects.toMatchObject({
        response: {
          message: expect.stringContaining('stage 4'),
        },
      });
    });

    it('never selects the same item twice across strata', async () => {
      const selected = await selectStrata(stagedLibrary()).result;

      expect(new Set(selected).size).toBe(selected.length);
    });

    describe('backward compatibility — non-stratified path is unchanged', () => {
      it('ignores comboStage and draws the declared count when selectionStrata is absent', async () => {
        const nonStratified: MatchChallengeLaunchRequirements = {
          contentItemCount: 3,
          requiresPhones: true,
          isPlayableItem: (candidate) =>
            candidate.answerMode === ChallengeAnswerMode.MATCH,
        };
        const items = stagedLibrary();
        const selected = await select(items, {
          selectedScopeIds: STAGE_SCOPES,
          requirements: nonStratified,
        }).result;

        expect(selected).toHaveLength(3);
        expect(new Set(selected).size).toBe(3);
        for (const id of selected) {
          expect(STAGE_SCOPES.some((s) => id.startsWith(s))).toBe(true);
        }
      });

      it('produces the same result as before selectionStrata existed for identical input', async () => {
        const nonStratified: MatchChallengeLaunchRequirements = {
          contentItemCount: 3,
          requiresPhones: true,
          isPlayableItem: (candidate) =>
            candidate.answerMode === ChallengeAnswerMode.MATCH,
        };
        const items = STAGE_SCOPES.flatMap((scopeId) => [
          stagedItem(`${scopeId}-1-0`, scopeId, 1),
          stagedItem(`${scopeId}-2-0`, scopeId, 2),
        ]);
        const withStageFields = await select(items, {
          selectedScopeIds: STAGE_SCOPES,
          requirements: nonStratified,
        }).result;
        const withoutStageFields = await select(
          items.map((entry) => ({
            ...entry,
            mechanicPayload: undefined,
          })),
          {
            selectedScopeIds: STAGE_SCOPES,
            requirements: nonStratified,
          },
        ).result;

        expect(withStageFields).toEqual(withoutStageFields);
      });
    });
  });
});

describe('content already seen by the account', () => {
  const SIX = Array.from({ length: 6 }, (_, index) =>
    item(`i${index + 1}`, 'scope-1'),
  );

  /** The same fake repository, with a ledger that reports `seen` as spent. */
  const withHistory = (items: FakeItem[], seen: string[]) => {
    const repository = {
      listPlayableForOccurrence: () => Promise.resolve(items),
    } as unknown as ContentItemRepository;
    return new MatchContentSelector(repository, {
      selectable: (_scope: unknown, ids: string[]) =>
        Promise.resolve(ids.filter((id) => !seen.includes(id))),
    } as unknown as ContentExposureService);
  };

  const draw = (target: MatchContentSelector) =>
    target.select({
      matchId: 'match-1',
      occurrenceIndex: 0,
      worldId: ANIME,
      selectedScopeIds: ['scope-1'],
      slotKey: WorldChallengeSlotKey.SLOT_1,
      challengeTypeId: 'type-ryo',
      requirements: RYO_REQUIREMENTS,
      usedContentItemIds: [],
      exposureScope: {
        ownerAccountId: 'account-a',
        challengeTypeKey: 'read-your-opponent',
        matchId: 'match-1',
      },
      now: new Date('2026-08-20T10:00:00.000Z'),
    });

  it('never draws an item this account has already been shown', async () => {
    const selected = await draw(withHistory(SIX, ['i1', 'i2']));
    expect(selected).not.toContain('i1');
    expect(selected).not.toContain('i2');
    expect(selected).toHaveLength(RYO_REQUIREMENTS.contentItemCount);
  });

  it('refuses rather than silently repeating when the account has seen the rest', async () => {
    // Six eligible, four seen, three needed. Topping the draw back up with seen
    // content is the one thing that must never happen.
    const error = await draw(withHistory(SIX, ['i1', 'i2', 'i3', 'i4'])).catch(
      (cause: MatchContentExhaustedError) => cause,
    );

    expect(error).toBeInstanceOf(MatchContentExhaustedError);
    const exhausted = error as MatchContentExhaustedError;
    // The code travels in the response body, as every Match error does.
    expect(exhausted.getResponse()).toMatchObject({
      code: 'MATCH_CONTENT_EXHAUSTED_FOR_ACCOUNT',
    });
    // Machine-readable, so a future product surface can act on it.
    expect(exhausted.details).toEqual({
      challengeTypeKey: 'read-your-opponent',
      required: 3,
      unseenAvailable: 2,
      alreadySeen: 4,
    });
  });

  it('still reports a plain shortage when the catalog itself is too small', async () => {
    // Nothing seen: a content problem, not an account problem, and the two must
    // stay distinguishable.
    const error = await draw(withHistory([item('i1', 'scope-1')], [])).catch(
      (cause: MatchContentExhaustedError) => cause,
    );
    expect(error).not.toBeInstanceOf(MatchContentExhaustedError);
    expect((error as MatchContentExhaustedError).getResponse()).toMatchObject({
      code: 'MATCH_INSUFFICIENT_PLAYABLE_CONTENT',
    });
  });

  it('applies no history at all when no owner could be resolved', async () => {
    // A Match with no resolvable session must still be able to draw.
    const target = withHistory(SIX, ['i1', 'i2', 'i3', 'i4', 'i5', 'i6']);
    await expect(
      target.select({
        matchId: 'match-1',
        occurrenceIndex: 0,
        worldId: ANIME,
        selectedScopeIds: ['scope-1'],
        slotKey: WorldChallengeSlotKey.SLOT_1,
        challengeTypeId: 'type-ryo',
        requirements: RYO_REQUIREMENTS,
        usedContentItemIds: [],
      }),
    ).resolves.toHaveLength(3);
  });
});
