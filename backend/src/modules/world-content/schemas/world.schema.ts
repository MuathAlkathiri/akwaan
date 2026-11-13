import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { WorldContentStatus } from '../domain/world-content.constants';
import { ContentAssetRef } from '../domain/world-content.types';
import {
  ContentAssetDefinition,
  SLUG_PATTERN,
} from './world-content-shared.schema';

/** Top-level playable theme (roadmap 2, 5). */
@Schema({ timestamps: true, collection: 'worlds' })
export class World extends Document {
  @Prop({ required: true, trim: true }) name: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: SLUG_PATTERN,
  })
  slug: string;

  @Prop({ trim: true }) description?: string;

  @Prop({ type: ContentAssetDefinition, _id: false }) icon?: ContentAssetRef;

  @Prop({ type: ContentAssetDefinition, _id: false }) banner?: ContentAssetRef;

  /**
   * The World's one question fallback artwork (roadmap §30.22 Track A).
   *
   * Decorative only: a calm 16:9 backdrop for a question that carries no
   * gameplay media of its own. It is referenced here and nowhere else — never
   * copied into a ContentItem — and it never stands in for required gameplay
   * media, which `resolveQuestionPresentation` enforces.
   */
  @Prop({ type: ContentAssetDefinition, _id: false, default: null })
  questionFallback?: ContentAssetRef | null;

  /** World presentation profiles (roadmap 5). */
  @Prop({ type: String, trim: true, default: null })
  soundPack?: string | null;

  @Prop({ type: String, trim: true, default: null })
  timerProfile?: string | null;

  @Prop({ type: String, trim: true, default: null })
  toneProfile?: string | null;

  @Prop({
    type: String,
    enum: WorldContentStatus,
    default: WorldContentStatus.DRAFT,
    index: true,
  })
  status: WorldContentStatus;

  @Prop({ default: 0 }) sortOrder: number;
}

export const WorldSchema = SchemaFactory.createForClass(World);
WorldSchema.index({ name: 1 });
