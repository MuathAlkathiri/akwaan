import type { RyoDecision } from "../live-game-session/match/ryo-decision.presentation";

/**
 * Tutorial-owned Odd Piece media shape. The explainer must not import the
 * competitive live-session presentation module merely for a structural type.
 */
export interface OddPieceHotspotImage {
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
  media: { type: "image"; assets: Array<{ url: string }> };
}

/**
 * The published tutorial a mechanic teaches with, as the server serves it.
 *
 * This mirrors `StoredTutorialScenario` on the backend, including `outcome` —
 * which the client renders but never computes. The score shown in the demo is
 * the one `RyoPayoffMatrixRule` produced at publish time, so the explainer
 * cannot teach a payoff the Match would not actually award, and no second
 * transcription of the scoring rules exists on this side.
 */
export interface RyoTutorialOption {
  id: string;
  label: string;
}

export interface RyoTutorialOutcome {
  teamRole: "answering" | "opposing";
  delta: number;
  reason: string;
  correct: boolean;
}

export interface RyoTutorialScenario {
  kind?: "ryo";
  version?: 1;
  prompt: string;
  options: RyoTutorialOption[];
  correctOptionId: string;
  answeringSelectionOptionId: string;
  /** The server's canonical casing; mapped for presentation at the boundary. */
  opposingDecision: "TRUST" | "STEAL";
  caption?: string;
  outcome: RyoTutorialOutcome;
}

export interface ClosestTutorialScenario {
  kind: "closest";
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
    winnerTeam: "team-a" | "team-b" | null;
    tie: boolean;
    mechanicTallyDelta: number;
    matchPointDelta: 0;
    reason: "closest.absolute-distance";
  };
}

export interface BombTutorialScenario {
  kind: "bomb";
  version: 1;
  prompt: string;
  acceptedAnswer: string;
  nextPrompt: string;
  nextQuestion?: {
    prompt: string;
    acceptedAnswer: string;
    media?: { type: "image"; url: string; altText: string };
  };
  returnQuestion?: {
    prompt: string;
    acceptedAnswer: string;
    media?: { type: "image"; url: string; altText: string };
  };
  media?: { type: "image"; url: string; altText: string };
  startingTeam: "team-a" | "team-b";
  correctAtSecondsRemaining: number;
  opponentExpiresAtSecondsRemaining: 0;
  caption?: string;
  outcome: {
    passedToTeam: "team-a" | "team-b";
    expiredTeam: "team-a" | "team-b";
    winnerTeam: "team-a" | "team-b";
    correctAnswerPassesTurn: true;
    timerResetsOnPass: false;
    matchPointDelta: 1;
    reason: "bomb.clock-expired";
  };
}

export interface OneClueTutorialScenario {
  kind: "one-clue";
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
    firstLockedTeam: "team-a";
    firstLockedAtClue: 2;
    firstLockedValue: 4;
    firstAnswerCorrect: false;
    eliminatedTeam: "team-a";
    continuingTeam: "team-b";
    correctTeam: "team-b";
    correctAtClue: 3;
    correctValue: 3;
    itemPoints: { "team-a": 0; "team-b": 3 };
    finalTotals: { "team-a": 5; "team-b": 7 };
    winnerTeam: "team-b";
    matchPointDelta: 1;
    reason: "one-clue.progressive-lock";
  };
}

export interface Top5TutorialEntry {
  id: string;
  label: string;
  rank: number | null;
}

export interface Top5TutorialDecision {
  action: "keep" | "give";
}

export interface Top5TutorialScenario {
  kind: "top-5";
  version: 1;
  prompt: string;
  title: string;
  rankingBasis: string;
  sourceLabel: string;
  entries: Top5TutorialEntry[];
  decisions: Top5TutorialDecision[];
  startingTeam: "team-a" | "team-b";
  instruction?: string;
  caption?: string;
  outcome: {
    entries: Top5TutorialEntry[];
    ownership: Array<{
      turn: number;
      entryId: string;
      actingTeam: "team-a" | "team-b";
      ownerTeam: "team-a" | "team-b";
      action: "keep" | "give";
    }>;
    top5Counts: Record<"team-a" | "team-b", number>;
    trapCounts: Record<"team-a" | "team-b", number>;
    revealOrder: string[];
    winnerTeam: "team-a" | "team-b";
    matchPointDelta: 1;
    reason: "top-5.win";
  };
}

export interface ComboTutorialStage {
  stage: 1 | 2 | 3;
  prompt: string;
  correctAnswer: string;
  submittedAnswer: string;
}

export interface ComboTutorialScenario {
  kind: "combo";
  version: 1;
  prompt?: string;
  stages: ComboTutorialStage[];
  caption?: string;
  outcome: {
    decision: "continue-combo";
    breakArmedAtStage: 2;
    forcedQuestionStage: 3;
    correctStagesBeforeBreak: 2;
    unbankedPointsBeforeForcedQuestion: 2;
    forcedQuestionEarned: 0;
    bankedPoints: 0;
    endedBy: "combo-break";
    reason: "combo.push-your-luck";
  };
}

