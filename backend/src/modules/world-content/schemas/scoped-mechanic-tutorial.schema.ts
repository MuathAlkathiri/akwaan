import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import { ChallengeType } from './challenge-type.schema';
import { World } from './world.schema';

/** Immutable snapshot retained whenever a scoped tutorial is published. */
@Schema({ _id: false })
export class ScopedTutorialRevision {
  @Prop({ required: true }) revision: number;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  scenario: Record<string, unknown>;

  @Prop({ required: true }) publishedAt: Date;

  @Prop({ type: Number }) restoredFromRevision?: number;
}

export const ScopedTutorialRevisionSchema = SchemaFactory.createForClass(
  ScopedTutorialRevision,
);

/**
 * A World-specific example.  The pair is deliberately independent of board
 * positions: removing a slot must not destroy tutorial history.
 */
@Schema({ timestamps: true, collection: 'scoped_mechanic_tutorials' })
export class ScopedMechanicTutorial extends Document {
  @Prop({ type: Types.ObjectId, ref: World.name, required: true, index: true })
  worldId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: ChallengeType.name,
    required: true,
    index: true,
  })
  challengeTypeId: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  mechanicKey: string;

  @Prop({ required: true, default: 1 }) scenarioVersion: number;

  @Prop({ required: true, default: 'world-example-v1' })
  flowContractVersion: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  draft?: Record<string, unknown> | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  published?: Record<string, unknown> | null;

  @Prop({ default: 0 }) publishedRevision: number;

  @Prop({ type: Date, default: null }) publishedAt?: Date | null;

  @Prop({ type: Date, default: null }) draftUpdatedAt?: Date | null;

  @Prop({ type: Date, default: null }) withdrawnAt?: Date | null;

  @Prop({ type: [ScopedTutorialRevisionSchema], default: [] })
  revisionHistory: ScopedTutorialRevision[];
}

export const ScopedMechanicTutorialSchema = SchemaFactory.createForClass(
  ScopedMechanicTutorial,
);

ScopedMechanicTutorialSchema.index(
  { worldId: 1, challengeTypeId: 1 },
  { unique: true },
);
