import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AudioAssetStatus,
  AudioQuestionKind,
  AudioReviewStatus,
  AudioCandidateStatus,
  AssetStatus,
  DifficultyLevel,
  GameMode,
  QuestionAssetType,
  QuestionSource,
  QuestionStatus,
  QuestionGameplayType,
} from '../schemas/question.schema';
import {
  QuestionAudioRequestDto,
  LocalizedQuestionTextDto,
  RankedListDefinitionDto,
} from './create-question.dto';

export class QuestionAssetResponseDto {
  @ApiProperty({ enum: QuestionAssetType, enumName: 'QuestionAssetType' })
  type!: QuestionAssetType;
  @ApiProperty() url!: string;
  @ApiProperty() source!: string;
  @ApiPropertyOptional() sourceUrl?: string;
  @ApiPropertyOptional() searchQuery?: string;
  @ApiPropertyOptional() provider?: string;
  @ApiPropertyOptional() duration?: number;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  metadata?: Record<string, unknown>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  duplicateDiagnostics?: Record<string, unknown>;
}

export class ResolvedQuestionMediaResponseDto {
  @ApiProperty({ enum: ['image', 'audio', 'video'] })
  type!: 'image' | 'audio' | 'video';
  @ApiProperty() url!: string;
  @ApiPropertyOptional() duration?: number;
}

export class QuestionAudioCandidateResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional() sourceUrl?: string;
  @ApiProperty() provider!: string;
  @ApiPropertyOptional() durationSeconds?: number;
  @ApiPropertyOptional() thumbnail?: string;
  @ApiProperty() queryUsed!: string;
  @ApiProperty() rank!: number;
  @ApiProperty({ enum: AudioCandidateStatus, enumName: 'AudioCandidateStatus' })
  status!: AudioCandidateStatus;
  @ApiPropertyOptional() rejectionReason?: string;
  @ApiProperty() requestVersion!: number;
  @ApiProperty() requestHash!: string;
}

export class QuestionAudioCandidatesResponseDto {
  @ApiProperty({ type: [QuestionAudioCandidateResponseDto] })
  data!: QuestionAudioCandidateResponseDto[];
}

