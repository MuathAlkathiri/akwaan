import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { GameplayCommandPayload } from '../domain/gameplay-mode.plugin';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum } from 'class-validator';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';

export class CreateGameplayRuntimeDto {
  @IsUUID()
  commandId!: string;

  @IsInt()
  @Min(0)
  expectedSessionRevision!: number;

  @IsOptional()
  @IsString()
  modeKey?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  modeVersion?: number;
}

export class GameplayRuntimeMutationDto {
  @IsUUID()
  commandId!: string;

  @IsInt()
  @Min(0)
  expectedRuntimeRevision!: number;

  @IsInt()
  @Min(0)
  expectedSessionRevision!: number;

  @IsOptional()
  @IsString()
  clientTimestamp?: string;
}

export class StartDistributedInformationDto {
  @IsString()
  worldId!: string;

  @IsEnum(WorldChallengeSlotKey)
  slotKey!: WorldChallengeSlotKey;

  /** Exactly three distinct ready ContentItems; the server validates the rest. */
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  contentItemIds!: string[];
}

export class StartRyoGameplayDto {
  @IsUUID() worldId!: string;
  @IsEnum(WorldChallengeSlotKey) slotKey!: WorldChallengeSlotKey;
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @IsUUID(undefined, { each: true })
  contentItemIds!: string[];
  @IsOptional() @IsUUID() startingTeamId?: string;
}

export class StartTop5Dto {
  @IsUUID() worldId!: string;
  @IsOptional() @IsUUID() boardConfigurationId?: string;
  @IsOptional() @IsUUID() challengeTypeId?: string;
  @IsUUID() contentItemId!: string;
  @IsOptional() @IsUUID() startingTeamId?: string;
}

export class CreateGameplayRoundDto extends GameplayRuntimeMutationDto {
  @IsOptional()
  @IsUUID()
  activeTeamId?: string;

  @IsOptional()
  @IsUUID()
  activeParticipantId?: string;
}

export class CompleteGameplayRoundDto extends GameplayRuntimeMutationDto {
  @IsString()
  @MaxLength(100)
  reason!: string;
}

export class SubmitGameplayCommandDto extends GameplayRuntimeMutationDto {
  @IsString()
  @MaxLength(80)
  commandType!: string;

  @IsObject()
  payload!: GameplayCommandPayload;
}

export class GameplaySocketMutationDto extends GameplayRuntimeMutationDto {
  @IsUUID()
  sessionId!: string;
}

export class GameplayRoundSocketMutationDto extends GameplaySocketMutationDto {
  @IsUUID()
  roundId!: string;
}

export class CreateGameplayRoundSocketDto extends GameplaySocketMutationDto {
  @IsOptional()
  @IsUUID()
  activeTeamId?: string;

  @IsOptional()
  @IsUUID()
  activeParticipantId?: string;
}

export class CompleteGameplayRoundSocketDto extends GameplayRoundSocketMutationDto {
  @IsString()
  @MaxLength(100)
  reason!: string;
}

export class SubmitGameplaySocketCommandDto extends GameplayRoundSocketMutationDto {
  @IsString()
  @MaxLength(80)
  commandType!: string;

  @IsObject()
  payload!: GameplayCommandPayload;
}
