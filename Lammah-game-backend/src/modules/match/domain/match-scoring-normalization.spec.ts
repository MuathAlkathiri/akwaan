import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { ScoringService } from '../../scoring/application/scoring.service';
import { ChallengeWinRule } from '../../scoring/application/challenge-win.rule';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { Match } from './match';
import {
  MATCH_SLOT_ORDER,
  MatchSlotLaunchability,
  MatchStage,
} from './match.constants';

/**
 * The Match scoreboard counts challenge *wins*, not mechanic points.
 *
 * This is the rule the whole suite exists to protect: a challenge that finishes
 * 3–2 inside itself, and an RYO whose payoff matrix swings ±1 three times, both
 * move the Match by exactly one point — to whoever won. A tie moves it by none.
 *
 * "Match score" answers one question: how many challenges has this team won?
 * Everything a mechanic knows about *how* it was won stays on the challenge
 * result, where it can be shown without ever being summed into the Match.
 */

const NOW = new Date('2026-08-08T10:00:00.000Z');
const TEAM_A = { id: 'team-a', name: 'الأخضر' };
const TEAM_B = { id: 'team-b', name: 'الوردي' };

const registry = new ScoringRuleRegistry();
registry.bind(new ChallengeWinRule());
const scoring = new ScoringService(registry);

/** The Match-level events one finished challenge contributes. */
function matchPointsFor(input: {
  winnerTeamId: string | null;
  runtimeId: string;
  mechanicSummary?: Record<string, unknown>;
}) {
  return scoring.score(
    SCORING_RULE_IDS.CHALLENGE_WIN,
    {
      winnerTeamId: input.winnerTeamId,
      teamIds: [TEAM_A.id, TEAM_B.id],
      challengeKey: 'test-mechanic',
      positionKey: '0#slot_1',
      ...(input.mechanicSummary
        ? { mechanicSummary: input.mechanicSummary }
        : {}),
    },
    {
      matchId: 'match-1',
      challengeSessionId: input.runtimeId,
      occurredAt: NOW,
      eventIdSeed: `challenge-win:${input.runtimeId}`,
    },
  );
}

function newMatch(): Match {
  return Match.createUnified({
    liveSessionId: 'session-1',
    teams: [TEAM_A, TEAM_B],
    occurrences: [0, 1, 2].map((occurrenceIndex) => ({
      occurrenceIndex,
      worldId: `world-${occurrenceIndex}`,
      selectedScopeIds: ['s1', 's2', 's3', 's4'],
    })),
    boardPositions: [0, 1, 2].flatMap((occurrenceIndex) =>
      MATCH_SLOT_ORDER.map((slotKey) => ({
        occurrenceIndex,
        worldId: `world-${occurrenceIndex}`,
        slotKey,
        challengeTypeId: `type-${slotKey}`,
        challengeTypeSlug: 'test-mechanic',
        displayName: `تحدٍ ${slotKey}`,
      })),
    ),
    coinToss: { winnerTeamId: TEAM_A.id, roll: 0, resolvedAt: NOW },
    now: NOW,
  });
}

/**
 * Plays one position through to the board, with a stated mechanic outcome.
 *
 * `mechanicEvents` stands in for whatever the mechanic minted internally — RYO's
 * signed payoffs, for instance. They are recorded on the result and must never
 * reach the ledger.
 */
function play(
  match: Match,
  input: {
    occurrenceIndex: number;
    slotKey: WorldChallengeSlotKey;
    winnerTeamId: string | null;
    mechanicSummary?: Record<string, unknown>;
    mechanicEvents?: Array<Record<string, unknown>>;
    acknowledge?: boolean;
  },
): string {
  const runtimeId = `runtime-${input.occurrenceIndex}-${input.slotKey}`;
  match.launchChallenge({
    commandId: `launch-${runtimeId}`,
    now: NOW,
    occurrenceIndex: input.occurrenceIndex,
    slotKey: input.slotKey,
    challengeKey: 'test-mechanic',
    runtimeId,
    contentItemIds: [`${runtimeId}-item`],
    launchability: MatchSlotLaunchability.LAUNCHABLE,
  });
  match.completeChallenge({
    commandId: `complete-${runtimeId}`,
    now: NOW,
    runtimeId,
    events: matchPointsFor({
      winnerTeamId: input.winnerTeamId,
      runtimeId,
      ...(input.mechanicSummary
        ? { mechanicSummary: input.mechanicSummary }
        : {}),
    }),
    mechanicEvents: input.mechanicEvents ?? [],
    summary: { mechanic: input.mechanicSummary ?? {} },
    winnerTeamId: input.winnerTeamId,
    challengeKey: 'test-mechanic',
  });
  if (input.acknowledge !== false) {
    match.continueFromChallengeResult({
      commandId: `continue-${runtimeId}`,
      now: NOW,
    });
  }
  return runtimeId;
}

const score = (match: Match) => ({
  [TEAM_A.id]: match.teamScore(TEAM_A.id).signedTotal,
  [TEAM_B.id]: match.teamScore(TEAM_B.id).signedTotal,
});

