import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PARTICIPANT_PRESENCE,
  ParticipantPresence,
  StoredPresenceEntry,
} from './participant-presence.port';
import { PRESENCE_INSTANCE, PresenceInstance } from './presence-instance';
import { PresenceConnectionRegistry } from './presence-connection.registry';
import { PresenceEffectsReconciler } from './presence-effects.reconciler';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import { parsePresenceConnection } from '../domain/presence-connection-id';
import {
  LeaseOperationError,
  MongooseInstanceLeaseRepository,
} from '../infrastructure/mongoose-instance-lease.repository';
import { traceStartupStep } from '../../../common/diagnostics/startup-diagnostics';

export interface PresenceOwnershipOptions {
  /** Background tick interval; 0 disables background ticks. */
  tickMs: number;
  /** An owner whose lease is older than this (server clock) is suspect. */
  leaseStaleMs: number;
  /** Consecutive suspect observations before an owner counts as dead. */
  confirmations: number;
  /** Bound for the one lease registration that precedes serving. */
  registrationDeadlineMs: number;
  /** Bound for each background database operation. */
  operationDeadlineMs: number;
  /** Reconcile every live session every N ticks, as a backstop. */
  fullReconcileEveryTicks: number;
  /** A subscription younger than this is never treated as foreign-removed. */
  recoveryGraceMs: number;
  /** Slot reclaim needs a lease stale for this long (single observation). */
  slotReclaimStaleMs: number;
  /** Legacy purge: `<commit>:<nonce>`, armed only on that exact commit. */
  legacyPurge?: string;
  legacyPurgeMinUptimeMs: number;
  /** The legacy entry set must stay unchanged this long before purging. */
  legacyFreezeMs: number;
  /** Release owned entries on SIGTERM. */
  sigtermRelease: boolean;
  releaseDeadlineMs: number;
  /** Instance leases dead for longer than this are deleted. */
  leaseRetentionMs: number;
  /** Concurrent database operations within one tick step. */
  concurrency: number;
  /** Sessions reconciled per tick; the rest carry over to the next tick. */
  reconcileBudget: number;
  /** Maximum in-memory retry records; persisted scans remain the backstop. */
  retryCapacity: number;
  retryBaseMs: number;
  retryMaxMs: number;
}

export interface PresenceTickStats {
  durationMs: number;
  entriesScanned: number;
  ownersChecked: number;
  deadOwners: string[];
  removed: number;
  orphansRemoved: number;
  recoveriesRequested: number;
  sessionsReconciled: number;
  /** Sessions still owed a reconciliation after this tick. */
  reconcileBacklog: number;
  reconcileDeferred: number;
  reconcileDropped: number;
  stepFailures: string[];
  skipped?: boolean;
}

/** A minimal process surface, injectable so SIGTERM handling is testable. */
export interface SignalProcess {
  on(event: 'SIGTERM', listener: (signal: NodeJS.Signals) => void): unknown;
  removeListener(
    event: 'SIGTERM',
    listener: (signal: NodeJS.Signals) => void,
  ): unknown;
  exit(code: number): unknown;
  /** Output streams drained before exiting (process.stdout / stderr). */
  stdout?: { writableLength: number };
  stderr?: { writableLength: number };
}

/** Longest the shutdown waits for buffered log output before exiting. */
export const SHUTDOWN_OUTPUT_DRAIN_MS = 1_000;

/**
 * Resolves once both streams have handed every buffered byte to the OS, or
 * after `deadlineMs`. Writes to a pipe — a container's stdout — are
 * asynchronous on POSIX, and `process.exit()` discards whatever is still
 * queued, which is how a busy instance's final shutdown lines were lost.
 */
