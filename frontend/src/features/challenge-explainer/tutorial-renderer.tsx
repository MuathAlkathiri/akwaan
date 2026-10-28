"use client";

import type { TutorialScenario } from "./tutorial-scenario";
import { tutorialScenarioKind } from "./tutorial-scenario";
import { ClosestExplainer } from "./components/closest-explainer";
import { BombExplainer } from "./components/bomb-explainer";
import { RyoExplainer, type ExplainerMode } from "./components/ryo-explainer";

export const SUPPORTED_TUTORIAL_KINDS = ["ryo", "closest", "bomb"] as const;

export function supportsTutorialScenario(scenario: TutorialScenario): boolean {
  return SUPPORTED_TUTORIAL_KINDS.includes(tutorialScenarioKind(scenario));
}

export function MechanicTutorialRenderer({
  scenario,
  compact = false,
  mode = "player",
}: {
  scenario: TutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
}) {
  const kind = tutorialScenarioKind(scenario);
  return kind === "closest" ? (
    <ClosestExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "closest" }>}
      compact={compact}
      mode={mode}
    />
  ) : kind === "bomb" ? (
    <BombExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "bomb" }>}
      compact={compact}
      mode={mode}
    />
  ) : (
    <RyoExplainer
      scenario={scenario as Extract<TutorialScenario, { kind?: "ryo" }>}
      compact={compact}
      mode={mode}
    />
  );
}