describe('Match score counts challenge wins, not mechanic points', () => {
  it('turns an internal 2-1 into a Match scoreboard of 1-0', () => {
    const match = newMatch();
    play(match, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      winnerTeamId: TEAM_A.id,
      mechanicSummary: { [TEAM_A.id]: 2, [TEAM_B.id]: 1 },
    });
    expect(score(match)).toEqual({ [TEAM_A.id]: 1, [TEAM_B.id]: 0 });
  });

  it('turns a lopsided internal 4-1 into the same single point', () => {
    const match = newMatch();
    play(match, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      winnerTeamId: TEAM_A.id,
      mechanicSummary: { [TEAM_A.id]: 4, [TEAM_B.id]: 1 },
    });
    // A bigger margin is a better story, not a bigger Match score.
    expect(score(match)).toEqual({ [TEAM_A.id]: 1, [TEAM_B.id]: 0 });
  });

  it('ignores signed mechanic events entirely, however many there are', () => {
    const match = newMatch();
    // RYO-shaped: three signed payoff swings that net +2 / -1 internally.
    play(match, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      winnerTeamId: TEAM_A.id,
      mechanicSummary: { [TEAM_A.id]: 2, [TEAM_B.id]: -1 },
      mechanicEvents: [
        { teamId: TEAM_A.id, delta: 1, reason: 'ryo.trust.correct' },
        { teamId: TEAM_A.id, delta: 1, reason: 'ryo.trust.correct' },
        { teamId: TEAM_B.id, delta: -1, reason: 'ryo.steal.failed' },
      ],
    });
    expect(score(match)).toEqual({ [TEAM_A.id]: 1, [TEAM_B.id]: 0 });
    // And the negative swing never reaches the Match: nobody goes below zero
    // because of a failed steal any more.
    expect(match.teamScore(TEAM_B.id).displayTotal).toBe(0);
  });

  it('awards nothing at all on a true tie', () => {
    const match = newMatch();
    play(match, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      winnerTeamId: null,
      mechanicSummary: { [TEAM_A.id]: 1, [TEAM_B.id]: 1 },
    });
    expect(score(match)).toEqual({ [TEAM_A.id]: 0, [TEAM_B.id]: 0 });
    // A tie leaves no event behind to be miscounted later.
    expect(match.serialize().scoreEvents).toHaveLength(0);
    const result = match.challengeResults[0];
    expect(result.tie).toBe(true);
    expect(result.winnerTeamId).toBeNull();
    expect(result.matchPointEventId).toBeNull();
    expect(result.matchPoints).toEqual([
      { teamId: TEAM_A.id, points: 0 },
      { teamId: TEAM_B.id, points: 0 },
    ]);
  });

  it('adds one point per win, so two wins by one team read 2-0', () => {
    const match = newMatch();
    play(match, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      winnerTeamId: TEAM_A.id,
      mechanicSummary: { [TEAM_A.id]: 5, [TEAM_B.id]: 0 },
    });
    play(match, {
      occurrenceIndex: 1,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      winnerTeamId: TEAM_A.id,
      mechanicSummary: { [TEAM_A.id]: 3, [TEAM_B.id]: 2 },
    });
    expect(score(match)).toEqual({ [TEAM_A.id]: 2, [TEAM_B.id]: 0 });
  });

  it('reads 1-1 for one win each, whatever the internal margins were', () => {
    const match = newMatch();
    play(match, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      winnerTeamId: TEAM_A.id,
      mechanicSummary: { [TEAM_A.id]: 5, [TEAM_B.id]: 0 },
    });
    play(match, {
      occurrenceIndex: 1,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      winnerTeamId: TEAM_B.id,
      mechanicSummary: { [TEAM_A.id]: 2, [TEAM_B.id]: 3 },
    });
    // 5-0 and 3-2 are wildly different challenges and count exactly the same.
    expect(score(match)).toEqual({ [TEAM_A.id]: 1, [TEAM_B.id]: 1 });
  });
});

