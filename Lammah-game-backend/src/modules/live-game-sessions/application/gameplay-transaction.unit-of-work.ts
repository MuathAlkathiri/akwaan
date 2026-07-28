import { GameplayRuntime } from '../domain/gameplay-runtime';
import { LiveGameSession } from '../domain/live-game-session';

export const GAMEPLAY_TRANSACTION_UNIT_OF_WORK = Symbol(
  'GAMEPLAY_TRANSACTION_UNIT_OF_WORK',
);

export interface GameplayTransactionContext {
  findSession(sessionId: string): Promise<LiveGameSession | null>;
  findRuntime(sessionId: string): Promise<GameplayRuntime | null>;
  saveSession(
    session: LiveGameSession,
    expectedRevision: number,
  ): Promise<void>;
  saveRuntime(
    runtime: GameplayRuntime,
    expectedRevision: number,
  ): Promise<void>;
}

export interface GameplayTransactionUnitOfWork {
  execute<T>(
    work: (context: GameplayTransactionContext) => Promise<T>,
  ): Promise<T>;
}