async function drainOutput(
  target: Pick<SignalProcess, 'stdout' | 'stderr'>,
  deadlineMs: number,
): Promise<void> {
  const started = Date.now();
  const pending = () =>
    (target.stdout?.writableLength ?? 0) + (target.stderr?.writableLength ?? 0);
  while (pending() > 0 && Date.now() - started < deadlineMs) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Exit status after a graceful shutdown whose presence release succeeded. */
export const SHUTDOWN_EXIT_OK = 0;
/** Exit status when the release failed or timed out (128 + SIGTERM). */
export const SHUTDOWN_EXIT_INCOMPLETE = 128 + 15;

export const PRESENCE_SIGNAL_PROCESS = Symbol('PRESENCE_SIGNAL_PROCESS');

/** Runs `work` over `items` with at most `limit` in flight. */
async function eachBounded<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) await work(items[next++]);
    },
  );
  await Promise.all(lanes);
}

const number = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export function presenceOwnershipOptions(
  config: Pick<ConfigService, 'get'>,
): PresenceOwnershipOptions {
  const env = (key: string) => config.get<string>(key);
  const isTest = env('NODE_ENV') === 'test';
  const isProduction = env('NODE_ENV') === 'production';
  const sigterm = env('PRESENCE_SIGTERM_RELEASE');
  return {
    // Tests drive tick() explicitly; production ticks every 5s.
    tickMs: number(env('PRESENCE_OWNERSHIP_TICK_MS'), isTest ? 0 : 5_000),
    leaseStaleMs: number(env('PRESENCE_LEASE_STALE_MS'), 15_000),
    confirmations: Math.max(1, number(env('PRESENCE_DEAD_CONFIRMATIONS'), 2)),
    registrationDeadlineMs: 10_000,
    operationDeadlineMs: 4_000,
    fullReconcileEveryTicks: 3,
    recoveryGraceMs: 10_000,
    slotReclaimStaleMs: 30_000,
    legacyPurge: env('PRESENCE_LEGACY_PURGE')?.trim() || undefined,
    legacyPurgeMinUptimeMs: 120_000,
    legacyFreezeMs: 180_000,
    sigtermRelease:
      sigterm === undefined ? isProduction : sigterm.trim() === 'true',
    releaseDeadlineMs: 5_000,
    leaseRetentionMs: 24 * 60 * 60 * 1_000,
    concurrency: 8,
    reconcileBudget: 200,
    retryCapacity: Math.max(1, number(env('PRESENCE_RETRY_CAPACITY'), 2_000)),
    retryBaseMs: Math.max(1, number(env('PRESENCE_RETRY_BASE_MS'), 1_000)),
    retryMaxMs: Math.max(1, number(env('PRESENCE_RETRY_MAX_MS'), 60_000)),
  };
}

/**
 * Instance-owned presence: who may remove which connection, and when.
 *
 * - Registers this instance's lease (bounded) before the app serves sockets;
 *   no socket can be owned by an instance whose lease never registered.
 * - Refreshes the lease and, on each tick, removes the entries of owners whose
 *   lease is stale on the database server's clock across `confirmations`
 *   consecutive observations — one exact stored value at a time.
 * - Detects its own live sockets whose entries vanished (a false expiry, a
 *   rollback's global reset) and asks them to reconnect, instead of silently
 *   re-adding entries the clients' own state no longer matches.
 * - Reconciles gameplay from state for touched sessions and, periodically, for
 *   every live session, so effects are recovered after partial failures.
 * - Never removes legacy (unowned) entries except through the operator-armed,
 *   nonce-consumed, freeze-checked legacy purge.
 *
 * Recovery timing is a target, not a guarantee: database errors and scheduler
 * delays postpone it, and every postponed step is retried by the next tick.
 */
