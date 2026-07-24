import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryResponseDto } from '../../categories/dto/category-response.dto';
import { QuestionResponseDto } from '../../questions/dto/question-response.dto';

export class GameTeamResponseDto {
  @ApiPropertyOptional() _id?: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: [String] }) members!: string[];
  @ApiProperty() score!: number;
}

export class GameQuestionPresentationResponseDto {
  @ApiProperty({ enum: ['text', 'image', 'audio', 'video', 'gif'] })
  preferredType!: 'text' | 'image' | 'audio' | 'video' | 'gif';
  @ApiProperty({ enum: ['text', 'image', 'audio', 'video'] })
  type!: 'text' | 'image' | 'audio' | 'video';
  @ApiProperty() mediaAvailable!: boolean;
  @ApiPropertyOptional() mediaUrl?: string;
  @ApiPropertyOptional() mediaDuration?: number;
  @ApiPropertyOptional({
    enum: [
      'NO_MEDIA',
      'NOT_READY',
      'PROCESSING',
      'FAILED',
      'REJECTED',
      'STALE',
      'MISSING_ASSET',
      'INVALID_ASSET',
    ],
  })
  fallbackReason?: string;
}

export class GameBoardQuestionResponseDto {
  @ApiPropertyOptional() _id?: string;
  @ApiProperty({ type: QuestionResponseDto })
  question!: QuestionResponseDto;
  @ApiProperty({ enum: [200, 400, 600] }) points!: 200 | 400 | 600;
  @ApiProperty() isAnswered!: boolean;
  @ApiProperty() isAnswerRevealed!: boolean;
  @ApiPropertyOptional() answeredByTeamIndex?: number;
  @ApiPropertyOptional() awardedPoints?: number;
  @ApiPropertyOptional({ type: GameQuestionPresentationResponseDto })
  presentation?: GameQuestionPresentationResponseDto;
}

export class GameCategoryBoardResponseDto {
  @ApiProperty({ type: CategoryResponseDto })
  category!: CategoryResponseDto;
  @ApiProperty({ type: [GameBoardQuestionResponseDto] })
  questions!: GameBoardQuestionResponseDto[];
}

export class GameResponseDto {
  @ApiProperty() _id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['waiting', 'active', 'finished'] }) status!: string;
  @ApiProperty({ type: [GameTeamResponseDto] }) teams!: GameTeamResponseDto[];
  @ApiProperty({ type: [CategoryResponseDto] })
  selectedCategories!: CategoryResponseDto[];
  @ApiProperty({ type: [GameCategoryBoardResponseDto] })
  board!: GameCategoryBoardResponseDto[];
  @ApiProperty() currentTurnTeamIndex!: number;
  @ApiPropertyOptional() finishedAt?: string;
  @ApiPropertyOptional() createdAt?: string;
  @ApiPropertyOptional() updatedAt?: string;
}

export class GameListResponseDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: [GameResponseDto] }) data!: GameResponseDto[];
}

export class GameDetailResponseDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: GameResponseDto }) data!: GameResponseDto;
}

export class GameMutationResponseDto extends GameDetailResponseDto {
  @ApiProperty() message!: string;
}

export class GameCreationValidationDetailDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiProperty() categoryId!: string;
  @ApiPropertyOptional() catalogId?: string;
  @ApiProperty({ enum: ['STANDARD', 'TOP_10'] })
  gameplayMode!: 'STANDARD' | 'TOP_10';
  @ApiPropertyOptional() questionId?: string;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  requiredCounts?: Record<string, number>;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  actualCounts?: Record<string, number>;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  pointDistribution?: Record<string, number>;
}

export class GameCreationValidationErrorDto {
  @ApiProperty({ example: 400 }) statusCode!: number;
  @ApiProperty({ example: 'Bad Request' }) error!: string;
  @ApiProperty({ example: 'STANDARD_MISSING_200_QUESTIONS' }) code!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ type: [String] }) issueCodes!: string[];
  @ApiProperty({ type: [GameCreationValidationDetailDto] })
  details!: GameCreationValidationDetailDto[];
}
