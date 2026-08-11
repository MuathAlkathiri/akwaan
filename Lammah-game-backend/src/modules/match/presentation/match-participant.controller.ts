import {
  Body,
  Controller,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetLiveGameSession } from '../../live-game-sessions/application/get-live-game-session.use-case';
import { LiveSessionActor } from '../../live-game-sessions/application/live-session-actor';
import {
  CurrentLiveParticipant,
  ParticipantCredentialGuard,
} from '../../live-game-sessions/presentation/participant-auth';
import { LiveSessionHttpExceptionFilter } from '../../live-game-sessions/presentation/live-session-http-exception.filter';
import { MatchUseCases } from '../application/match.use-cases';
import { SetMatchDoubleDto } from './match.dto';

@ApiTags('match-participant')
@ApiBearerAuth()
@UseGuards(ParticipantCredentialGuard)
@UseFilters(LiveSessionHttpExceptionFilter)
@Controller('live-game-sessions/:sessionId/match')
export class MatchParticipantController {
  constructor(
    private readonly matches: MatchUseCases,
    private readonly getSession: GetLiveGameSession,
  ) {}

  @Post('double')
  @ApiOperation({ summary: "Arm or cancel the assigned team's Match Double" })
  async setDouble(
    @Param('sessionId') sessionId: string,
    @Body() body: SetMatchDoubleDto,
    @CurrentLiveParticipant() participant: { actor: LiveSessionActor },
  ) {
    await this.matches.setTeamDouble({
      sessionId,
      actor: participant.actor,
      ...body,
    });
    return this.getSession.execute(sessionId, participant.actor);
  }
}
