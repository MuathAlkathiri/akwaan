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
}

export enum WorldChallengeSlotType {
  SIGNATURE = 'signature',
  RYO = 'ryo',
  FLEX = 'flex',
}

/**
 * A board position, not a mechanic. The two RYO positions are distinct slots
 * filled by the same canonical mechanic, so uniqueness is per slot rather than
 * per challenge type (roadmap 3.1).
 */
export enum WorldChallengeSlotKey {
  SIGNATURE = 'signature',
  RYO_1 = 'ryo_1',
  RYO_2 = 'ryo_2',
  FLEX = 'flex',
}

export const SLOT_KEY_TYPES: Readonly<
  Record<WorldChallengeSlotKey, WorldChallengeSlotType>
> = {
  [WorldChallengeSlotKey.SIGNATURE]: WorldChallengeSlotType.SIGNATURE,
  [WorldChallengeSlotKey.RYO_1]: WorldChallengeSlotType.RYO,
  [WorldChallengeSlotKey.RYO_2]: WorldChallengeSlotType.RYO,
  [WorldChallengeSlotKey.FLEX]: WorldChallengeSlotType.FLEX,
};

export const WORLD_BOARD_SLOT_KEYS: readonly WorldChallengeSlotKey[] = [
  WorldChallengeSlotKey.SIGNATURE,
  WorldChallengeSlotKey.RYO_1,
  WorldChallengeSlotKey.RYO_2,
  WorldChallengeSlotKey.FLEX,
];

/**
 * Families whose presentation and player-facing name are fixed by the mechanic
 * itself and may never be overridden per World. RYO is globally one challenge
 * with one name and one timer; Worlds differ by their Signature mechanic, their
 * content, and their own identity — not by renaming a shared mechanic.
 */
export const GLOBALLY_FIXED_FAMILIES: readonly ChallengeFamily[] = [
  ChallengeFamily.RYO,
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

/** Board composition (roadmap 3.1): 1 signature + 2 RYO + 1 flex. */
export const WORLD_BOARD_SLOT_COUNT = 4;
export const WORLD_SIGNATURE_SLOT_COUNT = 1;
export const WORLD_RYO_SLOT_COUNT = 2;
export const WORLD_FLEX_SLOT_COUNT = 1;

/** Items per challenge slot (roadmap 3.3). Pacing only; not enforced here. */
export const CHALLENGE_ITEMS_PER_SLOT = 3;

/** Match-level selection (roadmap 3). */
export const MATCH_WORLD_SELECTION_COUNT = 3;
export const MATCH_MINIMUM_RELATIONAL_CHALLENGE_COUNT = 1;

export const WORLD_SLOT_REQUIRED_COUNTS: Readonly<
  Record<WorldChallengeSlotType, number>
> = {
  [WorldChallengeSlotType.SIGNATURE]: WORLD_SIGNATURE_SLOT_COUNT,
  [WorldChallengeSlotType.RYO]: WORLD_RYO_SLOT_COUNT,
  [WorldChallengeSlotType.FLEX]: WORLD_FLEX_SLOT_COUNT,
};

/** Which families may occupy each slot (roadmap 3.1). */
export const WORLD_SLOT_ALLOWED_FAMILIES: Readonly<
  Record<WorldChallengeSlotType, readonly ChallengeFamily[]>
> = {
  [WorldChallengeSlotType.SIGNATURE]: [ChallengeFamily.SIGNATURE],
  [WorldChallengeSlotType.RYO]: [ChallengeFamily.RYO],
  [WorldChallengeSlotType.FLEX]: [
    ChallengeFamily.COOP,
    ChallengeFamily.RELATIONAL,
  ],
};

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
};

/**
 * Relational content survives repeated sessions because the answer changes with
 * the group (roadmap 6.4). Everything else is consumed on use.
 */
export const SESSION_REUSE_EXEMPT_FAMILIES: readonly ChallengeFamily[] = [
  ChallengeFamily.RELATIONAL,
];
