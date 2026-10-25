import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ENGINE_JOB_STATUSES,
  EngineJobStatus,
} from '../domain/content-engine.constants';
import {
  MAX_BATCH_GUIDANCE_LENGTH,
  RYO_REQUESTED_DIFFICULTIES,
} from '../domain/generation-specification';

export class EnginePreflightRequestDto {
  @ApiProperty({ example: 'read-your-opponent' })
  @IsString()
  @MinLength(1)
  mechanicKey!: string;

  @ApiProperty({ example: 'video-games' })
  @IsString()
  @MinLength(1)
  worldKey!: string;

  @ApiProperty({ example: 'overwatch' })
  @IsString()
  @MinLength(1)
  scopeKey!: string;

  /**
   * Validated against the server's configured generation capacity (`maxBatchSize`)
   * in `EngineJobAdminService`, rejecting counts that exceed capacity rather
   * than silently truncating.
   */
  @ApiProperty({ example: 10, minimum: 1, maximum: 10 })
  @IsInt()
  targetCount!: number;

  @ApiPropertyOptional({
    enum: RYO_REQUESTED_DIFFICULTIES,
    description:
      'Difficulty mode. Initially supported for Read Your Opponent only; deferred for Closest.',
  })
  @IsOptional()
  @IsString()
  difficulty?: string;

  @ApiPropertyOptional({
    maxLength: MAX_BATCH_GUIDANCE_LENGTH,
    description:
      'Optional operator batch guidance (max 1,000 characters), subordinate to canonical authoring rules.',
  })
  @IsOptional()
  @IsString()
  batchGuidance?: string;
}

export class EngineJobRequestDto extends EnginePreflightRequestDto {
  @ApiProperty({
    description:
      'Deterministic plan digest returned by preflight. Submission is rejected if missing or if the plan has drifted.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  planDigest?: string;
}

export class EngineRunRequestDto {
  @ApiProperty({
    description:
      'Exact jobId to execute. Actor identity is always derived from the authenticated Admin.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  jobId?: string;
}

export class EngineJobListQueryDto {
  @ApiPropertyOptional({
    description:
      'Opaque cursor (`jobId`) from the previous page for descending pagination.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 50,
    default: 20,
    description: 'Bounded page size (1..50).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ enum: ENGINE_JOB_STATUSES })
  @IsOptional()
  @IsIn(ENGINE_JOB_STATUSES)
  status?: EngineJobStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  worldKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  scopeKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mechanicKey?: string;
}
