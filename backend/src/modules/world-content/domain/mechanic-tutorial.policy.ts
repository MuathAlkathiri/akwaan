import {
  RyoDecision,
  RyoPayoffMatrixRule,
} from '../../scoring/application/ryo-payoff-matrix.rule';
import {
  ARABIC_DUPLICATE_THRESHOLD,
  arabicTextSimilarity,
  normalizeArabicText,
} from '../../../common/utils/arabic-text-similarity.util';
import { WorldContentIssue } from './world-content.types';
import { gradeClosestItem } from '../../live-game-sessions/domain/closest-gameplay.plugin';
import { Top5ResultRule } from '../../scoring/application/top5-result.rule';
import {
  COMBO_BREAK_SURVIVAL_BONUS,
  COMBO_STAGES,
} from '../../live-game-sessions/domain/combo-gameplay.plugin';
import {
  TOP5_ENTRY_COUNT,
  TOP5_RANKS,
  TOP5_TRAP_COUNT,
  LA_TAHRIQHA_CORRECT_COUNT,
  LA_TAHRIQHA_DISTRACTOR_COUNT,
  LA_TAHRIQHA_DISH_COUNT,
  LA_TAHRIQHA_INGREDIENT_COUNT,
  LA_TAHRIQHA_MAX_SELECTION,
  LA_TAHRIQHA_MIN_SELECTION,
} from './world-content.constants';
import { scoreLaTahriqhaDish } from './la-tahriqha-content.policy';
import {
  MARHALA_FINISH_POSITION,
  MARHALA_MOVEMENT_RANGES,
  marhalaTileDestination,
  marhalaTileKind,
  type MarhalaDifficulty,
  type MarhalaTileKind,
} from '../../live-game-sessions/domain/marhala-board';
import {
  pointWithinNormalizedPolygon,
  validateHotspotTolerance,
  validateNormalizedPolygon,
} from './odd-piece-hotspot.geometry';
import { OddPieceHotspotImage } from './world-content.types';

/**
 * The educational scenario a mechanic demonstrates, and the rules that decide
 * whether it may be published.
 *
 * One scenario per mechanic, keyed by the ChallengeType's canonical slug. Not
 * per World and not per Scope: the thing being taught is the *mechanic*, and a
 * host who has seen how "اقرأ خصمك" works has learned it everywhere.
 *
 * Two properties make this safe to show publicly, and both are enforced here
 * rather than trusted:
 *
 * 1. **The outcome is derived, never authored.** An editor chooses what the two
 *    sides *do*; the score that follows is computed by `RyoPayoffMatrixRule` —
 *    the same calculator the real Match scores with. A tutorial therefore cannot
 *    teach scoring the game does not actually apply, and cannot drift when the
 *    rule changes.
 * 2. **It is not competitive content.** A tutorial names no ContentItem, draws
 *    nothing from the catalog, and reserves nothing. The overlap guard below
 *    additionally refuses a prompt that is the same question as something a
 *    team could still be asked — because a publicly shown answer must never be
 *    an answer worth points later.
 */

/** Exactly four, because the mechanic's phone surface shows four. */
export const TUTORIAL_OPTION_COUNT = 4;

/** The sentinel a tutorial carries where a real round carries a ContentItem. */
export const TUTORIAL_CONTENT_ITEM_ID = 'tutorial';

export interface TutorialOption {
  id: string;
  label: string;
}

/** What an editor authors. */
export interface RyoTutorialScenarioInput {
  kind?: 'ryo';
  version?: 1;
  prompt: string;
  options: TutorialOption[];
  correctOptionId: string;
  /** What the answering team is shown to pick. */
  answeringSelectionOptionId: string;
  /** How the reading team is shown to call it. */
  opposingDecision: RyoDecision;
  /** Optional teaching line; the beat captions themselves stay in code. */
  caption?: string;
}

export interface ClosestTutorialScenarioInput {
  kind: 'closest';
  version: 1;
  prompt: string;
  teamAEstimate: number;
  teamBEstimate: number;
  correctValue: number;
  unit?: string;
  caption?: string;
}

export interface BombTutorialScenarioInput {
  kind: 'bomb';
  version: 1;
  prompt: string;
  acceptedAnswer: string;
  nextPrompt: string;
  startingTeam: 'team-a' | 'team-b';
  correctAtSecondsRemaining: number;
  opponentExpiresAtSecondsRemaining: 0;
  caption?: string;
}

export interface OneClueTutorialClueInput {
  order: 1 | 2 | 3 | 4 | 5;
  value: 5 | 4 | 3 | 2 | 1;
  text: string;
}

export interface OneClueTutorialScenarioInput {
  kind: 'one-clue';
  version: 1;
  prompt: string;
  clues: OneClueTutorialClueInput[];
  acceptedAnswer: string;
  firstSubmittedAnswer: string;
  secondSubmittedAnswer: string;
  caption?: string;
}

export interface EkshifniTutorialRegionInput {
  id: string;
  number: 1 | 2 | 3 | 4 | 5 | 6;
  shape: { x: number; y: number; width: number; height: number };
}

export interface EkshifniTutorialScenarioInput {
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
  regions: EkshifniTutorialRegionInput[];
  wrongSubmittedAnswer: string;
  correctSubmittedAnswer: string;
  caption?: string;
}

export interface Top5TutorialEntryInput {
  id: string;
  label: string;
  /** 1..5 for a real entry; null for a trap. */
  rank: number | null;
}

export interface Top5TutorialDecisionInput {
  action: 'keep' | 'give';
}

export interface Top5TutorialScenarioInput {
  kind: 'top-5';
  version: 1;
  prompt: string;
  title: string;
  rankingBasis: string;
  sourceLabel: string;
  entries: Top5TutorialEntryInput[];
  decisions: Top5TutorialDecisionInput[];
  startingTeam: 'team-a' | 'team-b';
  instruction?: string;
  caption?: string;
}

export interface ComboTutorialStageInput {
  stage: 1 | 2 | 3;
  prompt: string;
  correctAnswer: string;
  submittedAnswer: string;
}

export interface ComboTutorialScenarioInput {
  kind: 'combo';
  version: 1;
  stages: ComboTutorialStageInput[];
  caption?: string;
}

export interface MarhalaTutorialScenarioInput {
  kind: 'marhala';
  version: 1;
  prompt: string;
  correctAnswer: string;
  submittedAnswer: string;
  teamAPosition: number;
  teamBPosition: number;
  activeTeam: 'team-a' | 'team-b';
  difficulty: MarhalaDifficulty;
  movement: number;
  baseLanding: number;
  tile: MarhalaTileKind;
  finalLanding: number;
  caption?: string;
}

export interface LaqathaTutorialClueInput {
  order: 1 | 2 | 3 | 4 | 5;
  value: 5 | 4 | 3 | 2 | 1;
  text: string;
}

export interface LaqathaTutorialScenarioInput {
  kind: 'laqatha';
  version: 1;
  prompt: string;
  title: string;
  clues: LaqathaTutorialClueInput[];
  acceptedAnswers: string[];
  firstSubmittedAnswer: string;
  secondSubmittedAnswer: string;
  caption?: string;
}

export interface FirstNoteTutorialBidInput {
  team: 'team-a' | 'team-b';
  seconds: number;
}

export interface FirstNoteTutorialScenarioInput {
  kind: 'first-note';
  version: 1;
  prompt: string;
  title: string;
  clueLabel?: string;
  contextualClue: string;
  bids: FirstNoteTutorialBidInput[];
  acceptedAnswers: string[];
  firstSubmittedAnswer: string;
  stealSubmittedAnswer: string;
  caption?: string;
}

export interface LaTahriqhaTutorialIngredientInput {
  id: string;
  label: string;
  /** Authoring truth; never exposed by the pre-reveal renderer. */
  correct: boolean;
}

export interface LaTahriqhaTutorialDishInput {
  id: string;
  name: string;
  ingredients: LaTahriqhaTutorialIngredientInput[];
  teamASelection: string[];
  teamBSelection: string[];
}

export interface LaTahriqhaTutorialScenarioInput {
  kind: 'la-tahriqha';
  version: 1;
  prompt: string;
  dishWindowSeconds: number;
  dishes: LaTahriqhaTutorialDishInput[];
  captainRotation: { teamA: string[]; teamB: string[] };
  caption?: string;
}

export interface OddPieceTutorialMediaInput {
  imageUrl: string;
  altText: string;
}

export interface OddPieceTutorialPieceInput extends OddPieceTutorialMediaInput {
  id: string;
  vehicleIdentity: string;
  vehicleLabel: string;
}

