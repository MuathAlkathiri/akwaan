import type { LiveSessionSnapshot } from "../model";
import type {
  MatchSlotKey,
  MatchWorldSelectionMethod,
  UnifiedUnavailableReason,
} from "./types";

export const slotLabels: Record<MatchSlotKey, string> = {
  slot_1: "الخانة 1",
  slot_2: "الخانة 2",
  slot_3: "الخانة 3",
  slot_4: "الخانة 4",
};

export const launchabilityLabels = {
  launchable: "جاهز للعب",
  configured_but_unimplemented: "قريبًا",
  unavailable: "غير متاح",
} as const;

export const slotStatusLabels = {
  available: "بانتظار اللعب",
  in_progress: "قيد اللعب",
  completed: "مكتمل",
  unavailable: "غير متاح",
} as const;

/**
 * Why a board position cannot be played, in the server's own words.
 *
 * A precise reason always beats "قريبًا": a mechanic that is not built yet and a
 * Match whose configuration is broken are different problems for whoever has to
 * fix them.
 */
export const unavailableReasons: Record<UnifiedUnavailableReason, string> = {
  launcher_not_implemented: "هذا النوع من التحديات قيد التجهيز.",
  invalid_configuration: "إعداد هذه الخانة غير صالح في هذه المباراة.",
};

export const selectionMethodLabels: Record<
  MatchWorldSelectionMethod,
  string
> = {
  team_pick: "اختيار فريق",
  agreed: "باتفاق الفريقين",
  random: "اختيار النظام",
  preconfigured: "مُجهَّز قبل المباراة",
};

export function teamName(snapshot: LiveSessionSnapshot, teamId?: string) {
  return snapshot.teams.find((team) => team.id === teamId)?.name ?? "الفريق";
}

export function shortWorldName(_worldId: string, occurrenceIndex: number) {
  return `العالم ${occurrenceIndex + 1}`;
}

export function contentCardinality(challengeKey?: string) {
  if (challengeKey === "read-your-opponent") return 3;
  if (challengeKey === "top-10") return 1;
  return undefined;
}
