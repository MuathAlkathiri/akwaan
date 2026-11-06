import { Logger } from '@nestjs/common';
import { LiveSessionConcurrencyError } from '../domain/live-session.errors';
import { GameplayRuntimeRepository } from '../domain/gameplay-runtime.repository';
import { LiveSessionClock } from './live-session-clock';
import { WithdrawPresentationReadiness } from './withdraw-presentation-readiness.use-case';

/**
 * The stored runtime, reduced to what withdrawal reads: a revision and the
 * connections whose acknowledgements currently count.
 */
interface Stored {
  revision: number;
  ready: string[];
}

function fakeRuntimes(initial: Stored) {
  let stored: Stored = { ...initial, ready: [...initial.ready] };
  let loads = 0;
  const saves: Stored[] = [];
  let compete: Array<(state: Stored) => void> = [];

  const aggregate = (state: Stored) => {
    const working: Stored = { ...state, ready: [...state.ready] };
    const drop = (connectionId: string) => {
      if (!working.ready.includes(connectionId)) return;
      working.ready = working.ready.filter((id) => id !== connectionId);
      working.revision += 1;
    };
    return {
      get revision() {
        return working.revision;
      },
      clearSurfaceReadiness: drop,
      withdrawCurrentPresentationReadiness: drop,
      serialize: () => working,
    };
  };

  const repository = {
    findBySessionId: () => {
      loads += 1;
      return Promise.resolve(aggregate(stored));
    },
    save: (
      runtime: { serialize: () => Stored },
      expected: number,
    ): Promise<void> => {
      const next = compete.shift();
      if (next) {
        // A gameplay mutation commits between this attempt's read and write.
        const winner = { ...stored, ready: [...stored.ready] };
        winner.revision += 1;
        next(winner);
        stored = winner;
      }
      if (expected !== stored.revision) {
        return Promise.reject(new LiveSessionConcurrencyError());
      }
      stored = runtime.serialize();
      saves.push(stored);
      return Promise.resolve();
    },
  } as unknown as GameplayRuntimeRepository;

  return {
    repository,
    current: () => stored,
    saves,
    loads: () => loads,
    competeBeforeSaves: (...mutations: Array<(state: Stored) => void>) => {
      compete = mutations;
    },
  };
}

const clock = { now: () => new Date('2026-11-06T00:00:00.000Z') };

describe('WithdrawPresentationReadiness', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  const useCase = (runtimes: ReturnType<typeof fakeRuntimes>) =>
    new WithdrawPresentationReadiness(
      runtimes.repository,
      clock as LiveSessionClock,
    );

  it('withdraws a departed connection in one write when nothing races it', async () => {
    const runtimes = fakeRuntimes({
      revision: 4,
      ready: ['phone-a', 'screen'],
    });

    await useCase(runtimes).forConnection('session-1', 'phone-a');

    expect(runtimes.current().ready).toEqual(['screen']);
    expect(runtimes.saves).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('retries against the fresh runtime when a gameplay write wins the race', async () => {
    const runtimes = fakeRuntimes({
      revision: 9,
      ready: ['phone-a', 'screen'],
    });
    // Another phone acknowledges between the read and the write.
    runtimes.competeBeforeSaves((state) => state.ready.push('phone-b'));

    await useCase(runtimes).forConnection('session-1', 'phone-a');

    // The withdrawal landed, and the competing acknowledgement survived it.
    expect(runtimes.current().ready).toEqual(['screen', 'phone-b']);
    expect(runtimes.loads()).toBe(2);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'presentation_readiness_withdraw_retry',
        attempt: 1,
      }),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('converges without writing when the winning write already withdrew it', async () => {
    const runtimes = fakeRuntimes({ revision: 2, ready: ['phone-a'] });
    runtimes.competeBeforeSaves((state) => {
      state.ready = [];
    });

    await useCase(runtimes).forConnection('session-1', 'phone-a');

    expect(runtimes.current().ready).toEqual([]);
    expect(runtimes.saves).toHaveLength(0);
    expect(runtimes.loads()).toBe(2);
  });

  it('reports, rather than silently drops, a withdrawal that loses every attempt', async () => {
    const runtimes = fakeRuntimes({ revision: 1, ready: ['phone-a'] });
    const keepReady = () => undefined;
    runtimes.competeBeforeSaves(keepReady, keepReady, keepReady);

    await expect(
      useCase(runtimes).forConnection('session-1', 'phone-a'),
    ).resolves.toBeUndefined();

    expect(runtimes.loads()).toBe(WithdrawPresentationReadiness.MAX_ATTEMPTS);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'presentation_readiness_withdraw_abandoned',
        connectionId: 'phone-a',
        attempts: WithdrawPresentationReadiness.MAX_ATTEMPTS,
      }),
    );
  });

  it('does not retry an error that is not a lost race', async () => {
    const runtimes = fakeRuntimes({ revision: 1, ready: ['phone-a'] });
    (runtimes.repository as { save: unknown }).save = () =>
      Promise.reject(new Error('database unavailable'));

    await expect(
      useCase(runtimes).forConnection('session-1', 'phone-a'),
    ).rejects.toThrow('database unavailable');
    expect(runtimes.loads()).toBe(1);
  });
});
