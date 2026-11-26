import { BidiText } from "@/components/akwaan/bidi-text";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";
import {
  ChallengeWinnerBanner,
  ResultRoundCard,
} from "./challenge-result-banner";

interface LaTahriqhaDetails {
  mechanicTotals?: Record<string, number>;
  burns?: number;
  perfectDishes?: number;
  dishes?: Array<{
    dishName: string;
    teams?: Array<{
      teamId: string;
      points: number;
      burned: boolean;
      perfect: boolean;
    }>;
  }>;
}

/**
 * What the three dishes cost.
 *
 * One card a dish, on the same result shell as every other challenge. A burn
 * and a full dish are the two outcomes worth naming: a bare "0" and a bare "7"
 * do not say that one team was caught by a single wrong card and the other
 * reached for the fifth ingredient.
 */
export function LaTahriqhaResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = (result.details ?? {}) as LaTahriqhaDetails;
  return (
    <div className="space-y-5" data-testid="la-tahriqha-challenge-result">
      <ol className="grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {details.dishes?.map((dish, index) => (
          <ResultRoundCard
            key={`${index}:${dish.dishName}`}
            data-testid={`la-tahriqha-result-dish-${index}`}
            round={index + 1}
            snapshot={snapshot}
            question={<BidiText>{dish.dishName}</BidiText>}
            facts={(dish.teams ?? []).map((team) => ({
              label: teamName(snapshot, team.teamId),
              value: team.burned
                ? "انحرق الطبق"
                : team.perfect
                  ? "طبق كامل"
                  : "طبق سليم",
            }))}
            points={(dish.teams ?? []).map((team) => ({
              teamId: team.teamId,
              points: team.points,
            }))}
          />
        ))}
      </ol>
      <ChallengeWinnerBanner
        result={result}
        snapshot={snapshot}
        {...(details.mechanicTotals ? { totals: details.mechanicTotals } : {})}
      />
    </div>
  );
}
