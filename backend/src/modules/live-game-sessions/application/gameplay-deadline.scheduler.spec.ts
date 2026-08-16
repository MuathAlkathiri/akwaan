import { GameplayDeadlineScheduler } from './gameplay-deadline.scheduler';
import { GameplayObserverRegistry } from './gameplay-observer.registry';
import { GameplayModeRegistry } from '../domain/gameplay-mode.registry';
import { RYO_MODE_KEY } from '../domain/ryo-gameplay.plugin';
import { BOMB_MODE_KEY } from '../domain/bomb-gameplay.plugin';
import { CLOSEST_MODE_KEY } from '../domain/closest-gameplay.plugin';
import type { GameplayRuntimeState } from '../domain/gameplay-runtime';

/**
 * The freeze these cover: a mechanic publishes `prompt.deadlineAt`, every client
 * renders a countdown against it, and nothing on the server was watching that
 * clock. "اقرأ خصمك" has only that kind of deadline, so when it hit zero the
 * item was never resolved, the round stayed active, and the runtime never
 * became terminal — which then blocked the next challenge in the same session.
 */

const DEADLINE = '2026-08-14T00:00:30.000Z';
const NOW = Date.parse('2026-08-14T00:00:00.000Z');

function runtimeState(
  overrides: Partial<GameplayRuntimeState> = {},
  interaction?: Record<string, unknown>,
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
      interaction: interaction as never,
    },
    ...overrides,
  } as GameplayRuntimeState;
}

function openInteraction(
  status = 'open',
  deadlineAt: string | null = DEADLINE,
) {
  return {
    status,
    revision: 3,
    submissions: [],
    processedRequestIds: [],
    prompt: { id: 'prompt-1', deadlineAt: deadlineAt ?? undefined },
  };
}

function harness(state: GameplayRuntimeState | undefined) {
  const close = jest.fn().mockResolvedValue(undefined);
  const resolve = jest.fn().mockResolvedValue(undefined);
  const submit = jest.fn().mockResolvedValue(undefined);
  // The real registry, so a mechanic's own deadline declaration is what drives
  // these tests rather than a fixture's idea of one.
  const modes = new GameplayModeRegistry();
  const observers = new GameplayObserverRegistry();
  const sessionState = {
    status: 'active',
    activeTeamId: 'team-1',
    teams: [
      {
        id: 'team-1',
        clock: {
          running: true,
          startedAt: new Date(NOW),
          allocatedMs: 30_000,
          consumedMs: 0,
        },
      },
      {
        id: 'team-2',
        clock: {
          running: false,
          allocatedMs: 30_000,
          consumedMs: 0,
        },
      },
    ],
  };
  const sessions = {
    findById: jest.fn().mockResolvedValue({
      controllerActorId: 'host-1',
      revision: 11,
      serialize: () => sessionState,
    }),
  };
  let current = state;
  const runtimes = {
    findBySessionId: jest.fn(() =>
      Promise.resolve(
        current
          ? { revision: current.revision, serialize: () => current }
          : null,
      ),
    ),
    findSessionIdsWithLiveRuntimes: jest.fn().mockResolvedValue(['session-1']),
  };
  const moduleRef = {
    get: (token: { name?: string }) =>
      token?.name === 'GameplayInteractionUseCases'
        ? { close, resolve }
        : { execute: submit },
  };
  const scheduler = new GameplayDeadlineScheduler(
    sessions as never,
    runtimes as never,
    modes,
    observers,
    moduleRef as never,
  );
  /** Replace what the repository returns, as a committed mutation would. */
  const commit = (next: GameplayRuntimeState | undefined) => {
    current = next;
  };
  return {
    scheduler,
    close,
    resolve,
    submit,
    runtimes,
    sessions,
    observers,
    commit,
  };
}

