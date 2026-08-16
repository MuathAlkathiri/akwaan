import { Match } from '../domain/match';

export const MATCH_REPOSITORY = Symbol('MATCH_REPOSITORY');

/**
 * A Match that is still holding a challenge open, and the runtime it bound.
 *
 * This *is* the convergence obligation. A Match records `currentChallenge` when
 * it launches, and clears it in the same write that imports the result — so a
 * Match still naming a runtime is, durably and by construction, a Match that
 * has not yet taken that runtime's outcome. Nothing else needs to be written to
 * know work is outstanding.
 */
export interface PendingMatchConvergence {
  matchId: string;
  sessionId: string;
  runtimeId: string;
}

export interface MatchRepository {
  create(match: Match): Promise<void>;
  findById(matchId: string): Promise<Match | null>;
  /** The draft or active Match wrapping a live session, if any. */
  findActiveBySessionId(sessionId: string): Promise<Match | null>;
  /**
   * The session's most recent Match whatever its status, so a finished Match can
   * still be projected onto snapshots for the result screen.
   */
  findLatestBySessionId(sessionId: string): Promise<Match | null>;
  /**
   * Every Match currently holding a challenge open.
   *
   * Deliberately not filtered by runtime terminality: that judgement belongs to
   * the mechanic's own launcher, which the reconciler consults. This only
   * answers "who could still owe a convergence", which is a small set — at most
   * one per active session.
   */
  findAwaitingConvergence(): Promise<PendingMatchConvergence[]>;

  /** Optimistic save; throws when the stored revision moved on. */
  save(match: Match, expectedRevision: number): Promise<void>;
}
