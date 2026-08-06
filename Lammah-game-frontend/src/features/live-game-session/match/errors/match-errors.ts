import axios from "axios";

/**
 * Server refusals, in Arabic.
 *
 * Every entry answers one server code, and the four kinds of refusal a host can
 * hit are kept apart on purpose: a mechanic with no launcher, a Scope pool with
 * nothing playable left in it, phones that are not in the room, and a position
 * that is simply not this team's to choose are different problems with different
 * fixes. Collapsing them into one "still being prepared" message is what made an
 * implemented mechanic look unfinished.
 */
const messages: Record<string, string> = {
  // Concurrency and authority.
  MATCH_STALE_REVISION: "تغيّرت المباراة على جهاز آخر. جارٍ جلب أحدث حالة.",
  STALE_REVISION: "الحالة المعروضة قديمة. جارٍ مزامنتها الآن.",
  CONCURRENT_UPDATE: "وصل تحديث أحدث للمباراة. حاول مجددًا بعد المزامنة.",
  MATCH_FORBIDDEN: "هذا الإجراء متاح لمتحكّم المباراة فقط.",
  SESSION_FORBIDDEN: "لا تملك صلاحية التحكّم في هذه الجلسة.",
  MATCH_NOT_FOUND: "لم تُنشأ مباراة لهذه الجلسة بعد.",
  MATCH_ALREADY_ACTIVE: "توجد مباراة نشطة لهذه الجلسة بالفعل.",
  MATCH_CANCELLED: "أُلغيت هذه المباراة.",
  SESSION_NOT_ACTIVE: "ابدأ الجلسة أولًا، ثم أنشئ المباراة.",
  MATCH_STAGE_INVALID: "هذا الإجراء غير متاح في المرحلة الحالية.",

  // The mechanic itself cannot be launched.
  CHALLENGE_NOT_LAUNCHABLE: "هذا التحدي غير متاح للعب حاليًا.",
  CHALLENGE_LAUNCHER_NOT_FOUND: "هذا التحدي غير متاح للعب حاليًا.",
  CHALLENGE_LAUNCHER_UNAVAILABLE: "مشغّل هذا التحدي غير متاح حاليًا.",

  // The board position.
  BOARD_SLOT_NOT_AVAILABLE:
    "لا يمكن اختيار هذه الخانة الآن؛ ربما اكتملت أو بدأ تحدٍ آخر.",
  BOARD_SLOT_NOT_SCHEDULED: "هذه الخانة ليست ضمن لوحة هذه المباراة.",
  MATCH_SLOT_ALREADY_COMPLETED: "اكتمل هذا التحدي من قبل.",
  MATCH_CHALLENGE_ALREADY_ACTIVE: "يوجد تحدٍ قيد اللعب الآن.",
  MATCH_OCCURRENCE_NOT_FOUND: "لا توجد محطة عوالم بهذا الرقم في المباراة.",
  MATCH_WRONG_SELECTION_TURN: "ليس دور هذا الفريق في اختيار التحدي.",
  MATCH_SELECTION_TURN_INVALID: "الاختيار لا يطابق دور الفريق الحالي.",

  // Preparation and preflight.
  MATCH_NO_PENDING_CHALLENGE: "لا توجد خانة مُجهّزة للتشغيل.",
  MATCH_PENDING_CHALLENGE_MISMATCH:
    "الخانة المُجهّزة تغيّرت. ارجع إلى اللوحة واختر من جديد.",
  MATCH_REQUIRES_TWO_TEAMS: "تحتاج المباراة فريقين نشطين.",
  TEAM_NEEDS_MORE_PLAYERS: "أحد الفريقين يحتاج لاعبين إضافيين متصلين.",
  TEAM_HAS_TOO_MANY_PLAYERS: "أحد الفريقين لديه لاعبون متصلون أكثر من اللازم.",

  // Content: the mechanic works, its Scope pool does not have enough for it.
  MATCH_INSUFFICIENT_PLAYABLE_CONTENT:
    "لا يوجد محتوى كافٍ ومتوافق في نطاقات هذه المحطة لتشغيل هذا التحدي.",
  SCOPE_SELECTION_INCOMPLETE: "لم تكتمل نطاقات هذه المحطة الأربعة.",
  SCOPE_NOT_FOUND: "أحد نطاقات هذه المحطة لم يعد موجودًا.",
  SCOPE_NOT_IN_OCCURRENCE_WORLD: "أحد النطاقات لا ينتمي إلى عالم هذه المحطة.",
  SCOPE_NOT_ACTIVE: "أحد نطاقات هذه المحطة غير مفعّل.",
  SCOPE_HAS_NO_READY_CONTENT: "أحد نطاقات هذه المحطة لا يحتوي محتوى جاهزًا.",
  SCOPE_HAS_NO_USABLE_SLOT:
    "أحد نطاقات هذه المحطة لا يناسب أي تحدٍ في لوحة العالم.",
  CONTENT_ITEM_ALREADY_PLAYED: "لُعب هذا المحتوى في هذه المحطة من قبل.",
  CONTENT_ITEM_NOT_READY: "المحتوى المتاح لهذا التحدي ليس جاهزًا للعب.",
  CONTENT_ITEM_INCOMPATIBLE: "المحتوى المتاح لا يناسب آلية هذا التحدي.",

  // Mechanic-specific startup refusals.
  RYO_REQUIRES_THREE_ITEMS: "تحدي اقرأ خصمك يحتاج 3 عناصر محتوى مختلفة بالضبط.",
  TOP10_REQUIRES_ONE_ITEM: "تحدي أفضل 10 يحتاج عنصر محتوى واحدًا بالضبط.",
  DISTRIBUTED_REQUIRES_THREE_ITEMS:
    "تحدي ركّبها يحتاج 3 عناصر محتوى مختلفة بالضبط.",
  TOP10_VARIANT_INVALID: "عنصر أفضل 10 المختار ليس من نسخة خذها أو دسّها.",
  RYO_STARTING_TEAM_INVALID: "الفريق المحدد للبدء غير مشارك في المباراة.",
  TOP10_STARTING_TEAM_INVALID: "الفريق المحدد للبدء غير مشارك في المباراة.",
  RYO_RUNTIME_NOT_CREATED: "تعذر بدء اقرأ خصمك. لم يُنشئ الخادم حالة اللعب.",
  TOP10_RUNTIME_NOT_CREATED: "تعذر بدء أفضل 10. لم يُنشئ الخادم حالة اللعب.",

  // Transport.
  GAMEPLAY_RUNTIME_NOT_FOUND: "جارٍ استعادة التحدي الحالي من الخادم.",
  CONNECTION_ERROR: "تعذر الاتصال بالمباراة. سنواصل المحاولة تلقائيًا.",
  LOAD_FAILED: "تعذر تحميل حالة المباراة.",
};

export interface LocalizedMatchError {
  code: string;
  message: string;
  rawMessage?: string;
}

export function localizeMatchError(error: unknown): LocalizedMatchError {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { code?: string; message?: string | string[]; error?: string }
      | undefined;
    const code = data?.code ?? (error.code || "NETWORK_ERROR");
    const raw = Array.isArray(data?.message)
      ? data.message.join("، ")
      : data?.message || data?.error || error.message;
    return {
      code,
      message:
        messages[code] ??
        (error.response
          ? "تعذر تنفيذ الإجراء. تحقق من الحالة وحاول مجددًا."
          : "انقطع الاتصال بالخادم. تحقق من الشبكة وحاول مجددًا."),
      rawMessage: raw,
    };
  }
  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      message: "حدث خطأ غير متوقع. حاول مزامنة المباراة ثم أعد المحاولة.",
      rawMessage: error.message,
    };
  }
  return {
    code: "UNKNOWN_ERROR",
    message: "حدث خطأ غير متوقع. حاول مجددًا.",
  };
}

export function matchErrorMessage(code?: string): string | undefined {
  return code ? messages[code] : undefined;
}
