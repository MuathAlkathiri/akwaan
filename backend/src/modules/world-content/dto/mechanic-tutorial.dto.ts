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
  @ApiPropertyOptional({ enum: ['ryo', 'closest', 'bomb'] })
  @IsOptional()
  @IsIn(['ryo', 'closest', 'bomb'])
  kind?: 'ryo' | 'closest' | 'bomb';

  @ApiPropertyOptional({ enum: [1] })
  @IsOptional()
  @IsIn([1])
  version?: 1;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(400) prompt: string;

  @ApiPropertyOptional({ type: [TutorialOptionDto] })
  @ValidateIf(
    (value: TutorialScenarioDto) => !value.kind || value.kind === 'ryo',
  )
  @IsArray()
  @ArrayMinSize(TUTORIAL_OPTION_COUNT)
  @ArrayMaxSize(TUTORIAL_OPTION_COUNT)
  @ValidateNested({ each: true })
  @Type(() => TutorialOptionDto)
  options?: TutorialOptionDto[];

  @ApiPropertyOptional()
  @ValidateIf(
    (value: TutorialScenarioDto) => !value.kind || value.kind === 'ryo',
  )
  @IsString()
  @MinLength(1)
  correctOptionId?: string;

  @ApiPropertyOptional({
    description: 'The option the answering team is shown picking',
  })
  @ValidateIf(
    (value: TutorialScenarioDto) => !value.kind || value.kind === 'ryo',
  )
  @IsString()
  @MinLength(1)
  answeringSelectionOptionId?: string;

  @ApiPropertyOptional({ enum: ['TRUST', 'STEAL'] })
  @ValidateIf(
    (value: TutorialScenarioDto) => !value.kind || value.kind === 'ryo',
  )
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
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'bomb')
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  acceptedAnswer?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'bomb')
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  nextPrompt?: string;

  @ApiPropertyOptional({ enum: ['team-a', 'team-b'] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'bomb')
  @IsIn(['team-a', 'team-b'])
  startingTeam?: 'team-a' | 'team-b';

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'bomb')
  @IsNumber()
  correctAtSecondsRemaining?: number;

  @ApiPropertyOptional({ enum: [0] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'bomb')
  @IsIn([0])
  opponentExpiresAtSecondsRemaining?: 0;

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
