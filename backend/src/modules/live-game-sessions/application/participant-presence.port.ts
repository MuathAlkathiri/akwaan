export const PARTICIPANT_PRESENCE = Symbol('PARTICIPANT_PRESENCE');

export interface ParticipantPresence {
  connect(sessionId: string, actorId: string, now: Date): Promise<boolean>;
  disconnect(sessionId: string, actorId: string, now: Date): Promise<void>;
  touch(sessionId: string, participantId: string, now: Date): Promise<void>;
}
