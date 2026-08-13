/**
 * The Match contract, as one preconfigured Match exposes it.
 *
 * There is one setup mode and one journey: a Match is fully configured before it
 * exists, opens at its board with twelve playable positions, and moves between
 * exactly the four stages below. Nothing here describes a sequential setup,
 * because the server no longer has one.
 */

export type MatchStageKey =
  /** All twelve positions, any of them selectable. */
  | "board"
  /** One position is prepared and waiting on the phones its mechanic needs. */
  | "preflight"
  /** A mechanic runtime is in progress. */
  | "challenge"
  /**
   * The challenge is over and recorded, and the Match is deliberately standing
   * on it. Scoring already happened; only an explicit host action leaves here.
   */
  | "challenge_result"
  | "match_complete";

const MATCH_STAGE_KEYS: readonly MatchStageKey[] = [
  "board",
  "preflight",
  "challenge",
  "challenge_result",
  "match_complete",
];

/**
 * Whether a stage key is one this client can render.
 *
 * An unknown value is never mapped onto a neighbouring stage: the client and the
 * server disagreeing is a recoverable error, not something to guess through.
 */
export function isMatchStageKey(value: string): value is MatchStageKey {
  return (MATCH_STAGE_KEYS as readonly string[]).includes(value);
}

export type MatchStatus = "active" | "completed" | "cancelled";

export type MatchSlotKey = "slot_1" | "slot_2" | "slot_3" | "slot_4";
export type MatchSlotLaunchability =
  "launchable" | "configured_but_unimplemented" | "unavailable";
export type MatchSlotStatus =
  "available" | "in_progress" | "completed" | "unavailable";

export interface MatchTeamScore {
  teamId: string;
  signedTotal: number;
  displayTotal: number;
}

export interface MatchTeamStanding extends MatchTeamScore {
  name: string;
}

export interface MatchScopeSummary {
  scopeId: string;
  name: string;
}

/** Why a board position cannot be played. */
export type UnifiedUnavailableReason =
  /** The configured mechanic has no launcher on the server. */
  | "launcher_not_implemented"
  /** The Match holds no usable configuration for this position. */
  | "invalid_configuration";

/** One of the twelve positions of a Match board. */
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

/** One configured World occurrence of a Match. */
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
  doubleControl?: {
    teamId: string;
    status: "available" | "armed";
    assignmentSequence: number;
  };
}

/**
 * The preconfigured contract: three configured occurrences and one board of twelve
 * independently playable positions.
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

/**
 * One finished challenge, as the server recorded it.
 *
 * Everything on the result screen is read from here. The winner, the points, and
 * the Top 5 ownership reveal order are all server decisions — this client renders
 * them and never derives them.
 */
export interface MatchChallengeResult {
  id: string;
  positionKey: string;
  occurrenceIndex: number;
  slotKey: MatchSlotKey;
  worldId: string;
  worldName?: string;
  challengeTypeId: string;
  /** The mechanic that ran, which is what picks the result renderer. */
  challengeKey: string;
  challengeName?: string;
  selectedScopeIds: string[];
  winnerTeamId: string | null;
  /** True when the mechanic declared no winner, so no Match point was awarded. */
  tie: boolean;
  double?: { consumedTeamIds: string[]; appliedTeamId: string | null };
  /**
   * The **Match** points this challenge moved: `+1` to the winner, `0` to the
   * loser, `0` to both on a tie. A Match point means "won a challenge", so this
   * is never the mechanic's internal margin — that lives in `details`.
   */
  matchPoints: Array<{ teamId: string; points: number }>;
  /** Mechanic-shaped and opaque here; each mechanic's own view reads it. */
  details: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
}

export interface LiveSessionMatchSnapshot {
  id: string;
  revision: number;
  status: MatchStatus | (string & {});
  stage: {
    key: MatchStageKey | (string & {});
    enteredAt: string;
    minimumDisplayDurationMs: number;
    audioCue: string | null;
    animationCue: string | null;
  };
  /** The whole board and its three occurrences; the board's only source. */
  unified: UnifiedMatchProjection;
  currentChallenge?: {
    occurrenceIndex: number;
    slotKey: MatchSlotKey;
    challengeKey: string;
    runtimeId: string;
    startedAt: string;
    doubledTeamIds?: string[];
  };
  doubles?: Array<{
    teamId: string;
    status: "available" | "armed" | "consumed";
  }>;
  scoring: {
    matchTotals: MatchTeamScore[];
    worldSubtotals: MatchTeamScore[];
  };
  /** Both teams with names and totals, for a board header. */
  standings?: MatchTeamStanding[];
  /** Present exactly while the stage is `challenge_result`. */
  challengeResult?: MatchChallengeResult;
  /** Append-only history of every finished challenge, oldest first. */
  challengeHistory?: MatchChallengeResult[];
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

export interface MatchChangedEvent {
  matchId: string;
  matchRevision: number;
  stage: string;
  status: string;
  reason: string;
}

export type MatchActor = "controller" | "shared-screen" | "participant";

/**
 * Boundary check for an optional network projection; it validates shape, not rules.
 *
 * The unified projection is required: a Match without a board is not something
 * this client can render, and pretending otherwise would land the host on an
 * empty screen instead of an error they can act on.
 */
export function parseMatchSnapshot(
  value: unknown,
): LiveSessionMatchSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<LiveSessionMatchSnapshot>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.revision !== "number" ||
    typeof candidate.status !== "string" ||
    !candidate.stage ||
    typeof candidate.stage.key !== "string" ||
    !candidate.unified ||
    !Array.isArray(candidate.unified.occurrences) ||
    !Array.isArray(candidate.unified.board?.positions) ||
    !candidate.scoring ||
    !Array.isArray(candidate.scoring.matchTotals) ||
    !Array.isArray(candidate.availableActions)
  ) {
    return undefined;
  }
  return candidate as LiveSessionMatchSnapshot;
}
