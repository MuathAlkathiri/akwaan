/**
 * Domain vocabulary for the World Content architecture
 * (World -> Scope -> ChallengeType -> ContentItem).
 *
 * Every rule the roadmap states as a number lives here as a named constant so
 * board composition, readiness, and match selection never restate a literal.
 */

export enum WorldContentStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum ContentItemStatus {
  DRAFT = 'draft',
  READY = 'ready',
  ARCHIVED = 'archived',
}

export enum ChallengeFamily {
  SIGNATURE = 'signature',
  RYO = 'ryo',
  COOP = 'coop',
  RELATIONAL = 'relational',
}

export enum ChallengeItemStructure {
  /** Three discrete items played in sequence. */
  DISCRETE_TRIPLE = 'discrete_triple',
  /** One continuous unit that still consumes a three-item slot budget. */
  CONTINUOUS = 'continuous',
}

export enum ChallengeAnswerMode {
  RYO = 'ryo',
  MULTIPLE_CHOICE = 'multiple_choice',
  CLOSEST = 'closest',
  MATCH = 'match',
  VOTE = 'vote',
  SPLIT = 'split',
  TOP_5 = 'top_5',
  /** Cars Signature: four visual pieces with one server-graded intruder. */
  ODD_PIECE = 'odd_piece',
  /** Progressive five-clue wrapper; ContentItems keep a MATCH answer payload. */
  ONE_CLUE = 'one_clue',
  /**
   * "ركّبها" wraps a machine-checkable prompt the way RYO does: the mechanic
   * supplies the private split, and the item keeps whichever answer contract it
   * already had.
   */
  RAKKIBHA = 'rakkibha',
  /**
   * Movies Signature "القطها": a five-clue race whose ContentItems keep a MATCH
   * answer payload; each clue may be text, image, or audio.
   */
  LAQATHA = 'laqatha',
  /** Music Signature auction; ContentItems retain a MATCH answer payload. */
  FIRST_NOTE = 'first_note',
}

/** A generic board position. Gameplay meaning comes from its Challenge Type. */
export enum WorldChallengeSlotKey {
  SLOT_1 = 'slot_1',
  SLOT_2 = 'slot_2',
  SLOT_3 = 'slot_3',
  SLOT_4 = 'slot_4',
}

export const WORLD_BOARD_SLOT_KEYS: readonly WorldChallengeSlotKey[] = [
  WorldChallengeSlotKey.SLOT_1,
  WorldChallengeSlotKey.SLOT_2,
  WorldChallengeSlotKey.SLOT_3,
  WorldChallengeSlotKey.SLOT_4,
];

export enum ContentMediaType {
  NONE = 'none',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
}

export enum VoteConsensusRule {
  EXACT = 'exact',
  MAJORITY = 'majority',
  TEAM_MATCH = 'team_match',
}

/** Every World board has exactly four generic positions. */
export const WORLD_BOARD_SLOT_COUNT = 4;

/** Items per challenge slot (roadmap 3.3). Pacing only; not enforced here. */
export const CHALLENGE_ITEMS_PER_SLOT = 3;

/** Match-level selection (roadmap 3). */
export const MATCH_WORLD_SELECTION_COUNT = 3;
export const MATCH_MINIMUM_RELATIONAL_CHALLENGE_COUNT = 1;

/**
 * "أفضل 5" (top-5): ten playable entries handed out one at a time — five real
 * ranked entries and five traps — with every entry ending up owned by exactly
 * one team.
 */
export const TOP5_SLUG = 'top-5';
export const TOP5_VARIANT = 'keep-or-give';
/** Every Top 5 challenge plays exactly this many entries. */
export const TOP5_ENTRY_COUNT = 10;
/** Exactly five of them carry an authoritative rank. */
export const TOP5_RANKED_COUNT = 5;
/** The ranks those five must hold, exactly once each. */
export const TOP5_RANKS: readonly number[] = [1, 2, 3, 4, 5];
/** The remaining five score nothing. */
export const TOP5_TRAP_COUNT = TOP5_ENTRY_COUNT - TOP5_RANKED_COUNT;
/** Seconds one team has to decide keep-or-give on the card in front of it. */
export const TOP5_TURN_SECONDS = 15;

