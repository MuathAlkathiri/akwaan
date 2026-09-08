import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";
import {
  ResolutionReveal,
  ResolutionAnswerRow,
  ResolutionOutcome,
} from "./resolution-reveal";

type Item = {
  teamId: string | null;
  prompt: string;
  submittedAnswer: string | null;
  correctAnswer: string;
  outcome: "correct" | "skipped" | "timeout";
};

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
    <div className="space-y-4" data-testid="bomb-terminal-summary">
      <p className="text-center text-2xl font-black">
        {result.winnerTeamId
          ? `فوز ${teamName(snapshot, result.winnerTeamId)}`
          : "انتهى التحدي دون فائز"}
      </p>
      {items.map((item, index) => (
        <ResolutionReveal key={index} title={`${index + 1}. ${item.prompt}`}>
          <p className="font-bold">
            {teamName(snapshot, item.teamId ?? undefined)}
          </p>
          <ResolutionAnswerRow label="الإجابة المرسلة">
            {item.submittedAnswer ?? "ما تم إرسال إجابة"}
          </ResolutionAnswerRow>
          <ResolutionAnswerRow label="الإجابة الصحيحة">
            {item.correctAnswer}
          </ResolutionAnswerRow>
          <ResolutionOutcome>
            {item.outcome === "correct"
              ? "إجابة صحيحة"
              : item.outcome === "skipped"
                ? "تم التخطي"
                : "انتهى الوقت"}
          </ResolutionOutcome>
        </ResolutionReveal>
      ))}
    </div>
  );
}
