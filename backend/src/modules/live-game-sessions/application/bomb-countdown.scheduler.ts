import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { StartBombGameplay } from './start-bomb-gameplay.use-case';

@Injectable()
export class BombCountdownScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(BombCountdownScheduler.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly moduleRef: ModuleRef) {}

  schedule(sessionId: string, countdownEndsAt: Date): void {
    this.cancel(sessionId);
    this.timers.set(
      sessionId,
      setTimeout(
        () => void this.start(sessionId),
        Math.max(0, countdownEndsAt.getTime() - Date.now()),
      ),
    );
  }

  cancel(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.timers.delete(sessionId);
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  /**
   * Starts Bomb once the countdown elapses.
   *
   * A timer callback has no caller to hand a failure to, and this one drives a
   * multi-step launch — session read, runtime create, round create, round
   * start, turn start — any of which can lose a revision race or fail against
   * Mongo. Unowned, that rejection was an unhandled rejection, which on this
   * Node version takes the process down and every other live game with it.
   *
   * Contained and logged loudly rather than retried: the countdown has already
   * elapsed, `startAfterCountdown` re-checks its own preconditions and does
   * nothing if they no longer hold, and the host still has the explicit start
   * command. A silent catch would be the wrong trade — this leaves a lobby
   * waiting, so it has to be visible.
   */
  private async start(sessionId: string): Promise<void> {
    this.timers.delete(sessionId);
    try {
      const startBomb = this.moduleRef.get(StartBombGameplay, {
        strict: false,
      });
      await startBomb.startAfterCountdown(sessionId);
    } catch (error) {
      this.logger.error({
        event: 'bomb_countdown_start_failed',
        sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