export interface OddPieceV1TutorialScenarioInput {
  kind: 'odd-piece';
  version: 1;
  prompt: string;
  targetVehicleIdentity: string;
  targetVehicleLabel: string;
  intruderVehicleIdentity: string;
  intruderVehicleLabel: string;
  pieces: OddPieceTutorialPieceInput[];
  wrongSelectionPieceId: string;
  correctSelectionPieceId: string;
  targetReveal: OddPieceTutorialMediaInput;
  caption?: string;
}

export interface OddPieceV2TutorialScenarioInput {
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
  hotspot: { polygon: Array<{ x: number; y: number }>; tolerance: number };
  wrongPoint: { x: number; y: number };
  correctPoint: { x: number; y: number };
  caption?: string;
}

export type OddPieceTutorialScenarioInput =
  OddPieceV1TutorialScenarioInput | OddPieceV2TutorialScenarioInput;

/** Legacy callers still use the old name for an untagged RYO draft. */
export type TutorialScenarioInput =
  | RyoTutorialScenarioInput
  | ClosestTutorialScenarioInput
  | BombTutorialScenarioInput
  | OneClueTutorialScenarioInput
  | EkshifniTutorialScenarioInput
  | Top5TutorialScenarioInput
  | ComboTutorialScenarioInput
  | MarhalaTutorialScenarioInput
  | LaqathaTutorialScenarioInput
  | FirstNoteTutorialScenarioInput
  | LaTahriqhaTutorialScenarioInput
  | OddPieceTutorialScenarioInput;

/** The derived half — computed here, never accepted from a client. */
export interface TutorialOutcome {
  /** Which side the point moves to, by role rather than by team id. */
  teamRole: 'answering' | 'opposing';
  delta: number;
  reason: string;
  correct: boolean;
}

export interface TutorialScenario extends RyoTutorialScenarioInput {
  outcome: TutorialOutcome;
}

const DEMO_ANSWERING_TEAM = 'tutorial-answering';
const DEMO_OPPOSING_TEAM = 'tutorial-opposing';

/**
 * The real calculator, instantiated directly.
 *
 * It is a pure `calculate()` with no injected collaborators, so using it here
 * costs nothing and guarantees the tutorial and the Match cannot disagree. A
 * transcription would be a second implementation of the scoring rules, which is
 * exactly what must not exist.
 */
const payoffRule = new RyoPayoffMatrixRule();

export function deriveTutorialOutcome(
  input: Pick<
    RyoTutorialScenarioInput,
    'correctOptionId' | 'answeringSelectionOptionId' | 'opposingDecision'
  >,
): TutorialOutcome {
  const correct = input.answeringSelectionOptionId === input.correctOptionId;
  const [event] = payoffRule.calculate({
    answeringTeamId: DEMO_ANSWERING_TEAM,
    opposingTeamId: DEMO_OPPOSING_TEAM,
    // No ContentItem exists for a tutorial, and none is invented: the sentinel
    // makes that visible in anything that ever logs this.
    contentItemId: TUTORIAL_CONTENT_ITEM_ID,
    itemIndex: 0,
    selectedAnswer: input.answeringSelectionOptionId,
    correctAnswer: input.correctOptionId,
    decision: input.opposingDecision,
    correct,
  });

  return {
    teamRole: event.teamId === DEMO_ANSWERING_TEAM ? 'answering' : 'opposing',
    delta: event.delta,
    reason: event.reason,
    correct,
  };
}

export interface ClosestTutorialOutcome {
  teamADistance: number;
  teamBDistance: number;
  winnerTeam: 'team-a' | 'team-b' | null;
  tie: boolean;
  mechanicTallyDelta: number;
  matchPointDelta: 0;
  reason: 'closest.absolute-distance';
}

export interface BombTutorialOutcome {
  passedToTeam: 'team-a' | 'team-b';
  expiredTeam: 'team-a' | 'team-b';
  winnerTeam: 'team-a' | 'team-b';
  correctAnswerPassesTurn: true;
  timerResetsOnPass: false;
  matchPointDelta: 1;
  reason: 'bomb.clock-expired';
}

export interface OneClueTutorialOutcome {
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
}

export function deriveOneClueTutorialOutcome(
  _input: OneClueTutorialScenarioInput,
): OneClueTutorialOutcome {
  void _input;
  return {
    itemCount: 3,
    firstLockedTeam: 'team-a',
    firstLockedAtClue: 2,
    firstLockedValue: 4,
    firstAnswerCorrect: false,
    eliminatedTeam: 'team-a',
    continuingTeam: 'team-b',
    correctTeam: 'team-b',
    correctAtClue: 3,
    correctValue: 3,
    itemPoints: { 'team-a': 0, 'team-b': 3 },
    finalTotals: { 'team-a': 5, 'team-b': 7 },
    winnerTeam: 'team-b',
    matchPointDelta: 1,
    reason: 'one-clue.progressive-lock',
  };
}

export interface EkshifniTutorialOutcome {
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
}

export function deriveEkshifniTutorialOutcome(
  input: EkshifniTutorialScenarioInput,
): EkshifniTutorialOutcome {
  return {
    imageCount: 3,
    openingInitiative: ['team-a', 'team-b', 'team-a'],
    revealedRegionIds: input.regions.slice(0, 3).map((region) => region.id),
    resolvedValue: 2,
    wrongTeam: 'team-a',
    initiativeAfterWrong: 'team-b',
    temporarilyParkedTeam: 'team-a',
    eligibilityRestoredBy: 'opponent-reveal',
    correctTeam: 'team-b',
    imagePoints: { 'team-a': 0, 'team-b': 2 },
    finalTotals: { 'team-a': 6, 'team-b': 8 },
    winnerTeam: 'team-b',
    matchPointDelta: 1,
    reason: 'ekshifni.clear-window-open-race',
  };
}

export function validateEkshifniTutorialScenario(
  input: EkshifniTutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (input.version !== 1)
    add('TUTORIAL_VERSION_UNSUPPORTED', 'نسخة شرح اكشفني غير مدعومة.');
  if (!input.prompt?.trim())
    add('TUTORIAL_PROMPT_REQUIRED', 'السؤال التوضيحي مطلوب.');
  if (!input.celebrityIdentity?.trim())
    add('TUTORIAL_EKSHIFNI_IDENTITY_REQUIRED', 'هوية المشهور مطلوبة.');
  if (!input.image?.url?.trim() || !input.image?.altText?.trim())
    add(
      'TUTORIAL_EKSHIFNI_IMAGE_REQUIRED',
      'صورة المشهور وبديلها النصي مطلوبان.',
    );
  if (!/^[a-f0-9]{64}$/i.test(input.image?.sha256 ?? ''))
    add('TUTORIAL_EKSHIFNI_HASH_INVALID', 'بصمة الصورة SHA-256 غير صالحة.');
  if (!input.image?.provenanceNote?.trim())
    add('TUTORIAL_EKSHIFNI_PROVENANCE_REQUIRED', 'ملاحظة مصدر الصورة مطلوبة.');
  const regions = Array.isArray(input.regions) ? input.regions : [];
  if (regions.length !== 6)
    add('TUTORIAL_EKSHIFNI_REGION_COUNT', 'يجب تحديد ست نوافذ كشف.');
  if (
    new Set(regions.map((region) => region.id?.trim())).size !==
      regions.length ||
    new Set(regions.map((region) => region.number)).size !== regions.length
  )
    add(
      'TUTORIAL_EKSHIFNI_REGIONS_UNIQUE',
      'معرّفات النوافذ وأرقامها يجب أن تكون فريدة.',
    );
  for (const region of regions) {
    const s = region?.shape;
    if (
      !s ||
      ![s.x, s.y, s.width, s.height].every(Number.isFinite) ||
      s.x < 0 ||
      s.y < 0 ||
      s.width <= 0 ||
      s.height <= 0 ||
      s.x + s.width > 1 ||
      s.y + s.height > 1
    )
      add(
        'TUTORIAL_EKSHIFNI_REGION_INVALID',
        `نافذة الكشف ${region?.id ?? ''} خارج حدود الصورة.`,
      );
  }
  if (
    !input.wrongSubmittedAnswer?.trim() ||
    normalizeArabicText(input.wrongSubmittedAnswer) ===
      normalizeArabicText(input.celebrityIdentity)
  )
    add(
      'TUTORIAL_EKSHIFNI_WRONG_ANSWER_INVALID',
      'الإجابة الأولى يجب أن تكون خاطئة وغير فارغة.',
    );
  if (
    normalizeArabicText(input.correctSubmittedAnswer ?? '') !==
    normalizeArabicText(input.celebrityIdentity ?? '')
  )
    add(
      'TUTORIAL_EKSHIFNI_CORRECT_ANSWER_INVALID',
      'الإجابة الصحيحة يجب أن تطابق هوية المشهور.',
    );
  return issues;
}