export class QuestionResponseDto {
  @ApiProperty() _id!: string;
  @ApiPropertyOptional() id?: string;
  @ApiPropertyOptional() category?: string;
  @ApiPropertyOptional() categoryId?: string;
  @ApiProperty() question!: string;
  @ApiProperty({
    enum: QuestionGameplayType,
    enumName: 'QuestionGameplayType',
  })
  questionType!: QuestionGameplayType;
  @ApiPropertyOptional({ type: LocalizedQuestionTextDto })
  text?: LocalizedQuestionTextDto;
  @ApiPropertyOptional() maxPoints?: number;
  @ApiPropertyOptional() turnDurationSeconds?: number;
  @ApiPropertyOptional() maxStrikesPerTeam?: number;
  @ApiPropertyOptional({ type: RankedListDefinitionDto })
  rankedList?: RankedListDefinitionDto;
  @ApiPropertyOptional() answer?: string;
  @ApiPropertyOptional() correctAnswer?: string;
  @ApiProperty({ type: [String] }) wrongAnswers!: string[];
  @ApiPropertyOptional({ type: [String] }) acceptedAnswers?: string[];
  @ApiPropertyOptional() explanation?: string;
  @ApiProperty({ enum: DifficultyLevel, enumName: 'DifficultyLevel' })
  difficulty!: DifficultyLevel;
  @ApiPropertyOptional({ enum: [200, 400, 600] }) points?: number;
  @ApiPropertyOptional({ enum: [200, 400, 600] }) score?: number;
  @ApiPropertyOptional({ enum: GameMode, enumName: 'GameMode' })
  gameMode?: GameMode;
  @ApiPropertyOptional() type?: string;
  @ApiPropertyOptional({ enum: ['text', 'image', 'audio', 'video', 'gif'] })
  preferredPresentationType?: string;
  @ApiPropertyOptional({ enum: ['text', 'image', 'audio', 'video'] })
  effectivePresentationType?: 'text' | 'image' | 'audio' | 'video';
  @ApiPropertyOptional() mediaAvailable?: boolean;
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
    nullable: true,
  })
  mediaFallbackReason?: string | null;
  @ApiPropertyOptional({
    type: ResolvedQuestionMediaResponseDto,
    nullable: true,
  })
  resolvedMedia?: ResolvedQuestionMediaResponseDto | null;
  @ApiProperty({ enum: QuestionStatus, enumName: 'QuestionStatus' })
  status!: QuestionStatus;
  @ApiProperty({ enum: QuestionSource, enumName: 'QuestionSource' })
  source!: QuestionSource;
  @ApiPropertyOptional({ type: QuestionAssetResponseDto, nullable: true })
  primaryAsset?: QuestionAssetResponseDto | null;
  @ApiProperty({ default: false }) requiresAudio!: boolean;
  @ApiPropertyOptional({
    enum: AudioQuestionKind,
    enumName: 'AudioQuestionKind',
  })
  audioKind?: AudioQuestionKind;
  @ApiPropertyOptional({ type: QuestionAudioRequestDto, nullable: true })
  audioRequest?: QuestionAudioRequestDto | null;
  @ApiPropertyOptional({ type: [QuestionAudioCandidateResponseDto] })
  audioCandidates?: QuestionAudioCandidateResponseDto[];
  @ApiProperty({ enum: AudioAssetStatus, enumName: 'AudioAssetStatus' })
  audioStatus!: AudioAssetStatus;
  @ApiPropertyOptional({ type: QuestionAssetResponseDto, nullable: true })
  audioAsset?: QuestionAssetResponseDto | null;
  @ApiPropertyOptional({
    enum: AudioReviewStatus,
    enumName: 'AudioReviewStatus',
  })
  audioReviewStatus?: AudioReviewStatus | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  audioDiagnostics?: Record<string, unknown> | null;
  @ApiPropertyOptional() audioRequestStale?: boolean;
  @ApiPropertyOptional({ type: QuestionAssetResponseDto, nullable: true })
  coverImage?: QuestionAssetResponseDto | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  primaryAssetRequest?: Record<string, unknown> | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  coverImageRequest?: Record<string, unknown> | null;
  @ApiPropertyOptional({ enum: AssetStatus, enumName: 'AssetStatus' })
  coverImageStatus?: AssetStatus;
  @ApiPropertyOptional() coverImageFailureReason?: string;
  @ApiPropertyOptional({ enum: AssetStatus, enumName: 'AssetStatus' })
  assetStatus?: AssetStatus;
  @ApiPropertyOptional() assetFailureReason?: string;
  @ApiPropertyOptional() assetFailureStep?: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  assetFailureDiagnostics?: Record<string, unknown>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  gameplayMetadata?: Record<string, unknown>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  aiMetadata?: Record<string, unknown>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  metadata?: Record<string, unknown>;
  @ApiPropertyOptional() mediaUrl?: string;
  @ApiPropertyOptional() hasPreviewAudio?: boolean;
  @ApiPropertyOptional() isFreeGameQuestion?: boolean;
  @ApiPropertyOptional() qualityScore?: number;
  @ApiPropertyOptional({ type: [String] }) issues?: string[];
  @ApiPropertyOptional({ format: 'date-time' }) createdAt?: string;
  @ApiPropertyOptional({ format: 'date-time' }) updatedAt?: string;
}

export class QuestionListResponseDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: [QuestionResponseDto] }) data!: QuestionResponseDto[];
}

export class QuestionDetailResponseDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty({ type: QuestionResponseDto }) data!: QuestionResponseDto;
}

export class QuestionMutationResponseDto extends QuestionDetailResponseDto {
  @ApiProperty() message!: string;
}

export class BulkQuestionActionResponseDto {
  @ApiProperty() modifiedCount!: number;
}
