import { Logger } from '@nestjs/common';
import {
  ParticipantPresence,
  StoredPresenceEntry,
} from './participant-presence.port';
import { PresenceConnectionRegistry } from './presence-connection.registry';
import {
  PresenceOwnershipService,
  SignalProcess,
} from './presence-ownership.service';
import { OwnerLeaseStatus } from '../infrastructure/mongoose-instance-lease.repository';

const ME = 'inst-me';

class FakePresence implements Partial<ParticipantPresence> {
  rows = new Map<string, string[]>();
  failRemove = false;
  key = (s: string, p: string) => `${s}|${p}`;
  add(sessionId: string, participantId: string, entry: string) {
    const k = this.key(sessionId, participantId);
    this.rows.set(k, [...(this.rows.get(k) ?? []), entry]);
  }
  has(sessionId: string, participantId: string, entry: string) {
    return (this.rows.get(this.key(sessionId, participantId)) ?? []).includes(
      entry,
    );
  }
  async listEntries(): Promise<StoredPresenceEntry[]> {
    return [...this.rows].flatMap(([k, entries]) => {
      const [sessionId, participantId] = k.split('|');
      return entries.map((entry) => ({ sessionId, participantId, entry }));
    });
  }
  async removeExact(input: StoredPresenceEntry): Promise<boolean> {
    if (this.failRemove) throw new Error('db down');
    const k = this.key(input.sessionId, input.participantId);
    const entries = this.rows.get(k) ?? [];
    if (!entries.includes(input.entry)) return false;
    this.rows.set(
      k,
      entries.filter((e) => e !== input.entry),
    );
    return true;
  }
  async entriesFor(sessionId: string, participantId: string) {
    return [...(this.rows.get(this.key(sessionId, participantId)) ?? [])];
  }
}

class FakeLeases {
  /** owner → lease age in ms (undefined = no lease). */
  ages = new Map<string, number>();
  consumed = new Set<string>();
  heartbeatError?: Error;
  statusError?: Error;
  released: string[] = [];
  releaseImpl: () => Promise<void> = async () => undefined;
  heartbeat = jest.fn(async () => {
    if (this.heartbeatError) throw this.heartbeatError;
  });
  status = jest.fn(
    async (input: { owners: string[]; staleAfterMs: number }) => {
      if (this.statusError) throw this.statusError;
      const map = new Map<string, OwnerLeaseStatus>();
      for (const owner of input.owners) {
        const age = this.ages.get(owner);
        map.set(owner, {
          owner,
          exists: age !== undefined,
          stale: age === undefined || age > input.staleAfterMs,
        });
      }
      return map;
    },
  );
  release = jest.fn(async (id: string) => {
    await this.releaseImpl();
    this.released.push(id);
  });
  deleteExpired = jest.fn(async () => 0);
  isPurgeConsumed = jest.fn(async (nonce: string) => this.consumed.has(nonce));
  claimPurge = jest.fn(async (input: { nonce: string }) => {
    if (this.consumed.has(input.nonce)) return false;
    this.consumed.add(input.nonce);
    return true;
  });
}

