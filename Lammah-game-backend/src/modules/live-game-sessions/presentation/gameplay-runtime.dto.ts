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
