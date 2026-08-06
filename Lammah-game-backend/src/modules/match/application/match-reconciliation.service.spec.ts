import { GameplayObserverRegistry } from '../../live-game-sessions/application/gameplay-observer.registry';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import { ScoringService } from '../../scoring/application/scoring.service';
import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { Match, MatchState } from '../domain/match';
import {
  MATCH_SLOT_ORDER,
  MatchSlotLaunchability,
  MatchSlotStatus,
  MatchStage,
} from '../domain/match.constants';
import { MatchRepository } from '../persistence/match.repository';
import { MatchConcurrencyError } from '../persistence/mongoose-match.repository';
import {
  ChallengeLauncherRegistry,
  MatchChallengeLauncher,
} from './challenge-launcher.registry';
import { MatchReconciliationService } from './match-reconciliation.service';
import {
  MATCH_CHANGED_EVENT,
  MatchTransitionNotifier,
} from './match-transition.notifier';
import { RuntimeScoreEventCollector } from './runtime-score-event.collector';

const CHALLENGE_KEY = 'read-your-opponent';
const RUNTIME_ID = 'runtime-1';
const scoring = new ScoringService(new ScoringRuleRegistry());

const scoreEvent = (id: string, delta: number) => ({
  id,
  matchId: 'live-session-1',
  teamId: 'team-alpha',
  challengeSessionId: RUNTIME_ID,
  scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
  delta,
  reason: 'TRUST_CORRECT',
  createdAt: '2026-01-01T00:00:00.000Z',
});

const runtimeState = (
  phase: string,
  events: Array<Record<string, unknown>> = [],
): GameplayRuntimeState =>
  ({
    id: RUNTIME_ID,
    runtimeState: { phase, scoreEventsJson: JSON.stringify(events) },
  }) as unknown as GameplayRuntimeState;

const launcher = (): MatchChallengeLauncher => ({
  key: CHALLENGE_KEY,
  launchRequirements: { contentItemCount: 3, requiresPhones: true },
  supports: (input) => input.challengeTypeSlug === CHALLENGE_KEY,
  validateLaunch: () => Promise.resolve(),
  launch: () => Promise.resolve({ runtimeId: RUNTIME_ID }),
  detectTerminal: (runtime) => runtime.runtimeState.phase === 'completed',
  buildCompletionSummary: () => ({
    challengeKey: CHALLENGE_KEY,
    details: { itemsPlayed: 3 },
  }),
});

