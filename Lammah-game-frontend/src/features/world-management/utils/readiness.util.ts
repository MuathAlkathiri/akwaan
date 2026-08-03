import type { ContentReadiness, WorldContentIssue } from "../types";

export const READINESS_LABEL: Record<ContentReadiness, string> = {
  ready: "جاهز",
  limited: "يحتاج مراجعة",
  not_ready: "غير جاهز",
};

export const READINESS_TONE: Record<
  ContentReadiness,
  "success" | "warning" | "danger"
> = {
  ready: "success",
  limited: "warning",
  not_ready: "danger",
};

export function getReadinessLabel(readiness: ContentReadiness = "not_ready") {
  return READINESS_LABEL[readiness];
}

export function getReadinessTone(readiness: ContentReadiness = "not_ready") {
  return READINESS_TONE[readiness];
}

/**
 * The backend returns every failing rule in `issues`, so the admin can see all
 * of them at once instead of fixing one per save.
 */
export function extractIssues(error: unknown): WorldContentIssue[] {
  const payload = (
    error as { response?: { data?: { issues?: unknown } } } | undefined
  )?.response?.data?.issues;
  if (!Array.isArray(payload)) return [];
  return payload.filter(
    (issue): issue is WorldContentIssue =>
      typeof issue === "object" &&
      issue !== null &&
      typeof (issue as WorldContentIssue).message === "string",
  );
}

export function describeIssues(issues: WorldContentIssue[]): string[] {
  return issues.map(localizeReadinessIssue);
}

const ISSUE_COPY: Record<string, string> = {
  BOARD_SLOT_COUNT_MISMATCH: "أكمل تحديات اللوحة الأربعة.",
  BOARD_SLOT_TYPE_COUNT_MISMATCH: "أضف التحدي الناقص إلى مكانه في اللوحة.",
  SIGNATURE_MECHANIC_NOT_SET: "اختر تحديًا خاصًا يميّز هذا العالم.",
  SIGNATURE_MECHANIC_MISMATCH:
    "اجعل التحدي الخاص مطابقًا للتحدي المختار للعالم.",
  SLOT_FAMILY_MISMATCH: "اختر تحديًا مناسبًا لهذا المكان في اللوحة.",
  DUPLICATE_BOARD_SLOT: "يوجد تحديان في المكان نفسه؛ احتفظ بواحد منهما.",
  CONFIGURED_CHALLENGE_TYPE_MISSING:
    "أعد اختيار التحدي لأن التحدي المرتبط لم يعد متاحًا.",
  WORLD_WITHOUT_ACTIVE_SCOPE: "أضف نطاقًا واحدًا على الأقل واجعله نشطًا.",
  CHALLENGE_WITHOUT_READY_CONTENT: "أضف محتوى جاهزًا لهذا التحدي.",
  SCOPE_EXCLUSIONS_BELOW_BOARD_MINIMUM:
    "راجع استثناءات النطاق حتى يمكنه استخدام تحديات اللوحة.",
  CONTENT_WITHOUT_COMPATIBLE_CHALLENGE_TYPE: "اربط عنصر المحتوى بتحدٍ مناسب.",
  ANSWER_PAYLOAD_INCOMPATIBLE_WITH_CHALLENGE: "اختر طريقة إجابة مناسبة للتحدي.",
  CONTENT_MEDIA_ASSETS_REQUIRED: "أضف ملف الوسائط أو اختر محتوى نصيًا فقط.",
  CONTENT_MEDIA_ASSET_URL_REQUIRED: "أعد رفع ملف الوسائط المطلوب.",
  CONTENT_PROMPT_REQUIRED: "اكتب نص المحتوى باللغة العربية.",
  CORRECT_OPTION_REQUIRED: "حدد الإجابة الصحيحة.",
  CORRECT_OPTION_NOT_IN_OPTIONS: "اختر الإجابة الصحيحة من الخيارات الموجودة.",
  NUMERIC_ANSWER_REQUIRED: "أدخل إجابة رقمية صحيحة.",
  ANSWER_OPTIONS_REQUIRED: "أضف خيارات الإجابة المطلوبة.",
};

export function localizeReadinessIssue(issue: WorldContentIssue): string {
  return ISSUE_COPY[issue.code] ?? "راجع هذا القسم وأكمل المعلومات المطلوبة.";
}
