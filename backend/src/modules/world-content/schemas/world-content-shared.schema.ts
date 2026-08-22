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

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
