import {
  Body,
  Controller,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GameplayInteractionUseCases } from '../application/gameplay-interaction.use-cases';
import { LiveSessionActor } from '../application/live-session-actor';
import {
  AdjudicateSubmissionDto,
  InteractionMutationDto,
  PrepareInteractionDto,
  SubmitInteractionDto,
} from './gameplay-interaction.dto';
import { LiveSessionHttpExceptionFilter } from './live-session-http-exception.filter';
import {
  CurrentLiveParticipant,
  ParticipantCredentialGuard,
} from './participant-auth';

@ApiTags('live-gameplay-interactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseFilters(LiveSessionHttpExceptionFilter)
@Controller('live-game-sessions/:sessionId/runtime/rounds/:roundId/interaction')
export class GameplayInteractionController {
  constructor(private readonly interactions: GameplayInteractionUseCases) {}

  @Post()
  prepare(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() body: PrepareInteractionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interactions.prepare({
      sessionId,
      roundId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('open')
  open(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() body: InteractionMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interactions.open({
      sessionId,
      roundId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('close')
  close(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() body: InteractionMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interactions.close({
      sessionId,
      roundId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('resolve')
  resolve(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() body: InteractionMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interactions.resolve({
      sessionId,
      roundId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('cancel')
  cancel(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() body: InteractionMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interactions.cancel({
      sessionId,
      roundId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('expire')
  expire(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() body: InteractionMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interactions.expire({
      sessionId,
      roundId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('submissions/:submissionId/adjudicate')
  adjudicate(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Param('submissionId') submissionId: string,
    @Body() body: AdjudicateSubmissionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interactions.adjudicate({
      sessionId,
      roundId,
      submissionId,
      actor: this.actor(user),
      ...body,
    });
  }

  private actor(user: AuthenticatedUser): LiveSessionActor {
    return { kind: 'user', actorId: user.id };
  }
}

@ApiTags('live-gameplay-interactions')
@ApiBearerAuth()
@UseGuards(ParticipantCredentialGuard)
@UseFilters(LiveSessionHttpExceptionFilter)
@Controller('live-game-sessions/:sessionId/runtime/interactions/:interactionId')
export class GameplayParticipantInteractionController {
  constructor(private readonly interactions: GameplayInteractionUseCases) {}

  @Post('rounds/:roundId/submissions')
  submit(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() body: SubmitInteractionDto,
    @CurrentLiveParticipant()
    participant: { actor: LiveSessionActor },
  ) {
    return this.interactions.submit({
      sessionId,
      roundId,
      actor: participant.actor,
      ...body,
    });
  }

  @Post('rounds/:roundId/submissions/:submissionId/withdraw')
  withdraw(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Param('submissionId') submissionId: string,
    @Body() body: InteractionMutationDto,
    @CurrentLiveParticipant()
    participant: { actor: LiveSessionActor },
  ) {
    return this.interactions.withdraw({
      sessionId,
      roundId,
      submissionId,
      actor: participant.actor,
      ...body,
    });
  }
}
