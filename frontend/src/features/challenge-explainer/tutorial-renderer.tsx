"use client";

import { GameScene } from "./game-scene";
import { FirstNoteExplainer } from "./components/first-note-explainer";
import { EkshifniExplainer } from "./components/ekshifni-explainer";
import { LaTahriqhaExplainer } from "./components/la-tahriqha-explainer";
import type { TutorialScenario } from "./tutorial-scenario";

export const SUPPORTED_TUTORIAL_KINDS = [
  "moving-xo",
  "ryo",
  "closest",
  "bomb",
  "top-5",
  "combo",
  "odd-piece",
  "marhala",
  "first-note",
  "ekshifni",
  "la-tahriqha",
] as const;
export const SUPPORTED_TUTORIAL_MECHANIC_KEYS = SUPPORTED_TUTORIAL_KINDS.filter(
  (kind) => kind !== "moving-xo",
).map((kind) => (kind === "ryo" ? "read-your-opponent" : kind));
export function supportsTutorialScenario(scenario: TutorialScenario) {
  return scenario.kind !== "one-clue" && scenario.kind !== "laqatha";
}
export function MechanicTutorialRenderer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: TutorialScenario;
  compact?: boolean;
  mode?: "player" | "preview";
}) {
  switch (scenario.kind) {
    case "first-note":
      return (
        <FirstNoteExplainer scenario={scenario} compact={compact} mode={mode} />
      );
    case "ekshifni":
      return (
        <EkshifniExplainer scenario={scenario} compact={compact} mode={mode} />
      );
    case "la-tahriqha":
      return (
        <LaTahriqhaExplainer
          scenario={scenario}
          compact={compact}
          mode={mode}
        />
      );
    case "laqatha":
    case "one-clue":
      return null;
    default:
      return <GameScene example={scenario} />;
  }
}
