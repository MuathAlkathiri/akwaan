import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ChooseOwnTeam,
  JoinLiveSession,
  ReconnectLiveParticipant,
  SetParticipantReadiness,
} from '../application/live-participant.use-cases';
import { ResolveJoinCode } from '../application/live-session-join-access.use-cases';
import { LiveSessionForbiddenError } from '../domain/live-session.errors';
import { PublicJoinRateLimiter } from '../infrastructure/public-join-rate-limiter';
import {
  ChooseOwnTeamDto,
  JoinLiveSessionDto,
  LiveSessionMutationDto,
} from './live-game-session.dto';
import { LiveSessionHttpExceptionFilter } from './live-session-http-exception.filter';
import {
  CurrentLiveParticipant,
  ParticipantCredentialGuard,
} from './participant-auth';

@ApiTags('live-game-session-join')
@UseFilters(LiveSessionHttpExceptionFilter)
@Controller('live-game-session-join')
export class LiveGameSessionJoinController {
  constructor(
    private readonly resolveJoinCode: ResolveJoinCode,
    private readonly joinSession: JoinLiveSession,
    private readonly limiter: PublicJoinRateLimiter,
  ) {}

  @Get(':joinCode')
  resolve(@Param('joinCode') joinCode: string, @Req() request: Request) {
    this.limiter.consume(`resolve:${request.ip}:${joinCode}`, 30);
    return this.resolveJoinCode.execute(joinCode);
  }

  @Post(':joinCode')
  join(
    @Param('joinCode') joinCode: string,
    @Body() body: JoinLiveSessionDto,
    @Req() request: Request,
  ) {
    this.limiter.consume(`join:${request.ip}:${joinCode}`, 10);
    return this.joinSession.execute({ joinCode, ...body });
  }
}

@ApiTags('live-game-participants')
@ApiBearerAuth()
@UseFilters(LiveSessionHttpExceptionFilter)
@UseGuards(ParticipantCredentialGuard)
@Controller('live-game-participants')
export class LiveGameParticipantsController {
  constructor(
    private readonly reconnectParticipant: ReconnectLiveParticipant,
    private readonly readiness: SetParticipantReadiness,
    private readonly ownTeam: ChooseOwnTeam,
    private readonly limiter: PublicJoinRateLimiter,
  ) {}

  @Post('reconnect')
  reconnect(
    @CurrentLiveParticipant()
    participant: {
      actor: import('../application/live-session-actor').LiveSessionActor;
      credential: string;
    },
    @Req() request: Request,
  ) {
    this.limiter.consume(`reconnect:${request.ip}`, 10);
    return this.reconnectParticipant.execute(participant.credential);
  }

  @Post(':participantId/ready')
  ready(
    @Param('participantId') participantId: string,
    @Body() body: LiveSessionMutationDto,
    @CurrentLiveParticipant()
    participant: {
      actor: import('../application/live-session-actor').LiveSessionActor;
    },
  ) {
    this.assertSameParticipant(participant.actor, participantId);
    return this.readiness.execute({
      actor: participant.actor,
      ready: true,
      ...body,
    });
  }

  /**
   * A player moving themselves between the two teams.
   *
   * Theirs to decide, not the host's: the room works because people sort
   * themselves out. The domain allows it only before the match starts, so this
   * cannot become a way to change sides mid-game.
   */
  @Post(':participantId/team')
  chooseTeam(
    @Param('participantId') participantId: string,
    @Body() body: ChooseOwnTeamDto,
    @CurrentLiveParticipant()
    participant: {
      actor: import('../application/live-session-actor').LiveSessionActor;
    },
  ) {
    this.assertSameParticipant(participant.actor, participantId);
    return this.ownTeam.execute({ actor: participant.actor, ...body });
  }

  @Post(':participantId/not-ready')
  notReady(
    @Param('participantId') participantId: string,
    @Body() body: LiveSessionMutationDto,
    @CurrentLiveParticipant()
    participant: {
      actor: import('../application/live-session-actor').LiveSessionActor;
    },
  ) {
    this.assertSameParticipant(participant.actor, participantId);
    return this.readiness.execute({
      actor: participant.actor,
      ready: false,
      ...body,
    });
  }

  private assertSameParticipant(
    actor: import('../application/live-session-actor').LiveSessionActor,
    participantId: string,
  ): void {
    if (actor.kind !== 'participant' || actor.participantId !== participantId) {
      throw new LiveSessionForbiddenError();
    }
  }
}