function setup(
  env: Record<string, string> = {},
  opts: { commit?: string; signal?: SignalProcess } = {},
) {
  const presence = new FakePresence();
  const leases = new FakeLeases();
  const registry = new PresenceConnectionRegistry();
  const reconciler = {
    forSession: jest.fn<Promise<boolean>, [string]>(async () => true),
    cancelUnreadyBombCountdown: jest.fn(),
  };
  const runtimes = {
    findSessionIdsWithLiveRuntimes: jest.fn(async () => ['live-1']),
  };
  const sessions = {
    findSessionIdsInBombCountdown: jest.fn(async () => ['bomb-1']),
  };
  const config = {
    get: (key: string) => ({ NODE_ENV: 'test', ...env })[key],
  };
  let clock = 1_000_000;
  const service = new PresenceOwnershipService(
    config as never,
    { instanceId: ME, commit: opts.commit ?? 'c1' },
    presence as unknown as ParticipantPresence,
    leases as never,
    registry,
    reconciler as never,
    runtimes as never,
    sessions as never,
    opts.signal,
  );
  service.now = () => clock;
  const advance = (ms: number) => {
    clock += ms;
  };
  return {
    service,
    presence,
    leases,
    registry,
    reconciler,
    runtimes,
    sessions,
    advance,
    now: () => clock,
  };
}

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('PresenceOwnershipService', () => {
  describe('registration', () => {
    it('fails startup visibly when the lease cannot be registered', async () => {
      const t = setup();
      t.leases.heartbeatError = new Error('server selection timed out');
      await expect(t.service.onApplicationBootstrap()).rejects.toThrow(
        'server selection',
      );
      expect(() => t.service.assertRegistered()).toThrow('not registered');
    });

    it('registers once, then accepts sockets; never ticks in tests unless configured', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      expect(t.service.isRegistered).toBe(true);
      expect(() => t.service.assertRegistered()).not.toThrow();
      expect(t.service.options.tickMs).toBe(0);
      t.service.onModuleDestroy();
      expect(() => t.service.assertRegistered()).toThrow();
    });
  });

  describe('dead-owner sweep', () => {
    it('removes a dead owner only after two consecutive stale observations, exactly', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', 'dead:a');
      t.presence.add('s1', 'p1', 'live:b');
      t.presence.add('s2', 'p2', 'legacybare');
      t.leases.ages.set('dead', 60_000);
      t.leases.ages.set('live', 1_000);

      const first = await t.service.tick();
      expect(first.removed).toBe(0);
      expect(t.presence.has('s1', 'p1', 'dead:a')).toBe(true);

      const second = await t.service.tick();
      expect(second.deadOwners).toEqual(['dead']);
      expect(second.removed).toBe(1);
      expect(t.presence.has('s1', 'p1', 'dead:a')).toBe(false);
      expect(t.presence.has('s1', 'p1', 'live:b')).toBe(true);
      expect(t.presence.has('s2', 'p2', 'legacybare')).toBe(true);
      expect(t.reconciler.forSession).toHaveBeenCalledWith('s1');
    });

    it('treats a missing lease as dead, and a recovering lease resets suspicion', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', 'ghost:a');
      t.presence.add('s1', 'p2', 'flap:b');
      t.leases.ages.set('flap', 60_000);
      await t.service.tick();
      t.leases.ages.set('flap', 100); // a delayed heartbeat landed
      await t.service.tick();
      expect(t.presence.has('s1', 'p1', 'ghost:a')).toBe(false);
      expect(t.presence.has('s1', 'p2', 'flap:b')).toBe(true);
      t.leases.ages.set('flap', 60_000);
      await t.service.tick();
      expect(t.presence.has('s1', 'p2', 'flap:b')).toBe(true);
    });

    it('never sweeps on a failed status read, and the next tick still reconciles', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', 'dead:a');
      t.leases.statusError = new Error('network');
      await t.service.tick();
      const stats = await t.service.tick();
      expect(stats.stepFailures).toContain('dead_owner_sweep');
      expect(t.presence.has('s1', 'p1', 'dead:a')).toBe(true);
      t.leases.statusError = undefined;
      t.leases.ages.set('dead', 60_000);
      await t.service.tick();
      await t.service.tick();
      expect(t.presence.has('s1', 'p1', 'dead:a')).toBe(false);
    });

    it('continues past a failed lease refresh and a failed removal', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', 'dead:a');
      t.leases.ages.set('dead', 60_000);
      t.leases.heartbeatError = new Error('timeout');
      t.presence.failRemove = true;
      await t.service.tick();
      const stats = await t.service.tick();
      expect(stats.stepFailures).toEqual(
        expect.arrayContaining(['lease_refresh', 'dead_owner_sweep']),
      );
      t.leases.heartbeatError = undefined;
      t.presence.failRemove = false;
      await t.service.tick();
      expect(t.presence.has('s1', 'p1', 'dead:a')).toBe(false);
    });

    it('does not overlap itself', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      let release!: () => void;
      t.leases.heartbeat.mockImplementationOnce(
        () => new Promise<void>((resolve) => (release = resolve)),
      );
      const first = t.service.tick();
      const second = await t.service.tick();
      expect(second.skipped).toBe(true);
      release();
      expect((await first).skipped).toBeUndefined();
    });

    it('retries a session whose reconciliation failed until it succeeds', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', 'dead:a');
      t.leases.ages.set('dead', 60_000);
      t.reconciler.forSession.mockResolvedValueOnce(false);
      await t.service.tick();
      await t.service.tick(); // sweep; reconcile fails
      expect(t.presence.has('s1', 'p1', 'dead:a')).toBe(false);
      t.reconciler.forSession.mockClear();
      t.advance(1_000);
      await t.service.tick(); // backoff elapsed: s1 is retried
      expect(t.reconciler.forSession).toHaveBeenCalledWith('s1');
      t.reconciler.forSession.mockClear();
      await t.service.tick(); // succeeded last time: not retried again
      expect(t.reconciler.forSession).not.toHaveBeenCalledWith('s1');
    });

    it('backs retries off, preserves FIFO fairness, and bounds the queue', async () => {
      const t = setup({
        PRESENCE_RETRY_CAPACITY: '2',
        PRESENCE_RETRY_BASE_MS: '1000',
      });
      await t.service.onApplicationBootstrap();
      t.runtimes.findSessionIdsWithLiveRuntimes.mockResolvedValue([
        'first',
        'second',
        'evicted',
      ]);
      t.reconciler.forSession.mockResolvedValue(false);

      await t.service.tick();
      await t.service.tick();
      const firstPass = await t.service.tick();
      // `evicted` plus the periodic Bomb backstop cannot enter the capped queue.
      expect(firstPass.reconcileDropped).toBe(2);
      expect(t.reconciler.forSession.mock.calls.map(([id]) => id)).toEqual([
        'first',
        'second',
      ]);

      t.reconciler.forSession.mockClear();
      const deferred = await t.service.tick();
      expect(deferred.sessionsReconciled).toBe(0);
      expect(deferred.reconcileDeferred).toBe(2);

      t.advance(1_000);
      await t.service.tick();
      expect(t.reconciler.forSession.mock.calls.map(([id]) => id)).toEqual([
        'first',
        'second',
      ]);
    });

    it('periodically reconciles every live session and Bomb countdown as a backstop', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      for (let i = 0; i < 3; i += 1) await t.service.tick();
      expect(t.runtimes.findSessionIdsWithLiveRuntimes).toHaveBeenCalledTimes(
        1,
      );
      expect(t.reconciler.forSession).toHaveBeenCalledWith('live-1');
      expect(t.reconciler.forSession).toHaveBeenCalledWith('bomb-1');
    });
  });

  describe('own connections', () => {
    it('removes an own orphan after two ticks, never a registered socket', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', `${ME}:orphan`);
      t.presence.add('s1', 'p2', `${ME}:live`);
      t.registry.register({
        sessionId: 's1',
        participantId: 'p2',
        socketId: 'live',
        requestRecovery: jest.fn(),
      });
      const first = await t.service.tick();
      expect(first.orphansRemoved).toBe(0);
      const second = await t.service.tick();
      expect(second.orphansRemoved).toBe(1);
      expect(t.presence.has('s1', 'p1', `${ME}:orphan`)).toBe(false);
      expect(t.presence.has('s1', 'p2', `${ME}:live`)).toBe(true);
    });

    it('spares an entry whose socket re-registered between ticks', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', `${ME}:x`);
      await t.service.tick();
      t.registry.register({
        sessionId: 's1',
        participantId: 'p1',
        socketId: 'x',
        requestRecovery: jest.fn(),
      });
      await t.service.tick();
      expect(t.presence.has('s1', 'p1', `${ME}:x`)).toBe(true);
    });

    it('asks a live socket whose entry was removed elsewhere to recover, once, after a grace period', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      const requestRecovery = jest.fn();
      t.registry.register(
        {
          sessionId: 's1',
          participantId: 'p1',
          socketId: 'x',
          requestRecovery,
        },
        t.now(),
      );
      expect((await t.service.tick()).recoveriesRequested).toBe(0);
      t.advance(11_000);
      expect((await t.service.tick()).recoveriesRequested).toBe(1);
      expect((await t.service.tick()).recoveriesRequested).toBe(0);
      expect(requestRecovery).toHaveBeenCalledTimes(1);
    });
  });

  describe('slot reclaim', () => {
    it('frees only slots held by stale or missing foreign owners', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', 'gone:a');
      t.presence.add('s1', 'p1', 'busy:b');
      t.leases.ages.set('busy', 2_000);
      expect(await t.service.reclaimDeadSlots('s1', 'p1')).toBe(1);
      expect(await t.presence.entriesFor('s1', 'p1')).toEqual(['busy:b']);
    });

    it('never frees a legacy entry or a merely late (under 30s) lease', async () => {
      const t = setup();
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', 'bare');
      t.presence.add('s1', 'p1', 'late:b');
      t.leases.ages.set('late', 20_000);
      expect(await t.service.reclaimDeadSlots('s1', 'p1')).toBe(0);
    });
  });

  describe('legacy purge', () => {
    const purgeEnv = (value: string) => ({ PRESENCE_LEGACY_PURGE: value });

    async function runUntilPurge(t: ReturnType<typeof setup>) {
      await t.service.tick(); // baseline (before min uptime: ignored)
      t.advance(121_000);
      await t.service.tick(); // baseline
      t.advance(181_000);
      await t.service.tick(); // frozen long enough → claim
    }

    it('is not armed for another commit', async () => {
      const t = setup(purgeEnv('c0:n1'), { commit: 'c1' });
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', 'bare');
      await runUntilPurge(t);
      expect(t.leases.claimPurge).not.toHaveBeenCalled();
      expect(t.presence.has('s1', 'p1', 'bare')).toBe(true);
    });

    it('purges only legacy entries, once frozen, and consumes the nonce', async () => {
      const t = setup(purgeEnv('c1:n1'));
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', 'bare');
      t.presence.add('s1', 'p1', `${ME}:mine`);
      t.registry.register({
        sessionId: 's1',
        participantId: 'p1',
        socketId: 'mine',
        requestRecovery: jest.fn(),
      });
      await runUntilPurge(t);
      expect(t.leases.claimPurge).toHaveBeenCalledTimes(1);
      expect(t.presence.has('s1', 'p1', 'bare')).toBe(false);
      expect(t.presence.has('s1', 'p1', `${ME}:mine`)).toBe(true);
      expect(t.leases.consumed.has('n1')).toBe(true);
    });

    it('restarts the freeze window when legacy entries change (a legacy instance still runs)', async () => {
      const t = setup(purgeEnv('c1:n1'));
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', 'bare1');
      t.advance(121_000);
      await t.service.tick();
      t.advance(100_000);
      t.presence.add('s1', 'p2', 'bare2'); // legacy activity
      await t.service.tick();
      t.advance(100_000);
      await t.service.tick();
      expect(t.leases.claimPurge).not.toHaveBeenCalled();
      t.advance(90_000);
      await t.service.tick();
      expect(t.leases.claimPurge).toHaveBeenCalledTimes(1);
    });

    it('never purges again after rollback and a redeploy of the same commit with the same setting', async () => {
      const first = setup(purgeEnv('c1:n1'));
      await first.service.onApplicationBootstrap();
      first.presence.add('s1', 'p1', 'bare');
      await runUntilPurge(first);
      expect(first.presence.has('s1', 'p1', 'bare')).toBe(false);

      // Rollback: the legacy release runs again and writes bare ids; then the
      // same commit is redeployed with PRESENCE_LEGACY_PURGE unchanged.
      const redeploy = setup(purgeEnv('c1:n1'));
      redeploy.leases.consumed = first.leases.consumed;
      await redeploy.service.onApplicationBootstrap();
      redeploy.presence.add('s1', 'p9', 'bare-from-rollback');
      await runUntilPurge(redeploy);
      expect(redeploy.leases.isPurgeConsumed).toHaveBeenCalledWith(
        'n1',
        expect.any(Number),
      );
      expect(redeploy.leases.claimPurge).not.toHaveBeenCalled();
      expect(redeploy.presence.has('s1', 'p9', 'bare-from-rollback')).toBe(
        true,
      );
    });

    it('a concurrent instance that loses the claim purges nothing', async () => {
      const t = setup(purgeEnv('c1:n1'));
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', 'bare');
      t.leases.consumed.add('n1'); // the sibling instance won meanwhile
      t.leases.isPurgeConsumed.mockClear();
      await runUntilPurge(t);
      expect(t.leases.claimPurge).toHaveBeenCalledTimes(1);
      expect(t.presence.has('s1', 'p1', 'bare')).toBe(true);
    });
  });

  describe('SIGTERM release', () => {
    function fakeProcess() {
      const listeners: Array<(signal: NodeJS.Signals) => void> = [];
      const proc = {
        pid: 4242,
        once: jest.fn((_: 'SIGTERM', l: (s: NodeJS.Signals) => void) => {
          listeners.push(l);
        }),
        removeListener: jest.fn(),
        kill: jest.fn(),
      };
      return { proc, fire: () => listeners.forEach((l) => l('SIGTERM')) };
    }
    const flush = async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    };

    it('is off by default outside production', async () => {
      const { proc } = fakeProcess();
      const t = setup({}, { signal: proc });
      await t.service.onApplicationBootstrap();
      expect(proc.once).not.toHaveBeenCalled();
    });

    it('releases own entries and lease, then re-raises SIGTERM', async () => {
      const { proc, fire } = fakeProcess();
      const t = setup({ PRESENCE_SIGTERM_RELEASE: 'true' }, { signal: proc });
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', `${ME}:a`);
      t.presence.add('s1', 'p1', 'other:b');
      fire();
      await flush();
      expect(t.presence.has('s1', 'p1', `${ME}:a`)).toBe(false);
      expect(t.presence.has('s1', 'p1', 'other:b')).toBe(true);
      expect(t.leases.released).toEqual([ME]);
      expect(t.reconciler.forSession).toHaveBeenCalledWith('s1');
      expect(proc.removeListener).toHaveBeenCalled();
      expect(proc.kill).toHaveBeenCalledWith(4242, 'SIGTERM');
    });

    it('still terminates when release fails, leaving the entries to the sweep', async () => {
      const { proc, fire } = fakeProcess();
      const t = setup({ PRESENCE_SIGTERM_RELEASE: 'true' }, { signal: proc });
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', `${ME}:a`);
      t.presence.failRemove = true;
      fire();
      await flush();
      expect(proc.kill).toHaveBeenCalledWith(4242, 'SIGTERM');
      expect(t.presence.has('s1', 'p1', `${ME}:a`)).toBe(true);
      expect(t.leases.released).toEqual([]);
    });

    it('still terminates within the deadline when release hangs', async () => {
      jest.useFakeTimers();
      try {
        const { proc, fire } = fakeProcess();
        const t = setup({ PRESENCE_SIGTERM_RELEASE: 'true' }, { signal: proc });
        await t.service.onApplicationBootstrap();
        t.leases.releaseImpl = () => new Promise(() => undefined);
        fire();
        await flush();
        expect(proc.kill).not.toHaveBeenCalled();
        jest.advanceTimersByTime(5_000);
        await flush();
        expect(proc.kill).toHaveBeenCalledWith(4242, 'SIGTERM');
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
