import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { GameplayCommandPayload } from '../domain/gameplay-mode.plugin';

export class InteractionMutationDto {
  @IsUUID()
  commandId!: string;
  @IsInt()
  @Min(0)
  expectedSessionRevision!: number;
  @IsInt()
  @Min(0)
  expectedRuntimeRevision!: number;
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedInteractionRevision?: number;
  @IsOptional()
  @IsString()
  clientTimestamp?: string;
}

export class PrepareInteractionDto extends InteractionMutationDto {
  @IsObject()
  payload!: GameplayCommandPayload;
}

export class SubmitInteractionDto extends InteractionMutationDto {
  @IsObject()
  payload!: GameplayCommandPayload;
}

export class AdjudicateSubmissionDto extends InteractionMutationDto {
  @IsBoolean()
  accepted!: boolean;
  @IsString()
  @MaxLength(80)
  reasonCode!: string;
}

export class InteractionSocketMutationDto extends InteractionMutationDto {
  @IsUUID()
  sessionId!: string;
  @IsUUID()
  roundId!: string;
}

export class PrepareInteractionSocketDto extends InteractionSocketMutationDto {
  @IsObject()
  payload!: GameplayCommandPayload;
}

export class SubmitInteractionSocketDto extends InteractionSocketMutationDto {
  @IsObject()
  payload!: GameplayCommandPayload;
}

export class AdjudicateInteractionSocketDto extends InteractionSocketMutationDto {
  @IsUUID()
  submissionId!: string;
  @IsBoolean()
  accepted!: boolean;
  @IsString()
  @MaxLength(80)
  reasonCode!: string;
}
