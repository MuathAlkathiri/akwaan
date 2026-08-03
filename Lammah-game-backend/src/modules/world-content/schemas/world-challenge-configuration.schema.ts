import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  WorldChallengeSlotKey,
  WorldChallengeSlotType,
} from '../domain/world-content.constants';
import { ContentAssetRef } from '../domain/world-content.types';
import { ChallengeType } from './challenge-type.schema';
import { ContentAssetDefinition } from './world-content-shared.schema';
import { World } from './world.schema';

/**
 * Binds a global Challenge Type into one board position of one World.
 *
 * This is what makes mechanic sharing possible without duplicating the mechanic.
 * It deliberately owns no presentation and no media: those belong to the mechanic
 * and to the ContentItem respectively, so assigning a mechanic to a World is a
 * lightweight action rather than a configuration exercise.
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

  /** The board position; unique within a World, so ryo_1 and ryo_2 coexist. */
  @Prop({ type: String, enum: WorldChallengeSlotKey, required: true })
  slotKey: WorldChallengeSlotKey;

  @Prop({ type: String, enum: WorldChallengeSlotType, required: true })
  slotType: WorldChallengeSlotType;

  /**
   * Optional per-World label. A globally fixed mechanic such as RYO keeps one
   * name everywhere, so this stays empty for it.
   */
  @Prop({ trim: true }) displayName?: string;

  @Prop({ trim: true }) description?: string;

  @Prop({ type: ContentAssetDefinition, _id: false }) icon?: ContentAssetRef;

  @Prop({ default: 0 }) sortOrder: number;

  @Prop({ type: Boolean, default: false }) isEnabled: boolean;
}

export const WorldChallengeConfigurationSchema = SchemaFactory.createForClass(
  WorldChallengeConfiguration,
);
// One configuration per board position. The same canonical mechanic may fill
// both RYO positions, which a {worldId, challengeTypeId} key would have blocked.
WorldChallengeConfigurationSchema.index(
  { worldId: 1, slotKey: 1 },
  { unique: true },
);
