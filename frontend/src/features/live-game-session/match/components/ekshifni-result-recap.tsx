import { BidiText } from "@/components/akwaan/bidi-text";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";
import {
  ChallengeWinnerBanner,
  ResultRoundCard,
} from "./challenge-result-banner";

interface EkshifniDetails {
  mechanicTotals?: Record<string, number>;
  items?: Array<{
    identity: string;
    winnerTeamId: string | null;
    value: number;
    revealedRegionIds?: string[];
    resolvedBy?: "answer" | "timeout";
  }>;
}

/** «ولا منطقة», «منطقة وحدة», «منطقتين», «3 مناطق». */
const regionsLabel = (count: number) =>
  count === 0
    ? "ولا منطقة"
    : count === 1
      ? "منطقة وحدة"
      : count === 2
        ? "منطقتين"
        : `${count} مناطق`;

/**
 * What the three pictures cost.
 *
 * One card a picture, on the same result shell as every other challenge: who
 * got it and how many windows were open by then, which is the whole story of
 * the mechanic. A picture nobody solved carries no point, because a timeout
 * rewards no one.
 */
export function EkshifniResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = (result.details ?? {}) as EkshifniDetails;
  return (
    <div className="space-y-5" data-testid="ekshifni-challenge-result">
      <ol className="grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {details.items?.map((item, index) => (
          <ResultRoundCard
            key={`${index}:${item.identity}`}
            data-testid={`ekshifni-result-item-${index}`}
            round={index + 1}
            snapshot={snapshot}
            question={<BidiText>{item.identity}</BidiText>}
            facts={[
              {
                label: "اللي عرفه",
                value: item.winnerTeamId
                  ? teamName(snapshot, item.winnerTeamId)
                  : "ما أحد عرفه",
              },
              {
                label: "انكشف قبلها",
                value: regionsLabel(item.revealedRegionIds?.length ?? 0),
              },
            ]}
            points={
              item.winnerTeamId
                ? [{ teamId: item.winnerTeamId, points: item.value }]
                : []
            }
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
