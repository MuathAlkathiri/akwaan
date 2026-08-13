import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { DifficultyLevel } from '../../questions/schemas/question.schema';
import { MusicTrackLanguage } from '../schemas/music-track.schema';

export class UploadMusicTrackDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  artist?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  album?: string;

  @ApiPropertyOptional({
    enum: MusicTrackLanguage,
    enumName: 'MusicTrackLanguage',
  })
  @IsOptional()
  @IsEnum(MusicTrackLanguage)
  language?: MusicTrackLanguage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  genre?: string;

  @ApiPropertyOptional({ enum: DifficultyLevel, enumName: 'DifficultyLevel' })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficulty?: DifficultyLevel;

  @ApiPropertyOptional({ minimum: 10, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(20)
  snippetDurationSeconds?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  snippetStartSecond?: number;
}

export class UpdateMusicTrackDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  artist?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  album?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  artworkUrl?: string;

  @ApiPropertyOptional({
    enum: MusicTrackLanguage,
    enumName: 'MusicTrackLanguage',
  })
  @IsOptional()
  @IsEnum(MusicTrackLanguage)
  language?: MusicTrackLanguage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  genre?: string;

  @ApiPropertyOptional({ enum: DifficultyLevel, enumName: 'DifficultyLevel' })
  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficulty?: DifficultyLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class ValidateMusicQuestionAnswerDto {
  @ApiProperty()
  @IsMongoId({ message: 'questionId must be a valid MongoDB ID' })
  questionId: string;

  @ApiProperty()
  @IsString({ message: 'Answer must be a string' })
  @MinLength(1, { message: 'Answer is required' })
  answer: string;
}
