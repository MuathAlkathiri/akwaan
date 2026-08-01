import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsString, Min, MinLength } from 'class-validator';

export class StartRankedListRoundDto {
  @ApiProperty()
  @IsMongoId()
  questionId!: string;
}

export class SubmitRankedListAnswerDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  answer!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedTurnSequence!: number;
}

export class ExpireRankedListTurnDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedTurnSequence!: number;
}

export class RankedListRoundTeamResponseDto {
  @ApiProperty() teamId!: string;
  @ApiProperty() teamIndex!: number;
  @ApiProperty() name!: string;
  @ApiProperty() strikes!: number;
  @ApiProperty() temporaryScore!: number;
  @ApiProperty() eliminated!: boolean;
}

export class RankedListRoundEntryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() rank!: number;
  @ApiProperty() points!: number;
  @ApiProperty() revealed!: boolean;
  @ApiPropertyOptional() answer?: string;
  @ApiPropertyOptional() answerEn?: string;
  @ApiPropertyOptional() claimedByTeamId?: string;
  @ApiPropertyOptional() submittedAnswer?: string;
  @ApiPropertyOptional({ format: 'date-time' }) revealedAt?: string;
}

export class RankedListRoundOutcomeResponseDto {
  @ApiProperty({ enum: ['winner', 'tie'] }) type!: 'winner' | 'tie';
  @ApiPropertyOptional() winnerTeamId?: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  awardedPointsByTeam!: Record<string, number>;
}

export class RankedListRoundStateResponseDto {
  @ApiProperty() questionId!: string;
  @ApiProperty({ enum: ['active', 'completed'] })
  status!: 'active' | 'completed';
  @ApiProperty() activeTeamId!: string;
  @ApiProperty() activeTeamIndex!: number;
  @ApiProperty({ format: 'date-time' }) turnStartedAt!: string;
  @ApiProperty({ format: 'date-time' }) turnExpiresAt!: string;
  @ApiProperty() turnSequence!: number;
  @ApiProperty() turnDurationSeconds!: number;
  @ApiProperty() maxStrikesPerTeam!: number;
  @ApiProperty({ minimum: 0, maximum: 600 }) collectedScore!: number;
  @ApiProperty({ type: [RankedListRoundTeamResponseDto] })
  teams!: RankedListRoundTeamResponseDto[];
  @ApiProperty({ type: [RankedListRoundEntryResponseDto] })
  entries!: RankedListRoundEntryResponseDto[];
  @ApiPropertyOptional({ type: RankedListRoundOutcomeResponseDto })
  outcome?: RankedListRoundOutcomeResponseDto;
}

export class RankedListMatchedEntryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() rank!: number;
  @ApiProperty() answer!: string;
  @ApiProperty() points!: number;
}

export class RankedListRoundActionResponseDto {
  @ApiProperty({
    enum: [
      'started',
      'correct',
      'incorrect',
      'already_discovered',
      'timeout',
      'round_completed',
      'stale_turn',
    ],
  })
  outcome!:
    | 'started'
    | 'correct'
    | 'incorrect'
    | 'already_discovered'
    | 'timeout'
    | 'round_completed'
    | 'stale_turn';
  @ApiPropertyOptional() strikeApplied?: boolean;
  @ApiPropertyOptional({ type: RankedListMatchedEntryResponseDto })
  matchedEntry?: RankedListMatchedEntryResponseDto;
  @ApiProperty({ type: RankedListRoundStateResponseDto })
  state!: RankedListRoundStateResponseDto;
  @ApiPropertyOptional({ type: RankedListRoundOutcomeResponseDto })
  result?: RankedListRoundOutcomeResponseDto;
}

export class RankedListRoundActionEnvelopeDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: RankedListRoundActionResponseDto })
  data!: RankedListRoundActionResponseDto;
}

export class RankedListRoundStateEnvelopeDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: RankedListRoundStateResponseDto })
  data!: RankedListRoundStateResponseDto;
}