export function deriveBombTutorialOutcome(
  input: Pick<BombTutorialScenarioInput, 'startingTeam'>,
): BombTutorialOutcome {
  const winnerTeam = input.startingTeam === 'team-a' ? 'team-b' : 'team-a';
  return {
    // The approved walkthrough passes away, returns pressure after the
    // opponent answers, then the starting team's remaining clock expires.
    passedToTeam: input.startingTeam,
    expiredTeam: input.startingTeam,
    winnerTeam,
    correctAnswerPassesTurn: true,
    timerResetsOnPass: false,
    matchPointDelta: 1,
    reason: 'bomb.clock-expired',
  };
}

export interface Top5TutorialOwnership {
  turn: number;
  entryId: string;
  actingTeam: 'team-a' | 'team-b';
  ownerTeam: 'team-a' | 'team-b';
  action: 'keep' | 'give';
}

export interface Top5TutorialOutcome {
  entries: Top5TutorialEntryInput[];
  ownership: Top5TutorialOwnership[];
  top5Counts: Record<'team-a' | 'team-b', number>;
  trapCounts: Record<'team-a' | 'team-b', number>;
  revealOrder: string[];
  winnerTeam: 'team-a' | 'team-b';
  matchPointDelta: 1;
  reason: 'top-5.win';
}

export interface ComboTutorialOutcome {
  decision: 'continue-combo';
  breakArmedAtStage: 2;
  forcedQuestionStage: 3;
  correctStagesBeforeBreak: 2;
  unbankedPointsBeforeForcedQuestion: 2;
  forcedQuestionEarned: 0;
  bankedPoints: 0;
  endedBy: 'combo-break';
  reason: 'combo.push-your-luck';
}

export interface MarhalaTutorialOutcome {
  teamAPosition: number;
  teamBPosition: number;
  activeTeam: 'team-a' | 'team-b';
  difficulty: MarhalaDifficulty;
  movement: number;
  baseLanding: number;
  tile: MarhalaTileKind;
  finalLanding: number;
  correct: true;
  matchPointDelta: 0;
  reason: 'marhala.tutorial-turn';
}

export interface LaqathaTutorialOutcome {
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
}

export interface FirstNoteTutorialOutcome {
  songCount: 3;
  bids: FirstNoteTutorialBidInput[];
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
}

export interface OddPieceTutorialOutcome {
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
  targetReveal: OddPieceTutorialMediaInput;
  puzzleCount: 3;
  reason: 'odd-piece.claim-handoff';
}

export function deriveOddPieceTutorialOutcome(
  input: OddPieceTutorialScenarioInput,
): OddPieceTutorialOutcome {
  if (input.version === 2) {
    return {
      firstClaimTeam: 'team-a',
      firstClaimPieceId: 'wrong-hotspot',
      firstClaimCorrect: false,
      handoffTeam: 'team-b',
      secondClaimPieceId: 'correct-hotspot',
      secondClaimCorrect: true,
      winnerTeam: 'team-b',
      points: { 'team-a': 0, 'team-b': 1 },
      matchPointDelta: 1,
      intruderPieceId: input.intruderPartIdentity,
      targetVehicleLabel: input.targetVehicleLabel.trim(),
      targetReveal: {
        imageUrl: input.originalImage?.media?.assets?.[0]?.url ?? '',
        altText: input.targetVehicleLabel.trim(),
      },
      puzzleCount: 3,
      reason: 'odd-piece.claim-handoff',
    };
  }
  const intruder = input.pieces.find(
    (piece) => piece.vehicleIdentity !== input.targetVehicleIdentity,
  );
  return {
    firstClaimTeam: 'team-a',
    firstClaimPieceId: input.wrongSelectionPieceId,
    firstClaimCorrect: false,
    handoffTeam: 'team-b',
    secondClaimPieceId: input.correctSelectionPieceId,
    secondClaimCorrect: true,
    winnerTeam: 'team-b',
    points: { 'team-a': 0, 'team-b': 1 },
    matchPointDelta: 1,
    intruderPieceId: intruder?.id ?? input.correctSelectionPieceId,
    targetVehicleLabel: input.targetVehicleLabel.trim(),
    targetReveal: {
      imageUrl: input.targetReveal.imageUrl.trim(),
      altText: input.targetReveal.altText.trim(),
    },
    puzzleCount: 3,
    reason: 'odd-piece.claim-handoff',
  };
}

export function validateOddPieceTutorialScenario(
  input: OddPieceTutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (input.version !== 1 && input.version !== 2) {
    add('TUTORIAL_VERSION_UNSUPPORTED', 'نسخة شرح القطعة الدخيلة غير مدعومة.');
    return issues;
  }
  if (!input.prompt?.trim())
    add('TUTORIAL_PROMPT_REQUIRED', 'السؤال التوضيحي مطلوب.');
  if (!input.targetVehicleIdentity?.trim() || !input.targetVehicleLabel?.trim())
    add('TUTORIAL_ODD_PIECE_TARGET_REQUIRED', 'هوية السيارة الهدف مطلوبة.');
  if (
    !input.intruderVehicleIdentity?.trim() ||
    !input.intruderVehicleLabel?.trim()
  )
    add('TUTORIAL_ODD_PIECE_INTRUDER_REQUIRED', 'هوية السيارة الدخيلة مطلوبة.');

  if (input.version === 2) {
    if (!input.intruderPartIdentity?.trim() || !input.intruderPartLabel?.trim())
      add(
        'TUTORIAL_ODD_PIECE_INTRUDER_PART_REQUIRED',
        'هوية القطعة الدخيلة مطلوبة.',
      );
    if (!input.modifiedImage?.media?.assets?.[0]?.url)
      add(
        'TUTORIAL_ODD_PIECE_MODIFIED_IMAGE_REQUIRED',
        'الصورة المعدّلة مطلوبة.',
      );
    if (!input.originalImage?.media?.assets?.[0]?.url)
      add(
        'TUTORIAL_ODD_PIECE_ORIGINAL_IMAGE_REQUIRED',
        'الصورة الأصلية مطلوبة.',
      );

    const polygonIssues = validateNormalizedPolygon(
      input.hotspot?.polygon ?? [],
    );
    if (polygonIssues.length > 0) {
      add('TUTORIAL_ODD_PIECE_HOTSPOT_INVALID', 'منطقة الحل غير صالحة.');
    }
    const toleranceIssues = validateHotspotTolerance(
      input.hotspot?.tolerance ?? 0,
    );
    if (toleranceIssues.length > 0) {
      add('TUTORIAL_ODD_PIECE_TOLERANCE_INVALID', 'نسبة التسامح غير صالحة.');
    }
    if (input.wrongPoint && input.hotspot?.polygon) {
      if (
        pointWithinNormalizedPolygon(
          input.wrongPoint,
          input.hotspot.polygon,
          input.hotspot.tolerance ?? 0,
        )
      ) {
        add(
          'TUTORIAL_ODD_PIECE_WRONG_SELECTION_INVALID',
          'نقطة الفريق الأول يجب أن تكون خارج منطقة الحل.',
        );
      }
    }
    if (input.correctPoint && input.hotspot?.polygon) {
      if (
        !pointWithinNormalizedPolygon(
          input.correctPoint,
          input.hotspot.polygon,
          input.hotspot.tolerance ?? 0,
        )
      ) {
        add(
          'TUTORIAL_ODD_PIECE_CORRECT_SELECTION_INVALID',
          'نقطة الفريق الثاني يجب أن تكون داخل منطقة الحل.',
        );
      }
    }
    return issues;
  }

  const pieces = Array.isArray(input.pieces) ? input.pieces : [];
  if (pieces.length !== 4)
    add(
      'TUTORIAL_ODD_PIECE_COUNT',
      'شرح القطعة الدخيلة يحتاج أربع قطع بالضبط.',
    );
  if (
    pieces.some(
      (piece) =>
        !piece?.id?.trim() ||
        !piece?.imageUrl?.trim() ||
        !piece?.altText?.trim() ||
        !piece?.vehicleIdentity?.trim() ||
        !piece?.vehicleLabel?.trim(),
    )
  )
    add(
      'TUTORIAL_ODD_PIECE_INCOMPLETE',
      'كل قطعة تحتاج صورة وهوية ومعلومات بديلة.',
    );
  const ids = pieces.map((piece) => piece?.id?.trim()).filter(Boolean);
  if (new Set(ids).size !== ids.length)
    add('TUTORIAL_ODD_PIECE_IDS_DUPLICATED', 'معرّفات القطع مكررة.');
  const targetCount = pieces.filter(
    (piece) => piece?.vehicleIdentity === input.targetVehicleIdentity,
  ).length;
  if (targetCount !== 3)
    add(
      'TUTORIAL_ODD_PIECE_TARGET_COUNT',
      'يجب أن تنتمي ثلاث قطع للسيارة الهدف.',
    );
  const intruders = pieces.filter(
    (piece) => piece?.vehicleIdentity !== input.targetVehicleIdentity,
  );
  if (intruders.length !== 1)
    add(
      'TUTORIAL_ODD_PIECE_INTRUDER_COUNT',
      'يجب أن توجد قطعة دخيلة واحدة فقط.',
    );
  const byId = new Map(pieces.map((piece) => [piece?.id, piece]));
  const wrong = byId.get(input.wrongSelectionPieceId);
  const correct = byId.get(input.correctSelectionPieceId);
  if (!wrong || wrong.vehicleIdentity !== input.targetVehicleIdentity)
    add(
      'TUTORIAL_ODD_PIECE_WRONG_SELECTION_INVALID',
      'اختيار الفريق الأول يجب أن يكون قطعة صحيحة من السيارة الهدف.',
    );
  if (!correct || correct.vehicleIdentity === input.targetVehicleIdentity)
    add(
      'TUTORIAL_ODD_PIECE_CORRECT_SELECTION_INVALID',
      'اختيار الفريق الثاني يجب أن يكون القطعة الدخيلة.',
    );
  if (input.wrongSelectionPieceId === input.correctSelectionPieceId)
    add(
      'TUTORIAL_ODD_PIECE_SELECTIONS_DUPLICATED',
      'اختيارا الفريقين يجب أن يكونا مختلفين.',
    );
  if (
    !input.targetReveal?.imageUrl?.trim() ||
    !input.targetReveal?.altText?.trim()
  )
    add('TUTORIAL_ODD_PIECE_REVEAL_REQUIRED', 'صورة الكشف الكاملة مطلوبة.');
  const leakedLabels = [
    input.targetVehicleIdentity,
    input.targetVehicleLabel,
    input.intruderVehicleIdentity,
    input.intruderVehicleLabel,
  ]
    .filter(Boolean)
    .map(normalizeArabicText);
  pieces.forEach((piece) => {
    const alt = normalizeArabicText(piece?.altText ?? '');
    if (leakedLabels.some((label) => label && alt.includes(label)))
      add(
        'TUTORIAL_ODD_PIECE_ALT_LEAKS_IDENTITY',
        'النص البديل للقطعة لا يجوز أن يكشف هوية السيارة قبل الكشف.',
      );
  });
  return issues;
}

