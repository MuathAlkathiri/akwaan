import { randomUUID } from 'crypto';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
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
import {
  isTerminalRuntimeStatus,
  type GameplayRuntimeState,
} from '../domain/gameplay-runtime';
import { CLOSEST_MODE_KEY } from '../domain/closest-gameplay.plugin';
import { ONE_CLUE_MODE_KEY } from '../domain/one-clue-gameplay.plugin';

/**
 * A pending server deadline and how it is resolved.
 *
 * Two shapes exist because mechanics express a deadline in two places:
 *
 * - `mode-command` — the deadline lives on the runtime state and a mode command
 *   resolves it. "ركّبها", "مين اقرب" and "بدليل واحد" work this way.
 * - `interaction` — the deadline lives on the open interaction's prompt and is
 *   resolved by the ordinary interaction resolution path. "اقرأ خصمك" works
 *   this way, and it is the only kind of deadline that mechanic has.
 *
 * Top 5 deliberately has neither: a card waits for its assigned player, and a
 * player who leaves is handed off rather than timed out.
 */
type PendingDeadline =
  | { kind: 'mode-command'; deadlineAt: string; commandType: string }
  | {
      kind: 'interaction';
      deadlineAt: string;
      interactionRevision: number;
      interactionStatus: string;
    };

/**
 * Interaction states a deadline can still resolve. The terminal three
 * (`resolved`, `cancelled`, `expired`) are excluded, so a deadline that fires
 * after the players already settled the item does nothing.
 */
const OPEN_INTERACTION_STATUSES = new Set([
  'prepared',
  'open',
  'closed',
  'adjudicating',
]);

function pendingDeadline(
  state: GameplayRuntimeState | undefined,
): PendingDeadline | undefined {
  const round = state?.activeRound;
  if (!state || !round || round.status !== 'active') return undefined;
  if (isTerminalRuntimeStatus(state.status)) return undefined;
  if (
    state.modeKey === DISTRIBUTED_INFORMATION_MODE_KEY &&
    state.status === 'round-active' &&
    state.runtimeState.phase === 'active' &&
    typeof state.runtimeState.deadlineAt === 'string'
  ) {
    return {
      kind: 'mode-command',
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
      kind: 'mode-command',
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
      kind: 'mode-command',
      deadlineAt: state.runtimeState.deadlineAt,
      commandType: 'expire-one-clue-stage',
    };
  }
  // Interaction-owned deadline. Deliberately not keyed by mode: any mechanic
  // that publishes `prompt.deadlineAt` is telling clients to run a countdown,
  // and a countdown the server does not also enforce is the freeze this
  // branch exists to prevent.
  const interaction = round.interaction;
  if (
    interaction &&
    OPEN_INTERACTION_STATUSES.has(interaction.status) &&
    interaction.prompt.deadlineAt
  ) {
    return {
      kind: 'interaction',
      deadlineAt: new Date(interaction.prompt.deadlineAt).toISOString(),
      interactionRevision: interaction.revision,
      interactionStatus: interaction.status,
    };
  }
  return undefined;
}
import { SubmitGameplayCommand } from './submit-gameplay-command.use-case';
import { GameplayInteractionUseCases } from './gameplay-interaction.use-cases';

