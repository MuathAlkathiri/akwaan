/**
 * The Match projection carried on an authoritative live-session snapshot.
 *
 * The snapshot contract belongs to live-game-sessions, so the *shape* is declared
 * here while the Match module produces the value. That keeps the dependency arrow
 * pointing match -> live-game-sessions and avoids a second client protocol.
 */

export interface LiveSessionMatchStageProjection {
  key: string;
  enteredAt: string;
  minimumDisplayDurationMs: number;
  audioCue: string | null;
  animationCue: string | null;
}

export interface LiveSessionMatchTeamScore {
  teamId: string;
  signedTotal: number;
  displayTotal: number;
}

export interface LiveSessionMatchBoardSlot {
  slotKey: string;
  challengeTypeId?: string;
  challengeKey?: string;
  challengeName?: string;
  launchability: string;
  status: string;
  runtimeId?: string;
  completedAt?: string;
  scoreSummary?: LiveSessionMatchTeamScore[];
}

export interface LiveSessionMatchScope {
  scopeId: string;
  name: string;
}

/** Why a board position cannot be played. */
export type LiveSessionUnifiedUnavailableReason =
  /** The configured mechanic has no launcher yet. */
  | 'launcher_not_implemented'
  /** The Match holds no configuration for this position. */
  | 'invalid_configuration';

/** One of the twelve positions of a preconfigured Match board. */
export interface LiveSessionUnifiedBoardPosition {
  /** `occurrenceIndex + slotKey`. Never derived from worldId. */
  positionKey: string;
  occurrenceIndex: number;
  worldId: string;
  /** The World's name as this Match captured it at configuration time. */
  worldName?: string;
  slotKey: string;
  challengeTypeId: string;
  challengeKey: string;
  challengeName: string;
  description?: string;
  instructions?: string;
  /**
   * Whether the mechanic needs private input from player phones. Declared by the
   * mechanic's launcher — never inferred from a slug.
   */
  requiresPhones: boolean;
  launchability: string;
  status: string;
  unavailableReason?: LiveSessionUnifiedUnavailableReason;
  runtimeId?: string;
  completedAt?: string;
  scoreSummary?: LiveSessionMatchTeamScore[];
}

/** One configured World occurrence of a preconfigured Match. */
export interface LiveSessionConfiguredOccurrence {
  occurrenceIndex: number;
  worldId: string;
  /** As captured at configuration time; a later rename does not reach a Match. */
  worldName?: string;
  /** Exactly four; the only Scopes this occurrence's positions draw from. */
  selectedScopeIds: string[];
  /** Public names only; nothing about the content inside them. */
  selectedScopes: LiveSessionMatchScope[];
  completedAt?: string;
  subtotals: LiveSessionMatchTeamScore[];
}

/**
 * Everything a preconfigured Match exposes that the sequential journey has no
 * equivalent for. Present only when `setupMode` is `unified_preconfigured`.
 */
export interface LiveSessionUnifiedMatchProjection {
  occurrences: LiveSessionConfiguredOccurrence[];
  board: {
    positions: LiveSessionUnifiedBoardPosition[];
    /** Twelve. */
    totalPositionCount: number;
    completedPositionCount: number;
  };
  /** The team whose turn it is to choose any available position. */
  selectingTeamId?: string;
  /** Present only while a position is prepared and waiting on its phones. */
  preflight?: LiveSessionUnifiedPreflight;
}