describe('GameplayDeadlineScheduler interaction deadlines', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('resolves an expired interaction deadline through the normal resolution path', async () => {
    const { scheduler, close, resolve } = harness(
      runtimeState({}, openInteraction()),
    );

    await scheduler.schedule('session-1');
    expect(resolve).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(30_100);

    // Closed first: `resolve` rejects an interaction that is still open, so
    // skipping this step made every timeout fail.
    expect(close).toHaveBeenCalledTimes(1);
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(
      resolve.mock.invocationCallOrder[0],
    );
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        roundId: 'round-1',
        actor: { kind: 'user', actorId: 'host-1' },
        expectedSessionRevision: 11,
        expectedRuntimeRevision: 7,
        // Pinning the interaction revision is what makes a player's answer and
        // this timeout mutually exclusive: whichever lands second is stale.
        expectedInteractionRevision: 3,
      }),
    );
    scheduler.onModuleDestroy();
  });

  it('does not fire before the deadline', async () => {
    const { scheduler, resolve } = harness(runtimeState({}, openInteraction()));
    await scheduler.schedule('session-1');
    await jest.advanceTimersByTimeAsync(29_000);
    expect(resolve).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });

  it.each(['resolved', 'cancelled', 'expired'])(
    'ignores an interaction already %s',
    async (status) => {
      const { scheduler, resolve } = harness(
        runtimeState({}, openInteraction(status)),
      );
      await scheduler.schedule('session-1');
      await jest.advanceTimersByTimeAsync(60_000);
      expect(resolve).not.toHaveBeenCalled();
      scheduler.onModuleDestroy();
    },
  );

  it('ignores an interaction that carries no deadline', async () => {
    const { scheduler, resolve } = harness(
      runtimeState({}, openInteraction('open', null)),
    );
    await scheduler.schedule('session-1');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(resolve).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });

  it('never arms a timer for a terminal runtime', async () => {
    const { scheduler, resolve } = harness(
      runtimeState({ status: 'completed' }, openInteraction()),
    );
    await scheduler.schedule('session-1');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(resolve).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });

  it('resolves immediately when the deadline already passed, as after a restart', async () => {
    // Timers live in process memory. A redeploy or a free-tier instance waking
    // from sleep loses them, so re-arming has to cope with a deadline that is
    // already in the past rather than waiting for a player to act.
    jest.setSystemTime(Date.parse(DEADLINE) + 120_000);
    const { scheduler, resolve } = harness(runtimeState({}, openInteraction()));

    await scheduler.schedule('session-1');
    await jest.advanceTimersByTimeAsync(100);

    expect(resolve).toHaveBeenCalledTimes(1);
    scheduler.onModuleDestroy();
  });

  it('still routes runtime-state deadlines to their mode command', async () => {
    const { scheduler, submit, resolve } = harness(
      runtimeState({
        modeKey: CLOSEST_MODE_KEY,
        runtimeState: { phase: 'collecting', deadlineAt: DEADLINE },
      }),
    );

    await scheduler.schedule('session-1');
    await jest.advanceTimersByTimeAsync(30_100);

    expect(resolve).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ commandType: 'expire-closest-item' }),
    );
    scheduler.onModuleDestroy();
  });

  it('prefers the mode command when a mechanic has both kinds of deadline', async () => {
    const { scheduler, submit, resolve } = harness(
      runtimeState(
        {
          modeKey: CLOSEST_MODE_KEY,
          runtimeState: { phase: 'collecting', deadlineAt: DEADLINE },
        },
        openInteraction(),
      ),
    );

    await scheduler.schedule('session-1');
    await jest.advanceTimersByTimeAsync(30_100);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(resolve).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });

  it('a timer armed for item A cannot expire item B', async () => {
    // The stale-timer case, and the reason a deadline carries an identity and
    // not just an instant. Item A's timer is still pending when A resolves and
    // B opens; if it only checked "is there a deadline now", it would resolve
    // B's interaction on A's schedule.
    const { scheduler, resolve, commit } = harness(
      runtimeState({}, openInteraction()),
    );
    await scheduler.schedule('session-1');

    // A resolves early and B opens: a new interaction id, and a deadline far
    // enough out that A's timer is the only one that can fire in this window.
    commit(
      runtimeState({ revision: 9 }, {
        ...openInteraction(),
        id: 'interaction-B',
        prompt: {
          id: 'prompt-2',
          deadlineAt: new Date(NOW + 300_000).toISOString(),
        },
      } as never),
    );

    await jest.advanceTimersByTimeAsync(30_100);

    expect(resolve).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });

  it('a timer armed for one runtime cannot expire the next challenge', async () => {
    // The same guard one level up: a Match plays several runtimes per session,
    // and a timer from the previous challenge must not reach into the new one
    // even when both happen to carry a deadline at the same instant.
    const { scheduler, resolve, commit } = harness(
      runtimeState({}, openInteraction()),
    );
    await scheduler.schedule('session-1');

    commit(runtimeState({ id: 'runtime-2', revision: 2 }, openInteraction()));

    await jest.advanceTimersByTimeAsync(30_100);

    expect(resolve).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });

  it('an answer that resolves the item leaves no timer able to resolve it again', async () => {
    // Answer-before-timeout. The interaction is already resolved by the time
    // the timer wakes, so the expiration must be a no-op rather than a second
    // resolution — one resolution, one score effect, one progression.
    const { scheduler, resolve, commit } = harness(
      runtimeState({}, openInteraction()),
    );
    await scheduler.schedule('session-1');

    commit(runtimeState({ revision: 9 }, openInteraction('resolved')));

    await jest.advanceTimersByTimeAsync(60_000);

    expect(resolve).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });

  it('converging on state without a deadline disarms the pending timer', async () => {
    // The other half of the invariant: state that no longer carries a deadline
    // must leave nothing capable of resolving anything.
    const { scheduler, resolve, commit } = harness(
      runtimeState({}, openInteraction()),
    );
    await scheduler.schedule('session-1');

    commit(runtimeState({ revision: 9 }, openInteraction('open', null)));
    await scheduler.synchronize('session-1');

    await jest.advanceTimersByTimeAsync(60_000);

    expect(resolve).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    scheduler.onModuleDestroy();
  });

  it('converging repeatedly on the same deadline arms exactly one timer', async () => {
    // Every committed mutation converges, so this runs constantly in
    // production. Re-arming per call would multiply timers per item.
    const { scheduler, resolve } = harness(runtimeState({}, openInteraction()));

    await scheduler.synchronize('session-1');
    await scheduler.synchronize('session-1');
    await scheduler.synchronize('session-1');
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(30_100);

    expect(resolve).toHaveBeenCalledTimes(1);
    scheduler.onModuleDestroy();
  });

  it('rearms live sessions from persistence at startup', async () => {
    // Restart recovery, through the same convergence normal progression uses.
    const { scheduler, resolve, runtimes } = harness(
      runtimeState({}, openInteraction()),
    );

    await scheduler.onApplicationBootstrap();
    expect(runtimes.findSessionIdsWithLiveRuntimes).toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(30_100);

    expect(resolve).toHaveBeenCalledTimes(1);
    scheduler.onModuleDestroy();
  });

  it('gives up after repeated failures instead of spinning on a past deadline', async () => {
    const { scheduler, resolve } = harness(runtimeState({}, openInteraction()));
    resolve.mockRejectedValue(new Error('stale revision'));

    await scheduler.schedule('session-1');
    await jest.advanceTimersByTimeAsync(120_000);

    // Bounded: without the cap a deadline in the past re-arms at ~25ms and
    // hammers the database for as long as the session exists.
    expect(resolve.mock.calls.length).toBeLessThanOrEqual(6);
    expect(resolve).toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });
});

