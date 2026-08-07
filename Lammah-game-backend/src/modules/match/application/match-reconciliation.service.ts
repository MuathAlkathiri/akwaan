import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  GameplayObserverRegistry,
  GameplayTerminalObserver,
} from '../../live-game-sessions/application/gameplay-observer.registry';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { Match } from '../domain/match';
import { MatchStage } from '../domain/match.constants';
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../persistence/match.repository';
import { ChallengeLauncherRegistry } from './challenge-launcher.registry';
import { MATCH_CLOCK, MatchClock } from './match-clock';
import { MatchTransitionNotifier } from './match-transition.notifier';
import { reconciliationCommandId } from './match.use-cases';
import { RuntimeScoreEventCollector } from './runtime-score-event.collector';

/** Why a reconciliation attempt ended the way it did. */
export type MatchReconciliationOutcome =
  | 'no_match'
  | 'no_current_challenge'
  | 'runtime_mismatch'
  | 'not_terminal'
  | 'reconciled'
  | 'already_reconciled'
  | 'deferred_revision_conflict';

export interface MatchReconciliationResult {
  outcome: MatchReconciliationOutcome;
  matchId?: string;
  importedScoreEvents?: number;
}

const MAX_ATTEMPTS = 2;

/**
 * The single bridge from a finished mechanic to the Match.
 *
 * A challenge completes because its own runtime says so, never because a
 * controller sent a "finish" command and never because something polled. This
 * observer runs after every committed runtime mutation, recognises the terminal
 * state through the mechanic's own launcher, imports the signed events, and
 * advances the Match. It is safe to run again on the same terminal state.
 *
 * Convergence is deliberately in-process for now: a Match whose optimistic save
 * loses twice is left for the next mutation or snapshot read to reconcile. That
 * is single-instance behaviour, pending shared scheduling or event delivery.
 */
