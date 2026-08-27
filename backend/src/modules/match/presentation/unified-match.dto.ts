import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MatchCommandDto } from './match.dto';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import {
  MATCH_SCOPES_PER_OCCURRENCE,
  MATCH_WORLD_OCCURRENCE_COUNT,
} from '../domain/match.constants';

/** One of the three World occurrences, configured before the Match exists. */
export class ConfiguredWorldOccurrenceDto {
  @ApiProperty({
    description: `Board position of this occurrence: 0 to ${MATCH_WORLD_OCCURRENCE_COUNT - 1}`,
    minimum: 0,
    maximum: MATCH_WORLD_OCCURRENCE_COUNT - 1,
  })
  @IsInt()
  @Min(0)
  @Max(MATCH_WORLD_OCCURRENCE_COUNT - 1)
  occurrenceIndex!: number;

  @ApiProperty({
    description:
      'The World played at this position. The same World may be configured at more than one position.',
  })
  @IsString()
  @MinLength(1)
  worldId!: string;

  @ApiProperty({
    description: `Exactly ${MATCH_SCOPES_PER_OCCURRENCE} distinct Scope ids of this occurrence's World. This occurrence's challenges draw content from these and nothing else.`,
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(MATCH_SCOPES_PER_OCCURRENCE)
  @ArrayMaxSize(MATCH_SCOPES_PER_OCCURRENCE)
  @IsString({ each: true })
  selectedScopeIds!: string[];
}

/**
 * A complete Match configuration.
 *
 * There is no coin-toss or starting-team input: the toss is server-owned, and the
 * first selecting team is decided and stored by the server during creation.
 */
export class CreateUnifiedMatchDto {
  @ApiProperty({
    description: `Exactly ${MATCH_WORLD_OCCURRENCE_COUNT} ordered World occurrences, indexed 0 to ${MATCH_WORLD_OCCURRENCE_COUNT - 1}`,
    type: [ConfiguredWorldOccurrenceDto],
  })
  @IsArray()
  @ArrayMinSize(MATCH_WORLD_OCCURRENCE_COUNT)
  @ArrayMaxSize(MATCH_WORLD_OCCURRENCE_COUNT)
  @ValidateNested({ each: true })
  @Type(() => ConfiguredWorldOccurrenceDto)
  occurrences!: ConfiguredWorldOccurrenceDto[];
}

/**
 * Launching one board position.
 *
 * The request names a position and nothing more. There is deliberately no
 * `contentItemIds` field: which ContentItems get played is decided by the server,
 * drawn from that occurrence's own four Scopes, and never travels to a client.
 */
export class LaunchUnifiedChallengeDto {
  @ApiProperty({ description: 'Client-generated id; replays are ignored' })
  @IsString()
  @MinLength(1)
  commandId!: string;

  @ApiProperty({ description: 'Match revision the client last saw' })
  @IsInt()
  @Min(0)
  expectedMatchRevision!: number;

  @ApiProperty({
    description:
      'Which of the three World occurrences this position belongs to. Any of them may be launched, in any order.',
    minimum: 0,
    maximum: MATCH_WORLD_OCCURRENCE_COUNT - 1,
  })
  @IsInt()
  @Min(0)
  @Max(MATCH_WORLD_OCCURRENCE_COUNT - 1)
  occurrenceIndex!: number;

  @ApiProperty({ enum: WorldChallengeSlotKey })
  @IsEnum(WorldChallengeSlotKey)
  slotKey!: WorldChallengeSlotKey;

  @ApiPropertyOptional({
    description:
      'The team whose turn it is to choose. Refused when it is not that team turn.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  selectingTeamId?: string;
}

export class ArmBoardDoubleDto extends MatchCommandDto {
  @ApiProperty({ description: 'The current selecting team' })
  @IsString()
  @MinLength(1)
  teamId!: string;
}

export class AdjustMatchScoreDto extends MatchCommandDto {
  @ApiProperty({ description: 'Team receiving the correction' })
  @IsString()
  @MinLength(1)
  teamId!: string;

  @ApiProperty({ enum: [-1, 1] })
  @IsInt()
  @IsIn([-1, 1])
  delta!: 1 | -1;
}
