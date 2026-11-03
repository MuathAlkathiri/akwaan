import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export class EkshifniTutorialShapeDto {
  @ApiProperty({ minimum: 0, maximum: 1 }) @IsNumber() x: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) @IsNumber() y: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) @IsNumber() width: number;
  @ApiProperty({ minimum: 0, maximum: 1 }) @IsNumber() height: number;
}

export class EkshifniTutorialRegionDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(40) id: string;
  @ApiProperty({ enum: [1, 2, 3, 4, 5, 6] }) @IsIn([1, 2, 3, 4, 5, 6]) number:
    1 | 2 | 3 | 4 | 5 | 6;
  @ApiProperty({ type: EkshifniTutorialShapeDto })
  @ValidateNested()
  @Type(() => EkshifniTutorialShapeDto)
  shape: EkshifniTutorialShapeDto;
}

export class EkshifniTutorialImageDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) url: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(240) altText: string;
  @ApiProperty() @IsString() @MinLength(64) @MaxLength(64) sha256: string;
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  provenanceNote: string;
}

export class Top5TutorialEntryDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) id: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) label: string;
  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsNumber()
  rank: number | null;
}

export class Top5TutorialDecisionDto {
  @ApiProperty({ enum: ['keep', 'give'] })
  @IsIn(['keep', 'give'])
  action: 'keep' | 'give';
}

export class ComboTutorialStageDto {
  @ApiProperty({ enum: [1, 2, 3] })
  @IsIn([1, 2, 3])
  stage: 1 | 2 | 3;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(400) prompt: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  correctAnswer: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  submittedAnswer: string;
}

export class LaqathaTutorialClueDto {
  @ApiProperty({ enum: [1, 2, 3, 4, 5] })
  @IsIn([1, 2, 3, 4, 5])
  order: 1 | 2 | 3 | 4 | 5;

  @ApiProperty({ enum: [5, 4, 3, 2, 1] })
  @IsIn([5, 4, 3, 2, 1])
  value: 5 | 4 | 3 | 2 | 1;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  text: string;
}

export class FirstNoteTutorialBidDto {
  @ApiProperty({ enum: ['team-a', 'team-b'] })
  @IsIn(['team-a', 'team-b'])
  team: 'team-a' | 'team-b';

  @ApiProperty({ minimum: 1, maximum: 15 })
  @IsNumber()
  seconds: number;
}

export class LaTahriqhaTutorialIngredientDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) id: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) label: string;
  @ApiProperty() @IsBoolean() correct: boolean;
}

export class LaTahriqhaTutorialDishDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) id: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) name: string;
  @ApiProperty({ type: [LaTahriqhaTutorialIngredientDto] })
  @IsArray()
  @ArrayMinSize(8)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => LaTahriqhaTutorialIngredientDto)
  ingredients: LaTahriqhaTutorialIngredientDto[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  teamASelection: string[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  teamBSelection: string[];
}

export class LaTahriqhaTutorialCaptainRotationDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  teamA: string[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  teamB: string[];
}

export class OddPieceTutorialMediaDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) imageUrl: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(240) altText: string;
}

export class OddPieceTutorialPieceDto extends OddPieceTutorialMediaDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) id: string;
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  vehicleIdentity: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(160) vehicleLabel: string;
}

export class OddPieceTutorialAssetDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) url: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  path?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  filename?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimetype?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() size?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  altText?: string;
}

export class OddPieceTutorialImageMediaDto {
  @ApiProperty({ enum: ['image'] })
  @IsIn(['image'])
  type: 'image';

