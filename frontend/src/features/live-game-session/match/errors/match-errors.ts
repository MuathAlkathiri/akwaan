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
  MATCH_STALE_REVISION: "تغيّرت المباراة من جهاز ثاني. نجيب آخر حالة الحين.",
  STALE_REVISION: "اللي بالشاشة قديم. نحدّثه الحين.",
  CONCURRENT_UPDATE: "وصل تحديث أحدث للمباراة. جرّب مرة ثانية بعد التحديث.",
  MATCH_FORBIDDEN: "هذا الإجراء للمتحكّم بس.",
  SESSION_FORBIDDEN: "ما عندك صلاحية تحكّم بهذه الجلسة.",
  MATCH_NOT_FOUND: "ما فيه مباراة لهذه الجلسة بعد.",
  MATCH_ALREADY_ACTIVE: "فيه مباراة شغّالة لهذه الجلسة أصلاً.",
  MATCH_CANCELLED: "هذه المباراة انلغت.",
  SESSION_NOT_ACTIVE: "ابدأ الجلسة الأول، بعدها أنشئ المباراة.",
  MATCH_STAGE_INVALID: "هذا الإجراء مو متاح في هالمرحلة.",

  // The mechanic itself cannot be launched.
  CHALLENGE_NOT_LAUNCHABLE: "هذا التحدي غير متاح للعب حاليًا.",
  CHALLENGE_LAUNCHER_NOT_FOUND: "هذا التحدي غير متاح للعب حاليًا.",
  CHALLENGE_LAUNCHER_UNAVAILABLE: "مشغّل هذا التحدي مو متاح الحين.",

  // The board position.
  BOARD_SLOT_NOT_AVAILABLE:
    "ما تقدرون تختارون هذه الخانة الحين؛ يمكن خلصت أو بدأ تحدي ثاني.",
  BOARD_SLOT_NOT_SCHEDULED: "هذه الخانة مو ضمن لوحة هذه المباراة.",
  MATCH_SLOT_ALREADY_COMPLETED: "هذا التحدي خلص من قبل.",
  MATCH_CHALLENGE_ALREADY_ACTIVE: "فيه تحدي شغّال الحين.",
  MATCH_OCCURRENCE_NOT_FOUND: "ما فيه محطة عوالم بهذا الرقم في المباراة.",
  MATCH_WRONG_SELECTION_TURN: "مو دور هذا الفريق يختار التحدي.",
  MATCH_SELECTION_TURN_INVALID: "الاختيار ما يطابق دور الفريق الحالي.",

  // Preparation and preflight.
  MATCH_NO_PENDING_CHALLENGE: "ما فيه خانة مجهّزة للتشغيل.",
  MATCH_PENDING_CHALLENGE_MISMATCH:
    "الخانة المجهّزة تغيّرت. ارجع للوحة واختار من جديد.",
  MATCH_REQUIRES_TWO_TEAMS: "المباراة تحتاج فريقين نشطين.",
  TEAM_NEEDS_MORE_PLAYERS: "أحد الفريقين يحتاج لاعبين متصلين زيادة.",
  TEAM_HAS_TOO_MANY_PLAYERS: "أحد الفريقين عنده لاعبين متصلين أكثر من اللازم.",

  // Content: the mechanic works, its Scope pool does not have enough for it.
  MATCH_INSUFFICIENT_PLAYABLE_CONTENT:
    "ما فيه محتوى كافي ومتوافق في نطاقات هذه المحطة لتشغيل هذا التحدي.",
  SCOPE_SELECTION_INCOMPLETE: "نطاقات هذه المحطة الأربعة ما كملت.",
  SCOPE_NOT_FOUND: "أحد نطاقات هذه المحطة ما عاد موجود.",
  SCOPE_NOT_IN_OCCURRENCE_WORLD: "أحد النطاقات مو تابع لعالم هذه المحطة.",
  SCOPE_NOT_ACTIVE: "أحد نطاقات هذه المحطة مو مفعّل.",
  SCOPE_HAS_NO_READY_CONTENT: "أحد نطاقات هذه المحطة ما فيه محتوى جاهز.",
  SCOPE_HAS_NO_USABLE_SLOT:
    "أحد نطاقات هذه المحطة ما يناسب أي تحدي في لوحة العالم.",
  CONTENT_ITEM_ALREADY_PLAYED: "هذا المحتوى انلعب في هذه المحطة من قبل.",
  CONTENT_ITEM_NOT_READY: "محتوى هذا التحدي مو جاهز للعب.",
  CONTENT_ITEM_INCOMPATIBLE: "المحتوى المتاح ما يناسب آلية هذا التحدي.",

  // Mechanic-specific startup refusals.
  RYO_REQUIRES_THREE_ITEMS: "تحدي اقرأ خصمك يحتاج 3 عناصر محتوى مختلفة بالضبط.",
  TOP5_REQUIRES_ONE_ITEM: "تحدي أفضل 5 يحتاج عنصر محتوى واحدًا بالضبط.",
  RAKKIBHA_REQUIRES_THREE_ITEMS:
    "تحدي ركّبها يحتاج 3 عناصر محتوى مختلفة بالضبط.",
  TOP5_VARIANT_INVALID: "عنصر المحتوى المختار غير مُعد لتحدي أفضل 5.",
  RYO_STARTING_TEAM_INVALID: "الفريق المحدد للبدء مو مشارك في المباراة.",
  TOP5_STARTING_TEAM_INVALID: "الفريق المحدد للبدء مو مشارك في المباراة.",
  RYO_RUNTIME_NOT_CREATED: "ما ضبط بدء اقرأ خصمك. جرّبوا مرة ثانية.",
  TOP5_RUNTIME_NOT_CREATED: "ما ضبط بدء أفضل 5. جرّبوا مرة ثانية.",
  TOP5_CONTENT_INVALID: "ما فيه محتوى أفضل 5 جاهز لهذه الخانة.",
  TOP5_MECHANIC_INCOMPATIBLE:
    "إعداد أفضل 5 في هذا العالم لا يناسب المحتوى المتاح.",
  // Server-side team-action authority. A hidden button is never the boundary.
  TEAM_ACTION_WRONG_PARTICIPANT: "القرار في هذه الجولة للاعب ثاني من فريقك.",
  TEAM_ACTION_WRONG_TEAM: "هذا القرار للفريق الثاني.",
  TEAM_ACTION_STALE_ASSIGNMENT:
    "تغيّر صاحب القرار قبل ما يوصل اختيارك. حدّث الشاشة وجرّب مرة ثانية.",
  TEAM_ACTION_NOT_ASSIGNED: "ما فيه قرار مفتوح لهذا التحدي الحين.",
  RYO_NOT_ASSIGNED_PARTICIPANT:
    "لاعب ثاني من فريقك هو المسؤول عن هذا الإجراء في هذه الفقرة.",

  // Transport.
  GAMEPLAY_RUNTIME_NOT_FOUND: "جارٍ استعادة التحدي الحالي.",
  CONNECTION_ERROR: "ما قدرنا نتصل بالمباراة. بنواصل المحاولة تلقائياً.",
  LOAD_FAILED: "ما قدرنا نحمّل حالة المباراة.",
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
          ? "ما ضبط. تأكد من الحالة وجرّب مرة ثانية."
          : "انقطع الاتصال. تأكدوا من الشبكة وجرّبوا مرة ثانية."),
      rawMessage: raw,
    };
  }
  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      message: "صار خطأ غير متوقع. حدّث المباراة وجرّب مرة ثانية.",
      rawMessage: error.message,
    };
  }
  return {
    code: "UNKNOWN_ERROR",
    message: "صار خطأ غير متوقع. جرّب مرة ثانية.",
  };
}

export function matchErrorMessage(code?: string): string | undefined {
  return code ? messages[code] : undefined;
}
