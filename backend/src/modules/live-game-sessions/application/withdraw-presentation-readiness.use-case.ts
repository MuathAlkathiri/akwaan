import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
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
 */
@Injectable()
export class WithdrawPresentationReadiness {
  private readonly logger = new Logger(WithdrawPresentationReadiness.name);

  constructor(
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    @Inject(LIVE_SESSION_CLOCK) private readonly clock: LiveSessionClock,
  ) {}

  async forConnection(sessionId: string, connectionId: string): Promise<void> {
    const runtime = await this.runtimes.findBySessionId(sessionId);
    if (!runtime) return;
    const previousRevision = runtime.revision;
    runtime.clearSurfaceReadiness(connectionId);
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
