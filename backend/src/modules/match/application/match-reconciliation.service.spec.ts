import { GameplayObserverRegistry } from '../../live-game-sessions/application/gameplay-observer.registry';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import { ChallengeWinRule } from '../../scoring/application/challenge-win.rule';
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
import { ContentExposureService } from './content-exposure.service';

const CHALLENGE_KEY = 'read-your-opponent';
const RUNTIME_ID = 'runtime-1';
const scoringRegistry = new ScoringRuleRegistry();
scoringRegistry.bind(new ChallengeWinRule());
const scoring = new ScoringService(scoringRegistry);

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
  // A mechanic that finished 3-1 internally. The Match must still move by one.
  buildCompletionSummary: () => ({
    challengeKey: CHALLENGE_KEY,
    winnerTeamId: 'team-alpha',
    mechanicSummary: { 'team-alpha': 3, 'team-beta': 1 },
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
      findAwaitingConvergence: () => Promise.resolve([]),
      findListPageBySessionIds: () =>
        Promise.resolve({ active: [], completed: [], completedTotal: 0 }),
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
      scoring,
      { now: () => now },
      new MatchTransitionNotifier({
        publish: () => undefined,
        publishEvent: (_sessionId, event, payload) =>
          published.push({ event, payload }),
      }),
      // Releasing unseen reservations has its own suites; these assert
      // reconciliation, and a release must never influence its outcome.
      {
        releaseUnseen: () => Promise.resolve(0),
        recordPresented: () => Promise.resolve(0),
      } as unknown as ContentExposureService,
      // No session lookup needed: the launcher used here reports no presentation,
      // so recording returns before it would be consulted.
      { findById: () => Promise.resolve(null) } as never,
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
    // Reconciliation lands the Match on its result, not on the board: the host
    // has not seen what happened yet.
    expect(match.stage).toBe(MatchStage.CHALLENGE_RESULT);
    expect(match.pendingResult?.runtimeId).toBe('runtime-1');
    expect(match.currentChallenge).toBeUndefined();
    expect(
      match.occurrences[0].slots[WorldChallengeSlotKey.SLOT_2],
    ).toMatchObject({
      status: MatchSlotStatus.COMPLETED,
      summary: { itemsPlayed: 3 },
    });
    // The mechanic finished 3-1; the Match moves by exactly one, because a Match
    // point means "won a challenge" and not "scored more inside one".
    expect(match.teamScore('team-alpha').signedTotal).toBe(1);
    expect(match.teamScore('team-beta').signedTotal).toBe(0);
    const challengeResult = match.pendingResult!;
    expect(challengeResult.winnerTeamId).toBe('team-alpha');
    expect(challengeResult.matchPoints).toEqual([
      { teamId: 'team-alpha', points: 1 },
      { teamId: 'team-beta', points: 0 },
    ]);
    // The mechanic's own signed events survive on the result for the recap.
    expect(challengeResult.mechanicScoreEvents).toHaveLength(1);
    expect(challengeResult.matchPointEventId).toBe(
      `challenge-win:${RUNTIME_ID}:0`,
    );
    expect(published).toEqual([
      {
        event: MATCH_CHANGED_EVENT,
        payload: {
          matchId: match.id,
          matchRevision: match.revision,
          stage: MatchStage.CHALLENGE_RESULT,
          status: match.status,
          reason: 'challenge-completed',
        },
      },
    ]);
    // Nothing about the content or the scoring travels on the notification.
    expect(JSON.stringify(published)).not.toContain('TRUST_CORRECT');
    expect(JSON.stringify(published)).not.toContain('itemsPlayed');
  });

  it('releases a cancelled runtime to the board without score or result', async () => {
    const { service, published, current } = setup(inChallenge());
    const cancelled = {
      ...runtimeState('active', [scoreEvent('must-not-import', 9)]),
      status: 'cancelled',
    } as GameplayRuntimeState;

    await expect(notify(service, cancelled)).resolves.toMatchObject({
      outcome: 'aborted',
      importedScoreEvents: 0,
    });

    const match = current()!;
    expect(match.stage).toBe(MatchStage.BOARD);
    expect(match.currentChallenge).toBeUndefined();
    expect(match.pendingResult).toBeUndefined();
    expect(match.challengeResults).toHaveLength(0);
    expect(match.teamScore('team-alpha').signedTotal).toBe(0);
    expect(match.occurrences[0].slots[WorldChallengeSlotKey.SLOT_2]).toEqual({
      status: MatchSlotStatus.AVAILABLE,
    });
    expect(published.at(-1)?.payload.reason).toBe('challenge-aborted');
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
    // Three notifications, one point. Ever.
    expect(current()!.teamScore('team-alpha').signedTotal).toBe(1);
    expect(current()!.serialize().scoreEvents).toHaveLength(1);
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
    expect(conflicted.current()!.stage).toBe(MatchStage.CHALLENGE_RESULT);
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
  /**
   * Spending content is keyed to *presentation*, and a mechanic that draws on
   * demand has no launch binding to check the presented ids against.
   */
  describe('recording what was presented', () => {
    const presenting = (options: {
      contentItemCount: number;
      presented: string[];
    }): MatchChallengeLauncher => ({
      ...launcher(),
      launchRequirements: {
        contentItemCount: options.contentItemCount,
        requiresPhones: true,
      },
      presentedContentItemIds: () => [...options.presented],
    });

    const recording = (
      bound: string[],
      launcherOverride: MatchChallengeLauncher,
    ) => {
      const match = inChallenge();
      // Rebind the position with the binding this case is about.
      const state = match.serialize();
      state.currentChallenge = {
        ...state.currentChallenge!,
        contentItemIds: [...bound],
      };
      const rebound = Match.restore(
        state,
        scoring.restoreEvents(state.scoreEvents),
      );
      const recorded: string[][] = [];
      const launchers = new ChallengeLauncherRegistry();
      launchers.register(launcherOverride);
      const service = new MatchReconciliationService(
        new GameplayObserverRegistry(),
        {
          create: () => Promise.resolve(),
          findById: () => Promise.resolve(rebound),
          findActiveBySessionId: () => Promise.resolve(rebound),
          findLatestBySessionId: () => Promise.resolve(rebound),
          findAwaitingConvergence: () => Promise.resolve([]),
          findListPageBySessionIds: () =>
            Promise.resolve({ active: [], completed: [], completedTotal: 0 }),
          save: () => Promise.resolve(),
        } as MatchRepository,
        launchers,
        new RuntimeScoreEventCollector(scoring),
        scoring,
        { now: () => now },
        new MatchTransitionNotifier({
          publish: () => undefined,
          publishEvent: () => undefined,
        }),
        {
          releaseUnseen: () => Promise.resolve(0),
          recordPresented: (_scope: unknown, ids: string[]) => {
            recorded.push([...ids]);
            return Promise.resolve(ids.length);
          },
        } as unknown as ContentExposureService,
        {
          findById: () => Promise.resolve({ controllerActorId: 'account-1' }),
        } as never,
      );
      return { service, recorded };
    };

    it('spends what an on-demand mechanic showed, with no binding to check', async () => {
      const { service, recorded } = recording(
        [],
        presenting({ contentItemCount: 0, presented: ['drawn-1', 'drawn-2'] }),
      );

      await notify(service, runtimeState('question'));

      // The ids came from the server's own draw, committed through a
      // controller-only command — there is nothing else they could be checked
      // against, and not recording them would silently break no-repeat.
      expect(recorded).toEqual([['drawn-1', 'drawn-2']]);
    });

    it('still refuses anything outside a bound mechanic’s own deck', async () => {
      const { service, recorded } = recording(
        ['a', 'b', 'c'],
        presenting({ contentItemCount: 3, presented: ['a', 'stranger'] }),
      );

      await notify(service, runtimeState('revealing'));

      expect(recorded).toEqual([['a']]);
    });

    // A3 recurring fair-start: exposure follows the recurring presentation
    // checkpoint. A prepared generation has shown nobody anything yet.
    const withPresentation = (
      phase: string,
      presentation: Record<string, unknown>,
    ): GameplayRuntimeState =>
      ({
        id: RUNTIME_ID,
        runtimeState: { phase, scoreEventsJson: '[]' },
        currentPresentation: presentation,
      }) as unknown as GameplayRuntimeState;

    it('records no exposure while a recurring presentation is only prepared', async () => {
      const { service, recorded } = recording(
        ['a', 'b', 'c'],
        presenting({ contentItemCount: 3, presented: ['a'] }),
      );

      await notify(
        service,
        withPresentation('revealing', {
          generation: 2,
          status: 'prepared',
          preparedAt: '2026-01-01T00:00:00.000Z',
          readiness: [],
        }),
      );

      expect(recorded).toEqual([]);
    });

    it('records the current item once a recurring generation is activated', async () => {
      const { service, recorded } = recording(
        ['a', 'b', 'c'],
        presenting({ contentItemCount: 3, presented: ['a'] }),
      );

      await notify(
        service,
        withPresentation('revealing', {
          generation: 2,
          status: 'activated',
          preparedAt: '2026-01-01T00:00:00.000Z',
          activatedAt: '2026-01-01T00:00:12.000Z',
          readiness: [],
        }),
      );

      expect(recorded).toEqual([['a']]);
    });
  });
});
