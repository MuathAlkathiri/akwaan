import { GameplayRuntime } from './gameplay-runtime';

export const GAMEPLAY_RUNTIME_REPOSITORY = Symbol(
  'GAMEPLAY_RUNTIME_REPOSITORY',
);

export interface GameplayRuntimeRepository {
  create(runtime: GameplayRuntime): Promise<void>;
  findById(runtimeId: string): Promise<GameplayRuntime | null>;
  findBySessionId(sessionId: string): Promise<GameplayRuntime | null>;
  save(runtime: GameplayRuntime, expectedRevision: number): Promise<void>;
}
