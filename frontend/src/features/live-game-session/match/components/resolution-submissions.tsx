import { ResolutionAnswerRow } from "./resolution-reveal";

/** Answers are projected by the mechanic only once all legal attempts close. */
export function ResolutionSubmissions({
  answers,
  teamName,
}: {
  answers?: Record<string, string | null>;
  teamName: (id: string) => string;
}) {
  if (!answers) return null;
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {Object.entries(answers).map(([id, answer]) => (
        <ResolutionAnswerRow key={id} label={`إجابة ${teamName(id)}`}>
          {answer ?? "ما تم إرسال إجابة"}
        </ResolutionAnswerRow>
      ))}
    </div>
  );
}
