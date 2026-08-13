import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DifficultyLevel } from '../../questions/schemas/question.schema';
import {
  MusicTrackLanguage,
  MusicTrackSource,
} from '../schemas/music-track.schema';

export class MusicTrackResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  _id: string;
  @ApiProperty()
  title: string;
  @ApiPropertyOptional()
  artist?: string;
  @ApiPropertyOptional()
  album?: string;
  @ApiPropertyOptional()
  originalAudioUrl?: string;
  @ApiProperty()
  snippetAudioUrl: string;
  @ApiPropertyOptional()
  artworkUrl?: string;
  @ApiPropertyOptional()
  durationSeconds?: number;
  @ApiPropertyOptional()
  snippetStartSecond?: number;
  @ApiProperty()
  snippetDurationSeconds: number;
  @ApiPropertyOptional({
    enum: MusicTrackLanguage,
    enumName: 'MusicTrackLanguage',
  })
  language?: MusicTrackLanguage;
  @ApiPropertyOptional()
  genre?: string;
  @ApiPropertyOptional({ enum: DifficultyLevel, enumName: 'DifficultyLevel' })
  difficulty?: DifficultyLevel;
  @ApiProperty({ enum: MusicTrackSource, enumName: 'MusicTrackSource' })
  source: MusicTrackSource;
  @ApiProperty()
  isActive: boolean;
  @ApiPropertyOptional({ format: 'date-time' })
  createdAt?: Date;
  @ApiPropertyOptional({ format: 'date-time' })
  updatedAt?: Date;
}

export class MusicTrackListResponseDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: [MusicTrackResponseDto] })
  data!: MusicTrackResponseDto[];
}

export class MusicTrackDetailResponseDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: MusicTrackResponseDto }) data!: MusicTrackResponseDto;
}

export class MusicAnswerValidationDto {
  @ApiProperty() isCorrect!: boolean;
  @ApiProperty() normalizedAnswer!: string;
  @ApiProperty() normalizedCorrectAnswer!: string;
}

export class MusicAnswerValidationResponseDto {
  @ApiProperty({ example: 201 }) statusCode!: number;
  @ApiProperty({ type: MusicAnswerValidationDto })
  data!: MusicAnswerValidationDto;
}
