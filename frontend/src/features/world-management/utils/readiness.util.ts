import type {
  ContentReadiness,
  ReadinessReport,
  WorldContentIssue,
} from "../types";

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
  BOARD_SLOT_EMPTY: "اختر مكانيكا للخانة الفارغة.",
  INVALID_BOARD_SLOT_KEY: "اختر واحدة من خانات اللوحة الأربع.",
  DUPLICATE_BOARD_SLOT: "يوجد تحديان في المكان نفسه؛ احتفظ بواحد منهما.",
  DUPLICATE_BOARD_CHALLENGE_TYPE:
    "اختر مكانيكا مختلفة؛ لا يمكن تكرار التحدي داخل العالم نفسه.",
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
  // Challenge-type readiness. These used to fall through to the generic line,
  // which told an admin nothing about what to do.
  SCORING_RULE_AWAITING_MECHANIC:
    "قاعدة الاحتساب معرّفة لكن لم تُبرمج بعد، فالتحدي غير قابل للعب حتى تُنجَز مكانيكاه.",
  SCORING_RULE_NOT_REGISTERED: "اختر قاعدة احتساب معروفة للنظام.",
  SCORING_RULE_REQUIRED: "اختر قاعدة احتساب لهذا التحدي.",
  INVALID_CHALLENGE_FAMILY: "اختر عائلة تحدٍ مدعومة.",
  INVALID_ANSWER_MODE: "اختر طريقة إجابة مدعومة لهذه العائلة.",
  ANSWER_MODE_NOT_ALLOWED_FOR_FAMILY:
    "طريقة الإجابة غير مسموحة لعائلة هذا التحدي.",
  INVALID_ITEM_STRUCTURE: "اختر بنية عناصر مدعومة.",
  CHALLENGE_TYPE_NOT_ACTIVE: "فعّل هذه المكانيكا قبل استخدامها في لوحة عالم.",
  CHALLENGE_PRESENTATION_INVALID: "أكمل إعدادات العرض والتوقيت.",
  CHALLENGE_TIMER_REQUIRED: "حدّد مدة المؤقّت لهذا التحدي.",
  CHALLENGE_INPUT_TYPE_REQUIRED: "حدّد طريقة الإدخال على هاتف اللاعب.",
  MATCH_WITHOUT_RELATIONAL_CHALLENGE:
    "مباراة النشر تحتاج تحدياً علائقياً واحداً على الأقل بين عوالمها.",
  RAKKIBHA_INSTRUCTION_REQUIRED: "اكتب تعليمات ركّبها المحايدة.",
  RAKKIBHA_CANDIDATE_VIEWS_REQUIRED: "أضف حاملَي قطع على الأقل.",
  RAKKIBHA_CANDIDATE_COUNT_INVALID: "كل حامل يحتاج قطعتين أو ثلاثاً.",
  RAKKIBHA_LOCAL_IDS_INVALID: "معرفات القطع المحلية يجب أن تكون فريدة.",
  RAKKIBHA_CANONICAL_IDENTITY_REQUIRED: "كل قطعة تحتاج هوية داخلية.",
  RAKKIBHA_TRUE_CANDIDATE_INVALID: "يجب أن توجد قطعة صحيحة واحدة فقط.",
  RAKKIBHA_TEAM_SIZES_INVALID: "أحجام الفرق المدعومة هي لاعبان أو ثلاثة.",
  RAKKIBHA_SAFETY_CONFIRMATION_REQUIRED: "أكّد مراجعة فصل المرجع عن القطعة الصحيحة.",
};

export type ReadinessCheckState = "ok" | "warning" | "blocker";

export interface ReadinessCheck {
  code: string;
  state: ReadinessCheckState;
  text: string;
}

/**
 * A readiness report as a checklist.
 *
 * A blocker stops activation, a warning permits it but must be seen, and when
 * neither exists the single satisfied line says so — so an admin always reads
 * *what* to do rather than "review this section".
 */
export function toReadinessChecklist(
  report: ReadinessReport | undefined,
  satisfiedText = "كل المتطلبات مكتملة.",
): ReadinessCheck[] {
  const blockers = (report?.blockers ?? []).map((issue) => ({
    code: issue.code,
    state: "blocker" as const,
    text: localizeReadinessIssue(issue),
  }));
  const warnings = (report?.warnings ?? []).map((issue) => ({
    code: issue.code,
    state: "warning" as const,
    text: localizeReadinessIssue(issue),
  }));
  if (blockers.length || warnings.length) return [...blockers, ...warnings];
  return [{ code: "READY", state: "ok", text: satisfiedText }];
}

export function localizeReadinessIssue(issue: WorldContentIssue): string {
  return ISSUE_COPY[issue.code] ?? "راجع هذا القسم وأكمل المعلومات المطلوبة.";
}

export interface BlockingReference {
  source: string;
  id: string;
  label: string;
  status?: string;
}

const REFERENCE_SOURCE_LABEL: Record<string, string> = {
  "legacy-questions": "أسئلة قديمة",
};

/** The records a refused delete named, if the server could name them. */
export function extractBlockingReferences(error: unknown): BlockingReference[] {
  const payload = (
    error as { response?: { data?: { references?: unknown } } } | undefined
  )?.response?.data?.references;
  if (!Array.isArray(payload)) return [];
  return payload.filter(
    (reference): reference is BlockingReference =>
      typeof reference === "object" &&
      reference !== null &&
      typeof (reference as BlockingReference).id === "string",
  );
}

/**
 * Says what blocks the delete and where it lives, so an admin can go and fix it
 * instead of reading that "1 record" exists somewhere.
 */
export function describeBlockingReferences(
  references: BlockingReference[],
): string {
  if (!references.length) return "";
  const named = references
    .slice(0, 3)
    .map((reference) => {
      const where =
        REFERENCE_SOURCE_LABEL[reference.source] ?? reference.source;
      const status = reference.status ? ` — ${reference.status}` : "";
      return `${where}: ${reference.label} (${reference.id}${status})`;
    })
    .join("، ");
  const rest =
    references.length > 3 ? ` و${references.length - 3} سجلات أخرى` : "";
  return `${named}${rest}`;
}
