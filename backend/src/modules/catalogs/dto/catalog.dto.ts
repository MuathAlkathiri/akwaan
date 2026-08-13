import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class LocalizedTextDto {
  @ApiProperty({ example: 'رياضة' })
  @IsString()
  @MinLength(1)
  ar: string;

  @ApiProperty({ example: 'Sports' })
  @IsString()
  @MinLength(1)
  en: string;
}

export class CreateCatalogDto {
  @ApiProperty({ type: LocalizedTextDto })
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  name: LocalizedTextDto;

  @ApiPropertyOptional({ type: LocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  description?: LocalizedTextDto;

  @ApiPropertyOptional({ example: 'sports' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @ApiPropertyOptional({ example: 'trophy' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class UpdateLocalizedTextDto {
  @ApiPropertyOptional({ example: 'رياضة' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  ar?: string;

  @ApiPropertyOptional({ example: 'Sports' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  en?: string;
}

export class UpdateCatalogDto {
  @ApiPropertyOptional({ type: UpdateLocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateLocalizedTextDto)
  name?: UpdateLocalizedTextDto;

  @ApiPropertyOptional({ type: UpdateLocalizedTextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateLocalizedTextDto)
  description?: UpdateLocalizedTextDto;

  @ApiPropertyOptional({ example: 'sports' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  slug?: string;

  @ApiPropertyOptional({ example: 'trophy' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class CatalogMultipartBodyDto {
  @ApiProperty({
    description:
      'JSON string containing CreateCatalogDto or UpdateCatalogDto fields',
    example: JSON.stringify({
      name: { ar: 'رياضة', en: 'Sports' },
      description: {
        ar: 'أسئلة رياضية متنوعة',
        en: 'Various sports questions',
      },
      slug: 'sports',
      icon: 'trophy',
      isActive: true,
      sortOrder: 1,
    }),
  })
  catalog: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Optional catalog banner image (jpg, jpeg, png, webp)',
  })
  banner?: unknown;
}
