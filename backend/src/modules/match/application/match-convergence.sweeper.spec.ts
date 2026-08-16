import { MatchConvergenceSweeper } from './match-convergence.sweeper';
import {
  MatchReconciliationOutcome,
  MatchReconciliationService,
} from './match-reconciliation.service';
import { PendingMatchConvergence } from '../persistence/match.repository';
import type { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';

/**
 * The recovery half of runtime → Match convergence, in isolation.
 *
 * `match-convergence.integration-spec.ts` proves the durability property
 * against real Mongo. These pin the sweeper's own behaviour, which is easier to
 * get subtly wrong than it looks: it must never apply anything itself, never
 * throw, never overlap, never drop an obligation it failed to discharge, and
 * never treat a challenge that is merely still being played as a problem.
 */

const OBLIGATION: PendingMatchConvergence = {
  matchId: 'match-1',
  sessionId: 'session-1',
  runtimeId: 'runtime-1',
};

function runtimeState(): GameplayRuntimeState {
  return {
    id: 'runtime-1',
    sessionId: 'session-1',
    status: 'completed',
    revision: 9,
  } as unknown as GameplayRuntimeState;
}

function harness(options: {
  pending?: PendingMatchConvergence[];
  outcomes?: MatchReconciliationOutcome[];
  runtimeMissing?: boolean;
  findThrows?: boolean;
  status?: string;
}) {
  const outcomes = [...(options.outcomes ?? ['reconciled'])];
  const onRuntimeMutated = jest.fn(() =>
    Promise.resolve({
      outcome: (outcomes.length > 1
        ? outcomes.shift()!
        : outcomes[0]) as MatchReconciliationOutcome,
    }),
  );
  const matches = {
    findAwaitingConvergence: jest.fn(() =>
      options.findThrows
        ? Promise.reject(new Error('mongo unavailable'))
        : Promise.resolve(options.pending ?? [OBLIGATION]),
    ),
  };
  const status = options.status ?? 'completed';
  const runtimes = {
    findStateById: jest.fn(() =>
      Promise.resolve(options.runtimeMissing ? null : runtimeState()),
    ),
    // The cheap batch the sweeper now uses to decide what is even worth reading.
    findStatusesByIds: jest.fn((ids: string[]) =>
      Promise.resolve(
        options.runtimeMissing
          ? new Map<string, string>()
          : new Map<string, string>(ids.map((id) => [id, status])),
      ),
    ),
  };
  const sweeper = new MatchConvergenceSweeper(
    matches as never,
    runtimes as never,
    { onRuntimeMutated } as unknown as MatchReconciliationService,
  );
  return { sweeper, onRuntimeMutated, matches, runtimes };
}

describe('match convergence sweeper', () => {
  it('hands every outstanding obligation to the reconciler', async () => {
    // It applies nothing itself. Terminality, scoring and the Match mutation
    // all stay with the one component that already owns them.
    const { sweeper, onRuntimeMutated } = harness({});

    expect(await sweeper.sweep('manual')).toBe(1);

    expect(onRuntimeMutated).toHaveBeenCalledWith({
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      runtimeState: expect.objectContaining({ id: 'runtime-1' }),
    });
  });

  it('treats a challenge still being played as ordinary, not outstanding', async () => {
    // Almost every sweep finds one of these: a Match legitimately holding a
    // live challenge. It must not be reported, counted, or retried.
    const { sweeper } = harness({ outcomes: ['not_terminal'] });

    expect(await sweeper.sweep('interval')).toBe(0);
    expect(sweeper.outstandingRuntimeIds()).toEqual([]);
  });

  it('keeps an obligation outstanding when convergence fails', async () => {
    // The property the whole batch exists for: a failed convergence may not
    // make the obligation disappear. It lives in the Match document, so the
    // next sweep finds it again regardless of what this pass concluded.
    const { sweeper, matches } = harness({
      outcomes: ['deferred_revision_conflict'],
    });

    expect(await sweeper.sweep('interval')).toBe(0);
    expect(sweeper.outstandingRuntimeIds()).toEqual(['runtime-1']);

    await sweeper.sweep('interval');
    expect(matches.findAwaitingConvergence).toHaveBeenCalledTimes(2);
    expect(sweeper.outstandingRuntimeIds()).toEqual(['runtime-1']);
  });

  it('converges on a later pass after a transient failure', async () => {
    const { sweeper } = harness({
      outcomes: ['deferred_revision_conflict', 'reconciled'],
    });

    expect(await sweeper.sweep('interval')).toBe(0);
    expect(await sweeper.sweep('interval')).toBe(1);
    expect(sweeper.outstandingRuntimeIds()).toEqual([]);
  });

  it('reports a Match bound to a runtime that does not exist, and repairs nothing', async () => {
    // A genuine invariant violation. Picking a winner for a challenge whose
    // record is gone would be inventing history, so it is surfaced instead.
    const { sweeper, onRuntimeMutated } = harness({ runtimeMissing: true });

    expect(await sweeper.sweep('bootstrap')).toBe(0);
    expect(onRuntimeMutated).not.toHaveBeenCalled();
  });

  it('survives a sweep that cannot even read the obligations', async () => {
    // The safety net may not become a new failure mode.
    const { sweeper } = harness({ findThrows: true });

    await expect(sweeper.sweep('interval')).resolves.toBe(0);
  });

  it('recovers every stranded Match in one pass, not just the first', async () => {
    const { sweeper, onRuntimeMutated } = harness({
      pending: [
        OBLIGATION,
        { matchId: 'match-2', sessionId: 'session-2', runtimeId: 'runtime-2' },
      ],
    });

    expect(await sweeper.sweep('bootstrap')).toBe(2);
    expect(onRuntimeMutated).toHaveBeenCalledTimes(2);
  });

  it('does not overlap itself', async () => {
    // A slow sweep meeting the next interval would double-apply nothing — the
    // reconciler is idempotent — but it would double the load for no gain.
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const matches = {
      findAwaitingConvergence: jest.fn(async () => {
        await gate;
        return [OBLIGATION];
      }),
    };
    const sweeper = new MatchConvergenceSweeper(
      matches as never,
      {
        findStateById: () => Promise.resolve(runtimeState()),
        findStatusesByIds: (ids: string[]) =>
          Promise.resolve(new Map(ids.map((id) => [id, 'completed']))),
      } as never,
      {
        onRuntimeMutated: () => Promise.resolve({ outcome: 'reconciled' }),
      } as unknown as MatchReconciliationService,
    );

    const first = sweeper.sweep('interval');
    const second = sweeper.sweep('interval');
    release!();

    expect(await second).toBe(0);
    expect(await first).toBe(1);
    expect(matches.findAwaitingConvergence).toHaveBeenCalledTimes(1);
  });

  it('sweeps once at bootstrap and then on a schedule', async () => {
    jest.useFakeTimers();
    try {
      const { sweeper, matches } = harness({ outcomes: ['not_terminal'] });

      await sweeper.onApplicationBootstrap();
      expect(matches.findAwaitingConvergence).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(30_100);
      expect(matches.findAwaitingConvergence).toHaveBeenCalledTimes(2);

      sweeper.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(120_000);
      expect(matches.findAwaitingConvergence).toHaveBeenCalledTimes(2);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('does nothing once shut down', async () => {
    const { sweeper, matches } = harness({});
    sweeper.onModuleDestroy();

    expect(await sweeper.sweep('manual')).toBe(0);
    expect(matches.findAwaitingConvergence).not.toHaveBeenCalled();
  });
});

/**
 * Batch E: what a sweep spends on obligations it cannot discharge.
 *
 * Every abandoned game leaves a Match holding a challenge whose runtime will
 * never finish, and each pass used to load that runtime in full to be told so.
 * The bound is deliberately *not* an age rule — age cannot distinguish an
 * abandoned game from a finished one nobody collected — but the runtime's own
 * lifecycle status, asked for every obligation in a single projected read.
 */
describe('match convergence sweeper bounding', () => {
  const obligations = (count: number): PendingMatchConvergence[] =>
    Array.from({ length: count }, (_, index) => ({
      matchId: `match-${index}`,
      sessionId: `session-${index}`,
      runtimeId: `runtime-${index}`,
    }));

  /** A sweeper over `count` obligations, all of the given runtime status. */
  function bounded(count: number, status: string) {
    const onRuntimeMutated = jest
      .fn()
      .mockResolvedValue({ outcome: 'reconciled' as const });
    const findStateById = jest.fn(() =>
      Promise.resolve({ id: 'r', status } as never),
    );
    const findStatusesByIds = jest.fn((ids: string[]) =>
      Promise.resolve(new Map(ids.map((id) => [id, status]))),
    );
    const sweeper = new MatchConvergenceSweeper(
      {
        findAwaitingConvergence: jest.fn(() =>
          Promise.resolve(obligations(count)),
        ),
      } as never,
      { findStateById, findStatusesByIds } as never,
      { onRuntimeMutated } as unknown as MatchReconciliationService,
    );
    return { sweeper, findStateById, findStatusesByIds, onRuntimeMutated };
  }

  it('reads no runtime state for obligations still being played', async () => {
    // The measured case: 39 abandoned challenges, every pass, for ever.
    const { sweeper, findStateById, findStatusesByIds, onRuntimeMutated } =
      bounded(39, 'round-active');

    expect(await sweeper.sweep('interval')).toBe(0);

    expect(findStatusesByIds).toHaveBeenCalledTimes(1);
    expect(findStateById).not.toHaveBeenCalled();
    expect(onRuntimeMutated).not.toHaveBeenCalled();
  });

  it('asks about every obligation in one round trip', async () => {
    const { sweeper, findStatusesByIds } = bounded(39, 'round-active');

    await sweeper.sweep('interval');

    expect(findStatusesByIds).toHaveBeenCalledTimes(1);
    expect(findStatusesByIds.mock.calls[0][0]).toHaveLength(39);
  });

  it('still discharges a finished challenge, however old the obligation is', async () => {
    // Age is never consulted, so an obligation that has waited days is
    // recovered on exactly the same terms as one from a second ago.
    const { sweeper, findStateById, onRuntimeMutated } = bounded(
      3,
      'completed',
    );

    expect(await sweeper.sweep('interval')).toBe(3);

    expect(findStateById).toHaveBeenCalledTimes(3);
    expect(onRuntimeMutated).toHaveBeenCalledTimes(3);
  });

  it('still discharges a cancelled challenge', async () => {
    const { sweeper, onRuntimeMutated } = bounded(2, 'cancelled');

    expect(await sweeper.sweep('interval')).toBe(2);
    expect(onRuntimeMutated).toHaveBeenCalledTimes(2);
  });

  it('recovers an obligation the moment its runtime becomes terminal', async () => {
    // A challenge skipped for many passes because it was unfinished must not
    // stay skipped once it finishes. Nothing was remembered about it, so there
    // is nothing to expire or reactivate.
    let status = 'round-active';
    const onRuntimeMutated = jest
      .fn()
      .mockResolvedValue({ outcome: 'reconciled' as const });
    const sweeper = new MatchConvergenceSweeper(
      {
        findAwaitingConvergence: jest.fn(() => Promise.resolve(obligations(1))),
      } as never,
      {
        findStateById: jest.fn(() =>
          Promise.resolve({ id: 'r', status } as never),
        ),
        findStatusesByIds: jest.fn((ids: string[]) =>
          Promise.resolve(new Map(ids.map((id) => [id, status]))),
        ),
      } as never,
      { onRuntimeMutated } as unknown as MatchReconciliationService,
    );

    for (let pass = 0; pass < 5; pass += 1) {
      expect(await sweeper.sweep('interval')).toBe(0);
    }
    expect(onRuntimeMutated).not.toHaveBeenCalled();

    status = 'completed';

    expect(await sweeper.sweep('interval')).toBe(1);
    expect(onRuntimeMutated).toHaveBeenCalledTimes(1);
  });

  it('mutates nothing for an obligation that is merely unfinished', async () => {
    // Bounding is about what the sweeper reads, never about ending someone's
    // game. No cancellation, no release, no reconciliation call at all.
    const { sweeper, onRuntimeMutated } = bounded(10, 'round-paused');

    await sweeper.sweep('interval');

    expect(onRuntimeMutated).not.toHaveBeenCalled();
    expect(sweeper.outstandingRuntimeIds()).toEqual([]);
  });

  it('keeps a Match bound to a runtime that does not exist visible', async () => {
    // Cheapness must not cost observability: absent is not the same as
    // unfinished, and it stays reported.
    const onRuntimeMutated = jest.fn();
    const sweeper = new MatchConvergenceSweeper(
      {
        findAwaitingConvergence: jest.fn(() => Promise.resolve(obligations(1))),
      } as never,
      {
        findStateById: jest.fn(() => Promise.resolve(null)),
        findStatusesByIds: jest.fn(() => Promise.resolve(new Map())),
      } as never,
      { onRuntimeMutated } as unknown as MatchReconciliationService,
    );

    expect(await sweeper.sweep('interval')).toBe(0);

    expect(onRuntimeMutated).not.toHaveBeenCalled();
    expect(sweeper.outstandingRuntimeIds()).toEqual(['runtime-0']);
  });

  it('keeps retrying a finished challenge whose Match write failed', async () => {
    // Batch 4's durability property, unchanged by the bound: a failed
    // convergence leaves the obligation exactly where it was.
    const outcomes = ['deferred_revision_conflict', 'reconciled'];
    const onRuntimeMutated = jest.fn(() =>
      Promise.resolve({ outcome: outcomes.shift() ?? 'reconciled' }),
    );
    const sweeper = new MatchConvergenceSweeper(
      {
        findAwaitingConvergence: jest.fn(() => Promise.resolve(obligations(1))),
      } as never,
      {
        findStateById: jest.fn(() =>
          Promise.resolve({ id: 'r', status: 'completed' } as never),
        ),
        findStatusesByIds: jest.fn((ids: string[]) =>
          Promise.resolve(new Map(ids.map((id) => [id, 'completed']))),
        ),
      } as never,
      { onRuntimeMutated } as unknown as MatchReconciliationService,
    );

    expect(await sweeper.sweep('interval')).toBe(0);
    expect(sweeper.outstandingRuntimeIds()).toEqual(['runtime-0']);

    expect(await sweeper.sweep('interval')).toBe(1);
    expect(sweeper.outstandingRuntimeIds()).toEqual([]);
  });
});
