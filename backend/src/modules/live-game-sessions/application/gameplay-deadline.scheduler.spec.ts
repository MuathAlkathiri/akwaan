import { GameplayDeadlineScheduler } from './gameplay-deadline.scheduler';
import { RYO_MODE_KEY } from '../domain/ryo-gameplay.plugin';
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
  const sessions = {
    findById: jest
      .fn()
      .mockResolvedValue({ controllerActorId: 'host-1', revision: 11 }),
  };
  const runtimes = {
    findBySessionId: jest
      .fn()
      .mockResolvedValue(
        state ? { revision: state.revision, serialize: () => state } : null,
      ),
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
    moduleRef as never,
  );
  return { scheduler, close, resolve, submit, runtimes };
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
