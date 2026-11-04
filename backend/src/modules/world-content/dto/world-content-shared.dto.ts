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
/**
 * A media URL Akwaan will hand to a browser.
 *
 * Two shapes are accepted and nothing else: a first-party `/uploads/<key>`
 * path, which is what every upload produces, or an absolute `http(s)` URL,
 * which existing authored content and several mechanics' fixtures rely on.
 *
 * What this rejects is everything that is not a fetchable media address —
 * `javascript:`, `data:`, `file:`, bare words, and anything over the cap. It
 * deliberately does **not** restrict the host: an audio-only first-party rule
 * is the right end state, but it cannot be enforced yet without evidence about
 * existing authored content, so it is deferred rather than guessed at.
 */
const MEDIA_URL_PATTERN = /^(?:\/(?!\/)[^\s]*|https?:\/\/[^\s]+)$/i;
const MAX_MEDIA_URL_LENGTH = 2048;

export class ContentAssetDto {
  @ApiProperty()
  @IsString()
  @MaxLength(MAX_MEDIA_URL_LENGTH)
  @Matches(MEDIA_URL_PATTERN, {
    message:
      'url must be a first-party /uploads path or an absolute http(s) URL',
  })
  url: string;
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