@Injectable()
export class PresenceOwnershipService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PresenceOwnershipService.name);
  readonly options: PresenceOwnershipOptions;
  private registered = false;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopped = false;
  private ticks = 0;
  private startedAt: number;
  private readonly suspicion = new Map<string, number>();
  private orphanSuspicion = new Set<string>();
  /** Bounded FIFO retry state; full persisted scans recover evicted work. */
  private readonly retry = new Map<
    string,
    { attempts: number; nextAt: number; queuedAt: number }
  >();
  private legacy:
    | {
        commit: string;
        nonce: string;
        done: boolean;
        baseline?: Set<string>;
        baselineAt?: number;
      }
    | undefined;
  private signalHandler?: (signal: NodeJS.Signals) => void;
  lastTick?: PresenceTickStats;
  /** Overridable in tests. */
  now: () => number = () => Date.now();

  constructor(
    config: ConfigService,
    @Inject(PRESENCE_INSTANCE) private readonly instance: PresenceInstance,
    @Inject(PARTICIPANT_PRESENCE)
    private readonly presence: ParticipantPresence,
    private readonly leases: MongooseInstanceLeaseRepository,
    private readonly registry: PresenceConnectionRegistry,
    private readonly reconciler: PresenceEffectsReconciler,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Optional()
    @Inject(PRESENCE_SIGNAL_PROCESS)
    private readonly signalProcess?: SignalProcess,
  ) {
    this.options = presenceOwnershipOptions(config);
    this.startedAt = Date.now();
  }

  get instanceId(): string {
    return this.instance.instanceId;
  }

  get isRegistered(): boolean {
    return this.registered;
  }

  async onApplicationBootstrap(): Promise<void> {
    this.startedAt = this.now();
    await traceStartupStep(
      'PresenceOwnershipService.onApplicationBootstrap',
      () => this.register(),
    );
    this.armLegacyPurge();
    if (this.legacy && !this.legacy.done) {
      try {
        if (
          await this.leases.isPurgeConsumed(
            this.legacy.nonce,
            this.options.operationDeadlineMs,
          )
        ) {
          this.legacy.done = true;
          this.logger.log({ event: 'presence_legacy_purge_already_consumed' });
        }
      } catch (error) {
        this.logFailure('legacy_purge_check', error);
      }
    }
    if (this.options.tickMs > 0) {
      this.timer = setInterval(() => {
        void this.tick();
      }, this.options.tickMs);
      this.timer.unref?.();
    }
    if (this.options.sigtermRelease) {
      this.installSignalHandler(this.signalProcess ?? process);
    }
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.signalHandler) {
      (this.signalProcess ?? process).removeListener(
        'SIGTERM',
        this.signalHandler,
      );
      this.signalHandler = undefined;
    }
  }

  /** The one bounded lease write that must succeed before serving sockets. */
  async register(): Promise<void> {
    const started = Date.now();
    try {
      await this.leases.heartbeat({
        instanceId: this.instance.instanceId,
        commit: this.instance.commit,
        deadlineMs: this.options.registrationDeadlineMs,
      });
      this.registered = true;
      this.logger.log({
        event: 'presence_lease_registered',
        instanceId: this.instance.instanceId,
        durationMs: Date.now() - started,
      });
    } catch (error) {
      this.logFailure('lease_registration', error, {
        durationMs: Date.now() - started,
      });
      throw error;
    }
  }

  /** Throws unless this instance may own sockets. */
  assertRegistered(): void {
    if (!this.registered || this.stopped) {
      throw Object.assign(
        new Error('Presence ownership is not registered on this instance'),
        { code: 'PRESENCE_NOT_READY' },
      );
    }
  }

  private armLegacyPurge(): void {
    const value = this.options.legacyPurge;
    if (!value) return;
    const at = value.lastIndexOf(':');
    const commit = at > 0 ? value.slice(0, at) : '';
    const nonce = at > 0 ? value.slice(at + 1) : '';
    if (!commit || !nonce || commit !== this.instance.commit) {
      this.logger.warn({
        event: 'presence_legacy_purge_not_armed',
        reason: !commit || !nonce ? 'malformed' : 'commit-mismatch',
      });
      return;
    }
    this.legacy = { commit, nonce, done: false };
    this.logger.log({ event: 'presence_legacy_purge_armed' });
  }

  /** One ownership pass. Never overlaps itself; every step is contained. */
  async tick(): Promise<PresenceTickStats> {
    const started = this.now();
    const stats: PresenceTickStats = {
      durationMs: 0,
      entriesScanned: 0,
      ownersChecked: 0,
      deadOwners: [],
      removed: 0,
      orphansRemoved: 0,
      recoveriesRequested: 0,
      sessionsReconciled: 0,
      reconcileBacklog: 0,
      reconcileDeferred: 0,
      reconcileDropped: 0,
      stepFailures: [],
    };
    if (this.running || this.stopped) return { ...stats, skipped: true };
    this.running = true;
    this.ticks += 1;
    const dirty = new Set<string>();
    try {
      await this.step(stats, 'lease_refresh', () =>
        this.leases.heartbeat({
          instanceId: this.instance.instanceId,
          commit: this.instance.commit,
          deadlineMs: this.options.operationDeadlineMs,
        }),
      );

      let entries: StoredPresenceEntry[] | undefined;
      await this.step(stats, 'scan', async () => {
        entries = await this.presence.listEntries();
      });
      if (entries) {
        stats.entriesScanned = entries.length;
        await this.step(stats, 'dead_owner_sweep', () =>
          this.sweepDeadOwners(entries!, stats, dirty),
        );
        await this.step(stats, 'own_entries', () =>
          this.checkOwnEntries(entries!, stats, dirty),
        );
        await this.step(stats, 'legacy_purge', () =>
          this.legacyPurgeStep(entries!, dirty),
        );
      }

      await this.step(stats, 'reconcile', async () => {
        for (const id of dirty) this.enqueueRetry(id, stats);
        if (this.ticks % this.options.fullReconcileEveryTicks === 0) {
          // The backstop for effects lost to a crash between a removal and its
          // effects: every live runtime, and every Bomb countdown (which has
          // no runtime yet and would otherwise stay stuck in `ready`).
          const [live, countdowns] = await Promise.all([
            this.runtimes.findSessionIdsWithLiveRuntimes(),
            this.sessions.findSessionIdsInBombCountdown(),
          ]);
          for (const id of [...live, ...countdowns])
            this.enqueueRetry(id, stats);
        }
        // Budgeted: a mass sweep (one instance dying with many players) is
        // spread over several ticks rather than making one tick outlast its
        // interval. Sessions over budget stay owed in `retry`.
        const now = this.now();
        const ordered = [...this.retry.entries()].sort(
          ([, a], [, b]) => a.nextAt - b.nextAt || a.queuedAt - b.queuedAt,
        );
        const batch = ordered
          .filter(([, state]) => state.nextAt <= now)
          .slice(0, this.options.reconcileBudget);
        stats.reconcileDeferred = ordered.length - batch.length;
        await eachBounded(
          batch,
          this.options.concurrency,
          async ([sessionId, retry]) => {
            const ok = await this.reconciler.forSession(sessionId);
            stats.sessionsReconciled += 1;
            if (ok) {
              this.retry.delete(sessionId);
              return;
            }
            const attempts = retry.attempts + 1;
            const delay = Math.min(
              this.options.retryMaxMs,
              this.options.retryBaseMs * 2 ** Math.min(attempts - 1, 16),
            );
            this.retry.set(sessionId, {
              attempts,
              nextAt: now + delay,
              queuedAt: retry.queuedAt,
            });
          },
        );
        stats.reconcileBacklog = this.retry.size;
      });

      if (this.ticks % 720 === 0) {
        await this.step(stats, 'lease_cleanup', () =>
          this.leases.deleteExpired(
            this.options.leaseRetentionMs,
            this.options.operationDeadlineMs,
          ),
        );
      }
    } finally {
      this.running = false;
      stats.durationMs = this.now() - started;
      this.lastTick = stats;
      if (
        stats.removed ||
        stats.orphansRemoved ||
        stats.recoveriesRequested ||
        stats.reconcileBacklog ||
        stats.stepFailures.length ||
        (this.options.tickMs > 0 && stats.durationMs > this.options.tickMs / 2)
      ) {
        this.logger.log({ event: 'presence_ownership_tick', ...stats });
      }
    }
    return stats;
  }

  private enqueueRetry(sessionId: string, stats: PresenceTickStats): void {
    if (this.retry.has(sessionId)) return;
    if (this.retry.size >= this.options.retryCapacity) {
      stats.reconcileDropped += 1;
      this.logger.warn({
        event: 'presence_reconcile_retry_capacity_reached',
        sessionId,
        capacity: this.options.retryCapacity,
      });
      return;
    }
    const now = this.now();
    this.retry.set(sessionId, { attempts: 0, nextAt: now, queuedAt: now });
  }

  private async sweepDeadOwners(
    entries: StoredPresenceEntry[],
    stats: PresenceTickStats,
    dirty: Set<string>,
  ): Promise<void> {
    const owners = [
      ...new Set(
        entries
          .map((entry) => parsePresenceConnection(entry.entry).owner)
          .filter(
            (owner): owner is string =>
              owner !== null && owner !== this.instance.instanceId,
          ),
      ),
    ];
    stats.ownersChecked = owners.length;
    for (const known of [...this.suspicion.keys()]) {
      if (!owners.includes(known)) this.suspicion.delete(known);
    }
    if (!owners.length) return;
    const statuses = await this.leases.status({
      owners,
      staleAfterMs: this.options.leaseStaleMs,
      deadlineMs: this.options.operationDeadlineMs,
    });
    const dead: string[] = [];
    for (const owner of owners) {
      if (statuses.get(owner)?.stale) {
        const count = (this.suspicion.get(owner) ?? 0) + 1;
        this.suspicion.set(owner, count);
        if (count >= this.options.confirmations) dead.push(owner);
      } else {
        this.suspicion.delete(owner);
      }
    }
    stats.deadOwners = dead;
    if (!dead.length) return;
    const deadSet = new Set(dead);
    const doomed = entries.filter((entry) => {
      const owner = parsePresenceConnection(entry.entry).owner;
      return owner !== null && deadSet.has(owner);
    });
    await eachBounded(doomed, this.options.concurrency, async (entry) => {
      if (await this.presence.removeExact(entry)) {
        stats.removed += 1;
        dirty.add(entry.sessionId);
      }
    });
  }

  /**
   * Own entries without a live local subscription are orphans (a disconnect
   * whose removal failed); own live subscriptions without an entry were removed
   * by someone else and must reconnect.
   */
  private async checkOwnEntries(
    entries: StoredPresenceEntry[],
    stats: PresenceTickStats,
    dirty: Set<string>,
  ): Promise<void> {
    const now = this.now();
    const registered = this.registry.list();
    const registeredKeys = new Set(
      registered.map((c) => `${c.sessionId}|${c.participantId}|${c.socketId}`),
    );
    const ownKeys = new Set<string>();
    const suspects = new Set<string>();
    for (const entry of entries) {
      const parsed = parsePresenceConnection(entry.entry);
      if (parsed.owner !== this.instance.instanceId) continue;
      const key = `${entry.sessionId}|${entry.participantId}|${parsed.socketId}`;
      ownKeys.add(key);
      if (registeredKeys.has(key)) continue;
      // An orphan must be seen on two consecutive ticks and still be
      // unregistered at removal time: a socket that unsubscribes and
      // resubscribes between the scan and this check is never stripped.
      suspects.add(key);
      if (!this.orphanSuspicion.has(key)) continue;
      if (this.registry.has(parsed.socketId, entry.sessionId)) continue;
      if (await this.presence.removeExact(entry)) {
        stats.orphansRemoved += 1;
        dirty.add(entry.sessionId);
      }
    }
    this.orphanSuspicion = suspects;
    for (const connection of registered) {
      if (now - connection.registeredAt < this.options.recoveryGraceMs)
        continue;
      const key = `${connection.sessionId}|${connection.participantId}|${connection.socketId}`;
      if (ownKeys.has(key)) continue;
      if (
        this.registry.requestRecovery(connection.socketId, connection.sessionId)
      ) {
        stats.recoveriesRequested += 1;
        this.logger.warn({
          event: 'presence_recovery_requested',
          sessionId: connection.sessionId,
          participantId: connection.participantId,
          socketId: connection.socketId,
        });
      }
    }
  }

  /**
   * Operator-armed removal of every legacy (unowned) entry, regardless of the
   * participant's activity, once the legacy instance is proven stopped:
   *   - armed only when `PRESENCE_LEGACY_PURGE` names this exact commit;
   *   - its nonce is consumed atomically, so a redeploy of the same commit with
   *     the same setting (e.g. after a rollback) never purges again;
   *   - it waits for minimum uptime, then requires the legacy entry set *and*
   *     the liveness of rows held only by legacy entries to stay unchanged for
   *     `legacyFreezeMs` — a running legacy instance adds and removes bare ids
   *     as players come and go, and advances `lastSeenAt` on every participant
   *     heartbeat while they stay; either restarts the wait. This is a
   *     safeguard on top of the operator's proof, not a replacement for it: a
   *     legacy instance serving only hosts (which send no heartbeat) and no
   *     joins or leaves is not detectable.
   */
  private async legacyPurgeStep(
    entries: StoredPresenceEntry[],
    dirty: Set<string>,
  ): Promise<void> {
    const legacy = this.legacy;
    if (!legacy || legacy.done) return;
    const now = this.now();
    if (now - this.startedAt < this.options.legacyPurgeMinUptimeMs) return;
    const unowned = entries.filter(
      (entry) => parsePresenceConnection(entry.entry).owner === null,
    );
    const keys = new Set(
      unowned.map((e) => `${e.sessionId}|${e.participantId}|${e.entry}`),
    );
    // A live legacy instance whose players stay connected changes no entries,
    // but its heartbeats keep advancing those players' rows. Rows held only by
    // legacy entries therefore contribute their `lastSeenAt`; a row that also
    // holds an owned entry is excluded, since a protocol-2 heartbeat on it says
    // nothing about the legacy instance.
    const ownedRows = new Set(
      entries
        .filter((e) => parsePresenceConnection(e.entry).owner !== null)
        .map((e) => `${e.sessionId}|${e.participantId}`),
    );
    for (const e of unowned) {
      const row = `${e.sessionId}|${e.participantId}`;
      if (ownedRows.has(row)) continue;
      keys.add(`seen|${row}|${e.rowLastSeenAt?.getTime() ?? 'none'}`);
    }
    const same =
      legacy.baseline !== undefined &&
      legacy.baseline.size === keys.size &&
      [...keys].every((key) => legacy.baseline!.has(key));
    if (!legacy.baseline || !same) {
      if (legacy.baseline) {
        this.logger.warn({ event: 'presence_legacy_activity_detected' });
      }
      legacy.baseline = keys;
      legacy.baselineAt = now;
      return;
    }
    if (now - (legacy.baselineAt ?? now) < this.options.legacyFreezeMs) return;
    const claimed = await this.leases.claimPurge({
      nonce: legacy.nonce,
      instanceId: this.instance.instanceId,
      commit: legacy.commit,
      deadlineMs: this.options.operationDeadlineMs,
    });
    legacy.done = true;
    if (!claimed) {
      this.logger.log({ event: 'presence_legacy_purge_already_consumed' });
      return;
    }
    let removed = 0;
    for (const entry of unowned) {
      if (await this.presence.removeExact(entry)) {
        removed += 1;
        dirty.add(entry.sessionId);
      }
    }
    this.logger.log({ event: 'presence_legacy_purge_completed', removed });
  }

  /**
   * Frees device slots held by dead owners for one participant, so a live
   * device is never refused because of a crashed instance's ghost. Uses a
   * stricter single-observation threshold (or a missing lease: every
   * protocol-2 owner registers before owning sockets, and a lease is deleted
   * only after its owner released its entries).
   */
  async reclaimDeadSlots(
    sessionId: string,
    participantId: string,
  ): Promise<number> {
    const stored = await this.presence.entriesFor(sessionId, participantId);
    const owners = [
      ...new Set(
        stored
          .map((entry) => parsePresenceConnection(entry).owner)
          .filter(
            (owner): owner is string =>
              owner !== null && owner !== this.instance.instanceId,
          ),
      ),
    ];
    if (!owners.length) return 0;
    const statuses = await this.leases.status({
      owners,
      staleAfterMs: this.options.slotReclaimStaleMs,
      deadlineMs: this.options.operationDeadlineMs,
    });
    let removed = 0;
    for (const entry of stored) {
      const owner = parsePresenceConnection(entry).owner;
      if (!owner || owner === this.instance.instanceId) continue;
      const status = statuses.get(owner);
      if (!status || !(status.stale || !status.exists)) continue;
      if (
        await this.presence.removeExact({ sessionId, participantId, entry })
      ) {
        removed += 1;
      }
    }
    if (removed) {
      this.logger.warn({
        event: 'presence_dead_slots_reclaimed',
        sessionId,
        participantId,
        removed,
      });
      await this.reconciler.forSession(sessionId);
    }
    return removed;
  }

  /**
   * Releases this instance's own entries and lease (graceful shutdown). Stops
   * the tick first so nothing re-adds or sweeps concurrently.
   */
  async releaseOwned(): Promise<number> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const entries = await this.presence.listEntries();
    const sessions = new Set<string>();
    let removed = 0;
    for (const entry of entries) {
      if (
        parsePresenceConnection(entry.entry).owner !== this.instance.instanceId
      ) {
        continue;
      }
      if (await this.presence.removeExact(entry)) {
        removed += 1;
        sessions.add(entry.sessionId);
      }
    }
    for (const sessionId of sessions) {
      await this.reconciler.forSession(sessionId);
    }
    await this.leases.release(
      this.instance.instanceId,
      this.options.operationDeadlineMs,
    );
    this.logger.log({ event: 'presence_released_on_shutdown', removed });
    return removed;
  }

  /**
   * Installs the SIGTERM handler: release owned presence within a bounded time,
   * then exit explicitly.
   *
   * The exit is explicit rather than a re-raised SIGTERM: a process that is
   * PID 1 in a container ignores a signal's default action, so a re-raise
   * would leave it running until the platform's SIGKILL. Render documents a
   * zero status after cleanup as the graceful outcome; a failed or timed-out
   * release exits 143 so the incomplete cleanup stays visible. Buffered log
   * output is drained (bounded) before the exit, so the final diagnostics
   * survive. A repeated SIGTERM while releasing is ignored — the release is
   * already bounded.
   */
  installSignalHandler(target: SignalProcess): void {
    let shuttingDown = false;
    const handler = () => {
      if (shuttingDown) {
        this.logger.warn({ event: 'presence_shutdown_signal_repeated' });
        return;
      }
      shuttingDown = true;
      void (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let code = SHUTDOWN_EXIT_OK;
        try {
          await Promise.race([
            this.releaseOwned(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('presence release timed out')),
                this.options.releaseDeadlineMs,
              );
            }),
          ]);
        } catch (error) {
          code = SHUTDOWN_EXIT_INCOMPLETE;
          this.logFailure('shutdown_release', error);
        } finally {
          if (timer) clearTimeout(timer);
          this.logger.log({ event: 'presence_shutdown_exit', exitCode: code });
          await drainOutput(target, SHUTDOWN_OUTPUT_DRAIN_MS);
          // Removed only now, so a repeated SIGTERM while draining is still
          // absorbed by this handler instead of killing the flush.
          target.removeListener('SIGTERM', handler);
          this.signalHandler = undefined;
          target.exit(code);
        }
      })();
    };
    this.signalHandler = handler;
    target.on('SIGTERM', handler);
  }

  private async step(
    stats: PresenceTickStats,
    name: string,
    work: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await work();
    } catch (error) {
      stats.stepFailures.push(name);
      this.logFailure(name, error);
    }
  }

  private logFailure(
    step: string,
    error: unknown,
    extra: Record<string, unknown> = {},
  ): void {
    this.logger.error({
      event: `presence_${step}_failed`,
      instanceId: this.instance.instanceId,
      kind: error instanceof LeaseOperationError ? error.kind : 'other',
      message: error instanceof Error ? error.message : String(error),
      ...extra,
    });
  }
}
