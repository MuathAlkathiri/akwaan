import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionResponseDto } from '../../questions/dto/question-response.dto';

const difficultyValues = ['easy', 'medium', 'hard'] as const;
const gameModeValues = [
  'trivia',
  'identifyCharacter',
  'identifyVoice',
  'identifyImage',
  'completeQuote',
  'timeline',
  'emojiPuzzle',
  'identifySong',
  'identifySinger',
  'identifyMusicIntro',
] as const;
const assetTypeValues = [
  'text',
  'image',
  'audio',
  'quote',
  'emoji',
  'timeline',
  'video',
  'gif',
] as const;
const assetStatusValues = [
  'NOT_REQUIRED',
  'PENDING',
  'READY',
  'FAILED',
] as const;

export class AiAssetRequestResponseDto {
  @ApiProperty({ enum: assetTypeValues }) type!: string;
  @ApiPropertyOptional({ enum: assetTypeValues }) assetType?: string;
  @ApiPropertyOptional() provider?: string;
  @ApiPropertyOptional() query?: string;
  @ApiPropertyOptional() entity?: string;
  @ApiPropertyOptional() franchise?: string;
  @ApiPropertyOptional() language?: string;
  @ApiPropertyOptional() originalName?: string;
  @ApiPropertyOptional() localizedName?: string;
  @ApiPropertyOptional() englishTitle?: string;
  @ApiPropertyOptional() arabicTitle?: string;
  @ApiPropertyOptional() context?: string;
  @ApiPropertyOptional() entityType?: string;
  @ApiPropertyOptional() visualHint?: string;
  @ApiPropertyOptional() categoryType?: string;
  @ApiPropertyOptional({ enum: ['gameplay', 'decorative'] }) purpose?: string;
  @ApiPropertyOptional() duration?: number;
  @ApiPropertyOptional() speaker?: string;
}

export class AiAssetResponseDto {
  @ApiProperty() localPath!: string;
  @ApiProperty() url!: string;
  @ApiProperty() source!: string;
  @ApiProperty() provider!: string;
  @ApiProperty({ enum: assetTypeValues }) type!: string;
  @ApiPropertyOptional() duration?: number;
  @ApiPropertyOptional() sourceUrl?: string;
  @ApiPropertyOptional() searchQuery?: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  metadata?: Record<string, unknown>;
}

export class AiAgentTraceResponseDto {
  @ApiProperty() agent!: string;
  @ApiProperty({ enum: ['completed', 'failed', 'fallback'] }) status!: string;
  @ApiProperty() durationMs!: number;
  @ApiPropertyOptional() reason?: string;
}

export class AiVerificationDiagnosticsResponseDto {
  @ApiProperty() verificationRequired!: boolean;
  @ApiProperty({ enum: ['wigolo', 'local-knowledge'] })
  verificationProvider!: string;
  @ApiProperty({
    enum: ['VERIFIED', 'PARTIALLY_VERIFIED', 'REJECTED', 'UNAVAILABLE'],
  })
  verificationStatus!: string;
  @ApiProperty() verificationCacheHit!: boolean;
  @ApiProperty() canonicalEntity!: string;
  @ApiProperty() canonicalAnswer!: string;
  @ApiProperty() verifiedAliasesCount!: number;
  @ApiProperty() evidenceSourceCount!: number;
  @ApiProperty() overallConfidence!: number;
  @ApiProperty() identityConfidence!: number;
  @ApiProperty() answerConfidence!: number;
  @ApiProperty() associationConfidence!: number;
  @ApiProperty() verificationDurationMs!: number;
  @ApiProperty({ type: [String] }) verificationIssueCodes!: string[];
  @ApiPropertyOptional() canonicalSongTitle?: string;
  @ApiPropertyOptional() canonicalArtist?: string;
  @ApiPropertyOptional() verifiedFranchise?: string;
}

export class ReviewedQuestionDraftResponseDto {
  @ApiProperty() question!: string;
  @ApiProperty() correctAnswer!: string;
  @ApiProperty({ type: [String] }) wrongAnswers!: string[];
  @ApiProperty({ enum: difficultyValues }) difficulty!: string;
  @ApiProperty({ enum: gameModeValues }) gameMode!: string;
  @ApiProperty({ enum: assetTypeValues }) type!: string;
  @ApiPropertyOptional({ type: AiAssetRequestResponseDto, nullable: true })
  assetRequest?: AiAssetRequestResponseDto | null;
  @ApiProperty({ enum: assetStatusValues }) assetStatus!: string;
  @ApiPropertyOptional({ type: AiAssetResponseDto, nullable: true })
  asset?: AiAssetResponseDto | null;
  @ApiPropertyOptional({ type: AiAssetRequestResponseDto, nullable: true })
  primaryAssetRequest?: AiAssetRequestResponseDto | null;
  @ApiProperty({ enum: assetStatusValues }) primaryAssetStatus!: string;
  @ApiPropertyOptional({ type: AiAssetResponseDto, nullable: true })
  primaryAsset?: AiAssetResponseDto | null;
  @ApiPropertyOptional({ type: AiAssetRequestResponseDto, nullable: true })
  coverImageRequest?: AiAssetRequestResponseDto | null;
  @ApiProperty({ enum: assetStatusValues }) coverImageStatus!: string;
  @ApiPropertyOptional({ type: AiAssetResponseDto, nullable: true })
  coverImage?: AiAssetResponseDto | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  coverImageFailureReason?: string | null;
  @ApiPropertyOptional() assetFailureReason?: string;
  @ApiPropertyOptional() assetFailureStep?: string;
  @ApiPropertyOptional({
    oneOf: [
      { type: 'object', additionalProperties: true },
      {
        type: 'array',
        items: { type: 'object', additionalProperties: true },
      },
    ],
  })
  assetFailureDiagnostics?: Record<string, unknown> | Record<string, unknown>[];
  @ApiPropertyOptional() wasGameplayAutoFixed?: boolean;
  @ApiPropertyOptional() gameplayFixReason?: string;
  @ApiProperty() explanation!: string;
  @ApiProperty() qualityScore!: number;
  @ApiProperty({ type: [String] }) issues!: string[];
  @ApiPropertyOptional({ type: [AiAgentTraceResponseDto] })
  agentTrace?: AiAgentTraceResponseDto[];
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  gameplayMetadata?: Record<string, unknown>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  aiMetadata?: Record<string, unknown>;
  @ApiPropertyOptional({ type: AiVerificationDiagnosticsResponseDto })
  verificationDiagnostics?: AiVerificationDiagnosticsResponseDto;
}

