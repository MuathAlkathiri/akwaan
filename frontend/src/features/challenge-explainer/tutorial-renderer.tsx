"use client";

import type { TutorialScenario } from "./tutorial-scenario";
import { tutorialScenarioKind } from "./tutorial-scenario";
import { ClosestExplainer } from "./components/closest-explainer";
import { RyoExplainer, type ExplainerMode } from "./components/ryo-explainer";

export const SUPPORTED_TUTORIAL_KINDS = ["ryo", "closest"] as const;

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
  return tutorialScenarioKind(scenario) === "closest" ? (
    <ClosestExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "closest" }>}
      compact={compact}
      mode={mode}
    />
  ) : (
    <RyoExplainer
      scenario={scenario as Exclude<TutorialScenario, { kind: "closest" }>}
      compact={compact}
      mode={mode}
    />
  );
}
