import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { Inject } from '@nestjs/common';
import { MarhalaDifficulty } from '../../world-content/domain/marhala-content.policy';
import { MARHALA_MODE_KEY } from '../domain/marhala-board';
import {
  MARHALA_COMMANDS,
  MARHALA_GAMEPLAY_PLUGIN,
} from '../domain/marhala-gameplay.plugin';
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
  MarhalaDrawOutcome,
  MarhalaQuestionSourceRegistry,
} from './marhala-question-source.registry';
import { SubmitGameplayCommand } from './submit-gameplay-command.use-case';

/**
 * Resolves the server's obligation to supply a المرحلة question.
 *
 * A committed `question-pending` is a **durable obligation**, not a callback: the
 * team has chosen a difficulty and the server owes it exactly one unseen question.
 * So this converges from both directions, exactly as Match reconciliation does —
 * on every committed runtime mutation, and again on every authoritative snapshot
 * read. Progress therefore never depends on one in-memory callback firing once: a
 * dropped observer, a restarted process or a reconnecting client all re-enter here
 * and finish the work.
 *
 * The draw itself is not done here. Content, ownership and exposure belong to the
 * Match layer, which registers a source; this only decides *when* to ask and
 * commits the answer through the runtime's own command path.
 */
@Injectable()
export class MarhalaTurnSupplier implements OnModuleInit {
  readonly name = 'marhala-turn-supplier';
  private readonly logger = new Logger(MarhalaTurnSupplier.name);
  /** Turns already being served, so one process does not ask twice at once. */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly observers: GameplayObserverRegistry,
    private readonly sources: MarhalaQuestionSourceRegistry,
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
    if (runtimeState.modeKey !== MARHALA_MODE_KEY) {
      return { outcome: 'not-marhala' };
    }
    // A launch commits several mutations before the round is playable, and each
    // one announces itself here. Serving a turn into a round that cannot accept a
    // command would just abort a transaction and log an error on a healthy path.
    if (runtimeState.activeRound?.status !== 'active') {
      return { outcome: 'round-not-active' };
    }
    const state = runtimeState.runtimeState ?? {};
    // A decision that is open needs an honest list of choices before a team can
    // pick; a pending draw needs the question itself.
    if (state.phase === 'difficulty-choice') {
      return this.refreshAvailability(sessionId, runtimeState);
    }
    if (state.phase !== 'question-pending')
      return { outcome: 'nothing-pending' };

    const source = this.sources.current();
    if (!source) return { outcome: 'no-source-registered' };

    const difficulty = state.selectedDifficulty;
    if (typeof difficulty !== 'string') return { outcome: 'no-difficulty' };