describe('a completed position can never contribute more than one point', () => {
  it('ignores a repeated completion of the same runtime', () => {
    const match = newMatch();
    const runtimeId = play(match, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      winnerTeamId: TEAM_A.id,
      acknowledge: false,
    });

    // Same runtime, fresh command id, freshly minted events: the reconciliation
    // path is designed to be safe to run again, so this is the real shape of a
    // retry rather than a contrived one.
    const second = match.completeChallenge({
      commandId: `complete-again-${runtimeId}`,
      now: NOW,
      runtimeId,
      events: matchPointsFor({ winnerTeamId: TEAM_A.id, runtimeId }),
      winnerTeamId: TEAM_A.id,
      challengeKey: 'test-mechanic',
    });

    expect(second.completed).toBe(false);
    expect(score(match)).toEqual({ [TEAM_A.id]: 1, [TEAM_B.id]: 0 });
    expect(match.serialize().scoreEvents).toHaveLength(1);
    expect(match.challengeResults).toHaveLength(1);
  });

  it('mints the same event id for the same challenge, so a re-import is a no-op', () => {
    const first = matchPointsFor({
      winnerTeamId: TEAM_A.id,
      runtimeId: 'runtime-x',
    });
    const again = matchPointsFor({
      winnerTeamId: TEAM_A.id,
      runtimeId: 'runtime-x',
    });
    // Identity, not chance: the ledger's own id check is what makes a duplicate
    // import impossible even if every other guard were removed.
    expect(again[0].id).toBe(first[0].id);
    expect(first[0].id).toBe('challenge-win:runtime-x:0');
  });

  it('never awards a second point across repeated continues', () => {
    const match = newMatch();
    const runtimeId = play(match, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      winnerTeamId: TEAM_A.id,
    });
    // The command id is the same one the first press used.
    match.continueFromChallengeResult({
      commandId: `continue-${runtimeId}`,
      now: NOW,
    });
    expect(score(match)).toEqual({ [TEAM_A.id]: 1, [TEAM_B.id]: 0 });
    expect(match.stage).toBe(MatchStage.BOARD);
  });

  it('survives a serialize/restore round trip without gaining a point', () => {
    const match = newMatch();
    play(match, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      winnerTeamId: TEAM_A.id,
      mechanicSummary: { [TEAM_A.id]: 3, [TEAM_B.id]: 2 },
    });
    const state = match.serialize();
    const restored = Match.restore(state, state.scoreEvents);
    // A refresh is a restore; a reconnect is a restore.
    expect(score(restored)).toEqual({ [TEAM_A.id]: 1, [TEAM_B.id]: 0 });
    expect(restored.challengeResults).toHaveLength(1);
  });

  it('refuses a winner who is not playing this Match', () => {
    // Defence against an upstream bug handing over a stale team id.
    expect(
      matchPointsFor({ winnerTeamId: 'someone-else', runtimeId: 'runtime-y' }),
    ).toEqual([]);
  });
});

describe('the challenge result keeps the mechanic result intact', () => {
  it('records the internal margin and the signed events beside the Match point', () => {
    const match = newMatch();
    play(match, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      winnerTeamId: TEAM_A.id,
      mechanicSummary: { [TEAM_A.id]: 3, [TEAM_B.id]: 2 },
      mechanicEvents: [
        { teamId: TEAM_A.id, delta: 1, reason: 'ryo.trust.correct' },
        { teamId: TEAM_B.id, delta: -1, reason: 'ryo.steal.failed' },
      ],
    });
    const result = match.challengeResults[0];
    // The 3-2 is still there to be shown…
    expect(result.details).toMatchObject({
      mechanic: { [TEAM_A.id]: 3, [TEAM_B.id]: 2 },
    });
    expect(result.mechanicScoreEvents).toHaveLength(2);
    // …and the Match point is a separate, unambiguous statement.
    expect(result.matchPoints).toEqual([
      { teamId: TEAM_A.id, points: 1 },
      { teamId: TEAM_B.id, points: 0 },
    ]);
    expect(result.tie).toBe(false);
    expect(result.matchPointEventId).toBeTruthy();
  });

  it('keeps every result in history as more challenges finish', () => {
    const match = newMatch();
    play(match, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      winnerTeamId: TEAM_A.id,
    });
    play(match, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      winnerTeamId: null,
    });
    expect(match.challengeResults).toHaveLength(2);
    expect(match.challengeResults.map((result) => result.tie)).toEqual([
      false,
      true,
    ]);
  });
});

describe('Match completion', () => {
  it('derives the winner from challenge wins', () => {
    const match = newMatch();
    let wins = 0;
    for (const occurrence of [0, 1, 2]) {
      for (const slotKey of MATCH_SLOT_ORDER) {
        // Seven wins to A, five to B, with wild internal margins throughout.
        const winnerTeamId = wins < 7 ? TEAM_A.id : TEAM_B.id;
        wins += 1;
        play(match, {
          occurrenceIndex: occurrence,
          slotKey,
          winnerTeamId,
          mechanicSummary: { [TEAM_A.id]: 5, [TEAM_B.id]: 0 },
        });
      }
    }
    const result = match.result();
    expect(match.stage).toBe(MatchStage.MATCH_COMPLETE);
    expect(result.winnerTeamId).toBe(TEAM_A.id);
    expect(result.tie).toBe(false);
    expect(result.teams.map((team) => [team.teamId, team.signedTotal])).toEqual(
      [
        [TEAM_A.id, 7],
        [TEAM_B.id, 5],
      ],
    );
  });

  it('can end a Match genuinely tied, and reports it as a tie', () => {
    const match = newMatch();
    let played = 0;
    for (const occurrence of [0, 1, 2]) {
      for (const slotKey of MATCH_SLOT_ORDER) {
        play(match, {
          occurrenceIndex: occurrence,
          slotKey,
          winnerTeamId: played % 2 === 0 ? TEAM_A.id : TEAM_B.id,
        });
        played += 1;
      }
    }
    const result = match.result();
    // Twelve positions split six/six. There is no tiebreaker today, and this
    // test states that plainly rather than inventing one.
    expect(result.tie).toBe(true);
    expect(result.winnerTeamId).toBeNull();
    expect(result.teams.map((team) => team.signedTotal)).toEqual([6, 6]);
  });
});
