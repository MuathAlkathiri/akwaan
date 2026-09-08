import {
  ResolutionAnswerRow,
  ResolutionOutcome,
  ResolutionReveal,
} from "./resolution-reveal";
import type { ComboQuestionReveal } from "../combo.presentation";

/**
 * What the الكومبو question was, before the run's consequence appears.
 *
 * The runtime has already moved on — banked, broken, or waiting on a decision —
 * and nothing here changes that. This only holds the *presentation* of what
 * follows for the shared pacing beat, so a team reads why the run continued or
 * ended before being asked to gamble again.
 */
export function ComboAnswerReveal({
  reveal,
  teamName,
  compact = false,
}: {
  reveal: ComboQuestionReveal;
  teamName: (id: string) => string;
  compact?: boolean;
}) {
  const timedOut = reveal.resolvedBy === "timeout";
  return (
    <div data-testid="combo-answer-reveal" data-correct={String(reveal.correct)}>
      <ResolutionReveal title={teamName(reveal.teamId)} compact={compact}>
        <ResolutionAnswerRow label="إجابتكم">
          {timedOut || !reveal.submittedAnswer
            ? "ما تم إرسال إجابة"
            : reveal.submittedAnswer}
        </ResolutionAnswerRow>
        <ResolutionAnswerRow label="الإجابة الصحيحة">
          {reveal.correctAnswer}
        </ResolutionAnswerRow>
        <ResolutionOutcome>
          {reveal.correct
            ? `إجابة صحيحة · +${reveal.earned}`
            : timedOut
              ? "انتهى الوقت"
              : "إجابة خاطئة"}
        </ResolutionOutcome>
      </ResolutionReveal>
    </div>
  );
}
