import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import {
  ASSET_RIGHTS_BASES,
  CLEARANCE_STATUSES,
  LIKENESS_USE_BASES,
} from '../domain/media-rights.policy';

class AssetRightsDto {
  @ApiProperty({ enum: CLEARANCE_STATUSES })
  @IsIn(CLEARANCE_STATUSES as unknown as string[])
  status!: string;

  @ApiPropertyOptional({ enum: ASSET_RIGHTS_BASES })
  @IsOptional()
  @IsIn(ASSET_RIGHTS_BASES as unknown as string[])
  basisType?: string;

  @ApiPropertyOptional({ example: 'CC BY-SA 3.0' })
  @IsOptional()
  @IsString()
  licence?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rightsHolder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  modificationAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  redistributionNote?: string;

  @ApiPropertyOptional({ description: 'A licence or grant may be time-boxed.' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'A pointer to evidence held elsewhere — never a document body.' })
  @IsOptional()
  @IsString()
  evidenceRef?: string;
}

class LikenessUseBasisDto {
  @ApiProperty({ enum: CLEARANCE_STATUSES })
  @IsIn(CLEARANCE_STATUSES as unknown as string[])
  status!: string;

  @ApiPropertyOptional({ enum: LIKENESS_USE_BASES })
  @IsOptional()
  @IsIn(LIKENESS_USE_BASES as unknown as string[])
  basisType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grantedBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commercialUseScope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  territory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  modificationAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidenceRef?: string;
}

class AttributionDto {
  @ApiPropertyOptional({
    description:
      'Only honoured where the licence does not settle it. A CC or public-domain basis derives this.',
  })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenceUrl?: string;
}

export class RecordMediaRightsDto {
  /**
   * The managed asset's canonical url. A storageKey is not accepted here: one
   * identity, one spelling — accepting both is how two forms drift apart.
   */
  @ApiProperty({ example: '/uploads/questions/bomb-items/bomb-item-1-a.jpg' })
  @IsString()
  @Matches(/^\/uploads\//, {
    message: 'assetUrl must be a managed /uploads/... url',
  })
  assetUrl!: string;

  @ApiPropertyOptional({ description: 'Integrity evidence. Not identity.' })
  @IsOptional()
  @IsString()
  assetSha256?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originalSourceUrl?: string;

  @ApiProperty({ type: AssetRightsDto })
  @IsObject()
  @ValidateNested()
  @Type(() => AssetRightsDto)
  assetRights!: AssetRightsDto;

  @ApiProperty({ type: LikenessUseBasisDto })
  @IsObject()
  @ValidateNested()
  @Type(() => LikenessUseBasisDto)
  likenessUseBasis!: LikenessUseBasisDto;

  @ApiPropertyOptional({ type: AttributionDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AttributionDto)
  attribution?: AttributionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  replacementRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewedBy?: string;
}