  @ApiProperty({ type: [OddPieceTutorialAssetDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @ValidateNested({ each: true })
  @Type(() => OddPieceTutorialAssetDto)
  assets: OddPieceTutorialAssetDto[];
}

export class OddPieceTutorialProvenanceDto {
  @ApiProperty({ enum: ['authentic', 'ai-edited'] })
  @IsIn(['authentic', 'ai-edited'])
  assetOrigin: 'authentic' | 'ai-edited';

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) sourceUrl: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  licenceNote?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  editedRegion?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  editModel?: string;
}

export class OddPieceTutorialHotspotImageDto {
  @ApiProperty({ type: OddPieceTutorialImageMediaDto })
  @ValidateNested()
  @Type(() => OddPieceTutorialImageMediaDto)
  media: OddPieceTutorialImageMediaDto;

  @ApiProperty() @IsNumber() width: number;
  @ApiProperty() @IsNumber() height: number;
  @ApiProperty({ enum: ['landscape', 'portrait', 'square'] })
  @IsIn(['landscape', 'portrait', 'square'])
  orientation: 'landscape' | 'portrait' | 'square';

  @ApiProperty({ type: OddPieceTutorialProvenanceDto })
  @ValidateNested()
  @Type(() => OddPieceTutorialProvenanceDto)
  provenance: OddPieceTutorialProvenanceDto;
}

export class OddPieceTutorialPointDto {
  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  x: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  @IsNumber()
  y: number;
}

export class OddPieceTutorialHotspotDto {
  @ApiProperty({ type: [OddPieceTutorialPointDto] })
  @IsArray()
  @ArrayMinSize(3)
  @ValidateNested({ each: true })
  @Type(() => OddPieceTutorialPointDto)
  polygon: OddPieceTutorialPointDto[];

  @ApiProperty({ minimum: 0, maximum: 0.25 })
  @IsNumber()
  tolerance: number;
}

/**
 * What an editor may send.
 *
 * Note what is absent: `outcome`. The score a tutorial demonstrates is derived
 * from the real payoff rule server-side, so there is no field through which a
 * client could assert a result the game would not actually produce.
 */
export class TutorialScenarioDto {
  @ApiPropertyOptional({
    enum: [
      'ryo',
      'closest',
      'bomb',
      'one-clue',
      'top-5',
      'combo',
      'marhala',
      'laqatha',
      'first-note',
      'la-tahriqha',
      'odd-piece',
      'ekshifni',
    ],
  })
  @IsOptional()
  @IsIn([
    'ryo',
    'closest',
    'bomb',
    'one-clue',
    'top-5',
    'combo',
    'marhala',
    'laqatha',
    'first-note',
    'la-tahriqha',
    'odd-piece',
    'ekshifni',
  ])
  kind?:
    | 'ryo'
    | 'closest'
    | 'bomb'
    | 'one-clue'
    | 'top-5'
    | 'combo'
    | 'marhala'
    | 'laqatha'
    | 'first-note'
    | 'la-tahriqha'
    | 'odd-piece'
    | 'ekshifni';

  @ApiPropertyOptional({ enum: [1, 2] })
  @IsOptional()
  @IsIn([1, 2])
  version?: 1 | 2;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind !== 'combo')
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  prompt?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'ekshifni')
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  celebrityIdentity?: string;