/**
 * "ركّبها" — asymmetric visual assembly. Each puzzle has one private reference
 * view and two-or-three private candidate views; exactly one candidate holder
 * owns the matching piece, and the team races another team by describing what
 * each privately sees and selecting the correct candidate.
 */
export const RAKKIBHA_SLUG = 'rakkibha';
export const RAKKIBHA_VARIANT = 'visual-assembly';
/** Exactly three puzzles per challenge launch. */
export const RAKKIBHA_ITEM_COUNT = 3;
/** Two or three connected players per team; no solo and no four in V1. */
export const RAKKIBHA_TEAM_SIZES = [2, 3] as const;
/** A wrong answer locks that team's input for exactly this long. */
export const RAKKIBHA_LOCK_MS = 5_000;
/**
 * The whole race. Derived from the Co-op family budget (45s per item) across the
 * three puzzles rather than invented: 3 x 45 = 135.
 */
export const RAKKIBHA_TIMER_SECONDS = 135;

/** "بدليل واحد": a core mechanic that wraps deterministic text matching. */
export const ONE_CLUE_SLUG = 'one-clue';
/** The Anime Signature: two Runs of four rising-stage questions. */
export const COMBO_SLUG = 'combo';

export const BOMB_SLUG = 'bomb';

export const MARHALA_SLUG = 'marhala';
/** Cars Signature: القطعة الدخيلة. */
export const ODD_PIECE_SLUG = 'odd-piece';
export const ONE_CLUE_ITEM_COUNT = 3;
export const ONE_CLUE_STAGE_SECONDS = 7;
export const ONE_CLUE_VALUES = [5, 4, 3, 2, 1] as const;

/** Movies Signature: القطها. */
export const LAQATHA_SLUG = 'laqatha';
/** Exactly three movie questions per challenge launch. */
export const LAQATHA_ITEM_COUNT = 3;
/** Reward per revealed clue, hardest (5) to easiest (1). */
export const LAQATHA_VALUES = [5, 4, 3, 2, 1] as const;
/** A new clue becomes available every three seconds. */
export const LAQATHA_REVEAL_SECONDS = 3;
/** A team that claims gets five seconds to submit the movie title. */
export const LAQATHA_CLAIM_SECONDS = 5;

/** Music Signature: من أول نغمة. */
export const FIRST_NOTE_SLUG = 'first-note';
export const FIRST_NOTE_ITEM_COUNT = 3;
export const FIRST_NOTE_MIN_BID_SECONDS = 1;
export const FIRST_NOTE_MAX_BID_SECONDS = 15;
/** Configurable implementation/playtest default, not a Product balance rule. */
export const FIRST_NOTE_ANSWER_SECONDS = 15;

export type ContentPattern =
  | 'generic'
  | 'top_5'
  | 'rakkibha'
  | 'one_clue'
  | 'odd_piece'
  | 'laqatha'
  | 'first_note';

/** Mechanic-owned authoring structure, distinct from its answer contract. */
export function contentPatternForChallengeAnswerMode(
  mode: ChallengeAnswerMode,
): ContentPattern {
  if (mode === ChallengeAnswerMode.TOP_5) return 'top_5';
  if (mode === ChallengeAnswerMode.RAKKIBHA) return 'rakkibha';
  if (mode === ChallengeAnswerMode.ONE_CLUE) return 'one_clue';
  if (mode === ChallengeAnswerMode.ODD_PIECE) return 'odd_piece';
  if (mode === ChallengeAnswerMode.LAQATHA) return 'laqatha';
  if (mode === ChallengeAnswerMode.FIRST_NOTE) return 'first_note';
  return 'generic';
}