export function deriveFirstNoteTutorialOutcome(
  input: FirstNoteTutorialScenarioInput,
): FirstNoteTutorialOutcome {
  return {
    songCount: 3,
    bids: input.bids,
    finalBidSeconds: 3,
    auctionWinner: 'team-a',
    firstAnswerTeam: 'team-a',
    firstAnswerFailed: true,
    stealTeam: 'team-b',
    stolen: true,
    firstCorrectReward: 3,
    stealReward: 1,
    points: { 'team-a': 0, 'team-b': 1 },
    reason: 'first-note.auction-steal',
  };
}

export function validateFirstNoteTutorialScenario(
  input: FirstNoteTutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (input.version !== 1)
    add('TUTORIAL_VERSION_UNSUPPORTED', 'نسخة شرح من أول نغمة غير مدعومة.');
  if (!input.prompt?.trim())
    add('TUTORIAL_PROMPT_REQUIRED', 'السؤال التوضيحي مطلوب.');
  if (!input.title?.trim())
    add('TUTORIAL_FIRST_NOTE_TITLE_REQUIRED', 'عنوان الأغنية مطلوب.');
  if (!input.contextualClue?.trim())
    add('TUTORIAL_FIRST_NOTE_CLUE_REQUIRED', 'الدليل الموسيقي مطلوب.');
  if (
    input.title?.trim() &&
    normalizeArabicText(input.contextualClue).includes(
      normalizeArabicText(input.title),
    )
  ) {
    add(
      'TUTORIAL_FIRST_NOTE_CLUE_LEAKS_TITLE',
      'الدليل لا يجوز أن يكشف عنوان الأغنية.',
    );
  }
  const bids = Array.isArray(input.bids) ? input.bids : [];
  if (bids.length !== 3) {
    add(
      'TUTORIAL_FIRST_NOTE_BID_COUNT',
      'شرح من أول نغمة يحتاج ثلاث مزايدات متتابعة.',
    );
  }
  bids.forEach((bid, index) => {
    const expectedTeam = index % 2 === 0 ? 'team-a' : 'team-b';
    if (bid?.team !== expectedTeam)
      add(
        'TUTORIAL_FIRST_NOTE_BID_TURN',
        'المزايدات يجب أن تتناوب بين الفريقين.',
      );
    if (!Number.isInteger(bid?.seconds) || bid.seconds < 1 || bid.seconds > 15)
      add(
        'TUTORIAL_FIRST_NOTE_BID_RANGE',
        'المزايدة يجب أن تكون بين 1 و15 ثانية.',
      );
    if (index > 0 && bid.seconds >= bids[index - 1].seconds)
      add(
        'TUTORIAL_FIRST_NOTE_BID_DESCENDING',
        'كل مزايدة جديدة يجب أن تكون أقل من السابقة.',
      );
  });
  if (
    bids.length === 3 &&
    (bids[0].seconds !== 8 || bids[1].seconds !== 5 || bids[2].seconds !== 3)
  )
    add(
      'TUTORIAL_FIRST_NOTE_CANONICAL_BIDS',
      'المسار المعتمد هو 8 ثم 5 ثم 3 ثوانٍ.',
    );
  const accepted = (input.acceptedAnswers ?? [])
    .map(normalizeArabicText)
    .filter(Boolean);
  if (!accepted.length)
    add(
      'TUTORIAL_FIRST_NOTE_ANSWERS_REQUIRED',
      'يحتاج الشرح إجابة أغنية مقبولة.',
    );
  if (
    !input.firstSubmittedAnswer?.trim() ||
    accepted.includes(normalizeArabicText(input.firstSubmittedAnswer))
  )
    add(
      'TUTORIAL_FIRST_NOTE_FIRST_ANSWER_WRONG',
      'يجب أن تكون إجابة الفريق الأول خاطئة.',
    );
  if (
    !input.stealSubmittedAnswer?.trim() ||
    !accepted.includes(normalizeArabicText(input.stealSubmittedAnswer))
  )
    add('TUTORIAL_FIRST_NOTE_STEAL_CORRECT', 'يجب أن تكون إجابة السرقة صحيحة.');
  return issues;
}

export interface LaTahriqhaTutorialDishResult {
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
}

export interface LaTahriqhaTutorialOutcome {
  dishCount: 3;
  dishResults: LaTahriqhaTutorialDishResult[];
  finalTotals: { 'team-a': number; 'team-b': number };
  winnerTeam: 'team-a' | 'team-b' | null;
  tie: boolean;
  matchPointDelta: 0 | 1;
  reason: 'la-tahriqha.challenge-win';
}

export function deriveLaTahriqhaTutorialOutcome(
  input: LaTahriqhaTutorialScenarioInput,
): LaTahriqhaTutorialOutcome {
  const dishResults = input.dishes.map((dish, index) => {
    const ingredients = dish.ingredients.map((ingredient) => ({
      localId: ingredient.id,
      correct: ingredient.correct,
    }));
    const teamA = scoreLaTahriqhaDish(ingredients, dish.teamASelection);
    const teamB = scoreLaTahriqhaDish(ingredients, dish.teamBSelection);
    return {
      dishIndex: index,
      dishId: dish.id,
      dishName: dish.name.trim(),
      captains: {
        teamA: input.captainRotation.teamA[index]?.trim() ?? '',
        teamB: input.captainRotation.teamB[index]?.trim() ?? '',
      },
      teamA: { selected: [...dish.teamASelection], ...teamA },
      teamB: { selected: [...dish.teamBSelection], ...teamB },
    };
  });
  const finalTotals = {
    'team-a': dishResults.reduce((sum, result) => sum + result.teamA.points, 0),
    'team-b': dishResults.reduce((sum, result) => sum + result.teamB.points, 0),
  };
  const tie = finalTotals['team-a'] === finalTotals['team-b'];
  return {
    dishCount: LA_TAHRIQHA_DISH_COUNT,
    dishResults,
    finalTotals,
    winnerTeam: tie
      ? null
      : finalTotals['team-a'] > finalTotals['team-b']
        ? 'team-a'
        : 'team-b',
    tie,
    matchPointDelta: tie ? 0 : 1,
    reason: 'la-tahriqha.challenge-win',
  };
}

