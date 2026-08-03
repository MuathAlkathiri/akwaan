import { Injectable } from '@nestjs/common';
import { ScoreEventDraft } from '../domain/score-event';
import {
  SCORING_RULE_IDS,
  ScoringRuleCalculator,
} from '../domain/scoring-rule';

export type RyoDecision = 'STEAL' | 'TRUST';

export interface RyoPayoffInput {
  answeringTeamId: string;
  opposingTeamId: string;
  contentItemId: string;
  itemIndex: number;
  selectedAnswer: string | number | null;
  correctAnswer: string | number;
  decision: RyoDecision;
  correct: boolean;
}

@Injectable()
export class RyoPayoffMatrixRule implements ScoringRuleCalculator<RyoPayoffInput> {
  readonly ruleId = SCORING_RULE_IDS.RYO_PAYOFF_MATRIX;

  calculate(input: RyoPayoffInput): ScoreEventDraft[] {
    const trust = input.decision === 'TRUST';
    const teamId =
      trust && input.correct ? input.answeringTeamId : input.opposingTeamId;
    const delta = input.decision === 'STEAL' && !input.correct ? -1 : 1;
    const reason = trust
      ? input.correct
        ? 'ryo.trust.correct'
        : 'ryo.trust.wrong'
      : input.correct
        ? 'ryo.steal.correct'
        : 'ryo.steal.failed';

    return [
      {
        teamId,
        delta,
        reason,
        metadata: {
          answeringTeamId: input.answeringTeamId,
          opposingTeamId: input.opposingTeamId,
          contentItemId: input.contentItemId,
          itemIndex: input.itemIndex,
          selectedAnswer: input.selectedAnswer,
          correctAnswer: input.correctAnswer,
          opponentDecision: input.decision,
        },
      },
    ];
  }
}