export interface MarhalaTutorialScenario {
  kind: "marhala";
  version: 1;
  prompt: string;
  correctAnswer: string;
  submittedAnswer: string;
  teamAPosition: number;
  teamBPosition: number;
  activeTeam: "team-a" | "team-b";
  difficulty: "easy" | "medium" | "hard";
  movement: number;
  baseLanding: number;
  tile: "normal" | "boost" | "trap" | "finish";
  finalLanding: number;
  caption?: string;
  outcome: {
    teamAPosition: number;
    teamBPosition: number;
    activeTeam: "team-a" | "team-b";
    difficulty: "easy" | "medium" | "hard";
    movement: number;
    baseLanding: number;
    tile: "normal" | "boost" | "trap" | "finish";
    finalLanding: number;
    correct: true;
    matchPointDelta: 0;
    reason: "marhala.tutorial-turn";
  };
}

export interface LaqathaTutorialClue {
  order: 1 | 2 | 3 | 4 | 5;
  value: 5 | 4 | 3 | 2 | 1;
  text: string;
}

export interface LaqathaTutorialScenario {
  kind: "laqatha";
  version: 1;
  prompt: string;
  title: string;
  clues: LaqathaTutorialClue[];
  acceptedAnswers: string[];
  firstSubmittedAnswer: string;
  secondSubmittedAnswer: string;
  caption?: string;
  outcome: {
    questionCount: 3;
    firstClaimTeam: "team-a";
    firstClaimAtClue: 2;
    firstClaimReward: 4;
    firstClaimFailed: true;
    secondClaimTeam: "team-b";
    secondClaimAtClue: 3;
    secondClaimReward: 3;
    winnerTeam: "team-b";
    points: { "team-a": 0; "team-b": 3 };
    reason: "laqatha.claim-race";
  };
}

export interface FirstNoteTutorialBid {
  team: "team-a" | "team-b";
  seconds: number;
}

export interface FirstNoteTutorialScenario {
  kind: "first-note";
  version: 1;
  prompt: string;
  title: string;
  clueLabel?: string;
  contextualClue: string;
  bids: FirstNoteTutorialBid[];
  acceptedAnswers: string[];
  firstSubmittedAnswer: string;
  stealSubmittedAnswer: string;
  caption?: string;
  outcome: {
    songCount: 3;
    bids: FirstNoteTutorialBid[];
    finalBidSeconds: 3;
    auctionWinner: "team-a";
    firstAnswerTeam: "team-a";
    firstAnswerFailed: true;
    stealTeam: "team-b";
    stolen: true;
    firstCorrectReward: 3;
    stealReward: 1;
    points: { "team-a": 0; "team-b": 1 };
    reason: "first-note.auction-steal";
  };
}

export interface LaTahriqhaTutorialIngredient {
  id: string;
  label: string;
  correct: boolean;
}

export interface LaTahriqhaTutorialDish {
  id: string;
  name: string;
  ingredients: LaTahriqhaTutorialIngredient[];
  teamASelection: string[];
  teamBSelection: string[];
}

export interface LaTahriqhaTutorialScenario {
  kind: "la-tahriqha";
  version: 1;
  prompt: string;
  dishWindowSeconds: number;
  dishes: LaTahriqhaTutorialDish[];
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
    finalTotals: { "team-a": number; "team-b": number };
    winnerTeam: "team-a" | "team-b" | null;
    tie: boolean;
    matchPointDelta: 0 | 1;
    reason: "la-tahriqha.challenge-win";
  };
}

export interface OddPieceTutorialPiece {
  id: string;
  imageUrl: string;
  altText: string;
  vehicleIdentity: string;
  vehicleLabel: string;
}

export interface OddPieceLegacyTutorialScenario {
  kind: "odd-piece";
  version: 1;
  prompt: string;
  targetVehicleIdentity: string;
  targetVehicleLabel: string;
  intruderVehicleIdentity: string;
  intruderVehicleLabel: string;
  pieces: OddPieceTutorialPiece[];
  wrongSelectionPieceId: string;
  correctSelectionPieceId: string;
  targetReveal: {
    imageUrl: string;
    altText: string;
  };
  caption?: string;
  outcome: {
    firstClaimTeam: "team-a";
    firstClaimPieceId: string;
    firstClaimCorrect: false;
    handoffTeam: "team-b";
    secondClaimPieceId: string;
    secondClaimCorrect: true;
    winnerTeam: "team-b";
    points: { "team-a": 0; "team-b": 1 };
    matchPointDelta: 1;
    intruderPieceId: string;
    targetVehicleLabel: string;
    targetReveal: { imageUrl: string; altText: string };
    puzzleCount: 3;
    reason: "odd-piece.claim-handoff";
  };
}

