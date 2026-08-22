import axios from "axios";
import { occurrenceLabel } from "../state/match-setup-draft";

/**
 * The one place a backend setup rejection becomes Arabic the host can act on.
 *
 * Every message names what to change, and where possible the wizard is sent back
 * to the occurrence the server actually rejected — never to the start, and never
 * discarding the other two.
 */

/** Whether a code is about one occurrence's configuration or the Match as a whole. */
type Scope = "occurrence" | "match";

interface SetupIssue {
  message: string;
  scope: Scope;
}

const ISSUES: Record<string, SetupIssue> = {
  // The structural contract.
  UNIFIED_OCCURRENCE_COUNT_INVALID: {
    message: "المباراة تحتاج ثلاثة عوالم بالضبط.",
    scope: "match",
  },
  UNIFIED_OCCURRENCE_INDEX_INVALID: {
    message: "ترتيب العوالم غير صحيح. أعد ضبط الإعداد.",
    scope: "match",
  },
  UNIFIED_OCCURRENCE_INDEX_DUPLICATED: {
    message: "تكرّر ترتيب أحد العوالم. أعد ضبط الإعداد.",
    scope: "match",
  },
  UNIFIED_OCCURRENCE_WORLD_REQUIRED: {
    message: "اختار عالم لهذه المحطة.",
    scope: "occurrence",
  },
  UNIFIED_WORLD_REPEATED: {
    message: "ما تقدر تكرّر نفس العالم في هذه المباراة. اختار عالم ثاني.",
    scope: "occurrence",
  },
  SCOPE_SELECTION_COUNT_INVALID: {
    message: "اختار 4 نطاقات بالضبط لهذا العالم.",
    scope: "occurrence",
  },
  SCOPE_SELECTION_DUPLICATED: {
    message: "ما تقدر تختار نفس النطاق مرتين لهذا العالم.",
    scope: "occurrence",
  },

  // World Content facts, per occurrence.
  MATCH_WORLD_NOT_FOUND: {
    message: "هذا العالم ما عاد موجود. اختار عالم ثاني لهذه المحطة.",
    scope: "occurrence",
  },
  MATCH_WORLD_NOT_ACTIVE: {
    message: "هذا العالم ما عاد متاح. اختار عالم ثاني لهذه المحطة.",
    scope: "occurrence",
  },
  MATCH_WORLD_BOARD_NOT_READY: {
    message: "لوحة هذا العالم مو مكتملة. اختار عالم ثاني لهذه المحطة.",
    scope: "occurrence",
  },
  SCOPE_NOT_FOUND: {
    message: "أحد النطاقات المختارة ما عاد موجود. اختار بديل.",
    scope: "occurrence",
  },
  SCOPE_NOT_IN_OCCURRENCE_WORLD: {
    message: "أحد النطاقات مو تابع لهذا العالم. أعد اختيار نطاقات هذا العالم.",
    scope: "occurrence",
  },
  SCOPE_NOT_ACTIVE: {
    message: "أحد النطاقات ما عاد متاح. اختار بديل.",
    scope: "occurrence",
  },
  SCOPE_HAS_NO_READY_CONTENT: {
    message: "أحد النطاقات ما فيه محتوى جاهز. اختار بديل.",
    scope: "occurrence",
  },
  SCOPE_HAS_NO_USABLE_SLOT: {
    message: "أحد النطاقات ما يصلح لأي تحدي في هذا العالم. اختار بديل.",
    scope: "occurrence",
  },
  SCOPE_NOT_SELECTABLE: {
    message: "أحد النطاقات مو متاح للاختيار. اختار بديل.",
    scope: "occurrence",
  },
  UNIFIED_BOARD_SLOT_COUNT_INVALID: {
    message: "لوحة هذا العالم مو مكتملة. اختار عالم ثاني لهذه المحطة.",
    scope: "occurrence",
  },
  UNIFIED_BOARD_SLOT_MISSING: {
    message: "لوحة هذا العالم ناقصة تحدي. اختار عالم ثاني لهذه المحطة.",
    scope: "occurrence",
  },

  // The Match and its session.
  MATCH_ALREADY_IN_PROGRESS: {
    message: "فيه مباراة قائمة لهذه الجلسة أصلاً.",
    scope: "match",
  },
  MATCH_REQUIRES_TWO_TEAMS: {
    message: "المباراة تحتاج فريقين نشطين بالضبط.",
    scope: "match",
  },
  MATCH_FORBIDDEN: {
    message: "إنشاء المباراة للمتحكّم بس.",
    scope: "match",
  },
  SESSION_FORBIDDEN: {
    message: "ما عندك صلاحية تحكّم بهذه الجلسة.",
    scope: "match",
  },
  SESSION_NOT_ACTIVE: {
    message: "ما قدرنا نجهّز الجلسة قبل إنشاء المباراة. جرّب مرة ثانية.",
    scope: "match",
  },
  SESSION_NOT_READY: {
    message: "ما قدرنا نجهّز الجلسة. تأكد من وجود فريقين وجرّب مرة ثانية.",
    scope: "match",
  },
  STALE_REVISION: {
    message: "تغيّرت الجلسة أثناء التجهيز. جرّب مرة ثانية.",
    scope: "match",
  },
  MATCH_STALE_REVISION: {
    message: "تغيّرت المباراة أثناء التجهيز. جرّب مرة ثانية.",
    scope: "match",
  },
};

