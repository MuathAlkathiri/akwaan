import { PerfectClearBonusRule } from '../application/perfect-clear-bonus.rule';
import { ScoringRuleRegistry } from '../application/scoring-rule.registry';
import { ScoringService } from '../application/scoring.service';
import { ScoreLedger } from './score-ledger';
import { isScoreEvent, ScoreEvent } from './score-event';
import { SCORING_RULE_IDS } from './scoring-rule';
import {
  ForeignScoreEventError,
  MalformedScoreEventError,
} from './scoring.errors';

/**
 * Mechanics persist their minted events inside their gameplay runtime state, so a
 * Match imports scoring by restoring those events rather than recalculating them.
 */
describe('persisted score event restoration', () => {
  const registry = new ScoringRuleRegistry();
  registry.bind(new PerfectClearBonusRule(registry));
  const scoring = new ScoringService(registry);

  /** Exactly what survives JSON.stringify inside a runtime state. */
  const persisted = (overrides: Record<string, unknown> = {}) => ({
    id: 'event-1',
    // Historically the live-session id: provenance, never the correlation key.
    matchId: 'live-session-1',
    teamId: 'team-a',
    challengeSessionId: 'runtime-1',
    scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
    delta: 1,
    reason: 'ryo.trust.correct',
    metadata: { itemIndex: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('restores a persisted event into a usable branded event', () => {
    const [event] = scoring.restoreEvents([persisted()]);
    expect(isScoreEvent(event)).toBe(true);
    expect(event).toMatchObject({
      id: 'event-1',
      teamId: 'team-a',
      challengeSessionId: 'runtime-1',
      delta: 1,
      reason: 'ryo.trust.correct',
      metadata: { itemIndex: 0 },
    });
    expect(event.createdAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('carries the historical matchId through untouched', () => {
    const [event] = scoring.restoreEvents([persisted()]);
    expect(event.matchId).toBe('live-session-1');
  });

  it('round-trips a real minted event without altering it', () => {
    const [minted] = scoring.score(
      SCORING_RULE_IDS.CHALLENGE_PERFECT_CLEAR_BONUS,
      {
        teamId: 'team-b',
        challengeScoringRuleId: SCORING_RULE_IDS.COOP_ITEM_SUCCESS,
        clearedItemCount: 3,
        totalItemCount: 3,
      },
      {
        matchId: 'live-session-1',
        challengeSessionId: 'runtime-9',
        occurredAt: new Date('2026-02-02T00:00:00.000Z'),
      },
    );
    const [restored] = scoring.restoreEvents([
      JSON.parse(JSON.stringify(minted)) as unknown,
    ]);
    expect(restored).toEqual(minted);
  });

  it('preserves a negative delta', () => {
    const [event] = scoring.restoreEvents([
      persisted({ delta: -1, reason: 'ryo.steal.failed' }),
    ]);
    expect(event.delta).toBe(-1);
  });

  it('rejects malformed events instead of dropping them', () => {
    const cases: unknown[] = [
      'nope',
      null,
      persisted({ id: '' }),
      persisted({ teamId: undefined }),
      persisted({ challengeSessionId: '' }),
      persisted({ scoringRuleId: undefined }),
      persisted({ reason: '' }),
      persisted({ delta: 0.5 }),
      persisted({ delta: 'one' }),
      persisted({ createdAt: 'not-a-date' }),
    ];
    for (const value of cases) {
      expect(() => scoring.restoreEvents([value])).toThrow(
        MalformedScoreEventError,
      );
    }
  });

  it('rebuilds ledger totals with display clamping that never mutates history', () => {
    const ledger = scoring.restoreLedger([
      persisted({ id: 'e1', delta: 1 }),
      persisted({ id: 'e2', delta: -1, reason: 'ryo.steal.failed' }),
      persisted({ id: 'e3', delta: -3, reason: 'ryo.steal.failed' }),
    ]);
    expect(ledger.signedTotal('team-a')).toBe(-3);
    expect(ledger.displayTotal('team-a')).toBe(0);
    // Reading a display total must not rewrite the signed history.
    expect(ledger.signedTotal('team-a')).toBe(-3);
    expect(ledger.history().map((event) => event.delta)).toEqual([1, -1, -3]);
  });

  it('correlates restored events by challenge session, not by matchId', () => {
    const ledger = scoring.restoreLedger([
      persisted({ id: 'e1', challengeSessionId: 'runtime-1' }),
      persisted({ id: 'e2', challengeSessionId: 'runtime-2' }),
    ]);
    expect(ledger.historyForChallengeSession('runtime-2')).toHaveLength(1);
    expect(ledger.historyForChallengeSession('runtime-2')[0].id).toBe('e2');
    expect(ledger.has('e1')).toBe(true);
    expect(ledger.has('missing')).toBe(false);
  });

  it('keeps brand protection intact: a hand-rolled event is still refused', () => {
    const ledger = new ScoreLedger();
    expect(() => ledger.record(persisted() as unknown as ScoreEvent)).toThrow(
      ForeignScoreEventError,
    );
    expect(ledger.history()).toHaveLength(0);
  });
});
