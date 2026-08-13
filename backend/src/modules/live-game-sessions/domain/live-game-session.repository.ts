import { LiveGameSession } from './live-game-session';

export const LIVE_GAME_SESSION_REPOSITORY = Symbol(
  'LIVE_GAME_SESSION_REPOSITORY',
);

export interface LiveGameSessionRepository {
  create(session: LiveGameSession): Promise<void>;
  findById(sessionId: string): Promise<LiveGameSession | null>;
  findByParentQuestion(
    parentGameId: string,
    parentGameQuestionId: string,
  ): Promise<LiveGameSession | null>;
  save(session: LiveGameSession, expectedRevision: number): Promise<void>;
}