/**
 * Per-item pacing budget per family (roadmap 3.4). A mechanic inherits its
 * family's timer instead of an author inventing one; Signature mechanics define
 * their own pacing, so they have no default.
 */
export const FAMILY_DEFAULT_TIMER_SECONDS: Readonly<
  Record<ChallengeFamily, number | null>
> = {
  [ChallengeFamily.SIGNATURE]: null,
  [ChallengeFamily.RYO]: 25,
  [ChallengeFamily.COOP]: 45,
  [ChallengeFamily.RELATIONAL]: 25,
};

/**
 * Families are only allowed to declare answer modes that the family can
 * actually resolve automatically (roadmap 6.5). Signature mechanics declare
 * their own structure, so every mode stays open to them.
 */
export const FAMILY_ALLOWED_ANSWER_MODES: Readonly<
  Record<ChallengeFamily, readonly ChallengeAnswerMode[]>
> = {
  [ChallengeFamily.SIGNATURE]: Object.values(ChallengeAnswerMode),
  [ChallengeFamily.RYO]: [ChallengeAnswerMode.RYO],
  [ChallengeFamily.COOP]: [
    ChallengeAnswerMode.ONE_CLUE,
    ChallengeAnswerMode.RAKKIBHA,
    ChallengeAnswerMode.SPLIT,
    ChallengeAnswerMode.MATCH,
    ChallengeAnswerMode.MULTIPLE_CHOICE,
    ChallengeAnswerMode.CLOSEST,
  ],
  [ChallengeFamily.RELATIONAL]: [
    ChallengeAnswerMode.VOTE,
    ChallengeAnswerMode.MATCH,
    ChallengeAnswerMode.MULTIPLE_CHOICE,
  ],
};

/**
 * Which content answer payloads a challenge answer mode can consume. RYO wraps
 * a multiple-choice or numeric-estimate prompt (roadmap 6.1), so a plain
 * multiple-choice item is playable through an RYO challenge without being
 * rewritten.
 */
export const ANSWER_MODE_COMPATIBLE_ITEM_MODES: Readonly<
  Record<ChallengeAnswerMode, readonly ChallengeAnswerMode[]>
> = {
  [ChallengeAnswerMode.RYO]: [
    ChallengeAnswerMode.RYO,
    ChallengeAnswerMode.MULTIPLE_CHOICE,
    ChallengeAnswerMode.CLOSEST,
  ],
  [ChallengeAnswerMode.MULTIPLE_CHOICE]: [ChallengeAnswerMode.MULTIPLE_CHOICE],
  [ChallengeAnswerMode.CLOSEST]: [ChallengeAnswerMode.CLOSEST],
  [ChallengeAnswerMode.MATCH]: [ChallengeAnswerMode.MATCH],
  [ChallengeAnswerMode.VOTE]: [ChallengeAnswerMode.VOTE],
  [ChallengeAnswerMode.SPLIT]: [ChallengeAnswerMode.SPLIT],
  [ChallengeAnswerMode.TOP_5]: [ChallengeAnswerMode.TOP_5],
  [ChallengeAnswerMode.ODD_PIECE]: [ChallengeAnswerMode.ODD_PIECE],
  [ChallengeAnswerMode.ONE_CLUE]: [ChallengeAnswerMode.MATCH],
  [ChallengeAnswerMode.LAQATHA]: [ChallengeAnswerMode.MATCH],
  [ChallengeAnswerMode.FIRST_NOTE]: [ChallengeAnswerMode.MATCH],
  [ChallengeAnswerMode.RAKKIBHA]: [
    ChallengeAnswerMode.MATCH,
    ChallengeAnswerMode.MULTIPLE_CHOICE,
    ChallengeAnswerMode.CLOSEST,
  ],
};

/**
 * Relational content survives repeated sessions because the answer changes with
 * the group (roadmap 6.4). Everything else is consumed on use.
 */
export const SESSION_REUSE_EXEMPT_FAMILIES: readonly ChallengeFamily[] = [
  ChallengeFamily.RELATIONAL,
];
