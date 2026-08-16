import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
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
import {
  PARTICIPANT_PRESENCE,
  ParticipantPresence,
} from '../../src/modules/live-game-sessions/application/participant-presence.port';
import {
  GAMEPLAY_TRANSACTION_UNIT_OF_WORK,
  GameplayTransactionUnitOfWork,
} from '../../src/modules/live-game-sessions/application/gameplay-transaction.unit-of-work';
import { LiveGameSession } from '../../src/modules/live-game-sessions/domain/live-game-session';
import { CORE_TIMED_TURNS_MODE } from '../../src/modules/live-game-sessions/domain/live-game-mode.registry';
import { GameplayAuthorization } from '../../src/modules/live-game-sessions/application/gameplay-authorization';
import { GameplayRuntimeState } from '../../src/modules/live-game-sessions/domain/gameplay-runtime';

/**
 * Presence against real Mongo, because the bug was a persistence race.
 *
 * The defect: `connected` lived inside the session's `state` blob, which every
 * aggregate save replaces wholesale under a revision guard, while socket events
 * wrote the same fields directly with no revision at all. A gameplay command
 * that loaded the session before a player reconnected would, on save, put its
 * stale copy of that player back — reporting them offline, which is what
 * authorization, readiness and actor selection all read.
 *
 * None of that is observable through a mocked repository: it is a property of
 * two update shapes meeting in one document. So these drive the real
 * repository, the real gameplay transaction and a real replica-set Mongo.
 */
