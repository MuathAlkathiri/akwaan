import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { ScoringService } from '../../scoring/application/scoring.service';
import { ScoreEvent } from '../../scoring/domain/score-event';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { ConfiguredWorldOccurrence } from './configured-world-occurrence';
import { Match } from './match';
import { MatchBoardPositionKey } from './match-board-position-key';
import {
  MATCH_SLOT_ORDER,
  MATCH_UNIFIED_BOARD_POSITION_COUNT,
  MatchSetupMode,
  MatchSlotLaunchability,
  MatchSlotStatus,
  MatchStage,
  MatchStatus,
  WorldSelectionMethod,
} from './match.constants';
import { MatchDomainError } from './match.errors';
import {
  MatchBoardPositionConfiguration,
  unifiedMatchBoardPolicy,
} from './unified-match-board.policy';

const TEAM_A = { id: 'team-a', name: 'الفريق الأول' };
const TEAM_B = { id: 'team-b', name: 'الفريق الثاني' };
const NOW = new Date('2026-08-01T18:00:00.000Z');

const ANIME = 'world-anime';
const FOOTBALL = 'world-football';

const ANIME_POOL = ['naruto', 'bleach', 'one-piece', 'attack-on-titan'];
const ANIME_POOL_2 = ['death-note', 'jujutsu', 'demon-slayer', 'hxh'];
const FOOTBALL_POOL = ['world-cup', 'premier-league', 'saudi-league', 'ucl'];

const scoring = new ScoringService(new ScoringRuleRegistry());

function events(
  runtimeId: string,
  teamId: string,
  delta: number,
): ScoreEvent[] {
  return scoring.restoreEvents([
    {
      id: `${runtimeId}-event`,
      matchId: 'live-session-1',
      teamId,
      challengeSessionId: runtimeId,
      scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      delta,
      reason: 'ryo.trust.correct',
      createdAt: NOW.toISOString(),
    },
  ]);
}

/** The example configuration from the product contract: Anime, Football, Anime. */
const configuration = (): ConfiguredWorldOccurrence[] => [
  { occurrenceIndex: 0, worldId: ANIME, selectedScopeIds: [...ANIME_POOL] },
  {
    occurrenceIndex: 1,
    worldId: FOOTBALL,
    selectedScopeIds: [...FOOTBALL_POOL],
  },
  { occurrenceIndex: 2, worldId: ANIME, selectedScopeIds: [...ANIME_POOL_2] },
];

/** Four distinct mechanics per World, as a valid board requires. */
const boardPositions = (
  occurrences: ConfiguredWorldOccurrence[] = configuration(),
): MatchBoardPositionConfiguration[] =>
  occurrences.flatMap((occurrence) =>
    MATCH_SLOT_ORDER.map((slotKey, index) => ({
      occurrenceIndex: occurrence.occurrenceIndex,
      worldId: occurrence.worldId,
      slotKey,
      challengeTypeId: `${occurrence.worldId}-type-${index}`,
      challengeTypeSlug:
        index === 1 ? 'read-your-opponent' : `mechanic-${index}`,
      displayName: `${occurrence.worldId} ${slotKey}`,
    })),
  );

function unifiedMatch(
  overrides: {
    occurrences?: ConfiguredWorldOccurrence[];
    boardPositions?: MatchBoardPositionConfiguration[];
    winnerTeamId?: string;
  } = {},
): Match {
  const occurrences = overrides.occurrences ?? configuration();
  return Match.createUnified({
    liveSessionId: 'live-session-1',
    teams: [TEAM_A, TEAM_B],
    occurrences,
    boardPositions: overrides.boardPositions ?? boardPositions(occurrences),
    coinToss: {
      winnerTeamId: overrides.winnerTeamId ?? TEAM_A.id,
      roll: 0,
      resolvedAt: NOW,
    },
    now: NOW,
  });
}

const key = (occurrenceIndex: number, slotKey: WorldChallengeSlotKey) =>
  MatchBoardPositionKey.of(occurrenceIndex, slotKey).value;

