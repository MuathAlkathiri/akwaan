import { BombCountdownScheduler } from './bomb-countdown.scheduler';
import { GameplayDeadlineScheduler } from './gameplay-deadline.scheduler';
import { GameplayObserverRegistry } from './gameplay-observer.registry';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import { RYO_MODE_KEY } from '../domain/ryo-gameplay.plugin';
import type { GameplayRuntimeState } from '../domain/gameplay-runtime';

/**
 * Failure containment and resource cleanup at the lifecycle boundary.
 *
 * Two different problems, both invisible until production. A timer callback has
 * no caller to hand a rejection to, so an unowned one becomes an unhandled
 * rejection and takes the process down. And a scheduler that remembers sessions
 * in order to avoid re-resolving their deadlines has to forget them again, or
 * it accumulates one entry per session for as long as the process lives.
 *
 * These test the behaviour, not the presence of a `catch`.
 */

const NOW = Date.parse('2026-08-15T00:00:00.000Z');
const DEADLINE = new Date(NOW + 30_000).toISOString();

/** Fails the assertion if any promise rejects with nobody watching. */
function trackUnhandledRejections() {
  const seen: unknown[] = [];
  const onUnhandled = (reason: unknown) => seen.push(reason);
  process.on('unhandledRejection', onUnhandled);
  return {
    seen,
    stop: () => process.off('unhandledRejection', onUnhandled),
  };
}

describe('bomb countdown timer failure containment', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('does not let a failed post-countdown start escape as an unhandled rejection', async () => {
    // The countdown fires into a multi-step Bomb launch: session read, runtime
    // create, round create, round start, turn start. Any of those can lose a
    // revision race or fail against Mongo. There is no caller to catch it.
    const rejection = new Error('runtime create lost a revision race');
    const startBomb = {
      startAfterCountdown: jest.fn().mockRejectedValue(rejection),
    };
    const scheduler = new BombCountdownScheduler({
      get: () => startBomb,
    } as never);
    const tracker = trackUnhandledRejections();

    scheduler.schedule('session-1', new Date(NOW + 3_000));
    await jest.advanceTimersByTimeAsync(3_100);
    // Let any unowned rejection reach the process before asserting.
    await Promise.resolve();

    expect(startBomb.startAfterCountdown).toHaveBeenCalledWith('session-1');
    expect(tracker.seen).toEqual([]);
    tracker.stop();
  });

  it('still releases the timer entry when the start fails', async () => {
    // Containment must not cost cleanup: a failed countdown may not leave its
    // session pinned in the map for the life of the process.
    const scheduler = new BombCountdownScheduler({
      get: () => ({
        startAfterCountdown: jest.fn().mockRejectedValue(new Error('nope')),
      }),
    } as never);

    scheduler.schedule('session-1', new Date(NOW + 1_000));
    await jest.advanceTimersByTimeAsync(1_100);

    // Cancelling a session with no live timer is a no-op; the observable proof
    // is that nothing remains to fire.
    expect(jest.getTimerCount()).toBe(0);
  });

  it('a countdown scheduled twice leaves exactly one timer', async () => {
    const startBomb = {
      startAfterCountdown: jest.fn().mockResolvedValue(undefined),
    };
    const scheduler = new BombCountdownScheduler({
      get: () => startBomb,
    } as never);

    scheduler.schedule('session-1', new Date(NOW + 3_000));
    scheduler.schedule('session-1', new Date(NOW + 3_000));
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(3_100);
    expect(startBomb.startAfterCountdown).toHaveBeenCalledTimes(1);
  });
});

function runtimeState(
  overrides: Partial<GameplayRuntimeState> = {},
): GameplayRuntimeState {
  return {
    id: 'runtime-1',
    sessionId: 'session-1',
    modeKey: RYO_MODE_KEY,
    modeVersion: 1,
    stateSchemaVersion: 1,
    status: 'round-active',
    revision: 7,
    runtimeState: {},
    completedRounds: [],
    processedCommandIds: [],
    transitions: [],
    events: [],
    createdAt: new Date(NOW),
    expiresAt: new Date(NOW + 3_600_000),
    activeRound: {
      id: 'round-1',
      runtimeId: 'runtime-1',
      sequence: 1,
      status: 'active',
      createdAt: new Date(NOW),
      modeStateSchemaVersion: 1,
      modeState: {},
      transitionRevision: 7,
      interaction: {
        id: 'interaction-1',
        status: 'open',
        revision: 3,
        submissions: [],
        processedRequestIds: [],
        prompt: { id: 'prompt-1', deadlineAt: DEADLINE },
      },
    },
    ...overrides,
  } as unknown as GameplayRuntimeState;
}