describe('participant presence ownership integration', () => {
  let app: INestApplication;
  let database: Connection;
  let sessions: LiveGameSessionRepository;
  let presence: ParticipantPresence;
  let unitOfWork: GameplayTransactionUnitOfWork;

  const NOW = new Date('2026-08-15T00:00:00.000Z');

  beforeAll(async () => {
    database = await connectTestDatabase('participant-presence');
    await resetTestDatabase(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('participant-presence') },
    });
    sessions = app.get<LiveGameSessionRepository>(LIVE_GAME_SESSION_REPOSITORY);
    presence = app.get<ParticipantPresence>(PARTICIPANT_PRESENCE);
    unitOfWork = app.get<GameplayTransactionUnitOfWork>(
      GAMEPLAY_TRANSACTION_UNIT_OF_WORK,
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  /** A persisted session with one team player, and that player's id. */
  const seedSession = async () => {
    const session = LiveGameSession.create({
      controllerActorId: `host-${Math.random().toString(16).slice(2)}`,
      controllerDisplayName: 'Host',
      teamNames: ['One', 'Two'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now: NOW,
    });
    const teamId = session.serialize().teams[0].id;
    const player = session.enrollParticipant({
      displayName: `Player ${Math.random().toString(16).slice(2)}`,
      teamId,
      role: 'team-player',
      joinRequestId: `join-${Math.random().toString(16).slice(2)}`,
      now: NOW,
    });
    await sessions.create(session);
    return { sessionId: session.id, participantId: player.id, teamId };
  };

  const connectedOf = async (sessionId: string, participantId: string) => {
    const reloaded = await sessions.findById(sessionId);
    return reloaded!
      .serialize()
      .participants.find((candidate) => candidate.id === participantId)!;
  };

  it('A — a connect survives a save from an aggregate loaded before it', async () => {
    const { sessionId, participantId } = await seedSession();

    // The gameplay command loads the session while the player is still offline.
    const stale = (await sessions.findById(sessionId))!;
    expect(
      stale.serialize().participants.find((p) => p.id === participantId)!
        .connected,
    ).toBe(false);

    // The player connects while that command is mid-flight.
    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'socket-A',
      now: NOW,
    });

    // The command commits an unrelated change from its stale copy.
    const revision = stale.revision;
    stale.completeCommand('command-1', NOW);
    await sessions.save(stale, revision);

    // The reconnect must still stand. This is the exact regression.
    const participant = await connectedOf(sessionId, participantId);
    expect(participant.connected).toBe(true);
    expect(participant.connectedDeviceCount).toBe(1);
  });

  it('B — a disconnect survives a save from an aggregate loaded before it', async () => {
    const { sessionId, participantId } = await seedSession();
    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'socket-A',
      now: NOW,
    });

    // Loaded while the player is connected.
    const stale = (await sessions.findById(sessionId))!;
    expect(
      stale.serialize().participants.find((p) => p.id === participantId)!
        .connected,
    ).toBe(true);

    await presence.disconnect({
      sessionId,
      participantId,
      connectionId: 'socket-A',
      now: NOW,
    });

    const revision = stale.revision;
    stale.completeCommand('command-2', NOW);
    await sessions.save(stale, revision);

    // The stale copy must not resurrect a connection that closed.
    expect((await connectedOf(sessionId, participantId)).connected).toBe(false);
  });

  it('C — a heartbeat does not advance the session revision', async () => {
    // Presence deliberately shares no version with gameplay. If a 30-second
    // heartbeat moved the session revision, every in-flight command holding the
    // previous one would be rejected — churn invented by a liveness ping.
    const { sessionId, participantId } = await seedSession();
    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'socket-A',
      now: NOW,
    });
    const before = (await sessions.findById(sessionId))!.revision;

    await presence.touch(sessionId, participantId, new Date(NOW.getTime() + 1));
    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'socket-B',
      now: NOW,
    });
    await presence.disconnect({
      sessionId,
      participantId,
      connectionId: 'socket-B',
      now: NOW,
    });

    const after = (await sessions.findById(sessionId))!;
    expect(after.revision).toBe(before);
    // And a command built against the pre-heartbeat revision still commits.
    after.completeCommand('command-3', NOW);
    await expect(sessions.save(after, before)).resolves.toBeUndefined();
  });

  it('D — two sockets, and closing one leaves the participant online', async () => {
    const { sessionId, participantId } = await seedSession();
    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'tab-A',
      now: NOW,
    });
    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'tab-B',
      now: NOW,
    });
    expect(
      (await connectedOf(sessionId, participantId)).connectedDeviceCount,
    ).toBe(2);

    await presence.disconnect({
      sessionId,
      participantId,
      connectionId: 'tab-A',
      now: NOW,
    });

    const participant = await connectedOf(sessionId, participantId);
    expect(participant.connected).toBe(true);
    expect(participant.connectedDeviceCount).toBe(1);
  });

  it('D2 — a repeated subscribe on one socket is not a second device', async () => {
    // The old counter incremented per subscribe, so a client that resubscribed
    // on the same socket burned a device slot that no disconnect would ever
    // return, and eventually locked itself out.
    const { sessionId, participantId } = await seedSession();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await presence.connect({
        sessionId,
        participantId,
        connectionId: 'socket-A',
        now: NOW,
      });
    }
    expect(
      (await connectedOf(sessionId, participantId)).connectedDeviceCount,
    ).toBe(1);

    await presence.disconnect({
      sessionId,
      participantId,
      connectionId: 'socket-A',
      now: NOW,
    });
    expect((await connectedOf(sessionId, participantId)).connected).toBe(false);
  });

  it('E — a late disconnect from a dead socket cannot take down its replacement', async () => {
    const { sessionId, participantId } = await seedSession();
    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'socket-A',
      now: NOW,
    });
    // The network drops and the client reconnects before the server has
    // noticed the old socket died.
    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'socket-B',
      now: NOW,
    });
    // Only now does socket A's disconnect callback run.
    await presence.disconnect({
      sessionId,
      participantId,
      connectionId: 'socket-A',
      now: NOW,
    });

    const participant = await connectedOf(sessionId, participantId);
    expect(participant.connected).toBe(true);
    expect(participant.connectedDeviceCount).toBe(1);
  });

  it('E2 — a disconnect for an unknown connection changes nothing', async () => {
    const { sessionId, participantId } = await seedSession();
    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'socket-A',
      now: NOW,
    });
    await presence.disconnect({
      sessionId,
      participantId,
      connectionId: 'socket-that-never-existed',
      now: NOW,
    });
    expect((await connectedOf(sessionId, participantId)).connected).toBe(true);
  });

  it('F — a reconnect survives a gameplay transaction that was already open', async () => {
    // The same race through the other writer of this document: the gameplay
    // unit of work, which replaces the session inside a Mongo transaction.
    const { sessionId, participantId } = await seedSession();

    await unitOfWork.execute(async (context) => {
      const session = (await context.findSession(sessionId))!;
      expect(
        session.serialize().participants.find((p) => p.id === participantId)!
          .connected,
      ).toBe(false);

      // The player reconnects while the transaction is open.
      await presence.connect({
        sessionId,
        participantId,
        connectionId: 'socket-A',
        now: NOW,
      });

      const revision = session.revision;
      session.completeCommand('gameplay-1', NOW);
      await context.saveSession(session, revision);
      return true;
    });

    expect((await connectedOf(sessionId, participantId)).connected).toBe(true);
  });

  it('G — a disconnect survives a gameplay transaction that was already open', async () => {
    const { sessionId, participantId } = await seedSession();
    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'socket-A',
      now: NOW,
    });

    await unitOfWork.execute(async (context) => {
      const session = (await context.findSession(sessionId))!;
      expect(
        session.serialize().participants.find((p) => p.id === participantId)!
          .connected,
      ).toBe(true);

      await presence.disconnect({
        sessionId,
        participantId,
        connectionId: 'socket-A',
        now: NOW,
      });

      const revision = session.revision;
      session.completeCommand('gameplay-2', NOW);
      await context.saveSession(session, revision);
      return true;
    });

    expect((await connectedOf(sessionId, participantId)).connected).toBe(false);
  });

  it('H — command authorization follows the observed connection, deterministically', async () => {
    // `connected-player` is the authorization the audit found reading presence.
    // Its meaning is unchanged; what changed is that the answer no longer
    // depends on which aggregate happened to save last.
    const { sessionId, participantId, teamId } = await seedSession();
    const authorization = app.get(GameplayAuthorization);
    const actor = {
      kind: 'participant' as const,
      actorId: participantId,
      sessionId,
      participantId,
      role: 'team-player' as const,
      credentialVersion: 1,
    };
    const runtime = {
      activeRound: { activeTeamId: teamId, activeParticipantId: participantId },
    } as unknown as GameplayRuntimeState;

    const offline = (await sessions.findById(sessionId))!;
    expect(
      authorization.can(
        'connected-player',
        actor,
        offline.serialize(),
        runtime,
      ),
    ).toBe(false);

    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'socket-A',
      now: NOW,
    });
    const online = (await sessions.findById(sessionId))!;
    expect(
      authorization.can('connected-player', actor, online.serialize(), runtime),
    ).toBe(true);

    // And a stale aggregate save cannot silently revoke that permission.
    const revision = offline.revision;
    offline.completeCommand('command-auth', NOW);
    await sessions.save(offline, revision);
    const afterStaleSave = (await sessions.findById(sessionId))!;
    expect(
      authorization.can(
        'connected-player',
        actor,
        afterStaleSave.serialize(),
        runtime,
      ),
    ).toBe(true);
  });

  it('I — connections do not survive a restart, because sockets do not', async () => {
    const { sessionId, participantId } = await seedSession();
    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'socket-A',
      now: NOW,
    });
    expect((await connectedOf(sessionId, participantId)).connected).toBe(true);

    // What the boot hook does. Presence is an observation of this process's
    // sockets, and none of them survived.
    await presence.clearAll();

    const participant = await connectedOf(sessionId, participantId);
    expect(participant.connected).toBe(false);
    expect(participant.connectedDeviceCount).toBe(0);
  });

  it('the persisted session document carries no presence at all', async () => {
    // The structural half of the guarantee: a save cannot revert a field it
    // does not write. If presence ever reappears in this document, the race is
    // back whatever the other tests say.
    const { sessionId, participantId } = await seedSession();
    await presence.connect({
      sessionId,
      participantId,
      connectionId: 'socket-A',
      now: NOW,
    });
    const session = (await sessions.findById(sessionId))!;
    const revision = session.revision;
    session.completeCommand('command-shape', NOW);
    await sessions.save(session, revision);

    const raw = await database
      .collection('live_game_sessions')
      .findOne({ sessionId });
    const persisted = (
      raw!.state as { participants: Record<string, unknown>[] }
    ).participants;
    for (const participant of persisted) {
      expect(participant).not.toHaveProperty('connected');
      expect(participant).not.toHaveProperty('connectedDeviceCount');
      expect(participant).not.toHaveProperty('lastSeenAt');
    }
    // …while the durable half of the participant is untouched.
    expect(persisted[0]).toHaveProperty('role');
    expect(persisted[0]).toHaveProperty('credentialVersion');
  });
});
