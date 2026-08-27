import { Injectable } from '@nestjs/common';
import {
  SCORING_RULE_IDS,
  ScoringRuleCalculator,
} from '../domain/scoring-rule';
import { ScoreEventDraft } from '../domain/score-event';

export interface ManualScoreCorrectionInput {
  teamId: string;
  delta: 1 | -1;
}

/** The canonical scoring rule for operational scoreboard corrections. */
@Injectable()
export class ManualScoreCorrectionRule implements ScoringRuleCalculator<ManualScoreCorrectionInput> {
  readonly ruleId = SCORING_RULE_IDS.MANUAL_CORRECTION;

  calculate(input: ManualScoreCorrectionInput): ScoreEventDraft[] {
    return [
      {
        teamId: input.teamId,
        delta: input.delta,
        reason: 'manual-correction',
        metadata: { source: 'controller' },
      },
    ];
  }
}
