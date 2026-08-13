import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { WorldChallengeSlotKey } from '../domain/world-content.constants';
import { ContentAssetRef } from '../domain/world-content.types';
import { ChallengeType } from './challenge-type.schema';
import { ContentAssetDefinition } from './world-content-shared.schema';
import { World } from './world.schema';

/**
 * Binds a global Challenge Type into one board position of one World.
 *
 * This is what makes mechanic sharing possible without duplicating the mechanic.
 * Runtime behaviour belongs to the Challenge Type. This binding may only
 * override player-facing presentation for its World.
 */
@Schema({ timestamps: true, collection: 'world_challenge_configurations' })
export class WorldChallengeConfiguration extends Document {
  @Prop({ type: Types.ObjectId, ref: World.name, required: true, index: true })
  worldId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: ChallengeType.name,
    required: true,
    index: true,
  })
  challengeTypeId: Types.ObjectId;

  /** Generic board position, unique within a World. */
  @Prop({ type: String, enum: WorldChallengeSlotKey, required: true })
  slotKey: WorldChallengeSlotKey;

  /** Optional per-World presentation overrides. */
  @Prop({ trim: true }) displayName?: string;

  @Prop({ trim: true }) description?: string;

  @Prop({ trim: true }) instructions?: string;

  @Prop({ type: ContentAssetDefinition, _id: false }) icon?: ContentAssetRef;

  @Prop({ default: 0 }) sortOrder: number;

  @Prop({ type: Boolean, default: false }) isEnabled: boolean;
}

export const WorldChallengeConfigurationSchema = SchemaFactory.createForClass(
  WorldChallengeConfiguration,
);
// One configuration per generic board position. Challenge Type uniqueness is
// enforced by the domain policy so legacy boards can be migrated safely first.
WorldChallengeConfigurationSchema.index(
  { worldId: 1, slotKey: 1 },
  { unique: true },
);
