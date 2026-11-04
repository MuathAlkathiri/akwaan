import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  ContentItemStatus,
  ContentMediaType,
  EkshifniRegionRole,
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
  const normalized: ChallengePresentation = {
    inputType: presentation?.inputType ?? '',
    timerSeconds: presentation?.timerSeconds ?? null,
    soundPack: presentation?.soundPack ?? null,
    revealStyle: presentation?.revealStyle ?? null,
  };
  return normalized;
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
  sortOrder: number;
  isEnabled: boolean;
}

export interface ContentAnswerOption {
  id: string;
  label: LocalizedText;
}

/**
 * How a مين أقرب number is meant to be read.
 *
 * Explicit, never inferred. A quantity and a calendar year can occupy exactly
 * the same magnitude — 1930 goals is as writable as the year 1930 — so nothing
 * about the number itself can decide whether it takes a thousands separator or
 * a unit. Only the author knows, so only the author says.
 *
 * Absent means `number`, which is what every item authored before this field
 * existed meant.
 */
export const CLOSEST_VALUE_DISPLAY_FORMATS = [
  'number',
  'calendar-year',
] as const;
export type ClosestValueDisplayFormat =
  (typeof CLOSEST_VALUE_DISPLAY_FORMATS)[number];

export type ClosestSliderConfig =
  | {
      mode: 'numeric-range';
      min: number;
      max: number;
      step?: number;
      unit?: string;
      displayFormat?: ClosestValueDisplayFormat;
    }
  | {
      mode: 'between-anchors';
      min: number;
      max: number;
      step?: number;
      leftAnchor: string;
      rightAnchor: string;
    };

