import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  ContentMediaType,
  VoteConsensusRule,
} from '../domain/world-content.constants';
import {
  ContentAnswerPayload,
  ContentItemMedia,
  LocalizedText,
} from '../domain/world-content.types';
import { ChallengeType } from './challenge-type.schema';
import { Scope } from './scope.schema';
import {
  ContentAssetSubSchema,
  LocalizedTextDefinition,
} from './world-content-shared.schema';
import { World } from './world.schema';

const AnswerOptionSchema = new MongooseSchema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: LocalizedTextDefinition, required: true },
  },
  { _id: false },
);

const SplitFragmentSchema = new MongooseSchema(
  {
    seat: { type: Number, required: true, min: 1 },
    clue: { type: LocalizedTextDefinition, required: true },
  },
  { _id: false },
);

const SplitPayloadSchema = new MongooseSchema(
  {
    fragments: { type: [SplitFragmentSchema], default: [] },
  },
  { _id: false },
);

/**
 * One structured payload covering all six answer modes, discriminated by `mode`.
 * Mongoose cannot express a discriminated union inline, so the mode-specific
 * fields are optional here and ContentItemCompatibilityPolicy is the single
 * authority on which combination is valid (roadmap 13, 14).
 */
const AnswerPayloadSchema = new MongooseSchema(
  {
    mode: { type: String, enum: ChallengeAnswerMode, required: true },
    options: { type: [AnswerOptionSchema], default: undefined },
    correctOptionId: { type: String, trim: true },
    correctValue: { type: Number },
    acceptedTolerance: { type: Number, min: 0 },
    acceptedAnswers: { type: [String], default: undefined },
    consensusRule: { type: String, enum: VoteConsensusRule },
    splitPayload: { type: SplitPayloadSchema, default: undefined },
  },
  { _id: false },
);

const ContentMediaSchema = new MongooseSchema(
  {
    type: {
      type: String,
      enum: ContentMediaType,
      default: ContentMediaType.NONE,
    },
    assets: { type: [ContentAssetSubSchema], default: [] },
  },
  { _id: false },
);

const ContentMetadataSchema = new MongooseSchema(
  {
    source: { type: String, trim: true },
    notes: { type: String, trim: true },
    tags: { type: [String], default: undefined },
  },
  { _id: false },
);

/**
 * The new-system content entity (roadmap 12). Belongs to a Scope, not to a
 * mechanic, so the same item can be played through every compatible Challenge
 * Type. It carries no points, no difficulty, and no host-judged answer field.
 */
@Schema({ timestamps: true, collection: 'content_items' })
export class ContentItem extends Document {
  @Prop({ type: Types.ObjectId, ref: Scope.name, required: true, index: true })
  scopeId: Types.ObjectId;

  /**
   * Denormalized from the Scope purely so World-wide content queries and
   * readiness aggregates avoid a join. Kept in step with the Scope's World by
   * ContentItemService, and re-checked by the compatibility policy.
   */
  @Prop({ type: Types.ObjectId, ref: World.name, required: true, index: true })
  worldId: Types.ObjectId;

  @Prop({ type: LocalizedTextDefinition, required: true })
  prompt: LocalizedText;

  @Prop({
    type: [Types.ObjectId],
    ref: ChallengeType.name,
    default: [],
    index: true,
  })
  compatibleChallengeTypeIds: Types.ObjectId[];

  @Prop({ type: ContentMediaSchema, default: undefined })
  media?: ContentItemMedia;

  @Prop({ type: AnswerPayloadSchema, required: true })
  answerPayload: ContentAnswerPayload;

  /** Mechanic-specific extras that no shared field can model. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: undefined })
  mechanicPayload?: Record<string, unknown>;

  /** True for Relational content, which survives repeated sessions (6.4). */
  @Prop({ type: Boolean, default: false }) isReusableAcrossSessions: boolean;

  @Prop({
    type: String,
    enum: ContentItemStatus,
    default: ContentItemStatus.DRAFT,
    index: true,
  })
  status: ContentItemStatus;

  @Prop({ type: ContentMetadataSchema, default: undefined })
  metadata?: { source?: string; notes?: string; tags?: string[] };
}

export const ContentItemSchema = SchemaFactory.createForClass(ContentItem);
ContentItemSchema.index({ worldId: 1, scopeId: 1, status: 1 });