@Injectable()
export class MatchReconciliationService
  implements GameplayTerminalObserver, OnModuleInit
{
  readonly name = 'match-reconciliation';
  private readonly logger = new Logger(MatchReconciliationService.name);

  constructor(
    private readonly observers: GameplayObserverRegistry,
    @Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository,
    private readonly launchers: ChallengeLauncherRegistry,
    private readonly collector: RuntimeScoreEventCollector,
    @Inject(MATCH_CLOCK) private readonly clock: MatchClock,
    private readonly transitions: MatchTransitionNotifier,
  ) {}

  onModuleInit(): void {
    this.observers.registerTerminalObserver(this);
  }

  async onRuntimeMutated(input: {
    sessionId: string;
    runtimeId: string;
    runtimeState: GameplayRuntimeState;
  }): Promise<MatchReconciliationResult> {
    let result: MatchReconciliationResult = {
      outcome: 'deferred_revision_conflict',
    };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      result = await this.attempt(input, attempt);
      if (result.outcome !== 'deferred_revision_conflict') return result;
    }
    return result;
  }

  /**
   * Read-side convergence: called before an authoritative Match projection is
   * composed, so a deferred reconciliation cannot outlive the next read.
   */
  ensureReconciled(
    sessionId: string,
    runtime: GameplayRuntimeState | null | undefined,
  ): Promise<MatchReconciliationResult> {
    if (!runtime) return Promise.resolve({ outcome: 'no_current_challenge' });
    return this.onRuntimeMutated({
      sessionId,
      runtimeId: runtime.id,
      runtimeState: runtime,
    });
  }

  private async attempt(
    input: {
      sessionId: string;
      runtimeId: string;
      runtimeState: GameplayRuntimeState;
    },
    attempt: number,
  ): Promise<MatchReconciliationResult> {
    const match = await this.matches.findActiveBySessionId(input.sessionId);
    if (!match) return { outcome: 'no_match' };
    const current = match.currentChallenge;
    // Only the challenge this Match bound is reconciled; a runtime started
    // outside a Match is none of the Match's business.
    if (!current) {
      return {
        outcome: this.alreadyImported(match, input.runtimeId)
          ? 'already_reconciled'
          : 'no_current_challenge',
        matchId: match.id,
      };
    }
    if (current.runtimeId !== input.runtimeId) {
      return { outcome: 'runtime_mismatch', matchId: match.id };
    }
    const launcher = this.launchers.byKey(current.challengeKey);
    if (!launcher || !launcher.detectTerminal(input.runtimeState)) {
      return { outcome: 'not_terminal', matchId: match.id };
    }

    const events = this.collector.collect(input.runtimeState, input.runtimeId);
    const summary = launcher.buildCompletionSummary(input.runtimeState);
    const revision = match.revision;
    // Captured before the aggregate moves on, so a deferral reports where the
    // Match is actually stuck rather than where it was about to go.
    const stageBefore = match.stage;
    const { completed } = match.completeChallenge({
      commandId: reconciliationCommandId(input.runtimeId),
      now: this.clock.now(),
      runtimeId: input.runtimeId,
      events,
      summary: summary.details,
      winnerTeamId: summary.winnerTeamId ?? null,
      challengeKey: summary.challengeKey,
    });
    if (!completed) return { outcome: 'already_reconciled', matchId: match.id };
    try {
      await this.matches.save(match, revision);
    } catch (error) {
      return this.defer(
        { match, stage: stageBefore, slotKey: current.slotKey },
        input,
        revision,
        attempt,
        error,
      );
    }
    // Announced only after the Match is durably completed, and exactly once: a
    // replayed terminal state never reaches this line.
    this.transitions.publish(match, this.transitions.completionReason(match));
    this.logger.log({
      event: 'match_challenge_reconciled',
      matchId: match.id,
      sessionId: input.sessionId,
      runtimeId: input.runtimeId,
      slotKey: current.slotKey,
      challengeKey: current.challengeKey,
      importedScoreEvents: events.length,
      stage: match.stage,
      status: match.status,
    });
    return {
      outcome: 'reconciled',
      matchId: match.id,
      importedScoreEvents: events.length,
    };
  }

  /**
   * Losing the optimistic save is not a gameplay failure: the challenge really
   * did finish, and the next mutation or snapshot read reconciles it. It is
   * logged with everything needed to correlate the deferral, and with nothing
   * private to the mechanic.
   */
  private defer(
    context: {
      match: Match;
      stage: MatchStage;
      slotKey: WorldChallengeSlotKey;
    },
    input: { sessionId: string; runtimeId: string },
    expectedRevision: number,
    attempt: number,
    error: unknown,
  ): MatchReconciliationResult {
    const deferred = attempt >= MAX_ATTEMPTS;
    const detail = {
      event: deferred
        ? 'match_reconciliation_deferred'
        : 'match_reconciliation_retry',
      matchId: context.match.id,
      liveSessionId: input.sessionId,
      runtimeId: input.runtimeId,
      challengeSessionId: input.runtimeId,
      expectedRevision,
      actualRevision: context.match.revision,
      stage: context.stage,
      slotKey: context.slotKey,
      retryCount: attempt,
      errorCode: this.errorCode(error),
      timestamp: this.clock.now().toISOString(),
    };
    if (deferred) this.logger.error(detail);
    else this.logger.warn(detail);
    return { outcome: 'deferred_revision_conflict', matchId: context.match.id };
  }

  /** True when this runtime's board position was already completed. */
  private alreadyImported(match: Match, runtimeId: string): boolean {
    return match.occurrences.some((occurrence) =>
      Object.values(occurrence.slots).some(
        (slot) => slot?.runtimeId === runtimeId && slot.completedAt,
      ),
    );
  }

  private errorCode(error: unknown): string {
    const response = (error as { response?: { code?: unknown } })?.response;
    if (typeof response?.code === 'string') return response.code;
    return error instanceof Error ? error.name : 'UNKNOWN';
  }
}
