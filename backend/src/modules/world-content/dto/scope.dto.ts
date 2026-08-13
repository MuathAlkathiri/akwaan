import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { WorldContentStatus } from '../domain/world-content.constants';
import { ContentAssetDto, SLUG_REGEX } from './world-content-shared.dto';

export class CreateScopeDto {
  @IsString() @MaxLength(100) name: string;

  @IsString() @Matches(SLUG_REGEX) slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContentAssetDto)
  image?: ContentAssetDto;

  @ApiPropertyOptional({
    type: [String],
    description: 'Mechanics this Scope must never be played through',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  excludedChallengeTypeIds?: string[];

  @IsOptional() @IsEnum(WorldContentStatus) status?: WorldContentStatus;

  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateScopeDto extends PartialType(CreateScopeDto) {}
