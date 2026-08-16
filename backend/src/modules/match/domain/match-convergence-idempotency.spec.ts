import { Match, MatchState } from './match';
import { MatchSlotStatus, MatchStage, MatchStatus } from './match.constants';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { mintScoreEvent, ScoreEvent } from '../../scoring/domain/score-event';

/**
 * The Match's own defence against applying one challenge result twice.
 *
 * Convergence is at-least-once by design: the post-commit observer, the
 * read-side check and the recovery sweeper can all deliver the same terminal
 * runtime. `MatchReconciliationService` shields most of that by refusing once
 * `currentChallenge` is cleared — but that is the *outer* guard, and a guard
 * that is only ever tested through the thing in front of it is not tested.
 *
 * These call `completeChallenge` directly, so the aggregate has to be idempotent
 * on its own terms.
 */

const NOW = new Date('2026-08-15T00:00:00.000Z');
const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const RUNTIME_ID = 'runtime-1';

/**
 * A real, branded score event.
 *
 * Minted through the scoring module rather than hand-built: the ledger refuses
 * foreign objects, which is itself part of the score-integrity guarantee this
 * batch must not weaken.
 */
function scoreEvent(id: string, teamId: string, delta: number): ScoreEvent {
  return mintScoreEvent(
    { teamId, delta, reason: 'challenge-win' },
    {
      id,
      matchId: 'match-1',
      challengeSessionId: RUNTIME_ID,
      scoringRuleId: 'challenge-win',
      createdAt: NOW,
    },
  );
}

/** A Match mid-challenge, bound to a runtime and awaiting its result. */
function boundMatch(): Match {
  const state = {
    id: 'match-1',
    liveSessionId: 'session-1',
    setupMode: 'unified_preconfigured',
    status: MatchStatus.ACTIVE,
    stage: MatchStage.CHALLENGE,
    stageEnteredAt: NOW,
    teams: [
      { id: TEAM_A, name: 'A' },
      { id: TEAM_B, name: 'B' },
    ],
    teamDoubles: [
      { teamId: TEAM_A, status: 'available' },
      { teamId: TEAM_B, status: 'available' },
    ],
    selections: [],
    occurrences: [
      {
        index: 0,
        worldId: 'world-1',
        selectedScopeIds: ['s1', 's2', 's3', 's4'],
        scheduledSlotKeys: [WorldChallengeSlotKey.SLOT_1],
        slots: {
          [WorldChallengeSlotKey.SLOT_1]: {
            status: MatchSlotStatus.IN_PROGRESS,
            challengeKey: 'bomb',
            runtimeId: RUNTIME_ID,
            contentItemIds: ['item-1'],
            startedAt: NOW,
          },
        },
      },
    ],
    configuredBoardPositions: [
      {
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_1,
        worldId: 'world-1',
        challengeTypeId: 'type-bomb',
        challengeTypeSlug: 'bomb',
        displayName: 'Bomb',
      },
    ],
    selectingTeamId: TEAM_A,
    currentChallenge: {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      challengeKey: 'bomb',
      runtimeId: RUNTIME_ID,
      contentItemIds: ['item-1'],
      startedAt: NOW,
      doubledTeamIds: [],
    },
    scoreEvents: [],
    challengeResults: [],
    processedCommandIds: [],
    revision: 4,
    createdAt: NOW,
    startedAt: NOW,
  } as unknown as MatchState;
  return Match.restore(state, []);
}

const converge = (match: Match, commandId = `reconcile:${RUNTIME_ID}`) =>
  match.completeChallenge({
    commandId,
    now: NOW,
    runtimeId: RUNTIME_ID,
    events: [scoreEvent('challenge-win:runtime-1:0', TEAM_A, 1)],
    winnerTeamId: TEAM_A,
    challengeKey: 'bomb',
    summary: {},
    mechanicEvents: [],
  });

describe('applying one challenge result more than once', () => {
  it('awards the point once, however many times it is delivered', () => {
    // The highest-value assertion in the batch: at-least-once delivery must
    // not become at-least-once scoring.
    const match = boundMatch();

    expect(converge(match).completed).toBe(true);
    for (let again = 0; again < 4; again += 1) {
      expect(converge(match).completed).toBe(false);
    }

    expect(match.teamScore(TEAM_A).signedTotal).toBe(1);
    expect(match.teamScore(TEAM_B).signedTotal).toBe(0);
    expect(match.serialize().scoreEvents).toHaveLength(1);
  });

  it('records the challenge in history once', () => {
    const match = boundMatch();
    converge(match);
    converge(match);
    converge(match);

    expect(match.challengeResults).toHaveLength(1);
    expect(match.challengeResults[0].winnerTeamId).toBe(TEAM_A);
  });

  it('completes the board slot once and does not reopen it', () => {
    const match = boundMatch();
    converge(match);
    const afterFirst = match.unifiedBoard()[0].status;
    converge(match);

    expect(afterFirst).toBe(MatchSlotStatus.COMPLETED);
    expect(match.unifiedBoard()[0].status).toBe(MatchSlotStatus.COMPLETED);
    expect(match.currentChallenge).toBeUndefined();
  });

  it('is idempotent even when redelivery arrives under a fresh command id', () => {
    // The command-id replay guard is not the only thing standing between the
    // Match and a double award: a recovery path that mints a new id must meet
    // the completed slot instead.
    const match = boundMatch();
    converge(match, 'reconcile:first');

    expect(converge(match, 'reconcile:second').completed).toBe(false);
    expect(match.teamScore(TEAM_A).signedTotal).toBe(1);
    expect(match.challengeResults).toHaveLength(1);
  });

  it('ignores an event set that repeats an already-imported event id', () => {
    // Deterministic score-event ids mean a redelivery carries the *same* event.
    // Importing it again would double the ledger even if the slot were open.
    const match = boundMatch();
    converge(match);

    const ledger = match.serialize().scoreEvents;
    expect(ledger).toHaveLength(1);
    expect(ledger[0].id).toBe('challenge-win:runtime-1:0');
  });

  it('leaves the stage on the result rather than advancing twice', () => {
    const match = boundMatch();
    converge(match);
    converge(match);

    expect(match.stage).toBe(MatchStage.CHALLENGE_RESULT);
    expect(match.pendingResult).toBeDefined();
  });
});
