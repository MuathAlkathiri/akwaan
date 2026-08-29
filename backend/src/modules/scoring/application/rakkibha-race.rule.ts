import { Injectable } from '@nestjs/common';
import { ScoreEventDraft } from '../domain/score-event';
import {
  SCORING_RULE_IDS,
  ScoringRuleCalculator,
} from '../domain/scoring-rule';

export interface RakkibhaRaceInput {
  teamIds: [string, string];
  winnerTeamId: string | null;
  tie: boolean;
  reason: 'first_finished' | 'timeout_progress' | 'timeout_time' | 'tie';
  solved: Record<string, number>;
  wrongAttempts: Record<string, number>;
  elapsedMsAtLastProgress: Record<string, number>;
  contentItemIds: string[];
}

/**
 * "ركّبها" pays exactly one Match point to the team that finished first, and
 * nothing at all on a true tie. Individual puzzles are not scored and a wrong
 * answer costs only the five-second lock, so there is no negative delta here.
 */
@Injectable()
export class RakkibhaRaceRule implements ScoringRuleCalculator<RakkibhaRaceInput> {
  readonly ruleId = SCORING_RULE_IDS.RAKKIBHA_RACE_RESULT;

  calculate(input: RakkibhaRaceInput): ScoreEventDraft[] {
    if (input.tie || !input.winnerTeamId) return [];
    if (!input.teamIds.includes(input.winnerTeamId)) return [];
    return [
      {
        teamId: input.winnerTeamId,
        delta: 1,
        reason: `rakkibha.${input.reason}`,
        metadata: {
          solved: input.solved,
          wrongAttempts: input.wrongAttempts,
          elapsedMsAtLastProgress: input.elapsedMsAtLastProgress,
          contentItemIds: input.contentItemIds,
        },
      },
    ];
  }
}