/**
 * Bomb burns the session's team clock rather than a deadline written on the
 * runtime, which is why it used to need its own scheduler. Folding it in here
 * is what gives it the restart recovery and retry bounds the other mechanics
 * already had.
 */
describe('GameplayDeadlineScheduler and the Bomb clock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('expires the active team when its clock runs out', async () => {
    const { scheduler, submit } = harness(
      runtimeState({ modeKey: BOMB_MODE_KEY, runtimeState: {} }),
    );

    await scheduler.schedule('session-1');
    await jest.advanceTimersByTimeAsync(30_100);

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ commandType: 'expire-team' }),
    );
    scheduler.onModuleDestroy();
  });

  it('does not fire before the clock is spent', async () => {
    const { scheduler, submit } = harness(
      runtimeState({ modeKey: BOMB_MODE_KEY, runtimeState: {} }),
    );

    await scheduler.schedule('session-1');
    await jest.advanceTimersByTimeAsync(20_000);

    expect(submit).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });

  it('arms nothing once the Bomb runtime is terminal', async () => {
    const { scheduler, submit } = harness(
      runtimeState({
        modeKey: BOMB_MODE_KEY,
        runtimeState: {},
        status: 'completed',
      }),
    );

    await scheduler.schedule('session-1');
    await jest.advanceTimersByTimeAsync(60_000);

    expect(submit).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
  });
});

/**
 * Batch B: what a committed mutation costs in repository reads.
 *
 * The scheduler is told about a commit and is handed the exact state that
 * commit wrote, so re-reading it was work with a known answer. These count only
 * the repositories the scheduler itself owns — nothing about *when* it
 * synchronizes changed, only what it spends doing so.
 */
