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
/** Player-facing mechanic explanation, authored on the ChallengeType. */
export const PlayerInstructionsDefinition = new MongooseSchema(
  {
    summary: { type: String, trim: true, default: '' },
    steps: { type: [String], default: [] },
    highlights: { type: [String], default: undefined },
  },
  { _id: false },
);

export const ChallengePresentationDefinition = new MongooseSchema(
  {
    inputType: { type: String, required: true, trim: true },
    timerSeconds: { type: Number, default: null },
    soundPack: { type: String, trim: true, default: null },
    revealStyle: { type: String, trim: true, default: null },
    // Absent on records authored before this field; the reader normalizes it.
    playerInstructions: {
      type: PlayerInstructionsDefinition,
      _id: false,
      default: undefined,
    },
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
    teamRole: { type: String, required: true, enum: ['answering', 'opposing'] },
    delta: { type: Number, required: true },
    reason: { type: String, required: true, trim: true },
    correct: { type: Boolean, required: true },
  },
  { _id: false },
);

export const TutorialScenarioDefinition = new MongooseSchema(
  {
    prompt: { type: String, required: true, trim: true },
    options: { type: [TutorialOptionDefinition], default: [] },
    correctOptionId: { type: String, required: true, trim: true },
    answeringSelectionOptionId: { type: String, required: true, trim: true },
    opposingDecision: { type: String, required: true, enum: ['TRUST', 'STEAL'] },
    caption: { type: String, trim: true, default: undefined },
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