  @ApiPropertyOptional({ type: EkshifniTutorialImageDto })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'ekshifni')
  @ValidateNested()
  @Type(() => EkshifniTutorialImageDto)
  image?: EkshifniTutorialImageDto;

  @ApiPropertyOptional({ type: [EkshifniTutorialRegionDto] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'ekshifni')
  @IsArray()
  @ArrayMinSize(6)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => EkshifniTutorialRegionDto)
  regions?: EkshifniTutorialRegionDto[];

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'ekshifni')
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  wrongSubmittedAnswer?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'ekshifni')
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  correctSubmittedAnswer?: string;

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
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'bomb' || value.kind === 'one-clue',
  )
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

  @ApiPropertyOptional()
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'top-5' ||
      value.kind === 'laqatha' ||
      value.kind === 'first-note',
  )
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'top-5')
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  rankingBasis?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'top-5')
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  sourceLabel?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'top-5')
  @IsString()
  @MaxLength(240)
  instruction?: string;

  @ApiPropertyOptional({ type: [Top5TutorialEntryDto] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'top-5')
  @IsArray()
  @ArrayMinSize(10)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => Top5TutorialEntryDto)
  entries?: Top5TutorialEntryDto[];

  @ApiPropertyOptional({ type: [ComboTutorialStageDto] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'combo')
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ComboTutorialStageDto)
  stages?: ComboTutorialStageDto[];

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'marhala')
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  correctAnswer?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'marhala')
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  submittedAnswer?: string;

  @ApiPropertyOptional({ type: [LaqathaTutorialClueDto] })
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'laqatha' || value.kind === 'one-clue',
  )
  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => LaqathaTutorialClueDto)
  clues?: LaqathaTutorialClueDto[];

  @ApiPropertyOptional({ type: [String] })
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'laqatha' || value.kind === 'first-note',
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  acceptedAnswers?: string[];

  @ApiPropertyOptional()
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'laqatha' ||
      value.kind === 'first-note' ||
      value.kind === 'one-clue',
  )
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  firstSubmittedAnswer?: string;

  @ApiPropertyOptional()
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'laqatha' || value.kind === 'one-clue',
  )
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  secondSubmittedAnswer?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'first-note')
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  contextualClue?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'first-note')
  @IsString()
  @MaxLength(80)
  clueLabel?: string;

  @ApiPropertyOptional({ type: [FirstNoteTutorialBidDto] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'first-note')
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => FirstNoteTutorialBidDto)
  bids?: FirstNoteTutorialBidDto[];

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'first-note')
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  stealSubmittedAnswer?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'la-tahriqha')
  @IsNumber()
  dishWindowSeconds?: number;

  @ApiPropertyOptional({ type: [LaTahriqhaTutorialDishDto] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'la-tahriqha')
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => LaTahriqhaTutorialDishDto)
  dishes?: LaTahriqhaTutorialDishDto[];

  @ApiPropertyOptional({ type: LaTahriqhaTutorialCaptainRotationDto })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'la-tahriqha')
  @ValidateNested()
  @Type(() => LaTahriqhaTutorialCaptainRotationDto)
  captainRotation?: LaTahriqhaTutorialCaptainRotationDto;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'odd-piece')
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  targetVehicleIdentity?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'odd-piece')
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  targetVehicleLabel?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'odd-piece')
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  intruderVehicleIdentity?: string;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'odd-piece')
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  intruderVehicleLabel?: string;

  @ApiPropertyOptional({ type: [OddPieceTutorialPieceDto] })
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'odd-piece' && value.version !== 2,
  )
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => OddPieceTutorialPieceDto)
  pieces?: OddPieceTutorialPieceDto[];

  @ApiPropertyOptional()
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'odd-piece' && value.version !== 2,
  )
  @IsString()
  @MinLength(1)
  wrongSelectionPieceId?: string;

  @ApiPropertyOptional()
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'odd-piece' && value.version !== 2,
  )
  @IsString()
  @MinLength(1)
  correctSelectionPieceId?: string;

  @ApiPropertyOptional({ type: OddPieceTutorialMediaDto })
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'odd-piece' && value.version !== 2,
  )
  @ValidateNested()
  @Type(() => OddPieceTutorialMediaDto)
  targetReveal?: OddPieceTutorialMediaDto;

  @ApiPropertyOptional()
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'odd-piece' && value.version === 2,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  intruderPartIdentity?: string;

  @ApiPropertyOptional()
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'odd-piece' && value.version === 2,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  intruderPartLabel?: string;

  @ApiPropertyOptional({ type: OddPieceTutorialHotspotImageDto })
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'odd-piece' && value.version === 2,
  )
  @ValidateNested()
  @Type(() => OddPieceTutorialHotspotImageDto)
  modifiedImage?: OddPieceTutorialHotspotImageDto;

  @ApiPropertyOptional({ type: OddPieceTutorialHotspotImageDto })
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'odd-piece' && value.version === 2,
  )
  @ValidateNested()
  @Type(() => OddPieceTutorialHotspotImageDto)
  originalImage?: OddPieceTutorialHotspotImageDto;

  @ApiPropertyOptional({ type: OddPieceTutorialHotspotDto })
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'odd-piece' && value.version === 2,
  )
  @ValidateNested()
  @Type(() => OddPieceTutorialHotspotDto)
  hotspot?: OddPieceTutorialHotspotDto;

  @ApiPropertyOptional({ type: OddPieceTutorialPointDto })
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'odd-piece' && value.version === 2,
  )
  @ValidateNested()
  @Type(() => OddPieceTutorialPointDto)
  wrongPoint?: OddPieceTutorialPointDto;

  @ApiPropertyOptional({ type: OddPieceTutorialPointDto })
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'odd-piece' && value.version === 2,
  )
  @ValidateNested()
  @Type(() => OddPieceTutorialPointDto)
  correctPoint?: OddPieceTutorialPointDto;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'marhala')
  @IsNumber()
  teamAPosition?: number;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'marhala')
  @IsNumber()
  teamBPosition?: number;

  @ApiPropertyOptional({ enum: ['team-a', 'team-b'] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'marhala')
  @IsIn(['team-a', 'team-b'])
  activeTeam?: 'team-a' | 'team-b';

  @ApiPropertyOptional({ enum: ['easy', 'medium', 'hard'] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'marhala')
  @IsIn(['easy', 'medium', 'hard'])
  difficulty?: 'easy' | 'medium' | 'hard';

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'marhala')
  @IsNumber()
  movement?: number;

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'marhala')
  @IsNumber()
  baseLanding?: number;

  @ApiPropertyOptional({ enum: ['normal', 'boost', 'trap', 'finish'] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'marhala')
  @IsIn(['normal', 'boost', 'trap', 'finish'])
  tile?: 'normal' | 'boost' | 'trap' | 'finish';

  @ApiPropertyOptional()
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'marhala')
  @IsNumber()
  finalLanding?: number;

  @ApiPropertyOptional({ type: [Top5TutorialDecisionDto] })
  @ValidateIf((value: TutorialScenarioDto) => value.kind === 'top-5')
  @IsArray()
  @ArrayMinSize(10)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => Top5TutorialDecisionDto)
  decisions?: Top5TutorialDecisionDto[];

  @ApiPropertyOptional({ enum: ['team-a', 'team-b'] })
  @ValidateIf(
    (value: TutorialScenarioDto) =>
      value.kind === 'top-5' || value.kind === 'bomb',
  )
  @IsIn(['team-a', 'team-b'])
  startingTeam?: 'team-a' | 'team-b';
}
