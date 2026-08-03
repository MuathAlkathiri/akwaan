import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  ContentItemStatus,
  ContentMediaType,
  VoteConsensusRule,
  WorldChallengeSlotKey,
  WorldChallengeSlotType,
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
  signatureMechanicId?: string;
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
  isExclusive: boolean;
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
  slotType: WorldChallengeSlotType;
  /** Optional per-World label. Globally fixed mechanics never carry one. */
  displayName?: string;
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
      mode: ChallengeAnswerMode.TOP_10;
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

export type Top10Variant = 'classic' | 'poison-deck';

export interface Top10PoisonDeckCandidate {
  id: string;
  label: string;
  shortLabel?: string;
  media?: ContentAssetRef;
}

export interface Top10PoisonDeckPayload {
  variant: 'poison-deck';
  title: string;
  instruction?: string;
  rankingBasis: string;
  sourceLabel: string;
  asOfDate?: string;
  candidates: Top10PoisonDeckCandidate[];
  rankedAnswer: Array<{ candidateId: string; rank: number }>;
  decoyCandidateIds: string[];
  explanation?: string;
}

export interface ContentItemView {
  id: string;
  scopeId: string;
  worldId: string;
  prompt: LocalizedText;
  compatibleChallengeTypeIds: string[];
  media?: ContentItemMedia;
  answerPayload: ContentAnswerPayload;
  mechanicPayload?: Record<string, unknown> | Top10PoisonDeckPayload;
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