export interface OddPieceHotspotTutorialScenario {
  kind: "odd-piece";
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
  /** Tutorial-only fallback when the supplied question image has no valid original pair. */
  tutorialRevealMode?: "original-comparison" | "hotspot-detail";
  /** Explicit disclosure for owner-supplied demonstration media. */
  tutorialMediaDisclosure?: string;
  hotspot: { polygon: Array<{ x: number; y: number }>; tolerance: number };
  /** Local fixture aliases; published V2 tutorials use wrongPoint/correctPoint. */
  team1Tap?: { x: number; y: number };
  team2Tap?: { x: number; y: number };
  wrongPoint?: { x: number; y: number };
  correctPoint?: { x: number; y: number };
  caption?: string;
  outcome: {
    firstClaimTeam: "team-a";
    firstClaimCorrect: false;
    handoffTeam: "team-b";
    secondClaimCorrect: true;
    winnerTeam: "team-b";
    points: { "team-a": 0; "team-b": 1 };
    matchPointDelta: 1;
    targetVehicleLabel: string;
    intruderVehicleLabel: string;
    intruderPartLabel: string;
    puzzleCount: 3;
    reason: "odd-piece.hotspot-claim-handoff";
  };
}

export type OddPieceTutorialScenario =
  OddPieceHotspotTutorialScenario | OddPieceLegacyTutorialScenario;

export interface EkshifniTutorialScenario {
  kind: "ekshifni";
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
    openingInitiative: ["team-a", "team-b", "team-a"];
    revealedRegionIds: string[];
    resolvedValue: 2;
    wrongTeam: "team-a";
    initiativeAfterWrong: "team-b";
    temporarilyParkedTeam: "team-a";
    eligibilityRestoredBy: "opponent-reveal";
    correctTeam: "team-b";
    imagePoints: { "team-a": 0; "team-b": 2 };
    finalTotals: { "team-a": 6; "team-b": 8 };
    winnerTeam: "team-b";
    matchPointDelta: 1;
    reason: "ekshifni.clear-window-open-race";
  };
}

export type TutorialScenario =
  | RyoTutorialScenario
  | ClosestTutorialScenario
  | BombTutorialScenario
  | OneClueTutorialScenario
  | Top5TutorialScenario
  | ComboTutorialScenario
  | MarhalaTutorialScenario
  | LaqathaTutorialScenario
  | FirstNoteTutorialScenario
  | LaTahriqhaTutorialScenario
  | OddPieceTutorialScenario
  | EkshifniTutorialScenario;

export interface PublishedTutorial {
  mechanicKey: string;
  revision: number;
  scenario: TutorialScenario;
  source?: "world" | "generic";
  worldId?: string | null;
}

export function tutorialScenarioKind(
  scenario: TutorialScenario,
):
  | "ryo"
  | "closest"
  | "bomb"
  | "one-clue"
  | "top-5"
  | "combo"
  | "marhala"
  | "laqatha"
  | "first-note"
  | "la-tahriqha"
  | "odd-piece"
  | "ekshifni" {
  if (scenario.kind === "closest") return "closest";
  if (scenario.kind === "bomb") return "bomb";
  if (scenario.kind === "one-clue") return "one-clue";
  if (scenario.kind === "top-5") return "top-5";
  if (scenario.kind === "combo") return "combo";
  if (scenario.kind === "marhala") return "marhala";
  if (scenario.kind === "laqatha") return "laqatha";
  if (scenario.kind === "first-note") return "first-note";
  if (scenario.kind === "la-tahriqha") return "la-tahriqha";
  if (scenario.kind === "odd-piece") return "odd-piece";
  if (scenario.kind === "ekshifni") return "ekshifni";
  return "ryo";
}

/**
 * The scoring rules speak `TRUST`/`STEAL`; the player-facing copy module speaks
 * `trust`/`steal`. One conversion, here, rather than two vocabularies drifting.
 */
export function toPresentationDecision(
  decision: "TRUST" | "STEAL",
): RyoDecision {
  return decision === "TRUST" ? "trust" : "steal";
}

/** The two demonstration teams. Presentation-only, never a real team. */
export const TUTORIAL_TEAMS = [
  { id: "tutorial-answering", name: "الفريق الأول" },
  { id: "tutorial-opposing", name: "الفريق الثاني" },
] as const;

export const TUTORIAL_ROLES = {
  answeringTeamId: TUTORIAL_TEAMS[0].id,
  opposingTeamId: TUTORIAL_TEAMS[1].id,
};

/** The real RYO question window, from `ChallengeCountdown`'s own contract. */
export const TUTORIAL_WINDOW_MS = 10_000;

/**
 * The payoff as the demo must present it: which *team* gains or loses.
 *
 * The rule already decided the role and the delta; this only maps the role onto
 * the two demonstration teams. No scoring decision is made here.
 */
export function tutorialPayoffTeamId(outcome: RyoTutorialOutcome): string {
  return outcome.teamRole === "answering"
    ? TUTORIAL_ROLES.answeringTeamId
    : TUTORIAL_ROLES.opposingTeamId;
}
