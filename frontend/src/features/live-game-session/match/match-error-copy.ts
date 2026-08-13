import type { LiveSessionError } from "../model";
import { matchErrorMessage } from "./errors/match-errors";

/**
 * A failure, framed for a room rather than for a log.
 *
 * The Arabic sentence itself already exists — `matchErrorMessage` answers every
 * server code the product can raise — so this adds only what a full-screen
 * recovery needs and a toast does not: a headline readable across a room, and
 * whether retrying in place could plausibly work.
 *
 * What it never does is render `error.message`. The server writes that for
 * whoever is reading the logs: it is English, it quotes ids, and it names
 * internals. The code is kept on the element as a data attribute so support can
 * still find out what happened without it being part of the game.
 */

export interface MatchErrorCopy {
  title: string;
  body: string;
  /** Whether resyncing in place could plausibly fix it. */
  retryable: boolean;
}

/**
 * Headline *and* sentence per family.
 *
 * Both together, because deriving only the headline here and the sentence from
 * the command dictionary produced screens that argued with themselves — "we could
 * not find this Match" over "an unexpected error occurred".
 */
const FAMILIES: Array<[RegExp, { title: string; body: string }]> = [
  [
    /NOT_FOUND$/,
    {
      title: "لم نجد هذه المباراة",
      body: "الرابط قد يكون قديمًا، أو انتهت الجلسة. ارجع للرئيسية وابدأ مباراة جديدة.",
    },
  ],
  [
    /^(SESSION_NOT_ACTIVE|MATCH_CANCELLED)$/,
    {
      title: "انتهت هذه المباراة",
      body: "أُغلقت هذه الجلسة. ابدأ مباراة جديدة متى ما كنتم جاهزين.",
    },
  ],
  [
    /FORBIDDEN$|UNAUTHORIZED/,
    {
      title: "هذه الصفحة ليست لك",
      body: "متحكّم المباراة وحده من يفتح هذه الشاشة.",
    },
  ],
  [
    /^(CONNECTION_ERROR|NETWORK_ERROR)$/,
    {
      title: "الاتصال متوقف",
      body: "تحقّق من الشبكة — سنحاول الاستعادة تلقائيًا.",
    },
  ],
  [
    /STALE|CONCURRENT/,
    {
      title: "وصلنا تحديث أحدث",
      body: "تغيّرت المباراة قبل وصول أمرك. حدّثنا الشاشة، ثم أعد المحاولة.",
    },
  ],
  [
    /^LOAD_FAILED$/,
    {
      title: "تعذّر تحميل المباراة",
      body: "لم نستطع جلب حالة المباراة. جرّب إعادة المحاولة.",
    },
  ],
];

/** Codes where retrying the same request just fails again. */
const TERMINAL = /NOT_FOUND$|FORBIDDEN$|UNAUTHORIZED|CANCELLED|NOT_ACTIVE/;

export function matchErrorCopy(error?: LiveSessionError): MatchErrorCopy {
  const code = error?.code ?? "UNKNOWN_ERROR";
  const family = FAMILIES.find(([pattern]) => pattern.test(code))?.[1];
  return {
    title: family?.title ?? "تعذّر عرض المباراة",
    // An exact dictionary entry is the most specific sentence there is; the
    // family's own is the fallback, and only then the generic.
    body:
      matchErrorMessage(code) ??
      family?.body ??
      "حدث خلل غير متوقع. جرّب إعادة المحاولة، وإن استمر الأمر ابدأ مباراة جديدة.",
    retryable: !TERMINAL.test(code),
  };
}
