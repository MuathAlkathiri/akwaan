import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { ScoringService } from '../../scoring/application/scoring.service';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import { ScoreEvent } from '../../scoring/domain/score-event';
import { Match } from './match';
import {
  MatchSlotLaunchability,
  MatchSlotStatus,
  MatchStage,
  MatchStatus,
  WorldSelectionMethod,
} from './match.constants';
import { MatchDomainError, MatchStaleRevisionError } from './match.errors';

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

function newMatch(): Match {
  return Match.create({
    liveSessionId: 'live-session-1',
    teams: [TEAM_A, TEAM_B],
    now: NOW,
  });
}

/** Drives a Match to the board stage with a given schedule per occurrence. */
function matchOnBoard(
  worldIds: [string, string, string] = ['w1', 'w2', 'w3'],
  schedule: WorldChallengeSlotKey[] = [
    WorldChallengeSlotKey.SLOT_2,
    WorldChallengeSlotKey.SLOT_3,
  ],
): Match {
  const match = newMatch();
  match.start({ commandId: 'c-start', now: NOW });
  match.resolveCoinToss({
    commandId: 'c-toss',
    now: NOW,
    winnerTeamId: TEAM_A.id,
    roll: 0.2,
  });
  match.selectWorld({
    commandId: 'c-w1',
    now: NOW,
    worldId: worldIds[0],
    method: WorldSelectionMethod.TEAM_PICK,
    selectedByTeamId: TEAM_A.id,
    scheduledSlotKeys: schedule,
  });
  match.selectWorld({
    commandId: 'c-w2',
    now: NOW,
    worldId: worldIds[1],
    method: WorldSelectionMethod.TEAM_PICK,
    selectedByTeamId: TEAM_B.id,
    scheduledSlotKeys: schedule,
  });
  match.selectWorld({
    commandId: 'c-w3',
    now: NOW,
    worldId: worldIds[2],
    method: WorldSelectionMethod.AGREED,
    scheduledSlotKeys: schedule,
  });
  selectScopesFor(match, 0);
  return match;
}

/** The four Scopes one occurrence draws its content from. */
export function scopeIdsFor(occurrenceIndex: number): string[] {
  return ['a', 'b', 'c', 'd'].map(
    (suffix) => `scope-${occurrenceIndex}-${suffix}`,
  );
}

/**
 * Moves to the next occurrence and answers its own Scope selection, which every
 * occurrence owes before its board opens.
 */
function advanceToNextOccurrence(match: Match, commandId: string): void {
  match.advanceToNextWorld({ commandId, now: NOW });
  if (match.stage === MatchStage.SCOPE_SELECTION) {
    selectScopesFor(match, match.currentOccurrenceIndex);
  }
}

function selectScopesFor(match: Match, occurrenceIndex: number): void {
  match.selectScopes({
    commandId: `c-scopes-${occurrenceIndex}`,
    now: NOW,
    occurrenceIndex,
    scopeIds: scopeIdsFor(occurrenceIndex),
  });
}

/** Plays every scheduled slot of the current occurrence to completion. */
function completeCurrentOccurrence(match: Match, tag: string): void {
  const occurrence = match.occurrences[match.currentOccurrenceIndex];
  for (const slotKey of occurrence.scheduledSlotKeys) {
    const runtimeId = `${tag}-${slotKey}`;
    match.launchChallenge({
      commandId: `launch-${runtimeId}`,
      now: NOW,
      occurrenceIndex: match.currentOccurrenceIndex,
      slotKey,
      challengeKey: 'read-your-opponent',
      runtimeId,
      contentItemIds: ['i1', 'i2', 'i3'],
      launchability: MatchSlotLaunchability.LAUNCHABLE,
    });
    match.completeChallenge({
      commandId: `complete-${runtimeId}`,
      now: NOW,
      runtimeId,
      events: events(runtimeId, [
        { id: `${runtimeId}-e1`, teamId: TEAM_A.id, delta: 1 },
      ]),
    });
  }
}