describe('MatchReconciliationService', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  const inChallenge = () => {
    const teams = [
      { id: 'team-alpha', name: 'ألفا' },
      { id: 'team-beta', name: 'بيتا' },
    ];
    const match = Match.createUnified({
      liveSessionId: 'live-session-1',
      teams,
      occurrences: [0, 1, 2].map((index) => ({
        occurrenceIndex: index,
        worldId: 'world-1',
        selectedScopeIds: ['s1', 's2', 's3', 's4'],
      })),
      boardPositions: [0, 1, 2].flatMap((index) =>
        MATCH_SLOT_ORDER.map((slotKey) => ({
          occurrenceIndex: index,
          worldId: 'world-1',
          slotKey,
          challengeTypeId: 'type-ryo',
          challengeTypeSlug: CHALLENGE_KEY,
          displayName: `slot ${slotKey}`,
        })),
      ),
      coinToss: { winnerTeamId: 'team-alpha', roll: 0, resolvedAt: now },
      now,
    });
    match.launchChallenge({
      commandId: 'launch',
      now,
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      challengeKey: CHALLENGE_KEY,
      runtimeId: RUNTIME_ID,
      contentItemIds: ['a', 'b', 'c'],
      launchability: MatchSlotLaunchability.LAUNCHABLE,
    });
    return match;
  };

  /**
   * Behaves like the real repository: every read rebuilds the aggregate from
   * stored state, and a save only lands while the expected revision matches.
   * `conflicts` makes the first N saves lose the optimistic write.
   */
  const setup = (
    initial: Match | null,
    options: { conflicts?: number } = {},
  ) => {
    let stored: MatchState | null = initial ? initial.serialize() : null;
    let remainingConflicts = options.conflicts ?? 0;
    const saves: number[] = [];
    const published: Array<{
      event: string;
      payload: Record<string, unknown>;
    }> = [];
    // Deep-cloned on every read, exactly like rebuilding from a Mongo document,
    // so one attempt's in-memory mutation cannot leak into the next.
    const load = () => {
      if (!stored) return null;
      const state = structuredClone(stored);
      return Match.restore(state, scoring.restoreEvents(state.scoreEvents));
    };
    const repository: MatchRepository = {
      create: () => Promise.resolve(),
      findById: () => Promise.resolve(load()),
      findActiveBySessionId: () => Promise.resolve(load()),
      findLatestBySessionId: () => Promise.resolve(load()),
      save: (match, expectedRevision) => {
        saves.push(expectedRevision);
        if (remainingConflicts > 0) {
          remainingConflicts -= 1;
          return Promise.reject(new MatchConcurrencyError());
        }
        if (!stored || stored.revision !== expectedRevision) {
          return Promise.reject(new MatchConcurrencyError());
        }
        stored = match.serialize();
        return Promise.resolve();
      },
    };
    const launchers = new ChallengeLauncherRegistry();
    launchers.register(launcher());
    const service = new MatchReconciliationService(
      new GameplayObserverRegistry(),
      repository,
      launchers,
      new RuntimeScoreEventCollector(scoring),
      { now: () => now },
      new MatchTransitionNotifier({
        publish: () => undefined,
        publishEvent: (_sessionId, event, payload) =>
          published.push({ event, payload }),
      }),
    );
    return { service, saves, published, current: load };
  };

  const silenceDeferralLog = (service: MatchReconciliationService) => {
    const captured: Array<Record<string, unknown>> = [];
    jest
      .spyOn(
        (service as unknown as { logger: { error: (value: unknown) => void } })
          .logger,
        'error',
      )
      .mockImplementation((value: unknown) => {
        captured.push(value as Record<string, unknown>);
      });
    return captured;
  };

  const notify = (
    service: MatchReconciliationService,
    state: GameplayRuntimeState,
    runtimeId = RUNTIME_ID,
  ) =>
    service.onRuntimeMutated({
      sessionId: 'live-session-1',
      runtimeId,
      runtimeState: state,
    });

  afterEach(() => jest.restoreAllMocks());

  it('completes the bound challenge when the runtime says it finished', async () => {
    const { service, published, current } = setup(inChallenge());

    const result = await notify(
      service,
      runtimeState('completed', [scoreEvent('e1', 3)]),
    );

    expect(result).toMatchObject({
      outcome: 'reconciled',
      importedScoreEvents: 1,
    });
    const match = current()!;
    expect(match.stage).toBe(MatchStage.BOARD);
    expect(match.currentChallenge).toBeUndefined();
    expect(
      match.occurrences[0].slots[WorldChallengeSlotKey.SLOT_2],
    ).toMatchObject({
      status: MatchSlotStatus.COMPLETED,
      scoreEventIds: ['e1'],
      summary: { itemsPlayed: 3 },
    });
    expect(match.teamScore('team-alpha').signedTotal).toBe(3);
    expect(published).toEqual([
      {
        event: MATCH_CHANGED_EVENT,
        payload: {
          matchId: match.id,
          matchRevision: match.revision,
          stage: MatchStage.BOARD,
          status: match.status,
          reason: 'challenge-completed',
        },
      },
    ]);
    // Nothing about the content or the scoring travels on the notification.
    expect(JSON.stringify(published)).not.toContain('TRUST_CORRECT');
    expect(JSON.stringify(published)).not.toContain('itemsPlayed');
  });

  it('reports a runtime that has not finished without touching the Match', async () => {
    const { service, published, current } = setup(inChallenge());

    const result = await notify(
      service,
      runtimeState('between_items', [scoreEvent('e1', 3)]),
    );

    expect(result.outcome).toBe('not_terminal');
    expect(current()!.stage).toBe(MatchStage.CHALLENGE);
    expect(published).toEqual([]);
  });

  it('imports the scores exactly once however often it is notified', async () => {
    const { service, published, current } = setup(inChallenge());
    const terminal = runtimeState('completed', [scoreEvent('e1', 3)]);

    const first = await notify(service, terminal);
    const second = await notify(service, terminal);
    const third = await notify(service, terminal);

    expect(first.outcome).toBe('reconciled');
    // The slot is already completed, so nothing is imported or announced again.
    expect(second.outcome).toBe('already_reconciled');
    expect(third.outcome).toBe('already_reconciled');
    expect(current()!.teamScore('team-alpha').signedTotal).toBe(3);
    expect(published).toHaveLength(1);
  });

  it('leaves runtimes this Match never bound alone', async () => {
    const { service, published, current } = setup(inChallenge());

    const result = await notify(
      service,
      runtimeState('completed'),
      'someone-elses-runtime',
    );

    expect(result.outcome).toBe('runtime_mismatch');
    expect(current()!.stage).toBe(MatchStage.CHALLENGE);
    expect(published).toEqual([]);
  });

  it('does nothing at all when the session has no Match', async () => {
    const { service, published } = setup(null);

    const result = await notify(
      service,
      runtimeState('completed', [scoreEvent('e1', 3)]),
    );

    expect(result.outcome).toBe('no_match');
    expect(published).toEqual([]);
  });

  it('retries a single revision conflict and still completes exactly once', async () => {
    const { service, saves, published, current } = setup(inChallenge(), {
      conflicts: 1,
    });

    const result = await notify(
      service,
      runtimeState('completed', [scoreEvent('e1', 3)]),
    );

    expect(result.outcome).toBe('reconciled');
    expect(saves).toHaveLength(2);
    expect(current()!.serialize().scoreEvents).toHaveLength(1);
    expect(published).toHaveLength(1);
  });

  it('defers once the retry also conflicts, and logs the correlation', async () => {
    const { service, saves, published, current } = setup(inChallenge(), {
      conflicts: 2,
    });
    const errors = silenceDeferralLog(service);

    const result = await notify(
      service,
      runtimeState('completed', [scoreEvent('e1', 3)]),
    );

    expect(result.outcome).toBe('deferred_revision_conflict');
    expect(saves).toHaveLength(2);
    // Gameplay already succeeded, so the Match is temporarily still in play.
    expect(current()!.stage).toBe(MatchStage.CHALLENGE);
    expect(published).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      event: 'match_reconciliation_deferred',
      matchId: expect.any(String),
      liveSessionId: 'live-session-1',
      runtimeId: RUNTIME_ID,
      challengeSessionId: RUNTIME_ID,
      expectedRevision: expect.any(Number),
      actualRevision: expect.any(Number),
      stage: MatchStage.CHALLENGE,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      retryCount: 2,
      errorCode: 'MATCH_CONCURRENT_MODIFICATION',
      timestamp: now.toISOString(),
    });
    // No answer, card, or score detail travels in the deferral log.
    expect(JSON.stringify(errors[0])).not.toContain('TRUST_CORRECT');
  });

  it('converges on the next read after a deferral', async () => {
    const conflicted = setup(inChallenge(), { conflicts: 2 });
    const terminal = runtimeState('completed', [scoreEvent('e1', 3)]);
    silenceDeferralLog(conflicted.service);
    expect((await notify(conflicted.service, terminal)).outcome).toBe(
      'deferred_revision_conflict',
    );

    // The read-side hook the snapshot composer calls before projecting.
    const converged = await conflicted.service.ensureReconciled(
      'live-session-1',
      terminal,
    );

    expect(converged.outcome).toBe('reconciled');
    expect(conflicted.current()!.stage).toBe(MatchStage.BOARD);
    expect(conflicted.current()!.serialize().scoreEvents).toHaveLength(1);
    expect(conflicted.published).toHaveLength(1);
  });

  it('never enters the conflict path for a non-terminal runtime', async () => {
    const { service, saves, published } = setup(inChallenge(), {
      conflicts: 2,
    });

    const result = await notify(service, runtimeState('revealing'));

    expect(result.outcome).toBe('not_terminal');
    expect(saves).toEqual([]);
    expect(published).toEqual([]);
  });

  it('has nothing to converge when the session has no runtime', async () => {
    const { service, published } = setup(inChallenge());

    const result = await service.ensureReconciled('live-session-1', null);

    expect(result.outcome).toBe('no_current_challenge');
    expect(published).toEqual([]);
  });
});
