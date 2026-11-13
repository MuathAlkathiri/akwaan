import { createDraft, type MatchSetupDraft } from "@/features/match-setup";
import type { MyMatchSummary } from "./types";

/** Creates setup intent only. No Match/runtime state is copied. */
export function createReplayDraft(match: MyMatchSummary): MatchSetupDraft {
  const fallback = createDraft();
  const occurrences = [...match.occurrences]
    .sort((left, right) => left.occurrenceIndex - right.occurrenceIndex)
    .map((occurrence, index) => ({
      occurrenceIndex: index,
      worldId: occurrence.worldId,
      selectedScopeIds: [...occurrence.selectedScopeIds],
    }));
  if (
    occurrences.length !== 3 ||
    occurrences.some(
      (occurrence) =>
        !occurrence.worldId || occurrence.selectedScopeIds.length !== 4,
    )
  ) {
    throw new Error("This Match setup cannot be replayed");
  }
  // Replaying lands on the last occurrence's Scopes: everything is already
  // chosen, so one confirm re-creates the Match and opens the room. The teams
  // are not carried over because they are no longer something a Match stores a
  // choice about.
  return {
    ...fallback,
    occurrences,
    activeOccurrenceIndex: 2,
    activeStep: "scopes",
  };
}
