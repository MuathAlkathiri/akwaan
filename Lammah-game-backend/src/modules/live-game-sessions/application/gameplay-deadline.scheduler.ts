import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import { TOP10_MODE_KEY } from '../domain/top10-poison-deck.plugin';
import { SubmitGameplayCommand } from './submit-gameplay-command.use-case';

/** Deadline scheduler shared by reconnect-safe, mode-owned round deadlines. */
@Injectable()
export class GameplayDeadlineScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(GameplayDeadlineScheduler.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly moduleRef: ModuleRef,
  ) {}

  async schedule(sessionId: string): Promise<void> {
    this.clear(sessionId);
    const session = await this.sessions.findById(sessionId);
    const runtime = await this.runtimes.findBySessionId(sessionId);
    const state = runtime?.serialize();
    const round = state?.activeRound;
    if (
      !session ||
      !runtime ||
      state?.modeKey !== TOP10_MODE_KEY ||
      state.status !== 'round-active' ||
      round?.status !== 'active' ||
      round.modeState.phase !== 'assigning' ||
      typeof round.modeState.deadlineAt !== 'string'
    ) {
      return;
    }
    const delay = Math.max(
      0,
      Date.parse(round.modeState.deadlineAt) - Date.now(),
    );
    this.timers.set(
      sessionId,
      setTimeout(
        () => void this.expire(sessionId, String(round.modeState.deadlineAt)),
        delay + 25,
      ),
    );
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async expire(
    sessionId: string,
    expectedDeadline: string,
  ): Promise<void> {
    this.timers.delete(sessionId);
    try {
      const session = await this.sessions.findById(sessionId);
      const runtime = await this.runtimes.findBySessionId(sessionId);
      const state = runtime?.serialize();
      const round = state?.activeRound;
      if (
        !session ||
        !runtime ||
        state?.modeKey !== TOP10_MODE_KEY ||
        round?.modeState.phase !== 'assigning' ||
        round.modeState.deadlineAt !== expectedDeadline
      ) {
        return;
      }
      const submit = this.moduleRef.get(SubmitGameplayCommand, {
        strict: false,
      });
      await submit.execute({
        sessionId,
        actor: { kind: 'user', actorId: session.controllerActorId },
        commandId: randomUUID(),
        expectedSessionRevision: session.revision,
        expectedRuntimeRevision: runtime.revision,
        roundId: round.id,
        commandType: 'timeout-card',
        payload: {},
      });
    } catch (error) {
      this.logger.warn(
        `Gameplay deadline retry for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.schedule(sessionId);
    }
  }

  private clear(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.timers.delete(sessionId);
  }
}
