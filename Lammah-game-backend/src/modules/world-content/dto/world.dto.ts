import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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

export class CreateWorldDto {
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
  icon?: ContentAssetDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContentAssetDto)
  banner?: ContentAssetDto;

  @ApiPropertyOptional({
    description: "Challenge type that fills this World's Signature slot",
  })
  @IsOptional()
  @IsMongoId()
  signatureMechanicId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  soundPack?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  timerProfile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  toneProfile?: string;

  @IsOptional() @IsEnum(WorldContentStatus) status?: WorldContentStatus;

  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateWorldDto extends PartialType(CreateWorldDto) {}
