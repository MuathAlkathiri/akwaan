import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { ScoringService } from '../../scoring/application/scoring.service';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import { ScoreEvent } from '../../scoring/domain/score-event';
import { ConfiguredWorldOccurrence } from './configured-world-occurrence';
import { Match } from './match';
import {
  MATCH_SLOT_ORDER,
  MatchSlotLaunchability,
  MatchSlotStatus,
  MatchStage,
  MatchStatus,
} from './match.constants';
import { MatchDomainError, MatchStaleRevisionError } from './match.errors';
import { MatchBoardPositionConfiguration } from './unified-match-board.policy';

const TEAM_A = { id: 'team-a', name: 'الفريق الأول' };
const TEAM_B = { id: 'team-b', name: 'الفريق الثاني' };
const NOW = new Date('2026-03-01T10:00:00.000Z');

const scoring = new ScoringService(new ScoringRuleRegistry());

/** Events shaped exactly as a mechanic persists them in its runtime state. */
function events(
  runtimeId: string,
  deltas: Array<{ teamId: string; delta: number; id: string }>,
): ScoreEvent[] {
  return scoring.restoreEvents(
    deltas.map((entry) => ({
      id: entry.id,
      matchId: 'live-session-1',
      teamId: entry.teamId,
      challengeSessionId: runtimeId,
      scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      delta: entry.delta,
      reason: 'ryo.trust.correct',
      createdAt: NOW.toISOString(),
    })),
  );
}

/** The four Scopes one occurrence draws its content from. */
function scopeIdsFor(occurrenceIndex: number): string[] {
  return ['a', 'b', 'c', 'd'].map(
    (suffix) => `scope-${occurrenceIndex}-${suffix}`,
  );
}

function occurrencesFor(
  worldIds: [string, string, string],
): ConfiguredWorldOccurrence[] {
  return worldIds.map((worldId, index) => ({
    occurrenceIndex: index,
    worldId,
    selectedScopeIds: scopeIdsFor(index),
  }));
}

/**
 * Every occurrence schedules all four board positions — the only schedule a
 * unified Match may carry — with the same mechanic in each slot.
 */
function boardPositionsFor(
  worldIds: [string, string, string],
): MatchBoardPositionConfiguration[] {
  return occurrencesFor(worldIds).flatMap((occurrence) =>
    MATCH_SLOT_ORDER.map((slotKey) => ({
      occurrenceIndex: occurrence.occurrenceIndex,
      worldId: occurrence.worldId,
      slotKey,
      challengeTypeId: 'challenge-type-ryo',
      challengeTypeSlug: 'read-your-opponent',
      displayName: `slot ${slotKey}`,
    })),
  );
}

/** A fully configured Match, created the only way a Match is created now. */
function newMatch(
  worldIds: [string, string, string] = ['w1', 'w2', 'w3'],
  winnerTeamId: string = TEAM_A.id,
): Match {
  return Match.createUnified({
    liveSessionId: 'live-session-1',
    teams: [TEAM_A, TEAM_B],
    occurrences: occurrencesFor(worldIds),
    boardPositions: boardPositionsFor(worldIds),
    coinToss: { winnerTeamId, roll: 0.2, resolvedAt: NOW },
    now: NOW,
  });
}

function launch(
  match: Match,
  occurrenceIndex: number,
  slotKey: WorldChallengeSlotKey,
  runtimeId: string,
  options: {
    commandId?: string;
    challengeKey?: string;
    contentItemIds?: string[];
    launchability?: MatchSlotLaunchability;
    selectingTeamId?: string;
  } = {},
): void {
  match.launchChallenge({
    commandId: options.commandId ?? `launch-${runtimeId}`,
    now: NOW,
    occurrenceIndex,
    slotKey,
    challengeKey: options.challengeKey ?? 'read-your-opponent',
    runtimeId,
    contentItemIds: options.contentItemIds ?? [`${runtimeId}-a`],
    launchability: options.launchability ?? MatchSlotLaunchability.LAUNCHABLE,
    ...(options.selectingTeamId
      ? { selectingTeamId: options.selectingTeamId }
      : {}),
  });
}

