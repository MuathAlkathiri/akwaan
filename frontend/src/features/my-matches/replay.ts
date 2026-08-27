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
  return {
    ...fallback,
    occurrences,
    activeOccurrenceIndex: 2,
    activeStep: "teams",
    teamNames:
      match.teams.length === 2
        ? [match.teams[0].name, match.teams[1].name]
        : fallback.teamNames,
  };
}
