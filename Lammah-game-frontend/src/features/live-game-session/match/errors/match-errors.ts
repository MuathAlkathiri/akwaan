import axios from "axios";

const messages: Record<string, string> = {
  MATCH_STALE_REVISION: "تغيّرت المباراة على جهاز آخر. جارٍ جلب أحدث حالة.",
  STALE_REVISION: "الحالة المعروضة قديمة. جارٍ مزامنتها الآن.",
  CONCURRENT_UPDATE: "وصل تحديث أحدث للمباراة. حاول مجددًا بعد المزامنة.",
  MATCH_FORBIDDEN: "هذا الإجراء متاح لمتحكّم المباراة فقط.",
  SESSION_FORBIDDEN: "لا تملك صلاحية التحكّم في هذه الجلسة.",
  MATCH_NOT_FOUND: "لم تُنشأ مباراة لهذه الجلسة بعد.",
  MATCH_ALREADY_ACTIVE: "توجد مباراة نشطة لهذه الجلسة بالفعل.",
  SESSION_NOT_ACTIVE: "ابدأ الجلسة أولًا، ثم أنشئ المباراة.",
  MATCH_STAGE_INVALID: "هذا الإجراء غير متاح في المرحلة الحالية.",
  MATCH_WRONG_SELECTION_TURN: "ليس دور هذا الفريق في اختيار العالم.",
  MATCH_SELECTION_TURN_INVALID: "اختيار العالم لا يطابق الدور الحالي.",
  WORLD_SELECTION_OUT_OF_TURN: "ليس دور هذا الفريق في اختيار العالم.",
  WORLD_SELECTION_METHOD_INVALID: "طريقة الاختيار لا تناسب هذه المحطة.",
  THIRD_WORLD_METHOD_INVALID: "العالم الثالث يُحسم باتفاق الفريقين أو باختيار الخادم.",
  MATCH_WORLD_NOT_ACTIVE: "هذا العالم غير نشط ولا يمكن اختياره الآن.",
  MATCH_WORLD_BOARD_NOT_READY: "لوحة هذا العالم غير جاهزة للعب بعد.",
  MATCH_WORLD_NOT_FOUND: "تعذر العثور على العالم المختار.",
  MATCH_WORLD_REQUIRED: "اختر عالمًا أو استخدم الاختيار العشوائي.",
  MATCH_NO_SELECTABLE_WORLD: "لا توجد عوالم جاهزة للاختيار حاليًا.",
  MATCH_WORLDS_ALREADY_SELECTED: "اكتمل اختيار العوالم الثلاثة بالفعل.",
  CHALLENGE_NOT_LAUNCHABLE: "هذا التحدي غير متاح للعب حاليًا.",
  BOARD_SLOT_NOT_AVAILABLE: "لا يمكن تشغيل هذه الخانة الآن؛ ربما اكتملت أو بدأ تحدٍ آخر.",
  BOARD_SLOT_NOT_SCHEDULED: "هذا التحدي ليس ضمن لوحة العالم الحالية.",
  MATCH_SLOT_ALREADY_COMPLETED: "اكتمل هذا التحدي من قبل.",
  MATCH_CHALLENGE_ALREADY_ACTIVE: "يوجد تحدٍ قيد اللعب الآن.",
  CHALLENGE_LAUNCHER_NOT_FOUND: "هذا النوع من التحديات قيد التجهيز.",
  CHALLENGE_LAUNCHER_UNAVAILABLE: "مشغّل هذا التحدي غير متاح حاليًا.",
  INVALID_CONTENT_ITEM_COUNT: "عدد عناصر المحتوى لا يطابق متطلبات التحدي.",
  RYO_CONTENT_COUNT_INVALID: "تحدي اقرأ خصمك يحتاج 3 عناصر محتوى بالضبط.",
  TOP10_CONTENT_COUNT_INVALID: "تحدي أفضل 10 يحتاج عنصر محتوى واحدًا بالضبط.",
  RYO_REQUIRES_THREE_ITEMS: "تحدي اقرأ خصمك يحتاج 3 عناصر محتوى مختلفة بالضبط.",
  TOP10_REQUIRES_ONE_ITEM: "تحدي أفضل 10 يحتاج عنصر محتوى واحدًا بالضبط.",
  RYO_CONTENT_INVALID: "اختر 3 عناصر جاهزة ومتوافقة من العالم الحالي.",
  TOP10_CONTENT_INVALID: "اختر عنصر أفضل 10 جاهزًا ومتوافقًا من العالم الحالي.",
  RYO_SLOT_NOT_CONFIGURED: "خانة اقرأ خصمك غير مضبوطة في هذا العالم.",
  RYO_SLOT_INVALID: "هذه الخانة ليست تحدي اقرأ خصمك المعتمد.",
  RYO_STARTING_TEAM_INVALID: "الفريق المحدد للبدء غير مشارك في المباراة.",
  TOP10_STARTING_TEAM_INVALID: "الفريق المحدد للبدء غير مشارك في المباراة.",
  RYO_LAUNCH_FORBIDDEN: "تشغيل اقرأ خصمك متاح للمتحكّم فقط.",
  TOP10_LAUNCH_FORBIDDEN: "تشغيل أفضل 10 متاح للمتحكّم فقط.",
  INVALID_TOP10_VARIANT: "عنصر أفضل 10 المختار ليس من نسخة خذها أو دسّها.",
  TOP10_VARIANT_INVALID: "عنصر أفضل 10 المختار ليس من نسخة خذها أو دسّها.",
  TOP10_LAUNCH_TARGET_REQUIRED: "لم يرتبط التحدي بإعداد أفضل 10 صالح.",
  TOP10_MECHANIC_INCOMPATIBLE: "إعداد أفضل 10 غير متوافق مع المحتوى المختار.",
  RYO_RUNTIME_NOT_CREATED: "تعذر بدء اقرأ خصمك. لم يُنشئ الخادم حالة اللعب.",
  TOP10_RUNTIME_NOT_CREATED: "تعذر بدء أفضل 10. لم يُنشئ الخادم حالة اللعب.",
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
