import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GetLiveGameSession } from '../../live-game-sessions/application/get-live-game-session.use-case';
import { LiveSessionHttpExceptionFilter } from '../../live-game-sessions/presentation/live-session-http-exception.filter';
import { LiveGameSessionSnapshot } from '../../live-game-sessions/application/live-game-session.snapshot';
import { MatchUseCases } from '../application/match.use-cases';
import { LaunchMatchChallengeDto, MatchCommandDto } from './match.dto';

/**
 * Controller transport for the Match vertical slice.
 *
 * Every route is authenticated and every route is controller-only: a participant
 * never issues a Match command, it only reads `snapshot.match`.
 *
 * A new Match is created in one step through `POST .../match/unified`
 * (`UnifiedMatchController`). This controller serves the routes both setup modes
 * share: launching a board position, cancelling the Match, and the snapshot `GET`.
 */
@ApiTags('match')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
// Launching a challenge runs the mechanic's own use case, so its domain errors
// must reach the client with their codes instead of collapsing into a 500.
@UseFilters(LiveSessionHttpExceptionFilter)
@Controller('live-game-sessions/:sessionId/match')
export class MatchController {
  constructor(
    private readonly matches: MatchUseCases,
    private readonly getSession: GetLiveGameSession,
  ) {}

  @Post('challenges/launch')
  @ApiOperation({ summary: 'Launch one board position' })
  async launchChallenge(
    @Param('sessionId') sessionId: string,
    @Body() body: LaunchMatchChallengeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    await this.matches.launchChallenge({
      sessionId,
      actorId: user.id,
      ...body,
    });
    return this.snapshot(sessionId, user);
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel the Match' })
  async cancel(
    @Param('sessionId') sessionId: string,
    @Body() body: MatchCommandDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    await this.matches.cancel({ sessionId, actorId: user.id, ...body });
    return this.snapshot(sessionId, user);
  }

  @Get()
  @ApiOperation({ summary: 'Get the Match-bearing snapshot' })
  async get(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    // Fails loudly when there is no Match, rather than returning a bare session.
    await this.matches.get({ sessionId, actorId: user.id });
    return this.snapshot(sessionId, user);
  }

  /**
   * Always the authoritative session snapshot, so a Match command and a snapshot
   * read return exactly the same contract.
   */
  private snapshot(
    sessionId: string,
    user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    return this.getSession.execute(sessionId, user.id);
  }
}
