import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import { io as connectClient, Socket as ClientSocket } from 'socket.io-client';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  isolatedTestDatabaseUri,
  resetTestDatabase,
} from '../helpers/test-database';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../../src/modules/live-game-sessions/domain/live-game-session.repository';
import { LiveGameSession } from '../../src/modules/live-game-sessions/domain/live-game-session';
import {
  BOMB_TIMED_TURNS_MODE,
  CORE_TIMED_TURNS_MODE,
} from '../../src/modules/live-game-sessions/domain/live-game-mode.registry';
import { PresenceOwnershipService } from '../../src/modules/live-game-sessions/application/presence-ownership.service';
import { PresenceConnectionRegistry } from '../../src/modules/live-game-sessions/application/presence-connection.registry';
import { UpdateParticipantPresence } from '../../src/modules/live-game-sessions/application/update-participant-presence.use-case';
import { ParticipantCredentialService } from '../../src/modules/live-game-sessions/application/participant-credential.service';
import {
  PRESENCE_INSTANCE,
  PresenceInstance,
} from '../../src/modules/live-game-sessions/application/presence-instance';

/**
 * Instance-owned presence against real Mongo with several real backend
 * instances (full Nest apps) sharing one replica-set database — the zero-
 * downtime deploy overlap, a crash, a rollback to the legacy release and a
 * roll-forward — plus a real Socket.IO client for the recovery protocol.
 */
const SUITE = 'presence-ownership';
const NOW = new Date();

interface Instance {
  app: INestApplication;
  id: string;
  ownership: PresenceOwnershipService;
  registry: PresenceConnectionRegistry;
  presence: UpdateParticipantPresence;
  sessions: LiveGameSessionRepository;
}

