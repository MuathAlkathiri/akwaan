import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Catalog } from '../../catalogs/schemas/catalog.schema';

export enum CategoryAudioPolicy {
  DISABLED = 'disabled',
  OPTIONAL = 'optional',
  REQUIRED = 'required',
}

export enum CategoryGameplayMode {
  STANDARD = 'STANDARD',
  TOP_10 = 'TOP_10',
}

export class CategoryBanner {
  filename: string;
  path: string;
  url: string;
  mimetype: string;
  size: number;
}

export class CategoryAiConfig {
  knowledgeFile?: string;
  temperature?: number;
  preferredQuestionTypes?: string[];
  avoidTopics?: string[];
  extraInstructions?: string;
}

export class CategoryGameplayConfig {
  gameModes?: Partial<
    Record<
      | 'trivia'
      | 'identifyCharacter'
      | 'identifyVoice'
      | 'identifyImage'
      | 'completeQuote'
      | 'timeline'
      | 'emojiPuzzle'
      | 'identifySong'
      | 'identifySinger'
      | 'identifyMusicIntro',
      number
    >
  >;
  questionTypes?: Partial<
    Record<
      'text' | 'image' | 'audio' | 'video' | 'quote' | 'emoji' | 'timeline',
      number
    >
  >;
  supportedAssetTypes?: Array<
    'text' | 'image' | 'audio' | 'video' | 'quote' | 'emoji' | 'timeline'
  >;
  preferredDifficultyMix?: Partial<Record<'easy' | 'medium' | 'hard', number>>;
  maxAudioDuration?: number;
  imageRevealAllowed?: boolean;
  allowMultipleAssets?: boolean;
  musicConfig?: {
    allowedRegions?: string[];
    allowedLanguages?: string[];
    releaseYearFrom?: number;
    releaseYearTo?: number;
    maxPreviewDuration?: number;
  };
}

@Schema({ timestamps: true })
export class Category extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop()
  description?: string;

  @Prop({ type: Types.ObjectId, ref: Catalog.name, default: null })
  catalogId?: Types.ObjectId | Catalog | null;

  catalog?: Catalog | null;

  @Prop({
    type: {
      filename: { type: String, required: true },
      path: { type: String, required: true },
      url: { type: String, required: true },
      mimetype: { type: String, required: true },
      size: { type: Number, required: true },
    },
    required: false,
    _id: false,
  })
  banner?: CategoryBanner;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({
    type: String,
    enum: CategoryAudioPolicy,
    default: CategoryAudioPolicy.OPTIONAL,
  })
  audioPolicy: CategoryAudioPolicy;

  @Prop({
    type: String,
    enum: CategoryGameplayMode,
    default: CategoryGameplayMode.STANDARD,
    index: true,
  })
  gameplayMode: CategoryGameplayMode;

  @Prop({
    type: {
      knowledgeFile: { type: String, trim: true },
      temperature: { type: Number, min: 0, max: 2 },
      preferredQuestionTypes: { type: [String], default: undefined },
      avoidTopics: { type: [String], default: undefined },
      extraInstructions: { type: String, trim: true },
    },
    required: false,
    _id: false,
  })
  aiConfig?: CategoryAiConfig;

  @Prop({
    type: {
      questionTypes: {
        text: { type: Number, min: 0, max: 100 },
        image: { type: Number, min: 0, max: 100 },
        audio: { type: Number, min: 0, max: 100 },
        quote: { type: Number, min: 0, max: 100 },
        emoji: { type: Number, min: 0, max: 100 },
        timeline: { type: Number, min: 0, max: 100 },
      },
      gameModes: {
        trivia: { type: Number, min: 0, max: 100 },
        identifyCharacter: { type: Number, min: 0, max: 100 },
        identifyVoice: { type: Number, min: 0, max: 100 },
        identifyImage: { type: Number, min: 0, max: 100 },
        completeQuote: { type: Number, min: 0, max: 100 },
        timeline: { type: Number, min: 0, max: 100 },
        emojiPuzzle: { type: Number, min: 0, max: 100 },
        identifySong: { type: Number, min: 0, max: 100 },
        identifySinger: { type: Number, min: 0, max: 100 },
        identifyMusicIntro: { type: Number, min: 0, max: 100 },
      },
      supportedAssetTypes: { type: [String], default: undefined },
      preferredDifficultyMix: {
        easy: { type: Number, min: 0, max: 100 },
        medium: { type: Number, min: 0, max: 100 },
        hard: { type: Number, min: 0, max: 100 },
      },
      maxAudioDuration: { type: Number, min: 1, max: 20 },
      imageRevealAllowed: { type: Boolean },
      allowMultipleAssets: { type: Boolean },
      musicConfig: {
        allowedRegions: { type: [String], default: undefined },
        allowedLanguages: { type: [String], default: undefined },
        releaseYearFrom: Number,
        releaseYearTo: Number,
        maxPreviewDuration: { type: Number, min: 1, max: 30 },
      },
    },
    required: false,
    _id: false,
  })
  gameplayConfig?: CategoryGameplayConfig;

  @Prop({ default: 0 })
  sortOrder: number;

  createdAt: Date;
  updatedAt: Date;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.virtual('catalog', {
  ref: Catalog.name,
  localField: 'catalogId',
  foreignField: '_id',
  justOne: true,
});
CategorySchema.set('toJSON', { virtuals: true });
CategorySchema.set('toObject', { virtuals: true });