export interface ClosestMechanicPayload extends Record<string, unknown> {
  closestSlider?: ClosestSliderConfig;
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
    }
  | {
      /**
       * "لا تحرقها" carries no free-text answer: correctness is the `correct`
       * flag on each of the eight authored ingredients, so there is exactly one
       * source of truth for what belongs in the dish.
       */
      mode: ChallengeAnswerMode.LA_TAHRIQHA;
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

/** One authored song for the public, shared First Note auction. */
export interface FirstNotePayload {
  variant: 'first-note';
  contextualClue: LocalizedText;
  /** Optional player-facing label such as artist, year, album, or era. */
  clueLabel?: LocalizedText;
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

/** A normalized point used by the V2 hotspot contract. */
export interface OddPieceNormalizedPoint {
  x: number;
  y: number;
}

export type OddPieceDifficulty = 'easy' | 'medium' | 'hard';
export type OddPieceAssetOrigin = 'authentic' | 'ai-edited';

/** Provenance recorded on every V2 image; rights remain an advisory concern. */
export interface OddPieceMediaProvenance {
  assetOrigin: OddPieceAssetOrigin;
  sourceUrl: string;
  licenceNote?: string;
  editedRegion?: string;
  editModel?: string;
}

/** One V2 image, with the source dimensions needed to interpret normalized taps. */
export interface OddPieceHotspotImage {
  media: ContentItemMedia;
  width: number;
  height: number;
  orientation: 'landscape' | 'portrait' | 'square';
  provenance: OddPieceMediaProvenance;
}

/**
 * "اكشفني" (Celebrities Signature) authoring: six reveal regions over the item's
 * one canonical celebrity image.
 *
 * `role` is authoring vocabulary — it is what tells a producer the six masks
 * actually cover a face rather than six patches of background — and it is never
 * projected to a player, who sees the neutral numbers 1..6. `shape` is fractions
 * of the source image so one authored geometry lands identically on a television
 * and a phone. The celebrity's name lives in the item's MATCH
 * `answerPayload.acceptedAnswers`, exactly as القطها keeps its movie title, so
 * there is no second source of truth for what is correct.
 */
export interface EkshifniRegionAuthoring {
  /** Stable across edits: a recorded reveal must never drift onto another mask. */
  localId: string;
  role: EkshifniRegionRole;
  shape: { x: number; y: number; width: number; height: number };
}

export interface EkshifniPayload {
  variant: 'ekshifni';
  regions: EkshifniRegionAuthoring[];
}

/**
 * One ingredient card on a "لا تحرقها" dish.
 *
 * `correct` is explicit rather than inferred from position, because the eight
 * cards are shuffled for presentation and an author must be able to look at the
 * list and see which five they committed to. `localId` is stable across edits so
 * a recorded selection can never drift onto a different card.
 */
export interface LaTahriqhaIngredientAuthoring {
  localId: string;
  label: LocalizedText;
  correct: boolean;
}

/**
 * "لا تحرقها" (Food Signature) authoring: one dish and its eight ingredients.
 *
 * Five correct and three distractors, exactly — the count is the balance. The
 * dish name is player-facing from the first second; the correctness flags are
 * never projected before the dish resolves.
 */
export interface LaTahriqhaPayload {
  variant: 'la-tahriqha';
  dishName: LocalizedText;
  /** Optional producer note shown with the dish, e.g. the regional style. */
  dishNote?: LocalizedText;
  ingredients: LaTahriqhaIngredientAuthoring[];
  /**
   * This dish's own window. Absent means the product baseline
   * (`LA_TAHRIQHA_DEFAULT_DISH_SECONDS`), so a harder dish can be given more
   * time without the number being hard-coded anywhere global.
   */
  timerSeconds?: number;
}

export interface ContentItemView {
  id: string;
  scopeId: string;
  worldId: string;
  prompt: LocalizedText;
  compatibleChallengeTypeIds: string[];
  media?: ContentItemMedia;
  /** Optional answer/reveal image; never exposed by generic live projections. */
  revealMedia?: ContentItemMedia;
  answerPayload: ContentAnswerPayload;
  mechanicPayload?:
    | Record<string, unknown>
    | Top5Payload
    | RakkibhaPayload
    | OneCluePayload
    | OddPiecePayload
    | LaqathaPayload
    | EkshifniPayload
    | LaTahriqhaPayload;
  isReusableAcrossSessions: boolean;
  status: ContentItemStatus;
  metadata?: {
    source?: string;
    notes?: string;
    tags?: string[];
  };
}

/** The stored shape of a mechanic's educational demonstration. */
export interface MechanicTutorial {
  draft?: StoredTutorialScenario;
  published?: StoredTutorialScenario;
  publishedRevision: number;
  publishedAt?: Date;
  draftUpdatedAt?: Date;
}

export interface StoredRyoTutorialScenario {
  /** Absent on tutorials published before the V1 generalized contract. */
  kind?: 'ryo';
  version?: 1;
  prompt: string;
  options: { id: string; label: string }[];
  correctOptionId: string;
  answeringSelectionOptionId: string;
  opposingDecision: 'TRUST' | 'STEAL';
  caption?: string;
  outcome: {
    teamRole: 'answering' | 'opposing';
    delta: number;
    reason: string;
    correct: boolean;
  };
}

export interface StoredClosestTutorialScenario {
  kind: 'closest';
  version: 1;
  prompt: string;
  teamAEstimate: number;
  teamBEstimate: number;
  correctValue: number;
  unit?: string;
  caption?: string;
  outcome: {
    teamADistance: number;
    teamBDistance: number;
    winnerTeam: 'team-a' | 'team-b' | null;
    tie: boolean;
    /** One item win in Closest's three-item mechanic tally. */
    mechanicTallyDelta: number;
    /** One demonstrated item never awards the Match point by itself. */
    matchPointDelta: 0;
    reason: 'closest.absolute-distance';
  };
}

export interface StoredBombTutorialScenario {
  kind: 'bomb';
  version: 1;
  prompt: string;
  acceptedAnswer: string;
  nextPrompt: string;
  nextQuestion?: {
    prompt: string;
    acceptedAnswer: string;
    media?: { type: 'image'; url: string; altText: string };
  };
  returnQuestion?: {
    prompt: string;
    acceptedAnswer: string;
    media?: { type: 'image'; url: string; altText: string };
  };
  media?: { type: 'image'; url: string; altText: string };
  startingTeam: 'team-a' | 'team-b';
  correctAtSecondsRemaining: number;
  opponentExpiresAtSecondsRemaining: 0;
  caption?: string;
  outcome: {
    passedToTeam: 'team-a' | 'team-b';
    expiredTeam: 'team-a' | 'team-b';
    winnerTeam: 'team-a' | 'team-b';
    correctAnswerPassesTurn: true;
    timerResetsOnPass: false;
    matchPointDelta: 1;
    reason: 'bomb.clock-expired';
  };
}

export interface StoredOneClueTutorialScenario {
  kind: 'one-clue';
  version: 1;
  prompt: string;
  clues: Array<{
    order: 1 | 2 | 3 | 4 | 5;
    value: 5 | 4 | 3 | 2 | 1;
    text: string;
  }>;
  acceptedAnswer: string;
  firstSubmittedAnswer: string;
  secondSubmittedAnswer: string;
  caption?: string;
  outcome: {
    itemCount: 3;
    firstLockedTeam: 'team-a';
    firstLockedAtClue: 2;
    firstLockedValue: 4;
    firstAnswerCorrect: false;
    eliminatedTeam: 'team-a';
    continuingTeam: 'team-b';
    correctTeam: 'team-b';
    correctAtClue: 3;
    correctValue: 3;
    itemPoints: { 'team-a': 0; 'team-b': 3 };
    finalTotals: { 'team-a': 5; 'team-b': 7 };
    winnerTeam: 'team-b';
    matchPointDelta: 1;
    reason: 'one-clue.progressive-lock';
  };
}

export interface StoredEkshifniTutorialScenario {
  kind: 'ekshifni';
  version: 1;
  prompt: string;
  celebrityIdentity: string;
  image: {
    url: string;
    altText: string;
    sha256: string;
    provenanceNote: string;
  };
  regions: Array<{
    id: string;
    number: 1 | 2 | 3 | 4 | 5 | 6;
    shape: { x: number; y: number; width: number; height: number };
  }>;
  wrongSubmittedAnswer: string;
  correctSubmittedAnswer: string;
  caption?: string;
  outcome: {
    imageCount: 3;
    openingInitiative: ['team-a', 'team-b', 'team-a'];
    revealedRegionIds: string[];
    resolvedValue: 2;
    wrongTeam: 'team-a';
    initiativeAfterWrong: 'team-b';
    temporarilyParkedTeam: 'team-a';
    eligibilityRestoredBy: 'opponent-reveal';
    correctTeam: 'team-b';
    imagePoints: { 'team-a': 0; 'team-b': 2 };
    finalTotals: { 'team-a': 6; 'team-b': 8 };
    winnerTeam: 'team-b';
    matchPointDelta: 1;
    reason: 'ekshifni.clear-window-open-race';
  };
}

export interface StoredTop5TutorialScenario {
  kind: 'top-5';
  version: 1;
  prompt: string;
  title: string;
  rankingBasis: string;
  sourceLabel: string;
  entries: Array<{ id: string; label: string; rank: number | null }>;
  decisions: Array<{ action: 'keep' | 'give' }>;
  startingTeam: 'team-a' | 'team-b';
  instruction?: string;
  caption?: string;
  outcome: {
    entries: Array<{ id: string; label: string; rank: number | null }>;
    ownership: Array<{
      turn: number;
      entryId: string;
      actingTeam: 'team-a' | 'team-b';
      ownerTeam: 'team-a' | 'team-b';
      action: 'keep' | 'give';
    }>;
    top5Counts: Record<'team-a' | 'team-b', number>;
    trapCounts: Record<'team-a' | 'team-b', number>;
    revealOrder: string[];
    winnerTeam: 'team-a' | 'team-b';
    matchPointDelta: 1;
    reason: 'top-5.win';
  };
}

export interface StoredComboTutorialStage {
  stage: 1 | 2 | 3;
  prompt: string;
  correctAnswer: string;
  submittedAnswer: string;
}

export interface StoredComboTutorialScenario {
  kind: 'combo';
  version: 1;
  /** Compatibility summary for shared tutorial indexing; stage prompts are canonical. */
  prompt: string;
  stages: StoredComboTutorialStage[];
  caption?: string;
  outcome: {
    decision: 'continue-combo';
    breakArmedAtStage: 2;
    forcedQuestionStage: 3;
    correctStagesBeforeBreak: 2;
    unbankedPointsBeforeForcedQuestion: 2;
    forcedQuestionEarned: 0;
    bankedPoints: 0;
    endedBy: 'combo-break';
    reason: 'combo.push-your-luck';
  };
}

export interface StoredMarhalaTutorialScenario {
  kind: 'marhala';
  version: 1;
  prompt: string;
  correctAnswer: string;
  submittedAnswer: string;
  teamAPosition: number;
  teamBPosition: number;
  activeTeam: 'team-a' | 'team-b';
  difficulty: 'easy' | 'medium' | 'hard';
  movement: number;
  baseLanding: number;
  tile: 'normal' | 'boost' | 'trap' | 'finish';
  finalLanding: number;
  caption?: string;
  outcome: {
    teamAPosition: number;
    teamBPosition: number;
    activeTeam: 'team-a' | 'team-b';
    difficulty: 'easy' | 'medium' | 'hard';
    movement: number;
    baseLanding: number;
    tile: 'normal' | 'boost' | 'trap' | 'finish';
    finalLanding: number;
    correct: true;
    matchPointDelta: 0;
    reason: 'marhala.tutorial-turn';
  };
}

export interface StoredLaqathaTutorialClue {
  order: 1 | 2 | 3 | 4 | 5;
  value: 5 | 4 | 3 | 2 | 1;
  text: string;
}

export interface StoredLaqathaTutorialScenario {
  kind: 'laqatha';
  version: 1;
  prompt: string;
  title: string;
  clues: StoredLaqathaTutorialClue[];
  acceptedAnswers: string[];
  firstSubmittedAnswer: string;
  secondSubmittedAnswer: string;
  caption?: string;
  outcome: {
    questionCount: 3;
    firstClaimTeam: 'team-a';
    firstClaimAtClue: 2;
    firstClaimReward: 4;
    firstClaimFailed: true;
    secondClaimTeam: 'team-b';
    secondClaimAtClue: 3;
    secondClaimReward: 3;
    winnerTeam: 'team-b';
    points: { 'team-a': 0; 'team-b': 3 };
    reason: 'laqatha.claim-race';
  };
}

export interface StoredFirstNoteTutorialScenario {
  kind: 'first-note';
  version: 1;
  prompt: string;
  title: string;
  clueLabel?: string;
  contextualClue: string;
  bids: Array<{ team: 'team-a' | 'team-b'; seconds: number }>;
  acceptedAnswers: string[];
  firstSubmittedAnswer: string;
  stealSubmittedAnswer: string;
  caption?: string;
  outcome: {
    songCount: 3;
    bids: Array<{ team: 'team-a' | 'team-b'; seconds: number }>;
    finalBidSeconds: 3;
    auctionWinner: 'team-a';
    firstAnswerTeam: 'team-a';
    firstAnswerFailed: true;
    stealTeam: 'team-b';
    stolen: true;
    firstCorrectReward: 3;
    stealReward: 1;
    points: { 'team-a': 0; 'team-b': 1 };
    reason: 'first-note.auction-steal';
  };
}

export interface StoredLaTahriqhaTutorialScenario {
  kind: 'la-tahriqha';
  version: 1;
  prompt: string;
  dishWindowSeconds: number;
  dishes: Array<{
    id: string;
    name: string;
    ingredients: Array<{ id: string; label: string; correct: boolean }>;
    teamASelection: string[];
    teamBSelection: string[];
  }>;
  captainRotation: { teamA: string[]; teamB: string[] };
  caption?: string;
  outcome: {
    dishCount: 3;
    dishResults: Array<{
      dishIndex: number;
      dishId: string;
      dishName: string;
      captains: { teamA: string; teamB: string };
      teamA: {
        selected: string[];
        correctIds: string[];
        wrongIds: string[];
        points: number;
        burned: boolean;
        perfect: boolean;
        understaffed: boolean;
      };
      teamB: {
        selected: string[];
        correctIds: string[];
        wrongIds: string[];
        points: number;
        burned: boolean;
        perfect: boolean;
        understaffed: boolean;
      };
    }>;
    finalTotals: { 'team-a': number; 'team-b': number };
    winnerTeam: 'team-a' | 'team-b' | null;
    tie: boolean;
    matchPointDelta: 0 | 1;
    reason: 'la-tahriqha.challenge-win';
  };
}

export interface StoredOddPieceV1TutorialScenario {
  kind: 'odd-piece';
  version: 1;
  prompt: string;
  targetVehicleIdentity: string;
  targetVehicleLabel: string;
  intruderVehicleIdentity: string;
  intruderVehicleLabel: string;
  pieces: Array<{
    id: string;
    imageUrl: string;
    altText: string;
    vehicleIdentity: string;
    vehicleLabel: string;
  }>;
  wrongSelectionPieceId: string;
  correctSelectionPieceId: string;
  targetReveal: { imageUrl: string; altText: string };
  caption?: string;
  outcome: {
    firstClaimTeam: 'team-a';
    firstClaimPieceId: string;
    firstClaimCorrect: false;
    handoffTeam: 'team-b';
    secondClaimPieceId: string;
    secondClaimCorrect: true;
    winnerTeam: 'team-b';
    points: { 'team-a': 0; 'team-b': 1 };
    matchPointDelta: 1;
    intruderPieceId: string;
    targetVehicleLabel: string;
    targetReveal: { imageUrl: string; altText: string };
    puzzleCount: 3;
    reason: 'odd-piece.claim-handoff';
  };
}

export interface StoredOddPieceV2TutorialScenario {
  kind: 'odd-piece';
  version: 2;
  prompt: string;
  targetVehicleIdentity: string;
  targetVehicleLabel: string;
  intruderVehicleIdentity: string;
  intruderVehicleLabel: string;
  intruderPartIdentity: string;
  intruderPartLabel: string;
  modifiedImage: OddPieceHotspotImage;
  originalImage: OddPieceHotspotImage;
  tutorialRevealMode?: 'original-comparison' | 'hotspot-detail';
  tutorialMediaDisclosure?: string;
  team1Tap?: { x: number; y: number };
  team2Tap?: { x: number; y: number };
  hotspot: { polygon: Array<{ x: number; y: number }>; tolerance: number };
  wrongPoint: { x: number; y: number };
  correctPoint: { x: number; y: number };
  caption?: string;
  outcome: {
    firstClaimTeam: 'team-a';
    firstClaimPieceId: string;
    firstClaimCorrect: false;
    handoffTeam: 'team-b';
    secondClaimPieceId: string;
    secondClaimCorrect: true;
    winnerTeam: 'team-b';
    points: { 'team-a': 0; 'team-b': 1 };
    matchPointDelta: 1;
    intruderPieceId: string;
    targetVehicleLabel: string;
    targetReveal: { imageUrl: string; altText: string };
    puzzleCount: 3;
    reason: 'odd-piece.claim-handoff';
  };
}

export type StoredOddPieceTutorialScenario =
  StoredOddPieceV1TutorialScenario | StoredOddPieceV2TutorialScenario;

export type StoredTutorialScenario =
  | StoredRyoTutorialScenario
  | StoredClosestTutorialScenario
  | StoredBombTutorialScenario
  | StoredOneClueTutorialScenario
  | StoredEkshifniTutorialScenario
  | StoredTop5TutorialScenario
  | StoredComboTutorialScenario
  | StoredMarhalaTutorialScenario
  | StoredLaqathaTutorialScenario
  | StoredFirstNoteTutorialScenario
  | StoredLaTahriqhaTutorialScenario
  | StoredOddPieceTutorialScenario;

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
