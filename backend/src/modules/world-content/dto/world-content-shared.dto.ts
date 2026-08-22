import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PRESENTATION_IDENTIFIER_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_TIMER_SECONDS = 1;
const MAX_TIMER_SECONDS = 600;
// Bounds a hand-authored explanation to something scannable in ~10-20s, and caps
// the payload. Not product balance — just sane authoring limits.
const MAX_SUMMARY_LENGTH = 240;
const MAX_STEP_LENGTH = 200;
const MAX_STEPS = 8;
const MAX_HIGHLIGHTS = 5;

export class ContentAssetDto {
  @ApiProperty() @IsString() url: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  altText?: string;
}

export class LocalizedTextDto {
  @ApiProperty() @IsString() @MaxLength(500) ar: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) en?: string;
}

/**
 * The player-facing explanation of a mechanic.
 *
 * Every string is trimmed and non-empty: `@MinLength(1)` after `trim` rejects a
 * whitespace-only summary or a blank step row, so a half-filled authoring form
 * cannot persist an empty bullet. The whole object is optional — a legacy
 * ChallengeType has none — but if present its summary and steps must be real.
 */
export class PlayerInstructionsDto {
  @ApiProperty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(MAX_SUMMARY_LENGTH)
  summary: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(MAX_STEPS)
  @IsString({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((step) => (typeof step === 'string' ? step.trim() : step))
      : value,
  )
  @MinLength(1, { each: true })
  @MaxLength(MAX_STEP_LENGTH, { each: true })
  steps: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_HIGHLIGHTS)
  @IsString({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((entry) => (typeof entry === 'string' ? entry.trim() : entry))
      : value,
  )
  @MinLength(1, { each: true })
  @MaxLength(MAX_STEP_LENGTH, { each: true })
  highlights?: string[];
}

/** How a mechanic presents itself. Media belongs to the ContentItem, not here. */
export class ChallengePresentationDto {
  @ApiProperty({ example: 'phone-multiple-choice' })
  @IsString()
  @Matches(PRESENTATION_IDENTIFIER_REGEX)
  @MaxLength(40)
  inputType: string;

  @ApiProperty({ nullable: true, minimum: MIN_TIMER_SECONDS })
  @IsOptional()
  @IsInt()
  @Min(MIN_TIMER_SECONDS)
  @Max(MAX_TIMER_SECONDS)
  timerSeconds: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(PRESENTATION_IDENTIFIER_REGEX)
  @MaxLength(40)
  soundPack?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(PRESENTATION_IDENTIFIER_REGEX)
  @MaxLength(40)
  revealStyle?: string | null;

  @ApiPropertyOptional({ type: PlayerInstructionsDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlayerInstructionsDto)
  playerInstructions?: PlayerInstructionsDto | null;
}
