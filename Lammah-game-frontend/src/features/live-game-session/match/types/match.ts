export type MatchStageKey =
  | "lobby"
  | "coin_toss"
  | "world_selection"
  | "scope_selection"
  | "board"
  /** Unified only: a position is chosen and waiting on its phones. */
  | "preflight"
  | "challenge"
  | "world_complete"
  | "match_complete";

const MATCH_STAGE_KEYS: readonly MatchStageKey[] = [
  "lobby",
  "coin_toss",
  "world_selection",
  "scope_selection",
  "board",
  "preflight",
  "challenge",
  "world_complete",
  "match_complete",
];

export function isMatchStageKey(value: string): value is MatchStageKey {
  return (MATCH_STAGE_KEYS as readonly string[]).includes(value);
}

export type MatchStatus = "draft" | "active" | "completed" | "cancelled";

/**
 * How a Match was set up, and therefore which contract the rest of its snapshot
 * follows. Always present; a Match stored before the unified redesign reports
 * `legacy_sequential`.
 */
export type MatchSetupMode = "legacy_sequential" | "unified_preconfigured";

export const UNIFIED_SETUP_MODE = "unified_preconfigured";

export type MatchWorldSelectionMethod =
  | "team_pick"
  | "agreed"
  | "random"
  /** The only method a preconfigured Match records. */
  | "preconfigured";
export type MatchSlotKey = "slot_1" | "slot_2" | "slot_3" | "slot_4";
export type MatchSlotLaunchability =
  | "launchable"
  | "configured_but_unimplemented"
  | "unavailable";
export type MatchSlotStatus =
  | "available"
  | "in_progress"
  | "completed"
  | "unavailable";

export interface MatchTeamScore {
  teamId: string;
  signedTotal: number;
  displayTotal: number;
}

export interface MatchTeamStanding extends MatchTeamScore {
  name: string;
}

export interface MatchBoardSlot {
  slotKey: MatchSlotKey;
  challengeTypeId?: string;
  challengeKey?: string;
  challengeName?: string;
  launchability: MatchSlotLaunchability;
  status: MatchSlotStatus;
  runtimeId?: string;
  completedAt?: string;
  scoreSummary?: MatchTeamScore[];
}

/** Why a board position cannot be played. */
export type UnifiedUnavailableReason =
  | "launcher_not_implemented"
  | "invalid_configuration";

/** One of the twelve positions of a preconfigured Match board. */
export interface UnifiedBoardPosition {
  /** `occurrenceIndex + slotKey`. Never derived from worldId. */
  positionKey: string;
  occurrenceIndex: number;
  worldId: string;
  /** As the Match captured it when it was configured. */
  worldName?: string;
  slotKey: MatchSlotKey;
  challengeTypeId: string;
  challengeKey: string;
  challengeName: string;
  description?: string;
  instructions?: string;
  /**
   * Declared by the mechanic's server-side launcher. Never inferred here from a
   * slug — the frontend has no business knowing which mechanics need phones.
   */
  requiresPhones: boolean;
  launchability: MatchSlotLaunchability;
  status: MatchSlotStatus;
  unavailableReason?: UnifiedUnavailableReason;
  runtimeId?: string;
  completedAt?: string;
  scoreSummary?: MatchTeamScore[];
}

/** One configured World occurrence of a preconfigured Match. */
export interface UnifiedConfiguredOccurrence {
  occurrenceIndex: number;
  worldId: string;
  worldName?: string;
  /** Exactly four; the only Scopes this occurrence's positions draw from. */
  selectedScopeIds: string[];
  selectedScopes: MatchScopeSummary[];
  completedAt?: string;
  subtotals: MatchTeamScore[];
}

/** One team's phones, measured against what the mechanic needs. */
export interface PreflightTeam {
  teamId: string;
  teamName: string;
  connectedCount: number;
  minimum: number;
  maximum?: number;
  ready: boolean;
  participants: Array<{
    participantId: string;
    displayName: string;
    connected: boolean;
  }>;
}

export interface PreflightBlocker {
  code: string;
  teamId?: string;
  teamName?: string;
  connectedCount?: number;
  required?: number;
}

/**
 * A board position that has been chosen and is waiting on its phones.
 *
 * Present exactly while the Match is in its `preflight` stage. No runtime exists
 * yet and no content has been drawn — this is the whole state the preflight screen
 * renders, so a refresh restores it unchanged.
 */
export interface UnifiedPreflight {
  positionKey: string;
  occurrenceIndex: number;
  slotKey: MatchSlotKey;
  worldId: string;
  worldName?: string;
  challengeTypeId: string;
  challengeKey: string;
  challengeName: string;
  description?: string;
  instructions?: string;
  requiresPhones: boolean;
  selectedScopes: MatchScopeSummary[];
  join?: {
    joinCode: string;
    /** Relative; the client makes it absolute with its own origin. */
    joinPath: string;
    expiresAt?: string;
  };
  requirement?: {
    minParticipantsPerTeam: number;
    maxParticipantsPerTeam?: number;
    requiresBothTeams: boolean;
  };
  teams: PreflightTeam[];
  allTeamsReady: boolean;
  /** The single answer the Start button reads. */
  readyToLaunch: boolean;
  blockingReasons: PreflightBlocker[];
  selectingTeamId?: string;
  preparedAt: string;
}

