import type { OneClueTutorialScenario } from "./tutorial-scenario";

export const ONE_CLUE_DEMO_STEPS = [
  {
    id: "opening",
    caption: "ثلاثة أسئلة — كل سؤال يبدأ بخمس نقاط.",
    holdSeconds: 2.6,
  },
  {
    id: "first-clue",
    caption: "يظهر دليل واحد للفريقين، ومعه 7 ثوانٍ للتفكير.",
    holdSeconds: 2.8,
  },
  {
    id: "second-clue",
    caption: "انتظار دليل أوضح يقلّل قيمة السؤال من 5 إلى 4.",
    holdSeconds: 2.8,
  },
  {
    id: "team-a-input",
    caption: "مجيب الفريق الأول يكتب إجابته — ولا يراها الخصم.",
    holdSeconds: 2.2,
  },
  {
    id: "team-a-lock",
    caption: "ثُبّتت الإجابة؛ الآن ينتظر الفريق انتهاء مهلة الدليل.",
    holdSeconds: 2.8,
  },
  {
    id: "wrong",
    caption: "الإجابة الخاطئة تُخرج الفريق الأول من هذا السؤال فقط.",
    holdSeconds: 3,
  },
  {
    id: "third-clue",
    caption: "الفريق الثاني يكمل وحده — لكن قيمة السؤال صارت 3.",
    holdSeconds: 2.8,
  },
  {
    id: "team-b-lock",
    caption: "الفريق الثاني يثبّت إجابته وينتظر انتهاء المهلة.",
    holdSeconds: 2.6,
  },
  {
    id: "item-reveal",
    caption: "الإجابة الصحيحة تمنح الفريق الثاني 3 نقاط داخلية.",
    holdSeconds: 3.2,
  },
  {
    id: "final",
    caption: "بعد 3 أسئلة: الأعلى نقاطًا يفوز بالتحدي ويأخذ نقطة مباراة.",
    holdSeconds: 3.6,
  },
] as const;

export type OneClueDemoStepId = (typeof ONE_CLUE_DEMO_STEPS)[number]["id"];

export const SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO: OneClueTutorialScenario = {
  kind: "one-clue",
  version: 1,
  prompt: "ما المدينة المقصودة؟",
  clues: [
    { order: 1, value: 5, text: "مدينة عربية ساحلية" },
    { order: 2, value: 4, text: "تشتهر بواجهة بحرية طويلة" },
    { order: 3, value: 3, text: "فيها نافورة الملك فهد" },
    { order: 4, value: 2, text: "تُعرف بعروس البحر الأحمر" },
    { order: 5, value: 1, text: "اسمها يبدأ بحرف الجيم" },
  ],
  acceptedAnswer: "جدة",
  firstSubmittedAnswer: "الدمام",
  secondSubmittedAnswer: "جدة",
  caption: "مثال تعليمي مستقل — لا يستخدم سؤالًا تنافسيًا.",
  outcome: {
    itemCount: 3,
    firstLockedTeam: "team-a",
    firstLockedAtClue: 2,
    firstLockedValue: 4,
    firstAnswerCorrect: false,
    eliminatedTeam: "team-a",
    continuingTeam: "team-b",
    correctTeam: "team-b",
    correctAtClue: 3,
    correctValue: 3,
    itemPoints: { "team-a": 0, "team-b": 3 },
    finalTotals: { "team-a": 5, "team-b": 7 },
    winnerTeam: "team-b",
    matchPointDelta: 1,
    reason: "one-clue.progressive-lock",
  },
};
