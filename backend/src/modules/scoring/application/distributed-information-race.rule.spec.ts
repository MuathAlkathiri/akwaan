import { ScoringRuleRegistry } from './scoring-rule.registry';
import { ScoringService } from './scoring.service';
import { SCORING_RULE_IDS } from '../domain/scoring-rule';
import { ScoreLedger } from '../domain/score-ledger';
import {
  DistributedInformationRaceInput,
  DistributedInformationRaceRule,
} from './distributed-information-race.rule';

const ALPHA = 'team-alpha';
const BETA = 'team-beta';

describe('distributed-information.race-result', () => {
  const scoring = () => {
    const registry = new ScoringRuleRegistry();
    registry.bind(new DistributedInformationRaceRule());
    return new ScoringService(registry);
  };

  const input = (
    overrides: Partial<DistributedInformationRaceInput> = {},
  ): DistributedInformationRaceInput => ({
    teamIds: [ALPHA, BETA],
    winnerTeamId: ALPHA,
    tie: false,
    reason: 'first_finished',
    solved: { [ALPHA]: 3, [BETA]: 2 },
    wrongAttempts: { [ALPHA]: 1, [BETA]: 4 },
    elapsedMsAtLastProgress: { [ALPHA]: 80_000, [BETA]: 95_000 },
    contentItemIds: ['item-1', 'item-2', 'item-3'],
    ...overrides,
  });

  const context = {
    matchId: 'live-session-1',
    challengeSessionId: 'runtime-1',
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const score = (overrides: Partial<DistributedInformationRaceInput> = {}) =>
    scoring().score(
      SCORING_RULE_IDS.DISTRIBUTED_INFORMATION_RACE_RESULT,
      input(overrides),
      context,
    );

  it('awards exactly one point to the winner', () => {
    const events = score();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      teamId: ALPHA,
      delta: 1,
      scoringRuleId: SCORING_RULE_IDS.DISTRIBUTED_INFORMATION_RACE_RESULT,
      challengeSessionId: 'runtime-1',
    });
  });

  it('awards nothing on a true tie', () => {
    expect(score({ winnerTeamId: null, tie: true, reason: 'tie' })).toEqual([]);
  });

  it('awards the same single point however the race was decided', () => {
    for (const reason of [
      'first_finished',
      'timeout_progress',
      'timeout_time',
    ] as const) {
      const events = score({ reason });
      expect(events).toHaveLength(1);
      expect(events[0].delta).toBe(1);
      // The reason travels with the event so a result screen can explain it.
      expect(events[0].reason).toBe(`distributed-information.${reason}`);
    }
  });

  it('never scores a team that was not in the race', () => {
    expect(score({ winnerTeamId: 'team-gamma' })).toEqual([]);
  });

  it('scores no individual puzzle and never a negative delta', () => {
    const events = score({ solved: { [ALPHA]: 3, [BETA]: 0 } });

    expect(events).toHaveLength(1);
    expect(events[0].delta).toBe(1);
    // Four wrong answers cost the loser nothing but their five-second locks.
    expect(events.some((event) => event.delta < 0)).toBe(false);
  });

  it('survives persistence and restores to the same ledger total', () => {
    const service = scoring();
    const minted = score();
    const restored = service.restoreEvents(
      JSON.parse(JSON.stringify(minted)) as unknown[],
    );

    expect(restored).toEqual(minted);
    const ledger = ScoreLedger.restore(JSON.parse(JSON.stringify(minted)));
    expect(ledger.signedTotal(ALPHA)).toBe(1);
    expect(ledger.signedTotal(BETA)).toBe(0);
  });

  it('mints one identifiable event, so an importer can refuse a duplicate', () => {
    const minted = score();
    const ledger = new ScoreLedger();
    ledger.record(...minted);

    // The ledger sums what it is given; recognising a replay is the importer's
    // job, and the Match aggregate does it by event id. What matters here is
    // that the event carries a stable identity to recognise.
    expect(ledger.has(minted[0].id)).toBe(true);
    expect(ledger.signedTotal(ALPHA)).toBe(1);
    expect(score()[0].id).not.toBe(minted[0].id);
    expect(
      ledger
        .historyForChallengeSession('runtime-1')
        .map((event) => event.delta),
    ).toEqual([1]);
  });

  it('carries only safe aggregates in its metadata', () => {
    const serialized = JSON.stringify(score());

    expect(serialized).toContain('solved');
    expect(serialized).toContain('wrongAttempts');
    // No segment text and no answers ever reach a ScoreEvent.
    expect(serialized).not.toContain('segment');
    expect(serialized).not.toContain('acceptedAnswers');
  });
});
