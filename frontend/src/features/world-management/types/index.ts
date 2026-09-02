/**
 * Transport types for the World Content admin API
 * (World -> Scope -> ChallengeType -> ContentItem).
 *
 * Rules and vocabulary (families, answer modes, slots, board size, answer-mode
 * compatibility, scoring rules) are fetched from the metadata endpoint rather
 * than restated here, so the two sides cannot drift apart.
 */

export type WorldContentStatus = "draft" | "active" | "archived";
export type ContentItemStatus = "draft" | "ready" | "archived";
export type ContentReadiness = "ready" | "limited" | "not_ready";
export type ChallengeFamily = "signature" | "ryo" | "coop" | "relational";
export type WorldChallengeSlotKey = "slot_1" | "slot_2" | "slot_3" | "slot_4";
export type ContentMediaType = "none" | "image" | "audio" | "video";
export type ChallengeAnswerMode =
  | "ryo"
  | "multiple_choice"
  | "closest"
  | "match"
  | "vote"
  | "split"
  | "top_5"
  | "odd_piece"
  | "one_clue"
  | "laqatha"
  | "first_note"
  /** The canonical ركّبها answer mode. */
  | "rakkibha";
export type ChallengeItemStructure = "discrete_triple" | "continuous";
export type VoteConsensusRule = "exact" | "majority" | "team_match";
export type ContentPattern =
  | "generic"
  | "top_5"
  | "rakkibha"
  | "one_clue"
  | "odd_piece"
  | "laqatha"
  | "first_note";

export interface ContentAsset {
  url: string;
  altText?: string;
}

export interface LocalizedText {
  ar: string;
  en?: string;
}

