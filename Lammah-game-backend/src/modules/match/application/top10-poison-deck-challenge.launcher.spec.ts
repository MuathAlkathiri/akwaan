import { GameplayModeState } from '../../live-game-sessions/domain/gameplay-mode.plugin';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  TOP10_MODE_KEY,
  TOP10_POISON_DECK_VARIANT,
  Top10Result,
  TOP10_POISON_DECK_PLUGIN,
} from '../../live-game-sessions/domain/top10-poison-deck.plugin';
import { RYO_MODE_KEY } from '../../live-game-sessions/domain/ryo-gameplay.plugin';
import { ScoringService } from '../../scoring/application/scoring.service';
import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import { ChallengeLauncherRegistry } from './challenge-launcher.registry';
import { RuntimeScoreEventCollector } from './runtime-score-event.collector';
import { Top10PoisonDeckChallengeLauncher } from './top10-poison-deck-challenge.launcher';

const TEAMS = ['team-alpha', 'team-beta'];
const CARD_COUNT = 14;

/**
 * The plugin drives its own state here: every phase this adapter reacts to is
 * produced by running the real commands, never by hand-writing the shape.
 */
function playDeck(): {
  assigning: GameplayModeState;
  revealing: GameplayModeState;
  completed: GameplayModeState;
} {
  const candidates = Array.from({ length: CARD_COUNT }, (_, index) => ({
    id: `card-${index + 1}`,
    label: `candidate ${index + 1}`,
  }));
  const now = new Date('2026-01-01T00:00:00.000Z');
  let runtimeState = TOP10_POISON_DECK_PLUGIN.createInitialRuntimeState({
    sessionId: 'session-1',
    runtimeId: 'runtime-1',
    initialState: {
      variant: TOP10_POISON_DECK_VARIANT,
      contentItemId: 'content-1',
      title: 'Top scorers',
      rankingBasis: 'goals',
      sourceLabel: 'archive',
      candidatesJson: JSON.stringify(candidates),
      deckJson: JSON.stringify(candidates.map((candidate) => candidate.id)),
      rankedAnswerJson: JSON.stringify(
        candidates.slice(0, 10).map((candidate, index) => ({
          candidateId: candidate.id,
          rank: index + 1,
        })),
      ),
      decoyCandidateIdsJson: JSON.stringify(
        candidates.slice(10).map((candidate) => candidate.id),
      ),
      revealOrderJson: JSON.stringify(
        candidates.map((candidate) => candidate.id),
      ),
      teamIdsJson: JSON.stringify(TEAMS),
      assignmentsJson: '[]',
      startingTeamId: TEAMS[0],
      phase: 'assigning',
      revealIndex: 0,
    },
    now,
  });
  let roundState = TOP10_POISON_DECK_PLUGIN.createInitialRoundState({
    sessionId: 'session-1',
    runtimeId: 'runtime-1',
    roundId: 'round-1',
    runtimeState,
    now,
  });
  const assigning = runtimeState;

  const run = (type: string, payload: GameplayModeState, turn: number) => {
    const handled = TOP10_POISON_DECK_PLUGIN.handleCommand(
      {
        sessionId: 'session-1',
        runtimeId: 'runtime-1',
        roundId: 'round-1',
        activeTeamId: TEAMS[turn % 2],
        runtimeState,
        now,
      },
      { type, payload, runtimeState, roundState },
    );
    runtimeState = handled.runtimeState;
    roundState = handled.roundState;
  };

  for (let turn = 0; turn < CARD_COUNT; turn += 1) {
    run('assign-card', { action: turn % 3 === 0 ? 'poison' : 'keep' }, turn);
  }
  const revealing = runtimeState;
  for (let reveal = 0; reveal < CARD_COUNT; reveal += 1) {
    run('reveal-next', {}, reveal);
  }
  return { assigning, revealing, completed: runtimeState };
}

