import {
  ResolutionAnswerRow,
  ResolutionOutcome,
  ResolutionReveal,
} from "./resolution-reveal";
import type { MarhalaTurn } from "../marhala.presentation";

/**
 * What the answer was, held for a beat before the board moves.
 *
 * Every field here is written by the server onto a turn that has already
 * resolved — this renders that record and computes nothing. A wrong or
 * timed-out turn moves no token at all, so without this beat it would resolve
 * with nothing on screen to explain it.
 */
export function MarhalaAnswerReveal({
  turn,
  teamName,
  compact = false,
}: {
  turn: MarhalaTurn;
  teamName: (id: string) => string;
  compact?: boolean;
}) {
  const timedOut = turn.resolvedBy === "timeout";
  return (
    <div data-testid="marhala-answer-reveal" data-correct={String(turn.correct)}>
      <ResolutionReveal title={teamName(turn.teamId)} compact={compact}>
        <ResolutionAnswerRow label="إجابتكم">
          {/* Never invented: a timeout submitted nothing, and says so. */}
          {timedOut || !turn.submittedAnswer
            ? "ما تم إرسال إجابة"
            : turn.submittedAnswer}
        </ResolutionAnswerRow>
        {turn.correctAnswer && (
          <ResolutionAnswerRow label="الإجابة الصحيحة">
            {turn.correctAnswer}
          </ResolutionAnswerRow>
        )}
        <ResolutionOutcome>
          {turn.correct ? "إجابة صحيحة" : timedOut ? "انتهى الوقت" : "إجابة خاطئة"}
        </ResolutionOutcome>
      </ResolutionReveal>
    </div>
  );
}