/**
 * Plays one position through to the board again.
 *
 * A finished challenge now stops on its result, so "played" means completed *and*
 * acknowledged. Tests that care about the result screen itself drive the two
 * steps separately.
 */
function completePosition(
  match: Match,
  occurrenceIndex: number,
  slotKey: WorldChallengeSlotKey,
  deltas?: Array<{ teamId: string; delta: number; id: string }>,
): string {
  const runtimeId = `runtime-${occurrenceIndex}-${slotKey}`;
  launch(match, occurrenceIndex, slotKey, runtimeId);
  match.completeChallenge({
    commandId: `complete-${runtimeId}`,
    now: NOW,
    runtimeId,
    events: events(
      runtimeId,
      deltas ?? [{ id: `${runtimeId}-e`, teamId: TEAM_A.id, delta: 1 }],
    ),
  });
  match.continueFromChallengeResult({
    commandId: `continue-${runtimeId}`,
    now: NOW,
  });
  return runtimeId;
}

/** Completes every one of the twelve positions. */
function completeAll(match: Match): void {
  for (const occurrence of match.occurrences) {
    for (const slotKey of occurrence.scheduledSlotKeys) {
      completePosition(match, occurrence.index, slotKey);
    }
  }
}

describe('Match aggregate', () => {
  it('consumes both independently armed Double tokens at launch', () => {
    const match = newMatch();
    match.prepareChallenge({
      commandId: 'prepare-double',
      now: NOW,
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      challengeTypeId: 'challenge-type-ryo',
      challengeTypeSlug: 'read-your-opponent',
      requiresPhones: true,
    });
    match.setTeamDouble({
      commandId: 'arm-a',
      now: NOW,
      teamId: TEAM_A.id,
      armed: true,
    });
    match.setTeamDouble({
      commandId: 'arm-b',
      now: NOW,
      teamId: TEAM_B.id,
      armed: true,
    });
    launch(match, 0, WorldChallengeSlotKey.SLOT_1, 'runtime-double');

    expect(match.currentChallenge?.doubledTeamIds).toEqual([
      TEAM_A.id,
      TEAM_B.id,
    ]);
    expect(match.teamDoubles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamId: TEAM_A.id, status: 'consumed' }),
        expect.objectContaining({ teamId: TEAM_B.id, status: 'consumed' }),
      ]),
    );
  });
  describe('creation and identity', () => {
    it('requires exactly two distinct teams', () => {
      expect(() =>
        Match.createUnified({
          liveSessionId: 's',
          teams: [TEAM_A],
          occurrences: occurrencesFor(['w1', 'w2', 'w3']),
          boardPositions: boardPositionsFor(['w1', 'w2', 'w3']),
          coinToss: { winnerTeamId: TEAM_A.id, roll: 0.2, resolvedAt: NOW },
          now: NOW,
        }),
      ).toThrow(MatchDomainError);
      expect(() =>
        Match.createUnified({
          liveSessionId: 's',
          teams: [TEAM_A, TEAM_A],
          occurrences: occurrencesFor(['w1', 'w2', 'w3']),
          boardPositions: boardPositionsFor(['w1', 'w2', 'w3']),
          coinToss: { winnerTeamId: TEAM_A.id, roll: 0.2, resolvedAt: NOW },
          now: NOW,
        }),
      ).toThrow(MatchDomainError);
    });

    it('refuses a coin toss winner who is not playing', () => {
      expect(() => newMatch(['w1', 'w2', 'w3'], 'stranger')).toThrow(
        MatchDomainError,
      );
    });

    it('rejects a stale revision', () => {
      const match = newMatch();
      expect(() => match.assertRevision(0)).not.toThrow();
      launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-1');
      expect(() => match.assertRevision(0)).toThrow(MatchStaleRevisionError);
      expect(() => match.assertRevision(1)).not.toThrow();
    });
  });

  describe('board and launching', () => {
    it('aborts an active challenge back to the available board without score or history', () => {
      const match = newMatch();
      launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-abort');
      const beforeEvents = match.serialize().scoreEvents.length;
      const beforeResults = match.challengeResults.length;

      expect(
        match.abortChallenge({
          commandId: 'abort-runtime-abort',
          now: new Date('2026-01-01T00:01:00.000Z'),
          runtimeId: 'runtime-abort',
        }),
      ).toEqual({ aborted: true });

      expect(match.stage).toBe(MatchStage.BOARD);
      expect(match.currentChallenge).toBeUndefined();
      expect(match.occurrences[0].slots[WorldChallengeSlotKey.SLOT_2]).toEqual({
        status: MatchSlotStatus.AVAILABLE,
      });
      expect(match.serialize().scoreEvents).toHaveLength(beforeEvents);
      expect(match.challengeResults).toHaveLength(beforeResults);

      launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-retry');
      expect(match.currentChallenge?.runtimeId).toBe('runtime-retry');
    });

    it('binds a slot to a runtime and moves into the challenge stage', () => {
      const match = newMatch(['football', 'anime', 'football']);
      launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-1', {
        contentItemIds: ['i1', 'i2', 'i3'],
      });
      expect(match.stage).toBe(MatchStage.CHALLENGE);
      expect(match.currentChallenge).toMatchObject({
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        challengeKey: 'read-your-opponent',
        runtimeId: 'runtime-1',
        contentItemIds: ['i1', 'i2', 'i3'],
      });
      expect(match.occurrences[0].slots.slot_2?.status).toBe(
        MatchSlotStatus.IN_PROGRESS,
      );
    });

    it('completes exactly the position the runtime was bound to', () => {
      const match = newMatch(['football', 'anime', 'football']);
      completePosition(match, 0, WorldChallengeSlotKey.SLOT_2);

      expect(match.stage).toBe(MatchStage.BOARD);
      expect(match.occurrences[0].slots.slot_2?.status).toBe(
        MatchSlotStatus.COMPLETED,
      );
      // The identically-slotted position of the repeated World is untouched.
      expect(match.occurrences[2].slots.slot_2?.status).toBe(
        MatchSlotStatus.AVAILABLE,
      );
    });

    it('refuses to launch a mechanic that has no launcher', () => {
      const match = newMatch();
      expect(() =>
        launch(match, 0, WorldChallengeSlotKey.SLOT_1, 'runtime-x', {
          launchability: MatchSlotLaunchability.CONFIGURED_BUT_UNIMPLEMENTED,
        }),
      ).toThrow(MatchDomainError);
      // The slot stays available: nothing was skipped or auto-completed.
      expect(match.occurrences[0].slots.slot_1?.status).toBe(
        MatchSlotStatus.AVAILABLE,
      );
      expect(match.stage).toBe(MatchStage.BOARD);
    });

    it('refuses a busy slot, a completed slot, and an out-of-order launch', () => {
      const match = newMatch();
      launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-1');
      // A second launch while another challenge is live is blocked by the stage.
      expect(() =>
        launch(match, 0, WorldChallengeSlotKey.SLOT_3, 'runtime-2'),
      ).toThrow(MatchDomainError);
      match.completeChallenge({
        commandId: 'complete-runtime-1',
        now: NOW,
        runtimeId: 'runtime-1',
        events: [],
      });
      // The completed slot refuses a second launch.
      expect(() =>
        launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-3'),
      ).toThrow(MatchDomainError);
    });

    it('ignores a replayed launch command', () => {
      const match = newMatch();
      launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-1', {
        commandId: 'c-launch',
      });
      const revision = match.revision;
      launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-1b', {
        commandId: 'c-launch',
      });
      expect(match.revision).toBe(revision);
      expect(match.currentChallenge?.runtimeId).toBe('runtime-1');
    });

    it('ignores a terminal for a runtime it never bound', () => {
      const match = newMatch();
      expect(
        match.completeChallenge({
          commandId: 'c-unknown',
          now: NOW,
          runtimeId: 'not-mine',
          events: events('not-mine', [
            { id: 'e9', teamId: TEAM_A.id, delta: 5 },
          ]),
        }).completed,
      ).toBe(false);
      expect(match.teamScore(TEAM_A.id).signedTotal).toBe(0);
    });
  });

  describe('completion and scoring', () => {
    it('imports signed events exactly once, even on a repeated terminal', () => {
      const match = newMatch();
      launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-1');
      const minted = events('runtime-1', [
        { id: 'e1', teamId: TEAM_A.id, delta: 1 },
        { id: 'e2', teamId: TEAM_B.id, delta: -1 },
      ]);

      const first = match.completeChallenge({
        commandId: 'c-done',
        now: NOW,
        runtimeId: 'runtime-1',
        events: minted,
        summary: { itemsPlayed: 3 },
      });
      const second = match.completeChallenge({
        commandId: 'c-done-again',
        now: NOW,
        runtimeId: 'runtime-1',
        events: minted,
      });

      expect(first.completed).toBe(true);
      expect(second.completed).toBe(false);
      expect(match.teamScore(TEAM_A.id).signedTotal).toBe(1);
      expect(match.teamScore(TEAM_B.id).signedTotal).toBe(-1);
      expect(match.occurrences[0].slots.slot_2?.summary).toEqual({
        itemsPlayed: 3,
      });
      // A finished challenge stops on its result. It reaches the board only when
      // the host says so, and the second terminal notification did not append a
      // second result to history either.
      expect(match.stage).toBe(MatchStage.CHALLENGE_RESULT);
      expect(match.challengeResults).toHaveLength(1);
      expect(match.pendingResult?.id).toBe(match.challengeResults[0].id);

      match.continueFromChallengeResult({ commandId: 'c-continue', now: NOW });
      expect(match.stage).toBe(MatchStage.BOARD);
      expect(match.pendingResult).toBeUndefined();
      // Continuing awards nothing; the points were imported with the result.
      expect(match.teamScore(TEAM_A.id).signedTotal).toBe(1);
      expect(match.challengeResults).toHaveLength(1);
    });

    it('records an immutable, append-only result for every finished challenge', () => {
      const match = newMatch();
      completePosition(match, 0, WorldChallengeSlotKey.SLOT_1);
      completePosition(match, 1, WorldChallengeSlotKey.SLOT_3);
      expect(
        match.challengeResults.map((result) => result.positionKey),
      ).toEqual(['0#slot_1', '1#slot_3']);
      // The older result survives the newer one — this is Match history.
      expect(match.challengeResults[0].completedAt).toBeInstanceOf(Date);
      expect(match.challengeResults[0].scoreEventIds).toHaveLength(1);
    });

    it('refuses to continue from any stage other than the result', () => {
      const match = newMatch();
      expect(() =>
        match.continueFromChallengeResult({ commandId: 'c-early', now: NOW }),
      ).toThrow(/MATCH_STAGE_INVALID|unavailable/);
      launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-1');
      expect(() =>
        match.continueFromChallengeResult({ commandId: 'c-mid', now: NOW }),
      ).toThrow(/MATCH_STAGE_INVALID|unavailable/);
    });

    it('treats a replayed continue command as already done', () => {
      const match = newMatch();
      launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-1');
      match.completeChallenge({
        commandId: 'c-done',
        now: NOW,
        runtimeId: 'runtime-1',
        events: events('runtime-1', [
          { id: 'e1', teamId: TEAM_A.id, delta: 1 },
        ]),
      });
      match.continueFromChallengeResult({ commandId: 'c-continue', now: NOW });
      const revision = match.revision;
      // The same command id again: recognised, not re-applied, and the score is
      // untouched.
      match.continueFromChallengeResult({ commandId: 'c-continue', now: NOW });
      expect(match.revision).toBe(revision);
      expect(match.teamScore(TEAM_A.id).signedTotal).toBe(1);
    });

    it('preserves negative totals and clamps only the display value', () => {
      const match = newMatch();
      completePosition(match, 0, WorldChallengeSlotKey.SLOT_2, [
        { id: 'e1', teamId: TEAM_B.id, delta: -1 },
        { id: 'e2', teamId: TEAM_B.id, delta: -2 },
      ]);
      expect(match.teamScore(TEAM_B.id)).toEqual({
        teamId: TEAM_B.id,
        signedTotal: -3,
        displayTotal: 0,
      });
    });

    it('alternates board selection between the teams', () => {
      const match = newMatch(['w1', 'w2', 'w3'], TEAM_A.id);
      expect(match.selectingTeamId).toBe(TEAM_A.id);

      // The winner may claim the first position; the opponent may not.
      launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-1', {
        selectingTeamId: TEAM_A.id,
      });
      expect(() =>
        launch(match, 0, WorldChallengeSlotKey.SLOT_3, 'runtime-1b', {
          selectingTeamId: TEAM_A.id,
        }),
      ).toThrow(MatchDomainError);
      match.completeChallenge({
        commandId: 'complete-runtime-1',
        now: NOW,
        runtimeId: 'runtime-1',
        events: [],
      });
      // Selection changes hands when the host leaves the result, not the moment
      // the mechanic stops — the board is not showing yet.
      expect(match.selectingTeamId).toBe(TEAM_A.id);
      match.continueFromChallengeResult({
        commandId: 'continue-runtime-1',
        now: NOW,
      });

      // Now it is the opponent's turn.
      expect(match.selectingTeamId).toBe(TEAM_B.id);
      expect(() =>
        launch(match, 1, WorldChallengeSlotKey.SLOT_2, 'runtime-2', {
          selectingTeamId: TEAM_A.id,
        }),
      ).toThrow(MatchDomainError);
      launch(match, 1, WorldChallengeSlotKey.SLOT_2, 'runtime-2', {
        selectingTeamId: TEAM_B.id,
      });
      match.completeChallenge({
        commandId: 'complete-runtime-2',
        now: NOW,
        runtimeId: 'runtime-2',
        events: [],
      });
      match.continueFromChallengeResult({
        commandId: 'continue-runtime-2',
        now: NOW,
      });

      expect(match.selectingTeamId).toBe(TEAM_A.id);
    });

    it('derives World subtotals per occurrence', () => {
      const match = newMatch();
      completePosition(match, 0, WorldChallengeSlotKey.SLOT_2);
      completePosition(match, 1, WorldChallengeSlotKey.SLOT_3, [
        { id: 'e', teamId: TEAM_A.id, delta: 2 },
      ]);

      const first = match.worldSubtotals(0);
      expect(first.find((team) => team.teamId === TEAM_A.id)).toMatchObject({
        signedTotal: 1,
      });
      expect(
        match.worldSubtotals(1).find((team) => team.teamId === TEAM_A.id),
      ).toMatchObject({ signedTotal: 2 });
      expect(match.worldSubtotals(2)).toEqual([
        { teamId: TEAM_A.id, signedTotal: 0, displayTotal: 0 },
        { teamId: TEAM_B.id, signedTotal: 0, displayTotal: 0 },
      ]);
    });

    it('completes the Match once all twelve positions are done and derives a winner', () => {
      const match = newMatch();
      completeAll(match);

      expect(match.stage).toBe(MatchStage.MATCH_COMPLETE);
      expect(match.status).toBe(MatchStatus.COMPLETED);
      const result = match.result();
      expect(result.winnerTeamId).toBe(TEAM_A.id);
      expect(result.tie).toBe(false);
      expect(result.worlds).toHaveLength(3);
      expect(
        result.teams.find((team) => team.teamId === TEAM_A.id),
      ).toMatchObject({ signedTotal: 12 });
    });

    it('derives a tie when both teams end level', () => {
      const match = newMatch();
      completePosition(match, 0, WorldChallengeSlotKey.SLOT_2, [
        { id: 'e1', teamId: TEAM_A.id, delta: 1 },
        { id: 'e2', teamId: TEAM_B.id, delta: 1 },
      ]);
      completePosition(match, 1, WorldChallengeSlotKey.SLOT_3, [
        { id: 'e3', teamId: TEAM_A.id, delta: 1 },
        { id: 'e4', teamId: TEAM_B.id, delta: 1 },
      ]);
      const result = match.result();
      expect(result.tie).toBe(true);
      expect(result.winnerTeamId).toBeNull();
    });

    it('keeps each occurrence of a repeated World on its own content pool', () => {
      const match = newMatch(['football', 'anime', 'football']);
      expect(match.selectedScopeIds(0)).toEqual(scopeIdsFor(0));
      expect(match.selectedScopeIds(2)).toEqual(scopeIdsFor(2));
      expect(match.selectedScopeIds(2)).not.toEqual(match.selectedScopeIds(0));
      expect(match.selectedScopeIds(0)).toEqual(scopeIdsFor(0));
    });

    it('reports the ContentItems an occurrence has already consumed', () => {
      const match = newMatch();
      launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-1', {
        contentItemIds: ['i1', 'i2', 'i3'],
      });
      expect(match.usedContentItemIds(0)).toEqual(['i1', 'i2', 'i3']);
      // A different occurrence has consumed nothing.
      expect(match.usedContentItemIds(1)).toEqual([]);
    });
  });

  describe('serialization', () => {
    it('round-trips through serialize and restore with progress intact', () => {
      const match = newMatch(['football', 'anime', 'football']);
      completePosition(match, 0, WorldChallengeSlotKey.SLOT_2);
      launch(match, 1, WorldChallengeSlotKey.SLOT_2, 'runtime-live');

      const state = match.serialize();
      const restored = Match.restore(state, state.scoreEvents);

      expect(restored.revision).toBe(match.revision);
      expect(restored.stage).toBe(MatchStage.CHALLENGE);
      expect(restored.currentChallenge).toMatchObject({
        runtimeId: 'runtime-live',
      });
      expect(restored.occurrences[0].slots.slot_2?.status).toBe(
        MatchSlotStatus.COMPLETED,
      );
      expect(restored.occurrences[2].slots.slot_2?.status).toBe(
        MatchSlotStatus.AVAILABLE,
      );
      expect(restored.teamScore(TEAM_A.id).signedTotal).toBe(
        match.teamScore(TEAM_A.id).signedTotal,
      );
      expect(restored.selectingTeamId).toBe(match.selectingTeamId);
      expect(restored.isDuplicate('launch-runtime-live')).toBe(true);
    });

    it('serializes defensively so callers cannot mutate internal state', () => {
      const match = newMatch();
      const state = match.serialize();
      state.configuredBoardPositions[0].challengeTypeSlug = 'forged';
      state.teams[0].name = 'tampered';
      expect(match.unifiedBoard()[0].challengeTypeSlug).not.toBe('forged');
      expect(match.teams[0].name).toBe(TEAM_A.name);
    });
  });

  describe('cancellation', () => {
    it('cancels an in-flight match and blocks further stage actions', () => {
      const match = newMatch();
      match.cancel({ commandId: 'c-cancel', now: NOW });
      expect(match.status).toBe(MatchStatus.CANCELLED);
      expect(() =>
        launch(match, 0, WorldChallengeSlotKey.SLOT_2, 'runtime-1'),
      ).toThrow(MatchDomainError);
    });

    it('refuses to cancel a completed match', () => {
      const match = newMatch();
      completeAll(match);
      expect(() =>
        match.cancel({ commandId: 'late-cancel', now: NOW }),
      ).toThrow(MatchDomainError);
    });
  });
});
