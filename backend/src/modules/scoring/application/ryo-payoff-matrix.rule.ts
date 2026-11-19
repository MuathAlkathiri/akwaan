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
    // "متأكد منهم" is the confident read; "شاكك فيهم" is the doubtful one. The
    // payoff asks one question only — was the read right? — so the deciding
    // team gains a point when its read matched what the answer turned out to
    // be, and loses one when it did not. Symmetric on purpose: an option that
    // can never cost anything is not a decision, and the old matrix made the
    // doubtful read free, which put its break-even at two thirds and let a
    // counting player press it every round.
    const confident = input.decision === 'STEAL';
    const readCorrectly = confident === input.correct;
    const reason = confident
      ? input.correct
        ? 'ryo.steal.correct'
        : 'ryo.steal.failed'
      : input.correct
        ? 'ryo.trust.wrong'
        : 'ryo.trust.correct';
    const metadata = {
      answeringTeamId: input.answeringTeamId,
      opposingTeamId: input.opposingTeamId,
      contentItemId: input.contentItemId,
      itemIndex: input.itemIndex,
      selectedAnswer: input.selectedAnswer,
      correctAnswer: input.correctAnswer,
      opponentDecision: input.decision,
    };

    const events: ScoreEventDraft[] = [
      {
        teamId: input.opposingTeamId,
        delta: readCorrectly ? 1 : -1,
        reason,
        metadata,
      },
    ];

    // Doubted and right anyway: the answering team takes a point for it. Without
    // this the answering team has no stake in its own answer at all, and its
    // best play becomes answering wrong on purpose.
    if (!confident && input.correct) {
      events.push({
        teamId: input.answeringTeamId,
        delta: 1,
        reason: 'ryo.trust.vindicated',
        metadata,
      });
    }

    return events;
  }
}