const runtime = (state: GameplayModeState): GameplayRuntimeState =>
  ({ id: 'runtime-1', runtimeState: state }) as unknown as GameplayRuntimeState;

describe('Top10PoisonDeckChallengeLauncher', () => {
  const states = playDeck();
  const launcher = new Top10PoisonDeckChallengeLauncher(
    new ChallengeLauncherRegistry(),
    {} as never,
    {} as never,
  );

  it('claims the canonical Top 10 mechanic and nothing else', () => {
    expect(launcher.key).toBe(TOP10_MODE_KEY);
    expect(launcher.supports({ challengeTypeSlug: TOP10_MODE_KEY })).toBe(true);
    expect(launcher.supports({ challengeTypeSlug: RYO_MODE_KEY })).toBe(false);
    // A different Top 10 mechanic slug is not this poison-deck adapter's business.
    expect(launcher.supports({ challengeTypeSlug: 'top-10-classic' })).toBe(
      false,
    );
  });

  it('reports the deck unfinished while cards are being assigned or revealed', () => {
    expect(states.assigning.phase).toBe('assigning');
    expect(states.revealing.phase).toBe('revealing');
    expect(launcher.detectTerminal(runtime(states.assigning))).toBe(false);
    expect(launcher.detectTerminal(runtime(states.revealing))).toBe(false);
  });

  it('reports terminal only once the reveal walked the whole deck', () => {
    expect(states.completed.phase).toBe('completed');
    expect(launcher.detectTerminal(runtime(states.completed))).toBe(true);
  });

  it('requires exactly one content item', async () => {
    const context = {
      sessionId: 'session-1',
      actorId: 'host-1',
      matchId: 'match-1',
      occurrenceIndex: 0,
      worldId: 'world-1',
      slotKey: 'slot_1' as never,
      challengeTypeId: 'type-1',
      challengeTypeSlug: TOP10_MODE_KEY,
      contentItemIds: ['content-1'],
    };
    await expect(launcher.validateLaunch(context)).resolves.toBeUndefined();
    await expect(
      launcher.validateLaunch({
        ...context,
        contentItemIds: ['content-1', 'content-2'],
      }),
    ).rejects.toThrow(/exactly 1 content item/);
  });

  it('summarises the completion from the plugin’s own result', () => {
    const summary = launcher.buildCompletionSummary(runtime(states.completed));
    const pluginResult = JSON.parse(
      String(states.completed.resultJson),
    ) as Top10Result;

    expect(summary.challengeKey).toBe(TOP10_MODE_KEY);
    expect(summary.details).toEqual(pluginResult);
    // The social metrics the Match result screen needs survive the hand-off.
    expect(Object.keys(summary.details.metrics as object)).toEqual(TEAMS);
    expect(summary.details.internalScores).toEqual(pluginResult.internalScores);
    // Nothing about the hidden deck travels with the summary.
    expect(JSON.stringify(summary.details)).not.toContain('deckJson');
  });

  it('restores the events the mechanic minted, through the scoring module only', () => {
    const collector = new RuntimeScoreEventCollector(
      new ScoringService(new ScoringRuleRegistry()),
    );
    const minted = [
      {
        id: 'top10-event-1',
        matchId: 'live-session-1',
        teamId: TEAMS[0],
        challengeSessionId: 'runtime-1',
        scoringRuleId: SCORING_RULE_IDS.TOP10_POISON_DECK_RESULT,
        delta: 2,
        reason: 'TOP10_DECK_RESULT',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const events = collector.collect(
      runtime({ ...states.completed, scoreEventsJson: JSON.stringify(minted) }),
      'runtime-1',
    );

    expect(events).toHaveLength(1);
    expect(events[0].scoringRuleId).toBe(
      SCORING_RULE_IDS.TOP10_POISON_DECK_RESULT,
    );
    // A deck that has not been scored yet imports nothing rather than guessing.
    expect(collector.collect(runtime(states.revealing), 'runtime-1')).toEqual(
      [],
    );
  });
});