function deadlineHarness(initial: GameplayRuntimeState | undefined) {
  let current = initial;
  const close = jest.fn().mockResolvedValue(undefined);
  const resolve = jest.fn().mockResolvedValue(undefined);
  const scheduler = new GameplayDeadlineScheduler(
    {
      findById: jest.fn().mockResolvedValue({
        controllerActorId: 'host-1',
        revision: 11,
        serialize: () => ({ status: 'active', teams: [] }),
      }),
    } as never,
    {
      findBySessionId: jest.fn(() =>
        Promise.resolve(
          current
            ? { revision: current.revision, serialize: () => current }
            : null,
        ),
      ),
      findSessionIdsWithLiveRuntimes: jest.fn().mockResolvedValue([]),
    } as never,
    new GameplayModeRegistry(),
    new GameplayObserverRegistry(),
    {
      get: (token: { name?: string }) =>
        token?.name === 'GameplayInteractionUseCases'
          ? { close, resolve }
          : { execute: resolve },
    } as never,
  );
  return {
    scheduler,
    resolve,
    commit: (next: GameplayRuntimeState | undefined) => {
      current = next;
    },
  };
}

describe('deadline scheduler resource lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('retains nothing for a session whose runtime has gone terminal', async () => {
    // `lastResolved` exists to stop a deadline being resolved twice while the
    // runtime has not moved. Once the runtime is terminal there is no deadline
    // to guard, and the entry used to be kept for the life of the process —
    // one per session that ever timed an item out.
    const { scheduler, resolve, commit } = deadlineHarness(runtimeState());

    await scheduler.synchronize('session-1');
    await jest.advanceTimersByTimeAsync(30_100);
    expect(resolve).toHaveBeenCalled();
    expect(scheduler.armedKeyFor('session-1')).toBeUndefined();

    // The challenge finishes.
    commit(runtimeState({ status: 'completed' }));
    await scheduler.synchronize('session-1');

    expect(scheduler.retainedSessionIds()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
    scheduler.onModuleDestroy();
  });

  it('retains nothing for a session that no longer exists', async () => {
    // Expire first, so the resolve memo is actually populated — otherwise this
    // would pass without ever exercising the entry that used to be kept.
    const { scheduler, resolve, commit } = deadlineHarness(runtimeState());
    await scheduler.synchronize('session-1');
    await jest.advanceTimersByTimeAsync(30_100);
    expect(resolve).toHaveBeenCalled();
    expect(scheduler.retainedSessionIds()).toEqual(['session-1']);

    commit(undefined);
    await scheduler.synchronize('session-1');

    expect(scheduler.retainedSessionIds()).toEqual([]);
    scheduler.onModuleDestroy();
  });

  it('keeps its memo while a deadline is genuinely still pending', async () => {
    // The other direction: forgetting too eagerly would re-arm a deadline this
    // process has already resolved and resolve it a second time.
    const { scheduler, resolve } = deadlineHarness(runtimeState());

    await scheduler.synchronize('session-1');
    await jest.advanceTimersByTimeAsync(30_100);
    expect(resolve).toHaveBeenCalledTimes(1);

    // State did not move: the same deadline is still pending.
    await scheduler.synchronize('session-1');
    await jest.advanceTimersByTimeAsync(60_000);

    expect(resolve).toHaveBeenCalledTimes(1);
    scheduler.onModuleDestroy();
  });

  it('drops everything on shutdown', async () => {
    const { scheduler } = deadlineHarness(runtimeState());
    await scheduler.synchronize('session-1');
    expect(scheduler.retainedSessionIds()).toEqual(['session-1']);

    scheduler.onModuleDestroy();

    expect(scheduler.retainedSessionIds()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });
});
