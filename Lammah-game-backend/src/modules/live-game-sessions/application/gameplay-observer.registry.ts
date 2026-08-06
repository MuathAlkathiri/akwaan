import { Injectable, Logger } from '@nestjs/common';
import { GameplayRuntimeState } from '../domain/gameplay-runtime';
import { LiveGameSessionSnapshot } from './live-game-session.snapshot';
import { LiveSessionActor } from './live-session-actor';

/**
 * Outward-facing hooks for layers that sit *above* a live session.
 *
 * The Match orchestration layer needs to know when a mechanic runtime finished,
 * and needs to add its own projection to an authoritative snapshot. Both are
 * expressed as registries so the dependency arrow only ever points
 * match -> live-game-sessions, exactly like the World Content reference guard.
 */

export interface GameplayTerminalObserver {
  readonly name: string;
  /**
   * Called after every committed runtime mutation with the authoritative state.
   * Implementations must be idempotent: the same terminal state may arrive twice.
   * Any returned value is for the caller's own telemetry; the registry ignores it.
   */
  onRuntimeMutated(input: {
    sessionId: string;
    runtimeId: string;
    runtimeState: GameplayRuntimeState;
  }): Promise<unknown>;
}

export interface SessionSnapshotEnricher {
  readonly name: string;
  /** Adds an actor-safe projection to an already-built snapshot. */
  enrich(
    snapshot: LiveGameSessionSnapshot,
    actor: LiveSessionActor,
  ): Promise<void>;
}

@Injectable()
export class GameplayObserverRegistry {
  private readonly logger = new Logger(GameplayObserverRegistry.name);
  private readonly terminalObservers: GameplayTerminalObserver[] = [];
  private readonly snapshotEnrichers: SessionSnapshotEnricher[] = [];

  registerTerminalObserver(observer: GameplayTerminalObserver): void {
    if (this.terminalObservers.some((entry) => entry.name === observer.name)) {
      return;
    }
    this.terminalObservers.push(observer);
    this.logger.log(`Registered gameplay terminal observer "${observer.name}"`);
  }

  registerSnapshotEnricher(enricher: SessionSnapshotEnricher): void {
    if (this.snapshotEnrichers.some((entry) => entry.name === enricher.name)) {
      return;
    }
    this.snapshotEnrichers.push(enricher);
    this.logger.log(`Registered session snapshot enricher "${enricher.name}"`);
  }

  /**
   * Notifies observers of a committed mutation.
   *
   * A failure here must never break gameplay that already succeeded, so it is
   * logged rather than propagated; the next mutation or snapshot read retries.
   */
  async notifyRuntimeMutated(input: {
    sessionId: string;
    runtimeId: string;
    runtimeState: GameplayRuntimeState;
  }): Promise<void> {
    for (const observer of this.terminalObservers) {
      try {
        await observer.onRuntimeMutated(input);
      } catch (error) {
        this.logger.error({
          event: 'gameplay_terminal_observer_failed',
          observer: observer.name,
          sessionId: input.sessionId,
          runtimeId: input.runtimeId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async enrichSnapshot(
    snapshot: LiveGameSessionSnapshot,
    actor: LiveSessionActor,
  ): Promise<LiveGameSessionSnapshot> {
    for (const enricher of this.snapshotEnrichers) {
      try {
        await enricher.enrich(snapshot, actor);
      } catch (error) {
        this.logger.error({
          event: 'session_snapshot_enricher_failed',
          enricher: enricher.name,
          sessionId: snapshot.sessionId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return snapshot;
  }
}
