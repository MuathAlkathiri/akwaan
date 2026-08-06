import { ScoringService } from '../../scoring/application/scoring.service';
import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import { RuntimeScoreEventCollector } from './runtime-score-event.collector';

const persisted = (overrides: Record<string, unknown> = {}) => ({
  id: 'event-1',
  matchId: 'live-session-7',
  teamId: 'team-alpha',
  challengeSessionId: 'runtime-1',
  scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
  delta: -2,
  reason: 'STEAL_WRONG',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const runtime = (state: Record<string, unknown>): GameplayRuntimeState =>
  ({ runtimeState: state }) as unknown as GameplayRuntimeState;

describe('RuntimeScoreEventCollector', () => {
  const collector = new RuntimeScoreEventCollector(
    new ScoringService(new ScoringRuleRegistry()),
  );

  it('collects nothing when the mechanic minted nothing', () => {
    expect(collector.collect(runtime({}), 'runtime-1')).toEqual([]);
    expect(
      collector.collect(runtime({ scoreEventsJson: '[]' }), 'runtime-1'),
    ).toEqual([]);
  });

  it('restores signed events through the scoring module, negatives intact', () => {
    const events = collector.collect(
      runtime({ scoreEventsJson: JSON.stringify([persisted()]) }),
      'runtime-1',
    );

    expect(events).toHaveLength(1);
    expect(events[0].delta).toBe(-2);
    // Provenance is preserved: matchId still names the live session that minted it.
    expect(events[0].matchId).toBe('live-session-7');
  });

  it('refuses events belonging to another gameplay runtime', () => {
    expect(() =>
      collector.collect(
        runtime({ scoreEventsJson: JSON.stringify([persisted()]) }),
        'runtime-other',
      ),
    ).toThrow(/different gameplay runtime/);
  });

  it('refuses unusable payloads rather than silently scoring zero', () => {
    expect(() =>
      collector.collect(runtime({ scoreEventsJson: 'not json' }), 'runtime-1'),
    ).toThrow(/could not be parsed/);
    expect(() =>
      collector.collect(runtime({ scoreEventsJson: '{"a":1}' }), 'runtime-1'),
    ).toThrow(/must be a list/);
    expect(() =>
      collector.collect(runtime({ scoreEventsJson: 42 }), 'runtime-1'),
    ).toThrow(/JSON text/);
    expect(() =>
      collector.collect(
        runtime({
          scoreEventsJson: JSON.stringify([persisted({ delta: 1.5 })]),
        }),
        'runtime-1',
      ),
    ).toThrow(/could not be restored/);
  });
});
