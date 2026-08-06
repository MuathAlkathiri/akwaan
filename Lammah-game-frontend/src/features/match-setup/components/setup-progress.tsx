"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SCOPES_PER_OCCURRENCE,
  isOccurrenceComplete,
  occurrenceLabel,
  type MatchSetupDraft,
} from "../state/match-setup-draft";

/**
 * Where the host is in the three occurrences.
 *
 * Each step is its own entry even when two occurrences share a World, because the
 * occurrences are independent — the second Anime is not a repeat of the first, it
 * is a different four Scopes and a different four board positions.
 */
export function SetupProgress({
  draft,
  onEditWorld,
}: {
  draft: MatchSetupDraft;
  onEditWorld: (occurrenceIndex: number) => void;
}) {
  const configuring = draft.activeStep === "world" || draft.activeStep === "scopes";
  return (
    <ol
      aria-label="محطات الإعداد"
      className="flex list-none flex-wrap gap-2"
      data-testid="setup-progress"
    >
      {draft.occurrences.map((occurrence) => {
        const complete = isOccurrenceComplete(occurrence);
        const active =
          configuring &&
          occurrence.occurrenceIndex === draft.activeOccurrenceIndex;
        const reachable = complete || active;
        return (
          <li key={occurrence.occurrenceIndex}>
            <button
              type="button"
              disabled={!reachable}
              aria-current={active ? "step" : undefined}
              onClick={() => onEditWorld(occurrence.occurrenceIndex)}
              className={cn(
                "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed",
                active
                  ? "border-primary/40 bg-primary/[0.08] text-primary"
                  : complete
                    ? "border-[#22C55E]/30 bg-[#22C55E]/[0.09] text-[#15803D] hover:border-[#22C55E]/50"
                    : "border-black/[0.08] bg-white text-slate-400",
              )}
            >
              {complete && <Check className="h-4 w-4" aria-hidden />}
              {occurrenceLabel(occurrence.occurrenceIndex)}
              <span className="tabular-nums opacity-70">
                {occurrence.selectedScopeIds.length}/{SCOPES_PER_OCCURRENCE}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
