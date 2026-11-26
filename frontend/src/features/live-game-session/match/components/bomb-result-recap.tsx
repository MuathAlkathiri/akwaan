import { BidiText } from "@/components/akwaan/bidi-text";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";
import {
  ChallengeWinnerBanner,
  ResultRoundCard,
} from "./challenge-result-banner";

type Item = {
  teamId: string | null;
  prompt: string;
  submittedAnswer: string | null;
  correctAnswer: string;
  outcome: "correct" | "skipped" | "timeout";
};

/**
 * The Bomb's recap: one card for every question the bomb stopped on, then who
 * took the challenge.
 *
 * Only a right answer is stamped. Skipping and running out of time are not
 * wrong answers, so they are said in a neutral pill and never in red.
 */
export function BombResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const items = Array.isArray(result.details.items)
    ? (result.details.items as Item[])
    : [];
  return (
    <div className="space-y-5" data-testid="bomb-terminal-summary">
      <ol className="grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <ResultRoundCard
            key={index}
            data-testid={`bomb-result-item-${index}`}
            round={index + 1}
            snapshot={snapshot}
            question={<BidiText>{item.prompt}</BidiText>}
            {...(item.outcome === "correct"
              ? { stamp: { label: "إجابة صحيحة", tone: "correct" as const } }
              : {})}
            facts={[
              {
                label: `إجابة ${teamName(snapshot, item.teamId ?? undefined)}`,
                value: item.submittedAnswer ? (
                  <BidiText>{item.submittedAnswer}</BidiText>
                ) : (
                  "ما تم إرسال إجابة"
                ),
              },
              {
                label: "الإجابة الصحيحة",
                value: <BidiText>{item.correctAnswer}</BidiText>,
              },
            ]}
          >
            {item.outcome !== "correct" && (
              <p className="rounded-full border-2 border-dashed border-brand-dash bg-white px-3 py-1.5 text-center text-[15px] font-bold text-brand-plum">
                {item.outcome === "skipped" ? "تم التخطي" : "انتهى الوقت"}
              </p>
            )}
          </ResultRoundCard>
        ))}
      </ol>
      <ChallengeWinnerBanner result={result} snapshot={snapshot} />
    </div>
  );
}
