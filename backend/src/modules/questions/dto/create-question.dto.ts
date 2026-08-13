import {
  IsString,
  IsOptional,
  IsEnum,
  IsMongoId,
  MinLength,
  IsNumber,
  IsBoolean,
  IsDateString,
  IsInt,
  IsArray,
  IsObject,
  ArrayMaxSize,
  ArrayMinSize,
  Min,
  Max,
  ValidateNested,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import {
  AudioQuestionKind,
  AssetStatus,
  DifficultyLevel,
  GameMode,
  QuestionAssetType,
  QuestionType,
  QuestionStatus,
  QuestionSource,
  QuestionPoints,
  QuestionGameplayType,
} from '../schemas/question.schema';

export class LocalizedQuestionTextDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  ar!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  en?: string;
}

export class RankedListEntryDto {
  @ApiPropertyOptional({
    description:
      'Authoring-only stable identifier used to map structured validation errors.',
  })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional({ readOnly: true })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 10,
    deprecated: true,
    description: 'Ignored. The backend derives rank from array order.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rank?: number;

  @ApiProperty({ type: LocalizedQuestionTextDto })
  @ValidateNested()
  @Type(() => LocalizedQuestionTextDto)
  answer!: LocalizedQuestionTextDto;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  aliases!: string[];

  @ApiPropertyOptional({
    minimum: 1,
    deprecated: true,
    description: 'Ignored. The backend applies the fixed Top 10 point preset.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;
}

export class RankedListDefinitionDto {
  @ApiProperty({ type: LocalizedQuestionTextDto })
  @ValidateNested()
  @Type(() => LocalizedQuestionTextDto)
  displayName!: LocalizedQuestionTextDto;

  @ApiProperty({ type: [RankedListEntryDto], minItems: 10, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(10)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RankedListEntryDto)
  entries!: RankedListEntryDto[];
}

export class QuestionAudioRequestDto {
  @ApiProperty({ enum: AudioQuestionKind, enumName: 'AudioQuestionKind' })
  @IsEnum(AudioQuestionKind)
  kind!: AudioQuestionKind;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  searchQuery!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ minimum: 0, type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0)
  preferredStartSeconds?: number | null;

  @ApiPropertyOptional({ minimum: 3, maximum: 20 })
  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(20)
  preferredDurationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ minimum: 1, readOnly: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  requestVersion?: number;

  @ApiPropertyOptional({ readOnly: true })
  @IsOptional()
  @IsString()
  requestHash?: string;

  @ApiPropertyOptional({ format: 'date-time', readOnly: true })
  @IsOptional()
  @IsDateString()
  requestedAt?: string;

  @ApiPropertyOptional({ type: 'string', nullable: true, readOnly: true })
  @IsOptional()
  @IsString()
  selectedCandidateId?: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    nullable: true,
    readOnly: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  candidateSetVersion?: number | null;
}

export class BombItemImageDto {
  @ApiProperty({ example: '/uploads/questions/bomb-items/item.webp' })
  @IsString()
  @MaxLength(500)
  url!: string;

  @ApiProperty({ example: 'uploads/questions/bomb-items/item.webp' })
  @IsString()
  @MaxLength(500)
  storageKey!: string;

  @ApiProperty({ example: 'image/webp' })
  @IsString()
  @MaxLength(80)
  mimetype!: string;

  @ApiProperty({ example: 124000 })
  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  size!: number;
}

export class BombQuestionItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ minimum: 0, maximum: 14 })
  @IsInt()
  @Min(0)
  @Max(14)
  order!: number;

  @ApiProperty({ type: BombItemImageDto })
  @ValidateNested()
  @Type(() => BombItemImageDto)
  image!: BombItemImageDto;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  acceptedAnswers!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  altText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BombQuestionContentDto {
  @ApiProperty({ type: [BombQuestionItemDto], minItems: 10, maxItems: 15 })
  @IsArray()
  @ArrayMinSize(10)
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => BombQuestionItemDto)
  items!: BombQuestionItemDto[];
}

export class CreateQuestionDto {
  @ApiPropertyOptional({ description: 'New content architecture world' })
  @IsOptional()
  @IsMongoId()
  worldId?: string;