export function validateLaTahriqhaTutorialScenario(
  input: LaTahriqhaTutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (input.version !== 1)
    add('TUTORIAL_VERSION_UNSUPPORTED', 'نسخة شرح لا تحرقها غير مدعومة.');
  if (!input.prompt?.trim())
    add('TUTORIAL_PROMPT_REQUIRED', 'السؤال التوضيحي مطلوب.');
  if (
    !Number.isInteger(input.dishWindowSeconds) ||
    input.dishWindowSeconds < 5 ||
    input.dishWindowSeconds > 120
  ) {
    add(
      'TUTORIAL_LA_TAHRIQHA_TIMER_INVALID',
      'نافذة الطبق يجب أن تكون بين 5 و120 ثانية.',
    );
  }
  const dishes = Array.isArray(input.dishes) ? input.dishes : [];
  if (dishes.length !== LA_TAHRIQHA_DISH_COUNT)
    add('TUTORIAL_LA_TAHRIQHA_DISH_COUNT', 'شرح لا تحرقها يحتاج ثلاثة أطباق.');
  if (new Set(dishes.map((dish) => dish?.id)).size !== dishes.length)
    add('TUTORIAL_LA_TAHRIQHA_DISH_IDS_DUPLICATED', 'معرّفات الأطباق مكررة.');
  dishes.forEach((dish, index) => {
    if (!dish?.id?.trim() || !dish?.name?.trim())
      add(
        'TUTORIAL_LA_TAHRIQHA_DISH_INCOMPLETE',
        `الطبق ${index + 1} غير مكتمل.`,
      );
    const ingredients = Array.isArray(dish?.ingredients)
      ? dish.ingredients
      : [];
    if (ingredients.length !== LA_TAHRIQHA_INGREDIENT_COUNT)
      add(
        'TUTORIAL_LA_TAHRIQHA_INGREDIENT_COUNT',
        `الطبق ${index + 1} يحتاج ثماني بطاقات مكونات.`,
      );
    const ids = ingredients.map((ingredient) => ingredient?.id?.trim());
    if (
      ids.some((id) => !id) ||
      new Set(ids).size !== ingredients.length ||
      ingredients.some(
        (ingredient) =>
          !ingredient?.label?.trim() || typeof ingredient.correct !== 'boolean',
      )
    ) {
      add(
        'TUTORIAL_LA_TAHRIQHA_INGREDIENTS_INVALID',
        `بطاقات مكونات الطبق ${index + 1} غير صالحة.`,
      );
    }
    const correctCount = ingredients.filter(
      (ingredient) => ingredient?.correct === true,
    ).length;
    const distractorCount = ingredients.filter(
      (ingredient) => ingredient?.correct === false,
    ).length;
    if (
      correctCount !== LA_TAHRIQHA_CORRECT_COUNT ||
      distractorCount !== LA_TAHRIQHA_DISTRACTOR_COUNT
    )
      add(
        'TUTORIAL_LA_TAHRIQHA_RECIPE_COUNTS',
        `الطبق ${index + 1} يحتاج خمسة مكونات صحيحة وثلاثة مشتتات.`,
      );
    const known = new Set(ids.filter(Boolean));
    for (const selection of [dish?.teamASelection, dish?.teamBSelection]) {
      if (
        !Array.isArray(selection) ||
        selection.length < LA_TAHRIQHA_MIN_SELECTION ||
        selection.length > LA_TAHRIQHA_MAX_SELECTION ||
        new Set(selection).size !== selection.length ||
        selection.some((id) => !known.has(id))
      ) {
        add(
          'TUTORIAL_LA_TAHRIQHA_SELECTION_INVALID',
          `اختيارات الطبق ${index + 1} يجب أن تضم 3 إلى 5 بطاقات معروفة.`,
        );
      }
    }
  });
  const rotation = input.captainRotation;
  for (const team of ['teamA', 'teamB'] as const) {
    const captains = Array.isArray(rotation?.[team]) ? rotation[team] : [];
    if (
      captains.length !== LA_TAHRIQHA_DISH_COUNT ||
      captains.some((captain) => !captain?.trim()) ||
      new Set(captains.map((captain) => captain.trim())).size !==
        captains.length
    ) {
      add(
        'TUTORIAL_LA_TAHRIQHA_CAPTAIN_ROTATION_INVALID',
        `تدوير قائد الطبق للفريق ${team === 'teamA' ? 'الأول' : 'الثاني'} غير صالح.`,
      );
    }
  }
  if (dishes.length === LA_TAHRIQHA_DISH_COUNT) {
    const firstA = dishes[0].teamASelection;
    const firstB = dishes[0].teamBSelection;
    const firstGradeA = scoreLaTahriqhaDish(
      dishes[0].ingredients.map((ingredient) => ({
        localId: ingredient.id,
        correct: ingredient.correct,
      })),
      firstA,
    );
    const firstGradeB = scoreLaTahriqhaDish(
      dishes[0].ingredients.map((ingredient) => ({
        localId: ingredient.id,
        correct: ingredient.correct,
      })),
      firstB,
    );
    if (!firstGradeA.burned || firstGradeA.points !== 0)
      add(
        'TUTORIAL_LA_TAHRIQHA_BURN_PATH_INVALID',
        'يجب أن يحترق طبق الفريق الأول في المثال.',
      );
    if (!firstGradeB.perfect || firstGradeB.points !== 7)
      add(
        'TUTORIAL_LA_TAHRIQHA_PERFECT_PATH_INVALID',
        'يجب أن يحقق الفريق الثاني طبقًا مثاليًا في المثال.',
      );
  }
  return issues;
}

export function deriveLaqathaTutorialOutcome(
  input: LaqathaTutorialScenarioInput,
): LaqathaTutorialOutcome {
  const accepted = input.acceptedAnswers
    .map(normalizeArabicText)
    .filter(Boolean);
  if (!accepted.includes(normalizeArabicText(input.secondSubmittedAnswer))) {
    throw new Error(
      'القطها tutorial path needs the opponent answer to be correct',
    );
  }
  if (accepted.includes(normalizeArabicText(input.firstSubmittedAnswer))) {
    throw new Error('القطها tutorial path needs the first claim to be wrong');
  }
  return {
    questionCount: 3,
    firstClaimTeam: 'team-a',
    firstClaimAtClue: 2,
    firstClaimReward: 4,
    firstClaimFailed: true,
    secondClaimTeam: 'team-b',
    secondClaimAtClue: 3,
    secondClaimReward: 3,
    winnerTeam: 'team-b',
    points: { 'team-a': 0, 'team-b': 3 },
    reason: 'laqatha.claim-race',
  };
}

export function validateLaqathaTutorialScenario(
  input: LaqathaTutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (input.version !== 1)
    add('TUTORIAL_VERSION_UNSUPPORTED', 'نسخة شرح القطها غير مدعومة.');
  if (!input.prompt?.trim())
    add('TUTORIAL_PROMPT_REQUIRED', 'السؤال التوضيحي مطلوب.');
  if (!input.title?.trim())
    add('TUTORIAL_LAQATHA_TITLE_REQUIRED', 'عنوان الفيلم مطلوب.');
  if (!Array.isArray(input.clues) || input.clues.length !== 5) {
    add('TUTORIAL_LAQATHA_CLUE_COUNT', 'شرح القطها يحتاج خمسة أدلة مرتبة.');
  }
  const clues = Array.isArray(input.clues) ? input.clues : [];
  const values = [5, 4, 3, 2, 1];
  clues.forEach((clue, index) => {
    if (
      clue?.order !== index + 1 ||
      clue?.value !== values[index] ||
      !clue?.text?.trim()
    ) {
      add(
        'TUTORIAL_LAQATHA_CLUE_ORDER',
        'أدلة القطها يجب أن تكون 1→5 بقيم 5→1 وكل دليل غير فارغ.',
      );
    }
  });
  const answers = (input.acceptedAnswers ?? [])
    .map(normalizeArabicText)
    .filter(Boolean);
  if (!answers.length)
    add(
      'TUTORIAL_LAQATHA_ANSWERS_REQUIRED',
      'يحتاج شرح القطها إجابة مقبولة واحدة على الأقل.',
    );
  if (
    !input.firstSubmittedAnswer?.trim() ||
    answers.includes(normalizeArabicText(input.firstSubmittedAnswer))
  ) {
    add(
      'TUTORIAL_LAQATHA_FIRST_CLAIM_WRONG',
      'يجب أن تكون مطالبة الفريق الأول خاطئة لشرح المخاطرة.',
    );
  }
  if (
    !input.secondSubmittedAnswer?.trim() ||
    !answers.includes(normalizeArabicText(input.secondSubmittedAnswer))
  ) {
    add(
      'TUTORIAL_LAQATHA_SECOND_CLAIM_CORRECT',
      'يجب أن تكون إجابة الفريق الثاني صحيحة.',
    );
  }
  if (!input.title?.trim() || !input.secondSubmittedAnswer?.trim())
    return issues;
  return issues;
}

