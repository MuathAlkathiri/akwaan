import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  WorldContentStatus,
} from '../domain/world-content.constants';
import {
  ChallengePresentation,
  ContentAssetRef,
} from '../domain/world-content.types';
import {
  ChallengePresentationDefinition,
  ContentAssetDefinition,
  SLUG_PATTERN,
} from './world-content-shared.schema';

/**
 * A reusable mechanic definition (roadmap 7). Deliberately global: a Challenge
 * Type is never owned by a World, so "Split Clue" is one record used by many
 * Worlds. Per-World naming and presentation live in WorldChallengeConfiguration.
 */
@Schema({ timestamps: true, collection: 'challenge_types' })
export class ChallengeType extends Document {
  @Prop({ required: true, trim: true }) name: string;

  /** Globally unique mechanic identifier — no worldId in this key. */
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

  @Prop({ type: String, enum: ChallengeFamily, required: true, index: true })
  family: ChallengeFamily;

  /** Signature mechanics are exclusive to one World; shared families are not. */
  @Prop({ type: Boolean, default: false }) isExclusive: boolean;

  @Prop({
    type: String,
    enum: ChallengeItemStructure,
    default: ChallengeItemStructure.DISCRETE_TRIPLE,
  })
  itemStructure: ChallengeItemStructure;

  @Prop({ type: String, enum: ChallengeAnswerMode, required: true })
  answerMode: ChallengeAnswerMode;

  @Prop({ type: ChallengePresentationDefinition, required: true })
  defaultPresentation: ChallengePresentation;

  /** Resolved in the central scoring registry; never computed locally. */
  @Prop({ required: true, trim: true }) scoringRuleId: string;

  @Prop({
    type: String,
    enum: WorldContentStatus,
    default: WorldContentStatus.DRAFT,
    index: true,
  })
  status: WorldContentStatus;

  @Prop({ default: 0 }) sortOrder: number;
}

export const ChallengeTypeSchema = SchemaFactory.createForClass(ChallengeType);