/** Launches one position and lets its runtime report completion. */
function play(
  match: Match,
  occurrenceIndex: number,
  slotKey: WorldChallengeSlotKey,
  options: { delta?: number; teamId?: string } = {},
): string {
  const runtimeId = `runtime-${key(occurrenceIndex, slotKey)}`;
  match.launchChallenge({
    commandId: `launch-${runtimeId}`,
    now: NOW,
    occurrenceIndex,
    slotKey,
    challengeKey: 'read-your-opponent',
    runtimeId,
    contentItemIds: [`${runtimeId}-a`],
    launchability: MatchSlotLaunchability.LAUNCHABLE,
  });
  match.completeChallenge({
    commandId: `complete-${runtimeId}`,
    now: NOW,
    runtimeId,
    events: events(runtimeId, options.teamId ?? TEAM_A.id, options.delta ?? 1),
  });
  return runtimeId;
}

describe('unified preconfigured Match', () => {
  describe('creation', () => {
    it('opens directly on the board as an active Match', () => {
      const match = unifiedMatch();
      expect(match.setupMode).toBe(MatchSetupMode.UNIFIED_PRECONFIGURED);
      // The marker that once distinguished the two setup modes no longer exists.
      expect(
        (match as unknown as { isUnified?: unknown }).isUnified,
      ).toBeUndefined();
      expect(match.stage).toBe(MatchStage.BOARD);
      expect(match.status).toBe(MatchStatus.ACTIVE);
      expect(match.revision).toBe(0);
    });

    it('carries no sequential command surface at all', () => {
      const match = unifiedMatch();
      // The toss is settled, so the result can be shown; no command produced it.
      expect(match.coinToss).toMatchObject({ winnerTeamId: TEAM_A.id });
      for (const method of [
        'start',
        'resolveCoinToss',
        'nextSelectionTurn',
        'selectWorld',
        'selectScopes',
        'advanceToNextWorld',
      ]) {
        expect(
          (match as unknown as Record<string, unknown>)[method],
        ).toBeUndefined();
      }
      expect(match.stage).toBe(MatchStage.BOARD);
      expect(match.revision).toBe(0);
    });

    it('records the three occurrences with their own four Scopes', () => {
      const match = unifiedMatch();
      expect(match.occurrences.map((entry) => entry.worldId)).toEqual([
        ANIME,
        FOOTBALL,
        ANIME,
      ]);
      expect(match.selectedScopeIds(0)).toEqual(ANIME_POOL);
      expect(match.selectedScopeIds(1)).toEqual(FOOTBALL_POOL);
      expect(match.selectedScopeIds(2)).toEqual(ANIME_POOL_2);
      expect(
        match.occurrences.every((entry) => entry.selectedScopeIds.length === 4),
      ).toBe(true);
      expect(match.selections.map((entry) => entry.method)).toEqual([
        WorldSelectionMethod.PRECONFIGURED,
        WorldSelectionMethod.PRECONFIGURED,
        WorldSelectionMethod.PRECONFIGURED,
      ]);
    });

    it('has no current occurrence at all', () => {
      // Nothing may derive selection authority from a sequence position.
      expect(
        (unifiedMatch() as unknown as Record<string, unknown>)
          .currentOccurrenceIndex,
      ).toBeUndefined();
    });

    it('hands the first selection to the coin toss winner', () => {
      expect(unifiedMatch({ winnerTeamId: TEAM_B.id }).selectingTeamId).toBe(
        TEAM_B.id,
      );
    });

    it('refuses a coin toss winner who is not playing', () => {
      expect(() => unifiedMatch({ winnerTeamId: 'stranger' })).toThrow(
        MatchDomainError,
      );
    });

    it('refuses a configuration the setup policy rejects', () => {
      const broken = configuration();
      broken[0].selectedScopeIds = ANIME_POOL.slice(0, 3);
      expect(() => unifiedMatch({ occurrences: broken })).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'SCOPE_SELECTION_COUNT_INVALID',
          }),
        }),
      );
    });

    it('refuses a board that is not twelve complete positions', () => {
      expect(() =>
        unifiedMatch({ boardPositions: boardPositions().slice(0, 11) }),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'UNIFIED_BOARD_POSITION_COUNT_INVALID',
          }),
        }),
      );
      // Twelve positions, but one occurrence is missing a slot and another has two.
      const lopsided = boardPositions();
      lopsided[11] = { ...lopsided[0], occurrenceIndex: 2, worldId: ANIME };
      expect(() => unifiedMatch({ boardPositions: lopsided })).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'UNIFIED_BOARD_POSITION_MISSING',
          }),
        }),
      );
    });
  });

  describe('the twelve-position board', () => {
    it('initialises exactly twelve available positions', () => {
      const board = unifiedMatch().unifiedBoard();
      expect(board).toHaveLength(MATCH_UNIFIED_BOARD_POSITION_COUNT);
      expect(board).toHaveLength(12);
      expect(
        board.every(
          (position) => position.status === MatchSlotStatus.AVAILABLE,
        ),
      ).toBe(true);
      expect(unifiedMatchBoardPolicy.completedCount(board)).toBe(0);
      expect(unifiedMatchBoardPolicy.isComplete(board)).toBe(false);
    });

    it('keys every position by occurrence index and slot key', () => {
      const board = unifiedMatch().unifiedBoard();
      expect(board.map((position) => position.positionKey)).toEqual([
        key(0, WorldChallengeSlotKey.SLOT_1),
        key(0, WorldChallengeSlotKey.SLOT_2),
        key(0, WorldChallengeSlotKey.SLOT_3),
        key(0, WorldChallengeSlotKey.SLOT_4),
        key(1, WorldChallengeSlotKey.SLOT_1),
        key(1, WorldChallengeSlotKey.SLOT_2),
        key(1, WorldChallengeSlotKey.SLOT_3),
        key(1, WorldChallengeSlotKey.SLOT_4),
        key(2, WorldChallengeSlotKey.SLOT_1),
        key(2, WorldChallengeSlotKey.SLOT_2),
        key(2, WorldChallengeSlotKey.SLOT_3),
        key(2, WorldChallengeSlotKey.SLOT_4),
      ]);
      expect(new Set(board.map((position) => position.positionKey)).size).toBe(
        12,
      );
    });

    it('gives a repeated World two distinct sets of positions', () => {
      const board = unifiedMatch().unifiedBoard();
      const anime = board.filter((position) => position.worldId === ANIME);
      expect(anime).toHaveLength(8);
      // Same worldId, same slot keys, and still eight separate positions.
      expect(new Set(anime.map((position) => position.positionKey)).size).toBe(
        8,
      );
      const first = board.find(
        (position) =>
          position.positionKey === key(0, WorldChallengeSlotKey.SLOT_2),
      );
      const repeated = board.find(
        (position) =>
          position.positionKey === key(2, WorldChallengeSlotKey.SLOT_2),
      );
      expect(first!.worldId).toBe(repeated!.worldId);
      expect(first!.selectedScopeIds).toEqual(ANIME_POOL);
      expect(repeated!.selectedScopeIds).toEqual(ANIME_POOL_2);
      expect(first!.selectedScopeIds).not.toEqual(repeated!.selectedScopeIds);
    });

    it('carries each position mechanic and its own Scope pool', () => {
      const position = unifiedMatch()
        .unifiedBoard()
        .find(
          (candidate) =>
            candidate.positionKey === key(1, WorldChallengeSlotKey.SLOT_3),
        );
      expect(position).toMatchObject({
        occurrenceIndex: 1,
        worldId: FOOTBALL,
        slotKey: WorldChallengeSlotKey.SLOT_3,
        challengeTypeId: `${FOOTBALL}-type-2`,
        challengeTypeSlug: 'mechanic-2',
      });
      expect(position!.selectedScopeIds).toEqual(FOOTBALL_POOL);
    });
  });

  describe('free selection across occurrences', () => {
    it('launches any available position of any occurrence, in any order', () => {
      const match = unifiedMatch();
      // Occurrence 2 before occurrence 0: no occurrence gates another.
      play(match, 2, WorldChallengeSlotKey.SLOT_3);
      play(match, 0, WorldChallengeSlotKey.SLOT_1);
      play(match, 1, WorldChallengeSlotKey.SLOT_4);
      play(match, 2, WorldChallengeSlotKey.SLOT_1);

      const completed = match
        .unifiedBoard()
        .filter((position) => position.status === MatchSlotStatus.COMPLETED)
        .map((position) => position.positionKey);
      expect(completed).toEqual([
        key(0, WorldChallengeSlotKey.SLOT_1),
        key(1, WorldChallengeSlotKey.SLOT_4),
        key(2, WorldChallengeSlotKey.SLOT_1),
        key(2, WorldChallengeSlotKey.SLOT_3),
      ]);
      expect(match.stage).toBe(MatchStage.BOARD);
      expect(match.status).toBe(MatchStatus.ACTIVE);
    });

    it('marks only the launched position in progress', () => {
      const match = unifiedMatch();
      match.launchChallenge({
        commandId: 'launch',
        now: NOW,
        occurrenceIndex: 2,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        challengeKey: 'read-your-opponent',
        runtimeId: 'runtime-1',
        contentItemIds: ['a'],
        launchability: MatchSlotLaunchability.LAUNCHABLE,
      });
      expect(match.stage).toBe(MatchStage.CHALLENGE);
      expect(match.currentChallenge).toMatchObject({
        occurrenceIndex: 2,
        slotKey: WorldChallengeSlotKey.SLOT_2,
      });
      const inProgress = match
        .unifiedBoard()
        .filter((position) => position.status === MatchSlotStatus.IN_PROGRESS);
      expect(inProgress.map((position) => position.positionKey)).toEqual([
        key(2, WorldChallengeSlotKey.SLOT_2),
      ]);
      // The identically-slotted position of the repeated World is untouched.
      expect(
        match
          .unifiedBoard()
          .find(
            (position) =>
              position.positionKey === key(0, WorldChallengeSlotKey.SLOT_2),
          )!.status,
      ).toBe(MatchSlotStatus.AVAILABLE);
    });

    it('refuses a completed position a second time', () => {
      const match = unifiedMatch();
      play(match, 1, WorldChallengeSlotKey.SLOT_2);
      expect(() =>
        match.launchChallenge({
          commandId: 'relaunch',
          now: NOW,
          occurrenceIndex: 1,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          challengeKey: 'read-your-opponent',
          runtimeId: 'runtime-again',
          contentItemIds: ['a'],
          launchability: MatchSlotLaunchability.LAUNCHABLE,
        }),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'BOARD_SLOT_NOT_AVAILABLE',
          }),
        }),
      );
    });

    it('refuses an occurrence this Match does not have', () => {
      expect(() =>
        unifiedMatch().launchChallenge({
          commandId: 'launch',
          now: NOW,
          occurrenceIndex: 3,
          slotKey: WorldChallengeSlotKey.SLOT_1,
          challengeKey: 'read-your-opponent',
          runtimeId: 'runtime-1',
          contentItemIds: ['a'],
          launchability: MatchSlotLaunchability.LAUNCHABLE,
        }),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'MATCH_OCCURRENCE_NOT_FOUND',
          }),
        }),
      );
    });

    it('refuses a launch claimed by the team whose turn it is not', () => {
      const match = unifiedMatch({ winnerTeamId: TEAM_A.id });
      expect(() =>
        match.launchChallenge({
          commandId: 'launch',
          now: NOW,
          occurrenceIndex: 0,
          slotKey: WorldChallengeSlotKey.SLOT_1,
          challengeKey: 'read-your-opponent',
          runtimeId: 'runtime-1',
          contentItemIds: ['a'],
          launchability: MatchSlotLaunchability.LAUNCHABLE,
          selectingTeamId: TEAM_B.id,
        }),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'MATCH_SELECTION_OUT_OF_TURN',
          }),
        }),
      );
    });
  });

  describe('completion', () => {
    it('returns to the board and alternates selection', () => {
      const match = unifiedMatch({ winnerTeamId: TEAM_A.id });
      play(match, 2, WorldChallengeSlotKey.SLOT_2);
      expect(match.stage).toBe(MatchStage.BOARD);
      expect(match.currentChallenge).toBeUndefined();
      expect(match.selectingTeamId).toBe(TEAM_B.id);
      play(match, 0, WorldChallengeSlotKey.SLOT_2);
      expect(match.selectingTeamId).toBe(TEAM_A.id);
    });

    it('never announces a completed World', () => {
      const match = unifiedMatch();
      // Every position of occurrence 1, and still no interstitial.
      for (const slotKey of MATCH_SLOT_ORDER) {
        play(match, 1, slotKey);
        expect(match.stage).toBe(MatchStage.BOARD);
      }
      // A completed occurrence stays on the board; there is no World-complete stage.
      expect(match.stage).toBe(MatchStage.BOARD);
      expect(match.status).toBe(MatchStatus.ACTIVE);
      // The other two occurrences kept every position they had.
      expect(
        match
          .unifiedBoard()
          .filter((position) => position.status === MatchSlotStatus.AVAILABLE),
      ).toHaveLength(8);
    });

    it('completes the Match once all twelve positions are done', () => {
      const match = unifiedMatch();
      for (const occurrenceIndex of [2, 0, 1]) {
        for (const slotKey of MATCH_SLOT_ORDER) {
          play(match, occurrenceIndex, slotKey);
        }
      }
      expect(unifiedMatchBoardPolicy.isComplete(match.unifiedBoard())).toBe(
        true,
      );
      expect(match.stage).toBe(MatchStage.MATCH_COMPLETE);
      expect(match.status).toBe(MatchStatus.COMPLETED);
      expect(match.serialize().completedAt).toEqual(NOW);
    });

    it('keeps the two occurrences of one World scored separately', () => {
      const match = unifiedMatch();
      play(match, 0, WorldChallengeSlotKey.SLOT_1, { delta: 2 });
      play(match, 2, WorldChallengeSlotKey.SLOT_1, { delta: 5 });
      const first = match
        .worldSubtotals(0)
        .find((score) => score.teamId === TEAM_A.id);
      const repeated = match
        .worldSubtotals(2)
        .find((score) => score.teamId === TEAM_A.id);
      expect(first?.signedTotal).toBe(2);
      expect(repeated?.signedTotal).toBe(5);
    });
  });

  describe('reload', () => {
    it('restores an identical board from its serialized state', () => {
      const match = unifiedMatch();
      play(match, 2, WorldChallengeSlotKey.SLOT_3);
      match.launchChallenge({
        commandId: 'launch-open',
        now: NOW,
        occurrenceIndex: 1,
        slotKey: WorldChallengeSlotKey.SLOT_1,
        challengeKey: 'read-your-opponent',
        runtimeId: 'runtime-open',
        contentItemIds: ['a'],
        launchability: MatchSlotLaunchability.LAUNCHABLE,
      });

      const state = match.serialize();
      const restored = Match.restore(state, state.scoreEvents);
      expect(restored.serialize()).toEqual(state);
      expect(restored.setupMode).toBe(MatchSetupMode.UNIFIED_PRECONFIGURED);
      expect(restored.unifiedBoard()).toEqual(match.unifiedBoard());
      expect(restored.selectingTeamId).toBe(match.selectingTeamId);
      expect(restored.currentChallenge).toEqual(match.currentChallenge);
      expect(restored.selectedScopeIds(2)).toEqual(ANIME_POOL_2);
    });

    it('does not let a serialized copy mutate the Match', () => {
      const match = unifiedMatch();
      match.serialize().configuredBoardPositions[0].challengeTypeSlug =
        'forged';
      expect(match.unifiedBoard()[0].challengeTypeSlug).not.toBe('forged');
    });
  });
});

