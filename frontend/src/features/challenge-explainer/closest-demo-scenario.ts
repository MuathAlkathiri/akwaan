import type { ClosestTutorialScenario } from "./tutorial-scenario";

export type ClosestDemoStepId =
  | "question"
  | "team-a-locked"
  | "team-b-locked"
  | "both-locked"
  | "reveal"
  | "outcome";

export interface ClosestDemoStep {
  id: ClosestDemoStepId;
  phase: "collecting" | "resolved";
  caption: string;
  holdSeconds: number;
}

export const CLOSEST_DEMO_STEPS: readonly ClosestDemoStep[] = [
  {
    id: "question",
    phase: "collecting",
    caption: "كل فريق يقدّر الرقم بسرية.",
    holdSeconds: 2.8,
  },
  {
    id: "team-a-locked",
    phase: "collecting",
    caption: "الفريق الأول ثبّت تقديره.",
    holdSeconds: 2.2,
  },
  {
    id: "team-b-locked",
    phase: "collecting",
    caption: "الفريق الثاني ثبّت تقديره.",
    holdSeconds: 2.2,
  },
  {
    id: "both-locked",
    phase: "collecting",
    caption: "التقديران مقفلان — الآن نكشف الصحيح.",
    holdSeconds: 2.2,
  },
  {
    id: "reveal",
    phase: "resolved",
    caption: "نقيس المسافة المطلقة عن الإجابة الصحيحة.",
    holdSeconds: 3,
  },
  {
    id: "outcome",
    phase: "resolved",
    caption:
      "الأقرب يكسب جولة داخلية؛ وبعد 3 جولات فائز التحدي يأخذ نقطة المباراة.",
    holdSeconds: 3.5,
  },
];

/** Preview/test data only. It is never selected as competitive content. */
export const SAMPLE_CLOSEST_TUTORIAL_SCENARIO: ClosestTutorialScenario = {
  kind: "closest",
  version: 1,
  prompt: "كم يبلغ ارتفاع هذا المبنى التقريبي؟",
  teamAEstimate: 110,
  teamBEstimate: 145,
  correctValue: 120,
  unit: "متر",
  outcome: {
    teamADistance: 10,
    teamBDistance: 25,
    winnerTeam: "team-a",
    tie: false,
    mechanicTallyDelta: 1,
    matchPointDelta: 0,
    reason: "closest.absolute-distance",
  },
};
