import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Catalog } from '../../catalogs/schemas/catalog.schema';

export enum DifficultyLevel {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export enum QuestionType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  GIF = 'gif',
}

export enum QuestionGameplayType {
  STANDARD = 'standard',
  RANKED_LIST = 'ranked_list',
}

export interface LocalizedText {
  ar: string;
  en?: string;
}

export interface RankedListEntry {
  id: string;
  rank: number;
  answer: LocalizedText;
  aliases: string[];
  points: number;
}

export interface RankedListDefinition {
  displayName: LocalizedText;
  entries: RankedListEntry[];
}

const LocalizedTextSchema = new MongooseSchema(
  {
    ar: { type: String, required: true, trim: true },
    en: { type: String, trim: true },
  },
  { _id: false },
);

const RankedListEntrySchema = new MongooseSchema(
  {
    id: { type: String, required: true },
    rank: { type: Number, required: true, min: 1 },
    answer: { type: LocalizedTextSchema, required: true },
    aliases: { type: [String], default: [] },
    points: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const RankedListDefinitionSchema = new MongooseSchema(
  {
    displayName: { type: LocalizedTextSchema, required: true },
    entries: { type: [RankedListEntrySchema], required: true },
  },
  { _id: false },
);

export enum GameMode {
  TRIVIA = 'trivia',
  IDENTIFY_CHARACTER = 'identifyCharacter',
  IDENTIFY_VOICE = 'identifyVoice',
  IDENTIFY_IMAGE = 'identifyImage',
  COMPLETE_QUOTE = 'completeQuote',
  TIMELINE = 'timeline',
  EMOJI_PUZZLE = 'emojiPuzzle',
  IDENTIFY_SONG = 'identifySong',
  IDENTIFY_SINGER = 'identifySinger',
  IDENTIFY_MUSIC_INTRO = 'identifyMusicIntro',
}

export enum QuestionAssetType {
  AUDIO = 'audio',
  IMAGE = 'image',
  VIDEO = 'video',
  GIF = 'gif',
}

export enum AssetStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  PENDING = 'PENDING',
  READY = 'READY',
  FAILED = 'FAILED',
}

export enum AudioQuestionKind {
  IDENTIFY_SONG = 'identify_song',
  IDENTIFY_ARTIST = 'identify_artist',
  IDENTIFY_CHARACTER = 'identify_character',
  IDENTIFY_VOICE = 'identify_voice',
  IDENTIFY_GAME = 'identify_game',
  IDENTIFY_MOVIE = 'identify_movie',
  IDENTIFY_DIALOGUE_SOURCE = 'identify_dialogue_source',
  IDENTIFY_SOUND_EFFECT = 'identify_sound_effect',
  CUSTOM = 'custom',
}

export enum AudioAssetStatus {
  NOT_REQUIRED = 'not_required',
  PENDING = 'pending',
  SEARCHING = 'searching',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
  REJECTED = 'rejected',
}

export enum AudioReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export class QuestionAudioRequest {
  kind: AudioQuestionKind;
  searchQuery: string;
  targetName?: string;
  sourceTitle?: string;
  language?: string;
  preferredStartSeconds?: number | null;
  preferredDurationSeconds?: number;
  provider?: string;
  requestVersion?: number;
  requestHash?: string;
  requestedAt?: string;
  selectedCandidateId?: string | null;
  candidateSetVersion?: number | null;
}

const AudioRequestSchema = new MongooseSchema(
  {
    kind: { type: String, enum: AudioQuestionKind, required: true },
    searchQuery: { type: String, required: true, trim: true },
    targetName: { type: String, trim: true },
    sourceTitle: { type: String, trim: true },
    language: { type: String, trim: true },
    preferredStartSeconds: { type: Number, min: 0 },
    preferredDurationSeconds: { type: Number, min: 3, max: 20 },
    provider: { type: String, trim: true },
    requestVersion: { type: Number, min: 1, default: 1 },
    requestHash: { type: String, trim: true },
    requestedAt: String,
    selectedCandidateId: { type: String, default: null },
    candidateSetVersion: { type: Number, min: 1, default: null },
  },
  { _id: false },
);

export enum AudioCandidateStatus {
  AVAILABLE = 'available',
  SELECTED = 'selected',
  REJECTED = 'rejected',
  FAILED = 'failed',
}

export class QuestionAudioCandidate {
  id: string;
  title: string;
  sourceUrl?: string;
  provider: string;
  durationSeconds?: number;
  thumbnail?: string;
  queryUsed: string;
  rank: number;
  status: AudioCandidateStatus;
  rejectionReason?: string;
  requestVersion: number;
  requestHash: string;
}

const AudioCandidateSchema = new MongooseSchema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    sourceUrl: String,
    provider: { type: String, required: true },
    durationSeconds: Number,
    thumbnail: String,
    queryUsed: { type: String, required: true },
    rank: { type: Number, required: true },
    status: { type: String, enum: AudioCandidateStatus, required: true },
    rejectionReason: String,
    requestVersion: { type: Number, required: true },
    requestHash: { type: String, required: true },
  },
  { _id: false },
);

