/**
 * The pre-match setup draft.
 *
 * This is a *request being composed*, not a Match. Nothing here is authoritative:
 * the backend validates the whole configuration atomically when the host confirms,
 * and until then no session, no Match, and no gameplay state exists anywhere. That
 * is why this model is deliberately its own narrow shape rather than the Match
 * snapshot — a snapshot is something the server told us, and this is not.
 */

import { defaultTeamColorId, resolveTeamColor } from "@/lib/team-palette";

/** Roadmap 3: three World occurrences per Match. */
export const OCCURRENCE_COUNT = 3;
/** Each occurrence is played from exactly four Scopes. */
export const SCOPES_PER_OCCURRENCE = 4;
/** Three occurrences × four positions. */
export const BOARD_POSITION_COUNT = 12;

export type MatchSetupStep = "world" | "scopes" | "review" | "teams";

export interface DraftOccurrence {
  occurrenceIndex: number;
  worldId: string | null;
  /** At most {@link SCOPES_PER_OCCURRENCE}; a fifth pick is refused, not queued. */
  selectedScopeIds: string[];
}

export interface MatchSetupDraft {
  occurrences: DraftOccurrence[];
  activeOccurrenceIndex: number;
  activeStep: MatchSetupStep;
  /**
   * What each team is *called*. A team is identified by its name on every surface;
   * its colour is a separate attribute below, never its label.
   */
  teamNames: [string, string];
  /**
   * Which colour each team wears, as an id from that team's own pool
   * (`src/lib/team-palette.ts`). Position 0 draws from the cool pool and position 1
   * from the warm pool, so the two picks cannot collide however the host chooses.
   */
  teamColorIds: [string, string];
  /** Set when the backend rejected a specific occurrence. */
  issue?: { occurrenceIndex?: number; message: string; code?: string };
}

export const OCCURRENCE_LABELS = [
  "العالم الأول",
  "العالم الثاني",
  "العالم الثالث",
] as const;

export function occurrenceLabel(occurrenceIndex: number): string {
  return OCCURRENCE_LABELS[occurrenceIndex] ?? `العالم ${occurrenceIndex + 1}`;
}

export function createDraft(): MatchSetupDraft {
  return {
    occurrences: Array.from({ length: OCCURRENCE_COUNT }, (_, index) => ({
      occurrenceIndex: index,
      worldId: null,
      selectedScopeIds: [],
    })),
    activeOccurrenceIndex: 0,
    activeStep: "world",
    // Teams are named, not coloured. The old defaults were "الأخضر" and "الوردي" —
    // the two colours themselves — which made a reveal ambiguous: a green element
    // at reveal time has to mean "correct", and it cannot also mean "team one".
    // These are placeholders a host is expected to overwrite.
    teamNames: ["الفريق الأول", "الفريق الثاني"],
    teamColorIds: [defaultTeamColorId(0), defaultTeamColorId(1)],
  };
}

export type MatchSetupAction =
  | { type: "choose-world"; occurrenceIndex: number; worldId: string }
  | { type: "toggle-scope"; occurrenceIndex: number; scopeId: string }
  | { type: "clear-occurrence"; occurrenceIndex: number }
  | { type: "edit-world"; occurrenceIndex: number }
  | { type: "edit-scopes"; occurrenceIndex: number }
  | { type: "confirm-scopes" }
  | { type: "back" }
  | { type: "go-to-review" }
  | { type: "go-to-teams" }
  | { type: "set-team-name"; index: 0 | 1; name: string }
  | { type: "set-team-color"; index: 0 | 1; colorId: string }
  | { type: "report-issue"; occurrenceIndex?: number; message: string; code?: string }
  | { type: "clear-issue" }
  | { type: "restore"; draft: MatchSetupDraft }
  | { type: "reset" };

/** True once one occurrence names a World and exactly four Scopes. */
export function isOccurrenceComplete(occurrence: DraftOccurrence): boolean {
  return (
    Boolean(occurrence.worldId) &&
    occurrence.selectedScopeIds.length === SCOPES_PER_OCCURRENCE
  );
}

