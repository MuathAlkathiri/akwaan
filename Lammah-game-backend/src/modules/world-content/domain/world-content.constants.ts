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
  TOP_10 = 'top_10',
  /**
   * "ركّبها" wraps a machine-checkable prompt the way RYO does: the mechanic
   * supplies the private split, and the item keeps whichever answer contract it
   * already had.
   */
  DISTRIBUTED = 'distributed',
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
 * "ركّبها" (distributed-information): three private segments per item, one
 * public prompt, and a race between two teams.
 */
export const DISTRIBUTED_INFORMATION_SLUG = 'distributed-information';
export const DISTRIBUTED_INFORMATION_VARIANT = 'three-segment-race';
export const DISTRIBUTED_INFORMATION_SEGMENT_IDS = ['A', 'B', 'C'] as const;
export type DistributedInformationSegmentId =
  (typeof DISTRIBUTED_INFORMATION_SEGMENT_IDS)[number];
/** Exactly three puzzles per challenge launch. */
export const DISTRIBUTED_INFORMATION_ITEM_COUNT = 3;
/** Two or three connected players per team; no solo and no four in V1. */
export const DISTRIBUTED_INFORMATION_TEAM_SIZES = [2, 3] as const;
/** A wrong answer locks that team's input for exactly this long. */
export const DISTRIBUTED_INFORMATION_LOCK_MS = 5_000;
/**
 * The whole race. Derived from the Co-op family budget (45s per item) across the
 * three puzzles rather than invented: 3 x 45 = 135.
 */
export const DISTRIBUTED_INFORMATION_TIMER_SECONDS = 135;
/** The answer modes a distributed-information item may resolve with. */
export const DISTRIBUTED_INFORMATION_ANSWER_MODES = [
  'closest',
  'match',
  'multiple_choice',
] as const;

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
    ChallengeAnswerMode.DISTRIBUTED,
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
  [ChallengeAnswerMode.TOP_10]: [ChallengeAnswerMode.TOP_10],
  [ChallengeAnswerMode.DISTRIBUTED]: [
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
