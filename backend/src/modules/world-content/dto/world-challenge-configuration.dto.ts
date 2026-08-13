import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { WorldChallengeSlotKey } from '../domain/world-content.constants';
import { ContentAssetDto } from './world-content-shared.dto';

export class CreateWorldChallengeConfigurationDto {
  @ApiProperty({ description: 'Global challenge type to assign to this World' })
  @IsMongoId()
  challengeTypeId: string;

  @ApiProperty({
    enum: WorldChallengeSlotKey,
    description: 'Generic board position this mechanic fills',
  })
  @IsEnum(WorldChallengeSlotKey)
  slotKey: WorldChallengeSlotKey;

  @ApiPropertyOptional({
    description: 'Optional player-facing name for this World',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  instructions?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContentAssetDto)
  icon?: ContentAssetDto;

  @IsOptional() @IsInt() @Min(0) sortOrder?: number;

  @IsOptional() @IsBoolean() isEnabled?: boolean;
}

export class UpdateWorldChallengeConfigurationDto extends PartialType(
  CreateWorldChallengeConfigurationDto,
) {}