describe('GameplayDeadlineScheduler committed-state reuse', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('reads neither repository for an interaction deadline it was handed', async () => {
    const state = runtimeState({}, openInteraction());
    const { scheduler, runtimes, sessions } = harness(state);

    await scheduler.onRuntimeMutated({
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      runtimeState: state,
    });

    expect(runtimes.findBySessionId).not.toHaveBeenCalled();
    expect(sessions.findById).not.toHaveBeenCalled();
    expect(scheduler.armedKeyFor('session-1')).toContain('interaction');
    scheduler.onModuleDestroy();
  });

  it('arms the same deadline it would have armed from persistence', async () => {
    // The shortcut is only sound if it is indistinguishable in effect. Same
    // state, both routes, same armed identity.
    const state = runtimeState({}, openInteraction());
    const fromRead = harness(state);
    await fromRead.scheduler.synchronize('session-1');
    const armedFromRead = fromRead.scheduler.armedKeyFor('session-1');
    fromRead.scheduler.onModuleDestroy();

    const fromHint = harness(state);
    await fromHint.scheduler.onRuntimeMutated({
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      runtimeState: state,
    });

    expect(fromHint.scheduler.armedKeyFor('session-1')).toBe(armedFromRead);
    fromHint.scheduler.onModuleDestroy();
  });

  it('still reads the session for a Bomb deadline, which is derived from it', async () => {
    // Bomb burns the session's team clock. The runtime read is saved; the
    // session read is not, because the answer does not exist without it.
    const state = runtimeState({ modeKey: BOMB_MODE_KEY, runtimeState: {} });
    const { scheduler, runtimes, sessions } = harness(state);

    await scheduler.onRuntimeMutated({
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      runtimeState: state,
    });

    expect(runtimes.findBySessionId).not.toHaveBeenCalled();
    expect(sessions.findById).toHaveBeenCalledTimes(1);
    expect(scheduler.armedKeyFor('session-1')).toContain('mode');
    scheduler.onModuleDestroy();
  });

  it('reads both repositories when it is given nothing', async () => {
    // The persistence path is what bootstrap, session commands and recovery
    // use, and it has to keep behaving exactly as it did.
    const state = runtimeState({}, openInteraction());
    const { scheduler, runtimes, sessions } = harness(state);

    await scheduler.synchronize('session-1');

    expect(runtimes.findBySessionId).toHaveBeenCalledTimes(1);
    expect(sessions.findById).toHaveBeenCalledTimes(1);
    scheduler.onModuleDestroy();
  });

  it('forgets the timer when the committed state it was handed is terminal', async () => {
    const active = runtimeState({}, openInteraction());
    const { scheduler } = harness(active);
    await scheduler.onRuntimeMutated({
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      runtimeState: active,
    });
    expect(scheduler.armedKeyFor('session-1')).toBeDefined();

    const done = runtimeState({ status: 'completed', revision: 8 });
    await scheduler.onRuntimeMutated({
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      runtimeState: done,
    });

    expect(scheduler.armedKeyFor('session-1')).toBeUndefined();
    expect(scheduler.retainedSessionIds()).not.toContain('session-1');
    scheduler.onModuleDestroy();
  });

  it('re-arms for the next item from the state that opened it', async () => {
    const first = runtimeState({}, openInteraction());
    const { scheduler } = harness(first);
    await scheduler.onRuntimeMutated({
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      runtimeState: first,
    });
    const firstKey = scheduler.armedKeyFor('session-1');

    const next = runtimeState(
      { revision: 9 },
      {
        ...openInteraction(),
        prompt: { id: 'prompt-2', deadlineAt: '2026-08-14T00:01:00.000Z' },
      },
    );
    await scheduler.onRuntimeMutated({
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      runtimeState: next,
    });

    expect(scheduler.armedKeyFor('session-1')).not.toBe(firstKey);
    expect(scheduler.armedKeyFor('session-1')).toContain('00:01:00');
    scheduler.onModuleDestroy();
  });

  it('falls back to persistence when handed a superseded revision', async () => {
    // Two commands commit against one session and their observers interleave.
    // The older observer must not arm from state a newer commit has replaced.
    const newer = runtimeState(
      { revision: 9 },
      {
        ...openInteraction(),
        prompt: { id: 'prompt-2', deadlineAt: '2026-08-14T00:01:00.000Z' },
      },
    );
    const { scheduler, runtimes, sessions, commit } = harness(newer);

    await scheduler.onRuntimeMutated({
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      runtimeState: newer,
    });
    const armedForNewer = scheduler.armedKeyFor('session-1');
    runtimes.findBySessionId.mockClear();
    sessions.findById.mockClear();
    commit(newer);

    // The stale observer arrives late, carrying revision 7.
    await scheduler.onRuntimeMutated({
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      runtimeState: runtimeState({ revision: 7 }, openInteraction()),
    });

    expect(runtimes.findBySessionId).toHaveBeenCalledTimes(1);
    expect(scheduler.armedKeyFor('session-1')).toBe(armedForNewer);
    scheduler.onModuleDestroy();
  });
});
