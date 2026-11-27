import { BidiText } from "@/components/akwaan/bidi-text";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";
import {
  ChallengeWinnerBanner,
  ResultRoundCard,
} from "./challenge-result-banner";

interface FirstNoteDetails {
  mechanicTotals?: Record<string, number>;
  items?: Array<{
    title: string;
    finalBidSeconds: number;
    winnerTeamId: string | null;
    stolen: boolean;
  }>;
}

/** «ثانية», «ثانيتين», «3 ثواني», «11 ثانية». */
const secondsLabel = (seconds: number) =>
  seconds === 1
    ? "ثانية"
    : seconds === 2
      ? "ثانيتين"
      : seconds >= 3 && seconds <= 10
        ? `${seconds} ثواني`
        : `${seconds} ثانية`;

/**
 * What the three songs went for.
 *
 * One card a song, on the same result shell as every other challenge: how low
 * the bidding went, and who named it — the bidder, or the other team stealing
 * it after a miss.
 */
export function FirstNoteResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = (result.details ?? {}) as FirstNoteDetails;
  return (
    <div className="space-y-5" data-testid="first-note-challenge-result">
      <ol className="grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {details.items?.map((item, index) => (
          <ResultRoundCard
            key={`${index}:${item.title}`}
            data-testid={`first-note-result-item-${index}`}
            round={index + 1}
            snapshot={snapshot}
            question={<BidiText>{item.title}</BidiText>}
            facts={[
              {
                label: "أقل مزايدة",
                value: secondsLabel(item.finalBidSeconds),
              },
              {
                label: item.stolen ? "اللي سرقها" : "اللي عرفها",
                value: item.winnerTeamId
                  ? teamName(snapshot, item.winnerTeamId)
                  : "ما أحد عرفها",
              },
            ]}
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
