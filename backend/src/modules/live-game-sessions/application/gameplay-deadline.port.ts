export const GAMEPLAY_DEADLINE_SYNCHRONIZER = Symbol(
  'GAMEPLAY_DEADLINE_SYNCHRONIZER',
);

/**
 * Converges this process's armed timer with committed authoritative state.
 *
 * Deliberately the whole contract. A caller never says *what* deadline exists,
 * when it is, or which command resolves it — it says only "this session's state
 * has just changed, go and look". Everything else is derived from what was
 * persisted, which is what stops a mechanic from having to wire its own timer
 * and what makes the same call correct after a command, after a resolution, and
 * after a restart.
 *
 * Implementations must be idempotent: calling this twice for the same committed
 * state leaves exactly one effective expiration path, and calling it when the
 * state carries no deadline leaves none.
 */
export interface GameplayDeadlineSynchronizer {
  synchronize(sessionId: string): Promise<void>;
}
