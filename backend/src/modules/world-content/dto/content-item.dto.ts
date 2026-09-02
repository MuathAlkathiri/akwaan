import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  ContentMediaType,
  VoteConsensusRule,
} from '../domain/world-content.constants';
import { ContentAssetDto, LocalizedTextDto } from './world-content-shared.dto';

export class ContentAnswerOptionDto {
  @IsString() @MaxLength(60) id: string;

  @ValidateNested() @Type(() => LocalizedTextDto) label: LocalizedTextDto;
}

export class ContentSplitFragmentDto {
  @ApiProperty({ description: 'Which seat privately receives this fragment' })
  @IsInt()
  @Min(1)
  seat: number;

  @ValidateNested() @Type(() => LocalizedTextDto) clue: LocalizedTextDto;
}

export class ContentSplitPayloadDto {
  @ApiProperty({ type: [ContentSplitFragmentDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => ContentSplitFragmentDto)
  fragments: ContentSplitFragmentDto[];
}

/**
 * One transport shape for all six answer modes, discriminated by `mode`.
 * Structural validity per mode is decided by ContentItemCompatibilityPolicy so
 * the rule exists exactly once (roadmap 14).
 */
export class ContentAnswerPayloadDto {
  @ApiProperty({ enum: ChallengeAnswerMode })
  @IsEnum(ChallengeAnswerMode)
  mode: ChallengeAnswerMode;

  @ApiPropertyOptional({ type: [ContentAnswerOptionDto], nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentAnswerOptionDto)
  options?: ContentAnswerOptionDto[] | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  correctOptionId?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() correctValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  acceptedTolerance?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptedAnswers?: string[];

  @ApiPropertyOptional({ enum: VoteConsensusRule })
  @IsOptional()
  @IsEnum(VoteConsensusRule)
  consensusRule?: VoteConsensusRule;

  @ApiPropertyOptional({ type: ContentSplitPayloadDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentSplitPayloadDto)
  splitPayload?: ContentSplitPayloadDto;
}

export class ContentItemMediaDto {
  @ApiProperty({ enum: ContentMediaType })
  @IsEnum(ContentMediaType)
  type: ContentMediaType;

  @ApiProperty({ type: [ContentAssetDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentAssetDto)
  assets: ContentAssetDto[];
}

export class ContentItemMetadataDto {
  @IsOptional() @IsString() @MaxLength(200) source?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class CreateContentItemDto {
  @ApiProperty({ description: 'Owning Scope; the World is derived from it' })
  @IsMongoId()
  scopeId: string;

  @ValidateNested() @Type(() => LocalizedTextDto) prompt: LocalizedTextDto;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsMongoId({ each: true })
  compatibleChallengeTypeIds: string[];

  @ApiPropertyOptional({ type: ContentItemMediaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentItemMediaDto)
  media?: ContentItemMediaDto;

  @ApiPropertyOptional({ type: ContentItemMediaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentItemMediaDto)
  revealMedia?: ContentItemMediaDto;

  @ApiProperty({ type: ContentAnswerPayloadDto })
  @ValidateNested()
  @Type(() => ContentAnswerPayloadDto)
  answerPayload: ContentAnswerPayloadDto;

  @ApiPropertyOptional({ description: 'Mechanic-specific extras' })
  @IsOptional()
  @IsObject()
  mechanicPayload?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Defaults to true for Relational-only content (roadmap 6.4)',
  })
  @IsOptional()
  @IsBoolean()
  isReusableAcrossSessions?: boolean;

  @IsOptional() @IsEnum(ContentItemStatus) status?: ContentItemStatus;

  @ApiPropertyOptional({ type: ContentItemMetadataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentItemMetadataDto)
  metadata?: ContentItemMetadataDto;
}

export class UpdateContentItemDto extends PartialType(CreateContentItemDto) {}

export class QueryContentItemsDto {
  @IsOptional() @IsMongoId() worldId?: string;
  @IsOptional() @IsMongoId() scopeId?: string;
  @IsOptional() @IsMongoId() challengeTypeId?: string;
  @IsOptional() @IsEnum(ContentItemStatus) status?: ContentItemStatus;
}
