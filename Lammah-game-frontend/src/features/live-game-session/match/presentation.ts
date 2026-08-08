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
  // "The server does not support running this type of challenge" is true and
  // useless: a host cannot act on it, and it names our internals in a room full
  // of players. Not placeholder language either — a mechanic is playable or it is
  // not, and this one is not.
  launcher_not_implemented: {
    label: "غير متاح",
    detail: "هذا التحدي غير مفعّل في أكوان.",
  },
  invalid_configuration: {
    label: "غير مُعدّ",
    detail: "هذه الخانة ليست ضمن إعداد هذه المباراة.",
  },
};

export function teamName(snapshot: LiveSessionSnapshot, teamId?: string) {
  return snapshot.teams.find((team) => team.id === teamId)?.name ?? "الفريق";
}