export function isDraftComplete(draft: MatchSetupDraft): boolean {
  return (
    draft.occurrences.length === OCCURRENCE_COUNT &&
    draft.occurrences.every(isOccurrenceComplete)
  );
}

export function completedOccurrenceCount(draft: MatchSetupDraft): number {
  return draft.occurrences.filter(isOccurrenceComplete).length;
}

export function selectedScopeTotal(draft: MatchSetupDraft): number {
  return draft.occurrences.reduce(
    (total, occurrence) => total + occurrence.selectedScopeIds.length,
    0,
  );
}

/** The first occurrence that is not finished, or undefined when all three are. */
export function firstIncompleteOccurrence(
  draft: MatchSetupDraft,
): DraftOccurrence | undefined {
  return draft.occurrences.find(
    (occurrence) => !isOccurrenceComplete(occurrence),
  );
}

/**
 * The payload the unified creation endpoint expects.
 *
 * Throws rather than sending a partial configuration: an incomplete draft is a
 * bug in the wizard's own gating, not something to let the network discover.
 */
export function toCreateUnifiedMatchRequest(draft: MatchSetupDraft): {
  occurrences: Array<{
    occurrenceIndex: number;
    worldId: string;
    selectedScopeIds: string[];
  }>;
} {
  if (!isDraftComplete(draft)) {
    throw new Error("The Match setup draft is incomplete");
  }
  return {
    occurrences: draft.occurrences.map((occurrence) => ({
      occurrenceIndex: occurrence.occurrenceIndex,
      worldId: occurrence.worldId as string,
      selectedScopeIds: [...occurrence.selectedScopeIds],
    })),
  };
}

function replaceOccurrence(
  draft: MatchSetupDraft,
  occurrenceIndex: number,
  change: (occurrence: DraftOccurrence) => DraftOccurrence,
): DraftOccurrence[] {
  return draft.occurrences.map((occurrence) =>
    occurrence.occurrenceIndex === occurrenceIndex
      ? change(occurrence)
      : occurrence,
  );
}