export enum QuestionPoints {
  LOW = 200,
  MEDIUM = 400,
  HIGH = 600,
}

export enum QuestionStatus {
  DRAFT = 'draft',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
  // Legacy status kept for existing admin review screens and old documents.
  REJECTED = 'rejected',
}

export enum QuestionSource {
  MANUAL = 'manual',
  AI = 'ai',
  IMPORTED = 'imported',
  // Legacy source kept for admin-uploaded music questions.
  MUSIC = 'music',
}

export class QuestionPrimaryAsset {
  type: QuestionAssetType;
  url: string;
  source: string;
  sourceUrl?: string;
  searchQuery?: string;
  provider?: string;
  localPath?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export class QuestionCoverImage {
  type: 'image';
  url: string;
  source: string;
  sourceUrl?: string;
  provider?: string;
  localPath?: string;
  metadata?: Record<string, unknown>;
}

const PrimaryAssetSchema = new MongooseSchema(
  {
    type: { type: String, enum: QuestionAssetType, required: true },
    url: { type: String, required: true },
    source: { type: String, required: true },
    sourceUrl: String,
    searchQuery: String,
    provider: String,
    localPath: String,
    duration: Number,
    metadata: MongooseSchema.Types.Mixed,
  },
  { _id: false },
);

const CoverImageSchema = new MongooseSchema(
  {
    type: { type: String, enum: ['image'], required: true },
    url: { type: String, required: true },
    source: { type: String, required: true },
    sourceUrl: String,
    provider: String,
    localPath: String,
    metadata: MongooseSchema.Types.Mixed,
  },
  { _id: false },
);

@Schema({ timestamps: true })
export class Question extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'Category',
    required: true,
  })
  category: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: Catalog.name })
  catalogId?: Types.ObjectId;

  @Prop({ required: true })
  question: string;

  @Prop({
    type: String,
    enum: QuestionGameplayType,
    default: QuestionGameplayType.STANDARD,
  })
  questionType: QuestionGameplayType;

  @Prop({ type: LocalizedTextSchema })
  text?: LocalizedText;

  @Prop()
  maxPoints?: number;

  @Prop()
  turnDurationSeconds?: number;

  @Prop()
  maxStrikesPerTeam?: number;

  @Prop({ type: RankedListDefinitionSchema })
  rankedList?: RankedListDefinition;

  @Prop()
  correctAnswer?: string;

  @Prop({ type: [String], default: undefined })
  wrongAnswers?: string[];

  @Prop({ type: [String], default: undefined })
  acceptedAnswers?: string[];

  @Prop()
  answer: string;

  @Prop()
  explanation?: string;

  @Prop({
    type: String,
    enum: DifficultyLevel,
    required: true,
  })
  difficulty: DifficultyLevel;

  @Prop({
    type: Number,
    enum: QuestionPoints,
    required: true,
  })
  points: QuestionPoints;

  @Prop({
    type: Number,
    enum: QuestionPoints,
  })
  score?: QuestionPoints;

  @Prop({
    type: String,
    enum: GameMode,
    default: GameMode.TRIVIA,
  })
  gameMode?: GameMode;

  @Prop({
    type: String,
    enum: QuestionType,
    default: QuestionType.TEXT,
  })
  type: QuestionType;

  @Prop({ type: PrimaryAssetSchema, required: false })
  primaryAsset?: QuestionPrimaryAsset | null;

  @Prop({ type: Boolean, default: false })
  requiresAudio: boolean;

  @Prop({ type: String, enum: AudioQuestionKind })
  audioKind?: AudioQuestionKind;

  @Prop({ type: AudioRequestSchema, required: false })
  audioRequest?: QuestionAudioRequest | null;

  @Prop({ type: [AudioCandidateSchema], default: undefined })
  audioCandidates?: QuestionAudioCandidate[];

  @Prop({
    type: String,
    enum: AudioAssetStatus,
    default: AudioAssetStatus.NOT_REQUIRED,
  })
  audioStatus: AudioAssetStatus;

  @Prop({ type: PrimaryAssetSchema, required: false })
  audioAsset?: QuestionPrimaryAsset | null;

  @Prop({ type: String, enum: AudioReviewStatus })
  audioReviewStatus?: AudioReviewStatus | null;

  @Prop({ type: MongooseSchema.Types.Mixed })
  audioDiagnostics?: Record<string, unknown> | null;

  @Prop({ default: false })
  audioRequestStale?: boolean;

  @Prop({ type: CoverImageSchema, required: false })
  coverImage?: QuestionCoverImage | null;

  @Prop({ type: MongooseSchema.Types.Mixed })
  primaryAssetRequest?: Record<string, unknown> | null;

  @Prop({ type: MongooseSchema.Types.Mixed })
  coverImageRequest?: Record<string, unknown> | null;

  @Prop({ type: String, enum: AssetStatus })
  coverImageStatus?: AssetStatus;

  @Prop()
  coverImageFailureReason?: string;

  @Prop()
  mediaUrl?: string;

  @Prop()
  mediaKey?: string;

  @Prop({ type: Types.ObjectId, ref: 'MusicTrack' })
  musicTrack?: Types.ObjectId;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  duplicateDiagnostics?: Record<string, unknown>;

  @Prop()
  qualityScore?: number;

  @Prop({ type: [String], default: undefined })
  issues?: string[];

  @Prop({
    type: String,
    enum: AssetStatus,
    default: AssetStatus.NOT_REQUIRED,
  })
  assetStatus?: AssetStatus;

  @Prop()
  assetFailureReason?: string;

  @Prop()
  assetFailureStep?: string;

  @Prop({ type: Object })
  assetFailureDiagnostics?: Record<string, unknown>;

  @Prop({ type: Object })
  gameplayMetadata?: Record<string, unknown>;

  @Prop({ type: Object })
  aiMetadata?: Record<string, unknown>;

  @Prop()
  spotifyTrackId?: string;

  @Prop()
  spotifyArtist?: string;

  @Prop()
  spotifyAlbumName?: string;

  @Prop()
  spotifyAlbumImageUrl?: string;

  @Prop()
  spotifyUrl?: string;

  @Prop({ type: Boolean, default: false })
  hasPreviewAudio?: boolean;

  @Prop({
    type: String,
    enum: QuestionStatus,
    default: QuestionStatus.DRAFT,
  })
  status: QuestionStatus;

  @Prop({
    type: String,
    enum: QuestionSource,
    default: QuestionSource.MANUAL,
  })
  source: QuestionSource;

  @Prop({ type: Boolean, default: false })
  isFreeGameQuestion: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);

