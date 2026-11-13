"use client";

import type { TutorialScenario } from "./tutorial-scenario";
import { tutorialScenarioKind } from "./tutorial-scenario";
import { ClosestExplainer } from "./components/closest-explainer";
import { BombExplainer } from "./components/bomb-explainer";
import { RyoExplainer, type ExplainerMode } from "./components/ryo-explainer";
import type { RyoTutorialScenario } from "./tutorial-scenario";
import { Top5Explainer } from "./components/top5-explainer";
import { ComboExplainer } from "./components/combo-explainer";
import { MarhalaExplainer } from "./components/marhala-explainer";
import { LaqathaExplainer } from "./components/laqatha-explainer";
import { FirstNoteExplainer } from "./components/first-note-explainer";
import { OddPieceExplainer } from "./components/odd-piece-explainer";
import { EkshifniExplainer } from "./components/ekshifni-explainer";
import { OneClueExplainer } from "./components/one-clue-explainer";
import { LaTahriqhaExplainer } from "./components/la-tahriqha-explainer";

export const SUPPORTED_TUTORIAL_KINDS = [
  "ryo",
  "closest",
  "bomb",
  "top-5",
  "combo",
  "marhala",
  "laqatha",
  "first-note",
  "odd-piece",
  "ekshifni",
  "la-tahriqha",
] as const;

/** Canonical mechanic slugs whose published scenarios have production renderers. */
export const SUPPORTED_TUTORIAL_MECHANIC_KEYS = [
  "read-your-opponent",
  "closest",
  "bomb",
  "top-5",
  "combo",
  "marhala",
  "laqatha",
  "first-note",
  "odd-piece",
  "ekshifni",
  "la-tahriqha",
] as const;

export function supportsTutorialScenario(scenario: TutorialScenario): boolean {
  return (SUPPORTED_TUTORIAL_KINDS as readonly string[]).includes(
    tutorialScenarioKind(scenario),
  );
}

export function MechanicTutorialRenderer({
  scenario,
  compact = false,
  mode = "player",
  showRyoPhonePrompt,
  ryoPhonePerspective,
}: {
  scenario: TutorialScenario;
  compact?: boolean;
  mode?: ExplainerMode;
  showRyoPhonePrompt?: boolean;
  ryoPhonePerspective?: "answering" | "opposing";
}) {
  return tutorialScenarioKind(scenario) === "closest" ? (
    <ClosestExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "closest" }>}
      compact={compact}
      mode={mode}
    />
  ) : tutorialScenarioKind(scenario) === "bomb" ? (
    <BombExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "bomb" }>}
      compact={compact}
      mode={mode}
    />
  ) : tutorialScenarioKind(scenario) === "one-clue" ? (
    <OneClueExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "one-clue" }>}
      compact={compact}
      mode={mode}
    />
  ) : tutorialScenarioKind(scenario) === "ekshifni" ? (
    <EkshifniExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "ekshifni" }>}
      compact={compact}
      mode={mode}
    />
  ) : tutorialScenarioKind(scenario) === "la-tahriqha" ? (
    <LaTahriqhaExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "la-tahriqha" }>}
      compact={compact}
      mode={mode}
    />
  ) : tutorialScenarioKind(scenario) === "top-5" ? (
    <Top5Explainer
      scenario={scenario as Extract<TutorialScenario, { kind: "top-5" }>}
      compact={compact}
      mode={mode}
    />
  ) : tutorialScenarioKind(scenario) === "combo" ? (
    <ComboExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "combo" }>}
      compact={compact}
      mode={mode}
    />
  ) : tutorialScenarioKind(scenario) === "marhala" ? (
    <MarhalaExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "marhala" }>}
      compact={compact}
      mode={mode}
    />
  ) : tutorialScenarioKind(scenario) === "laqatha" ? (
    <LaqathaExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "laqatha" }>}
      compact={compact}
      mode={mode}
    />
  ) : tutorialScenarioKind(scenario) === "first-note" ? (
    <FirstNoteExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "first-note" }>}
      compact={compact}
      mode={mode}
    />
  ) : tutorialScenarioKind(scenario) === "odd-piece" ? (
    <OddPieceExplainer
      scenario={scenario as Extract<TutorialScenario, { kind: "odd-piece" }>}
      compact={compact}
      mode={mode}
    />
  ) : (
    <RyoExplainer
      scenario={scenario as RyoTutorialScenario}
      compact={compact}
      mode={mode}
      showPhonePrompt={showRyoPhonePrompt}
      phonePerspective={ryoPhonePerspective}
    />
  );
}