/** Deadline scheduler shared by reconnect-safe, mode-owned round deadlines. */
@Injectable()
export class GameplayDeadlineScheduler
  implements OnModuleDestroy, OnApplicationBootstrap
{
  private readonly logger = new Logger(GameplayDeadlineScheduler.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /**
   * Consecutive failures per session. A deadline already in the past re-arms
   * with a ~0ms delay, so an error that repeats — a stale revision that never
   * settles, a mode that cannot resolve — would otherwise spin against Mongo
   * as fast as the event loop allows.
   */
  private readonly failures = new Map<string, number>();
  /**
   * The last deadline this process resolved, per session, with the runtime
   * revision it was resolved at. Re-arming after a resolution is what picks up
   * the next item's clock, but if the runtime has not moved then the same
   * deadline is still pending and arming it again would resolve it again, for
   * ever. Requiring the revision to have advanced makes that impossible.
   */
  private readonly lastResolved = new Map<
    string,
    { deadlineAt: string; revision: number }
  >();
  private static readonly MAX_RETRIES = 5;
  private static readonly RETRY_BACKOFF_MS = 250;

  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Rebuild every in-flight deadline after a restart.
   *
   * The timers only ever lived in this process's memory, so a redeploy, a crash
   * or a free-tier instance waking from sleep silently dropped them all and the
   * challenges they belonged to hung until somebody abandoned the game. Nothing
   * re-armed them, which is why a lost timer was permanent.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const sessionIds = await this.runtimes.findSessionIdsWithLiveRuntimes();
      if (!sessionIds.length) return;
      // allSettled, not all: one unreadable runtime must not stop every other
      // session from getting its clock back.
      const results = await Promise.allSettled(
        sessionIds.map((id) => this.schedule(id)),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      this.logger.log(
        `Rearmed gameplay deadlines for ${sessionIds.length - failed} of ${sessionIds.length} live session(s) after startup`,
      );
      if (failed) {
        this.logger.error(`${failed} session(s) could not be rearmed`);
      }
    } catch (error) {
      // Never block boot on this. A failure here costs timers, not the API.
      this.logger.error(
        `Could not rearm gameplay deadlines at startup: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async schedule(sessionId: string): Promise<void> {
    this.clear(sessionId);
    const session = await this.sessions.findById(sessionId);
    const runtime = await this.runtimes.findBySessionId(sessionId);
    const state = runtime?.serialize();
    const pending = pendingDeadline(state);
    if (!session || !runtime || !pending) return;
    const resolved = this.lastResolved.get(sessionId);
    if (
      resolved &&
      resolved.deadlineAt === pending.deadlineAt &&
      resolved.revision === runtime.revision
    ) {
      // Already resolved this exact deadline and nothing moved. Arming again
      // would just re-resolve it.
      return;
    }
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
    this.failures.clear();
    this.lastResolved.clear();
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
      const actor = {
        kind: 'user' as const,
        actorId: session.controllerActorId,
      };
      if (pending.kind === 'interaction') {
        // The ordinary resolution path, run by the server instead of the host.
        // It calls the plugin's own `createOutcome`, so an unanswered item is
        // scored by the mechanic's authored rules for a missing submission
        // rather than by anything this scheduler decides.
        const interactions = this.moduleRef.get(GameplayInteractionUseCases, {
          strict: false,
        });
        // Close before resolving. `resolve` only accepts a closed or
        // adjudicating interaction — an open one still belongs to the players —
        // and the normal auto-resolve path closes first for the same reason.
        // Skipping this step made every timeout fail with
        // "Cannot perform this action while interaction is open".
        if (pending.interactionStatus === 'open') {
          await interactions.close({
            sessionId,
            roundId: round.id,
            actor,
            commandId: randomUUID(),
            expectedSessionRevision: session.revision,
            expectedRuntimeRevision: runtime.revision,
            expectedInteractionRevision: pending.interactionRevision,
          });
        }
        // Closing advanced both revisions, so resolution reads the current
        // state rather than the one this timer was armed against.
        const closed = await this.runtimes.findBySessionId(sessionId);
        const closedSession = await this.sessions.findById(sessionId);
        if (!closed || !closedSession) return;
        const closedRound = closed.serialize().activeRound;
        if (!closedRound?.interaction) return;
        await interactions.resolve({
          sessionId,
          roundId: closedRound.id,
          actor,
          commandId: randomUUID(),
          expectedSessionRevision: closedSession.revision,
          expectedRuntimeRevision: closed.revision,
          expectedInteractionRevision: closedRound.interaction.revision,
        });
      } else {
        const submit = this.moduleRef.get(SubmitGameplayCommand, {
          strict: false,
        });
        await submit.execute({
          sessionId,
          actor,
          commandId: randomUUID(),
          expectedSessionRevision: session.revision,
          expectedRuntimeRevision: runtime.revision,
          roundId: round.id,
          commandType: pending.commandType,
          payload: {},
        });
      }
      // The mechanic may have opened the next item's interaction inside that
      // resolution, and its deadline needs a timer of its own.
      this.failures.delete(sessionId);
      this.lastResolved.set(sessionId, {
        deadlineAt: pending.deadlineAt,
        revision: runtime.revision,
      });
      await this.schedule(sessionId);
    } catch (error) {
      const attempts = (this.failures.get(sessionId) ?? 0) + 1;
      this.failures.set(sessionId, attempts);
      const message = error instanceof Error ? error.message : String(error);
      if (attempts > GameplayDeadlineScheduler.MAX_RETRIES) {
        // Stop retrying, but say so loudly. A deadline that cannot resolve is
        // a frozen challenge for the players in it, and silence here is what
        // makes that look like the game itself hanging.
        this.failures.delete(sessionId);
        this.logger.error(
          `Gameplay deadline for ${sessionId} failed ${attempts} times and will not be retried: ${message}`,
        );
        return;
      }
      this.logger.warn(
        `Gameplay deadline retry ${attempts} for ${sessionId}: ${message}`,
      );
      setTimeout(
        () => void this.schedule(sessionId),
        GameplayDeadlineScheduler.RETRY_BACKOFF_MS * attempts,
      ).unref?.();
    }
  }

  private clear(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.timers.delete(sessionId);
  }

  /** Forget a finished session so the maps do not grow without bound. */
  forget(sessionId: string): void {
    this.clear(sessionId);
    this.failures.delete(sessionId);
    this.lastResolved.delete(sessionId);
  }
}
