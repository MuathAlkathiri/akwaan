import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GenerateReviewedQuestionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId({ message: 'Category ID must be a valid MongoDB ID' })
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  catalogName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryName?: string;

  @ApiPropertyOptional({ enum: ['easy', 'medium', 'hard'] })
  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard';

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Count must be an integer' })
  @Min(1, { message: 'Count must be at least 1' })
  @Max(20, { message: 'Count cannot be more than 20' })
  count?: number;

  @ApiPropertyOptional({ enum: ['ar'] })
  @IsOptional()
  @IsIn(['ar'])
  language?: 'ar';

  @ApiPropertyOptional({ enum: ['source-curated'], default: 'source-curated' })
  @IsOptional()
  @IsIn(['source-curated'])
  strategy?: 'source-curated';

  @ApiPropertyOptional({ type: [String], example: ['open-trivia-db'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceIds?: string[];

  @ApiPropertyOptional({
    default: false,
    description:
      'Reserved for future use. Generated fallback is currently disabled.',
  })
  @IsOptional()
  @IsBoolean()
  allowGeneratedFallback?: boolean;
}
