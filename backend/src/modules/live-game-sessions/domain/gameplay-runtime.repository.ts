import { GameplayRuntime } from './gameplay-runtime';

export const GAMEPLAY_RUNTIME_REPOSITORY = Symbol(
  'GAMEPLAY_RUNTIME_REPOSITORY',
);

export interface GameplayRuntimeRepository {
  create(runtime: GameplayRuntime): Promise<void>;
  findById(runtimeId: string): Promise<GameplayRuntime | null>;
  findBySessionId(sessionId: string): Promise<GameplayRuntime | null>;
  save(runtime: GameplayRuntime, expectedRevision: number): Promise<void>;
  /**
   * Sessions whose newest runtime has not reached a terminal status.
   *
   * Deadline timers are process memory. After a restart the sessions that were
   * mid-challenge are the ones whose clocks nobody is holding any more, and
   * this is how the scheduler finds them again.
   */
  findSessionIdsWithLiveRuntimes(): Promise<string[]>;
}
