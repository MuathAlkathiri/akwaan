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
  | "one_clue"
  /** The ركّبها wrapper: the item keeps its own answer contract. */
  | "distributed";
export type ChallengeItemStructure = "discrete_triple" | "continuous";
export type VoteConsensusRule = "exact" | "majority" | "team_match";

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
export interface ChallengePresentation {
  inputType: string;
  timerSeconds: number | null;
  soundPack?: string | null;
  revealStyle?: string | null;
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
export interface DistributedInformationSegment {
  id: "A" | "B" | "C";
  content: LocalizedText;
  media?: { type: ContentMediaType; assets: ContentAsset[] };
}

export interface DistributedInformationMergeOption {
  firstParticipantSegmentIds: Array<"A" | "B" | "C">;
  secondParticipantSegmentIds: Array<"A" | "B" | "C">;
}

export interface DistributedInformationPayload {
  variant: "three-segment-race";
  publicPrompt: LocalizedText;
  segments: DistributedInformationSegment[];
  twoPlayerMergeOptions: DistributedInformationMergeOption[];
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
  }>;
}

export interface ChallengeTypeDeletionPreview {
  challengeTypeId: string;
  name: string;
  historicalMatchUsageCount: number;
  contentItemCount: number;
  worldAssignmentCount: number;
  scopeExclusionCount: number;
  canHardDelete: boolean;
  archiveRequired: boolean;
  productionMechanic: boolean;
}