export function deriveMarhalaTutorialOutcome(
  input: MarhalaTutorialScenarioInput,
): MarhalaTutorialOutcome {
  const activePosition =
    input.activeTeam === 'team-a' ? input.teamAPosition : input.teamBPosition;
  const baseLanding = Math.min(
    activePosition + input.movement,
    MARHALA_FINISH_POSITION,
  );
  const tile = marhalaTileKind(baseLanding);
  const finalLanding = marhalaTileDestination(baseLanding);
  return {
    teamAPosition:
      input.activeTeam === 'team-a' ? finalLanding : input.teamAPosition,
    teamBPosition:
      input.activeTeam === 'team-b' ? finalLanding : input.teamBPosition,
    activeTeam: input.activeTeam,
    difficulty: input.difficulty,
    movement: input.movement,
    baseLanding,
    tile,
    finalLanding,
    correct: true,
    matchPointDelta: 0,
    reason: 'marhala.tutorial-turn',
  };
}

export function validateMarhalaTutorialScenario(
  input: MarhalaTutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (input.version !== 1)
    add('TUTORIAL_VERSION_UNSUPPORTED', 'نسخة شرح المرحلة غير مدعومة.');
  if (!input.prompt?.trim())
    add('TUTORIAL_PROMPT_REQUIRED', 'السؤال التوضيحي مطلوب.');
  if (!input.correctAnswer?.trim() || !input.submittedAnswer?.trim()) {
    add(
      'TUTORIAL_MARHALA_ANSWER_REQUIRED',
      'الإجابة الصحيحة والمرسلة مطلوبتان.',
    );
  } else if (
    normalizeArabicText(input.correctAnswer) !==
    normalizeArabicText(input.submittedAnswer)
  ) {
    add(
      'TUTORIAL_MARHALA_CORRECT_PATH_INVALID',
      'مسار شرح المرحلة يحتاج إجابة صحيحة.',
    );
  }
  if (!['team-a', 'team-b'].includes(input.activeTeam))
    add('TUTORIAL_MARHALA_ACTIVE_TEAM_INVALID', 'الفريق النشط غير صالح.');
  for (const [label, position] of [
    ['A', input.teamAPosition],
    ['B', input.teamBPosition],
  ] as const) {
    if (
      !Number.isInteger(position) ||
      position < 1 ||
      position > MARHALA_FINISH_POSITION
    ) {
      add(
        'TUTORIAL_MARHALA_POSITION_INVALID',
        `موضع الفريق ${label} يجب أن يكون بين 1 و16.`,
      );
    }
  }
  if (input.teamAPosition === input.teamBPosition)
    add('TUTORIAL_MARHALA_POSITIONS_OVERLAP', 'موضعا الفريقين يجب أن يختلفا.');
  const range = MARHALA_MOVEMENT_RANGES[input.difficulty];
  if (!range) {
    add('TUTORIAL_MARHALA_DIFFICULTY_INVALID', 'مستوى الصعوبة غير صالح.');
  } else if (
    !Number.isInteger(input.movement) ||
    input.movement < range.min ||
    input.movement > range.max
  ) {
    add(
      'TUTORIAL_MARHALA_MOVEMENT_INVALID',
      'الحركة يجب أن تقع داخل نطاق الصعوبة المختارة.',
    );
  }
  const activePosition =
    input.activeTeam === 'team-a' ? input.teamAPosition : input.teamBPosition;
  const expectedBaseLanding = Math.min(
    activePosition + input.movement,
    MARHALA_FINISH_POSITION,
  );
  const expectedTile = marhalaTileKind(expectedBaseLanding);
  const expectedFinalLanding = marhalaTileDestination(expectedBaseLanding);
  if (input.baseLanding !== expectedBaseLanding)
    add(
      'TUTORIAL_MARHALA_BASE_LANDING_INVALID',
      'موضع الهبوط الأساسي لا يطابق الحركة.',
    );
  if (input.tile !== expectedTile)
    add('TUTORIAL_MARHALA_TILE_INVALID', 'نوع المربع لا يطابق لوحة المرحلة.');
  if (input.finalLanding !== expectedFinalLanding)
    add(
      'TUTORIAL_MARHALA_FINAL_LANDING_INVALID',
      'موضع الهبوط النهائي لا يطابق تأثير المربع.',
    );
  return issues;
}

/** Uses the same pure grader as live Closest; no Match is created or mutated. */
export function deriveClosestTutorialOutcome(
  input: Pick<
    ClosestTutorialScenarioInput,
    'teamAEstimate' | 'teamBEstimate' | 'correctValue'
  >,
): ClosestTutorialOutcome {
  const result = gradeClosestItem({
    item: {
      id: TUTORIAL_CONTENT_ITEM_ID,
      prompt: '',
      correctValue: input.correctValue,
    },
    teamIds: ['team-a', 'team-b'],
    answers: {
      'team-a': input.teamAEstimate,
      'team-b': input.teamBEstimate,
    },
    assignedParticipantIds: {
      'team-a': 'tutorial-team-a',
      'team-b': 'tutorial-team-b',
    },
    itemIndex: 0,
    resolutionReason: 'both-submitted',
    resolvedAt: '1970-01-01T00:00:00.000Z',
  });
  return {
    teamADistance: result.distances['team-a']!,
    teamBDistance: result.distances['team-b']!,
    winnerTeam:
      result.winnerTeamId === 'team-a'
        ? 'team-a'
        : result.winnerTeamId === 'team-b'
          ? 'team-b'
          : null,
    tie: result.tie,
    mechanicTallyDelta: result.tie ? 0 : 1,
    matchPointDelta: 0,
    reason: 'closest.absolute-distance',
  };
}

export function deriveTop5TutorialOutcome(
  input: Pick<
    Top5TutorialScenarioInput,
    'entries' | 'decisions' | 'startingTeam'
  >,
): Top5TutorialOutcome {
  const teams: ['team-a', 'team-b'] = ['team-a', 'team-b'];
  const ownership: Top5TutorialOwnership[] = input.decisions.map(
    (decision, index) => {
      const actingTeam =
        input.startingTeam === 'team-a'
          ? index % 2 === 0
            ? 'team-a'
            : 'team-b'
          : index % 2 === 0
            ? 'team-b'
            : 'team-a';
      const ownerTeam =
        decision.action === 'keep'
          ? actingTeam
          : actingTeam === 'team-a'
            ? 'team-b'
            : 'team-a';
      return {
        turn: index + 1,
        entryId: input.entries[index]?.id ?? '',
        actingTeam,
        ownerTeam,
        action: decision.action,
      };
    },
  );
  const top5Counts: Record<'team-a' | 'team-b', number> = {
    'team-a': 0,
    'team-b': 0,
  };
  const trapCounts: Record<'team-a' | 'team-b', number> = {
    'team-a': 0,
    'team-b': 0,
  };
  const rankById = new Map(
    input.entries.map((entry) => [entry.id, entry.rank]),
  );
  for (const record of ownership) {
    if (rankById.get(record.entryId) === null)
      trapCounts[record.ownerTeam] += 1;
    else top5Counts[record.ownerTeam] += 1;
  }
  const [event] = new Top5ResultRule().calculate({
    teamIds: teams,
    top5Counts,
    trapCounts,
    contentItemId: TUTORIAL_CONTENT_ITEM_ID,
    startingTeamId: input.startingTeam,
    ownership,
  });
  const winnerTeam = event?.teamId === 'team-b' ? 'team-b' : 'team-a';
  return {
    entries: input.entries,
    ownership,
    top5Counts,
    trapCounts,
    revealOrder: input.entries.map((entry) => entry.id),
    winnerTeam,
    matchPointDelta: 1,
    reason: 'top-5.win',
  };
}

export function deriveComboTutorialOutcome(
  input: ComboTutorialScenarioInput,
): ComboTutorialOutcome {
  // The approved teaching path is intentionally deterministic: Q1 and Q2 are
  // answered correctly, the opponent's one break charge is spent before Q2,
  // and the forced Q3 is missed. The values below are derived from Combo's
  // canonical +1 scoring and its +1 survival bonus (which is not paid on a
  // failed forced question), never authored by the editor.
  const stages = input.stages;
  const firstTwoCorrect = stages
    .slice(0, 2)
    .every(
      (stage) =>
        normalizeArabicText(stage.correctAnswer) ===
        normalizeArabicText(stage.submittedAnswer),
    );
  const forcedQuestionMissed =
    normalizeArabicText(stages[2]?.correctAnswer ?? '') !==
    normalizeArabicText(stages[2]?.submittedAnswer ?? '');
  if (!firstTwoCorrect || !forcedQuestionMissed) {
    // Structural validation reports the actionable issue; this guard keeps the
    // derived contract impossible to construct with a contradictory outcome.
    throw new Error('Combo tutorial path does not match the approved sequence');
  }
  return {
    decision: 'continue-combo',
    breakArmedAtStage: 2,
    forcedQuestionStage: 3,
    correctStagesBeforeBreak: 2,
    unbankedPointsBeforeForcedQuestion: 2,
    forcedQuestionEarned: 0,
    bankedPoints: 0,
    endedBy: 'combo-break',
    reason: 'combo.push-your-luck',
  };
}

