import { Injectable } from '@nestjs/common';
import { ScoreEventDraft } from '../domain/score-event';
import {
  ScoringRuleCalculator,
  SCORING_RULE_IDS,
  ScoringRuleId,
} from '../domain/scoring-rule';
import { ScoringRuleRegistry } from './scoring-rule.registry';

/** Roadmap 8: +1 for clearing all items of an eligible challenge. */
export const PERFECT_CLEAR_BONUS_POINTS = 1;

export interface PerfectClearBonusInput {
  teamId: string;
  /** The rule that scored the challenge itself; decides eligibility. */
  challengeScoringRuleId: ScoringRuleId;
  clearedItemCount: number;
  totalItemCount: number;
}

/**
 * Cross-family bonus, not a mechanic. Its behaviour is fully specified by the
 * roadmap, so it ships now and gives the registry a real calculator: RYO opts
 * out through its declaration rather than through a special case here.
 */
@Injectable()
export class PerfectClearBonusRule implements ScoringRuleCalculator<PerfectClearBonusInput> {
  readonly ruleId = SCORING_RULE_IDS.CHALLENGE_PERFECT_CLEAR_BONUS;

  constructor(private readonly registry: ScoringRuleRegistry) {}

  // The context carries match identity, which the engine stamps onto the event;
  // this rule only needs the challenge outcome.
  calculate(input: PerfectClearBonusInput): ScoreEventDraft[] {
    const challengeRule = this.registry.declaration(
      input.challengeScoringRuleId,
    );
    if (!challengeRule.perfectClearBonusEligible) return [];
    if (input.totalItemCount <= 0) return [];
    if (input.clearedItemCount < input.totalItemCount) return [];
    return [
      {
        teamId: input.teamId,
        delta: PERFECT_CLEAR_BONUS_POINTS,
        reason: 'perfect-clear',
        metadata: {
          challengeScoringRuleId: input.challengeScoringRuleId,
          clearedItemCount: input.clearedItemCount,
          totalItemCount: input.totalItemCount,
        },
      },
    ];
  }
}