    const played = MARHALA_GAMEPLAY_PLUGIN.presentedContentItemIds!({
      runtimeState: state,
      roundState: runtimeState.activeRound?.modeState ?? {},
      orderedContentItemIds: [],
    });
    // The turn a draw belongs to. Guards a late answer from opening a question
    // for a turn that has already resolved.
    const turnNumber = played.length + 1;
    const key = `${runtimeState.id}:${turnNumber}`;
    if (this.inFlight.has(key)) return { outcome: 'already-in-flight' };
    this.inFlight.add(key);
    try {
      const outcome = await source.draw({
        sessionId,
        runtimeId: runtimeState.id,
        difficulty: difficulty as MarhalaDifficulty,
        turnNumber,
        playedContentItemIds: played,
      });
      return { outcome: await this.apply(sessionId, turnNumber, outcome) };
    } catch (error) {
      // Never break gameplay that already committed. The obligation stays
      // pending and the next mutation or read tries again.
      this.logger.error({
        event: 'marhala_supply_failed',
        sessionId,
        runtimeId: runtimeState.id,
        message: error instanceof Error ? error.message : String(error),
      });
      return { outcome: 'failed' };
    } finally {
      this.inFlight.delete(key);
    }
  }

  /**
   * Refresh what the next team is allowed to choose.
   *
   * Recomputed at every decision rather than once at launch, because the account's
   * unseen pool shrinks as this race consumes it *and* as any concurrent Match of
   * the same account reserves from it.
   */
  private async refreshAvailability(
    sessionId: string,
    runtimeState: GameplayRuntimeState,
  ): Promise<{ outcome: string }> {
    const source = this.sources.current();
    if (!source) return { outcome: 'no-source-registered' };
    const state = runtimeState.runtimeState ?? {};
    const played = this.playedIn(runtimeState);
    const available = await source.availability({
      sessionId,
      runtimeId: runtimeState.id,
      playedContentItemIds: played,
    });
    // Cannot tell yet: leave the declared choices alone. Withdrawing them here
    // would strand the team, and ending the race would be a lie.
    if (!available) return { outcome: 'source-unknown' };
    const current = this.declaredAvailability(state);
    if (
      current.length === available.length &&
      available.every((difficulty) => current.includes(difficulty))
    ) {
      return { outcome: 'availability-unchanged' };
    }
    if (!available.length) {
      // Nothing at any difficulty and nobody has finished: end honestly.
      return {
        outcome: await this.send(sessionId, MARHALA_COMMANDS.exhausted, {}),
      };
    }
    return {
      outcome: await this.send(
        sessionId,
        MARHALA_COMMANDS.refreshAvailability,
        {
          availableDifficultiesJson: JSON.stringify(available),
        },
      ),
    };
  }

  private playedIn(runtimeState: GameplayRuntimeState): string[] {
    return MARHALA_GAMEPLAY_PLUGIN.presentedContentItemIds!({
      runtimeState: runtimeState.runtimeState ?? {},
      roundState: runtimeState.activeRound?.modeState ?? {},
      orderedContentItemIds: [],
    });
  }

  private declaredAvailability(state: {
    availableDifficultiesJson?: unknown;
  }): MarhalaDifficulty[] {
    if (typeof state.availableDifficultiesJson !== 'string') return [];
    try {
      return JSON.parse(state.availableDifficultiesJson) as MarhalaDifficulty[];
    } catch {
      return [];
    }
  }

  /** Commit the source's answer through the runtime's own command path. */
  private async apply(
    sessionId: string,
    turnNumber: number,
    outcome: MarhalaDrawOutcome,
  ): Promise<string> {
    if (outcome.kind === 'question') {
      return this.send(
        sessionId,
        MARHALA_COMMANDS.openQuestion,
        { questionJson: JSON.stringify(outcome.question) },
        turnNumber,
      );
    }
    if (outcome.kind === 'unknown') {
      // The obligation stays pending on purpose; the next mutation or read serves
      // it, and until then the state honestly says a question is owed.
      return 'source-unknown';
    }
    if (outcome.kind === 'unavailable') {
      return this.send(
        sessionId,
        MARHALA_COMMANDS.refreshAvailability,
        { availableDifficultiesJson: JSON.stringify(outcome.available) },
        turnNumber,
      );
    }
    return this.send(sessionId, MARHALA_COMMANDS.exhausted, {}, turnNumber);
  }

  /**
   * Send a server-owned command, re-reading state first.
   *
   * The turn is re-checked here rather than trusted from when the draw started:
   * a draw that returns after its turn resolved — a slow query, a retry, an
   * aborted challenge — must not open a question for whatever turn is current
   * now. Revision guards then reject anything that still slips through.
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
    if (runtimeState.modeKey !== MARHALA_MODE_KEY) return 'not-marhala';
    if (
      expectedTurnNumber !== undefined &&
      this.playedIn(runtimeState).length + 1 !== expectedTurnNumber
    ) {
      return 'turn-moved-on';
    }
    const submit = this.moduleRef.get(SubmitGameplayCommand, { strict: false });
    await submit.execute({
      sessionId,
      // The server acts as the session controller: content, expiry and
      // exhaustion are its conclusions, not a player's action.
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
