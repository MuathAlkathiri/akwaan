import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ReviewCandidateQueryDto {
  @IsOptional() @IsString() jobId?: string;
  @IsOptional() @IsString() worldKey?: string;
  @IsOptional() @IsString() scopeKey?: string;
  @IsOptional() @IsString() status?: string;
}

export class CandidateEditDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsObject() draft!: Record<string, unknown>;
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  factualClaims!: string[];
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  explanation!: string;
}

export class ReviewEvidenceDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  claimIndex?: number;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  claimText?: string;

  @Transform(trimString)
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class QualityRubricDto {
  @IsInt() @Min(1) @Max(5) correctness!: number;
  @IsInt() @Min(1) @Max(5) mechanicFit!: number;
  @IsInt() @Min(1) @Max(5) clarity!: number;
  @IsInt() @Min(1) @Max(5) multiplayerFit!: number;
  @IsInt() @Min(1) @Max(5) originality!: number;
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  explanation!: string;
}

export class CandidateAssessmentDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsIn(['SUPPORTED', 'UNSUPPORTED', 'CONTRADICTED', 'UNRESOLVED'])
  factualState!: 'SUPPORTED' | 'UNSUPPORTED' | 'CONTRADICTED' | 'UNRESOLVED';
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  factualExplanation!: string;
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ReviewEvidenceDto)
  evidence!: ReviewEvidenceDto[];
  @ValidateNested() @Type(() => QualityRubricDto) quality!: QualityRubricDto;
}

export class CandidateApprovalDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  explanation!: string;
  @IsOptional()
  @IsIn([
    'ACCEPTED_WITH_EVIDENCE',
    'CLAIM_NOT_ANSWER_CRITICAL',
    'CLAIM_CORRECTED',
  ])
  factualOverrideCode?:
    'ACCEPTED_WITH_EVIDENCE' | 'CLAIM_NOT_ANSWER_CRITICAL' | 'CLAIM_CORRECTED';
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  factualOverrideExplanation?: string;
}

export class CandidateRejectionDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsIn([
    'FACTUAL_ERROR',
    'UNSUPPORTED_CLAIM',
    'MECHANIC_MISMATCH',
    'SCOPE_MISMATCH',
    'DUPLICATE',
    'LOW_QUALITY',
    'UNSAFE_OR_INAPPROPRIATE',
    'OTHER',
  ])
  reasonCode!: string;
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  explanation!: string;
}

export class CreateCandidateDraftDto {
  @IsInt() @Min(0) expectedRevision!: number;
}