export function validateComboTutorialScenario(
  input: ComboTutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (input.version !== 1)
    add('TUTORIAL_VERSION_UNSUPPORTED', 'نسخة شرح الكومبو غير مدعومة.');
  if (!Array.isArray(input.stages) || input.stages.length !== 3) {
    add('TUTORIAL_COMBO_STAGE_COUNT', 'شرح الكومبو يحتاج ثلاثة أسئلة متتابعة.');
    return issues;
  }
  const stages = input.stages;
  if (stages.some((stage, index) => stage?.stage !== COMBO_STAGES[index])) {
    add('TUTORIAL_COMBO_STAGE_ORDER', 'مراحل الكومبو يجب أن تكون 1 ثم 2 ثم 3.');
  }
  if (
    stages.some(
      (stage) =>
        !stage?.prompt?.trim() ||
        !stage?.correctAnswer?.trim() ||
        !stage?.submittedAnswer?.trim(),
    )
  ) {
    add(
      'TUTORIAL_COMBO_STAGE_INCOMPLETE',
      'كل سؤال في شرح الكومبو يحتاج سؤالًا وإجابة صحيحة وإجابة مرسلة.',
    );
  }
  const prompts = stages.map((stage) => normalizeArabicText(stage.prompt));
  if (new Set(prompts).size !== prompts.length) {
    add('TUTORIAL_COMBO_PROMPTS_DUPLICATED', 'أسئلة مراحل الكومبو مكررة.');
  }
  const firstTwoCorrect = stages
    .slice(0, 2)
    .every(
      (stage) =>
        normalizeArabicText(stage.correctAnswer) ===
        normalizeArabicText(stage.submittedAnswer),
    );
  if (!firstTwoCorrect) {
    add(
      'TUTORIAL_COMBO_DECISION_PATH_INVALID',
      'المسار التعليمي يحتاج إجابة صحيحة في المرحلتين الأولى والثانية قبل المخاطرة.',
    );
  }
  if (
    normalizeArabicText(stages[2]?.correctAnswer ?? '') ===
    normalizeArabicText(stages[2]?.submittedAnswer ?? '')
  ) {
    add(
      'TUTORIAL_COMBO_FORCED_OUTCOME_INVALID',
      'السؤال الإجباري في المثال يجب أن ينتهي بإجابة خاطئة حتى يظهر خطر الاستمرار.',
    );
  }
  // Keep the canonical bonus referenced in the validation contract so a future
  // scoring change cannot silently leave this teaching path undocumented.
  if (COMBO_BREAK_SURVIVAL_BONUS !== 1) {
    add(
      'TUTORIAL_COMBO_RULE_MISMATCH',
      'مكافأة النجاة في الكومبو تغيّرت؛ راجع شرح المثال قبل النشر.',
    );
  }
  return issues;
}

/** Structural validation. Returns every problem, not the first. */
export function validateTutorialScenario(
  input: RyoTutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) => issues.push(details ? { code, message, details } : { code, message });

  if (!input.prompt?.trim()) {
    add('TUTORIAL_PROMPT_REQUIRED', 'السؤال التوضيحي مطلوب.');
  }

  const options = input.options ?? [];
  if (options.length !== TUTORIAL_OPTION_COUNT) {
    add(
      'TUTORIAL_OPTION_COUNT',
      `يجب أن تكون الخيارات ${TUTORIAL_OPTION_COUNT} بالضبط.`,
      { received: options.length },
    );
  }

  if (options.some((option) => !option?.id?.trim() || !option?.label?.trim())) {
    add('TUTORIAL_OPTION_INCOMPLETE', 'كل خيار يحتاج معرّفًا ونصًا.');
  }

  const ids = options.map((option) => option?.id?.trim()).filter(Boolean);
  if (new Set(ids).size !== ids.length) {
    add('TUTORIAL_OPTION_IDS_DUPLICATED', 'معرّفات الخيارات مكررة.');
  }

  // Two options reading the same thing make the demonstrated "read" meaningless,
  // so near-duplicates are rejected with the same normalization used everywhere.
  const labels = options
    .map((option) => normalizeArabicText(option?.label ?? ''))
    .filter(Boolean);
  if (new Set(labels).size !== labels.length) {
    add('TUTORIAL_OPTION_LABELS_DUPLICATED', 'نصوص الخيارات مكررة.');
  }

  const known = new Set(ids);
  if (!known.has(input.correctOptionId?.trim())) {
    add(
      'TUTORIAL_CORRECT_OPTION_UNKNOWN',
      'الإجابة الصحيحة ليست ضمن الخيارات.',
    );
  }
  if (!known.has(input.answeringSelectionOptionId?.trim())) {
    add('TUTORIAL_SELECTION_UNKNOWN', 'اختيار الفريق المجيب ليس ضمن الخيارات.');
  }
  if (
    input.opposingDecision !== 'TRUST' &&
    input.opposingDecision !== 'STEAL'
  ) {
    add('TUTORIAL_DECISION_INVALID', 'قرار الفريق الخصم غير صالح.');
  }

  return issues;
}

export function validateClosestTutorialScenario(
  input: ClosestTutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (!input.prompt?.trim())
    add('TUTORIAL_PROMPT_REQUIRED', 'السؤال التوضيحي مطلوب.');
  if (input.version !== 1)
    add('TUTORIAL_VERSION_UNSUPPORTED', 'نسخة شرح مين أقرب غير مدعومة.');
  for (const [field, value] of [
    ['teamAEstimate', input.teamAEstimate],
    ['teamBEstimate', input.teamBEstimate],
    ['correctValue', input.correctValue],
  ] as const) {
    if (!Number.isFinite(value))
      add(
        'TUTORIAL_CLOSEST_VALUE_INVALID',
        `${field} يجب أن يكون رقمًا محدودًا.`,
      );
  }
  return issues;
}

export function validateBombTutorialScenario(
  input: BombTutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (!input.prompt?.trim())
    add('TUTORIAL_PROMPT_REQUIRED', 'السؤال التوضيحي مطلوب.');
  if (!input.nextPrompt?.trim())
    add('TUTORIAL_BOMB_NEXT_PROMPT_REQUIRED', 'سؤال انتقال القنبلة مطلوب.');
  if (!input.acceptedAnswer?.trim())
    add('TUTORIAL_BOMB_ANSWER_REQUIRED', 'الإجابة المقبولة مطلوبة.');
  if (input.version !== 1)
    add('TUTORIAL_VERSION_UNSUPPORTED', 'نسخة شرح القنبلة غير مدعومة.');
  if (input.startingTeam !== 'team-a' && input.startingTeam !== 'team-b')
    add('TUTORIAL_BOMB_STARTING_TEAM_INVALID', 'فريق البداية غير صالح.');
  if (
    !Number.isFinite(input.correctAtSecondsRemaining) ||
    input.correctAtSecondsRemaining <= 0 ||
    input.correctAtSecondsRemaining > 30
  ) {
    add(
      'TUTORIAL_BOMB_CLOCK_INVALID',
      'وقت الإجابة الصحيحة يجب أن يكون بين 1 و30 ثانية.',
    );
  }
  if (input.opponentExpiresAtSecondsRemaining !== 0)
    add(
      'TUTORIAL_BOMB_EXPIRY_INVALID',
      'عرض انتهاء القنبلة يجب أن ينتهي عند صفر.',
    );
  return issues;
}

export function validateOneClueTutorialScenario(
  input: OneClueTutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (input.version !== 1)
    add('TUTORIAL_VERSION_UNSUPPORTED', 'نسخة شرح بدليل واحد غير مدعومة.');
  if (!input.prompt?.trim()) add('TUTORIAL_PROMPT_REQUIRED', 'السؤال مطلوب.');
  if (!input.acceptedAnswer?.trim())
    add('TUTORIAL_ONE_CLUE_ANSWER_REQUIRED', 'الإجابة الصحيحة مطلوبة.');
  const clues = Array.isArray(input.clues) ? input.clues : [];
  if (
    clues.length !== 5 ||
    clues.some(
      (clue, index) =>
        clue.order !== index + 1 ||
        clue.value !== [5, 4, 3, 2, 1][index] ||
        !clue.text?.trim(),
    )
  )
    add(
      'TUTORIAL_ONE_CLUE_CLUES_INVALID',
      'يحتاج الشرح خمسة أدلة مرتبة من 5 إلى 1.',
    );
  if (
    normalizeArabicText(input.firstSubmittedAnswer ?? '') ===
    normalizeArabicText(input.acceptedAnswer ?? '')
  )
    add(
      'TUTORIAL_ONE_CLUE_FIRST_ANSWER_MUST_BE_WRONG',
      'إجابة الفريق الأول يجب أن توضّح الخروج بعد الخطأ.',
    );
  if (
    normalizeArabicText(input.secondSubmittedAnswer ?? '') !==
    normalizeArabicText(input.acceptedAnswer ?? '')
  )
    add(
      'TUTORIAL_ONE_CLUE_SECOND_ANSWER_MUST_BE_CORRECT',
      'إجابة الفريق الثاني يجب أن تكون صحيحة.',
    );
  return issues;
}