describe('presence instance ownership (multi-instance integration)', () => {
  let database: Connection;
  const open: INestApplication[] = [];

  const boot = async (env: Record<string, string> = {}): Promise<Instance> => {
    const app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri(SUITE), ...env },
    });
    for (const key of Object.keys(env)) delete process.env[key];
    open.push(app);
    return {
      app,
      id: app.get<PresenceInstance>(PRESENCE_INSTANCE).instanceId,
      ownership: app.get(PresenceOwnershipService),
      registry: app.get(PresenceConnectionRegistry),
      presence: app.get(UpdateParticipantPresence),
      sessions: app.get<LiveGameSessionRepository>(
        LIVE_GAME_SESSION_REPOSITORY,
      ),
    };
  };
  /** A crash, as far as presence can tell: no release, no more heartbeats. */
  const crash = async (instance: Instance) => {
    await instance.app.close();
    open.splice(open.indexOf(instance.app), 1);
    await leases().updateOne(
      { _id: instance.id as never },
      { $set: { lastSeenAt: new Date(Date.now() - 60_000) } },
    );
  };
  const leases = () => database.collection('backend_instance_leases');
  const rows = () => database.collection('live_session_presence');
  const entriesOf = async (sessionId: string, participantId: string) =>
    ((await rows().findOne({ sessionId, participantId }))?.connections ??
      []) as string[];
  const rnd = () => Math.random().toString(16).slice(2);

  const seed = async (
    sessions: LiveGameSessionRepository,
    options: { bomb?: boolean } = {},
  ) => {
    const session = LiveGameSession.create({
      controllerActorId: `host-${rnd()}`,
      controllerDisplayName: 'Host',
      teamNames: ['One', 'Two'],
      reconnectTokenHash: 'hash',
      rules: options.bomb ? BOMB_TIMED_TURNS_MODE : CORE_TIMED_TURNS_MODE,
      now: NOW,
    });
    const teams = session.serialize().teams;
    const players = teams.map((team) =>
      session.enrollParticipant({
        displayName: `Player ${rnd()}`,
        teamId: team.id,
        role: 'team-player',
        joinRequestId: `join-${rnd()}`,
        now: NOW,
      }),
    );
    if (options.bomb) {
      for (const player of players) {
        session.setParticipantReady(player.id, true, NOW);
      }
      session.beginCountdown(NOW, 60_000);
    }
    await sessions.create(session);
    return { sessionId: session.id, players: players.map((p) => p.id) };
  };

  /** Records a socket the way the gateway does: registry first, then presence. */
  const attach = async (
    instance: Instance,
    sessionId: string,
    participantId: string,
    socketId: string,
    requestRecovery: () => void = () => undefined,
  ) => {
    instance.registry.register({
      sessionId,
      participantId,
      socketId,
      requestRecovery,
    });
    const ok = await instance.presence.connected(
      sessionId,
      participantId,
      socketId,
    );
    if (!ok) instance.registry.unregister(socketId, sessionId);
    return ok;
  };
  const detach = async (
    instance: Instance,
    sessionId: string,
    participantId: string,
    socketId: string,
  ) => {
    instance.registry.unregister(socketId, sessionId);
    await instance.presence.disconnected(sessionId, participantId, socketId);
  };
  const statusOf = async (sessions: LiveGameSessionRepository, id: string) =>
    (await sessions.findById(id))!.serialize().status;

  beforeAll(async () => {
    database = await connectTestDatabase(SUITE);
    await resetTestDatabase(database);
  }, 120_000);

  beforeEach(async () => {
    // Apps closed by an earlier test leave stale-owned entries behind (exactly
    // like a crash); start each scenario from an empty presence table.
    await rows().deleteMany({});
    await leases().deleteMany({});
  });

  afterEach(async () => {
    while (open.length) await open.pop()!.close();
  });

  afterAll(async () => {
    await resetTestDatabase(database);
    await database?.close();
  });

  it('deploy overlap: a new instance wipes nothing and neither sweeps the other', async () => {
    const a = await boot();
    const { sessionId, players } = await seed(a.sessions);
    await attach(a, sessionId, players[0], 'sock-a1');

    const b = await boot();
    expect(b.id).not.toBe(a.id);
    expect(await entriesOf(sessionId, players[0])).toEqual([`${a.id}:sock-a1`]);
    await attach(b, sessionId, players[1], 'sock-b1');

    for (let i = 0; i < 4; i += 1) {
      await a.ownership.tick();
      await b.ownership.tick();
    }
    expect(await entriesOf(sessionId, players[0])).toEqual([`${a.id}:sock-a1`]);
    expect(await entriesOf(sessionId, players[1])).toEqual([`${b.id}:sock-b1`]);
    expect(a.ownership.lastTick?.stepFailures).toEqual([]);
    expect(b.ownership.lastTick?.stepFailures).toEqual([]);
  }, 120_000);

  it("crash: the survivor sweeps exactly the dead owner's entries and recovers effects after a partial failure", async () => {
    const a = await boot();
    const b = await boot();
    const { sessionId, players } = await seed(b.sessions, { bomb: true });
    await attach(a, sessionId, players[0], 'sock-a1');
    await attach(b, sessionId, players[1], 'sock-b1');
    expect(await statusOf(b.sessions, sessionId)).toBe('ready');

    await crash(a);
    // The reconciliation after the sweep fails once (a lost revision race or a
    // database error) — the crash-between-pull-and-effects shape.
    const save = jest
      .spyOn(b.sessions, 'save')
      .mockRejectedValueOnce(new Error('transient'));

    const first = await b.ownership.tick();
    expect(first.removed).toBe(0); // one stale observation is not proof
    const second = await b.ownership.tick();
    expect(second.deadOwners).toEqual([a.id]);
    expect(second.removed).toBe(1);
    expect(await entriesOf(sessionId, players[0])).toEqual([]);
    expect(await entriesOf(sessionId, players[1])).toEqual([`${b.id}:sock-b1`]);
    expect(await statusOf(b.sessions, sessionId)).toBe('ready'); // effect failed

    // Retry uses the production backoff. Advance the injectable ownership
    // clock deterministically instead of depending on how fast this host runs.
    const retryAt = b.ownership.now() + b.ownership.options.retryBaseMs;
    b.ownership.now = () => retryAt;
    await b.ownership.tick(); // backoff elapsed: retried from persisted state
    expect(await statusOf(b.sessions, sessionId)).toBe('waiting');
    save.mockRestore();
  }, 120_000);

  it('backstop: a countdown whose cancellation was lost with its process is still cancelled', async () => {
    const b = await boot();
    const { sessionId } = await seed(b.sessions, { bomb: true });
    // Nobody is connected and nothing is dirty in memory: the effect was owed
    // by a process that no longer exists.
    for (let i = 0; i < 3; i += 1) await b.ownership.tick();
    expect(await statusOf(b.sessions, sessionId)).toBe('waiting');
  }, 120_000);

  it('two-device limit: preserved across instances; only provably dead slots are reclaimed', async () => {
    const a = await boot();
    const b = await boot();
    const { sessionId, players } = await seed(a.sessions);
    const p = players[0];
    expect(await attach(a, sessionId, p, 'phone')).toBe(true);
    expect(await attach(b, sessionId, p, 'tablet')).toBe(true);
    // Two live owners: a third device is refused, wherever it connects.
    expect(await attach(b, sessionId, p, 'laptop')).toBe(false);
    expect(await attach(a, sessionId, p, 'laptop')).toBe(false);
    expect(await entriesOf(sessionId, p)).toHaveLength(2);

    // A late (not yet dead) lease is not enough to displace a device.
    await leases().updateOne(
      { _id: a.id as never },
      { $set: { lastSeenAt: new Date(Date.now() - 20_000) } },
    );
    expect(await attach(b, sessionId, p, 'laptop')).toBe(false);

    // Once its owner is provably dead, the slot is freed on demand.
    await crash(a);
    expect(await attach(b, sessionId, p, 'laptop')).toBe(true);
    expect((await entriesOf(sessionId, p)).sort()).toEqual(
      [`${b.id}:laptop`, `${b.id}:tablet`].sort(),
    );
  }, 120_000);

  it('rollback and roll-forward: legacy reset, recovery, limit, ghost purge once, redeploy never re-purges', async () => {
    const commit = `commit-${rnd()}`;
    const nonce = `nonce-${rnd()}`;
    const b = await boot();
    const { sessionId, players } = await seed(b.sessions);
    const [solo, duo] = players;
    const recoveries: string[] = [];
    const ask = (id: string) => () => recoveries.push(id);
    await attach(b, sessionId, solo, 'solo-1', ask('solo-1'));
    await attach(b, sessionId, duo, 'duo-1', ask('duo-1'));
    await attach(b, sessionId, duo, 'duo-2', ask('duo-2'));

    // ROLLBACK: the legacy release boots and runs its global reset...
    await rows().updateMany({}, { $set: { connections: [] } });
    // ...and one of duo's devices moves to it, writing a bare socket id.
    await detach(b, sessionId, duo, 'duo-2');
    await rows().updateOne(
      { sessionId, participantId: duo },
      { $addToSet: { connections: 'legacy-sock' } },
    );

    // The new instance notices its live sockets lost their entries and asks
    // each to reconnect (after the grace period), once.
    const realNow = b.ownership.now;
    b.ownership.now = () => realNow() + 11_000;
    await b.ownership.tick();
    await b.ownership.tick();
    expect(recoveries.sort()).toEqual(['duo-1', 'solo-1']);
    // Each recovers with a new connection.
    await detach(b, sessionId, solo, 'solo-1');
    await detach(b, sessionId, duo, 'duo-1');
    expect(await attach(b, sessionId, solo, 'solo-2')).toBe(true);
    expect(await attach(b, sessionId, duo, 'duo-3')).toBe(true);
    // Never more than two devices, legacy entries included.
    expect((await entriesOf(sessionId, duo)).sort()).toEqual(
      [`${b.id}:duo-3`, 'legacy-sock'].sort(),
    );
    expect(await attach(b, sessionId, duo, 'duo-4')).toBe(false);
    // Legacy entries are never swept as dead owners.
    for (let i = 0; i < 3; i += 1) await b.ownership.tick();
    expect(await entriesOf(sessionId, duo)).toContain('legacy-sock');

    // ROLL FORWARD: the legacy instance is gone (its entry is now a ghost) and
    // the operator arms the one-time purge for this exact commit.
    const c = await boot({
      RENDER_GIT_COMMIT: commit,
      PRESENCE_LEGACY_PURGE: `${commit}:${nonce}`,
    });
    c.ownership.options.legacyPurgeMinUptimeMs = 0;
    c.ownership.options.legacyFreezeMs = 0;
    await c.ownership.tick(); // baseline
    await c.ownership.tick(); // unchanged → claim and purge
    expect(await entriesOf(sessionId, duo)).toEqual([`${b.id}:duo-3`]);
    expect(await entriesOf(sessionId, solo)).toEqual([`${b.id}:solo-2`]);
    expect(
      await leases().findOne({ _id: `legacy-purge:${nonce}` as never }),
    ).toMatchObject({ kind: 'legacy-purge', commit, consumedBy: c.id });
    // The device that was on the legacy instance reconnects to the new one.
    expect(await attach(c, sessionId, duo, 'duo-back')).toBe(true);

    // A second rollback and a redeploy of the same commit with the same
    // setting: the consumed nonce means it never purges again.
    await rows().updateOne(
      { sessionId, participantId: solo },
      { $addToSet: { connections: 'legacy-again' } },
    );
    const d = await boot({
      RENDER_GIT_COMMIT: commit,
      PRESENCE_LEGACY_PURGE: `${commit}:${nonce}`,
    });
    d.ownership.options.legacyPurgeMinUptimeMs = 0;
    d.ownership.options.legacyFreezeMs = 0;
    for (let i = 0; i < 3; i += 1) await d.ownership.tick();
    expect(await entriesOf(sessionId, solo)).toContain('legacy-again');
  }, 180_000);

  it('legacy purge never strips a live legacy instance whose players are stable but heartbeating (failed or slow deploy)', async () => {
    // The hazard: the purge is armed for a deploy that never takes traffic
    // (health check failing) or is slow to, while the legacy release keeps
    // serving. Mid-game, its players neither join nor leave, so the legacy
    // entry set is unchanged for minutes — but each player's heartbeat still
    // advances its row's `lastSeenAt`, which is the legacy release's only
    // other write. That must count as legacy activity.
    const commit = `commit-${rnd()}`;
    const c = await boot({
      RENDER_GIT_COMMIT: commit,
      PRESENCE_LEGACY_PURGE: `${commit}:nonce-${rnd()}`,
    });
    const { sessionId, players } = await seed(c.sessions);
    await rows().insertMany(
      players.map((participantId, i) => ({
        sessionId,
        participantId,
        connections: [`legacy-live-${i}`],
        lastSeenAt: new Date(),
      })),
    );
    c.ownership.options.legacyPurgeMinUptimeMs = 0;
    const realNow = c.ownership.now;
    let offset = 0;
    c.ownership.now = () => realNow() + offset;
    const legacyHeartbeat = () =>
      rows().updateMany(
        { sessionId },
        { $set: { lastSeenAt: new Date(Date.now() + offset) } },
      );

    await c.ownership.tick(); // baseline
    for (let i = 0; i < 4; i += 1) {
      offset += 60_000; // the legacy heartbeat cadence
      await legacyHeartbeat();
      await c.ownership.tick();
    }
    // Four minutes with an unchanged entry set, beyond the 180s freeze window.
    for (const participantId of players) {
      expect(await entriesOf(sessionId, participantId)).toHaveLength(1);
    }

    // The legacy instance is retired: heartbeats stop, and only then does the
    // freeze window run out.
    offset += 60_000;
    await c.ownership.tick(); // last observed heartbeat → new baseline
    offset += 181_000;
    await c.ownership.tick();
    for (const participantId of players) {
      expect(await entriesOf(sessionId, participantId)).toEqual([]);
    }
  }, 120_000);

  it('real Socket.IO client: foreign removal → recovery event → new connection restores presence and snapshot', async () => {
    const b = await boot();
    const { sessionId, players } = await seed(b.sessions);
    const participantId = players[0];
    const session = (await b.sessions.findById(sessionId))!.serialize();
    const credentialVersion = session.participants.find(
      (candidate) => candidate.id === participantId,
    )!.credentialVersion;
    const { credential } = await b.app.get(ParticipantCredentialService).issue({
      sessionId,
      participantId,
      role: 'team-player',
      credentialVersion,
    });
    const url = `${await b.app.getUrl()}/live-game-sessions`.replace(
      '[::1]',
      '127.0.0.1',
    );
    const sockets: ClientSocket[] = [];
    const connect = async () => {
      const socket = connectClient(url, {
        auth: { token: credential },
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      });
      return socket;
    };
    const subscribe = (socket: ClientSocket) =>
      new Promise<{ snapshot: unknown; ack: unknown }>((resolve) => {
        let snapshot: unknown;
        socket.once('live-session:snapshot', (s: unknown) => (snapshot = s));
        socket.emit(
          'live-session:participant-subscribe',
          { sessionId },
          (ack: unknown) => resolve({ snapshot, ack }),
        );
      });

    try {
      const first = await connect();
      const firstId = first.id!;
      const subscribed = await subscribe(first);
      expect(subscribed.snapshot).toBeTruthy();
      expect(await entriesOf(sessionId, participantId)).toEqual([
        `${b.id}:${firstId}`,
      ]);

      // Foreign removal: e.g. a rollback reset, or a false expiry elsewhere.
      const recovery = new Promise<{ sessionId: string }>((resolve) =>
        first.once('live-session:presence-recovery', resolve),
      );
      await rows().updateMany({}, { $set: { connections: [] } });
      const realNow = b.ownership.now;
      b.ownership.now = () => realNow() + 11_000;
      const stats = await b.ownership.tick();
      expect(stats.recoveriesRequested).toBe(1);
      expect(await recovery).toEqual({ sessionId });

      // The client's recovery: a new connection that re-subscribes.
      first.disconnect();
      const second = await connect();
      expect(second.id).not.toBe(firstId);
      const resubscribed = await subscribe(second);
      expect(resubscribed.snapshot).toMatchObject({ sessionId });
      expect(await entriesOf(sessionId, participantId)).toEqual([
        `${b.id}:${second.id}`,
      ]);
      const participant = (await b.sessions.findById(sessionId))!
        .serialize()
        .participants.find((candidate) => candidate.id === participantId)!;
      expect(participant.connected).toBe(true);
      expect(participant.connectedDeviceCount).toBe(1);

      // Fallback for a client that ignores the event: the transport is closed,
      // which removes it from presence while remaining auto-recoverable for an
      // old client whose manager has normal reconnection enabled.
      const reason = new Promise<string>((resolve) =>
        second.once('disconnect', resolve),
      );
      await rows().updateMany({}, { $set: { connections: [] } });
      b.ownership.now = () => realNow() + 30_000;
      await b.ownership.tick();
      expect(await reason).toBe('transport close');
    } finally {
      for (const socket of sockets) socket.disconnect();
    }
  }, 120_000);

  it('workload: the 5-second tick, measured', async () => {
    const b = await boot();
    const owners = Array.from({ length: 4 }, (_, i) => `peer-${i}-${rnd()}`);
    await leases().insertMany(
      owners.map((owner) => ({
        _id: owner as never,
        kind: 'instance',
        protocol: 2,
        lastSeenAt: new Date(),
      })),
    );
    const SESSIONS = 500;
    const PER_SESSION = 8;
    const docs = [];
    for (let s = 0; s < SESSIONS; s += 1) {
      for (let p = 0; p < PER_SESSION; p += 1) {
        docs.push({
          sessionId: `load-${s}`,
          participantId: `p-${p}`,
          connections: [`${owners[(s + p) % owners.length]}:sock-${s}-${p}`],
        });
      }
    }
    await rows().insertMany(docs);
    const refresh = () =>
      leases().updateMany(
        { _id: { $in: owners as never[] } },
        { $currentDate: { lastSeenAt: true } },
      );

    const steady: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      await refresh();
      const started = Date.now();
      const stats = await b.ownership.tick();
      steady.push(Date.now() - started);
      expect(stats.entriesScanned).toBeGreaterThanOrEqual(
        SESSIONS * PER_SESSION,
      );
      expect(stats.removed).toBe(0);
    }

    // One of four peers dies: a quarter of all entries swept in one tick, and
    // every touched session reconciled.
    await leases().updateOne(
      { _id: owners[0] as never },
      { $set: { lastSeenAt: new Date(Date.now() - 60_000) } },
    );
    const refreshOthers = () =>
      leases().updateMany(
        { _id: { $in: owners.slice(1) as never[] } },
        { $currentDate: { lastSeenAt: true } },
      );
    await refreshOthers();
    await b.ownership.tick();
    await refreshOthers();
    const sweepStarted = Date.now();
    const sweep = await b.ownership.tick();
    const sweepMs = Date.now() - sweepStarted;
    expect(sweep.removed).toBe((SESSIONS * PER_SESSION) / owners.length);
    expect(sweep.sessionsReconciled).toBeLessThanOrEqual(
      b.ownership.options.reconcileBudget,
    );
    // The backlog drains over the following ticks.
    const drain: number[] = [];
    let backlog = sweep.reconcileBacklog;
    while (backlog > 0 && drain.length < 10) {
      await refreshOthers();
      const started = Date.now();
      const next = await b.ownership.tick();
      drain.push(Date.now() - started);
      backlog = next.reconcileBacklog;
    }
    expect(backlog).toBe(0);

    const sorted = [...steady].sort((x, y) => x - y);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        workload: {
          entries: SESSIONS * PER_SESSION,
          sessions: SESSIONS,
          owners: owners.length + 1,
          steadyTickMs: { min: sorted[0], median: sorted[3], max: sorted[5] },
          sweep: {
            ms: sweepMs,
            removed: sweep.removed,
            sessionsReconciled: sweep.sessionsReconciled,
            backlogAfter: sweep.reconcileBacklog,
          },
          drainTicksMs: drain,
        },
      }),
    );
    // A tick must comfortably fit its own 5-second interval.
    expect(sorted[5]).toBeLessThan(2_500);
    expect(Math.max(sweepMs, ...drain)).toBeLessThan(5_000);
  }, 180_000);
});
