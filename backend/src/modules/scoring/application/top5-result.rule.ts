import { Injectable } from '@nestjs/common';
import { ScoreEventDraft } from '../domain/score-event';
import {
  SCORING_RULE_IDS,
  ScoringRuleCalculator,
} from '../domain/scoring-rule';

export interface Top5ScoreInput {
  teamIds: [string, string];
  /** Real Top 5 entries owned. Always sums to five across the two teams. */
  top5Counts: Record<string, number>;
  trapCounts: Record<string, number>;
  contentItemId: string;
  startingTeamId: string;
  ownership: unknown[];
}

/**
 * Top 5 pays the Match exactly one point.
 *
 * The 0–5 split is the *challenge's* internal result and stays as metadata; the
 * Match ledger receives a single point for the team that owned more of the five
 * real entries. Five entries between two teams cannot split evenly, so the empty
 * return is unreachable defence rather than a tie rule.
 */
@Injectable()
export class Top5ResultRule implements ScoringRuleCalculator<Top5ScoreInput> {
  readonly ruleId = SCORING_RULE_IDS.TOP5_RESULT;

  calculate(input: Top5ScoreInput): ScoreEventDraft[] {
    const [teamA, teamB] = input.teamIds;
    const scoreA = input.top5Counts[teamA] ?? 0;
    const scoreB = input.top5Counts[teamB] ?? 0;
    if (scoreA === scoreB) return [];
    return [
      {
        teamId: scoreA > scoreB ? teamA : teamB,
        delta: 1,
        reason: 'top-5.win',
        metadata: {
          top5Counts: input.top5Counts,
          trapCounts: input.trapCounts,
          startingTeamId: input.startingTeamId,
          ownership: input.ownership,
          contentItemId: input.contentItemId,
        },
      },
    ];
  }
}