describe('Match aggregate', () => {
  describe('creation and identity', () => {
    it('starts in the lobby as a draft with a zero revision', () => {
      const match = newMatch();
      expect(match.stage).toBe(MatchStage.LOBBY);
      expect(match.status).toBe(MatchStatus.DRAFT);
      expect(match.revision).toBe(0);
      expect(match.liveSessionId).toBe('live-session-1');
    });

    it('requires exactly two distinct teams', () => {
      expect(() =>
        Match.create({
          liveSessionId: 's',
          teams: [TEAM_A],
          now: NOW,
        }),
      ).toThrow(MatchDomainError);
      expect(() =>
        Match.create({
          liveSessionId: 's',
          teams: [TEAM_A, TEAM_A],
          now: NOW,
        }),
      ).toThrow(MatchDomainError);
    });

    it('rejects a stale revision', () => {
      const match = newMatch();
      expect(() => match.assertRevision(0)).not.toThrow();
      match.start({ commandId: 'c-start', now: NOW });
      expect(() => match.assertRevision(0)).toThrow(MatchStaleRevisionError);
      expect(() => match.assertRevision(1)).not.toThrow();
    });
  });

  describe('coin toss', () => {
    it('resolves once and hands the first pick to the winner', () => {
      const match = newMatch();
      match.start({ commandId: 'c-start', now: NOW });
      expect(match.stage).toBe(MatchStage.COIN_TOSS);
      match.resolveCoinToss({
        commandId: 'c-toss',
        now: NOW,
        winnerTeamId: TEAM_B.id,
        roll: 0.9,
      });
      expect(match.coinToss).toMatchObject({
        winnerTeamId: TEAM_B.id,
        roll: 0.9,
      });
      expect(match.stage).toBe(MatchStage.WORLD_SELECTION);
      expect(match.nextSelectionTurn()).toMatchObject({
        occurrenceIndex: 0,
        teamId: TEAM_B.id,
      });
    });

    it('is idempotent by commandId and never re-tosses', () => {
      const match = newMatch();
      match.start({ commandId: 'c-start', now: NOW });
      match.resolveCoinToss({
        commandId: 'c-toss',
        now: NOW,
        winnerTeamId: TEAM_A.id,
        roll: 0.1,
      });
      const revision = match.revision;
      match.resolveCoinToss({
        commandId: 'c-toss',
        now: NOW,
        winnerTeamId: TEAM_B.id,
        roll: 0.99,
      });
      // A different commandId must still not overwrite a settled toss.
      match.resolveCoinToss({
        commandId: 'c-toss-again',
        now: NOW,
        winnerTeamId: TEAM_B.id,
        roll: 0.99,
      });
      expect(match.coinToss?.winnerTeamId).toBe(TEAM_A.id);
      expect(match.revision).toBe(revision);
    });

    it('refuses a team that is not playing', () => {
      const match = newMatch();
      match.start({ commandId: 'c-start', now: NOW });
      expect(() =>
        match.resolveCoinToss({
          commandId: 'c-toss',
          now: NOW,
          winnerTeamId: 'stranger',
          roll: 0.5,
        }),
      ).toThrow(MatchDomainError);
    });
  });

  describe('World selection', () => {
    it('takes exactly three occurrences and then opens the board', () => {
      const match = matchOnBoard();
      expect(match.occurrences).toHaveLength(3);
      expect(match.stage).toBe(MatchStage.BOARD);
      expect(match.nextSelectionTurn()).toBeUndefined();
      expect(match.currentOccurrenceIndex).toBe(0);
    });

    it('allows the same World more than once without deduplicating', () => {
      const match = matchOnBoard(['football', 'anime', 'football']);
      expect(match.occurrences.map((entry) => entry.worldId)).toEqual([
        'football',
        'anime',
        'football',
      ]);
      expect(match.selections).toHaveLength(3);
    });

    it('enforces the pick order and the third-World rule', () => {
      const match = newMatch();
      match.start({ commandId: 'c-start', now: NOW });
      match.resolveCoinToss({
        commandId: 'c-toss',
        now: NOW,
        winnerTeamId: TEAM_A.id,
        roll: 0.2,
      });
      // Team B cannot jump the toss winner's first pick.
      expect(() =>
        match.selectWorld({
          commandId: 'x1',
          now: NOW,
          worldId: 'w1',
          method: WorldSelectionMethod.TEAM_PICK,
          selectedByTeamId: TEAM_B.id,
          scheduledSlotKeys: [WorldChallengeSlotKey.SLOT_2],
        }),
      ).toThrow(MatchDomainError);

      match.selectWorld({
        commandId: 'c-w1',
        now: NOW,
        worldId: 'w1',
        method: WorldSelectionMethod.TEAM_PICK,
        selectedByTeamId: TEAM_A.id,
        scheduledSlotKeys: [WorldChallengeSlotKey.SLOT_2],
      });
      match.selectWorld({
        commandId: 'c-w2',
        now: NOW,
        worldId: 'w2',
        method: WorldSelectionMethod.TEAM_PICK,
        selectedByTeamId: TEAM_B.id,
        scheduledSlotKeys: [WorldChallengeSlotKey.SLOT_2],
      });
      // The third position is agreed or random, never a unilateral team pick.
      expect(match.nextSelectionTurn()).toMatchObject({
        occurrenceIndex: 2,
        requiresAgreement: true,
      });
      expect(() =>
        match.selectWorld({
          commandId: 'x3',
          now: NOW,
          worldId: 'w3',
          method: WorldSelectionMethod.TEAM_PICK,
          selectedByTeamId: TEAM_A.id,
          scheduledSlotKeys: [WorldChallengeSlotKey.SLOT_2],
        }),
      ).toThrow(MatchDomainError);
      match.selectWorld({
        commandId: 'c-w3',
        now: NOW,
        worldId: 'w3',
        method: WorldSelectionMethod.RANDOM,
        scheduledSlotKeys: [WorldChallengeSlotKey.SLOT_2],
      });
      expect(match.selections[2].method).toBe(WorldSelectionMethod.RANDOM);
      expect(match.selections[2].selectedByTeamId).toBeUndefined();
    });

    it('records provenance for every selection', () => {
      const match = matchOnBoard();
      expect(match.selections[0]).toMatchObject({
        occurrenceIndex: 0,
        worldId: 'w1',
        method: WorldSelectionMethod.TEAM_PICK,
        selectedByTeamId: TEAM_A.id,
      });
      expect(match.selections[0].selectedAt).toEqual(NOW);
    });

    it('rejects an empty or duplicated schedule', () => {
      const match = newMatch();
      match.start({ commandId: 'c-start', now: NOW });
      match.resolveCoinToss({
        commandId: 'c-toss',
        now: NOW,
        winnerTeamId: TEAM_A.id,
        roll: 0.2,
      });
      expect(() =>
        match.selectWorld({
          commandId: 'e1',
          now: NOW,
          worldId: 'w1',
          method: WorldSelectionMethod.TEAM_PICK,
          selectedByTeamId: TEAM_A.id,
          scheduledSlotKeys: [],
        }),
      ).toThrow(MatchDomainError);
      expect(() =>
        match.selectWorld({
          commandId: 'e2',
          now: NOW,
          worldId: 'w1',
          method: WorldSelectionMethod.TEAM_PICK,
          selectedByTeamId: TEAM_A.id,
          scheduledSlotKeys: [
            WorldChallengeSlotKey.SLOT_2,
            WorldChallengeSlotKey.SLOT_2,
          ],
        }),
      ).toThrow(MatchDomainError);
    });
  });

  describe('Scope selection', () => {
    /** A Match with its three Worlds chosen, owing the first occurrence's Scopes. */
    const awaitingScopes = () => {
      const match = newMatch();
      match.start({ commandId: 'c-start', now: NOW });
      match.resolveCoinToss({
        commandId: 'c-toss',
        now: NOW,
        winnerTeamId: TEAM_A.id,
        roll: 0.2,
      });
      for (const [index, method] of [
        WorldSelectionMethod.TEAM_PICK,
        WorldSelectionMethod.TEAM_PICK,
        WorldSelectionMethod.AGREED,
      ].entries()) {
        match.selectWorld({
          commandId: `c-w${index}`,
          now: NOW,
          worldId: `w${index}`,
          method,
          ...(method === WorldSelectionMethod.TEAM_PICK
            ? { selectedByTeamId: index === 0 ? TEAM_A.id : TEAM_B.id }
            : {}),
          scheduledSlotKeys: [WorldChallengeSlotKey.SLOT_2],
        });
      }
      return match;
    };

    it('asks for Scopes before the first board, not during World selection', () => {
      const match = awaitingScopes();

      expect(match.stage).toBe(MatchStage.SCOPE_SELECTION);
      expect(match.hasCompleteScopeSelection()).toBe(false);
      expect(match.selectedScopeIds()).toEqual([]);
    });

    it('opens the board once exactly four Scopes are chosen', () => {
      const match = awaitingScopes();

      match.selectScopes({
        commandId: 'c-scopes',
        now: NOW,
        occurrenceIndex: 0,
        scopeIds: ['s1', 's2', 's3', 's4'],
      });

      expect(match.stage).toBe(MatchStage.BOARD);
      expect(match.selectedScopeIds()).toEqual(['s1', 's2', 's3', 's4']);
      expect(match.hasCompleteScopeSelection()).toBe(true);
      expect(match.occurrences[0].selectedScopesAt).toEqual(NOW);
    });

    it('refuses any count other than four', () => {
      for (const scopeIds of [
        [],
        ['s1'],
        ['s1', 's2', 's3'],
        ['s1', 's2', 's3', 's4', 's5'],
      ]) {
        expect(() =>
          awaitingScopes().selectScopes({
            commandId: 'c-scopes',
            now: NOW,
            occurrenceIndex: 0,
            scopeIds,
          }),
        ).toThrow(/exactly 4 Scopes/);
      }
    });

    it('refuses the same Scope twice', () => {
      expect(() =>
        awaitingScopes().selectScopes({
          commandId: 'c-scopes',
          now: NOW,
          occurrenceIndex: 0,
          scopeIds: ['s1', 's1', 's2', 's3'],
        }),
      ).toThrow(/cannot be selected twice/);
    });

    it('refuses a selection aimed at another occurrence', () => {
      expect(() =>
        awaitingScopes().selectScopes({
          commandId: 'c-scopes',
          now: NOW,
          occurrenceIndex: 2,
          scopeIds: ['s1', 's2', 's3', 's4'],
        }),
      ).toThrow(/not the one being played/);
    });

    it('ignores a replayed selection command', () => {
      const match = awaitingScopes();
      match.selectScopes({
        commandId: 'c-scopes',
        now: NOW,
        occurrenceIndex: 0,
        scopeIds: ['s1', 's2', 's3', 's4'],
      });
      const revision = match.revision;

      match.selectScopes({
        commandId: 'c-scopes',
        now: NOW,
        occurrenceIndex: 0,
        scopeIds: ['x1', 'x2', 'x3', 'x4'],
      });

      expect(match.revision).toBe(revision);
      expect(match.selectedScopeIds()).toEqual(['s1', 's2', 's3', 's4']);
    });

    it('refuses to launch a challenge before the pool exists', () => {
      const match = awaitingScopes();
      expect(() =>
        match.launchChallenge({
          commandId: 'c-launch',
          now: NOW,
          occurrenceIndex: match.currentOccurrenceIndex,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          challengeKey: 'read-your-opponent',
          runtimeId: 'runtime-1',
          contentItemIds: ['i1', 'i2', 'i3'],
          launchability: MatchSlotLaunchability.LAUNCHABLE,
        }),
      ).toThrow(/not the current stage|scope_selection/i);
    });

    it('keeps each occurrence of a repeated World on its own Scopes', () => {
      const match = matchOnBoard(['football', 'anime', 'football']);
      expect(match.selectedScopeIds(0)).toEqual(scopeIdsFor(0));

      completeCurrentOccurrence(match, 'occ0');
      advanceToNextOccurrence(match, 'adv-1');
      completeCurrentOccurrence(match, 'occ1');
      advanceToNextOccurrence(match, 'adv-2');

      // Football twice, two different content pools.
      expect(match.occurrences[2].worldId).toBe('football');
      expect(match.selectedScopeIds(2)).toEqual(scopeIdsFor(2));
      expect(match.selectedScopeIds(2)).not.toEqual(match.selectedScopeIds(0));
      expect(match.selectedScopeIds(0)).toEqual(scopeIdsFor(0));
    });

    it('reports the ContentItems an occurrence has already consumed', () => {
      const match = matchOnBoard();
      match.launchChallenge({
        commandId: 'c-launch',
        now: NOW,
        occurrenceIndex: match.currentOccurrenceIndex,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        challengeKey: 'read-your-opponent',
        runtimeId: 'runtime-1',
        contentItemIds: ['i1', 'i2', 'i3'],
        launchability: MatchSlotLaunchability.LAUNCHABLE,
      });

      expect(match.usedContentItemIds()).toEqual(['i1', 'i2', 'i3']);
      // A different occurrence has consumed nothing.
      expect(match.usedContentItemIds(1)).toEqual([]);
    });
  });

  describe('board and launching', () => {
    it('binds a slot to a runtime and moves into the challenge stage', () => {
      const match = matchOnBoard();
      match.launchChallenge({
        commandId: 'c-launch',
        now: NOW,
        occurrenceIndex: match.currentOccurrenceIndex,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        challengeKey: 'read-your-opponent',
        runtimeId: 'runtime-1',
        contentItemIds: ['i1', 'i2', 'i3'],
        launchability: MatchSlotLaunchability.LAUNCHABLE,
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

    it('refuses to launch a mechanic that has no launcher', () => {
      const match = matchOnBoard(
        ['w1', 'w2', 'w3'],
        [WorldChallengeSlotKey.SLOT_1],
      );
      expect(() =>
        match.launchChallenge({
          commandId: 'c-launch',
          now: NOW,
          occurrenceIndex: match.currentOccurrenceIndex,
          slotKey: WorldChallengeSlotKey.SLOT_1,
          challengeKey: 'some-signature',
          runtimeId: 'runtime-x',
          contentItemIds: ['i1'],
          launchability: MatchSlotLaunchability.CONFIGURED_BUT_UNIMPLEMENTED,
        }),
      ).toThrow(MatchDomainError);
      // The slot stays available: nothing was skipped or auto-completed.
      expect(match.occurrences[0].slots.slot_1?.status).toBe(
        MatchSlotStatus.AVAILABLE,
      );
      expect(match.stage).toBe(MatchStage.BOARD);
    });

    it('refuses an unscheduled slot, a busy slot, and a completed slot', () => {
      const match = matchOnBoard();
      expect(() =>
        match.launchChallenge({
          commandId: 'c-flex',
          now: NOW,
          occurrenceIndex: match.currentOccurrenceIndex,
          slotKey: WorldChallengeSlotKey.SLOT_4,
          challengeKey: 'read-your-opponent',
          runtimeId: 'r',
          contentItemIds: [],
          launchability: MatchSlotLaunchability.LAUNCHABLE,
        }),
      ).toThrow(MatchDomainError);

      match.launchChallenge({
        commandId: 'c-launch',
        now: NOW,
        occurrenceIndex: match.currentOccurrenceIndex,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        challengeKey: 'read-your-opponent',
        runtimeId: 'runtime-1',
        contentItemIds: ['i1', 'i2', 'i3'],
        launchability: MatchSlotLaunchability.LAUNCHABLE,
      });
      // Launching again is now blocked by the challenge stage itself.
      expect(() =>
        match.launchChallenge({
          commandId: 'c-launch-2',
          now: NOW,
          occurrenceIndex: match.currentOccurrenceIndex,
          slotKey: WorldChallengeSlotKey.SLOT_3,
          challengeKey: 'read-your-opponent',
          runtimeId: 'runtime-2',
          contentItemIds: ['i1', 'i2', 'i3'],
          launchability: MatchSlotLaunchability.LAUNCHABLE,
        }),
      ).toThrow(MatchDomainError);

      match.completeChallenge({
        commandId: 'c-done',
        now: NOW,
        runtimeId: 'runtime-1',
        events: [],
      });
      expect(() =>
        match.launchChallenge({
          commandId: 'c-relaunch',
          now: NOW,
          occurrenceIndex: match.currentOccurrenceIndex,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          challengeKey: 'read-your-opponent',
          runtimeId: 'runtime-1b',
          contentItemIds: ['i1', 'i2', 'i3'],
          launchability: MatchSlotLaunchability.LAUNCHABLE,
        }),
      ).toThrow(MatchDomainError);
    });

    it('keeps progress separate for a repeated World', () => {
      const match = matchOnBoard(['football', 'anime', 'football']);
      completeCurrentOccurrence(match, 'occ0');
      expect(match.stage).toBe(MatchStage.WORLD_COMPLETE);
      advanceToNextOccurrence(match, 'adv-1');

      // Occurrence 0 (Football) is complete; occurrence 2 (Football again) is not.
      expect(match.occurrences[0].slots.slot_2?.status).toBe(
        MatchSlotStatus.COMPLETED,
      );
      expect(match.occurrences[2].slots.slot_2?.status).toBe(
        MatchSlotStatus.AVAILABLE,
      );
      expect(match.occurrences[0].completedAt).toEqual(NOW);
      expect(match.occurrences[2].completedAt).toBeUndefined();
    });
  });

  describe('completion and scoring', () => {
    it('imports signed events exactly once, even on a repeated terminal', () => {
      const match = matchOnBoard();
      match.launchChallenge({
        commandId: 'c-launch',
        now: NOW,
        occurrenceIndex: match.currentOccurrenceIndex,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        challengeKey: 'read-your-opponent',
        runtimeId: 'runtime-1',
        contentItemIds: ['i1', 'i2', 'i3'],
        launchability: MatchSlotLaunchability.LAUNCHABLE,
      });
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
      expect(match.stage).toBe(MatchStage.BOARD);
    });

    it('preserves negative totals and clamps only the display value', () => {
      const match = matchOnBoard();
      match.launchChallenge({
        commandId: 'c-launch',
        now: NOW,
        occurrenceIndex: match.currentOccurrenceIndex,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        challengeKey: 'read-your-opponent',
        runtimeId: 'runtime-1',
        contentItemIds: ['i1', 'i2', 'i3'],
        launchability: MatchSlotLaunchability.LAUNCHABLE,
      });
      match.completeChallenge({
        commandId: 'c-done',
        now: NOW,
        runtimeId: 'runtime-1',
        events: events('runtime-1', [
          { id: 'e1', teamId: TEAM_B.id, delta: -1 },
          { id: 'e2', teamId: TEAM_B.id, delta: -2 },
        ]),
      });
      expect(match.teamScore(TEAM_B.id)).toEqual({
        teamId: TEAM_B.id,
        signedTotal: -3,
        displayTotal: 0,
      });
    });

    it('ignores a terminal for a runtime it never bound', () => {
      const match = matchOnBoard();
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

    it('derives World subtotals per occurrence', () => {
      const match = matchOnBoard();
      completeCurrentOccurrence(match, 'occ0');
      advanceToNextOccurrence(match, 'adv-1');
      completeCurrentOccurrence(match, 'occ1');

      const first = match.worldSubtotals(0);
      expect(first.find((team) => team.teamId === TEAM_A.id)).toMatchObject({
        signedTotal: 2,
      });
      expect(match.worldSubtotals(2)).toEqual([
        { teamId: TEAM_A.id, signedTotal: 0, displayTotal: 0 },
        { teamId: TEAM_B.id, signedTotal: 0, displayTotal: 0 },
      ]);
    });

    it('completes the Match after the third occurrence and derives a winner', () => {
      const match = matchOnBoard();
      completeCurrentOccurrence(match, 'occ0');
      advanceToNextOccurrence(match, 'adv-1');
      completeCurrentOccurrence(match, 'occ1');
      expect(match.stage).toBe(MatchStage.WORLD_COMPLETE);
      advanceToNextOccurrence(match, 'adv-2');
      completeCurrentOccurrence(match, 'occ2');

      expect(match.stage).toBe(MatchStage.MATCH_COMPLETE);
      expect(match.status).toBe(MatchStatus.COMPLETED);
      const result = match.result();
      expect(result.winnerTeamId).toBe(TEAM_A.id);
      expect(result.tie).toBe(false);
      expect(result.worlds).toHaveLength(3);
      expect(
        result.teams.find((team) => team.teamId === TEAM_A.id),
      ).toMatchObject({ signedTotal: 6 });
    });

    it('derives a tie when both teams end level', () => {
      const match = matchOnBoard(
        ['w1', 'w2', 'w3'],
        [WorldChallengeSlotKey.SLOT_2],
      );
      for (let occurrence = 0; occurrence < 3; occurrence += 1) {
        const runtimeId = `r${occurrence}`;
        match.launchChallenge({
          commandId: `l${occurrence}`,
          now: NOW,
          occurrenceIndex: match.currentOccurrenceIndex,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          challengeKey: 'read-your-opponent',
          runtimeId,
          contentItemIds: ['i1', 'i2', 'i3'],
          launchability: MatchSlotLaunchability.LAUNCHABLE,
        });
        match.completeChallenge({
          commandId: `d${occurrence}`,
          now: NOW,
          runtimeId,
          events: events(runtimeId, [
            { id: `${runtimeId}-a`, teamId: TEAM_A.id, delta: 1 },
            { id: `${runtimeId}-b`, teamId: TEAM_B.id, delta: 1 },
          ]),
        });
        if (match.stage === MatchStage.WORLD_COMPLETE) {
          advanceToNextOccurrence(match, `adv${occurrence}`);
        }
      }
      const result = match.result();
      expect(result.tie).toBe(true);
      expect(result.winnerTeamId).toBeNull();
    });
  });

  describe('serialization', () => {
    it('round-trips through serialize and restore with progress intact', () => {
      const match = matchOnBoard(['football', 'anime', 'football']);
      completeCurrentOccurrence(match, 'occ0');
      advanceToNextOccurrence(match, 'adv-1');
      match.launchChallenge({
        commandId: 'live-launch',
        now: NOW,
        occurrenceIndex: match.currentOccurrenceIndex,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        challengeKey: 'top-10',
        runtimeId: 'runtime-live',
        contentItemIds: ['single'],
        launchability: MatchSlotLaunchability.LAUNCHABLE,
      });

      const state = match.serialize();
      const restored = Match.restore(state, state.scoreEvents);

      expect(restored.revision).toBe(match.revision);
      expect(restored.stage).toBe(MatchStage.CHALLENGE);
      expect(restored.currentChallenge).toMatchObject({
        runtimeId: 'runtime-live',
        challengeKey: 'top-10',
        contentItemIds: ['single'],
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
      expect(restored.isDuplicate('live-launch')).toBe(true);
    });

    it('serializes defensively so callers cannot mutate internal state', () => {
      const match = matchOnBoard();
      const state = match.serialize();
      state.occurrences[0].scheduledSlotKeys.push(WorldChallengeSlotKey.SLOT_4);
      state.teams[0].name = 'tampered';
      expect(match.occurrences[0].scheduledSlotKeys).toHaveLength(2);
      expect(match.teams[0].name).toBe(TEAM_A.name);
    });
  });

  describe('cancellation', () => {
    it('cancels an in-flight match and blocks further stage actions', () => {
      const match = matchOnBoard();
      match.cancel({ commandId: 'c-cancel', now: NOW });
      expect(match.status).toBe(MatchStatus.CANCELLED);
      expect(() =>
        match.launchChallenge({
          commandId: 'after-cancel',
          now: NOW,
          occurrenceIndex: match.currentOccurrenceIndex,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          challengeKey: 'read-your-opponent',
          runtimeId: 'r',
          contentItemIds: ['i1', 'i2', 'i3'],
          launchability: MatchSlotLaunchability.LAUNCHABLE,
        }),
      ).toThrow(MatchDomainError);
    });

    it('refuses to cancel a completed match', () => {
      const match = matchOnBoard(
        ['w1', 'w2', 'w3'],
        [WorldChallengeSlotKey.SLOT_2],
      );
      for (let occurrence = 0; occurrence < 3; occurrence += 1) {
        const runtimeId = `r${occurrence}`;
        match.launchChallenge({
          commandId: `l${occurrence}`,
          now: NOW,
          occurrenceIndex: match.currentOccurrenceIndex,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          challengeKey: 'read-your-opponent',
          runtimeId,
          contentItemIds: ['i1', 'i2', 'i3'],
          launchability: MatchSlotLaunchability.LAUNCHABLE,
        });
        match.completeChallenge({
          commandId: `d${occurrence}`,
          now: NOW,
          runtimeId,
          events: [],
        });
        if (match.stage === MatchStage.WORLD_COMPLETE) {
          advanceToNextOccurrence(match, `adv${occurrence}`);
        }
      }
      expect(() =>
        match.cancel({ commandId: 'late-cancel', now: NOW }),
      ).toThrow(MatchDomainError);
    });
  });
});
