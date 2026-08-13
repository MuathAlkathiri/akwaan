import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { StartBombGameplay } from './start-bomb-gameplay.use-case';

@Injectable()
export class BombCountdownScheduler implements OnModuleDestroy {
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

  private async start(sessionId: string): Promise<void> {
    this.timers.delete(sessionId);
    const startBomb = this.moduleRef.get(StartBombGameplay, { strict: false });
    await startBomb.startAfterCountdown(sessionId);
  }
}