/** One team's phones, measured against what the mechanic needs. */
export interface LiveSessionPreflightTeam {
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

/** Why a prepared challenge cannot start yet. */
export interface LiveSessionPreflightBlocker {
  code: string;
  teamId?: string;
  teamName?: string;
  connectedCount?: number;
  required?: number;
}

/**
 * A board position that has been chosen and is waiting on its phones.
 *
 * Present exactly while the Match is in its `preflight` stage. No runtime exists,
 * no content has been drawn, and the position is still available — so a cancel
 * leaves no trace. Nothing private to a mechanic or a ContentItem appears here.
 */
export interface LiveSessionUnifiedPreflight {
  positionKey: string;
  occurrenceIndex: number;
  slotKey: string;
  worldId: string;
  worldName?: string;
  challengeTypeId: string;
  challengeKey: string;
  challengeName: string;
  description?: string;
  instructions?: string;
  requiresPhones: boolean;
  /** The occurrence's four Scopes, by public name. */
  selectedScopes: LiveSessionMatchScope[];
  /** Absent for a mechanic that needs no phones. */
  join?: {
    joinCode: string;
    /** Relative; the client makes it absolute with its own origin for the QR. */
    joinPath: string;
    expiresAt?: string;
  };
  requirement?: {
    minParticipantsPerTeam: number;
    maxParticipantsPerTeam?: number;
    requiresBothTeams: boolean;
  };
  teams: LiveSessionPreflightTeam[];
  allTeamsReady: boolean;
  /** The single answer the Start button reads. */
  readyToLaunch: boolean;
  blockingReasons: LiveSessionPreflightBlocker[];
  selectingTeamId?: string;
  preparedAt: string;
}

/** A team as the board header shows it: name and current totals. */
export interface LiveSessionMatchTeamStanding {
  teamId: string;
  name: string;
  signedTotal: number;
  displayTotal: number;
}

export interface LiveSessionMatchProjection {
  id: string;
  revision: number;
  /**
   * `legacy_sequential` or `unified_preconfigured`. Always present, so a client
   * never has to guess which contract the rest of this projection follows.
   */
  setupMode: string;
  status: string;
  stage: LiveSessionMatchStageProjection;
  coinToss: {
    status: 'pending' | 'resolved';
    winnerTeamId?: string;
    firstChooserTeamId?: string;
  };
  worldSelection: {
    selections: Array<{
      occurrenceIndex: number;
      worldId: string;
      method: string;
      selectedByTeamId?: string;
      selectedAt: string;
    }>;
    nextTeamId?: string;
    requiresAgreement: boolean;
    remainingCount: number;
    complete: boolean;
  };
  /**
   * The preconfigured Match contract: three configured occurrences and one board
   * of twelve independently playable positions. Absent for legacy Matches.
   */
  unified?: LiveSessionUnifiedMatchProjection;
  /** @deprecated Legacy sequential only. */
  currentOccurrence?: {
    index: number;
    worldId: string;
    status: 'in_progress' | 'completed';
    /** The four Scopes this occurrence draws its content from. */
    selectedScopeIds: string[];
    /** Public names only; nothing about the content inside them. */
    selectedScopes: LiveSessionMatchScope[];
    scopeSelectionComplete: boolean;
  };
  /**
   * Present only while this occurrence still owes its Scopes.
   *
   * @deprecated Legacy sequential only.
   */
  scopeSelection?: {
    occurrenceIndex: number;
    worldId: string;
    required: number;
    selectedScopeIds: string[];
  };
  /**
   * The current occurrence's board. Absent until its Scope selection is complete,
   * and absent entirely for a unified Match, which projects all twelve positions
   * under `unified.board` instead.
   *
   * @deprecated Legacy sequential only.
   */
  board?: { slots: LiveSessionMatchBoardSlot[] };
  currentChallenge?: {
    occurrenceIndex: number;
    slotKey: string;
    challengeKey: string;
    runtimeId: string;
    startedAt: string;
  };
  scoring: {
    matchTotals: LiveSessionMatchTeamScore[];
    worldSubtotals: LiveSessionMatchTeamScore[];
  };
  /**
   * Both teams with their names and totals, so a board header needs no second
   * lookup to say who is playing and who is leading.
   */
  standings: LiveSessionMatchTeamStanding[];
  result?: {
    teams: LiveSessionMatchTeamScore[];
    winnerTeamId: string | null;
    tie: boolean;
    worlds: Array<{
      occurrenceIndex: number;
      worldId: string;
      subtotals: LiveSessionMatchTeamScore[];
      completedAt?: string;
    }>;
  };
  availableActions: string[];
}
