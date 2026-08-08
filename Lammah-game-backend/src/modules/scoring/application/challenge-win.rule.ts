import { Injectable } from '@nestjs/common';
import { ScoreEventDraft } from '../domain/score-event';
import {
  SCORING_RULE_IDS,
  ScoringRuleCalculator,
} from '../domain/scoring-rule';

export interface ChallengeWinInput {
  /** The winner the mechanic declared, or null when the challenge tied. */
  winnerTeamId: string | null;
  /** The Match's two teams, so a winner from another Match cannot score. */
  teamIds: readonly string[];
  /** Which mechanic produced the result, kept as provenance. */
  challengeKey: string;
  positionKey: string;
  /** The mechanic's own margin, e.g. `{ teamA: 3, teamB: 2 }`. Never scored. */
  mechanicSummary?: Record<string, unknown>;
}

/**
 * The one rule that moves the Match scoreboard.
 *
 * A Match point means "this team won a challenge". Not "this team scored more
 * inside a challenge" — a Top 5 that finishes 3–2 and an RYO that finishes with
 * three signed payoff swings both contribute the same single point, because the
 * Match is a tally of twelve challenge wins and nothing else.
 *
 * This rule deliberately does not know how any mechanic decides a winner. The
 * mechanic already answered that; all this does is record it in the one ledger
 * the Match reads. A tie mints nothing at all rather than a zero-delta event, so
 * a tied position leaves no trace in the ledger to be miscounted later.
 */
@Injectable()
export class ChallengeWinRule implements ScoringRuleCalculator<ChallengeWinInput> {
  readonly ruleId = SCORING_RULE_IDS.CHALLENGE_WIN;

  calculate(input: ChallengeWinInput): ScoreEventDraft[] {
    if (!input.winnerTeamId) return [];
    // A winner the Match is not playing is a bug upstream, not a point.
    if (!input.teamIds.includes(input.winnerTeamId)) return [];
    return [
      {
        teamId: input.winnerTeamId,
        delta: 1,
        reason: `challenge.win.${input.challengeKey}`,
        metadata: {
          challengeKey: input.challengeKey,
          positionKey: input.positionKey,
          // Carried for provenance only: it explains *why* this team won, and
          // is never summed into anything.
          ...(input.mechanicSummary
            ? { mechanicSummary: input.mechanicSummary }
            : {}),
        },
      },
    ];
  }
}
