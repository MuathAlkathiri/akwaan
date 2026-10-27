import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
  ValidateIf,
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
  @ApiPropertyOptional({ enum: ['ryo', 'closest'] })
  @IsOptional()
  @IsIn(['ryo', 'closest'])
  kind?: 'ryo' | 'closest';

  @ApiPropertyOptional({ enum: [1] })
  @IsOptional()
  @IsIn([1])
  version?: 1;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(400) prompt: string;

  @ApiPropertyOptional({ type: [TutorialOptionDto] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind !== 'closest')
  @IsArray()
  @ArrayMinSize(TUTORIAL_OPTION_COUNT)
  @ArrayMaxSize(TUTORIAL_OPTION_COUNT)
  @ValidateNested({ each: true })
  @Type(() => TutorialOptionDto)
  options?: TutorialOptionDto[];

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind !== 'closest')
  @IsString()
  @MinLength(1)
  correctOptionId?: string;

  @ApiPropertyOptional({
    description: 'The option the answering team is shown picking',
  })
  @ValidateIf((value: TutorialScenarioDto) => value.kind !== 'closest')
  @IsString()
  @MinLength(1)
  answeringSelectionOptionId?: string;

  @ApiPropertyOptional({ enum: ['TRUST', 'STEAL'] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind !== 'closest')
  @IsIn(['TRUST', 'STEAL'])
  opposingDecision?: 'TRUST' | 'STEAL';

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'closest')
  @IsNumber()
  teamAEstimate?: number;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'closest')
  @IsNumber()
  teamBEstimate?: number;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'closest')
  @IsNumber()
  correctValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;
}
