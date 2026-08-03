import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { WorldContentStatus } from '../domain/world-content.constants';
import { ContentAssetRef } from '../domain/world-content.types';
import {
  ContentAssetDefinition,
  SLUG_PATTERN,
} from './world-content-shared.schema';
import { World } from './world.schema';

/**
 * A content-tagging dimension inside a World (roadmap 2, 6). A Scope never
 * changes mechanics; it only decides which mechanics its content may reach.
 */
@Schema({ timestamps: true, collection: 'scopes' })
export class Scope extends Document {
  @Prop({ type: Types.ObjectId, ref: World.name, required: true, index: true })
  worldId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;

  @Prop({ required: true, lowercase: true, trim: true, match: SLUG_PATTERN })
  slug: string;

  @Prop({ trim: true }) description?: string;

  @Prop({ type: ContentAssetDefinition, _id: false }) image?: ContentAssetRef;

  /** Roadmap 5.2: mechanics this Scope's content must never be played through. */
  @Prop({ type: [Types.ObjectId], ref: 'ChallengeType', default: [] })
  excludedChallengeTypeIds: Types.ObjectId[];

  @Prop({
    type: String,
    enum: WorldContentStatus,
    default: WorldContentStatus.DRAFT,
    index: true,
  })
  status: WorldContentStatus;

  @Prop({ default: 0 }) sortOrder: number;
}

export const ScopeSchema = SchemaFactory.createForClass(Scope);
ScopeSchema.index({ worldId: 1, slug: 1 }, { unique: true });
