import type { EkshifniTutorialScenario } from "./tutorial-scenario";

export const EKSHIFNI_DEMO_STEPS = [
  {
    id: "obscured",
    caption: "الصورة مخفية بالكامل — والفريق الأول يختار أول نافذة.",
    holdSeconds: 2.5,
  },
  {
    id: "first-window",
    caption: "انفتحت نافذة واحدة؛ القيمة نزلت من 5 إلى 4.",
    holdSeconds: 2.6,
  },
  {
    id: "second-window",
    caption: "معلومة أوضح، لكن الإجابة الآن بثلاث نقاط.",
    holdSeconds: 2.6,
  },
  {
    id: "answer-entry",
    caption: "الإجابة مفتوحة للفريقين — الفريق الأول يحاول الآن.",
    holdSeconds: 2.3,
  },
  {
    id: "wrong",
    caption: "الإجابة خاطئة؛ تنتقل مبادرة الكشف للفريق الثاني مؤقتًا.",
    holdSeconds: 2.6,
  },
  {
    id: "initiative-transfer",
    caption: "الفريق الأول ينتظر حركة واحدة من الخصم، وليس خارج الصورة.",
    holdSeconds: 2.4,
  },
  {
    id: "opponent-reveal",
    caption:
      "الفريق الثاني يكشف نافذة؛ تعود أهلية الفريق الأول والقيمة تصير 2.",
    holdSeconds: 2.8,
  },
  {
    id: "correct-entry",
    caption: "الفريق الثاني يتعرف عليها ويرسل الإجابة.",
    holdSeconds: 2.2,
  },
  {
    id: "correct",
    caption: "إجابة صحيحة — نقطتان داخليتان للفريق الثاني.",
    holdSeconds: 2.4,
  },
  {
    id: "full-reveal",
    caption: "الكشف الشامل يعرض الصورة والاسم بعد الحسم فقط.",
    holdSeconds: 3.2,
  },
  {
    id: "final",
    caption: "بعد 3 صور: الأعلى مجموعًا يفوز بالتحدي ونقطة المباراة.",
    holdSeconds: 3.8,
  },
] as const;

export const SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO: EkshifniTutorialScenario = {
  kind: "ekshifni",
  version: 1,
  prompt: "مين هذي؟",
  celebrityIdentity: "رضوى الشربيني",
  image: {
    url: "/tutorial-media/ekshifni-v1/radwa-el-sherbiny.jpg",
    altText: "صورة رضوى الشربيني في الكشف النهائي",
    sha256: "2c6c2e377eb19fcbc580569acb9059a011c52adea82132c76c5e54f98464b695",
    provenanceNote:
      "أصل محلي مؤرشف من مراجعة محتوى المشاهير؛ المصدر الخارجي والترخيص غير محفوظين.",
  },
  regions: [
    {
      id: "r1",
      number: 1,
      shape: { x: 0.05, y: 0.48, width: 0.23, height: 0.27 },
    },
    {
      id: "r2",
      number: 2,
      shape: { x: 0.31, y: 0.5, width: 0.3, height: 0.18 },
    },
    {
      id: "r6",
      number: 6,
      shape: { x: 0.39, y: 0.12, width: 0.2, height: 0.06 },
    },
    {
      id: "r3",
      number: 3,
      shape: { x: 0.4, y: 0.26, width: 0.2, height: 0.08 },
    },
    {
      id: "r4",
      number: 4,
      shape: { x: 0.62, y: 0.36, width: 0.09, height: 0.08 },
    },
    {
      id: "r5",
      number: 5,
      shape: { x: 0.43, y: 0.2, width: 0.12, height: 0.045 },
    },
  ],
  wrongSubmittedAnswer: "لجين عمران",
  correctSubmittedAnswer: "رضوى الشربيني",
  caption: "مثال تعليمي محلي مستقل عن المحتوى التنافسي.",
  outcome: {
    imageCount: 3,
    openingInitiative: ["team-a", "team-b", "team-a"],
    revealedRegionIds: ["r1", "r2", "r6"],
    resolvedValue: 2,
    wrongTeam: "team-a",
    initiativeAfterWrong: "team-b",
    temporarilyParkedTeam: "team-a",
    eligibilityRestoredBy: "opponent-reveal",
    correctTeam: "team-b",
    imagePoints: { "team-a": 0, "team-b": 2 },
    finalTotals: { "team-a": 6, "team-b": 8 },
    winnerTeam: "team-b",
    matchPointDelta: 1,
    reason: "ekshifni.clear-window-open-race",
  },
};
