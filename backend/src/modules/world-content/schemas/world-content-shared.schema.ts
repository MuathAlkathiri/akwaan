import { Schema as MongooseSchema } from 'mongoose';

/**
 * Persistence fragments shared by every World Content collection. Defined here
 * rather than reused from the legacy question schema so the new domain keeps no
 * import edge into legacy code (roadmap 17).
 */

export const LocalizedTextDefinition = new MongooseSchema(
  {
    ar: { type: String, required: true, trim: true },
    en: { type: String, trim: true },
  },
  { _id: false },
);

export const ContentAssetDefinition = {
  url: { type: String, required: true, trim: true },
  path: { type: String, trim: true },
  filename: { type: String, trim: true },
  mimetype: { type: String, trim: true },
  size: { type: Number },
  altText: { type: String, trim: true },
};

export const ContentAssetSubSchema = new MongooseSchema(
  ContentAssetDefinition,
  { _id: false },
);

/**
 * How a mechanic presents itself. Media is not here: it belongs to the
 * ContentItem, so one mechanic plays every medium without reconfiguration.
 */
export const ChallengePresentationDefinition = new MongooseSchema(
  {
    inputType: { type: String, required: true, trim: true },
    timerSeconds: { type: Number, default: null },
    answerTimerSeconds: { type: Number, default: null },
    soundPack: { type: String, trim: true, default: null },
    revealStyle: { type: String, trim: true, default: null },
  },
  { _id: false },
);

/** One educational option on a tutorial scenario. */
const TutorialOptionDefinition = new MongooseSchema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const Top5TutorialEntryDefinition = new MongooseSchema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    rank: { type: Number, default: null },
  },
  { _id: false },
);

const Top5TutorialDecisionDefinition = new MongooseSchema(
  { action: { type: String, enum: ['keep', 'give'], required: true } },
  { _id: false },
);

const Top5TutorialOwnershipDefinition = new MongooseSchema(
  {
    turn: { type: Number, required: true },
    entryId: { type: String, required: true, trim: true },
    actingTeam: { type: String, enum: ['team-a', 'team-b'], required: true },
    ownerTeam: { type: String, enum: ['team-a', 'team-b'], required: true },
    action: { type: String, enum: ['keep', 'give'], required: true },
  },
  { _id: false },
);

