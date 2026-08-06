import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';

/**
 * Vocabulary for the Match orchestration layer.
 *
 * A Match sits above LiveGameSession and GameplayRuntime: it owns the journey
 * (toss, World selection, board, completion) and never the inside of a mechanic.
 */

export enum MatchStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/**
 * How a Match was set up, and therefore which journey it obeys.
 *
 * This is persisted rather than inferred: a stored Match written before the
 * unified redesign must keep playing the flow it was created for, and a new
 * Match must never be reinterpreted as the other kind.
 */
export enum MatchSetupMode {
  /**
   * @deprecated Phase 5 removes this flow. World and Scope selection happen
   * inside gameplay, one occurrence at a time, and the board only ever shows the
   * occurrence at `currentOccurrenceIndex`. No new client may be built against
   * it — see `docs/UNIFIED_MATCH_PHASE_1_ARCHITECTURE.md`.
   */
  LEGACY_SEQUENTIAL = 'legacy_sequential',
  /**
   * The whole Match — three World occurrences with four Scopes each — is
   * configured before gameplay begins, and every one of the twelve board
   * positions is playable from the first moment.
   */
  UNIFIED_PRECONFIGURED = 'unified_preconfigured',
}

export enum MatchStage {
  LOBBY = 'lobby',
  COIN_TOSS = 'coin_toss',
  WORLD_SELECTION = 'world_selection',
  /**
   * The four Scopes of the current World occurrence. Kept apart from
   * world_selection because it is answered once per occurrence, not once
   * per match, and a repeated World answers it again.
   */
  SCOPE_SELECTION = 'scope_selection',
  BOARD = 'board',
  /**
   * Unified only: a board position has been chosen and is waiting on the phones the
   * mechanic needs. No runtime exists yet, no content has been drawn, and the
   * position is still available — cancelling leaves no trace.
   */
  PREFLIGHT = 'preflight',
  /** Wraps a mechanic runtime; the plugin owns its own internal phases. */
  CHALLENGE = 'challenge',
  /**
   * @deprecated Legacy sequential only. A unified Match has no "next World" to
   * announce, so it never enters this stage.
   */
  WORLD_COMPLETE = 'world_complete',
  MATCH_COMPLETE = 'match_complete',
}

export enum MatchSlotStatus {
  AVAILABLE = 'available',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  /** No launcher is registered for the configured mechanic. */
  UNAVAILABLE = 'unavailable',
}

/**
 * Whether a configured board slot can actually be played right now. Nothing is
 * ever silently skipped or auto-completed: an unimplemented mechanic is reported
 * as such and refuses to launch.
 */
export enum MatchSlotLaunchability {
  LAUNCHABLE = 'launchable',
  CONFIGURED_BUT_UNIMPLEMENTED = 'configured_but_unimplemented',
  UNAVAILABLE = 'unavailable',
}

export enum WorldSelectionMethod {
  /** A team picked it outright. */
  TEAM_PICK = 'team_pick',
  /** Both teams agreed on the third World. */
  AGREED = 'agreed',
  /** Server-resolved 50/50 for the third World. */
  RANDOM = 'random',
  /**
   * Chosen during pre-match setup, before any gameplay. The only method a
   * unified Match ever records.
   */
  PRECONFIGURED = 'preconfigured',
}

/** Roadmap 3: every Match plays exactly three World occurrences. */
export const MATCH_WORLD_OCCURRENCE_COUNT = 3;

/**
 * A unified Match has no "current" World occurrence: all three are playable at
 * once. This sentinel is stored instead of a real index so any code that still
 * reaches for `currentOccurrenceIndex` as an authority finds nothing rather than
 * silently reading occurrence 0.
 */
export const MATCH_NO_CURRENT_OCCURRENCE = -1;

/** Item cardinality each launchable mechanic requires from content selection. */
export const MATCH_CONTENT_CARDINALITY: Readonly<Record<string, number>> = {
  'read-your-opponent': 3,
  'top-10': 1,
};

/**
 * Presentation hints for a stage transition. Hints only: the mechanic runtime
 * remains the sole timing authority for gameplay, and a client must never derive
 * an outcome from these.
 */
export interface MatchStagePresentation {
  minimumDisplayDurationMs: number;
  audioCue: string | null;
  animationCue: string | null;
}

export const MATCH_STAGE_PRESENTATION: Readonly<
  Record<MatchStage, MatchStagePresentation>
> = {
  [MatchStage.LOBBY]: {
    minimumDisplayDurationMs: 0,
    audioCue: null,
    animationCue: null,
  },
  [MatchStage.COIN_TOSS]: {
    minimumDisplayDurationMs: 3500,
    audioCue: 'coin-spin',
    animationCue: 'coin-toss',
  },
  [MatchStage.WORLD_SELECTION]: {
    minimumDisplayDurationMs: 0,
    audioCue: 'world-select',
    animationCue: 'world-carousel',
  },
  [MatchStage.SCOPE_SELECTION]: {
    minimumDisplayDurationMs: 0,
    audioCue: 'world-select',
    animationCue: 'scope-carousel',
  },
  [MatchStage.BOARD]: {
    minimumDisplayDurationMs: 0,
    audioCue: 'board-enter',
    animationCue: 'board-reveal',
  },
  [MatchStage.PREFLIGHT]: {
    minimumDisplayDurationMs: 0,
    audioCue: null,
    animationCue: 'challenge-intro',
  },
  [MatchStage.CHALLENGE]: {
    minimumDisplayDurationMs: 0,
    audioCue: null,
    animationCue: 'challenge-intro',
  },
  [MatchStage.WORLD_COMPLETE]: {
    minimumDisplayDurationMs: 4000,
    audioCue: 'world-complete',
    animationCue: 'world-complete',
  },
  [MatchStage.MATCH_COMPLETE]: {
    minimumDisplayDurationMs: 6000,
    audioCue: 'winner-fanfare',
    animationCue: 'winner-reveal',
  },
};

/** Every World occurrence draws its content from exactly this many Scopes. */
export const MATCH_SCOPES_PER_OCCURRENCE = 4;

/** Board positions a Match may schedule, in board order. */
export const MATCH_SLOT_ORDER: readonly WorldChallengeSlotKey[] = [
  WorldChallengeSlotKey.SLOT_1,
  WorldChallengeSlotKey.SLOT_2,
  WorldChallengeSlotKey.SLOT_3,
  WorldChallengeSlotKey.SLOT_4,
];

/**
 * Roadmap 3: three occurrences × four positions. A unified Match initialises all
 * twelve before gameplay starts and never grows or shrinks the set.
 */
export const MATCH_UNIFIED_BOARD_POSITION_COUNT =
  MATCH_WORLD_OCCURRENCE_COUNT * MATCH_SLOT_ORDER.length;
