import type { LaqathaTutorialScenario } from "./tutorial-scenario";

export type LaqathaDemoStepId =
  | "opening"
  | "clue-1"
  | "clue-2"
  | "claim"
  | "locked"
  | "wrong"
  | "continue"
  | "correct"
  | "reveal";

export interface LaqathaDemoStep {
  id: LaqathaDemoStepId;
  caption: string;
  holdSeconds: number;
}

export const LAQATHA_DEMO_STEPS: readonly LaqathaDemoStep[] = [
  {
    id: "opening",
    caption: "فيلم واحد، خمسة أدلة، وفريقان يتسابقان على الإجابة.",
    holdSeconds: 2.4,
  },
  {
    id: "clue-1",
    caption: "الدليل الأول يعطي الفريقين فرصة خمس نقاط.",
    holdSeconds: 2.4,
  },
  {
    id: "clue-2",
    caption:
      "الدليل الثاني يظهر بعد 3 ثوانٍ؛ المعلومات تزيد والمكافأة تنخفض إلى 4.",
    holdSeconds: 3.1,
  },
  {
    id: "claim",
    caption:
      "الفريق الأول ضغط «جاوب»: توقّف كشف الأدلة وتجمّدت المكافأة عند 4.",
    holdSeconds: 2.5,
  },
  {
    id: "locked",
    caption:
      "نافذة الكتابة خمس ثوانٍ للفريق الأول، والفريق الثاني مقفول مؤقتًا.",
    holdSeconds: 3.2,
  },
  {
    id: "wrong",
    caption: "الإجابة خاطئة؛ انتهت محاولة الفريق الأول لهذا الفيلم.",
    holdSeconds: 2.6,
  },
  {
    id: "continue",
    caption:
      "ينفتح الفريق الثاني من نفس موضع التجميد، من دون خسارة زمن الدليل.",
    holdSeconds: 2.8,
  },
  {
    id: "correct",
    caption:
      "الدليل الثالث يوضح الصورة؛ الفريق الثاني يرسل إجابة نصية صحيحة ويحصل على 3 نقاط.",
    holdSeconds: 3.1,
  },
  {
    id: "reveal",
    caption: "يظهر كشف الفيلم والنتيجة — وهذا سؤال واحد من أصل ثلاثة.",
    holdSeconds: 4.2,
  },
];

export const SAMPLE_LAQATHA_TUTORIAL_SCENARIO: LaqathaTutorialScenario = {
  kind: "laqatha",
  version: 1,
  prompt: "تعرّفوا على الفيلم من أدلة متدرجة.",
  title: "حديقة الديناصورات",
  clues: [
    { order: 1, value: 5, text: "زيارة جزيرة نائية تسبق افتتاح متنزه جديد." },
    {
      order: 2,
      value: 4,
      text: "عالِم حفريات يقود مشروعًا يعتمد على الحمض النووي القديم.",
    },
    {
      order: 3,
      value: 3,
      text: "تعود حيوانات منقرضة إلى الحياة، وتبدأ الأنظمة في الانهيار.",
    },
    {
      order: 4,
      value: 2,
      text: "طفلان يختبئان قرب سياج كهربائي بينما تقترب مفترسات ضخمة.",
    },
    {
      order: 5,
      value: 1,
      text: "تي-ريكس يطارد الناجين في أشهر فيلم ديناصورات.",
    },
  ],
  acceptedAnswers: ["حديقة الديناصورات", "Jurassic Park"],
  firstSubmittedAnswer: "حديقة الوحوش",
  secondSubmittedAnswer: "حديقة الديناصورات",
  caption: "مثال تعليمي فقط — هذا ليس سؤال المباراة.",
  outcome: {
    questionCount: 3,
    firstClaimTeam: "team-a",
    firstClaimAtClue: 2,
    firstClaimReward: 4,
    firstClaimFailed: true,
    secondClaimTeam: "team-b",
    secondClaimAtClue: 3,
    secondClaimReward: 3,
    winnerTeam: "team-b",
    points: { "team-a": 0, "team-b": 3 },
    reason: "laqatha.claim-race",
  },
};
