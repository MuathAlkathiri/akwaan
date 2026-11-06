import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import { LiveSessionConcurrencyError } from '../domain/live-session.errors';
import { LIVE_SESSION_CLOCK, LiveSessionClock } from './live-session-clock';

/**
 * Withdraws a specific connection's multi-surface readiness when it leaves.
 *
 * Fair-start readiness is bound to the exact acknowledging connection id
 * (socket.io `client.id`). When that connection disconnects — a tab closing, a
 * reload mid-barrier, a device dropping — its acknowledgement must stop counting
 * toward the required surface set, or the challenge could activate on a stale
 * claim from a surface that is no longer mounted. A reconnect is a new
 * connection id and must acknowledge again.
 *
 * Retried, because a disconnect races gameplay: the write is guarded on the
 * runtime revision, and losing that race used to drop the withdrawal — leaving
 * a departed surface counted as ready, with no client left to try again. Each
 * attempt re-reads the runtime, so if the write that won already cleared this
 * connection (an activation does), the recomputation finds nothing to change.
 */
@Injectable()
export class WithdrawPresentationReadiness {
  static readonly MAX_ATTEMPTS = 3;
  private readonly logger = new Logger(WithdrawPresentationReadiness.name);

  constructor(
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
  ) {}

  async forConnection(sessionId: string, connectionId: string): Promise<void> {
    for (
      let attempt = 1;
      attempt <= WithdrawPresentationReadiness.MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.attempt(sessionId, connectionId);
      } catch (error) {
        if (!(error instanceof LiveSessionConcurrencyError)) throw error;
        this.logger.warn({
          event: 'presentation_readiness_withdraw_retry',
          sessionId,
          connectionId,
          attempt,
        });
      }
    }
    // Every attempt lost to gameplay. Say so rather than drop it silently.
    this.logger.error({
      event: 'presentation_readiness_withdraw_abandoned',
      sessionId,
      connectionId,
      attempts: WithdrawPresentationReadiness.MAX_ATTEMPTS,
    });
  }

  private async attempt(
    sessionId: string,
    connectionId: string,
  ): Promise<void> {
    const runtime = await this.runtimes.findBySessionId(sessionId);
    if (!runtime) return;
    const previousRevision = runtime.revision;
    // Withdraw from both the INITIAL barrier and any CURRENT prepared recurring
    // presentation. An already-activated presentation (initial or recurring)
    // holds no readiness, so a disconnect there is a no-op and never reverts it.
    runtime.clearSurfaceReadiness(connectionId);
    runtime.withdrawCurrentPresentationReadiness(connectionId);
    if (runtime.revision === previousRevision) return;
    await this.runtimes.save(runtime, previousRevision);
    this.logger.log({
      event: 'presentation_readiness_withdrawn',
      sessionId,
      connectionId,
      revision: runtime.revision,
    });
  }
}
