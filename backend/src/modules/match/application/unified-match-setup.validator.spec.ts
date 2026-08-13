import { ChallengeAnswerMode } from '../../world-content/domain/world-content.constants';
import {
  ChallengeFamily,
  ChallengeItemStructure,
  WorldChallengeSlotKey,
} from '../../world-content/domain/world-content.constants';
import { BoardSlot } from '../../world-content/domain/board-definition.policy';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import { ConfiguredWorldOccurrence } from '../domain/configured-world-occurrence';
import { MatchDomainError } from '../domain/match.errors';
import {
  UnifiedMatchBoardPolicy,
  unifiedMatchBoardPolicy,
} from '../domain/unified-match-board.policy';
import {
  UnifiedMatchSetupPolicy,
  unifiedMatchSetupPolicy,
} from '../domain/unified-match-setup.policy';
import { MatchContentPool } from './match-content-pool.service';
import { MatchWorldCatalog } from './match-world.catalog';
import { UnifiedMatchSetupValidator } from './unified-match-setup.validator';

const ANIME = 'world-anime';
const FOOTBALL = 'world-football';

const ANIME_POOL = ['naruto', 'bleach', 'one-piece', 'attack-on-titan'];
const ANIME_POOL_2 = ['death-note', 'jujutsu', 'demon-slayer', 'hxh'];
const FOOTBALL_POOL = ['world-cup', 'premier-league', 'saudi-league', 'ucl'];

const slot = (
  worldId: string,
  slotKey: WorldChallengeSlotKey,
  index: number,
): BoardSlot => ({
  slotKey,
  configurationId: `${worldId}-configuration-${index}`,
  challengeTypeId: `${worldId}-type-${index}`,
  challengeTypeSlug: `${worldId}-mechanic-${index}`,
  family: index === 1 ? ChallengeFamily.RYO : ChallengeFamily.SIGNATURE,
  displayName: `${worldId} ${slotKey}`,
  itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
  answerMode: ChallengeAnswerMode.RYO,
  scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
  sortOrder: index,
});

/** A World whose board has all four positions, in board order. */
const board = (worldId: string): BoardSlot[] =>
  [
    WorldChallengeSlotKey.SLOT_1,
    WorldChallengeSlotKey.SLOT_2,
    WorldChallengeSlotKey.SLOT_3,
    WorldChallengeSlotKey.SLOT_4,
  ].map((slotKey, index) => slot(worldId, slotKey, index));

const configuration = (): ConfiguredWorldOccurrence[] => [
  { occurrenceIndex: 0, worldId: ANIME, selectedScopeIds: [...ANIME_POOL] },
  {
    occurrenceIndex: 1,
    worldId: FOOTBALL,
    selectedScopeIds: [...FOOTBALL_POOL],
  },
  // The same World again, from four different Scopes.
  { occurrenceIndex: 2, worldId: ANIME, selectedScopeIds: [...ANIME_POOL_2] },
];

function validator(
  options: {
    /** Worlds that refuse to be scheduled, and the reason. */
    unschedulable?: Record<string, string>;
    boards?: Record<string, BoardSlot[]>;
    poolError?: MatchDomainError;
    setupPolicy?: UnifiedMatchSetupPolicy;
    onPoolCheck?: (input: {
      occurrenceIndex: number;
      worldId: string;
      scopeIds: string[];
      boardChallengeTypeIds: string[];
    }) => void;
  } = {},
) {
  const worlds = {
    scheduleFor: (worldId: string) => {
      const refusal = options.unschedulable?.[worldId];
      if (refusal) {
        return Promise.reject(new MatchDomainError(refusal, refusal));
      }
      const slots = options.boards?.[worldId] ?? board(worldId);
      return Promise.resolve({
        slotKeys: slots.map((entry) => entry.slotKey),
        slots,
      });
    },
  } as unknown as MatchWorldCatalog;
  const contentPool = {
    assertOccurrencePool: (input: {
      occurrenceIndex: number;
      worldId: string;
      scopeIds: string[];
      boardChallengeTypeIds: string[];
    }) => {
      options.onPoolCheck?.(input);
      return options.poolError
        ? Promise.reject(options.poolError)
        : Promise.resolve();
    },
  } as unknown as MatchContentPool;
  return new UnifiedMatchSetupValidator(
    worlds,
    contentPool,
    options.setupPolicy ?? unifiedMatchSetupPolicy,
    unifiedMatchBoardPolicy,
  );
}

