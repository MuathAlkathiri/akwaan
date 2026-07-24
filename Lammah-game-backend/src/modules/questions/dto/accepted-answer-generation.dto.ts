import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateAcceptedAnswersDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  questionText!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  canonicalAnswerAr!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  canonicalAnswerEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  siblingAnswers?: string[];

  @ApiPropertyOptional({ enum: ['ar', 'en', 'mixed'], default: 'mixed' })
  @IsOptional()
  @IsIn(['ar', 'en', 'mixed'])
  locale?: 'ar' | 'en' | 'mixed';
}

export class RankedAcceptedAnswerEntryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  clientId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  canonicalAnswerAr!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  canonicalAnswerEn?: string;
}

export class GenerateRankedAcceptedAnswersDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  questionText!: string;

  @ApiProperty({
    type: [RankedAcceptedAnswerEntryDto],
    minItems: 10,
    maxItems: 10,
  })
  @IsArray()
  @ArrayMinSize(10)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RankedAcceptedAnswerEntryDto)
  entries!: RankedAcceptedAnswerEntryDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['ar', 'en', 'mixed'], default: 'mixed' })
  @IsOptional()
  @IsIn(['ar', 'en', 'mixed'])
  locale?: 'ar' | 'en' | 'mixed';
}

export class AcceptedAnswerAliasSuggestionDto {
  @ApiProperty() value!: string;
  @ApiProperty({ enum: ['ar', 'en', 'other'] })
  language!: 'ar' | 'en' | 'other';
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: ['high', 'medium', 'low'] })
  confidence!: 'high' | 'medium' | 'low';
}

export class AcceptedAnswerGenerationResponseDto {
  @ApiProperty({ type: [AcceptedAnswerAliasSuggestionDto] })
  aliases!: AcceptedAnswerAliasSuggestionDto[];
  @ApiProperty({ type: [String] }) warnings!: string[];
}

export class RankedAcceptedAnswerGenerationResultDto extends AcceptedAnswerGenerationResponseDto {
  @ApiProperty() clientId!: string;
}

export class RankedAcceptedAnswerGenerationResponseDto {
  @ApiProperty({ type: [RankedAcceptedAnswerGenerationResultDto] })
  entries!: RankedAcceptedAnswerGenerationResultDto[];
  @ApiProperty({ type: [String] }) warnings!: string[];
}
