import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  mintScoreEvent,
  restoreScoreEvent,
  ScoreEvent,
  ScoreEventDraft,
} from '../domain/score-event';
import { ScoreLedger } from '../domain/score-ledger';
import { ScoringContext } from '../domain/scoring-rule';
import { ScoringRuleContractError } from '../domain/scoring.errors';
import { ScoringRuleRegistry } from './scoring-rule.registry';

/**
 * The only place a ScoreEvent comes into existence (roadmap 0.3, 8). Mechanics
 * hand this service their outcome facts and receive signed events; they never
 * touch a team total.
 */
@Injectable()
export class ScoringService {
  constructor(private readonly registry: ScoringRuleRegistry) {}

  /**
   * Restores events a mechanic already minted and persisted in its runtime state.
   *
   * This is how a Match imports scoring without recalculating it: the mechanic
   * owns the rule, the scoring module owns the events, and the Match only ever
   * reads signed deltas. Malformed entries are rejected rather than dropped.
   */
  restoreEvents(persisted: readonly unknown[]): ScoreEvent[] {
    return persisted.map(restoreScoreEvent);
  }

  /** Rebuilds a ledger from persisted events, preserving signed history. */
  restoreLedger(persisted: readonly unknown[]): ScoreLedger {
    return ScoreLedger.restore(persisted);
  }

  score<TInput>(
    ruleId: string,
    input: TInput,
    context: ScoringContext,
  ): ScoreEvent[] {
    const declaration = this.registry.declaration(ruleId);
    const calculator = this.registry.calculator<TInput>(ruleId);
    const drafts = calculator.calculate(input, context);
    return drafts.map((draft) => {
      this.assertDraft(ruleId, draft, declaration.allowsNegativeDelta);
      return mintScoreEvent(draft, {
        id: randomUUID(),
        matchId: context.matchId,
        challengeSessionId: context.challengeSessionId,
        scoringRuleId: ruleId,
        createdAt: context.occurredAt,
      });
    });
  }

  private assertDraft(
    ruleId: string,
    draft: ScoreEventDraft,
    allowsNegativeDelta: boolean,
  ): void {
    if (!draft.teamId) {
      throw new ScoringRuleContractError(ruleId, 'a draft is missing a team');
    }
    if (!Number.isInteger(draft.delta)) {
      throw new ScoringRuleContractError(
        ruleId,
        'deltas must be whole point values',
      );
    }
    if (draft.delta < 0 && !allowsNegativeDelta) {
      throw new ScoringRuleContractError(
        ruleId,
        'the rule declared that it never emits a negative delta',
      );
    }
    if (!draft.reason) {
      throw new ScoringRuleContractError(ruleId, 'a draft is missing a reason');
    }
  }
}