const ComboTutorialStageDefinition = new MongooseSchema(
  {
    stage: { type: Number, enum: [1, 2, 3], required: true },
    prompt: { type: String, required: true, trim: true },
    correctAnswer: { type: String, required: true, trim: true },
    submittedAnswer: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const LaqathaTutorialClueDefinition = new MongooseSchema(
  {
    order: { type: Number, enum: [1, 2, 3, 4, 5], required: true },
    value: { type: Number, enum: [5, 4, 3, 2, 1], required: true },
    text: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const FirstNoteTutorialBidDefinition = new MongooseSchema(
  {
    team: { type: String, enum: ['team-a', 'team-b'], required: true },
    seconds: { type: Number, required: true },
  },
  { _id: false },
);

const BombTutorialMediaDefinition = new MongooseSchema(
  {
    type: { type: String, enum: ['image'], required: true },
    url: { type: String, required: true, trim: true },
    altText: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const BombTutorialQuestionDefinition = new MongooseSchema(
  {
    prompt: { type: String, required: true, trim: true },
    acceptedAnswer: { type: String, required: true, trim: true },
    media: { type: BombTutorialMediaDefinition, default: undefined },
  },
  { _id: false },
);

const OddPieceTutorialMediaDefinition = new MongooseSchema(
  {
    imageUrl: { type: String, required: true, trim: true },
    altText: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const OddPieceTutorialPieceDefinition = new MongooseSchema(
  {
    id: { type: String, required: true, trim: true },
    imageUrl: { type: String, required: true, trim: true },
    altText: { type: String, required: true, trim: true },
    vehicleIdentity: { type: String, required: true, trim: true },
    vehicleLabel: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const OddPieceTutorialProvenanceDefinition = new MongooseSchema(
  {
    assetOrigin: {
      type: String,
      enum: ['authentic', 'ai-edited'],
      required: true,
    },
    sourceUrl: { type: String, required: true, trim: true },
    licenceNote: { type: String, trim: true, default: undefined },
    editedRegion: { type: String, trim: true, default: undefined },
    editModel: { type: String, trim: true, default: undefined },
  },
  { _id: false },
);

const OddPieceTutorialHotspotImageDefinition = new MongooseSchema(
  {
    media: {
      type: {
        type: String,
        enum: ['image'],
        required: true,
      },
      assets: { type: [ContentAssetSubSchema], required: true },
    },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    orientation: {
      type: String,
      enum: ['landscape', 'portrait', 'square'],
      required: true,
    },
    provenance: {
      type: OddPieceTutorialProvenanceDefinition,
      required: true,
      _id: false,
    },
  },
  { _id: false },
);

const OddPieceTutorialPointDefinition = new MongooseSchema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false },
);

const OddPieceTutorialHotspotDefinition = new MongooseSchema(
  {
    polygon: { type: [OddPieceTutorialPointDefinition], required: true },
    tolerance: { type: Number, required: true },
  },
  { _id: false },
);

const MarhalaTutorialScenarioFields = {
  correctAnswer: { type: String, trim: true },
  submittedAnswer: { type: String, trim: true },
  teamAPosition: { type: Number },
  teamBPosition: { type: Number },
  activeTeam: { type: String, enum: ['team-a', 'team-b'] },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
  movement: { type: Number },
  baseLanding: { type: Number },
  tile: { type: String, enum: ['normal', 'boost', 'trap', 'finish'] },
  finalLanding: { type: Number },
} as const;

/**
 * The outcome half of a tutorial, written only by the server.
 *
 * It is stored rather than recomputed on read so a published revision is a
 * fixed, reviewable artefact: what was approved is what is served. It is
 * derived from `RyoPayoffMatrixRule` at publish time and never accepted from a
 * request body.
 */
const TutorialOutcomeDefinition = new MongooseSchema(
  {
    teamRole: { type: String, enum: ['answering', 'opposing'] },
    delta: { type: Number },
    reason: { type: String, required: true, trim: true },
    correct: { type: Boolean },
    teamADistance: { type: Number },
    teamBDistance: { type: Number },
    winnerTeam: { type: String, enum: ['team-a', 'team-b', null] },
    tie: { type: Boolean },
    mechanicTallyDelta: { type: Number },
    matchPointDelta: { type: Number },
    passedToTeam: { type: String, enum: ['team-a', 'team-b'] },
    expiredTeam: { type: String, enum: ['team-a', 'team-b'] },
    correctAnswerPassesTurn: { type: Boolean },
    timerResetsOnPass: { type: Boolean },
    itemCount: { type: Number },
    firstLockedTeam: { type: String, enum: ['team-a'] },
    firstLockedAtClue: { type: Number },
    firstLockedValue: { type: Number },
    firstAnswerCorrect: { type: Boolean },
    eliminatedTeam: { type: String, enum: ['team-a'] },
    continuingTeam: { type: String, enum: ['team-b'] },
    correctTeam: { type: String, enum: ['team-b'] },
    correctAtClue: { type: Number },
    correctValue: { type: Number },
    itemPoints: { type: MongooseSchema.Types.Mixed, default: undefined },
    finalTotals: { type: MongooseSchema.Types.Mixed, default: undefined },
    entries: { type: [Top5TutorialEntryDefinition], default: undefined },
    ownership: { type: [Top5TutorialOwnershipDefinition], default: undefined },
    top5Counts: { type: MongooseSchema.Types.Mixed, default: undefined },
    trapCounts: { type: MongooseSchema.Types.Mixed, default: undefined },
    revealOrder: { type: [String], default: undefined },
    decision: { type: String, enum: ['continue-combo'] },
    breakArmedAtStage: { type: Number, enum: [2] },
    forcedQuestionStage: { type: Number, enum: [3] },
    correctStagesBeforeBreak: { type: Number },
    unbankedPointsBeforeForcedQuestion: { type: Number },
    forcedQuestionEarned: { type: Number },
    bankedPoints: { type: Number },
    endedBy: { type: String, enum: ['combo-break'] },
    questionCount: { type: Number },
    firstClaimTeam: { type: String, enum: ['team-a'] },
    firstClaimAtClue: { type: Number, enum: [2] },
    firstClaimReward: { type: Number, enum: [4] },
    firstClaimFailed: { type: Boolean },
    secondClaimTeam: { type: String, enum: ['team-b'] },
    secondClaimAtClue: { type: Number, enum: [3] },
    secondClaimReward: { type: Number, enum: [3] },
    points: { type: MongooseSchema.Types.Mixed, default: undefined },
    teamAPosition: { type: Number },
    teamBPosition: { type: Number },
    activeTeam: { type: String, enum: ['team-a', 'team-b'] },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
    movement: { type: Number },
    baseLanding: { type: Number },
    tile: { type: String, enum: ['normal', 'boost', 'trap', 'finish'] },
    finalLanding: { type: Number },
    songCount: { type: Number },
    bids: { type: [FirstNoteTutorialBidDefinition], default: undefined },
    finalBidSeconds: { type: Number },
    auctionWinner: { type: String, enum: ['team-a'] },
    firstAnswerTeam: { type: String, enum: ['team-a'] },
    firstAnswerFailed: { type: Boolean },
    stealTeam: { type: String, enum: ['team-b'] },
    stolen: { type: Boolean },
    firstCorrectReward: { type: Number },
    stealReward: { type: Number },
    firstClaimPieceId: { type: String, trim: true },
    firstClaimCorrect: { type: Boolean },
    handoffTeam: { type: String, enum: ['team-b'] },
    secondClaimPieceId: { type: String, trim: true },
    secondClaimCorrect: { type: Boolean },
    intruderPieceId: { type: String, trim: true },
    targetVehicleLabel: { type: String, trim: true },
    targetReveal: { type: OddPieceTutorialMediaDefinition, default: undefined },
    puzzleCount: { type: Number, enum: [3] },
    imageCount: { type: Number, enum: [3] },
    openingInitiative: { type: [String], default: undefined },
    revealedRegionIds: { type: [String], default: undefined },
    resolvedValue: { type: Number },
    wrongTeam: { type: String, enum: ['team-a'] },
    initiativeAfterWrong: { type: String, enum: ['team-b'] },
    temporarilyParkedTeam: { type: String, enum: ['team-a'] },
    eligibilityRestoredBy: { type: String, enum: ['opponent-reveal'] },
    imagePoints: { type: MongooseSchema.Types.Mixed, default: undefined },
    dishCount: { type: Number, default: undefined },
    dishResults: { type: MongooseSchema.Types.Mixed, default: undefined },
  },
  { _id: false },
);

export const TutorialScenarioDefinition = new MongooseSchema(
  {
    kind: {
      type: String,
      enum: [
        'ryo',
        'closest',
        'bomb',
        'one-clue',
        'top-5',
        'combo',
        'marhala',
        'laqatha',
        'first-note',
        'odd-piece',
        'ekshifni',
        'la-tahriqha',
      ],
      default: undefined,
    },
    version: { type: Number, enum: [1, 2], default: undefined },
    prompt: { type: String, required: true, trim: true },
    options: { type: [TutorialOptionDefinition], default: [] },
    correctOptionId: { type: String, trim: true },
    answeringSelectionOptionId: { type: String, trim: true },
    opposingDecision: { type: String, enum: ['TRUST', 'STEAL'] },
    teamAEstimate: { type: Number },
    teamBEstimate: { type: Number },
    correctValue: { type: Number },
    acceptedAnswer: { type: String, trim: true, default: undefined },
    nextPrompt: { type: String, trim: true, default: undefined },
    nextQuestion: {
      type: BombTutorialQuestionDefinition,
      default: undefined,
    },
    returnQuestion: {
      type: BombTutorialQuestionDefinition,
      default: undefined,
    },
    media: { type: BombTutorialMediaDefinition, default: undefined },
    correctAtSecondsRemaining: { type: Number },
    opponentExpiresAtSecondsRemaining: { type: Number },
    unit: { type: String, trim: true, default: undefined },
    caption: { type: String, trim: true, default: undefined },
    title: { type: String, trim: true, default: undefined },
    rankingBasis: { type: String, trim: true, default: undefined },
    sourceLabel: { type: String, trim: true, default: undefined },
    instruction: { type: String, trim: true, default: undefined },
    entries: { type: [Top5TutorialEntryDefinition], default: undefined },
    decisions: { type: [Top5TutorialDecisionDefinition], default: undefined },
    stages: { type: [ComboTutorialStageDefinition], default: undefined },
    clues: { type: [LaqathaTutorialClueDefinition], default: undefined },
    acceptedAnswers: { type: [String], default: undefined },
    firstSubmittedAnswer: { type: String, trim: true, default: undefined },
    secondSubmittedAnswer: { type: String, trim: true, default: undefined },
    contextualClue: { type: String, trim: true, default: undefined },
    clueLabel: { type: String, trim: true, default: undefined },
    bids: { type: [FirstNoteTutorialBidDefinition], default: undefined },
    stealSubmittedAnswer: { type: String, trim: true, default: undefined },
    targetVehicleIdentity: { type: String, trim: true, default: undefined },
    targetVehicleLabel: { type: String, trim: true, default: undefined },
    intruderVehicleIdentity: { type: String, trim: true, default: undefined },
    intruderVehicleLabel: { type: String, trim: true, default: undefined },
    pieces: { type: [OddPieceTutorialPieceDefinition], default: undefined },
    wrongSelectionPieceId: { type: String, trim: true, default: undefined },
    correctSelectionPieceId: { type: String, trim: true, default: undefined },
    targetReveal: { type: OddPieceTutorialMediaDefinition, default: undefined },
    intruderPartIdentity: { type: String, trim: true, default: undefined },
    intruderPartLabel: { type: String, trim: true, default: undefined },
    tutorialRevealMode: {
      type: String,
      enum: ['original-comparison', 'hotspot-detail'],
      default: undefined,
    },
    tutorialMediaDisclosure: {
      type: String,
      trim: true,
      default: undefined,
    },
    team1Tap: {
      type: OddPieceTutorialPointDefinition,
      default: undefined,
      _id: false,
    },
    team2Tap: {
      type: OddPieceTutorialPointDefinition,
      default: undefined,
      _id: false,
    },
    modifiedImage: {
      type: OddPieceTutorialHotspotImageDefinition,
      default: undefined,
      _id: false,
    },
    originalImage: {
      type: OddPieceTutorialHotspotImageDefinition,
      default: undefined,
      _id: false,
    },
    hotspot: {
      type: OddPieceTutorialHotspotDefinition,
      default: undefined,
      _id: false,
    },
    wrongPoint: {
      type: OddPieceTutorialPointDefinition,
      default: undefined,
      _id: false,
    },
    correctPoint: {
      type: OddPieceTutorialPointDefinition,
      default: undefined,
      _id: false,
    },
    celebrityIdentity: { type: String, trim: true, default: undefined },
    image: { type: MongooseSchema.Types.Mixed, default: undefined },
    regions: { type: [MongooseSchema.Types.Mixed], default: undefined },
    wrongSubmittedAnswer: { type: String, trim: true, default: undefined },
    correctSubmittedAnswer: { type: String, trim: true, default: undefined },
    dishWindowSeconds: { type: Number, default: undefined },
    dishes: { type: MongooseSchema.Types.Mixed, default: undefined },
    captainRotation: { type: MongooseSchema.Types.Mixed, default: undefined },
    ...MarhalaTutorialScenarioFields,
    startingTeam: {
      type: String,
      enum: ['team-a', 'team-b'],
      default: undefined,
    },
    outcome: { type: TutorialOutcomeDefinition, required: true, _id: false },
  },
  { _id: false },
);

/**
 * Draft and published side by side on the mechanic.
 *
 * Two separate documents rather than one with a status, because an editor must
 * be able to revise freely while hosts keep seeing the approved version. The
 * public read surface serves `published` and never looks at `draft`.
 */
export const MechanicTutorialDefinition = new MongooseSchema(
  {
    draft: { type: TutorialScenarioDefinition, default: undefined, _id: false },
    published: {
      type: TutorialScenarioDefinition,
      default: undefined,
      _id: false,
    },
    publishedRevision: { type: Number, default: 0 },
    publishedAt: { type: Date, default: undefined },
    draftUpdatedAt: { type: Date, default: undefined },
  },
  { _id: false },
);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