/**
 * The preconfigured contract: three configured occurrences and one board of twelve
 * independently playable positions. Absent for legacy Matches.
 */
export interface UnifiedMatchProjection {
  occurrences: UnifiedConfiguredOccurrence[];
  board: {
    positions: UnifiedBoardPosition[];
    /** Twelve. */
    totalPositionCount: number;
    completedPositionCount: number;
  };
  /** The team whose turn it is to choose any available position. */
  selectingTeamId?: string;
  /** Present only while a position is prepared and waiting on its phones. */
  preflight?: UnifiedPreflight;
}

export interface LiveSessionMatchSnapshot {
  id: string;
  revision: number;
  setupMode: MatchSetupMode | (string & {});
  status: MatchStatus;
  stage: {
    key: MatchStageKey | (string & {});
    enteredAt: string;
    minimumDisplayDurationMs: number;
    audioCue: string | null;
    animationCue: string | null;
  };
  coinToss: {
    status: "pending" | "resolved";
    winnerTeamId?: string;
    firstChooserTeamId?: string;
  };
  worldSelection: {
    selections: Array<{
      occurrenceIndex: number;
      worldId: string;
      method: MatchWorldSelectionMethod;
      selectedByTeamId?: string;
      selectedAt: string;
    }>;
    nextTeamId?: string;
    requiresAgreement: boolean;
    remainingCount: number;
    complete: boolean;
  };
  /** Present only for a preconfigured Match. */
  unified?: UnifiedMatchProjection;
  /** @deprecated Legacy sequential only. */
  currentOccurrence?: {
    index: number;
    worldId: string;
    status: "in_progress" | "completed";
    /** The four Scopes this occurrence draws its content from. */
    selectedScopeIds: string[];
    selectedScopes: MatchScopeSummary[];
    scopeSelectionComplete: boolean;
  };
  /** Present only while this occurrence still owes its Scopes. */
  scopeSelection?: {
    occurrenceIndex: number;
    worldId: string;
    required: number;
    selectedScopeIds: string[];
  };
  /** Absent until the occurrence's Scope selection is complete. */
  board?: { slots: MatchBoardSlot[] };
  currentChallenge?: {
    occurrenceIndex: number;
    slotKey: MatchSlotKey;
    challengeKey: string;
    runtimeId: string;
    startedAt: string;
  };
  scoring: {
    matchTotals: MatchTeamScore[];
    worldSubtotals: MatchTeamScore[];
  };
  /** Both teams with names and totals, for a board header. */
  standings?: MatchTeamStanding[];
  result?: {
    teams: MatchTeamScore[];
    winnerTeamId: string | null;
    tie: boolean;
    worlds: Array<{
      occurrenceIndex: number;
      worldId: string;
      subtotals: MatchTeamScore[];
      completedAt?: string;
    }>;
  };
  availableActions: string[];
}

export interface MatchScopeSummary {
  scopeId: string;
  name: string;
}

export interface MatchSelectableScope {
  scopeId: string;
  name: string;
  readyContentItemCount: number;
}

export interface MatchSelectableWorld {
  worldId: string;
  name: string;
  boardReady: boolean;
  hasRelationalChallenge: boolean;
  slotKeys: MatchSlotKey[];
}

export interface MatchChangedEvent {
  matchId: string;
  matchRevision: number;
  stage: string;
  status: string;
  reason: string;
}

export type MatchActor = "controller" | "shared-screen" | "participant";

/** Boundary check for an optional network projection; it validates shape, not rules. */
export function parseMatchSnapshot(
  value: unknown,
): LiveSessionMatchSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<LiveSessionMatchSnapshot>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.revision !== "number" ||
    typeof candidate.setupMode !== "string" ||
    typeof candidate.status !== "string" ||
    !candidate.stage ||
    typeof candidate.stage.key !== "string" ||
    !candidate.coinToss ||
    !candidate.worldSelection ||
    !Array.isArray(candidate.worldSelection.selections) ||
    (candidate.board !== undefined &&
      !Array.isArray(candidate.board.slots)) ||
    (candidate.unified !== undefined &&
      (!Array.isArray(candidate.unified.occurrences) ||
        !Array.isArray(candidate.unified.board?.positions))) ||
    !candidate.scoring ||
    !Array.isArray(candidate.scoring.matchTotals) ||
    !Array.isArray(candidate.availableActions)
  ) {
    return undefined;
  }
  return candidate as LiveSessionMatchSnapshot;
}
