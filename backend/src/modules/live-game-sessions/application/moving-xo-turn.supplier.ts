import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { MOVING_XO_MODE_KEY } from '../domain/moving-xo-board';
import {
  MOVING_XO_COMMANDS,
  MOVING_XO_GAMEPLAY_PLUGIN,
} from '../domain/moving-xo-gameplay.plugin';
import { GameplayRuntimeState } from '../domain/gameplay-runtime';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import { GameplayObserverRegistry } from './gameplay-observer.registry';
import { LiveGameSessionSnapshot } from './live-game-session.snapshot';
import {
  MovingXoDrawOutcome,
  MovingXoQuestionSourceRegistry,
} from './moving-xo-question-source.registry';
import { SubmitGameplayCommand } from './submit-gameplay-command.use-case';

/**
 * Resolves the server's obligation to supply a Moving XO puzzle.
 *
 * A committed `question-pending` is a **durable obligation**, not a callback: a
 * team's turn has begun and the server owes it exactly one unseen puzzle. So this
 * converges from both directions, exactly as "المرحلة" and Match reconciliation
 * do — on every committed runtime mutation, and again on every authoritative
 * snapshot read. Progress therefore never depends on one in-memory callback
 * firing once: a dropped observer, a restarted process or a reconnecting client
 * all re-enter here and finish the work.
 *
 * Exactly one puzzle is ever outstanding. There is no deck, no lookahead and no
 * prefetch of the next turn — the obligation does not exist until the turn that
 * needs it has committed, which is what keeps an abandoned challenge from
 * burning content nobody saw.
 *
 * The draw itself is not done here. Content, ownership and exposure belong to the
 * Match layer, which registers a source; this only decides *when* to ask and
 * commits the answer through the runtime's own command path.
 */
@Injectable()
export class MovingXoTurnSupplier implements OnModuleInit {
  readonly name = 'moving-xo-turn-supplier';
  private readonly logger = new Logger(MovingXoTurnSupplier.name);
  /** Turns already being served, so one process does not ask twice at once. */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly observers: GameplayObserverRegistry,
    private readonly sources: MovingXoQuestionSourceRegistry,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly moduleRef: ModuleRef,
  ) {}

  onModuleInit(): void {
    // Both hooks: a mutation announces the obligation, a read recovers one that
    // was announced while nobody was listening.
    this.observers.registerTerminalObserver(this);
    this.observers.registerSnapshotEnricher(this);
  }

  async onRuntimeMutated(input: {
    sessionId: string;
    runtimeId: string;
    runtimeState: GameplayRuntimeState;
  }): Promise<unknown> {
    return this.converge(input.sessionId, input.runtimeState);
  }

  async enrich(snapshot: LiveGameSessionSnapshot): Promise<void> {
    const runtime = await this.runtimes.findBySessionId(snapshot.sessionId);
    if (runtime) await this.converge(snapshot.sessionId, runtime.serialize());
  }

  /**
   * Serve the pending turn, if there is one.
   *
   * Everything is re-read from the committed state rather than trusted from the
   * caller, so a stale notification cannot act on a turn that has moved on.
   */
  private async converge(
    sessionId: string,
    runtimeState: GameplayRuntimeState,
  ): Promise<{ outcome: string }> {
    if (runtimeState.modeKey !== MOVING_XO_MODE_KEY) {
      return { outcome: 'not-moving-xo' };
    }
    // A launch commits several mutations before the round is playable, and each
    // one announces itself here. Serving a turn into a round that cannot accept a
    // command would just abort a transaction and log an error on a healthy path.
    if (runtimeState.activeRound?.status !== 'active') {
      return { outcome: 'round-not-active' };
    }
    const state = runtimeState.runtimeState ?? {};
    if (state.phase !== 'question-pending')
      return { outcome: 'nothing-pending' };

    const source = this.sources.current();
    if (!source) return { outcome: 'no-source-registered' };

    const presented = this.presentedIn(runtimeState);
    // The turn a draw belongs to. Guards a late answer from opening a puzzle for
    // a turn that has already resolved.
    const turnNumber = presented.length + 1;
    const key = `${runtimeState.id}:${turnNumber}`;
    if (this.inFlight.has(key)) return { outcome: 'already-in-flight' };
    this.inFlight.add(key);
    try {
      const outcome = await source.draw({
        sessionId,
        runtimeId: runtimeState.id,
        turnNumber,
        presentedContentItemIds: presented,
      });
      return { outcome: await this.apply(sessionId, turnNumber, outcome) };
    } catch (error) {
      // Never break gameplay that already committed. The obligation stays
      // pending and the next mutation or read tries again.
      this.logger.error({
        event: 'moving_xo_supply_failed',
        sessionId,
        runtimeId: runtimeState.id,
        message: error instanceof Error ? error.message : String(error),
      });
      return { outcome: 'failed' };
    } finally {
      this.inFlight.delete(key);
    }
  }

  private presentedIn(runtimeState: GameplayRuntimeState): string[] {
    return MOVING_XO_GAMEPLAY_PLUGIN.presentedContentItemIds!({
      runtimeState: runtimeState.runtimeState ?? {},
      roundState: runtimeState.activeRound?.modeState ?? {},
      orderedContentItemIds: [],
    });
  }

  /** Commit the source's answer through the runtime's own command path. */
  private async apply(
    sessionId: string,
    turnNumber: number,
    outcome: MovingXoDrawOutcome,
  ): Promise<string> {
    if (outcome.kind === 'question') {
      return this.send(
        sessionId,
        MOVING_XO_COMMANDS.openQuestion,
        { questionJson: JSON.stringify(outcome.question) },
        turnNumber,
      );
    }
    if (outcome.kind === 'unknown') {
      // The obligation stays pending on purpose; the next mutation or read serves
      // it, and until then the state honestly says a puzzle is owed.
      return 'source-unknown';
    }
    return this.send(sessionId, MOVING_XO_COMMANDS.exhausted, {}, turnNumber);
  }

  /**
   * Send a server-owned command, re-reading state first.
   *
   * The turn is re-checked here rather than trusted from when the draw started:
   * a draw that returns after its turn resolved — a slow query, a retry, an
   * aborted challenge — must not open a puzzle for whatever turn is current now.
   * Revision guards then reject anything that still slips through.
   */
  private async send(
    sessionId: string,
    commandType: string,
    payload: Record<string, string>,
    expectedTurnNumber?: number,
  ): Promise<string> {
    const session = await this.sessions.findById(sessionId);
    const runtime = await this.runtimes.findBySessionId(sessionId);
    if (!session || !runtime) return 'session-or-runtime-gone';
    const runtimeState = runtime.serialize();
    const round = runtimeState.activeRound;
    if (!round) return 'no-active-round';
    if (runtimeState.modeKey !== MOVING_XO_MODE_KEY) return 'not-moving-xo';
    if (runtimeState.runtimeState?.phase !== 'question-pending') {
      return 'turn-moved-on';
    }
    if (
      expectedTurnNumber !== undefined &&
      this.presentedIn(runtimeState).length + 1 !== expectedTurnNumber
    ) {
      return 'turn-moved-on';
    }
    const submit = this.moduleRef.get(SubmitGameplayCommand, { strict: false });
    await submit.execute({
      sessionId,
      // The server acts as the session controller: content and depletion are its
      // conclusions, not a player's action.
      actor: { kind: 'user' as const, actorId: session.controllerActorId },
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
      roundId: round.id,
      commandType,
      payload,
    });
    return commandType;
  }
}
