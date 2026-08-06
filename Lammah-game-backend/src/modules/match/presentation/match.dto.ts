import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import {
  MATCH_SCOPES_PER_OCCURRENCE,
  WorldSelectionMethod,
} from '../domain/match.constants';

/** Every Match command carries its own id and the revision it was decided on. */
export class MatchCommandDto {
  @ApiProperty({ description: 'Client-generated id; replays are ignored' })
  @IsString()
  @MinLength(1)
  commandId!: string;

  @ApiProperty({ description: 'Match revision the client last saw' })
  @IsInt()
  @Min(0)
  expectedMatchRevision!: number;
}

export class SelectMatchWorldDto extends MatchCommandDto {
  @ApiPropertyOptional({
    description: 'Omitted when the server resolves the World randomly',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  worldId?: string;

  @ApiProperty({ enum: WorldSelectionMethod })
  @IsEnum(WorldSelectionMethod)
  method!: WorldSelectionMethod;

  @ApiPropertyOptional({ description: 'Required for a team pick' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  selectedByTeamId?: string;
}

export class SelectMatchScopesDto extends MatchCommandDto {
  @ApiProperty({ description: 'The World occurrence these Scopes belong to' })
  @IsInt()
  @Min(0)
  occurrenceIndex!: number;

  @ApiProperty({
    description: 'Exactly four distinct Scope ids from the occurrence World',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(MATCH_SCOPES_PER_OCCURRENCE)
  @ArrayMaxSize(MATCH_SCOPES_PER_OCCURRENCE)
  @IsString({ each: true })
  scopeIds!: string[];
}

export class LaunchMatchChallengeDto extends MatchCommandDto {
  @ApiProperty({
    description:
      'The World occurrence this position belongs to. A preconfigured Match accepts any of its three, in any order.',
  })
  @IsInt()
  @Min(0)
  occurrenceIndex!: number;

  @ApiProperty({ enum: WorldChallengeSlotKey })
  @IsEnum(WorldChallengeSlotKey)
  slotKey!: WorldChallengeSlotKey;

  @ApiProperty({
    description: 'Explicit ContentItem ids; the server never guesses content',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  contentItemIds!: string[];

  @ApiPropertyOptional({
    description: "The mechanic's starting team, where the mechanic accepts one",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  startingTeamId?: string;

  @ApiPropertyOptional({
    description:
      'Preconfigured Matches only: the team claiming board selection. Refused when it is not that team turn.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  selectingTeamId?: string;
}
