import type { LaTahriqhaTutorialScenario } from "./tutorial-scenario";

export type LaTahriqhaDemoStepId =
  | "opening"
  | "three-selected"
  | "risk"
  | "fourth-selection"
  | "fifth-selection"
  | "burn-selection"
  | "commit"
  | "perfect-selection"
  | "perfect-commit"
  | "burn-reveal"
  | "perfect-reveal"
  | "rotation"
  | "dish-three"
  | "final-score";

export interface LaTahriqhaDemoStep {
  id: LaTahriqhaDemoStepId;
  caption: string;
  holdSeconds: number;
}

export const LA_TAHRIQHA_DEMO_STEPS: readonly LaTahriqhaDemoStep[] = [
  {
    id: "opening",
    caption: "ثلاثة أطباق، ثماني بطاقات مكونات، وانتبهوا للدخيل.",
    holdSeconds: 2.2,
  },
  {
    id: "three-selected",
    caption: "قائد الطبق يثبت ثلاث بطاقات صحيحة: هذه هي أرضية الأمان — 3 نقاط.",
    holdSeconds: 2.1,
  },
  {
    id: "risk",
    caption: "نكتفي بـ3؟ أم نخاطر عشان 7؟ القرار للقائد، والحقيقة مخفية.",
    holdSeconds: 2.1,
  },
  {
    id: "fourth-selection",
    caption:
      "الرابعة ترفع المكافأة الممكنة إلى 4؛ ما زالت بطاقة واحدة خاطئة تحرق الطبق.",
    holdSeconds: 1.9,
  },
  {
    id: "fifth-selection",
    caption:
      "الخامسة قد تفتح طبقًا مثاليًا = 7، لكنها آخر خطوة قبل مخاطرة الدخيل.",
    holdSeconds: 1.9,
  },
  {
    id: "burn-selection",
    caption:
      "الفريق الأول يغامر ببطاقة تبدو معقولة؛ لا نكشف حقيقتها قبل الحسم.",
    holdSeconds: 1.8,
  },
  {
    id: "commit",
    caption:
      "القائد يضغط تثبيت — الاختيارات تقفل عنده، والساعة الأصلية 30 ثانية.",
    holdSeconds: 2.0,
  },
  {
    id: "perfect-selection",
    caption:
      "الفريق الثاني يثبت الخمس الصحيحة بالضبط: مخاطرة محسوبة نحو طبق مثالي.",
    holdSeconds: 2.2,
  },
  {
    id: "perfect-commit",
    caption:
      "قائد الفريق الثاني يقفل اختياره؛ الآن ننتظر الحسم الموثوق قبل كشف الحقيقة.",
    holdSeconds: 1.8,
  },
  {
    id: "burn-reveal",
    caption:
      "بعد الحسم فقط يظهر الدخيل: بطاقة واحدة خاطئة حرقت طبق الفريق الأول إلى صفر.",
    holdSeconds: 3.0,
  },
  {
    id: "perfect-reveal",
    caption:
      "كشف الفريق الثاني يطابق المكونات الخمسة: طبق مثالي = 7 نقاط داخلية.",
    holdSeconds: 3.0,
  },
  {
    id: "rotation",
    caption:
      "الطبق الثاني — قائد جديد! مها وراشد يستلمان الدور، والنقاط السابقة محفوظة.",
    holdSeconds: 2.4,
  },
  {
    id: "dish-three",
    caption:
      "الطبق الثالث يبدأ بقادة جدد: سارة وماجد. انتقال سريع، ثم نكمل النتيجة.",
    holdSeconds: 1.8,
  },
  {
    id: "final-score",
    caption:
      "بعد ثلاثة أطباق: الفريق الثاني 14 مقابل 7، فيحصل على نقطة المباراة.",
    holdSeconds: 4.2,
  },
];

const ingredients = (entries: Array<[string, string, boolean]>) =>
  entries.map(([id, label, correct]) => ({ id, label, correct }));

