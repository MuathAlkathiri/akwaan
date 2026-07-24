import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsMongoId,
  IsNumber,
  MinLength,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsObject,
  IsIn,
  IsEnum,
} from 'class-validator';
import {
  CategoryAudioPolicy,
  CategoryGameplayMode,
} from '../schemas/category.schema';

export class CategoryAiConfigDto {
  @ApiPropertyOptional({ example: 'sports/world-cup.md' })
  @IsOptional()
  @IsString()
  knowledgeFile?: string;

  @ApiPropertyOptional({ example: 0.7, minimum: 0, maximum: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({
    example: ['historical moments', 'records', 'finals'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredQuestionTypes?: string[];

  @ApiPropertyOptional({
    example: ['winner of 2022', 'host country 2022'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  avoidTopics?: string[];

  @ApiPropertyOptional({
    example: 'Focus on fun offline party-game questions.',
  })
  @IsOptional()
  @IsString()
  extraInstructions?: string;
}

export class CategoryGameplayConfigDto {
  @ApiPropertyOptional({
    example: {
      trivia: 30,
      identifyCharacter: 30,
      identifyVoice: 20,
      completeQuote: 20,
    },
  })
  @IsOptional()
  @IsObject()
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

  @ApiPropertyOptional({
    description: 'Legacy field. Prefer gameModes for new categories.',
    example: {
      text: 20,
      image: 35,
      audio: 20,
      video: 5,
      quote: 10,
      emoji: 5,
      timeline: 5,
    },
  })
  @IsOptional()
  @IsObject()
  questionTypes?: Partial<
    Record<
      'text' | 'image' | 'audio' | 'video' | 'quote' | 'emoji' | 'timeline',
      number
    >
  >;

  @ApiPropertyOptional({
    example: ['text', 'image', 'audio', 'video', 'quote', 'emoji', 'timeline'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsIn(['text', 'image', 'audio', 'video', 'quote', 'emoji', 'timeline'], {
    each: true,
  })
  supportedAssetTypes?: Array<
    'text' | 'image' | 'audio' | 'video' | 'quote' | 'emoji' | 'timeline'
  >;

  @ApiPropertyOptional({
    example: {
      allowedRegions: ['khaliji', 'egyptian'],
      allowedLanguages: ['ar'],
      maxPreviewDuration: 15,
    },
  })
  @IsOptional()
  @IsObject()
  musicConfig?: {
    allowedRegions?: string[];
    allowedLanguages?: string[];
    releaseYearFrom?: number;
    releaseYearTo?: number;
    maxPreviewDuration?: number;
  };

  @ApiPropertyOptional({
    example: {
      easy: 30,
      medium: 50,
      hard: 20,
    },
  })
  @IsOptional()
  @IsObject()
  preferredDifficultyMix?: Partial<Record<'easy' | 'medium' | 'hard', number>>;

  @ApiPropertyOptional({ example: 6, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxAudioDuration?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  imageRevealAllowed?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  allowMultipleAssets?: boolean;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Science' })
  @IsString({ message: 'Name must be a string' })
  @MinLength(1, { message: 'Name is required' })
  name: string;

  @ApiProperty({ example: 'science' })
  @IsString({ message: 'Slug must be a string' })
  @MinLength(1, { message: 'Slug is required' })
  slug: string;

  @ApiPropertyOptional({ example: 'Science and discovery questions' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: '66b8f5f2c9d7a8b1e3f00223',
    description: 'Catalog ID that this category belongs to',
  })
  @IsMongoId()
  catalogId: string;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: CategoryAudioPolicy,
    enumName: 'CategoryAudioPolicy',
    default: CategoryAudioPolicy.OPTIONAL,
  })
  @IsOptional()
  @IsEnum(CategoryAudioPolicy)
  audioPolicy?: CategoryAudioPolicy;

  @ApiPropertyOptional({
    enum: CategoryGameplayMode,
    enumName: 'CategoryGameplayMode',
    default: CategoryGameplayMode.STANDARD,
    description: 'Canonical gameplay rules for this category.',
  })
  @IsOptional()
  @IsEnum(CategoryGameplayMode)
  gameplayMode?: CategoryGameplayMode;

  @ApiPropertyOptional({ type: CategoryAiConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryAiConfigDto)
  aiConfig?: CategoryAiConfigDto;

  @ApiPropertyOptional({ type: CategoryGameplayConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryGameplayConfigDto)
  gameplayConfig?: CategoryGameplayConfigDto;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Science Updated' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 'science-updated' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @ApiPropertyOptional({ example: 'Updated science category description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: '66b8f5f2c9d7a8b1e3f00223',
    description:
      'Catalog ID that this category belongs to. Send null to detach.',
    nullable: true,
  })
  @IsOptional()
  @IsMongoId()
  catalogId?: string | null;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: CategoryAudioPolicy,
    enumName: 'CategoryAudioPolicy',
  })
  @IsOptional()
  @IsEnum(CategoryAudioPolicy)
  audioPolicy?: CategoryAudioPolicy;

  @ApiPropertyOptional({
    enum: CategoryGameplayMode,
    enumName: 'CategoryGameplayMode',
  })
  @IsOptional()
  @IsEnum(CategoryGameplayMode)
  gameplayMode?: CategoryGameplayMode;

  @ApiPropertyOptional({
    description:
      'Explicit confirmation required when changing gameplayMode on an existing category.',
  })
  @IsOptional()
  @IsBoolean()
  confirmGameplayModeChange?: boolean;

  @ApiPropertyOptional({ type: CategoryAiConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryAiConfigDto)
  aiConfig?: CategoryAiConfigDto;

  @ApiPropertyOptional({ type: CategoryGameplayConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CategoryGameplayConfigDto)
  gameplayConfig?: CategoryGameplayConfigDto;
}

export class CategoryMultipartBodyDto {
  @ApiProperty({
    description:
      'JSON string containing CreateCategoryDto or UpdateCategoryDto fields',
    example: JSON.stringify({
      name: 'Science',
      slug: 'science',
      description: 'Science and discovery questions',
      catalogId: '66b8f5f2c9d7a8b1e3f00223',
      sortOrder: 0,
      isActive: true,
      aiConfig: {
        knowledgeFile: 'sports/world-cup.md',
        temperature: 0.7,
        preferredQuestionTypes: ['historical moments', 'records', 'finals'],
        avoidTopics: ['winner of 2022', 'host country 2022'],
        extraInstructions: 'Focus on fun offline party-game questions.',
      },
      gameplayConfig: {
        gameModes: {
          trivia: 30,
          identifyCharacter: 30,
          identifyVoice: 20,
          completeQuote: 20,
        },
        supportedAssetTypes: [
          'text',
          'image',
          'audio',
          'quote',
          'emoji',
          'timeline',
        ],
        preferredDifficultyMix: {
          easy: 30,
          medium: 50,
          hard: 20,
        },
        maxAudioDuration: 6,
        imageRevealAllowed: true,
        allowMultipleAssets: false,
      },
    }),
  })
  category: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Optional category banner image (jpg, jpeg, png, webp)',
  })
  banner?: unknown;
}
