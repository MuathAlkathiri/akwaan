import type { ComboTutorialScenario } from "./tutorial-scenario";

export type ComboDemoStepId =
  | "start"
  | "first-reveal"
  | "decision"
  | "continue"
  | "second-reveal"
  | "forced-reveal"
  | "forced-question"
  | "outcome";

export interface ComboDemoStep {
  id: ComboDemoStepId;
  caption: string;
  holdSeconds: number;
}

export const COMBO_DEMO_STEPS: readonly ComboDemoStep[] = [
  {
    id: "start",
    caption: "السؤال الأول يفتح الكومبو — كل إجابة صحيحة تضيف نقطة غير مثبتة.",
    holdSeconds: 3,
  },
  {
    id: "first-reveal",
    caption: "إجابة صحيحة: صار عند الفريق نقطة، لكنها ما زالت على المحك.",
    holdSeconds: 2.4,
  },
  {
    id: "decision",
    caption: "الحين القرار الحقيقي: ثبّتوا النقطة أو خاطروا بالرصيد كاملًا.",
    holdSeconds: 3.6,
  },
  {
    id: "continue",
    caption: "اختاروا كمّل — انتقلوا إلى سؤال أصعب والنقطة ما زالت غير مثبتة.",
    holdSeconds: 2.4,
  },
  {
    id: "second-reveal",
    caption: "إجابة صحيحة ثانية: صار الرصيد غير المثبت نقطتين.",
    holdSeconds: 2.4,
  },
  {
    id: "forced-reveal",
    caption:
      "كسر الكومبو انكشف بعد النجاة — الآن السحب محظور والسؤال القادم إجباري.",
    holdSeconds: 2.8,
  },
  {
    id: "forced-question",
    caption:
      "كمّل غصب دفع الفريق إلى السؤال الثالث؛ الخطأ هنا يكسر الكومبو كله.",
    holdSeconds: 3.4,
  },
  {
    id: "outcome",
    caption:
      "انكسر الكومبو: ضاعت النقطتان غير المثبتتين، ونقاط الكومبو لا تُضاف للمباراة.",
    holdSeconds: 3.8,
  },
];

/** Preview-only sample. It is never selected as competitive content. */
export const SAMPLE_COMBO_TUTORIAL_SCENARIO: ComboTutorialScenario = {
  kind: "combo",
  version: 1,
  stages: [
    {
      stage: 1,
      prompt: "ما اسم القرية التي ينتمي إليها ناروتو؟",
      correctAnswer: "كونوها",
      submittedAnswer: "كونوها",
    },
    {
      stage: 2,
      prompt: "ما اسم أخ نيزوكو الأكبر في قاتل الشياطين؟",
      correctAnswer: "تانجيرو كامادو",
      submittedAnswer: "تانجيرو كامادو",
    },
    {
      stage: 3,
      prompt: "ما اسم الشخصية الرئيسية في ون بيس؟",
      correctAnswer: "مونكي دي لوفي",
      submittedAnswer: "ناروتو",
    },
  ],
  caption: "مثال تعليمي فقط — الأسئلة والإجابات هنا غير تنافسية.",
  outcome: {
    decision: "continue-combo",
    breakArmedAtStage: 2,
    forcedQuestionStage: 3,
    correctStagesBeforeBreak: 2,
    unbankedPointsBeforeForcedQuestion: 2,
    forcedQuestionEarned: 0,
    bankedPoints: 0,
    endedBy: "combo-break",
    reason: "combo.push-your-luck",
  },
};
