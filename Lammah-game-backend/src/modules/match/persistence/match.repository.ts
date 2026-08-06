import { Match } from '../domain/match';

export const MATCH_REPOSITORY = Symbol('MATCH_REPOSITORY');

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
  /** Optimistic save; throws when the stored revision moved on. */
  save(match: Match, expectedRevision: number): Promise<void>;
}
