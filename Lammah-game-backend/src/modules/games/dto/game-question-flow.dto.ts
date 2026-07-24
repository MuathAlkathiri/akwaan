import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsMongoId, ValidateIf } from 'class-validator';
import {
  GameQuestionPresentationResponseDto,
  GameTeamResponseDto,
} from './game-response.dto';

export class GameQuestionCategoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class GameQuestionViewResponseDto {
  @ApiProperty() gameId!: string;
  @ApiProperty() gameQuestionId!: string;
  @ApiProperty() sourceQuestionId!: string;
  @ApiProperty({ type: GameQuestionCategoryResponseDto })
  category!: GameQuestionCategoryResponseDto;
  @ApiProperty({ enum: [200, 400, 600] }) points!: 200 | 400 | 600;
  @ApiProperty() question!: string;
  @ApiProperty({ enum: ['standard', 'ranked_list'] })
  questionType!: 'standard' | 'ranked_list';
  @ApiProperty() isAnswered!: boolean;
  @ApiProperty() isAnswerRevealed!: boolean;
  @ApiPropertyOptional({ type: GameQuestionPresentationResponseDto })
  presentation?: GameQuestionPresentationResponseDto;
}

export class GameQuestionAnswerResponseDto extends GameQuestionViewResponseDto {
  @ApiProperty() answer!: string;
  @ApiPropertyOptional({ type: [String] }) acceptedAnswers?: string[];
  @ApiPropertyOptional() explanation?: string;
  @ApiProperty({ type: [GameTeamResponseDto] })
  teams!: GameTeamResponseDto[];
  @ApiPropertyOptional() answeredByTeamId?: string;
  @ApiPropertyOptional() awardedPoints?: number;
}

export class GameQuestionViewEnvelopeDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: GameQuestionViewResponseDto })
  data!: GameQuestionViewResponseDto;
}

export class GameQuestionAnswerEnvelopeDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: GameQuestionAnswerResponseDto })
  data!: GameQuestionAnswerResponseDto;
}

export class SubmitGameQuestionResultDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Answering team ID, or null when no team answered.',
  })
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsMongoId({ message: 'Team ID must be a valid MongoDB ID or null' })
  teamId!: string | null;
}
