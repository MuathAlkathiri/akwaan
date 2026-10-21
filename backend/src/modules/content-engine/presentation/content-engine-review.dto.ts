import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

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
  @IsString() @MaxLength(1000) explanation!: string;
}

export class ReviewEvidenceDto {
  @IsUrl({ require_protocol: true }) @MaxLength(2000) url!: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class QualityRubricDto {
  @IsInt() @Min(1) @Max(5) correctness!: number;
  @IsInt() @Min(1) @Max(5) mechanicFit!: number;
  @IsInt() @Min(1) @Max(5) clarity!: number;
  @IsInt() @Min(1) @Max(5) multiplayerFit!: number;
  @IsInt() @Min(1) @Max(5) originality!: number;
  @IsString() @MaxLength(2000) explanation!: string;
}

export class CandidateAssessmentDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsIn(['SUPPORTED', 'UNSUPPORTED', 'CONTRADICTED', 'UNRESOLVED'])
  factualState!: 'SUPPORTED' | 'UNSUPPORTED' | 'CONTRADICTED' | 'UNRESOLVED';
  @IsString() @MaxLength(2000) factualExplanation!: string;
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ReviewEvidenceDto)
  evidence!: ReviewEvidenceDto[];
  @ValidateNested() @Type(() => QualityRubricDto) quality!: QualityRubricDto;
}

export class CandidateApprovalDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsString() @MaxLength(2000) explanation!: string;
  @IsOptional()
  @IsIn([
    'ACCEPTED_WITH_EVIDENCE',
    'CLAIM_NOT_ANSWER_CRITICAL',
    'CLAIM_CORRECTED',
  ])
  factualOverrideCode?:
    'ACCEPTED_WITH_EVIDENCE' | 'CLAIM_NOT_ANSWER_CRITICAL' | 'CLAIM_CORRECTED';
  @IsOptional()
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
  @IsString() @MaxLength(2000) explanation!: string;
}

export class CreateCandidateDraftDto {
  @IsInt() @Min(0) expectedRevision!: number;
}