export function matchSetupReducer(
  draft: MatchSetupDraft,
  action: MatchSetupAction,
): MatchSetupDraft {
  switch (action.type) {
    case "choose-world": {
      const current = draft.occurrences.find(
        (occurrence) => occurrence.occurrenceIndex === action.occurrenceIndex,
      );
      // A different World means a different Scope catalogue, so the pool that
      // belonged to the old one is cleared rather than silently carried over.
      // Re-picking the same World keeps the four already chosen.
      const keepScopes = current?.worldId === action.worldId;
      return {
        ...draft,
        issue: undefined,
        occurrences: replaceOccurrence(draft, action.occurrenceIndex, (occurrence) => ({
          ...occurrence,
          worldId: action.worldId,
          selectedScopeIds: keepScopes ? occurrence.selectedScopeIds : [],
        })),
        activeOccurrenceIndex: action.occurrenceIndex,
        activeStep: "scopes",
      };
    }

    case "toggle-scope":
      return {
        ...draft,
        issue: undefined,
        occurrences: replaceOccurrence(draft, action.occurrenceIndex, (occurrence) => {
          if (occurrence.selectedScopeIds.includes(action.scopeId)) {
            return {
              ...occurrence,
              selectedScopeIds: occurrence.selectedScopeIds.filter(
                (id) => id !== action.scopeId,
              ),
            };
          }
          // The fifth pick is refused outright; one must be released first.
          if (occurrence.selectedScopeIds.length >= SCOPES_PER_OCCURRENCE) {
            return occurrence;
          }
          return {
            ...occurrence,
            selectedScopeIds: [...occurrence.selectedScopeIds, action.scopeId],
          };
        }),
      };

    case "clear-occurrence":
      return {
        ...draft,
        issue: undefined,
        occurrences: replaceOccurrence(draft, action.occurrenceIndex, (occurrence) => ({
          ...occurrence,
          worldId: null,
          selectedScopeIds: [],
        })),
        activeOccurrenceIndex: action.occurrenceIndex,
        activeStep: "world",
      };

    case "edit-world":
      return {
        ...draft,
        issue: undefined,
        activeOccurrenceIndex: action.occurrenceIndex,
        activeStep: "world",
      };

    case "edit-scopes":
      return {
        ...draft,
        issue: undefined,
        activeOccurrenceIndex: action.occurrenceIndex,
        activeStep: "scopes",
      };

    case "confirm-scopes": {
      const active = draft.occurrences.find(
        (occurrence) =>
          occurrence.occurrenceIndex === draft.activeOccurrenceIndex,
      );
      if (!active || !isOccurrenceComplete(active)) return draft;
      const next = draft.occurrences.find(
        (occurrence) =>
          occurrence.occurrenceIndex > draft.activeOccurrenceIndex &&
          !isOccurrenceComplete(occurrence),
      );
      // The remaining occurrences come first; review is only reachable once all
      // three are configured.
      const pending = next ?? firstIncompleteOccurrence(draft);
      return {
        ...draft,
        issue: undefined,
        ...(pending
          ? {
              activeOccurrenceIndex: pending.occurrenceIndex,
              activeStep: "world" as const,
            }
          : { activeStep: "review" as const }),
      };
    }

    case "back": {
      if (draft.activeStep === "teams") {
        return { ...draft, issue: undefined, activeStep: "review" };
      }
      if (draft.activeStep === "review") {
        return {
          ...draft,
          issue: undefined,
          activeOccurrenceIndex: OCCURRENCE_COUNT - 1,
          activeStep: "scopes",
        };
      }
      if (draft.activeStep === "scopes") {
        return { ...draft, issue: undefined, activeStep: "world" };
      }
      // The World step of a later occurrence goes back to the previous one.
      if (draft.activeOccurrenceIndex === 0) return draft;
      return {
        ...draft,
        issue: undefined,
        activeOccurrenceIndex: draft.activeOccurrenceIndex - 1,
        activeStep: "scopes",
      };
    }

    case "go-to-review": {
      const pending = firstIncompleteOccurrence(draft);
      if (pending) {
        return {
          ...draft,
          activeOccurrenceIndex: pending.occurrenceIndex,
          activeStep: pending.worldId ? "scopes" : "world",
        };
      }
      return { ...draft, issue: undefined, activeStep: "review" };
    }

    case "go-to-teams":
      return isDraftComplete(draft)
        ? { ...draft, issue: undefined, activeStep: "teams" }
        : draft;

    case "set-team-name": {
      const teamNames: [string, string] = [...draft.teamNames];
      teamNames[action.index] = action.name;
      return { ...draft, teamNames };
    }

    case "set-team-color": {
      // Resolved rather than stored raw: a pick from the other team's pool would
      // put both teams in one hue arc, which is the one thing the pools prevent.
      const teamColorIds: [string, string] = [...draft.teamColorIds];
      teamColorIds[action.index] = resolveTeamColor(
        action.index,
        action.colorId,
      ).id;
      return { ...draft, teamColorIds };
    }

    case "report-issue":
      return {
        ...draft,
        issue: {
          message: action.message,
          ...(action.code ? { code: action.code } : {}),
          ...(action.occurrenceIndex !== undefined
            ? { occurrenceIndex: action.occurrenceIndex }
            : {}),
        },
        // A rejected occurrence is where the host is sent back to, with every
        // other selection intact.
        ...(action.occurrenceIndex !== undefined
          ? {
              activeOccurrenceIndex: action.occurrenceIndex,
              activeStep: "scopes" as const,
            }
          : {}),
      };

    case "clear-issue":
      return { ...draft, issue: undefined };

    case "restore":
      return action.draft;

    case "reset":
      return createDraft();

    default:
      return draft;
  }
}
