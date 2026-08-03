import { Injectable } from '@nestjs/common';
import { ScoreEventDraft } from '../domain/score-event';
import {
  SCORING_RULE_IDS,
  ScoringRuleCalculator,
} from '../domain/scoring-rule';

export interface Top10PoisonDeckScoreInput {
  teamIds: [string, string];
  internalScores: Record<string, number>;
  validCards: Record<string, number>;
  decoys: Record<string, number>;
  contentItemId: string;
  startingTeamId: string;
  assignments: unknown[];
  metrics: Record<string, Record<string, number>>;
}

@Injectable()
export class Top10PoisonDeckResultRule implements ScoringRuleCalculator<Top10PoisonDeckScoreInput> {
  readonly ruleId = SCORING_RULE_IDS.TOP10_POISON_DECK_RESULT;

  calculate(input: Top10PoisonDeckScoreInput): ScoreEventDraft[] {
    const [teamA, teamB] = input.teamIds;
    const scoreA = input.internalScores[teamA] ?? 0;
    const scoreB = input.internalScores[teamB] ?? 0;
    if (scoreA === scoreB) return [];
    const winner = scoreA > scoreB ? teamA : teamB;
    return [
      {
        teamId: winner,
        delta: 1,
        reason: 'top10.poison-deck.win',
        metadata: {
          internalScores: input.internalScores,
          validCards: input.validCards,
          decoys: input.decoys,
          metrics: input.metrics,
          startingTeamId: input.startingTeamId,
          assignmentHistory: input.assignments,
          contentItemId: input.contentItemId,
        },
      },
    ];
  }
}