describe('UnifiedMatchSetupValidator', () => {
  it('returns the three occurrences and twelve board positions', async () => {
    const setup = await validator().validate(configuration());

    expect(setup.occurrences.map((entry) => entry.occurrenceIndex)).toEqual([
      0, 1, 2,
    ]);
    expect(setup.boardPositions).toHaveLength(12);
    expect(
      setup.boardPositions.map(
        (position) => `${position.occurrenceIndex}#${position.slotKey}`,
      ),
    ).toEqual([
      '0#slot_1',
      '0#slot_2',
      '0#slot_3',
      '0#slot_4',
      '1#slot_1',
      '1#slot_2',
      '1#slot_3',
      '1#slot_4',
      '2#slot_1',
      '2#slot_2',
      '2#slot_3',
      '2#slot_4',
    ]);
  });

  it('gives a repeated World two independent sets of positions', async () => {
    const setup = await validator().validate(configuration());
    const anime = setup.boardPositions.filter(
      (position) => position.worldId === ANIME,
    );

    expect(anime).toHaveLength(8);
    expect(
      new Set(
        anime.map(
          (position) => `${position.occurrenceIndex}#${position.slotKey}`,
        ),
      ).size,
    ).toBe(8);
    // Same World, so the same mechanics — and still separate positions.
    expect(setup.boardPositions[1].challengeTypeId).toBe(
      setup.boardPositions[9].challengeTypeId,
    );
    expect(setup.boardPositions[1].occurrenceIndex).not.toBe(
      setup.boardPositions[9].occurrenceIndex,
    );
  });

  it('validates each occurrence pool against its own World and board', async () => {
    const checks: Array<{ occurrenceIndex: number; worldId: string }> = [];
    await validator({
      onPoolCheck: (input) => {
        checks.push({
          occurrenceIndex: input.occurrenceIndex,
          worldId: input.worldId,
        });
        // The pool is judged against the board of that occurrence's World.
        expect(input.boardChallengeTypeIds).toEqual(
          board(input.worldId).map((entry) => entry.challengeTypeId),
        );
      },
    }).validate(configuration());

    expect(checks).toEqual([
      { occurrenceIndex: 0, worldId: ANIME },
      { occurrenceIndex: 1, worldId: FOOTBALL },
      { occurrenceIndex: 2, worldId: ANIME },
    ]);
  });

  it('passes each occurrence its own Scope pool, never its twin', async () => {
    const pools: string[][] = [];
    await validator({
      onPoolCheck: (input) => pools.push(input.scopeIds),
    }).validate(configuration());

    expect(pools).toEqual([ANIME_POOL, FOOTBALL_POOL, ANIME_POOL_2]);
  });

  it('refuses a World that is not active or whose board is not ready', async () => {
    for (const code of [
      'MATCH_WORLD_NOT_ACTIVE',
      'MATCH_WORLD_BOARD_NOT_READY',
      'MATCH_WORLD_NOT_FOUND',
    ]) {
      await expect(
        validator({ unschedulable: { [FOOTBALL]: code } }).validate(
          configuration(),
        ),
      ).rejects.toMatchObject({ response: { code } });
    }
  });

  it('refuses a World whose board is not four complete positions', async () => {
    await expect(
      validator({
        boards: { [FOOTBALL]: board(FOOTBALL).slice(0, 3) },
      }).validate(configuration()),
    ).rejects.toMatchObject({
      response: { code: 'UNIFIED_BOARD_SLOT_COUNT_INVALID' },
    });
    const duplicated = [
      ...board(FOOTBALL).slice(0, 3),
      slot(FOOTBALL, WorldChallengeSlotKey.SLOT_1, 3),
    ];
    await expect(
      validator({ boards: { [FOOTBALL]: duplicated } }).validate(
        configuration(),
      ),
    ).rejects.toMatchObject({
      response: { code: 'UNIFIED_BOARD_SLOT_MISSING' },
    });
  });

  it('surfaces the Scope failure the content pool reports', async () => {
    await expect(
      validator({
        poolError: new MatchDomainError('SCOPE_NOT_ACTIVE', 'archived'),
      }).validate(configuration()),
    ).rejects.toMatchObject({ response: { code: 'SCOPE_NOT_ACTIVE' } });
  });

  it('checks the structural contract before it touches World Content', async () => {
    const checks: number[] = [];
    const broken = configuration();
    broken[0].selectedScopeIds = ANIME_POOL.slice(0, 3);

    await expect(
      validator({
        onPoolCheck: (input) => checks.push(input.occurrenceIndex),
      }).validate(broken),
    ).rejects.toMatchObject({
      response: { code: 'SCOPE_SELECTION_COUNT_INVALID' },
    });
    expect(checks).toEqual([]);
  });

  it('honours a repetition policy that forbids repeated Worlds', async () => {
    await expect(
      validator({
        setupPolicy: new UnifiedMatchSetupPolicy({
          allowRepeatedWorlds: false,
        }),
      }).validate(configuration()),
    ).rejects.toMatchObject({ response: { code: 'UNIFIED_WORLD_REPEATED' } });
  });

  it('shares one board policy instance with the aggregate', () => {
    // The aggregate is not a provider, so a second instance could drift from it.
    expect(unifiedMatchBoardPolicy).toBeInstanceOf(UnifiedMatchBoardPolicy);
    expect(unifiedMatchSetupPolicy).toBeInstanceOf(UnifiedMatchSetupPolicy);
  });
});
