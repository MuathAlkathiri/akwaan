export type ExplainerMode = "player" | "preview";
export { ExplainerControls } from "./components/explainer-controls";
export { InlineMechanicTutorial } from "./components/inline-mechanic-tutorial";
export { FirstNoteExplainer } from "./components/first-note-explainer";
export { EkshifniExplainer } from "./components/ekshifni-explainer";
export { LaTahriqhaExplainer } from "./components/la-tahriqha-explainer";
export {
  MechanicTutorialRenderer,
  supportsTutorialScenario,
  SUPPORTED_TUTORIAL_KINDS,
  SUPPORTED_TUTORIAL_MECHANIC_KEYS,
} from "./tutorial-renderer";
export {
  useExplainerTimeline,
  usePrefersReducedMotion,
  EXPLAINER_LOOP_HOLD_SECONDS,
  EXPLAINER_VISIBILITY_THRESHOLD,
  type ExplainerTimeline,
  type ExplainerTimelineOptions,
} from "./use-explainer-timeline";
export * from "./admin-editor-default";
export * from "./top5-demo-scenario";
export * from "./combo-demo-scenario";
export * from "./marhala-demo-scenario";
export * from "./first-note-demo-scenario";
export * from "./odd-piece-demo-scenario";
export * from "./ekshifni-demo-scenario";
export * from "./la-tahriqha-demo-scenario";
export * from "./tutorial-scenario";
export { usePublishedTutorial } from "./use-published-tutorial";
