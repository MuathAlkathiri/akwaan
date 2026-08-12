import { resolveTeamColor } from "@/lib/team-palette";
import {
  OCCURRENCE_COUNT,
  SCOPES_PER_OCCURRENCE,
  createDraft,
  type MatchSetupDraft,
  type MatchSetupStep,
} from "./match-setup-draft";

/**
 * Refresh recovery for a half-made setup.
 *
 * `sessionStorage`, never `localStorage`: a draft is worth surviving an accidental
 * refresh of the tab it was being typed into, and worth nothing after that. It is
 * never Match authority — no draft is ever restored *as* a Match, and it is
 * discarded the moment a real Match exists.
 *
 * The record is versioned, so a draft written by an older shape is thrown away
 * instead of being coerced into the current one.
 */
const STORAGE_KEY = "akwaan:match-setup-draft";
const STORAGE_VERSION = 1;

interface StoredDraft {
  version: number;
  draft: MatchSetupDraft;
}

const STEPS: readonly MatchSetupStep[] = ["world", "scopes", "review", "teams"];

function isStep(value: unknown): value is MatchSetupStep {
  return typeof value === "string" && STEPS.includes(value as MatchSetupStep);
}

/**
 * Accepts only a record this version wrote and this version can still trust.
 * Anything else — a missing version, a wrong occurrence count, an over-full
 * pool, a step that no longer exists — is treated as absent.
 */
function parseDraft(value: unknown): MatchSetupDraft | undefined {
  if (!value || typeof value !== "object") return undefined;
  const stored = value as Partial<StoredDraft>;
  if (stored.version !== STORAGE_VERSION) return undefined;
  const draft = stored.draft as Partial<MatchSetupDraft> | undefined;
  if (!draft || !Array.isArray(draft.occurrences)) return undefined;
  if (draft.occurrences.length !== OCCURRENCE_COUNT) return undefined;
  if (!isStep(draft.activeStep)) return undefined;
  if (
    typeof draft.activeOccurrenceIndex !== "number" ||
    draft.activeOccurrenceIndex < 0 ||
    draft.activeOccurrenceIndex >= OCCURRENCE_COUNT
  ) {
    return undefined;
  }
  const occurrences = draft.occurrences.map((occurrence, index) => {
    const candidate = occurrence as Partial<MatchSetupDraft["occurrences"][number]>;
    const scopeIds = Array.isArray(candidate.selectedScopeIds)
      ? candidate.selectedScopeIds.filter(
          (scopeId): scopeId is string => typeof scopeId === "string",
        )
      : [];
    return {
      occurrenceIndex: index,
      worldId: typeof candidate.worldId === "string" ? candidate.worldId : null,
      selectedScopeIds: [...new Set(scopeIds)].slice(0, SCOPES_PER_OCCURRENCE),
    };
  });
  const teamNames = Array.isArray(draft.teamNames)
    ? draft.teamNames.filter(
        (name): name is string => typeof name === "string",
      )
    : [];
  const colorIds = Array.isArray(draft.teamColorIds)
    ? draft.teamColorIds.filter(
        (colorId): colorId is string => typeof colorId === "string",
      )
    : [];
  const fallback = createDraft();
  return {
    occurrences,
    activeOccurrenceIndex: draft.activeOccurrenceIndex,
    activeStep: draft.activeStep,
    teamNames:
      teamNames.length === 2
        ? [teamNames[0], teamNames[1]]
        : fallback.teamNames,
    // Resolved against each team's own pool, so a stored id from an older palette
    // becomes that position's default instead of a colour it may no longer own.
    teamColorIds:
      colorIds.length === 2
        ? [
            resolveTeamColor(0, colorIds[0]).id,
            resolveTeamColor(1, colorIds[1]).id,
          ]
        : fallback.teamColorIds,
  };
}

export function readStoredDraft(): MatchSetupDraft | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = parseDraft(JSON.parse(raw));
    // A stored draft that no longer parses is removed rather than left to fail
    // again on the next load.
    if (!parsed) window.sessionStorage.removeItem(STORAGE_KEY);
    return parsed;
  } catch {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // A storage-denied browser simply has no recovery; setup still works.
    }
    return undefined;
  }
}

export function writeStoredDraft(draft: MatchSetupDraft): void {
  if (typeof window === "undefined") return;
  try {
    const record: StoredDraft = {
      version: STORAGE_VERSION,
      // The issue is a reaction to one failed submission and must not outlive it.
      draft: { ...draft, issue: undefined },
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage is a convenience here, never a requirement.
  }
}

export function clearStoredDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export const MATCH_SETUP_DRAFT_STORAGE_KEY = STORAGE_KEY;
export const MATCH_SETUP_DRAFT_VERSION = STORAGE_VERSION;
