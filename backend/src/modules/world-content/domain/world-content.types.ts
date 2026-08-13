import {
  DistributedInformationSegmentId,
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  ContentItemStatus,
  ContentMediaType,
  VoteConsensusRule,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from './world-content.constants';

/**
 * Plain domain views. Policies operate on these rather than on Mongoose
 * documents so every rule is unit-testable without a database, and so the
 * persistence shape can change without touching the rules.
 */

export interface LocalizedText {
  ar: string;
  en?: string;
}

export interface ContentAssetRef {
  url: string;
  path?: string;
  filename?: string;
  mimetype?: string;
  size?: number;
  altText?: string;
}

/**
 * How a mechanic presents itself. Media is deliberately absent: media belongs to
 * the ContentItem alone, so one mechanic plays text, image, audio, and video
 * content without any per-World or per-mechanic media configuration.
 */
export interface ChallengePresentation {
  inputType: string;
  timerSeconds: number | null;
  soundPack?: string | null;
  revealStyle?: string | null;
}

/**
 * The canonical presentation shape: optional properties become explicit nulls so
 * the differentiation rule compares two Worlds on identical footing, whatever
 * route the value arrived by.
 *
 * A record written before this schema existed — or one left behind by a partial
 * migration — has no presentation at all. Such a record is invalid, not fatal:
 * the missing values are normalized to empty so ChallengePresentationPolicy
 * reports them as readiness blockers instead of the whole listing throwing.
 */
export function normalizePresentation(
  presentation: Partial<ChallengePresentation> | undefined | null,
): ChallengePresentation {
  return {
    inputType: presentation?.inputType ?? '',
    timerSeconds: presentation?.timerSeconds ?? null,
    soundPack: presentation?.soundPack ?? null,
    revealStyle: presentation?.revealStyle ?? null,
  };
}

export interface WorldView {
  id: string;
  name: string;
  slug: string;
  status: WorldContentStatus;
  soundPack?: string | null;
  timerProfile?: string | null;
  toneProfile?: string | null;
}

export interface ScopeView {
  id: string;
  worldId: string;
  name: string;
  slug: string;
  status: WorldContentStatus;
  excludedChallengeTypeIds: string[];
}

export interface ChallengeTypeView {
  id: string;
  name: string;
  slug: string;
  family: ChallengeFamily;
  itemStructure: ChallengeItemStructure;
  answerMode: ChallengeAnswerMode;
  defaultPresentation: ChallengePresentation;
  scoringRuleId: string;
  status: WorldContentStatus;
}

export interface WorldChallengeConfigurationView {
  id: string;
  worldId: string;
  challengeTypeId: string;
  /** The board position this fills; the unique identity within a World. */
  slotKey: WorldChallengeSlotKey;
  /** Optional presentation overrides for this World. */
  displayName?: string;
  description?: string;
  instructions?: string;
  sortOrder: number;
  isEnabled: boolean;
}

export interface ContentAnswerOption {
  id: string;
  label: LocalizedText;
}

export type ContentAnswerPayload =
  | {
      mode: ChallengeAnswerMode.MULTIPLE_CHOICE;
      options: ContentAnswerOption[];
      correctOptionId: string;
    }
  | {
      mode: ChallengeAnswerMode.CLOSEST;
      correctValue: number;
      acceptedTolerance?: number;
    }
  | {
      mode: ChallengeAnswerMode.MATCH;
      acceptedAnswers: string[];
    }
  | {
      mode: ChallengeAnswerMode.VOTE;
      options?: ContentAnswerOption[];
      consensusRule: VoteConsensusRule;
    }
  | {
      mode: ChallengeAnswerMode.SPLIT;
      splitPayload: ContentSplitPayload;
      acceptedAnswers: string[];
    }
  | {
      mode: ChallengeAnswerMode.RYO;
      options: ContentAnswerOption[] | null;
      correctOptionId?: string;
      correctValue?: number;
      acceptedTolerance?: number;
    }
  | {
      mode: ChallengeAnswerMode.TOP_5;
    };

/**
 * Split content is structured, not free-form: each fragment is privately shown
 * to exactly one seat, and the seats must combine to the whole clue.
 */
export interface ContentSplitPayload {
  fragments: Array<{
    seat: number;
    clue: LocalizedText;
  }>;
}

export interface ContentItemMedia {
  type: ContentMediaType;
  assets: ContentAssetRef[];
}

/**
 * One playable Top 5 entry.
 *
 * `rank` is the whole correctness contract: 1..5 marks one of the five real
 * entries, `null` marks a trap. There is no second flag saying the same thing,
 * because two sources of truth for "is this a real answer" is exactly how a
 * reveal ends up disagreeing with the score.
 */
export interface Top5Entry {
  id: string;
  label: string;
  shortLabel?: string;
  media?: ContentAssetRef;
  /** 1..5 for a real Top 5 entry; null for a trap. */
  rank: number | null;
}

export interface Top5Payload {
  variant: 'keep-or-give';
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

/**
 * "ركّبها" content: one public prompt every teammate sees, three private
 * segments split between them, and the merges an author has certified as safe
 * for a two-player team.
 *
 * The answer is deliberately *not* here: it lives in `answerPayload`, the one
 * place every mechanic's machine-resolvable answer already lives, so there is
 * never a second source of truth for what is correct.
 */
export interface DistributedInformationSegment {
  id: DistributedInformationSegmentId;
  content: LocalizedText;
  media?: ContentItemMedia;
}

/**
 * How three segments are split across a two-player team: one player takes two,
 * the other takes one. Every option must cover all three segments exactly once.
 */
export interface DistributedInformationMergeOption {
  firstParticipantSegmentIds: DistributedInformationSegmentId[];
  secondParticipantSegmentIds: DistributedInformationSegmentId[];
}

export interface DistributedInformationPayload {
  variant: 'three-segment-race';
  publicPrompt: LocalizedText;
  segments: DistributedInformationSegment[];
  /** At least one author-approved two-player split. */
  twoPlayerMergeOptions: DistributedInformationMergeOption[];
  supportedTeamSizes: number[];
  /**
   * The author's confirmation that no single player can solve the puzzle from
   * their own segments. Structural leakage is checked automatically; this
   * judgement cannot be, so it is recorded rather than inferred.
   */
  authorSafetyConfirmation: boolean;
  explanation?: string;
}

export interface OneCluePayload {
  clues: Array<{
    order: number;
    value: number;
    text: LocalizedText;
  }>;
}

export interface ContentItemView {
  id: string;
  scopeId: string;
  worldId: string;
  prompt: LocalizedText;
  compatibleChallengeTypeIds: string[];
  media?: ContentItemMedia;
  answerPayload: ContentAnswerPayload;
  mechanicPayload?:
    | Record<string, unknown>
    | Top5Payload
    | DistributedInformationPayload
    | OneCluePayload;
  isReusableAcrossSessions: boolean;
  status: ContentItemStatus;
  metadata?: {
    source?: string;
    notes?: string;
    tags?: string[];
  };
}

/** Uniform issue shape for every validation and readiness surface. */
export interface WorldContentIssue {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ReadinessLevel = 'ready' | 'limited' | 'not_ready';

export interface ReadinessReport {
  readiness: ReadinessLevel;
  /** Issues that block activation. */
  blockers: WorldContentIssue[];
  /** Issues that permit activation but should be surfaced to the admin. */
  warnings: WorldContentIssue[];
}

export function buildReadinessReport(
  blockers: WorldContentIssue[],
  warnings: WorldContentIssue[] = [],
): ReadinessReport {
  return {
    readiness: blockers.length
      ? 'not_ready'
      : warnings.length
        ? 'limited'
        : 'ready',
    blockers,
    warnings,
  };
}