const NETWORK_MESSAGE =
  "انقطع الاتصال. إعدادك محفوظ — تأكد من الشبكة وجرّب مرة ثانية.";
const UNKNOWN_MESSAGE = "ما ضبط إنشاء المباراة. تأكد من اختياراتك وجرّب مرة ثانية.";

export interface MatchSetupError {
  code: string;
  /** Arabic, and always about what to do next. */
  message: string;
  /** The occurrence to send the host back to, when the server named one. */
  occurrenceIndex?: number;
  /** True when nothing was created and the draft is worth keeping as-is. */
  retryable: boolean;
}

/**
 * Reads a rejection.
 *
 * The backend names the occurrence in its message (`occurrence 2`), and that is
 * what routes the host back to the right step. When it names none, the error is
 * shown against the Match as a whole rather than blamed on an arbitrary World.
 */
export function toMatchSetupError(
  error: unknown,
  fallbackOccurrenceIndex?: number,
): MatchSetupError {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { code?: string; message?: string | string[] }
      | undefined;
    const code = data?.code ?? error.code ?? "NETWORK_ERROR";
    const raw = Array.isArray(data?.message)
      ? data.message.join("، ")
      : (data?.message ?? "");
    const issue = ISSUES[code];
    const occurrenceIndex =
      readOccurrenceIndex(raw) ??
      (issue?.scope === "occurrence" ? fallbackOccurrenceIndex : undefined);
    return {
      code,
      message: issue
        ? withOccurrence(issue.message, occurrenceIndex)
        : error.response
          ? UNKNOWN_MESSAGE
          : NETWORK_MESSAGE,
      ...(occurrenceIndex !== undefined ? { occurrenceIndex } : {}),
      // Nothing partial is ever created, so every failure here is safe to retry.
      retryable: true,
    };
  }
  return { code: "UNKNOWN_ERROR", message: UNKNOWN_MESSAGE, retryable: true };
}

/** The backend states the index in prose; this is the only place that is read. */
function readOccurrenceIndex(message: string): number | undefined {
  const match = /occurrence (\d+)/i.exec(message);
  if (!match) return undefined;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 && index <= 2 ? index : undefined;
}

function withOccurrence(message: string, occurrenceIndex?: number): string {
  return occurrenceIndex === undefined
    ? message
    : `${occurrenceLabel(occurrenceIndex)}: ${message}`;
}