/**
 * Preparing a position without starting it.
 *
 * The whole reason this stage exists: a mechanic that needs the players' phones
 * gets a moment to collect them, and a preflight that is abandoned must leave the
 * Match exactly as it found it.
 */
describe('unified preflight', () => {
  const READINESS = {
    minParticipantsPerTeam: 2,
    maxParticipantsPerTeam: 3,
    requiresBothTeams: true,
    requiresTeamAssignment: true,
    requiresConnectedPresence: true,
  };

  const prepare = (
    match: Match,
    occurrenceIndex: number,
    slotKey: WorldChallengeSlotKey,
    options: { commandId?: string; selectingTeamId?: string } = {},
  ) =>
    match.prepareChallenge({
      commandId: options.commandId ?? `prepare-${occurrenceIndex}-${slotKey}`,
      now: NOW,
      occurrenceIndex,
      slotKey,
      challengeTypeId: `${ANIME}-type-1`,
      challengeTypeSlug: 'read-your-opponent',
      requiresPhones: true,
      readiness: READINESS,
      joinCode: 'JOIN01',
      ...(options.selectingTeamId
        ? { selectingTeamId: options.selectingTeamId }
        : {}),
    });

  it('holds the position without starting anything', () => {
    const match = unifiedMatch();
    prepare(match, 2, WorldChallengeSlotKey.SLOT_2);

    expect(match.stage).toBe(MatchStage.PREFLIGHT);
    expect(match.currentChallenge).toBeUndefined();
    expect(match.pendingChallenge).toMatchObject({
      occurrenceIndex: 2,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      positionKey: key(2, WorldChallengeSlotKey.SLOT_2),
      requiresPhones: true,
      readiness: READINESS,
      joinCode: 'JOIN01',
    });
    // The position is untouched: nothing was consumed and nothing was reserved.
    expect(
      match
        .unifiedBoard()
        .find(
          (position) =>
            position.positionKey === key(2, WorldChallengeSlotKey.SLOT_2),
        )!.status,
    ).toBe(MatchSlotStatus.AVAILABLE);
    expect(match.usedContentItemIds(2)).toEqual([]);
  });

  it('allows only one prepared position at a time', () => {
    const match = unifiedMatch();
    prepare(match, 2, WorldChallengeSlotKey.SLOT_2);

    expect(() => prepare(match, 0, WorldChallengeSlotKey.SLOT_2)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'MATCH_STAGE_INVALID' }),
      }),
    );
    expect(match.pendingChallenge?.occurrenceIndex).toBe(2);
  });

  it('refuses to prepare a completed position', () => {
    const match = unifiedMatch();
    play(match, 1, WorldChallengeSlotKey.SLOT_2);

    expect(() => prepare(match, 1, WorldChallengeSlotKey.SLOT_2)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'BOARD_SLOT_NOT_AVAILABLE',
        }),
      }),
    );
  });

  it('refuses a preparation claimed by the wrong team', () => {
    const match = unifiedMatch({ winnerTeamId: TEAM_A.id });
    expect(() =>
      prepare(match, 0, WorldChallengeSlotKey.SLOT_2, {
        selectingTeamId: TEAM_B.id,
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'MATCH_SELECTION_OUT_OF_TURN',
        }),
      }),
    );
  });

  it('returns to the board on cancel, changing nothing else', () => {
    const match = unifiedMatch({ winnerTeamId: TEAM_A.id });
    prepare(match, 2, WorldChallengeSlotKey.SLOT_3);
    const boardBefore = match.unifiedBoard();

    match.cancelPreflight({ commandId: 'cancel', now: NOW });

    expect(match.stage).toBe(MatchStage.BOARD);
    expect(match.pendingChallenge).toBeUndefined();
    // Same board, same turn, same scores: nothing was spent on the attempt.
    expect(match.unifiedBoard()).toEqual(boardBefore);
    expect(match.selectingTeamId).toBe(TEAM_A.id);
    expect(match.teamScore(TEAM_A.id).signedTotal).toBe(0);
    // And the position can be prepared again.
    expect(() =>
      prepare(match, 2, WorldChallengeSlotKey.SLOT_3, {
        commandId: 'prepare-again',
      }),
    ).not.toThrow();
  });

  it('refuses a launch that does not match the prepared position', () => {
    const match = unifiedMatch();
    prepare(match, 2, WorldChallengeSlotKey.SLOT_2);

    expect(() =>
      match.requirePendingChallenge({
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_2,
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'MATCH_PENDING_CHALLENGE_MISMATCH',
        }),
      }),
    );
    expect(
      match.requirePendingChallenge({
        occurrenceIndex: 2,
        slotKey: WorldChallengeSlotKey.SLOT_2,
      }).positionKey,
    ).toBe(key(2, WorldChallengeSlotKey.SLOT_2));
  });

  it('reports no pending challenge when none was prepared', () => {
    expect(() =>
      unifiedMatch().requirePendingChallenge({
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_2,
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'MATCH_NO_PENDING_CHALLENGE',
        }),
      }),
    );
  });

  it('clears the preflight when the challenge actually launches', () => {
    const match = unifiedMatch();
    prepare(match, 2, WorldChallengeSlotKey.SLOT_2);
    match.launchChallenge({
      commandId: 'launch',
      now: NOW,
      occurrenceIndex: 2,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      challengeKey: 'read-your-opponent',
      runtimeId: 'runtime-1',
      contentItemIds: ['a'],
      launchability: MatchSlotLaunchability.LAUNCHABLE,
    });

    expect(match.stage).toBe(MatchStage.CHALLENGE);
    expect(match.pendingChallenge).toBeUndefined();
    expect(match.currentChallenge).toMatchObject({
      occurrenceIndex: 2,
      slotKey: WorldChallengeSlotKey.SLOT_2,
    });
  });

  it('survives a reload with its preflight intact', () => {
    const match = unifiedMatch();
    prepare(match, 1, WorldChallengeSlotKey.SLOT_2);

    const state = match.serialize();
    const restored = Match.restore(state, state.scoreEvents);

    expect(restored.serialize()).toEqual(state);
    expect(restored.stage).toBe(MatchStage.PREFLIGHT);
    expect(restored.pendingChallenge).toEqual(match.pendingChallenge);
    expect(restored.unifiedBoard()).toEqual(match.unifiedBoard());
  });
});
