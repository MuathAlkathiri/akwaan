/**
 * What the server currently observes about a participant's connections.
 *
 * Deliberately *not* part of `LiveGameSessionState`. A live session document is
 * persisted by replacing its whole `state` blob under a revision guard, so any
 * field living inside it is owned by whoever last loaded the aggregate. Presence
 * is written by socket events that have no aggregate and no revision — they are
 * observations of a transport, not decisions about a game — and the two writers
 * sharing that blob is exactly how a reconnect could be silently undone by an
 * unrelated gameplay save.
 *
 * So presence is stored on its own, keyed by participant, and merged onto the
 * aggregate when it is read. Readers keep asking the participant whether it is
 * connected; nothing writes that answer through the aggregate any more.
 */
export interface ParticipantPresenceState {
  participantId: string;
  /**
   * The live connections the server has seen open and not yet seen close, by
   * transport connection id (socket.io's `client.id`).
   *
   * A set of identities rather than a counter, and that is the whole point. A
   * counter cannot tell "the disconnect for the socket that already died"
   * apart from "the disconnect for the socket that is currently carrying this
   * player", so a late callback from a dead connection decremented a live one.
   * Removing a specific id can only ever remove that id.
   */
  connections: string[];
  /** Last time this participant was observed alive, by any connection. */
  lastSeenAt?: Date;
}

/** The presence projection merged onto a participant when a session is read. */
export interface ParticipantPresenceProjection {
  connected: boolean;
  connectedDeviceCount: number;
  lastSeenAt?: Date;
}

/**
 * How many simultaneous devices one participant may hold.
 *
 * Unchanged product rule: a player may pair a phone and one more device. It is
 * enforced against connection *identities* now, so an entry can only exist
 * while a real socket does — a dead connection is removed when its disconnect
 * arrives rather than leaving a counter permanently inflated.
 */
export const MAX_PARTICIPANT_CONNECTIONS = 2;

export function presenceProjection(
  state: ParticipantPresenceState | undefined,
): ParticipantPresenceProjection {
  return {
    connected: (state?.connections.length ?? 0) > 0,
    connectedDeviceCount: state?.connections.length ?? 0,
    ...(state?.lastSeenAt ? { lastSeenAt: state.lastSeenAt } : {}),
  };
}
