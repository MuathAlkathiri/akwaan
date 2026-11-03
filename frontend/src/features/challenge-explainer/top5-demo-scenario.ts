import type { Top5TutorialScenario } from "./tutorial-scenario";

export type Top5DemoStepId =
  | "keep-decision"
  | "keep-owned"
  | "give-decision"
  | "give-owned"
  | "fast-forward"
  | "reveal-ranked"
  | "reveal-traps"
  | "outcome";

export interface Top5DemoStep {
  id: Top5DemoStepId;
  phase: "decision" | "ownership" | "simulation" | "resolved";
  cardIndex?: number;
  caption: string;
  holdSeconds: number;
}

export const TOP5_DEMO_STEPS: readonly Top5DemoStep[] = [
  {
    id: "keep-decision",
    phase: "decision",
    cardIndex: 0,
    caption:
      "الفريق الأول يرى بطاقة بلا رتبة: يختار خلّها، من دون معرفة ترتيبها النهائي.",
    holdSeconds: 3.2,
  },
  {
    id: "keep-owned",
    phase: "ownership",
    cardIndex: 0,
    caption:
      "تم اعتماد خلّها: البطاقة بقيت مع الفريق الأول والرتبة ما زالت مخفية.",
    holdSeconds: 0.8,
  },
  {
    id: "give-decision",
    phase: "decision",
    cardIndex: 1,
    caption:
      "في الدور التالي، يختار الفريق الثاني عطها للخصم؛ القرار ينقل الملكية لا نتيجة التحدي فوراً.",
    holdSeconds: 3.2,
  },
  {
    id: "give-owned",
    phase: "ownership",
    cardIndex: 1,
    caption:
      "تم اعتماد عطها: وصلت البطاقة إلى الفريق الأول، والرتبة ما زالت مخفية.",
    holdSeconds: 0.8,
  },
  {
    id: "fast-forward",
    phase: "simulation",
    cardIndex: 2,
    caption:
      "وتستمر القرارات حتى تكتمل البطاقات العشر… مع بقاء الأدوار والملكية محفوظة.",
    holdSeconds: 1.8,
  },
  {
    id: "reveal-ranked",
    phase: "resolved",
    caption:
      "تنكشف الآن بطاقات أفضل 5 ومالكوها: الاحتفاظ الناجح يفيد صاحبه، والدسّ قد ينقل بطاقة رابحة.",
    holdSeconds: 2.6,
  },
  {
    id: "reveal-traps",
    phase: "resolved",
    caption:
      "ثم تنكشف الفخاخ. الاحتفاظ ببطاقة فخ لا يمنح نقطة، لكنه يوضح مخاطرة القرار.",
    holdSeconds: 2.6,
  },
  {
    id: "outcome",
    phase: "resolved",
    caption:
      "تُحتسب فقط بطاقات أفضل 5؛ الفائز بالتحدي يأخذ نقطة واحدة في المباراة.",
    holdSeconds: 4.3,
  },
];

/** A deterministic, non-competitive preview fixture for visual QA. */
export const SAMPLE_TOP5_TUTORIAL_SCENARIO: Top5TutorialScenario = {
  kind: "top-5",
  version: 1,
  prompt: "من أكثر خمسة لاعبين تسجيلاً للأهداف في تاريخ الدوري الإنجليزي؟",
  title: "أفضل 5 هدّافين في الدوري الإنجليزي",
  rankingBasis: "إجمالي أهداف اللاعب في الدوري الإنجليزي الممتاز",
  sourceLabel: "مثال تعليمي ثابت",
  startingTeam: "team-a",
  entries: [
    { id: "alan-shearer", label: "آلان شيرر", rank: 1 },
    { id: "harry-kane", label: "هاري كين", rank: 2 },
    { id: "wayne-rooney", label: "واين روني", rank: 3 },
    { id: "andy-cole", label: "آندي كول", rank: 4 },
    { id: "sergio-aguero", label: "سيرخيو أغويرو", rank: 5 },
    { id: "frank-lampard", label: "فرانك لامبارد", rank: null },
    { id: "mohamed-salah", label: "محمد صلاح", rank: null },
    { id: "thierry-henry", label: "تييري هنري", rank: null },
    { id: "ryan-giggs", label: "راين غيغز", rank: null },
    { id: "robbie-fowler", label: "روبي فاولر", rank: null },
  ],
  decisions: [
    { action: "keep" },
    { action: "give" },
    { action: "keep" },
    { action: "give" },
    { action: "give" },
    { action: "keep" },
    { action: "give" },
    { action: "give" },
    { action: "keep" },
    { action: "keep" },
  ],
  caption: "مثال توضيحي فقط — البطاقات والبيانات هنا غير تنافسية.",
  outcome: {
    entries: [],
    ownership: [],
    top5Counts: { "team-a": 3, "team-b": 2 },
    trapCounts: { "team-a": 2, "team-b": 3 },
    revealOrder: [],
    winnerTeam: "team-a",
    matchPointDelta: 1,
    reason: "top-5.win",
  },
};

// Keep the fixture's derived half honest without duplicating the backend policy
// in the renderer: the preview is completed once here for the static route.
const ownership = SAMPLE_TOP5_TUTORIAL_SCENARIO.decisions.map(
  (decision, index) => {
    const actingTeam = index % 2 === 0 ? "team-a" : "team-b";
    const ownerTeam =
      decision.action === "keep"
        ? actingTeam
        : actingTeam === "team-a"
          ? "team-b"
          : "team-a";
    return {
      turn: index + 1,
      entryId: SAMPLE_TOP5_TUTORIAL_SCENARIO.entries[index].id,
      actingTeam,
      ownerTeam,
      action: decision.action,
    } as const;
  },
);
const rankById = new Map(
  SAMPLE_TOP5_TUTORIAL_SCENARIO.entries.map((entry) => [entry.id, entry.rank]),
);
const top5Counts = { "team-a": 0, "team-b": 0 };
const trapCounts = { "team-a": 0, "team-b": 0 };
for (const record of ownership) {
  if (rankById.get(record.entryId) === null) trapCounts[record.ownerTeam] += 1;
  else top5Counts[record.ownerTeam] += 1;
}
SAMPLE_TOP5_TUTORIAL_SCENARIO.outcome = {
  ...SAMPLE_TOP5_TUTORIAL_SCENARIO.outcome,
  entries: SAMPLE_TOP5_TUTORIAL_SCENARIO.entries,
  ownership,
  top5Counts,
  trapCounts,
  revealOrder: SAMPLE_TOP5_TUTORIAL_SCENARIO.entries.map((entry) => entry.id),
};