export class ReviewedQuestionsDataResponseDto {
  @ApiProperty({ type: [ReviewedQuestionDraftResponseDto] })
  questions!: ReviewedQuestionDraftResponseDto[];
}

export class GenerateReviewedQuestionsResponseDto {
  @ApiProperty({ example: 201 }) statusCode!: number;
  @ApiProperty() message!: string;
  @ApiProperty() count!: number;
  @ApiProperty({ type: 'object', additionalProperties: true })
  meta!: Record<string, unknown>;
  @ApiProperty({ type: ReviewedQuestionsDataResponseDto })
  data!: ReviewedQuestionsDataResponseDto;
}

export class CandidateValidationResultResponseDto {
  @ApiProperty({ enum: ['PASS', 'FAIL', 'NOT_EVALUATED'] }) status!: string;
  @ApiProperty({ type: [String] }) issueCodes!: string[];
}

export class SourceCandidateDiagnosticResponseDto {
  @ApiProperty() sourceId!: string;
  @ApiProperty() sourceQuestionId!: string;
  @ApiProperty() sourceQuestion!: string;
  @ApiProperty() sourceAnswer!: string;
  @ApiProperty({ type: String, nullable: true }) curatedQuestion!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) curatedAnswer!: string | null;
  @ApiProperty() semanticFingerprint!: string;
  @ApiProperty({ minimum: 0, maximum: 1 }) duplicateScore!: number;
  @ApiProperty({ type: CandidateValidationResultResponseDto })
  validationResult!: CandidateValidationResultResponseDto;
  @ApiProperty({ enum: ['CREATED', 'REJECTED', 'FAILED', 'NOT_SELECTED'] })
  outcome!: string;
  @ApiProperty({ type: String, nullable: true }) rejectionReason!:
    string | null;
}

export class GenerateReviewedQuestionsErrorResponseDto {
  @ApiProperty({ example: 400 }) statusCode!: number;
  @ApiProperty({ example: 'Bad Request' }) error!: string;
  @ApiProperty({ example: 'AI pipeline produced no drafts' }) message!: string;
  @ApiProperty({ type: [String] }) issueCodes!: string[];
  @ApiProperty({ type: 'object', additionalProperties: true })
  meta!: Record<string, unknown>;
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  sourceDiagnostics!: Record<string, unknown>[];
  @ApiProperty({ type: 'object', additionalProperties: true })
  sourceSummary!: Record<string, unknown>;
  @ApiProperty({ type: [SourceCandidateDiagnosticResponseDto] })
  candidateDiagnostics!: SourceCandidateDiagnosticResponseDto[];
}

export class GenerateQuestionsResponseDto {
  @ApiProperty({ example: 200 }) statusCode!: number;
  @ApiProperty() message!: string;
  @ApiProperty() count!: number;
  @ApiProperty({ type: [QuestionResponseDto] }) data!: QuestionResponseDto[];
}

export class AiToolDiagnosticsResponseDto {
  @ApiProperty() ffmpegAvailable!: boolean;
  @ApiProperty() ytDlpAvailable!: boolean;
  @ApiProperty() ffmpegVersion!: string;
  @ApiProperty() ytDlpVersion!: string;
}

export class WigoloHealthResponseDto {
  @ApiProperty({ enum: ['wigolo'] }) provider!: 'wigolo';
  @ApiProperty() enabled!: boolean;
  @ApiProperty({ enum: ['READY', 'DEGRADED', 'UNAVAILABLE'] })
  status!: string;
  @ApiPropertyOptional() version?: string;
  @ApiPropertyOptional({
    enum: ['project-local', 'configured', 'executable-path', 'path'],
  })
  installationType?: string;
  @ApiPropertyOptional({ enum: ['stdio'] }) transport?: string;
  @ApiProperty() requiredToolsAvailable!: boolean;
  @ApiProperty() cacheAvailable!: boolean;
  @ApiProperty() lastCheckedAt!: string;
  @ApiProperty({ type: [String] }) issueCodes!: string[];
}

export class SaveDraftFailureDto {
  @ApiProperty({ minimum: 0 }) index!: number;
  @ApiProperty() reason!: string;
}

export class SaveReviewedDraftsResponseDto {
  @ApiProperty({ minimum: 0 }) savedCount!: number;
  @ApiProperty({ minimum: 0 }) failedCount!: number;
  @ApiProperty({ type: [QuestionResponseDto] })
  savedQuestions!: QuestionResponseDto[];
  @ApiProperty({ type: [SaveDraftFailureDto] })
  failures!: SaveDraftFailureDto[];
}
