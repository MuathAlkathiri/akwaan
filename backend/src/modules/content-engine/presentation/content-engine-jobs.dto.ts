import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/** The authorable combination a human picked, nothing more. */
export class EngineJobRequestDto {
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
   * Bounded here as well as in the service. The engine's spending caps are the
   * real protection, but refusing an absurd batch at the edge keeps a typo from
   * reaching the budget at all.
   */
  @ApiProperty({ example: 10, minimum: 1, maximum: 50 })
  @IsInt()
  @Min(1)
  @Max(50)
  targetCount!: number;
}

export class EngineRunRequestDto {
  @ApiPropertyOptional({
    description:
      'Worker identity for the lease. Defaults to the authenticated admin, so a run is always attributable.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  owner?: string;
}
