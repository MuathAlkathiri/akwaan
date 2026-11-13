import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import {
  CancelLiveGameSession,
  MarkSessionReady,
  StartLiveGameSession,
} from '../application/live-session-lifecycle.use-cases';
import { CreateLiveGameSession } from '../application/create-live-game-session.use-case';
import { GetLiveGameSession } from '../application/get-live-game-session.use-case';
import { ReconnectParticipant } from '../application/reconnect-participant.use-case';
import {
  CreateLiveGameSessionDto,
  LiveSessionMutationDto,
  ReconnectLiveSessionDto,
  AssignParticipantTeamDto,
  CreateJoinAccessDto,
  LiveSessionMutationDto as ParticipantMutationDto,
} from './live-game-session.dto';
import { LiveSessionHttpExceptionFilter } from './live-session-http-exception.filter';
import {
  CreateSessionJoinAccess,
  GetSessionJoinAccess,
  RegenerateSessionJoinAccess,
  RevokeSessionJoinAccess,
} from '../application/live-session-join-access.use-cases';
import {
  AssignParticipantTeam,
  RemoveLiveParticipant,
  RevokeParticipantCredential,
} from '../application/live-participant.use-cases';

@ApiTags('live-game-sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseFilters(LiveSessionHttpExceptionFilter)
@Controller('live-game-sessions')
export class LiveGameSessionsController {
  constructor(
    private readonly createSession: CreateLiveGameSession,
    private readonly getSession: GetLiveGameSession,
    private readonly reconnectParticipant: ReconnectParticipant,
    private readonly markReady: MarkSessionReady,
    private readonly startSession: StartLiveGameSession,
    private readonly cancelSession: CancelLiveGameSession,
    private readonly createJoinAccess: CreateSessionJoinAccess,
    private readonly getJoinAccess: GetSessionJoinAccess,
    private readonly regenerateJoinAccess: RegenerateSessionJoinAccess,
    private readonly revokeJoinAccess: RevokeSessionJoinAccess,
    private readonly assignParticipant: AssignParticipantTeam,
    private readonly removeParticipant: RemoveLiveParticipant,
    private readonly revokeParticipant: RevokeParticipantCredential,
  ) {}

  @Post()
  create(
    @Body() body: CreateLiveGameSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createSession.execute({
      ...body,
      actor: user,
    });
  }

  @Get(':sessionId')
  get(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.getSession.execute(sessionId, user.id);
  }

  @Post(':sessionId/reconnect')
  reconnect(
    @Param('sessionId') sessionId: string,
    @Body() body: ReconnectLiveSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reconnectParticipant.execute({
      sessionId,
      actorId: user.id,
      ...body,
    });
  }

  /**
   * Leaves the lobby, over HTTP.
   *
   * The same two commands have always existed on the socket, for a host that is
   * already watching a session. A host that is *creating* one has no socket yet —
   * it is setting a Match up before anybody is in the room — so the lifecycle is
   * reachable over HTTP too. Both routes delegate to the same use cases the
   * gateway calls: no rule is restated here, and the readiness rules (two active
   * teams, and a ready player per team only once players exist) are unchanged.
   */
  @Post(':sessionId/ready')
  ready(
    @Param('sessionId') sessionId: string,
    @Body() body: LiveSessionMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.markReady.execute({
      sessionId,
      actorId: user.id,
      ...body,
    });
  }

  @Post(':sessionId/start')
  start(
    @Param('sessionId') sessionId: string,
    @Body() body: LiveSessionMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.startSession.execute({
      sessionId,
      actorId: user.id,
      ...body,
    });
  }

  @Post(':sessionId/cancel')
  cancel(
    @Param('sessionId') sessionId: string,
    @Body() body: LiveSessionMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cancelSession.execute({
      sessionId,
      actorId: user.id,
      ...body,
    });
  }

  @Post(':sessionId/join-access')
  createAccess(
    @Param('sessionId') sessionId: string,
    @Body() body: CreateJoinAccessDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createJoinAccess.execute({
      sessionId,
      actorId: user.id,
      ...body,
    });
  }

  @Get(':sessionId/join-access')
  getAccess(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.getJoinAccess.execute(sessionId, user.id);
  }

  @Post(':sessionId/join-access/regenerate')
  regenerateAccess(
    @Param('sessionId') sessionId: string,
    @Body() body: CreateJoinAccessDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.regenerateJoinAccess.execute({
      sessionId,
      actorId: user.id,
      ...body,
    });
  }

  @Post(':sessionId/join-access/revoke')
  revokeAccess(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revokeJoinAccess.execute(sessionId, user.id);
  }

  @Patch(':sessionId/participants/:participantId/team')
  assignTeam(
    @Param('sessionId') sessionId: string,
    @Param('participantId') participantId: string,
    @Body() body: AssignParticipantTeamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignParticipant.execute({
      sessionId,
      participantId,
      actorId: user.id,
      ...body,
    });
  }

  @Delete(':sessionId/participants/:participantId')
  remove(
    @Param('sessionId') sessionId: string,
    @Param('participantId') participantId: string,
    @Body() body: ParticipantMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.removeParticipant.execute({
      sessionId,
      participantId,
      actorId: user.id,
      ...body,
    });
  }

  @Post(':sessionId/participants/:participantId/revoke-credential')
  revokeParticipantCredential(
    @Param('sessionId') sessionId: string,
    @Param('participantId') participantId: string,
    @Body() body: ParticipantMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revokeParticipant.execute({
      sessionId,
      participantId,
      actorId: user.id,
      ...body,
    });
  }
}
