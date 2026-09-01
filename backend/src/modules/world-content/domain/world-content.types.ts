import {
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
/**
 * How a mechanic is explained to players, authored on the ChallengeType.
 *
 * Belongs to the mechanic and nothing below it: a Scope changes the *content* a
 * challenge draws, never how the challenge works, so Bomb + Naruto and Bomb +
 * Dragon Ball read the same instructions. It rides inside presentation because
 * presentation is already the mechanic-canonical, World-invariant object
 * (`ChallengePresentationPolicy`: "a World cannot override the timer, input, or
 * reveal behaviour"); instructions obey the same rule.
 *
 * Deliberately prose about *rules*, not tunable numbers. A step says "a wrong
 * answer hands the pressure to the other team", never "the timer is 30 seconds" —
 * the second would go stale the moment `timerSeconds` is retuned, and that value
 * is already canonical config the UI can render live.
 */
export interface PlayerInstructions {
  /** One line: the whole idea of the mechanic. */
  summary: string;
  /** Ordered "how to play" steps, in the order authored. */
  steps: string[];
  /** Optional rules players must not miss. Absent, never an empty array. */
  highlights?: string[];
}

export interface ChallengePresentation {
  inputType: string;
  timerSeconds: number | null;
  soundPack?: string | null;
  revealStyle?: string | null;
  /**
   * Player-facing explanation, or absent on a legacy record authored before this
   * field existed. Absent is a readiness concern (below), never a crash.
   */
  playerInstructions?: PlayerInstructions | null;
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
    playerInstructions: normalizePlayerInstructions(
      presentation?.playerInstructions,
    ),
  };
}

/**
 * A player-instructions object trimmed to what is real, or null when nothing was
 * authored. Whitespace-only rows collapse away rather than reaching a player as
 * an empty bullet, so a half-filled form normalizes to "not authored yet" and is
 * caught by the readiness guard rather than shown.
 */
export function normalizePlayerInstructions(
  value: Partial<PlayerInstructions> | undefined | null,
): PlayerInstructions | null {
  if (!value) return null;
  const summary = (value.summary ?? '').trim();
  const steps = (value.steps ?? [])
    .map((step) => (step ?? '').trim())
    .filter(Boolean);
  const highlights = (value.highlights ?? [])
    .map((entry) => (entry ?? '').trim())
    .filter(Boolean);
  if (!summary && steps.length === 0 && highlights.length === 0) return null;
  return {
    summary,
    steps,
    ...(highlights.length ? { highlights } : {}),
  };
}

/** True when a mechanic carries player instructions complete enough to show. */
export function hasCompletePlayerInstructions(
  presentation: Partial<ChallengePresentation> | undefined | null,
): boolean {
  const instructions = normalizePlayerInstructions(
    presentation?.playerInstructions,
  );
  return Boolean(
    instructions && instructions.summary && instructions.steps.length > 0,
  );
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
    }
  | {
      mode: ChallengeAnswerMode.ODD_PIECE;
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
export interface RakkibhaCandidate {
  localId: string;
  canonicalIdentity: string;
  content?: LocalizedText;
  media: ContentItemMedia;
}

export interface RakkibhaCandidateView {
  id: string;
  content?: LocalizedText;
  candidates: RakkibhaCandidate[];
}

export interface RakkibhaPayload {
  variant: 'visual-assembly';
  family: 'visual-assembly';
  instruction: LocalizedText;
  reference: { content?: LocalizedText; media: ContentItemMedia };
  candidateViews: RakkibhaCandidateView[];
  correctCanonicalIdentity: string;
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

/**
 * "القطها" (Movies Signature) content: exactly five ordered clues per movie
 * question, hardest (value 5) to easiest (value 1). A clue is playable as text,
 * image, or audio — different clues within one movie may use different
 * modalities — so each carries optional localized text and optional media. The
 * canonical movie title lives in the item's MATCH `answerPayload.acceptedAnswers`
 * (no second source of truth for what is correct), exactly as One Clue does.
 */
export interface LaqathaClue {
  order: number;
  value: number;
  text?: LocalizedText;
  media?: ContentItemMedia;
}

export interface LaqathaPayload {
  variant: 'laqatha';
  clues: LaqathaClue[];
}

export interface OddPieceVisual {
  localId: string;
  /** Server-only grading identity; never projected while the puzzle is live. */
  vehicleIdentity: string;
  /** Player-facing identity used only in the post-resolution proof. */
  vehicleLabel: string;
  media: ContentItemMedia;
}

/** Canonical Cars Signature authoring payload. */
export interface OddPiecePayload {
  variant: 'odd-piece';
  targetVehicleIdentity: string;
  targetVehicleLabel: string;
  targetVehicleReveal: ContentItemMedia;
  pieces: OddPieceVisual[];
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
    | RakkibhaPayload
    | OneCluePayload
    | OddPiecePayload
    | LaqathaPayload;
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
