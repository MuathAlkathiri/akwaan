import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../live-game-sessions/domain/gameplay-runtime.repository';
import {
  MATCH_REPOSITORY,
  MatchRepository,
  PendingMatchConvergence,
} from '../persistence/match.repository';
import { MatchReconciliationService } from './match-reconciliation.service';

/**
 * The durability half of runtime → Match convergence.
 *
 * A finished challenge reaches the Match through an observer that runs *after*
 * the runtime transaction commits. That ordering is right — a Match write must
 * never be able to roll back gameplay that already happened — but it leaves a
 * window: between the runtime commit and the Match write, the obligation lived
 * only in a promise. A crash there, or a Mongo blip that outlasted the
 * in-memory retries, left a runtime marked complete and a Match still holding
 * the challenge open, with nothing to notice.
 *
 * Nothing new is written to fix that, because the obligation is already
 * durable: a Match records `currentChallenge` when it launches and clears it in
 * the same revision-guarded write that imports the result. A Match still naming
 * a runtime therefore *is* the record that convergence is owed, and it cannot
 * be acknowledged without the effect landing — they are one write.
 *
 * This sweeper is the part that was missing: something that rediscovers those
 * obligations without waiting for a client to happen to read a snapshot. It
 * applies nothing itself. Every candidate is handed to
 * `MatchReconciliationService`, which stays the single component that decides
 * whether a runtime is terminal and mutates the Match.
 */
@Injectable()
export class MatchConvergenceSweeper
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MatchConvergenceSweeper.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;
  /**
   * How many consecutive sweeps have seen an obligation still outstanding.
   *
   * Only for reporting. A stuck convergence is never dropped — the obligation
   * lives in the Match document, not in this counter — but it has to become
   * loud rather than being retried quietly for ever.
   */
  private readonly unresolved = new Map<string, number>();

  /**
   * Long enough that a healthy system sweeps almost nothing, short enough that
   * a genuinely stranded Match recovers well inside a single sitting. The fast
   * path is still the post-commit observer; this is the safety net behind it.
   */
  private static readonly INTERVAL_MS = 30_000;
  /** Sweeps an obligation may stay outstanding before it is reported as stuck. */
  private static readonly REPORT_AFTER_SWEEPS = 3;

  constructor(
    @Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly reconciliation: MatchReconciliationService,
  ) {}

  /**
   * Recover first, then keep watching.
   *
   * The bootstrap pass is the one that matters for correctness: it is what
   * turns "the process died mid-convergence" from permanent into a delay.
   */
  async onApplicationBootstrap(): Promise<void> {
    this.stopped = false;
    await this.sweep('bootstrap');
    this.timer = setInterval(() => {
      void this.sweep('interval');
    }, MatchConvergenceSweeper.INTERVAL_MS);
    // Never hold the process open for a sweep that can always run later.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.unresolved.clear();
  }

  /**
   * One pass over the outstanding obligations.
   *
   * Never throws and never overlaps itself: a sweep that fails leaves the
   * obligations exactly where they were — in the Match documents — for the next
   * pass to find.
   */
  async sweep(trigger: 'bootstrap' | 'interval' | 'manual'): Promise<number> {
    if (this.stopped || this.running) return 0;
    this.running = true;
    try {
      const pending = await this.matches.findAwaitingConvergence();
      let converged = 0;
      for (const obligation of pending) {
        if (this.stopped) break;
        if (await this.converge(obligation, trigger)) converged += 1;
      }
      this.forgetSettled(pending);
      if (converged) {
        this.logger.log({
          event: 'match_convergence_recovered',
          trigger,
          converged,
          scanned: pending.length,
        });
      }
      return converged;
    } catch (error) {
      // A sweep is a safety net; it may not become a new failure mode.
      this.logger.error({
        event: 'match_convergence_sweep_failed',
        trigger,
        message: error instanceof Error ? error.message : String(error),
      });
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async converge(
    obligation: PendingMatchConvergence,
    trigger: string,
  ): Promise<boolean> {
    try {
      // Raw persisted state, not the restored aggregate: see
      // `findStateById`. An obligation must stay dischargeable even if the
      // mechanic's reducer would no longer accept the state it produced.
      const runtimeState = await this.runtimes.findStateById(
        obligation.runtimeId,
      );
      if (!runtimeState) {
        // A Match bound to a runtime that does not exist is an invariant
        // violation, not a retryable failure. Reported rather than repaired:
        // choosing a winner for a challenge whose record is gone would be
        // inventing history.
        this.logger.error({
          event: 'match_convergence_runtime_missing',
          trigger,
          matchId: obligation.matchId,
          sessionId: obligation.sessionId,
          runtimeId: obligation.runtimeId,
        });
        return false;
      }
      const result = await this.reconciliation.onRuntimeMutated({
        sessionId: obligation.sessionId,
        runtimeId: obligation.runtimeId,
        runtimeState,
      });
      if (result.outcome === 'reconciled') {
        this.unresolved.delete(obligation.runtimeId);
        return true;
      }
      // `not_terminal` is the overwhelmingly common answer: a challenge that is
      // simply still being played. It is not outstanding work.
      if (result.outcome !== 'not_terminal') {
        this.report(obligation, trigger, result.outcome);
      }
      return false;
    } catch (error) {
      this.report(
        obligation,
        trigger,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  }

  /**
   * Escalate an obligation that keeps failing, without ever discarding it.
   *
   * The record stays in the Match document whatever this says, so the next
   * sweep tries again. What changes is visibility: after a few passes it stops
   * being a warning and becomes an error naming everything needed to answer
   * "why is this Match still not converged?".
   */
  private report(
    obligation: PendingMatchConvergence,
    trigger: string,
    reason: string,
  ): void {
    const sweeps = (this.unresolved.get(obligation.runtimeId) ?? 0) + 1;
    this.unresolved.set(obligation.runtimeId, sweeps);
    const detail = {
      event: 'match_convergence_outstanding',
      trigger,
      matchId: obligation.matchId,
      sessionId: obligation.sessionId,
      runtimeId: obligation.runtimeId,
      reason,
      sweeps,
    };
    if (sweeps >= MatchConvergenceSweeper.REPORT_AFTER_SWEEPS) {
      this.logger.error(detail);
    } else {
      this.logger.warn(detail);
    }
  }

  /** Drop counters for obligations that are no longer outstanding. */
  private forgetSettled(pending: PendingMatchConvergence[]): void {
    const outstanding = new Set(pending.map((entry) => entry.runtimeId));
    for (const runtimeId of [...this.unresolved.keys()]) {
      if (!outstanding.has(runtimeId)) this.unresolved.delete(runtimeId);
    }
  }

  /** Obligations this process currently considers stuck, for diagnostics. */
  outstandingRuntimeIds(): string[] {
    return [...this.unresolved.keys()];
  }
}