export function validateTop5TutorialScenario(
  input: Top5TutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  if (input.version !== 1)
    add('TUTORIAL_VERSION_UNSUPPORTED', 'نسخة شرح أفضل 5 غير مدعومة.');
  if (!input.prompt?.trim())
    add('TUTORIAL_PROMPT_REQUIRED', 'السؤال التوضيحي مطلوب.');
  if (!input.title?.trim())
    add('TUTORIAL_TOP5_TITLE_REQUIRED', 'عنوان أفضل 5 مطلوب.');
  if (!input.rankingBasis?.trim())
    add('TUTORIAL_TOP5_RANKING_BASIS_REQUIRED', 'أساس الترتيب مطلوب.');
  if (!input.sourceLabel?.trim())
    add('TUTORIAL_TOP5_SOURCE_REQUIRED', 'مصدر الترتيب مطلوب.');
  if (!['team-a', 'team-b'].includes(input.startingTeam)) {
    add('TUTORIAL_TOP5_STARTING_TEAM_INVALID', 'فريق البداية غير صالح.');
  }
  if (
    !Array.isArray(input.entries) ||
    input.entries.length !== TOP5_ENTRY_COUNT
  ) {
    add(
      'TUTORIAL_TOP5_ENTRY_COUNT',
      `أفضل 5 يحتاج ${TOP5_ENTRY_COUNT} بطاقات.`,
    );
  }
  const entries = Array.isArray(input.entries) ? input.entries : [];
  if (entries.some((entry) => !entry?.id?.trim() || !entry?.label?.trim())) {
    add('TUTORIAL_TOP5_ENTRY_INCOMPLETE', 'كل بطاقة تحتاج معرّفًا ونصًا.');
  }
  if (new Set(entries.map((entry) => entry?.id)).size !== entries.length) {
    add('TUTORIAL_TOP5_ENTRY_IDS_DUPLICATED', 'معرّفات بطاقات أفضل 5 مكررة.');
  }
  if (new Set(entries.map((entry) => entry?.label)).size !== entries.length) {
    add('TUTORIAL_TOP5_ENTRY_LABELS_DUPLICATED', 'نصوص بطاقات أفضل 5 مكررة.');
  }
  const ranked = entries.filter(
    (entry) => entry?.rank !== null && Number.isInteger(entry?.rank),
  );
  const ranks = ranked
    .map((entry) => entry.rank)
    .sort((a, b) => Number(a) - Number(b));
  if (ranks.join(',') !== TOP5_RANKS.join(',')) {
    add('TUTORIAL_TOP5_RANKS_INVALID', 'يجب أن تحمل خمس بطاقات الرتب 1 إلى 5.');
  }
  if (entries.length - ranked.length !== TOP5_TRAP_COUNT) {
    add(
      'TUTORIAL_TOP5_TRAPS_INVALID',
      `يجب أن تكون هناك ${TOP5_TRAP_COUNT} بطاقات فخ.`,
    );
  }
  if (
    !Array.isArray(input.decisions) ||
    input.decisions.length !== TOP5_ENTRY_COUNT
  ) {
    add(
      'TUTORIAL_TOP5_DECISION_COUNT',
      `يحتاج الشرح ${TOP5_ENTRY_COUNT} قرارات.`,
    );
  }
  const decisions = Array.isArray(input.decisions) ? input.decisions : [];
  if (
    decisions.some((decision) => !['keep', 'give'].includes(decision?.action))
  ) {
    add(
      'TUTORIAL_TOP5_DECISION_INVALID',
      'كل قرار يجب أن يكون احتفاظًا أو تمريرًا للخصم.',
    );
  }
  return issues;
}

export function tutorialKind(
  input: TutorialScenarioInput,
):
  | 'ryo'
  | 'closest'
  | 'bomb'
  | 'one-clue'
  | 'top-5'
  | 'combo'
  | 'marhala'
  | 'laqatha'
  | 'first-note'
  | 'la-tahriqha'
  | 'odd-piece'
  | 'ekshifni' {
  if (input.kind === 'closest') return 'closest';
  if (input.kind === 'bomb') return 'bomb';
  if (input.kind === 'one-clue') return 'one-clue';
  if (input.kind === 'top-5') return 'top-5';
  if (input.kind === 'combo') return 'combo';
  if (input.kind === 'marhala') return 'marhala';
  if (input.kind === 'laqatha') return 'laqatha';
  if (input.kind === 'first-note') return 'first-note';
  if (input.kind === 'la-tahriqha') return 'la-tahriqha';
  if (input.kind === 'odd-piece') return 'odd-piece';
  if (input.kind === 'ekshifni') return 'ekshifni';
  return 'ryo';
}

export function validateMechanicTutorialScenario(
  mechanicKey: string,
  input: TutorialScenarioInput,
): WorldContentIssue[] {
  const kind = tutorialKind(input);
  const expected = mechanicKey === 'read-your-opponent' ? 'ryo' : mechanicKey;
  if (kind !== expected) {
    return [
      {
        code: 'TUTORIAL_MECHANIC_KIND_MISMATCH',
        message: `نوع الشرح ${kind} لا يطابق الميكانيكا ${mechanicKey}.`,
      },
    ];
  }
  if (kind === 'closest') {
    return validateClosestTutorialScenario(
      input as ClosestTutorialScenarioInput,
    );
  }
  if (kind === 'bomb') {
    return validateBombTutorialScenario(input as BombTutorialScenarioInput);
  }
  if (kind === 'one-clue') {
    return validateOneClueTutorialScenario(
      input as OneClueTutorialScenarioInput,
    );
  }
  if (kind === 'top-5') {
    return validateTop5TutorialScenario(input as Top5TutorialScenarioInput);
  }
  if (kind === 'combo') {
    return validateComboTutorialScenario(input as ComboTutorialScenarioInput);
  }
  if (kind === 'marhala') {
    return validateMarhalaTutorialScenario(
      input as MarhalaTutorialScenarioInput,
    );
  }
  if (kind === 'laqatha') {
    return validateLaqathaTutorialScenario(
      input as LaqathaTutorialScenarioInput,
    );
  }
  if (kind === 'first-note') {
    return validateFirstNoteTutorialScenario(
      input as FirstNoteTutorialScenarioInput,
    );
  }
  if (kind === 'la-tahriqha') {
    return validateLaTahriqhaTutorialScenario(
      input as LaTahriqhaTutorialScenarioInput,
    );
  }
  if (kind === 'odd-piece') {
    return validateOddPieceTutorialScenario(
      input as OddPieceTutorialScenarioInput,
    );
  }
  if (kind === 'ekshifni') {
    return validateEkshifniTutorialScenario(
      input as EkshifniTutorialScenarioInput,
    );
  }
  return validateTutorialScenario(input as RyoTutorialScenarioInput);
}

export interface CompetitivePrompt {
  contentItemId: string;
  prompt: string;
}

export interface TutorialOverlapMatch {
  contentItemId: string;
  similarity: number;
}

/**
 * The content-safety gate: a tutorial may not be a question still worth points.
 *
 * Publishing shows the correct answer to every host, so if the same question can
 * still be drawn competitively, the tutorial has leaked it. There is no
 * tutorial-only flag on ContentItem and this guard deliberately does not add
 * one — it never touches the catalog. It only refuses to publish an overlap,
 * which keeps the two bodies of content separate without mutating either.
 */
export function findTutorialOverlap(
  prompt: string,
  competitive: CompetitivePrompt[],
  threshold = ARABIC_DUPLICATE_THRESHOLD,
): TutorialOverlapMatch[] {
  const normalized = normalizeArabicText(prompt);
  if (!normalized) return [];
  return competitive
    .map((candidate) => ({
      contentItemId: candidate.contentItemId,
      similarity: arabicTextSimilarity(
        normalized,
        normalizeArabicText(candidate.prompt),
      ),
    }))
    .filter((candidate) => candidate.similarity >= threshold)
    .sort((left, right) => right.similarity - left.similarity);
}
