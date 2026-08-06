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
