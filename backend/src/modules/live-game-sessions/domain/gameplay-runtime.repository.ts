import { GameplayRuntime, GameplayRuntimeState } from './gameplay-runtime';

export const GAMEPLAY_RUNTIME_REPOSITORY = Symbol(
  'GAMEPLAY_RUNTIME_REPOSITORY',
);

export interface GameplayRuntimeRepository {
  /**
   * The persisted state of one runtime, without rebuilding the aggregate.
   *
   * Deliberately skips plugin validation. `findById` restores through the
   * mechanic's current reducer, which is right for gameplay — a runtime it
   * cannot validate must not be played — but wrong for convergence: a Match
   * still owed a result would be stranded for ever by a state the plugin has
   * since stopped accepting. Reading the raw fact keeps the obligation
   * dischargeable, and the reconciler consumes exactly this shape anyway.
   */
  findStateById(runtimeId: string): Promise<GameplayRuntimeState | null>;
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