export interface WorldContentIssue {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ReadinessReport {
  readiness: ContentReadiness;
  blockers: WorldContentIssue[];
  warnings: WorldContentIssue[];
}

/** Owned by the mechanic. Media is absent here: it belongs to the ContentItem. */
/**
 * How a mechanic explains itself to players — authored once on the ChallengeType,
 * canonical across every World. Absent on legacy mechanics authored before it
 * existed.
 */
export interface PlayerInstructions {
  summary: string;
  steps: string[];
  highlights?: string[];
}

export interface ChallengePresentation {
  inputType: string;
  timerSeconds: number | null;
  soundPack?: string | null;
  revealStyle?: string | null;
  /** Player-facing "how this challenge works". Mechanic-canonical, World-invariant. */
  playerInstructions?: PlayerInstructions | null;
}

export interface BoardSlot {
  slotKey: WorldChallengeSlotKey;
  configurationId: string;
  challengeTypeId: string;
  challengeTypeSlug: string;
  family: ChallengeFamily;
  displayName: string;
  answerMode: ChallengeAnswerMode;
  itemStructure: ChallengeItemStructure;
  scoringRuleId: string;
  sortOrder: number;
}

export interface BoardDefinition {
  worldId: string;
  slots: BoardSlot[];
  blockers: WorldContentIssue[];
  warnings: WorldContentIssue[];
}

export interface ScopeCompatibility {
  scopeId: string;
  usableSlots: BoardSlot[];
  excludedSlots: BoardSlot[];
  blockers: WorldContentIssue[];
  warnings: WorldContentIssue[];
}

export interface WorldReadinessReport extends ReadinessReport {
  worldId: string;
  board: BoardDefinition;
  scopeCompatibility: ScopeCompatibility[];
  boardReady: boolean;
  hasRelationalChallenge: boolean;
}

export interface World {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: ContentAsset;
  banner?: ContentAsset;
  soundPack?: string | null;
  timerProfile?: string | null;
  toneProfile?: string | null;
  status: WorldContentStatus;
  sortOrder: number;
  scopeCount: number;
  challengeConfigurationCount: number;
  contentItemCount: number;
  readiness: WorldReadinessReport;
}

export interface Scope {
  id: string;
  worldId: string;
  name: string;
  slug: string;
  description?: string;
  image?: ContentAsset;
  excludedChallengeTypeIds: string[];
  status: WorldContentStatus;
  sortOrder: number;
  contentItemCount: number;
  readyContentItemCount: number;
  compatibility: ScopeCompatibility;
}

export interface ChallengeType {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: ContentAsset;
  family: ChallengeFamily;
  itemStructure: ChallengeItemStructure;
  answerMode: ChallengeAnswerMode;
  defaultPresentation: ChallengePresentation;
  scoringRuleId: string;
  status: WorldContentStatus;
  sortOrder: number;
  worldConfigurationCount: number;
  contentItemCount: number;
  readiness: ReadinessReport;
}

export interface WorldChallengeConfiguration {
  id: string;
  worldId: string;
  challengeTypeId: string;
  slotKey: WorldChallengeSlotKey;
  /** Optional player-facing presentation overrides for this World. */
  displayName?: string;
  /** What players see: the label, or the mechanic's own name. */
  effectiveName: string;
  description?: string;
  instructions?: string;
  icon?: ContentAsset;
  sortOrder: number;
  isEnabled: boolean;
  challengeType: Pick<
    ChallengeType,
    | "id"
    | "name"
    | "slug"
    | "family"
    | "answerMode"
    | "itemStructure"
    | "scoringRuleId"
    | "status"
    | "defaultPresentation"
  >;
}

/** Server-counted impact of releasing one World board position. */
export interface WorldSlotRemovalPreview {
  worldId: string;
  worldName: string;
  slotKey: WorldChallengeSlotKey;
  challengeTypeId: string;
  challengeTypeSlug: string;
  challengeTypeName: string;
  content: {
    total: number;
    ready: number;
    /** Items no other mechanic can play; these are deleted. */
    exclusive: number;
    /** Items another mechanic can still play; these only lose a relationship. */
    shared: number;
  };
  boardWillBecomeIncomplete: boolean;
}

export interface WorldSlotRemovalResult {
  worldId: string;
  slotKey: WorldChallengeSlotKey;
  challengeTypeId: string;
  deletedContentItems: number;
  detachedSharedItems: number;
  slotNowEmpty: boolean;
  boardReady: boolean;
}

export interface WorldBoard {
  worldId: string;
  configurations: WorldChallengeConfiguration[];
  board: BoardDefinition;
}

export interface ContentAnswerOption {
  id: string;
  label: LocalizedText;
}

export interface ContentAnswerPayload {
  mode: ChallengeAnswerMode;
  options?: ContentAnswerOption[] | null;
  correctOptionId?: string;
  correctValue?: number;
  acceptedTolerance?: number;
  acceptedAnswers?: string[];
  consensusRule?: VoteConsensusRule;
  splitPayload?: { fragments: Array<{ seat: number; clue: LocalizedText }> };
}

export interface ContentItem {
  id: string;
  scopeId: string;
  worldId: string;
  prompt: LocalizedText;
  compatibleChallengeTypeIds: string[];
  media?: { type: ContentMediaType; assets: ContentAsset[] };
  answerPayload: ContentAnswerPayload;
  mechanicPayload?: Record<string, unknown>;
  isReusableAcrossSessions: boolean;
  status: ContentItemStatus;
  metadata?: { source?: string; notes?: string; tags?: string[] };
  readiness: ReadinessReport;
  compatibleFamilies: ChallengeFamily[];
  isSessionReuseExempt: boolean;
}

/**
 * One playable Top 5 entry. `rank` is the whole correctness contract: 1..5 for a
 * real entry, `null` for a trap.
 */
export interface Top5Entry {
  id: string;
  label: string;
  shortLabel?: string;
  media?: ContentAsset;
  rank: number | null;
}

/** "ركّبها" content. The answer lives in answerPayload, never here. */
export interface RakkibhaCandidate {
  localId: string;
  canonicalIdentity: string;
  content?: LocalizedText;
  media: { type: ContentMediaType; assets: ContentAsset[] };
}
export interface RakkibhaPayload {
  variant: "visual-assembly";
  family: "visual-assembly";
  instruction: LocalizedText;
  reference: {
    content?: LocalizedText;
    media: { type: ContentMediaType; assets: ContentAsset[] };
  };
  candidateViews: Array<{
    id: string;
    content?: LocalizedText;
    candidates: RakkibhaCandidate[];
  }>;
  correctCanonicalIdentity: string;
  supportedTeamSizes: number[];
  authorSafetyConfirmation: boolean;
  explanation?: string;
}

export interface Top5Payload {
  variant: "keep-or-give";
  title: string;
  instruction?: string;
  rankingBasis: string;
  sourceLabel: string;
  sourceUrl?: string;
  asOfDate?: string;
  /** Exactly ten: five ranked 1..5 and five traps. */
  entries: Top5Entry[];
  explanation?: string;
}

export interface OddPiecePayload {
  variant: "odd-piece";
  targetVehicleIdentity: string;
  targetVehicleLabel: string;
  targetVehicleReveal: {
    type: "image";
    assets: ContentAsset[];
  };
  pieces: Array<{
    localId: string;
    vehicleIdentity: string;
    vehicleLabel: string;
    media: { type: "image"; assets: ContentAsset[] };
  }>;
}

export interface ScoringRuleOption {
  id: string;
  description: string;
  perfectClearBonusEligible: boolean;
  allowsNegativeDelta: boolean;
  requiresMechanicBinding: boolean;
}

/**
 * Every rule the admin forms need in order to offer only valid choices, served by
 * the backend from the same constants its policies enforce. Nothing in here is
 * restated client-side (roadmap 21).
 */
export interface WorldContentMetadata {
  productionMechanics: Array<{
    slug: string;
    runtimeKey: string;
    family: ChallengeFamily;
    itemStructure: ChallengeItemStructure;
    answerMode: ChallengeAnswerMode;
    matchScoringRuleId: string;
  }>;
  families: Array<{
    value: ChallengeFamily;
    allowedAnswerModes: ChallengeAnswerMode[];
    mustBeExclusive: boolean;
    /** The family's per-item pacing budget, or null when the mechanic decides. */
    defaultTimerSeconds: number | null;
  }>;
  itemStructures: ChallengeItemStructure[];
  scoringRules: ScoringRuleOption[];
  boardSlotCount: number;
  slots: Array<{
    key: WorldChallengeSlotKey;
  }>;
  answerModeCompatibility: Array<{
    challengeAnswerMode: ChallengeAnswerMode;
    itemAnswerModes: ChallengeAnswerMode[];
    contentPattern: ContentPattern;
  }>;
}

export interface OneCluePayload {
  clues: Array<{
    order: number;
    value: number;
    text: LocalizedText;
  }>;
}

export interface LaqathaPayload {
  variant: "laqatha";
  clues: Array<{
    order: number;
    value: number;
    text?: LocalizedText;
    media?: { type: ContentMediaType; assets: ContentAsset[] };
  }>;
}
export interface FirstNotePayload {
  variant: "first-note";
  contextualClue: LocalizedText;
  clueLabel?: LocalizedText;
}

export interface ChallengeTypeDeletionPreview {
  challengeTypeId: string;
  name: string;
  historicalMatchUsageCount: number;
  activeMatchUsageCount: number;
  contentItemCount: number;
  worldAssignmentCount: number;
  scopeExclusionCount: number;
  canHardDelete: boolean;
  blockReason?: "active_match" | "unsafe_historical_snapshot";
  historicalSnapshotSafe: boolean;
  productionMechanic: boolean;
}
