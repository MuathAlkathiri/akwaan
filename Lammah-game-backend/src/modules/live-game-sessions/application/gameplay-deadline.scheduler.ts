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
import { DISTRIBUTED_INFORMATION_MODE_KEY } from '../domain/distributed-information.plugin';
import type { GameplayRuntimeState } from '../domain/gameplay-runtime';
import { CLOSEST_MODE_KEY } from '../domain/closest-gameplay.plugin';
import { ONE_CLUE_MODE_KEY } from '../domain/one-clue-gameplay.plugin';

/**
 * What a mode's pending deadline looks like, and the command that resolves it.
 *
 * Only "ركّبها" carries one today: it puts a single race deadline on the runtime.
 * Top 5 deliberately has none — a card waits for its assigned player, and a
 * player who leaves is handed off rather than timed out.
 */
interface PendingDeadline {
  deadlineAt: string;
  commandType: string;
}

function pendingDeadline(
  state: GameplayRuntimeState | undefined,
): PendingDeadline | undefined {
  const round = state?.activeRound;
  if (!state || !round || round.status !== 'active') return undefined;
  if (
    state.modeKey === DISTRIBUTED_INFORMATION_MODE_KEY &&
    state.status === 'round-active' &&
    state.runtimeState.phase === 'active' &&
    typeof state.runtimeState.deadlineAt === 'string'
  ) {
    return {
      deadlineAt: state.runtimeState.deadlineAt,
      commandType: 'expire-race',
    };
  }
  if (
    state.modeKey === CLOSEST_MODE_KEY &&
    state.status === 'round-active' &&
    state.runtimeState.phase === 'collecting' &&
    typeof state.runtimeState.deadlineAt === 'string'
  ) {
    return {
      deadlineAt: state.runtimeState.deadlineAt,
      commandType: 'expire-closest-item',
    };
  }
  if (
    state.modeKey === ONE_CLUE_MODE_KEY &&
    state.status === 'round-active' &&
    state.runtimeState.phase === 'collecting' &&
    typeof state.runtimeState.deadlineAt === 'string'
  ) {
    return {
      deadlineAt: state.runtimeState.deadlineAt,
      commandType: 'expire-one-clue-stage',
    };
  }
  return undefined;
}
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
    const pending = pendingDeadline(state);
    if (!session || !runtime || !pending) return;
    const delay = Math.max(0, Date.parse(pending.deadlineAt) - Date.now());
    this.timers.set(
      sessionId,
      setTimeout(
        () => void this.expire(sessionId, pending.deadlineAt),
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
      const pending = pendingDeadline(state);
      const round = state?.activeRound;
      // A deadline that moved, or a race already resolved, needs nothing: the
      // plugin's own terminal state is the authority, so this stays idempotent.
      if (
        !session ||
        !runtime ||
        !round ||
        !pending ||
        pending.deadlineAt !== expectedDeadline
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
        commandType: pending.commandType,
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
