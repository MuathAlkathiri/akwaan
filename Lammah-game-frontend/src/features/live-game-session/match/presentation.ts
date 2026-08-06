import type { LiveSessionSnapshot } from "../model";
import type {
  MatchSlotKey,
  MatchSlotStatus,
  UnifiedUnavailableReason,
} from "./types";

export const slotLabels: Record<MatchSlotKey, string> = {
  slot_1: "الخانة 1",
  slot_2: "الخانة 2",
  slot_3: "الخانة 3",
  slot_4: "الخانة 4",
};

export const slotStatusLabels: Record<MatchSlotStatus, string> = {
  available: "متاح للاختيار",
  in_progress: "قيد اللعب",
  completed: "مكتمل",
  unavailable: "غير متاح",
};

/**
 * Why a board position cannot be played, in the server's own words.
 *
 * Never a "coming soon" placeholder: a mechanic with no launcher is not a feature
 * that is nearly finished, it is one this Match cannot start, and a broken
 * configuration is a different problem again. The `detail` line says which, for
 * the host who has to decide what to do about it.
 */
export const unavailableReasons: Record<
  UnifiedUnavailableReason,
  { label: string; detail: string }
> = {
  launcher_not_implemented: {
    label: "هذا التحدي غير متاح للعب حاليًا",
    detail: "لا يدعم الخادم تشغيل هذا النوع من التحديات.",
  },
  invalid_configuration: {
    label: "هذه الخانة غير صالحة في هذه المباراة",
    detail: "لم تُسجَّل هذه الخانة ضمن إعداد المباراة.",
  },
};

export function teamName(snapshot: LiveSessionSnapshot, teamId?: string) {
  return snapshot.teams.find((team) => team.id === teamId)?.name ?? "الفريق";
}