function inferPrimaryAssetFromLegacyMedia(ret: Record<string, unknown>) {
  if (ret.primaryAsset || !ret.mediaUrl || ret.type === QuestionType.TEXT) {
    return;
  }

  if (
    ![
      QuestionType.AUDIO,
      QuestionType.IMAGE,
      QuestionType.VIDEO,
      QuestionType.GIF,
    ].includes(ret.type as QuestionType)
  ) {
    return;
  }

  ret.primaryAsset = {
    type: ret.type,
    url: ret.mediaUrl,
    source: ret.source ?? 'legacy',
    ...(ret.mediaKey ? { metadata: { mediaKey: ret.mediaKey } } : {}),
  };
}

function attachBackwardCompatibleFields<T extends object>(
  _doc: unknown,
  ret: T,
) {
  const value = ret as unknown as Record<string, unknown>;
  if (!value['correctAnswer'] && value['answer']) {
    value['correctAnswer'] = value['answer'];
  }

  if (!value['answer'] && value['correctAnswer']) {
    value['answer'] = value['correctAnswer'];
  }

  if (!value['score'] && value['points']) {
    value['score'] = value['points'];
  }

  if (!value['points'] && value['score']) {
    value['points'] = value['score'];
  }

  if (!value['categoryId'] && value['category']) {
    value['categoryId'] =
      typeof value['category'] === 'object' &&
      value['category'] &&
      '_id' in value['category']
        ? (value['category'] as { _id: unknown })._id
        : value['category'];
  }

  inferPrimaryAssetFromLegacyMedia(value);
  return ret;
}

QuestionSchema.set('toJSON', {
  virtuals: true,
  transform: attachBackwardCompatibleFields,
});
QuestionSchema.set('toObject', {
  virtuals: true,
  transform: attachBackwardCompatibleFields,
});
