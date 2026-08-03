import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PRESENTATION_IDENTIFIER_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_TIMER_SECONDS = 1;
const MAX_TIMER_SECONDS = 600;

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
}
