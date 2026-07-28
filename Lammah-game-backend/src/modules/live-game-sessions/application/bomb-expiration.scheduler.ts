import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import { Inject } from '@nestjs/common';
import { SubmitGameplayCommand } from './submit-gameplay-command.use-case';

@Injectable()
export class BombExpirationScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(BombExpirationScheduler.name);
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
    if (!session || !runtime) return;
    const state = session.serialize();
    if (
      state.modeKey !== 'bomb' ||
      state.status !== 'active' ||
      runtime.serialize().status !== 'round-active' ||
      !state.activeTeamId
    )
      return;
    const team = state.teams.find(
      (candidate) => candidate.id === state.activeTeamId,
    );
    if (!team?.clock.running || !team.clock.startedAt) return;
    const remainingMs = Math.max(
      0,
      team.clock.allocatedMs -
        team.clock.consumedMs -
        (Date.now() - team.clock.startedAt.getTime()),
    );
    this.timers.set(
      sessionId,
      setTimeout(() => void this.expire(sessionId), remainingMs + 25),
    );
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async expire(sessionId: string): Promise<void> {
    this.timers.delete(sessionId);
    try {
      const session = await this.sessions.findById(sessionId);
      const runtime = await this.runtimes.findBySessionId(sessionId);
      if (!session || !runtime) return;
      const state = session.serialize();
      const runtimeState = runtime.serialize();
      if (
        state.status !== 'active' ||
        runtimeState.status !== 'round-active' ||
        !runtimeState.activeRound
      )
        return;
      const submit = this.moduleRef.get(SubmitGameplayCommand, {
        strict: false,
      });
      await submit.execute({
        sessionId,
        actor: {
          kind: 'user',
          actorId: session.controllerActorId,
        },
        commandId: randomUUID(),
        expectedSessionRevision: session.revision,
        expectedRuntimeRevision: runtime.revision,
        commandType: 'expire-team',
        payload: {},
      });
    } catch (error) {
      this.logger.warn(
        `Bomb expiration retry for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
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
