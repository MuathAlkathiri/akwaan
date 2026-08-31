import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  GameplayObserverRegistry,
  GameplayTerminalObserver,
} from '../../live-game-sessions/application/gameplay-observer.registry';
import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { Match } from '../domain/match';
import { MatchBoardPositionKey } from '../domain/match-board-position-key';
import { MatchStage } from '../domain/match.constants';
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../persistence/match.repository';
import { ScoringService } from '../../scoring/application/scoring.service';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';
import { ChallengeLauncherRegistry } from './challenge-launcher.registry';
import { ContentExposureService } from './content-exposure.service';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../../live-game-sessions/domain/live-game-session.repository';
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
  | 'aborted'
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
    private readonly scoring: ScoringService,
    @Inject(MATCH_CLOCK) private readonly clock: MatchClock,
    private readonly transitions: MatchTransitionNotifier,
    private readonly exposures: ContentExposureService,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
  ) {}

  onModuleInit(): void {
    this.observers.registerTerminalObserver(this);
  }

  async onRuntimeMutated(input: {
    sessionId: string;
    runtimeId: string;
    runtimeState: GameplayRuntimeState;
  }): Promise<MatchReconciliationResult> {
    // Spend whatever this mutation put in front of a player, before deciding
    // whether the challenge is over. Recording rides on this observer rather than
    // its own because this is already the one place that resolves a runtime to its
    // Match and its mechanic — and because a completion pass runs it too, which is
    // what repairs a write that failed on an earlier mutation.
    await this.recordPresentedContent(input);
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
    if (input.runtimeState.status === 'cancelled') {
      return this.reconcileAbort(match, current, input, attempt);
    }
    const launcher = this.launchers.byKey(current.challengeKey);
    if (!launcher || !launcher.detectTerminal(input.runtimeState)) {
      return { outcome: 'not_terminal', matchId: match.id };
    }

    // Two different ledgers, deliberately kept apart.
    //
    // `mechanicEvents` is the mechanic's own accounting — RYO's signed per-item
    // payoffs, for instance. It explains the recap and it decided the winner,
    // and it is recorded on the result verbatim. It is *not* imported into the
    // Match, which is why one RYO challenge no longer moves the scoreboard by
    // its internal margin.
    //
    // The Match ledger receives exactly one thing: a single point for whoever
    // the mechanic says won, or nothing at all on a tie.
    const mechanicEvents = this.collector.collect(
      input.runtimeState,
      input.runtimeId,
    );
    const summary = launcher.buildCompletionSummary(input.runtimeState);
    const matchPointEvents = this.scoring.score(
      SCORING_RULE_IDS.CHALLENGE_WIN,
      {
        winnerTeamId: summary.winnerTeamId ?? null,
        teamIds: match.teams.map((team) => team.id),
        challengeKey: summary.challengeKey,
        positionKey: MatchBoardPositionKey.of(
          current.occurrenceIndex,
          current.slotKey,
        ).value,
        doubleApplied:
          summary.winnerTeamId != null &&
          current.doubledTeamIds.includes(summary.winnerTeamId),
        doubleConsumedTeamIds: current.doubledTeamIds,
        ...(summary.mechanicSummary
          ? { mechanicSummary: summary.mechanicSummary }
          : {}),
      },
      {
        matchId: match.id,
        challengeSessionId: input.runtimeId,
        occurredAt: this.clock.now(),
        // Deterministic: a second reconciliation of the same runtime mints the
        // same id, so the ledger recognises it instead of adding a second point.
        eventIdSeed: `challenge-win:${input.runtimeId}`,
      },
    );
    const revision = match.revision;
    // Captured before the aggregate moves on, so a deferral reports where the
    // Match is actually stuck rather than where it was about to go.
    const stageBefore = match.stage;
    const { completed } = match.completeChallenge({
      commandId: reconciliationCommandId(input.runtimeId),
      now: this.clock.now(),
      runtimeId: input.runtimeId,
      events: matchPointEvents,
      mechanicEvents: mechanicEvents.map((event) => ({ ...event })),
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
    // Whatever this challenge drew but never showed goes back to the account.
    // Only `reserved` rows are released, so nothing a player saw is un-seen.
    await this.releaseUnseenContent(match.id);
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
      importedScoreEvents: matchPointEvents.length,
      mechanicScoreEvents: mechanicEvents.length,
      winnerTeamId: summary.winnerTeamId ?? null,
      stage: match.stage,
      status: match.status,
    });
    return {
      outcome: 'reconciled',
      matchId: match.id,
      importedScoreEvents: matchPointEvents.length,
    };
  }

  /**
   * Spend the content this runtime has authoritatively presented.
   *
   * The server owns this truth: it reads the state *as committed* and asks the
   * mechanic which of the challenge's items that state has shown. A browser
   * claiming it rendered something is never consulted.
   *
   * The two failure modes are deliberately asymmetric. Recording something a
   * player never saw is impossible, because the state being read has already
   * committed. Failing to record something shown is possible for one mutation, and
   * self-heals: the mechanic reports its *cumulative* presented set, so the next
   * mutation — or the completion pass — writes the missed item, and the ledger is
   * idempotent so the repeat costs nothing. Under-recording may show a question
   * once more; over-recording would destroy content the account never received.
   *
   * Never allowed to fail gameplay that already committed.
   */
  private async recordPresentedContent(input: {
    sessionId: string;
    runtimeId: string;
    runtimeState: GameplayRuntimeState;
  }): Promise<void> {
    try {
      // Recurring fair-start: while a presentation generation is only prepared,
      // its content has not been shown to anyone, so nothing is exposed yet.
      // Mirrors the initial gate each launcher already applies before activation.
      if (input.runtimeState.currentPresentation?.status === 'prepared') {
        return;
      }
      const match = await this.matches.findActiveBySessionId(input.sessionId);
      const challenge = match?.currentChallenge;
      // Only the challenge this runtime belongs to: a stale runtime cannot spend
      // content a newer challenge drew.
      if (!match || !challenge || challenge.runtimeId !== input.runtimeId)
        return;
      const ordered = challenge.contentItemIds ?? [];
      const launcher = this.launchers.find({
        challengeTypeSlug: challenge.challengeKey,
      });
      // A mechanic that does not report presentation never burns content.
      if (!launcher?.presentedContentItemIds) return;
      // An on-demand mechanic has no launch binding by design — "المرحلة" draws
      // one question per turn — so there is nothing to filter against and its own
      // report is the only record of what was shown. That report is still
      // server-authoritative: those ids were drawn by the server and committed
      // through controller-only commands, never supplied by a player. Every other
      // mechanic keeps the stricter rule below.
      const onDemand = launcher.launchRequirements.contentItemCount === 0;
      if (!ordered.length && !onDemand) return;

      const presented = launcher
        .presentedContentItemIds({
          runtime: input.runtimeState,
          orderedContentItemIds: ordered,
        })
        // Never spend anything outside this challenge's own binding.
        .filter((id) => onDemand || ordered.includes(id));
      if (!presented.length) return;

      const session = await this.sessions.findById(input.sessionId);
      if (!session) return;

      await this.exposures.recordPresented(
        {
          // The account that owns the Match — never a phone participant.
          ownerAccountId: session.controllerActorId,
          challengeTypeKey: challenge.challengeKey,
          matchId: match.id,
        },
        presented,
        this.clock.now(),
      );
    } catch (error) {
      this.logger.error({
        event: 'content_exposure_record_failed',
        sessionId: input.sessionId,
        runtimeId: input.runtimeId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Hand back the current challenge's unseen reservations.
   *
   * Never allowed to fail a reconciliation that already committed: a stranded
   * reservation expires on its own, whereas throwing here would leave a durably
   * completed Match reported as unreconciled.
   */
  private async releaseUnseenContent(matchId: string): Promise<void> {
    try {
      await this.exposures.releaseUnseen(matchId);
    } catch (error) {
      this.logger.error({
        event: 'content_reservation_release_failed',
        matchId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async reconcileAbort(
    match: Match,
    current: NonNullable<Match['currentChallenge']>,
    input: {
      sessionId: string;
      runtimeId: string;
      runtimeState: GameplayRuntimeState;
    },
    attempt: number,
  ): Promise<MatchReconciliationResult> {
    const revision = match.revision;
    const stageBefore = match.stage;
    const { aborted } = match.abortChallenge({
      commandId: abortReconciliationCommandId(input.runtimeId),
      now: this.clock.now(),
      runtimeId: input.runtimeId,
    });
    if (!aborted) return { outcome: 'already_reconciled', matchId: match.id };
    try {
      await this.matches.save(match, revision);
      await this.releaseUnseenContent(match.id);
    } catch (error) {
      return this.defer(
        { match, stage: stageBefore, slotKey: current.slotKey },
        input,
        revision,
        attempt,
        error,
      );
    }
    this.transitions.publish(match, 'challenge-aborted');
    return { outcome: 'aborted', matchId: match.id, importedScoreEvents: 0 };
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

export function abortReconciliationCommandId(runtimeId: string): string {
  return `abort:${runtimeId}`;
}
