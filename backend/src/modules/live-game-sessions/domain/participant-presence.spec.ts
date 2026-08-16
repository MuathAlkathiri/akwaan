import { CORE_TIMED_TURNS_MODE } from './live-game-mode.registry';
import { LiveGameSession } from './live-game-session';
import {
  MAX_PARTICIPANT_CONNECTIONS,
  presenceProjection,
} from './participant-presence';
import { toPersistedState } from '../infrastructure/live-session-state.persistence';

/**
 * The domain half of presence ownership, without a database.
 *
 * `participant-presence.integration-spec.ts` proves the persistence race is
 * gone against real Mongo; these pin the two rules that make that possible and
 * run in the ordinary suite, so a regression is caught without Docker.
 */

const NOW = new Date('2026-08-15T00:00:00.000Z');

function sessionWithPlayer() {
  const session = LiveGameSession.create({
    controllerActorId: 'host',
    controllerDisplayName: 'Host',
    teamNames: ['One', 'Two'],
    reconnectTokenHash: 'hash',
    rules: CORE_TIMED_TURNS_MODE,
    now: NOW,
  });
  const player = session.enrollParticipant({
    displayName: 'Player',
    teamId: session.serialize().teams[0].id,
    role: 'team-player',
    joinRequestId: 'join-1',
    now: NOW,
  });
  return { session, playerId: player.id };
}

describe('presence projection', () => {
  it('is connected while any connection is open', () => {
    expect(
      presenceProjection({ participantId: 'p', connections: ['a'] }).connected,
    ).toBe(true);
    expect(
      presenceProjection({ participantId: 'p', connections: ['a', 'b'] })
        .connectedDeviceCount,
    ).toBe(2);
  });

  it('is disconnected with no connections, and for a participant never seen', () => {
    expect(
      presenceProjection({ participantId: 'p', connections: [] }).connected,
    ).toBe(false);
    expect(presenceProjection(undefined).connected).toBe(false);
    expect(presenceProjection(undefined).connectedDeviceCount).toBe(0);
  });

  it('caps devices at the documented product limit', () => {
    // The limit is a product rule, not an accident of the old counter. Pinned
    // so a change to it is a deliberate edit rather than a silent drift.
    expect(MAX_PARTICIPANT_CONNECTIONS).toBe(2);
  });
});

describe('applyPresence', () => {
  it('merges observed presence onto participants', () => {
    const { session, playerId } = sessionWithPlayer();
    session.applyPresence(
      new Map([
        [
          playerId,
          { connected: true, connectedDeviceCount: 2, lastSeenAt: NOW },
        ],
      ]),
    );
    const participant = session
      .serialize()
      .participants.find((candidate) => candidate.id === playerId)!;
    expect(participant.connected).toBe(true);
    expect(participant.connectedDeviceCount).toBe(2);
  });

  it('reports a participant with no presence row as offline', () => {
    const { session, playerId } = sessionWithPlayer();
    session.applyPresence(new Map());
    expect(
      session.serialize().participants.find((p) => p.id === playerId)!
        .connected,
    ).toBe(false);
  });

  it('never reports a removed participant as connected', () => {
    // Removal used to zero the presence fields directly. It no longer can, so
    // the projection enforces it — otherwise a kicked player would keep
    // counting toward readiness until their socket happened to close.
    const { session, playerId } = sessionWithPlayer();
    session.removeParticipant(playerId, NOW);
    session.applyPresence(
      new Map([
        [
          playerId,
          { connected: true, connectedDeviceCount: 1, lastSeenAt: NOW },
        ],
      ]),
    );
    expect(
      session.serialize().participants.find((p) => p.id === playerId)!
        .connected,
    ).toBe(false);
  });

  it('survives serialization, so readers downstream of a command still see it', () => {
    const { session, playerId } = sessionWithPlayer();
    session.applyPresence(
      new Map([
        [
          playerId,
          { connected: true, connectedDeviceCount: 1, lastSeenAt: NOW },
        ],
      ]),
    );
    // `serialize()` deep-clones through `restore()`; presence must not be reset
    // on the way, or every reader after a mutation would see everyone offline.
    const twice = LiveGameSession.restore(
      session.serialize(),
      CORE_TIMED_TURNS_MODE,
    ).serialize();
    expect(twice.participants.find((p) => p.id === playerId)!.connected).toBe(
      true,
    );
  });
});

describe('persisted session state', () => {
  it('carries no presence fields', () => {
    // The structural guarantee: a save cannot revert what it does not write.
    const { session, playerId } = sessionWithPlayer();
    session.applyPresence(
      new Map([
        [
          playerId,
          { connected: true, connectedDeviceCount: 1, lastSeenAt: NOW },
        ],
      ]),
    );
    for (const participant of toPersistedState(session.serialize())
      .participants) {
      expect(participant).not.toHaveProperty('connected');
      expect(participant).not.toHaveProperty('connectedDeviceCount');
      expect(participant).not.toHaveProperty('lastSeenAt');
    }
  });

  it('keeps every durable participant field', () => {
    // The other direction: stripping presence must not take identity with it.
    const { session, playerId } = sessionWithPlayer();
    const persisted = toPersistedState(session.serialize()).participants.find(
      (candidate) => candidate.id === playerId,
    )!;
    expect(persisted.role).toBe('team-player');
    expect(persisted.teamId).toBeDefined();
    expect(persisted.credentialVersion).toBe(1);
    expect(persisted.ready).toBe(false);
    expect(persisted.joinedAt).toEqual(NOW);
    expect(persisted.normalizedDisplayName).toBe('player');
  });

  it('restores a document that never stored presence', () => {
    // Sessions written before this change, and every session written after it,
    // come back with no presence at all. Restoring must default rather than
    // produce an Invalid Date.
    const { session, playerId } = sessionWithPlayer();
    const persisted = toPersistedState(session.serialize());
    const restored = LiveGameSession.restore(persisted, CORE_TIMED_TURNS_MODE)
      .serialize()
      .participants.find((candidate) => candidate.id === playerId)!;
    expect(restored.connected).toBe(false);
    expect(restored.connectedDeviceCount).toBe(0);
    expect(Number.isNaN(restored.lastSeenAt.getTime())).toBe(false);
  });
});

describe('reconnect token rotation', () => {
  it('rotates the token without asserting a connection', () => {
    // Holding a valid reconnect token says a participant may come back, not
    // that a socket is open. Presence follows sockets; this follows identity.
    const session = LiveGameSession.create({
      controllerActorId: 'host',
      controllerDisplayName: 'Host',
      teamNames: ['One', 'Two'],
      reconnectTokenHash: 'old',
      rules: CORE_TIMED_TURNS_MODE,
      now: NOW,
    });
    session.reconnectParticipant('host', 'new', NOW);
    const controller = session
      .serialize()
      .participants.find((p) => p.role === 'controller')!;
    expect(controller.reconnectTokenHash).toBe('new');
    expect(controller.connected).toBe(false);
  });
});
