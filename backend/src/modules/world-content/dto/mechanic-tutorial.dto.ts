import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TUTORIAL_OPTION_COUNT } from '../domain/mechanic-tutorial.policy';

export class TutorialOptionDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(40) id: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) label: string;
}

/**
 * What an editor may send.
 *
 * Note what is absent: `outcome`. The score a tutorial demonstrates is derived
 * from the real payoff rule server-side, so there is no field through which a
 * client could assert a result the game would not actually produce.
 */
export class TutorialScenarioDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(400) prompt: string;

  @ApiProperty({ type: [TutorialOptionDto] })
  @IsArray()
  @ArrayMinSize(TUTORIAL_OPTION_COUNT)
  @ArrayMaxSize(TUTORIAL_OPTION_COUNT)
  @ValidateNested({ each: true })
  @Type(() => TutorialOptionDto)
  options: TutorialOptionDto[];

  @ApiProperty() @IsString() @MinLength(1) correctOptionId: string;

  @ApiProperty({ description: 'The option the answering team is shown picking' })
  @IsString()
  @MinLength(1)
  answeringSelectionOptionId: string;

  @ApiProperty({ enum: ['TRUST', 'STEAL'] })
  @IsIn(['TRUST', 'STEAL'])
  opposingDecision: 'TRUST' | 'STEAL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;
}
