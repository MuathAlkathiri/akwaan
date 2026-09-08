import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";
import { getMediaUrl } from "@/lib/api/media-url";
import {
  ResolutionReveal,
  ResolutionAnswerRow,
  ResolutionOutcome,
} from "./resolution-reveal";

type Selection = {
  content?: string;
  media: { type: string; url: string; altText?: string };
};
type Puzzle = {
  teamId: string;
  contentItemId: string;
  instruction: string;
  selections: Array<{ selected: Selection; correct: boolean }>;
  correctSelection: Selection;
  outcome: "solved" | "unfinished";
};

function SelectionView({ selection }: { selection: Selection }) {
  const url = getMediaUrl(selection.media.url);
  return (
    <div className="space-y-2">
      {selection.content && <p>{selection.content}</p>}
      {selection.media.type === "image" && url && (
        // Canonical media URL; no new optimization or enrichment pipeline.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={selection.media.altText ?? "القطعة"}
          className="mx-auto max-h-48 max-w-full object-contain"
        />
      )}
      {selection.media.type === "audio" && url && (
        <audio controls preload="none" src={url} className="max-w-full" />
      )}
      {selection.media.type === "video" && url && (
        <video
          controls
          preload="none"
          src={url}
          className="max-h-48 max-w-full"
        />
      )}
    </div>
  );
}

export function RakkibhaResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const puzzles = Array.isArray(result.details.puzzles)
    ? (result.details.puzzles as Puzzle[])
    : [];
  return (
    <div className="space-y-4" data-testid="rakkibha-terminal-summary">
      <p className="text-center text-2xl font-black">
        {result.winnerTeamId
          ? `فوز ${teamName(snapshot, result.winnerTeamId)}`
          : "انتهى التحدي بالتعادل"}
      </p>
      {puzzles.map((puzzle) => (
        <ResolutionReveal
          key={`${puzzle.teamId}:${puzzle.contentItemId}`}
          title={`${teamName(snapshot, puzzle.teamId)} — ${puzzle.instruction}`}
        >
          <ResolutionAnswerRow label="الاختيارات المرسلة">
            {puzzle.selections.length
              ? puzzle.selections.map((entry, index) => (
                  <div key={index} className="space-y-2 pb-3">
                    <SelectionView selection={entry.selected} />
                    <ResolutionOutcome>
                      {entry.correct ? "اختيار صحيح" : "اختيار غير صحيح"}
                    </ResolutionOutcome>
                  </div>
                ))
              : "ما تم إرسال إجابة"}
          </ResolutionAnswerRow>
          <ResolutionAnswerRow label="القطعة الصحيحة">
            <SelectionView selection={puzzle.correctSelection} />
          </ResolutionAnswerRow>
          <ResolutionOutcome>
            {puzzle.outcome === "solved"
              ? "تم حل اللغز"
              : "انتهى التحدي قبل حل اللغز"}
          </ResolutionOutcome>
        </ResolutionReveal>
      ))}
    </div>
  );
}
