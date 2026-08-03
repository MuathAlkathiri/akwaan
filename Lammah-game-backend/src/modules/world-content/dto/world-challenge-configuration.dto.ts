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
    description: 'Board position this fills; ryo_1 and ryo_2 are distinct',
  })
  @IsEnum(WorldChallengeSlotKey)
  slotKey: WorldChallengeSlotKey;

  @ApiPropertyOptional({
    description:
      'Optional World label. Globally fixed mechanics such as RYO reject it.',
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
