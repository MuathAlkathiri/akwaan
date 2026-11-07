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
import { ReconcileOutcome } from './presence-effects.reconciler';

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

const OK: ReconcileOutcome = { status: 'ok' };
const TRANSIENT: ReconcileOutcome = { status: 'transient' };
const PERMANENT: ReconcileOutcome = {
  status: 'permanent',
  code: 'INVALID_TEAM_ACTION_STATE',
  message: 'Team action assignment state is missing',
};

/** Persisted runtime fingerprints, and which sessions are still playable. */
class FakeTargets {
  readonly fps = new Map<string, { runtimeId: string; revision: number }>();
  constructor(public playableIds: string[]) {}
  fp(sessionId: string) {
    return {
      sessionId,
      ...(this.fps.get(sessionId) ?? {
        runtimeId: `rt-${sessionId}`,
        revision: 1,
      }),
    };
  }
  playable = jest.fn<Promise<ReturnType<FakeTargets['fp']>[]>, [Date]>(
    async () => this.playableIds.map((id) => this.fp(id)),
  );
  fingerprints = jest.fn(async (ids: string[]) => ids.map((id) => this.fp(id)));
}

function setup(
  env: Record<string, string> = {},
  opts: { commit?: string; signal?: SignalProcess } = {},
) {
  const presence = new FakePresence();
  const leases = new FakeLeases();
  const registry = new PresenceConnectionRegistry();
  const reconciler = {
    forSession: jest.fn<Promise<ReconcileOutcome>, [string]>(async () => OK),
    cancelUnreadyBombCountdown: jest.fn(),
  };
  const targets = new FakeTargets(['live-1']);
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
    sessions as never,
    targets as never,
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
    targets,
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
      t.reconciler.forSession.mockResolvedValueOnce(TRANSIENT);
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
      t.targets.playableIds = ['first', 'second', 'evicted'];
      t.reconciler.forSession.mockResolvedValue(TRANSIENT);

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
      expect(t.targets.playable).toHaveBeenCalledTimes(1);
      expect(t.reconciler.forSession).toHaveBeenCalledWith('live-1');
      expect(t.reconciler.forSession).toHaveBeenCalledWith('bomb-1');
    });
  });

  describe('permanent failures, quarantine and the reconcile budget', () => {
    const quarantineLogs = () =>
      (Logger.prototype.warn as jest.Mock).mock.calls.filter(
        ([entry]) =>
          (entry as { event?: string })?.event ===
          'presence_reconcile_quarantined',
      ).length;
    /** Runs ticks until the next backstop tick (every third) has run. */
    const backstop = async (t: ReturnType<typeof setup>) => {
      for (let i = 0; i < 3; i += 1) await t.service.tick();
    };

    beforeEach(() => (Logger.prototype.warn as jest.Mock).mockClear());
    /** No Bomb countdowns, so only the sessions under test are reconciled. */
    const make = (env: Record<string, string> = {}) => {
      const t = setup(env);
      t.sessions.findSessionIdsInBombCountdown.mockResolvedValue([]);
      return t;
    };

    it('quarantines a provably unrestorable session once, then stops retrying and logging it', async () => {
      const t = make();
      await t.service.onApplicationBootstrap();
      t.targets.playableIds = ['broken'];
      t.reconciler.forSession.mockResolvedValue(PERMANENT);
      await backstop(t);
      expect(t.reconciler.forSession).toHaveBeenCalledTimes(1);
      expect(t.service.lastTick).toMatchObject({
        reconcileQuarantined: 1,
        quarantineSize: 1,
        reconcileBacklog: 0,
      });
      for (let i = 0; i < 4; i += 1) {
        t.advance(60_000);
        await backstop(t);
      }
      expect(t.reconciler.forSession).toHaveBeenCalledTimes(1);
      expect(quarantineLogs()).toBe(1);
    });

    it('keeps retrying transient failures with backoff and never quarantines them', async () => {
      const t = make();
      await t.service.onApplicationBootstrap();
      t.targets.playableIds = ['flaky'];
      t.reconciler.forSession.mockResolvedValue(TRANSIENT);
      for (let i = 0; i < 8; i += 1) {
        t.advance(60_000);
        await backstop(t);
      }
      expect(t.reconciler.forSession.mock.calls.length).toBeGreaterThanOrEqual(
        8,
      );
      expect(t.service.lastTick?.quarantineSize).toBe(0);
      expect(quarantineLogs()).toBe(0);
    });

    it('rechecks a quarantined session once the quarantine expires', async () => {
      const t = make({ PRESENCE_RECONCILE_QUARANTINE_MS: '600000' });
      await t.service.onApplicationBootstrap();
      t.targets.playableIds = ['broken'];
      t.reconciler.forSession.mockResolvedValueOnce(PERMANENT);
      await backstop(t);
      t.advance(599_000);
      await backstop(t);
      expect(t.reconciler.forSession).toHaveBeenCalledTimes(1);
      t.advance(1_000);
      await backstop(t);
      expect(t.reconciler.forSession).toHaveBeenCalledTimes(2);
      expect(t.service.lastTick?.quarantineSize).toBe(0);
    });

    it('lifts the quarantine early when the persisted runtime changes (backstop)', async () => {
      const t = make();
      await t.service.onApplicationBootstrap();
      t.targets.playableIds = ['broken'];
      t.reconciler.forSession.mockResolvedValueOnce(PERMANENT);
      await backstop(t);
      await backstop(t);
      expect(t.reconciler.forSession).toHaveBeenCalledTimes(1);
      // A repair, or a new challenge in that session.
      t.targets.fps.set('broken', { runtimeId: 'rt-new', revision: 1 });
      await backstop(t);
      expect(t.reconciler.forSession).toHaveBeenCalledTimes(2);
      expect(t.service.lastTick?.quarantineSize).toBe(0);
    });

    it('a disconnect in a quarantined session is reconciled only if its state changed', async () => {
      const t = make();
      await t.service.onApplicationBootstrap();
      t.targets.playableIds = ['s1'];
      t.reconciler.forSession.mockResolvedValueOnce(PERMANENT);
      await backstop(t);
      t.targets.playableIds = [];
      t.reconciler.forSession.mockClear();

      // A dead owner's entry in that session is swept: the session is dirty.
      t.presence.add('s1', 'p1', 'dead:a');
      t.leases.ages.set('dead', 60_000);
      await t.service.tick();
      await t.service.tick();
      expect(t.presence.has('s1', 'p1', 'dead:a')).toBe(false);
      expect(t.reconciler.forSession).not.toHaveBeenCalled();

      t.targets.fps.set('s1', { runtimeId: 'rt-s1', revision: 2 });
      t.presence.add('s1', 'p2', 'dead:b');
      await t.service.tick();
      expect(t.reconciler.forSession).toHaveBeenCalledWith('s1');
    });

    it('bounds the quarantine, forgetting the oldest first', async () => {
      const t = make({ PRESENCE_RECONCILE_QUARANTINE_CAPACITY: '2' });
      await t.service.onApplicationBootstrap();
      t.targets.playableIds = ['a', 'b', 'c'];
      t.reconciler.forSession.mockResolvedValue(PERMANENT);
      t.service.options.concurrency = 1;
      await backstop(t);
      expect(t.service.lastTick?.quarantineSize).toBe(2);
      t.reconciler.forSession.mockClear();
      await backstop(t);
      // `a` was forgotten, so it is retried (and quarantined again); b, c not.
      expect(t.reconciler.forSession.mock.calls.map(([id]) => id)).toEqual([
        'a',
      ]);
      expect(t.service.lastTick?.quarantineSize).toBe(2);
    });

    it('never holds back healthy sessions while others are quarantined', async () => {
      const t = make();
      await t.service.onApplicationBootstrap();
      t.targets.playableIds = ['broken', 'healthy'];
      t.reconciler.forSession.mockImplementation(async (id) =>
        id === 'broken' ? PERMANENT : OK,
      );
      await backstop(t);
      t.reconciler.forSession.mockClear();
      await backstop(t);
      expect(t.reconciler.forSession.mock.calls.map(([id]) => id)).toEqual([
        'healthy',
      ]);
    });

    it('caps reconcile wall time, so critical steps run every tick', async () => {
      const t = make();
      await t.service.onApplicationBootstrap();
      t.service.options.concurrency = 1;
      t.targets.playableIds = Array.from({ length: 10 }, (_, i) => `s${i}`);
      // Each reconciliation takes 1.5s of (fake) wall time.
      t.reconciler.forSession.mockImplementation(async () => {
        t.advance(1_500);
        return OK;
      });
      await t.service.tick();
      await t.service.tick();
      const slow = await t.service.tick();
      expect(slow.sessionsReconciled).toBe(2); // 0s, 1.5s; stops at 3s ≥ 2s
      expect(slow.reconcileBudgetExhausted).toBe(true);
      expect(slow.reconcileBacklog).toBe(8);

      // The next tick still refreshes the lease and sweeps a dead owner first.
      t.presence.add('x', 'p', 'dead:a');
      t.leases.ages.set('dead', 60_000);
      t.leases.heartbeat.mockClear();
      await t.service.tick();
      const sweep = await t.service.tick();
      expect(t.leases.heartbeat).toHaveBeenCalledTimes(2);
      expect(sweep.removed).toBe(1);
      expect(sweep.reconcileBudgetExhausted).toBe(true);
    });

    it('reconciles sessions enqueued in the same tick even when the clock moves (no self-deferral)', async () => {
      const t = make();
      await t.service.onApplicationBootstrap();
      t.targets.playableIds = ['s1'];
      // A real clock: every reading is later than the previous one.
      let clock = 5_000_000;
      t.service.now = () => (clock += 1);
      await backstop(t);
      expect(t.reconciler.forSession).toHaveBeenCalledWith('s1');
      expect(t.service.lastTick?.reconcileDeferred).toBe(0);
    });

    it('reconciles in parallel lanes and quarantines each failing session exactly once', async () => {
      const t = make();
      await t.service.onApplicationBootstrap();
      t.targets.playableIds = Array.from({ length: 20 }, (_, i) => `s${i}`);
      t.reconciler.forSession.mockImplementation(async (id) =>
        Number(id.slice(1)) % 2 ? PERMANENT : OK,
      );
      await backstop(t);
      expect(t.reconciler.forSession).toHaveBeenCalledTimes(20);
      expect(t.service.lastTick).toMatchObject({
        reconcileQuarantined: 10,
        quarantineSize: 10,
        reconcileBacklog: 0,
      });
      expect(quarantineLogs()).toBe(10);
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
        on: jest.fn((_: 'SIGTERM', l: (s: NodeJS.Signals) => void) => {
          listeners.push(l);
        }),
        removeListener: jest.fn(),
        exit: jest.fn(),
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
      expect(proc.on).not.toHaveBeenCalled();
    });

    it('releases own entries and lease, then exits 0 (graceful)', async () => {
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
      expect(proc.exit).toHaveBeenCalledTimes(1);
      expect(proc.exit).toHaveBeenCalledWith(0);
    });

    it('still exits, non-zero, when release fails, leaving the entries to the sweep', async () => {
      const { proc, fire } = fakeProcess();
      const t = setup({ PRESENCE_SIGTERM_RELEASE: 'true' }, { signal: proc });
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', `${ME}:a`);
      t.presence.failRemove = true;
      fire();
      await flush();
      expect(proc.exit).toHaveBeenCalledWith(143);
      expect(t.presence.has('s1', 'p1', `${ME}:a`)).toBe(true);
      expect(t.leases.released).toEqual([]);
    });

    it('still exits, non-zero, within the deadline when release hangs', async () => {
      jest.useFakeTimers();
      try {
        const { proc, fire } = fakeProcess();
        const t = setup({ PRESENCE_SIGTERM_RELEASE: 'true' }, { signal: proc });
        await t.service.onApplicationBootstrap();
        t.leases.releaseImpl = () => new Promise(() => undefined);
        fire();
        await flush();
        expect(proc.exit).not.toHaveBeenCalled();
        jest.advanceTimersByTime(4_999);
        await flush();
        expect(proc.exit).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        await flush();
        expect(proc.exit).toHaveBeenCalledWith(143);
      } finally {
        jest.useRealTimers();
      }
    });

    it('ignores a repeated SIGTERM during release: one release, one exit', async () => {
      const { proc, fire } = fakeProcess();
      const t = setup({ PRESENCE_SIGTERM_RELEASE: 'true' }, { signal: proc });
      await t.service.onApplicationBootstrap();
      t.presence.add('s1', 'p1', `${ME}:a`);
      let finish!: () => void;
      t.leases.releaseImpl = () => new Promise<void>((r) => (finish = r));
      fire();
      fire();
      await flush();
      fire();
      expect(proc.exit).not.toHaveBeenCalled();
      finish();
      await flush();
      expect(t.leases.release).toHaveBeenCalledTimes(1);
      expect(proc.exit).toHaveBeenCalledTimes(1);
      expect(proc.exit).toHaveBeenCalledWith(0);
    });

    it('waits for buffered log output to drain before exiting', async () => {
      jest.useFakeTimers();
      try {
        const { proc, fire } = fakeProcess();
        const stdout = { writableLength: 4096 };
        const signal = { ...proc, stdout, stderr: { writableLength: 0 } };
        const t = setup({ PRESENCE_SIGTERM_RELEASE: 'true' }, { signal });
        await t.service.onApplicationBootstrap();
        fire();
        await flush();
        jest.advanceTimersByTime(50);
        await flush();
        expect(proc.exit).not.toHaveBeenCalled();
        // A repeated SIGTERM while draining is still absorbed.
        fire();
        expect(proc.removeListener).not.toHaveBeenCalled();
        stdout.writableLength = 0;
        jest.advanceTimersByTime(5);
        await flush();
        expect(proc.exit).toHaveBeenCalledTimes(1);
        expect(proc.exit).toHaveBeenCalledWith(0);
        expect(proc.removeListener).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('bounds the drain: exits after 1s even if output never drains', async () => {
      jest.useFakeTimers();
      try {
        const { proc, fire } = fakeProcess();
        const signal = { ...proc, stdout: { writableLength: 1 } };
        const t = setup({ PRESENCE_SIGTERM_RELEASE: 'true' }, { signal });
        await t.service.onApplicationBootstrap();
        t.presence.failRemove = true;
        t.presence.add('s1', 'p1', `${ME}:a`);
        fire();
        await flush();
        for (let i = 0; i < 205 && !proc.exit.mock.calls.length; i += 1) {
          jest.advanceTimersByTime(5);
          await flush();
        }
        expect(proc.exit).toHaveBeenCalledWith(143);
      } finally {
        jest.useRealTimers();
      }
    });

    it('removes its listener on module destroy (no handler leaks across app instances)', async () => {
      const { proc } = fakeProcess();
      const t = setup({ PRESENCE_SIGTERM_RELEASE: 'true' }, { signal: proc });
      await t.service.onApplicationBootstrap();
      t.service.onModuleDestroy();
      expect(proc.removeListener).toHaveBeenCalledWith(
        'SIGTERM',
        expect.any(Function),
      );
    });
  });
});
