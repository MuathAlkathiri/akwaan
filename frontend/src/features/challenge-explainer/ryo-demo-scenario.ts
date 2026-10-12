/**
 * The demonstration's choreography, and a sample scenario for previews.
 *
 * The *beats* live here permanently: how many there are, what each one is
 * called, and how long it holds are animation concerns, fixed in code so a
 * content editor cannot desynchronise the GSAP timeline from the story.
 *
 * The *scenario* does not. Published tutorial content is authored in Admin and
 * served per mechanic; `SAMPLE_TUTORIAL_SCENARIO` below exists only for tests
 * and the development preview.
 *
 * It is deliberately not a catalog question. The previous fixture copied a live
 * competitive ContentItem, which meant every Preflight published its correct
 * answer while the same item stayed drawable for points. This one is a neutral
 * piece of common knowledge that no Scope is authored around, and the server's
 * overlap guard refuses to publish anything that is a real competitive question.
 */

import type { RyoTutorialScenario } from "./tutorial-scenario";

/** Preview/test data only. Never served to a Match. */
export const SAMPLE_TUTORIAL_SCENARIO: RyoTutorialScenario = {
  prompt: "كم لونًا في قوس قزح؟",
  options: [
    { id: "a", label: "سبعة" },
    { id: "b", label: "خمسة" },
    { id: "c", label: "ستة" },
    { id: "d", label: "ثمانية" },
  ],
  correctOptionId: "a",
  answeringSelectionOptionId: "a",
  opposingDecision: "STEAL",
  // Derived by `RyoPayoffMatrixRule` on the server for a correct answer read as
  // a steal: the reading team called it right, so the point moves to them.
  outcome: {
    teamRole: "opposing",
    delta: 1,
    reason: "ryo.steal.correct",
    correct: true,
  },
};

/** The ordered beats of the demonstration. Phase names are the runtime's own. */
export type RyoDemoStepId =
  | "brief"
  | "answer-locked"
  | "decision-locked"
  | "reveal"
  | "payoff";

export interface RyoDemoStep {
  id: RyoDemoStepId;
  /** The canonical runtime phase this beat sits in. */
  phase: "collecting" | "resolved";
  /** One short line of orientation. The simulation carries the explanation. */
  caption: string;
  /** Seconds this beat holds before the next, at full motion. */
  holdSeconds: number;
}

export const RYO_DEMO_STEPS: readonly RyoDemoStep[] = [
  {
    id: "brief",
    phase: "collecting",
    caption: "فريق يجاوب، وفريق يقرأه — في نفس الوقت.",
    holdSeconds: 3.5,
  },
  {
    id: "answer-locked",
    phase: "collecting",
    caption: "ثبّتوا إجابتهم. ما أحد شاف وش اختاروا.",
    holdSeconds: 3,
  },
  {
    id: "decision-locked",
    phase: "collecting",
    caption: "الفريق الثاني قال «متأكد منهم» — راهن إنهم يعرفون.",
    holdSeconds: 3,
  },
  {
    id: "reveal",
    phase: "resolved",
    caption: "الكشف مرة وحدة: الإجابة وقرار الخصم.",
    holdSeconds: 3.5,
  },
  {
    id: "payoff",
    phase: "resolved",
    caption: "قرأ خصمه صح! +1 للفريق الثاني.",
    holdSeconds: 3.5,
  },
];

export const RYO_DEMO_TOTAL_SECONDS = RYO_DEMO_STEPS.reduce(
  (total, step) => total + step.holdSeconds,
  0,
);