export const SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO: LaTahriqhaTutorialScenario =
  {
    kind: "la-tahriqha",
    version: 1,
    prompt: "اختاروا مكونات الطبق… بس انتبهوا للدخيل!",
    dishWindowSeconds: 30,
    dishes: [
      {
        id: "kabsa",
        name: "كبسة دجاج",
        ingredients: ingredients([
          ["rice", "أرز بسمتي", true],
          ["chicken", "دجاج", true],
          ["onion", "بصل", true],
          ["tomato", "طماطم", true],
          ["loomi", "لومي مجفف", true],
          ["pasta", "مكرونة", false],
          ["mozzarella", "جبن موزاريلا", false],
          ["strawberry", "فراولة", false],
        ]),
        teamASelection: ["rice", "chicken", "onion", "pasta"],
        teamBSelection: ["rice", "chicken", "onion", "tomato", "loomi"],
      },
      {
        id: "jareesh",
        name: "جريش",
        ingredients: ingredients([
          ["wheat", "قمح مجروش", true],
          ["yogurt", "لبن", true],
          ["onion", "بصل", true],
          ["cumin", "كمون", true],
          ["butter", "زبدة", true],
          ["rice", "أرز بسمتي", false],
          ["tuna", "تونة", false],
          ["pasta", "مكرونة", false],
        ]),
        teamASelection: ["wheat", "yogurt", "onion", "cumin"],
        teamBSelection: ["wheat", "yogurt", "onion"],
      },
      {
        id: "mandi",
        name: "مندي دجاج",
        ingredients: ingredients([
          ["rice", "أرز بسمتي", true],
          ["chicken", "دجاج", true],
          ["onion", "بصل", true],
          ["tomato", "طماطم", true],
          ["cardamom", "هيل", true],
          ["pasta", "مكرونة", false],
          ["cheese", "جبن", false],
          ["strawberry", "فراولة", false],
        ]),
        teamASelection: ["rice", "chicken", "onion"],
        teamBSelection: ["rice", "chicken", "onion", "tomato"],
      },
    ],
    captainRotation: {
      teamA: ["نورة", "مها", "سارة"],
      teamB: ["فيصل", "راشد", "ماجد"],
    },
    caption: "مثال تعليمي مضبوط — لا يغيّر نتيجة أي طبق تنافسي.",
    outcome: {
      dishCount: 3,
      dishResults: [
        {
          dishIndex: 0,
          dishId: "kabsa",
          dishName: "كبسة دجاج",
          captains: { teamA: "نورة", teamB: "فيصل" },
          teamA: {
            selected: ["rice", "chicken", "onion", "pasta"],
            correctIds: ["rice", "chicken", "onion"],
            wrongIds: ["pasta"],
            points: 0,
            burned: true,
            perfect: false,
            understaffed: false,
          },
          teamB: {
            selected: ["rice", "chicken", "onion", "tomato", "loomi"],
            correctIds: ["rice", "chicken", "onion", "tomato", "loomi"],
            wrongIds: [],
            points: 7,
            burned: false,
            perfect: true,
            understaffed: false,
          },
        },
        {
          dishIndex: 1,
          dishId: "jareesh",
          dishName: "جريش",
          captains: { teamA: "مها", teamB: "راشد" },
          teamA: {
            selected: ["wheat", "yogurt", "onion", "cumin"],
            correctIds: ["wheat", "yogurt", "onion", "cumin"],
            wrongIds: [],
            points: 4,
            burned: false,
            perfect: false,
            understaffed: false,
          },
          teamB: {
            selected: ["wheat", "yogurt", "onion"],
            correctIds: ["wheat", "yogurt", "onion"],
            wrongIds: [],
            points: 3,
            burned: false,
            perfect: false,
            understaffed: false,
          },
        },
        {
          dishIndex: 2,
          dishId: "mandi",
          dishName: "مندي دجاج",
          captains: { teamA: "سارة", teamB: "ماجد" },
          teamA: {
            selected: ["rice", "chicken", "onion"],
            correctIds: ["rice", "chicken", "onion"],
            wrongIds: [],
            points: 3,
            burned: false,
            perfect: false,
            understaffed: false,
          },
          teamB: {
            selected: ["rice", "chicken", "onion", "tomato"],
            correctIds: ["rice", "chicken", "onion", "tomato"],
            wrongIds: [],
            points: 4,
            burned: false,
            perfect: false,
            understaffed: false,
          },
        },
      ],
      finalTotals: { "team-a": 7, "team-b": 14 },
      winnerTeam: "team-b",
      tie: false,
      matchPointDelta: 1,
      reason: "la-tahriqha.challenge-win",
    },
  };
