import type { World, WorldChallengeSlotKey, WorldContentIssue } from "../types";

export type ReadinessSection = "board" | "content" | "scopes" | "challenges";

export interface ReadinessChecklistItem {
  id: string;
  section: ReadinessSection;
  complete: boolean;
  title: string;
  explanation: string;
  actionLabel?: string;
  actionTarget?: "board" | "content" | "scopes" | "mechanics";
}

const SLOT_GUIDANCE: Record<
  WorldChallengeSlotKey,
  Omit<ReadinessChecklistItem, "complete" | "section">
> = {
  signature: {
    id: "signature",
    title: "التحدي الخاص بالعالم",
    explanation: "اختر تحديًا واحدًا يميّز هذا العالم عن بقية العوالم.",
    actionLabel: "اختيار التحدي",
    actionTarget: "board",
  },
  ryo_1: {
    id: "ryo-1",
    title: "تحدي اقرأ خصمك الأول",
    explanation: "أضف أول تحدٍ من نوع اقرأ خصمك إلى اللوحة.",
    actionLabel: "إضافة الآن",
    actionTarget: "board",
  },
  ryo_2: {
    id: "ryo-2",
    title: "تحدي اقرأ خصمك الثاني",
    explanation: "أضف تحديًا ثانيًا من نوع اقرأ خصمك ليكتمل إيقاع اللعبة.",
    actionLabel: "إضافة الآن",
    actionTarget: "board",
  },
  flex: {
    id: "flex",
    title: "التحدي العام",
    explanation: "أضف تحديًا عامًا تعاونيًا أو اجتماعيًا لإكمال اللوحة.",
    actionLabel: "إضافة الآن",
    actionTarget: "board",
  },
};

const CONTENT_CODES = new Set([
  "CHALLENGE_WITHOUT_READY_CONTENT",
  "CONTENT_WITHOUT_COMPATIBLE_CHALLENGE_TYPE",
  "ANSWER_PAYLOAD_INCOMPATIBLE_WITH_CHALLENGE",
  "CONTENT_MEDIA_ASSETS_REQUIRED",
  "CONTENT_MEDIA_ASSET_URL_REQUIRED",
]);

const SCOPE_CODES = new Set([
  "WORLD_WITHOUT_ACTIVE_SCOPE",
  "SCOPE_EXCLUSIONS_BELOW_BOARD_MINIMUM",
  "SCOPE_EXCLUDES_UNKNOWN_CHALLENGE_TYPE",
  "SCOPE_ARCHIVED",
]);

const BOARD_CODES = new Set([
  "BOARD_SLOT_COUNT_MISMATCH",
  "BOARD_SLOT_TYPE_COUNT_MISMATCH",
  "INVALID_BOARD_SLOT_KEY",
  "DUPLICATE_BOARD_SLOT",
  "SLOT_FAMILY_MISMATCH",
  "SIGNATURE_MECHANIC_NOT_SET",
  "SIGNATURE_MECHANIC_MISMATCH",
  "CONFIGURED_CHALLENGE_TYPE_MISSING",
  "EXCLUSIVE_CHALLENGE_TYPE_SHARED",
]);

function allIssues(world: World): WorldContentIssue[] {
  return [...world.readiness.blockers, ...world.readiness.warnings];
}

function hasIssue(issues: WorldContentIssue[], codes: Set<string>) {
  return issues.some((issue) => codes.has(issue.code));
}

export function presentWorldReadiness(world: World) {
  const issues = allIssues(world);
  const occupied = new Set(
    world.readiness.board.slots.map((slot) => slot.slotKey),
  );
  const boardItems = (
    Object.keys(SLOT_GUIDANCE) as WorldChallengeSlotKey[]
  ).map((slotKey): ReadinessChecklistItem => ({
    ...SLOT_GUIDANCE[slotKey],
    section: "board",
    complete: occupied.has(slotKey),
    explanation: occupied.has(slotKey)
      ? `تم إعداد ${SLOT_GUIDANCE[slotKey].title} بنجاح.`
      : SLOT_GUIDANCE[slotKey].explanation,
    ...(occupied.has(slotKey)
      ? { actionLabel: undefined, actionTarget: undefined }
      : {}),
  }));

  const contentComplete = !hasIssue(issues, CONTENT_CODES);
  const scopesComplete = !hasIssue(issues, SCOPE_CODES);
  const challengesComplete = !hasIssue(issues, BOARD_CODES);
  const items: ReadinessChecklistItem[] = [
    ...boardItems,
    {
      id: "content",
      section: "content",
      complete: contentComplete,
      title: contentComplete ? "المحتوى جاهز للعب" : "المحتوى يحتاج إلى إكمال",
      explanation: contentComplete
        ? "توجد عناصر محتوى جاهزة للتحديات المضافة."
        : "أضف أو جهّز عناصر محتوى لكل تحدٍ في اللوحة.",
      ...(!contentComplete
        ? { actionLabel: "إضافة محتوى", actionTarget: "content" as const }
        : {}),
    },
    {
      id: "scopes",
      section: "scopes",
      complete: scopesComplete,
      title: scopesComplete
        ? "جميع النطاقات مرتبطة بشكل صحيح"
        : "النطاقات تحتاج إلى مراجعة",
      explanation: scopesComplete
        ? "يمكن استخدام تحديات اللوحة داخل النطاقات الحالية."
        : "راجع النطاقات وتأكد من وجود نطاق نشط ومتوافق مع تحديات اللوحة.",
      ...(!scopesComplete
        ? { actionLabel: "مراجعة النطاقات", actionTarget: "scopes" as const }
        : {}),
    },
  ];

  const complete = items.filter((item) => item.complete).length;
  const unknownProblems = issues.filter(
    (issue) =>
      !CONTENT_CODES.has(issue.code) &&
      !SCOPE_CODES.has(issue.code) &&
      !BOARD_CODES.has(issue.code),
  ).length;

  return {
    items,
    complete,
    total: items.length,
    percent: Math.round((complete / items.length) * 100),
    unknownProblems,
    health: [
      {
        label: "لوحة التحديات",
        value: boardItems.filter((item) => item.complete).length,
        total: 4,
      },
      {
        label: "المحتوى",
        value: contentComplete ? world.contentItemCount : 0,
        total: Math.max(
          world.contentItemCount,
          contentComplete ? world.contentItemCount : 1,
        ),
      },
      {
        label: "النطاقات",
        value: scopesComplete ? world.scopeCount : 0,
        total: Math.max(world.scopeCount, 1),
      },
      {
        label: "التحديات",
        value: challengesComplete
          ? world.challengeConfigurationCount
          : boardItems.filter((item) => item.complete).length,
        total: 4,
      },
    ],
  };
}
