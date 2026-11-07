import { ParticipantPresenceProjection } from '../domain/participant-presence';

export const PARTICIPANT_PRESENCE = Symbol('PARTICIPANT_PRESENCE');

/** One stored presence entry and the participant row it belongs to. */
export interface StoredPresenceEntry {
  sessionId: string;
  participantId: string;
  /** Exactly as stored: `<owner>:<socketId>`, or a bare legacy socket id. */
  entry: string;
  /**
   * The row's last liveness write, when listed. Heartbeats are the only write
   * a legacy release makes while its players stay connected, so this is what
   * reveals that a legacy instance is still alive.
   */
  rowLastSeenAt?: Date;
}

/**
 * The one writer of participant presence.
 *
 * Every operation names the *connection* it is about, not just the participant.
 * That is what makes the two hard cases correct without ordering guarantees:
 * a second tab opening cannot be confused with the first, and a disconnect
 * callback arriving late from a socket that already died cannot take down the
 * socket that replaced it. Both were unfixable while presence was a counter.
 *
 * Connections are owner-scoped: this instance records and removes only its
 * own entries (`<instanceId>:<socketId>`). Another instance's entry is removed
 * only by its exact stored value, and only once that owner is proven dead.
 * There is no global reset.
 *
 * Nothing here touches the live session document, and nothing that writes the
 * live session document touches presence. That separation is the batch.
 */
export interface ParticipantPresence {
  /**
   * Records an open connection owned by this instance. Returns false when the
   * participant already holds the maximum number of devices, in which case
   * nothing is recorded.
   */
  connect(input: {
    sessionId: string;
    participantId: string;
    connectionId: string;
    now: Date;
  }): Promise<boolean>;

  /**
   * Records that one of this instance's connections closed. Idempotent, and
   * safe for a connection that was never recorded or was already removed.
   * Returns true only when this call removed the entry.
   */
  disconnect(input: {
    sessionId: string;
    participantId: string;
    connectionId: string;
    now: Date;
  }): Promise<boolean>;

  /** Liveness ping from an existing connection. Never changes connectedness. */
  touch(sessionId: string, participantId: string, now: Date): Promise<void>;

  /** Observed presence for a session, for merging onto a read aggregate. */
  read(sessionId: string): Promise<Map<string, ParticipantPresenceProjection>>;

  /** The raw socket ids currently recorded for a session, any owner. */
  connectionIds(sessionId: string): Promise<Set<string>>;

  /**
   * Removes exactly one stored entry, by its stored value. Returns true only
   * when this call removed it, so concurrent removers cannot both succeed.
   */
  removeExact(input: StoredPresenceEntry): Promise<boolean>;

  /** Every stored entry, for the dead-owner sweep. */
  listEntries(): Promise<StoredPresenceEntry[]>;

  /** The stored entries of one participant row, exactly as stored. */
  entriesFor(sessionId: string, participantId: string): Promise<string[]>;
}
