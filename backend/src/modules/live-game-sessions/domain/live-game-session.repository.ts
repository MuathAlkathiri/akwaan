import { LiveGameSession } from './live-game-session';

export const LIVE_GAME_SESSION_REPOSITORY = Symbol(
  'LIVE_GAME_SESSION_REPOSITORY',
);

export type OwnedSessionStatus =
  | 'waiting'
  | 'ready'
  | 'active'
  | 'paused'
  | 'finished'
  | 'cancelled'
  | 'expired';

/**
 * The minimum a caller needs to reason about ownership and resumability without
 * rehydrating a whole session aggregate. It carries only the owner-scoped
 * lifecycle facts — status and expiry — that decide whether a bound Match can be
 * resumed, and never any participant-private state.
 */
export interface OwnedSessionRef {
  sessionId: string;
  status: OwnedSessionStatus;
  expiresAt: Date;
}

export interface LiveGameSessionRepository {
  create(session: LiveGameSession): Promise<void>;
  findById(sessionId: string): Promise<LiveGameSession | null>;
  findByParentQuestion(
    parentGameId: string,
    parentGameQuestionId: string,
  ): Promise<LiveGameSession | null>;
  /**
   * Every session this account controls, as lightweight refs. This is the one
   * owner-authoritative query behind "My Games": ownership is the persisted
   * `controllerActorId`, never a client-supplied filter.
   */
  findOwnedSessionRefs(controllerActorId: string): Promise<OwnedSessionRef[]>;
  save(session: LiveGameSession, expectedRevision: number): Promise<void>;
}
