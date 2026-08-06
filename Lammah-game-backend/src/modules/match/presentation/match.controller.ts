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
import {
  LaunchMatchChallengeDto,
  MatchCommandDto,
  SelectMatchScopesDto,
  SelectMatchWorldDto,
} from './match.dto';

/**
 * Controller transport for the Match vertical slice.
 *
 * Every route is authenticated and every route is controller-only: a participant
 * never issues a Match command, it only reads `snapshot.match`. The stable
 * `/match` path is used by the production host journey. The legacy
 * `/match/development` alias remains during the transition so existing internal
 * playtests and clients are not broken.
 *
 * @deprecated The sequential setup routes here — `create`, `start`, `coin-toss`,
 * `worlds`, `worlds/select`, `scopes`, `scopes/select`, `worlds/continue` — belong
 * to the legacy journey and are removed in Phase 5. A new Match is created in one
 * step through `POST .../match/unified` (`UnifiedMatchController`), and no new
 * client may be built against the stages these routes drive. `challenges/launch`,
 * `cancel`, and the snapshot `GET` are shared by both setup modes and stay.
 */
@ApiTags('match')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
// Launching a challenge runs the mechanic's own use case, so its domain errors
// must reach the client with their codes instead of collapsing into a 500.
@UseFilters(LiveSessionHttpExceptionFilter)
@Controller([
  'live-game-sessions/:sessionId/match',
  'live-game-sessions/:sessionId/match/development',
])
export class MatchDevelopmentController {
  constructor(
    private readonly matches: MatchUseCases,
    private readonly getSession: GetLiveGameSession,
  ) {}

  @Post('create')
  @ApiOperation({ summary: 'Wrap a live session in a Match' })
  async create(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    await this.matches.create({ sessionId, actorId: user.id });
    return this.snapshot(sessionId, user);
  }

  @Post('start')
  @ApiOperation({ summary: 'Leave the Match lobby' })
  async start(
    @Param('sessionId') sessionId: string,
    @Body() body: MatchCommandDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    await this.matches.start({ sessionId, actorId: user.id, ...body });
    return this.snapshot(sessionId, user);
  }

  @Post('coin-toss')
  @ApiOperation({ summary: 'Resolve the Match coin toss' })
  async coinToss(
    @Param('sessionId') sessionId: string,
    @Body() body: MatchCommandDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    await this.matches.resolveCoinToss({
      sessionId,
      actorId: user.id,
      ...body,
    });
    return this.snapshot(sessionId, user);
  }

  @Get('worlds')
  @ApiOperation({ summary: 'List selectable Worlds' })
  worlds(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.matches.listSelectableWorlds({ sessionId, actorId: user.id });
  }

  @Post('worlds/select')
  @ApiOperation({ summary: 'Choose one World occurrence' })
  async selectWorld(
    @Param('sessionId') sessionId: string,
    @Body() body: SelectMatchWorldDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    await this.matches.selectWorld({ sessionId, actorId: user.id, ...body });
    return this.snapshot(sessionId, user);
  }

  @Get('scopes')
  @ApiOperation({
    summary: 'List Scopes the current occurrence may draw from',
  })
  scopes(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.matches.listSelectableScopes({ sessionId, actorId: user.id });
  }

  @Post('scopes/select')
  @ApiOperation({
    summary: "Choose the occurrence's four Scopes",
  })
  async selectScopes(
    @Param('sessionId') sessionId: string,
    @Body() body: SelectMatchScopesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    await this.matches.selectScopes({ sessionId, actorId: user.id, ...body });
    return this.snapshot(sessionId, user);
  }

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

  @Post('worlds/continue')
  @ApiOperation({ summary: 'Open the next World occurrence' })
  async continueToNextWorld(
    @Param('sessionId') sessionId: string,
    @Body() body: MatchCommandDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    await this.matches.advanceToNextWorld({
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
