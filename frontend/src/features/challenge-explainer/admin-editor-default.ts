// Empty form defaults for the legacy admin editor.
import type { OneClueTutorialScenario } from "./tutorial-scenario";

export const SAMPLE_ONE_CLUE_TUTORIAL_SCENARIO: OneClueTutorialScenario = {
  kind: "one-clue",
  version: 1,
  prompt: "",
  clues: [
    { order: 1, value: 5, text: "" },
    { order: 2, value: 4, text: "" },
    { order: 3, value: 3, text: "" },
    { order: 4, value: 2, text: "" },
    { order: 5, value: 1, text: "" },
  ],
  acceptedAnswer: "",
  firstSubmittedAnswer: "",
  secondSubmittedAnswer: "",
  caption: "",
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
