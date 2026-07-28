import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsIn,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateLiveGameSessionDto {
  @IsOptional()
  @IsString()
  parentGameId?: string;

  @IsOptional()
  @IsString()
  parentGameQuestionId?: string;

  @IsString()
  modeKey!: string;

  @IsInt()
  @Min(1)
  modeVersion!: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  teamNames!: string[];
}

export class LiveSessionMutationDto {
  @IsUUID()
  commandId!: string;

  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsOptional()
  @IsString()
  clientTimestamp?: string;
}

export class LiveSessionSocketMutationDto extends LiveSessionMutationDto {
  @IsUUID()
  sessionId!: string;
}

export class LiveSessionTurnMutationDto extends LiveSessionSocketMutationDto {
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsString()
  @MaxLength(100)
  reason!: string;
}

export class FinishLiveSessionDto extends LiveSessionSocketMutationDto {
  @IsString()
  @MaxLength(100)
  reason!: string;

  @IsOptional()
  @IsUUID()
  winnerTeamId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string | number | boolean>;
}

export class SubscribeLiveSessionDto {
  @IsUUID()
  sessionId!: string;
}

export class ReconnectLiveSessionDto extends LiveSessionMutationDto {
  @IsString()
  reconnectToken!: string;
}

export class CreateJoinAccessDto {
  @IsIn(['explicit', 'balanced', 'host-assigned'])
  assignmentPolicy!: 'explicit' | 'balanced' | 'host-assigned';

  @IsOptional()
  @IsUUID()
  teamScopeId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maximumParticipantCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  teamCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  expiresInMinutes?: number;
}

export class JoinLiveSessionDto {
  @IsString()
  @MaxLength(40)
  @Matches(/^[\p{L}\p{N} _-]+$/u)
  displayName!: string;

  @IsOptional()
  @IsUUID()
  requestedTeamId?: string;

  @IsUUID()
  joinRequestId!: string;

  @IsOptional()
  @IsObject()
  device?: { label?: string; platform?: string };
}

export class AssignParticipantTeamDto extends LiveSessionMutationDto {
  @IsUUID()
  teamId!: string;
}

export class ParticipantReadinessDto extends LiveSessionMutationDto {
  @ValidateIf((value: ParticipantReadinessDto) => value.ready !== undefined)
  @IsBoolean()
  ready?: boolean;
}