  @ApiPropertyOptional({ description: 'New content architecture category' })
  @IsOptional()
  @IsMongoId()
  contentCategoryId?: string;

  @ApiPropertyOptional({ description: 'World-owned challenge type' })
  @IsOptional()
  @IsMongoId()
  challengeTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId({ message: 'Category ID must be a valid MongoDB ID' })
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId({ message: 'Category ID must be a valid MongoDB ID' })
  categoryId?: string;

  @ApiProperty()
  @IsString({ message: 'Question must be a string' })
  @MinLength(1, { message: 'Question is required' })
  question: string;

  @ApiPropertyOptional({
    enum: QuestionGameplayType,
    enumName: 'QuestionGameplayType',
    default: QuestionGameplayType.STANDARD,
  })
  @IsOptional()
  @IsEnum(QuestionGameplayType)
  questionType?: QuestionGameplayType;

  @ApiPropertyOptional({ type: LocalizedQuestionTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedQuestionTextDto)
  text?: LocalizedQuestionTextDto;

  @ApiPropertyOptional({ enum: [600] })
  @IsOptional()
  @IsInt()
  maxPoints?: number;

  @ApiPropertyOptional({ default: 15, minimum: 1, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  turnDurationSeconds?: number;

  @ApiPropertyOptional({ default: 3, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxStrikesPerTeam?: number;

  @ApiPropertyOptional({ type: RankedListDefinitionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RankedListDefinitionDto)
  rankedList?: RankedListDefinitionDto;

  @ApiPropertyOptional({ type: () => BombQuestionContentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BombQuestionContentDto)
  bombContent?: BombQuestionContentDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Answer must be a string' })
  @MinLength(1, { message: 'Answer is required' })
  answer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Correct answer must be a string' })
  @MinLength(1, { message: 'Correct answer is required' })
  correctAnswer?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  wrongAnswers?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptedAnswers?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  explanation?: string;

  @ApiPropertyOptional({
    enum: DifficultyLevel,
    enumName: 'DifficultyLevel',
    deprecated: true,
  })
  @IsOptional()
  @IsEnum(DifficultyLevel, {
    message: 'Difficulty must be one of: easy, medium, hard',
  })
  difficulty?: DifficultyLevel;

  @ApiPropertyOptional({ enum: QuestionPoints, enumName: 'QuestionPoints' })
  @IsOptional()
  @IsNumber()
  @IsEnum(QuestionPoints, {
    message: 'Points must be one of: 200, 400, 600',
  })
  points?: QuestionPoints;

  @ApiPropertyOptional({ enum: QuestionPoints, enumName: 'QuestionPoints' })
  @IsOptional()
  @IsNumber()
  @IsEnum(QuestionPoints, {
    message: 'Score must be one of: 200, 400, 600',
  })
  score?: QuestionPoints;

  @ApiPropertyOptional({ enum: GameMode, enumName: 'GameMode' })
  @IsOptional()
  @IsEnum(GameMode)
  gameMode?: GameMode;

  @ApiPropertyOptional({ enum: QuestionType, enumName: 'QuestionType' })
  @IsOptional()
  @IsEnum(QuestionType, {
    message: 'Type must be one of: text, image, audio, video, gif',
  })
  type?: QuestionType;

  @ApiPropertyOptional({ type: 'object', nullable: true })
  @IsOptional()
  @IsObject()
  primaryAsset?: {
    type: QuestionAssetType;
    url: string;
    source: string;
    sourceUrl?: string;
    searchQuery?: string;
    provider?: string;
    localPath?: string;
    duration?: number;
    metadata?: Record<string, unknown>;
  } | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresAudio?: boolean;

  @ApiPropertyOptional({
    enum: AudioQuestionKind,
    enumName: 'AudioQuestionKind',
  })
  @IsOptional()
  @IsEnum(AudioQuestionKind)
  audioKind?: AudioQuestionKind;

  @ApiPropertyOptional({ type: QuestionAudioRequestDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionAudioRequestDto)
  audioRequest?: QuestionAudioRequestDto | null;

  @ApiPropertyOptional({ type: 'object', nullable: true })
  @IsOptional()
  @IsObject()
  coverImage?: {
    type: 'image';
    url: string;
    source: string;
    sourceUrl?: string;
    provider?: string;
    localPath?: string;
    metadata?: Record<string, unknown>;
  } | null;

  @ApiPropertyOptional({ type: 'object', nullable: true })
  @IsOptional()
  @IsObject()
  primaryAssetRequest?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: 'object', nullable: true })
  @IsOptional()
  @IsObject()
  coverImageRequest?: Record<string, unknown> | null;

  @ApiPropertyOptional({ enum: AssetStatus, enumName: 'AssetStatus' })
  @IsOptional()
  @IsEnum(AssetStatus)
  coverImageStatus?: AssetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverImageFailureReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mediaKey?: string;

  @ApiPropertyOptional({ enum: QuestionStatus, enumName: 'QuestionStatus' })
  @IsOptional()
  @IsEnum(QuestionStatus, {
    message:
      'Status must be one of: draft, approved, published, archived, rejected',
  })
  status?: QuestionStatus;

  @ApiPropertyOptional({ enum: QuestionSource, enumName: 'QuestionSource' })
  @IsOptional()
  @IsEnum(QuestionSource, {
    message: 'Source must be one of: manual, ai, imported, music',
  })
  source?: QuestionSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  qualityScore?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  issues?: string[];

  @ApiPropertyOptional({ enum: AssetStatus, enumName: 'AssetStatus' })
  @IsOptional()
  @IsEnum(AssetStatus)
  assetStatus?: AssetStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetFailureReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetFailureStep?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  assetFailureDiagnostics?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  gameplayMetadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  aiMetadata?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  createdBy?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFreeGameQuestion?: boolean;
}

export class UpdateQuestionDto extends PartialType(
  OmitType(CreateQuestionDto, [
    'primaryAsset',
    'mediaUrl',
    'mediaKey',
    'assetStatus',
    'assetFailureReason',
    'assetFailureStep',
    'assetFailureDiagnostics',
  ] as const),
) {
  @IsOptional()
  @IsMongoId()
  category?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  question?: string;

  @IsOptional()
  @IsEnum(QuestionGameplayType)
  questionType?: QuestionGameplayType;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedQuestionTextDto)
  text?: LocalizedQuestionTextDto;

  @IsOptional()
  @IsInt()
  maxPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  turnDurationSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxStrikesPerTeam?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => RankedListDefinitionDto)
  rankedList?: RankedListDefinitionDto;

  @IsOptional()
  @IsString()
  @MinLength(1)
  answer?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  correctAnswer?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  wrongAnswers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptedAnswers?: string[];

  @IsOptional()
  @IsString()
  explanation?: string;

  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficulty?: DifficultyLevel;

  @IsOptional()
  @IsNumber()
  @IsEnum(QuestionPoints)
  points?: QuestionPoints;

  @IsOptional()
  @IsNumber()
  @IsEnum(QuestionPoints)
  score?: QuestionPoints;

  @IsOptional()
  @IsEnum(GameMode)
  gameMode?: GameMode;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsBoolean()
  requiresAudio?: boolean;

  @IsOptional()
  @IsEnum(AudioQuestionKind)
  audioKind?: AudioQuestionKind;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionAudioRequestDto)
  audioRequest?: QuestionAudioRequestDto | null;

  @IsOptional()
  @IsObject()
  coverImage?: CreateQuestionDto['coverImage'];

  @IsOptional()
  @IsObject()
  primaryAssetRequest?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  coverImageRequest?: Record<string, unknown> | null;

  @IsOptional()
  @IsEnum(AssetStatus)
  coverImageStatus?: AssetStatus;

  @IsOptional()
  @IsString()
  coverImageFailureReason?: string;

  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @IsOptional()
  @IsEnum(QuestionSource)
  source?: QuestionSource;

  @IsOptional()
  @IsNumber()
  qualityScore?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  issues?: string[];

  @IsOptional()
  @IsObject()
  gameplayMetadata?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  aiMetadata?: Record<string, unknown>;

  @IsOptional()
  @IsMongoId()
  createdBy?: string;

  @IsOptional()
  @IsBoolean()
  isFreeGameQuestion?: boolean;
}
