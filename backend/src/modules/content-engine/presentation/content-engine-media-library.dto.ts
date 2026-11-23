import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { BOMB_IMAGE_KINDS } from '../domain/candidate-media-intent';

/** Multipart fields sent beside the image when adding a library picture. */
export class MediaLibraryEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameAr?: string;

  /** Other names the subject goes by, separated by commas or new lines. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aliases?: string;

  @IsOptional()
  @IsIn([...BOMB_IMAGE_KINDS])
  kind?: string;
}
