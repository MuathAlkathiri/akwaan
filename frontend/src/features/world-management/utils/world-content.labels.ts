import type {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  ContentItemStatus,
  ContentMediaType,
  WorldChallengeConfiguration,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from "../types";

export function worldChallengeConfigurationName(
  configuration: Pick<
    WorldChallengeConfiguration,
    "effectiveName" | "displayName" | "challengeType"
  >,
): string {
  return (
    configuration.effectiveName?.trim() ||
    configuration.displayName?.trim() ||
    configuration.challengeType.name
  );
}

/**
 * Arabic labels only. The set of allowed values always comes from the server
 * metadata endpoint, so this file never decides what is valid — only how a value
 * already provided by the backend reads to an admin.
 */

export const FAMILY_LABEL: Record<ChallengeFamily, string> = {
  signature: "توقيع العالم",
  ryo: "اقرأ خصمك",
  coop: "تعاوني",
  relational: "علائقي",
};

export const SLOT_KEY_LABEL: Record<WorldChallengeSlotKey, string> = {
  slot_1: "الخانة 1",
  slot_2: "الخانة 2",
  slot_3: "الخانة 3",
  slot_4: "الخانة 4",
};

export const ANSWER_MODE_LABEL: Record<ChallengeAnswerMode, string> = {
  ryo: "اقرأ خصمك",
  multiple_choice: "اختيار من متعدد",
  closest: "الأقرب رقمياً",
  match: "مطابقة نصية",
  vote: "تصويت",
  split: "معلومة مقسّمة",
  rakkibha: "ركّبها (تجميع بصري)",
  top_5: "أفضل 5",
  one_clue: "بدليل واحد",
};

export const ITEM_STRUCTURE_LABEL: Record<ChallengeItemStructure, string> = {
  discrete_triple: "ثلاث فقرات منفصلة",
  continuous: "وحدة متصلة",
};

export const SCORING_RULE_PRESENTATION: Record<
  string,
  {
    label: string;
    description: string;
    // The family a family-specific rule belongs to (Read Your Opponent, Co-op…).
    family?: ChallengeFamily;
    // The canonical Match rule (`challenge.win`) is not family-specific: it is the
    // single rule that moves the Match scoreboard and every implemented mechanic
    // scores through it, so it must be offered under every family, not hidden
    // behind a `family` tag it can never carry.
    sharedAcrossFamilies?: boolean;
  }
> = {
  "challenge.win": {
    label: "نقطة للفريق الفائز بالتحدي",
    description:
      "يسجل النظام نقطة مباراة واحدة للفريق الفائز بالتحدي، ولا يسجل نقطة عند التعادل.",
    sharedAcrossFamilies: true,
  },
  "ryo.payoff-matrix": {
    label: "نظام اقرأ خصمك",
    description:
      "يحسب النقاط تلقائيًا حسب صحة الإجابة واختيار الخصم بين السرقة والثقة.",
    family: "ryo",
  },
  "coop.item-success": {
    label: "نقطة عند نجاح الفريق",
    description: "يحصل الفريق على نقطة عند إكمال الفقرة التعاونية بنجاح.",
    family: "coop",
  },
  "relational.item-success": {
    label: "نقطة عند تطابق الإجابات",
    description:
      "يحصل الفريق على نقطة عندما تتطابق إجابات اللاعبين أو يتحقق الاتفاق المطلوب.",
    family: "relational",
  },
  "signature.declared-by-mechanic": {
    label: "النقاط يحددها التحدي الخاص",
    description: "يستخدم التحدي الخاص طريقة احتساب النقاط المبرمجة له.",
    family: "signature",
  },
  "challenge.perfect-clear-bonus": {
    label: "مكافأة إكمال جميع الفقرات",
    description:
      "مكافأة إضافية يمنحها النظام عند إكمال التحدي كاملًا، وليست قاعدة أساسية مستقلة.",
  },
  "top-5.result": {
    label: "نقطة للفائز في أفضل 5",
    description:
      "يمنح النظام نقطة مباراة واحدة للفريق الذي يملك عددًا أكبر من مداخل أفضل 5 الحقيقية. الخمسة لا تنقسم بالتساوي، فلا يوجد تعادل.",
    family: "signature",
  },
};

/**
 * Whether a scoring rule may be selected while authoring a challenge of `family`.
 *
 * The one place this decision lives, so the authoring form never grows a second
 * rule list or a per-mechanic whitelist. A rule is offered when it is the shared
 * canonical Match rule (available to every family) or when it is the rule that
 * belongs to this specific family.
 */
export function isScoringRuleAvailableForFamily(
  ruleId: string,
  family: ChallengeFamily,
): boolean {
  const presentation = SCORING_RULE_PRESENTATION[ruleId];
  return Boolean(
    presentation?.sharedAcrossFamilies || presentation?.family === family,
  );
}

export function scoringRuleLabel(ruleId: string): string {
  return SCORING_RULE_PRESENTATION[ruleId]?.label ?? "طريقة احتساب النقاط";
}

export function scoringRuleDescription(ruleId: string): string {
  return (
    SCORING_RULE_PRESENTATION[ruleId]?.description ??
    "يحسب النظام النقاط تلقائيًا وفق إعدادات هذا التحدي."
  );
}

export const MEDIA_TYPE_LABEL: Record<ContentMediaType, string> = {
  none: "بدون وسائط",
  image: "صورة",
  audio: "صوت",
  video: "فيديو",
};

export const STATUS_LABEL: Record<WorldContentStatus, string> = {
  draft: "مسودة",
  active: "نشط",
  archived: "مؤرشف",
};

export const CONTENT_STATUS_LABEL: Record<ContentItemStatus, string> = {
  draft: "مسودة",
  ready: "جاهز",
  archived: "مؤرشف",
};

export const MEDIA_TYPES: ContentMediaType[] = [
  "none",
  "image",
  "audio",
  "video",
];

export const CONTENT_STATUSES: ContentItemStatus[] = [
  "draft",
  "ready",
  "archived",
];

export const VOTE_CONSENSUS_LABEL: Record<string, string> = {
  exact: "تطابق تام",
  majority: "أغلبية",
  team_match: "تطابق داخل الفريق",
};
