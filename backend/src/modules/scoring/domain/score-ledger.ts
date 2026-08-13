import {
  clampScoreForDisplay,
  isScoreEvent,
  restoreScoreEvent,
  ScoreEvent,
} from './score-event';
import { ForeignScoreEventError } from './scoring.errors';

/**
 * The signed event history for one match. Totals are derived, never stored, so
 * there is no second place a score can be mutated (roadmap 0.3, 8).
 */
export class ScoreLedger {
  private readonly events: ScoreEvent[] = [];

  /**
   * Rebuilds a ledger from persisted events. Used when a Match reloads, and when
   * it imports the events a finished gameplay runtime already minted.
   */
  static restore(persisted: readonly unknown[]): ScoreLedger {
    const ledger = new ScoreLedger();
    ledger.record(...persisted.map(restoreScoreEvent));
    return ledger;
  }

  /** True when this event id is already in the ledger. */
  has(eventId: string): boolean {
    return this.events.some((event) => event.id === eventId);
  }

  /** Events produced by one gameplay runtime, the Match correlation key. */
  historyForChallengeSession(
    challengeSessionId: string,
  ): readonly ScoreEvent[] {
    return this.events.filter(
      (event) => event.challengeSessionId === challengeSessionId,
    );
  }

  record(...events: ScoreEvent[]): void {
    for (const event of events) {
      if (!isScoreEvent(event)) throw new ForeignScoreEventError();
      this.events.push(event);
    }
  }

  /** Full unclamped history, oldest first. */
  history(): readonly ScoreEvent[] {
    return [...this.events];
  }

  historyForTeam(teamId: string): readonly ScoreEvent[] {
    return this.events.filter((event) => event.teamId === teamId);
  }

  /** True signed total, which may be negative. */
  signedTotal(teamId: string): number {
    return this.events
      .filter((event) => event.teamId === teamId)
      .reduce((total, event) => total + event.delta, 0);
  }

  /** Total for display only. Never written back to the ledger. */
  displayTotal(teamId: string): number {
    return clampScoreForDisplay(this.signedTotal(teamId));
  }

  teamIds(): string[] {
    return [...new Set(this.events.map((event) => event.teamId))];
  }
}
