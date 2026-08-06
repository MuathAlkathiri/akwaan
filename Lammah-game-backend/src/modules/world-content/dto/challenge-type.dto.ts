import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  WorldContentStatus,
} from '../domain/world-content.constants';
import {
  ChallengePresentationDto,
  ContentAssetDto,
  SLUG_REGEX,
} from './world-content-shared.dto';

export class CreateChallengeTypeDto {
  @IsString() @MaxLength(100) name: string;

  @ApiProperty({ description: 'Globally unique mechanic identifier' })
  @IsString()
  @Matches(SLUG_REGEX)
  slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContentAssetDto)
  icon?: ContentAssetDto;

  @ApiProperty({ enum: ChallengeFamily })
  @IsEnum(ChallengeFamily)
  family: ChallengeFamily;

  @ApiPropertyOptional({ enum: ChallengeItemStructure })
  @IsOptional()
  @IsEnum(ChallengeItemStructure)
  itemStructure?: ChallengeItemStructure;

  @ApiProperty({ enum: ChallengeAnswerMode })
  @IsEnum(ChallengeAnswerMode)
  answerMode: ChallengeAnswerMode;

  @ApiProperty({ type: ChallengePresentationDto })
  @ValidateNested()
  @Type(() => ChallengePresentationDto)
  defaultPresentation: ChallengePresentationDto;

  @ApiProperty({ description: 'Must resolve in the central scoring registry' })
  @IsString()
  @MaxLength(80)
  scoringRuleId: string;

  @IsOptional() @IsEnum(WorldContentStatus) status?: WorldContentStatus;

  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateChallengeTypeDto extends PartialType(
  CreateChallengeTypeDto,
) {}
