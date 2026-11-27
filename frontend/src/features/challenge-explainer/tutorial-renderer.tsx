"use client";

import { GameScene } from "./game-scene";
import type { SceneWorldContext } from "./scene-projection";
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
  world,
}: {
  scenario: TutorialScenario;
  world?: SceneWorldContext;
  compact?: boolean;
  mode?: "player" | "preview";
}) {
  if (scenario.kind === "laqatha" || scenario.kind === "one-clue") return null;
  return <GameScene example={scenario} {...(world ? { world } : {})} />;
}
