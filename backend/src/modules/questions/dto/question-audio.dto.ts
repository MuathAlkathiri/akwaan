import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
  IsEnum,
  IsInt,
} from 'class-validator';
import { QuestionAudioRequestDto } from './create-question.dto';
import { AudioRetryMode } from '../application/question-audio-job.types';

export class CheckQuestionDuplicatesDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  question!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  global?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  excludeId?: string;
}

export class UpdateQuestionAudioRequestDto {
  @ApiProperty({ type: QuestionAudioRequestDto })
  @ValidateNested()
  @Type(() => QuestionAudioRequestDto)
  audioRequest!: QuestionAudioRequestDto;
}

export class UpdateQuestionAudioClipDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  preferredStartSeconds?: number;

  @ApiPropertyOptional({ minimum: 3, maximum: 20 })
  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(20)
  preferredDurationSeconds?: number;
}

export class PreviewQuestionMediaClipDto {
  @ApiPropertyOptional({
    description: 'Exact clip start time in seconds. Omit to use the default.',
    minimum: 0,
    example: 74,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  startTimeSeconds?: number;

  @ApiPropertyOptional({
    description: 'Exact clip duration in seconds. Omit to use the default.',
    minimum: 3,
    maximum: 20,
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(20)
  durationSeconds?: number;
}

export class RetryQuestionAudioDto {
  @ApiPropertyOptional({ enum: AudioRetryMode, enumName: 'AudioRetryMode' })
  @IsOptional()
  @IsEnum(AudioRetryMode)
  mode?: AudioRetryMode;
}
