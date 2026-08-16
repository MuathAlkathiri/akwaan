import { ParticipantPresenceProjection } from '../domain/participant-presence';

export const PARTICIPANT_PRESENCE = Symbol('PARTICIPANT_PRESENCE');

/**
 * The one writer of participant presence.
 *
 * Every operation names the *connection* it is about, not just the participant.
 * That is what makes the two hard cases correct without ordering guarantees:
 * a second tab opening cannot be confused with the first, and a disconnect
 * callback arriving late from a socket that already died cannot take down the
 * socket that replaced it. Both were unfixable while presence was a counter.
 *
 * Nothing here touches the live session document, and nothing that writes the
 * live session document touches presence. That separation is the batch.
 */
export interface ParticipantPresence {
  /**
   * Records an open connection. Returns false when the participant already
   * holds the maximum number of devices, in which case nothing is recorded.
   */
  connect(input: {
    sessionId: string;
    participantId: string;
    connectionId: string;
    now: Date;
  }): Promise<boolean>;

  /**
   * Records that one specific connection closed. Idempotent, and safe to call
   * for a connection that was never recorded or was already removed.
   */
  disconnect(input: {
    sessionId: string;
    participantId: string;
    connectionId: string;
    now: Date;
  }): Promise<void>;

  /** Liveness ping from an existing connection. Never changes connectedness. */
  touch(sessionId: string, participantId: string, now: Date): Promise<void>;

  /** Observed presence for a session, for merging onto a read aggregate. */
  read(sessionId: string): Promise<Map<string, ParticipantPresenceProjection>>;

  /**
   * Drops every recorded connection.
   *
   * Called once at boot: connections live in a process, so none of them
   * survived the restart that just happened and all of them would otherwise be
   * reported as open for ever.
   */
  clearAll(): Promise<void>;
}
