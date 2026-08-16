import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { MATCH_LAUNCH_CONTENT_ITEM_MAX } from '../domain/match.constants';

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

export class SetMatchDoubleDto extends MatchCommandDto {
  @ApiProperty()
  @IsBoolean()
  armed!: boolean;

  @ApiProperty({ description: 'Server-issued assignment sequence' })
  @IsInt()
  @Min(1)
  assignmentSequence!: number;
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
  // A transport bound, not a mechanic rule. Three was the widest any mechanic
  // needed until "القنبلة" arrived with a run of 10–15 pictures; the exact
  // count each mechanic accepts is still enforced by its own launcher.
  @ArrayMaxSize(MATCH_LAUNCH_CONTENT_ITEM_MAX)
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
