export { MatchSetupWizard } from "./components/match-setup-wizard";
export { MATCH_SETUP_ROUTE, matchSetupRouteForWorld } from "./routes";
export {
  BOARD_POSITION_COUNT,
  OCCURRENCE_COUNT,
  SCOPES_PER_OCCURRENCE,
  completedOccurrenceCount,
  createDraft,
  isDraftComplete,
  isOccurrenceComplete,
  matchSetupReducer,
  occurrenceLabel,
  selectedScopeTotal,
  toCreateUnifiedMatchRequest,
  type DraftOccurrence,
  type MatchSetupAction,
  type MatchSetupDraft,
  type MatchSetupStep,
} from "./state/match-setup-draft";
export {
  MATCH_SETUP_DRAFT_STORAGE_KEY,
  MATCH_SETUP_DRAFT_VERSION,
  clearStoredDraft,
  readStoredDraft,
  writeStoredDraft,
} from "./state/match-setup-storage";
export { matchBoardRoute, useMatchSetup } from "./state/use-match-setup";
export {
  createConfiguredMatch,
  MatchSetupFailure,
  type ConfiguredMatchCreation,
} from "./api/create-configured-match";
export {
  cancelUnifiedPreflight,
  continueFromChallengeResult,
  createUnifiedMatch,
  launchUnifiedChallenge,
  markLiveSessionReady,
  prepareUnifiedChallenge,
  startLiveSession,
  type ConfiguredOccurrenceRequest,
  type CreateUnifiedMatchRequest,
} from "./api/unified-match.api";
export {
  toMatchSetupError,
  type MatchSetupError,
} from "./errors/match-setup-errors";
