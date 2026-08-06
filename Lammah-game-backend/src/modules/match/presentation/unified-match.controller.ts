import {
  Body,
  Controller,
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
import { LiveGameSessionSnapshot } from '../../live-game-sessions/application/live-game-session.snapshot';
import { LiveSessionHttpExceptionFilter } from '../../live-game-sessions/presentation/live-session-http-exception.filter';
import { MatchUseCases } from '../application/match.use-cases';
import { MatchCommandDto } from './match.dto';
import {
  CreateUnifiedMatchDto,
  LaunchUnifiedChallengeDto,
} from './unified-match.dto';

/**
 * The production route that creates a fully configured Match.
 *
 * Deliberately its own controller, mounted only on the stable `/match` path.
 * Authentication and authorship follow the existing Match conventions — every
 * route is authenticated, and only the live session's controller may drive a
 * Match.
 */
@ApiTags('match')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseFilters(LiveSessionHttpExceptionFilter)
@Controller('live-game-sessions/:sessionId/match')
export class UnifiedMatchController {
  constructor(
    private readonly matches: MatchUseCases,
    private readonly getSession: GetLiveGameSession,
  ) {}

  /**
   * Creates the Match atomically. Either the whole configuration is valid and one
   * Match exists at its board with twelve playable positions, or nothing is
   * written at all.
   */
  @Post('unified')
  @ApiOperation({
    summary: 'Create a fully configured Match and open its board',
    description:
      'Validates three World occurrences with exactly four Scopes each, resolves the coin toss server-side, initialises all twelve board positions, and persists once. No world_selection or scope_selection command follows.',
  })
  async createUnified(
    @Param('sessionId') sessionId: string,
    @Body() body: CreateUnifiedMatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    await this.matches.createUnified({
      sessionId,
      actorId: user.id,
      occurrences: body.occurrences.map((occurrence) => ({
        occurrenceIndex: occurrence.occurrenceIndex,
        worldId: occurrence.worldId,
        selectedScopeIds: occurrence.selectedScopeIds,
      })),
    });
    return this.getSession.execute(sessionId, user.id);
  }

  /**
   * Holds a board position and reports what it needs before it can start.
   *
   * No runtime is created and no content is drawn. For a phone-required mechanic
   * this is where the join code comes from, and the preflight stays on the snapshot
   * until it is launched or cancelled.
   */
  @Post('unified/challenges/prepare')
  @ApiOperation({
    summary: 'Prepare one board position without starting it',
    description:
      "Validates the position and selection authority, resolves the mechanic and whether it needs phones, reuses the session's join access when it does, and moves the Match to its preflight stage. Starts no runtime.",
  })
  async prepareUnifiedChallenge(
    @Param('sessionId') sessionId: string,
    @Body() body: LaunchUnifiedChallengeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    await this.matches.prepareUnifiedChallenge({
      sessionId,
      actorId: user.id,
      commandId: body.commandId,
      expectedMatchRevision: body.expectedMatchRevision,
      occurrenceIndex: body.occurrenceIndex,
      slotKey: body.slotKey,
      ...(body.selectingTeamId
        ? { selectingTeamId: body.selectingTeamId }
        : {}),
    });
    return this.getSession.execute(sessionId, user.id);
  }

  /** Returns to the board. Consumes no content and changes no turn. */
  @Post('unified/challenges/cancel')
  @ApiOperation({ summary: 'Abandon a prepared board position' })
  async cancelUnifiedPreflight(
    @Param('sessionId') sessionId: string,
    @Body() body: MatchCommandDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    await this.matches.cancelUnifiedPreflight({
      sessionId,
      actorId: user.id,
      ...body,
    });
    return this.getSession.execute(sessionId, user.id);
  }

  /**
   * Launches one of the twelve board positions.
   *
   * Any available position of any occurrence, in any order. The server picks the
   * content: the request carries a position, a revision, and a command id, and
   * cannot name a ContentItem even if it wanted to.
   */
  @Post('unified/challenges/launch')
  @ApiOperation({
    summary: 'Launch one board position of a preconfigured Match',
    description:
      "Names a position by occurrenceIndex + slotKey. The server derives the World, the occurrence's Scope pool, the configured mechanic, how many ContentItems it needs, and which ones to play. Client-supplied ContentItem ids are not accepted.",
  })
  async launchUnifiedChallenge(
    @Param('sessionId') sessionId: string,
    @Body() body: LaunchUnifiedChallengeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LiveGameSessionSnapshot> {
    await this.matches.launchUnifiedChallenge({
      sessionId,
      actorId: user.id,
      commandId: body.commandId,
      expectedMatchRevision: body.expectedMatchRevision,
      occurrenceIndex: body.occurrenceIndex,
      slotKey: body.slotKey,
      ...(body.selectingTeamId
        ? { selectingTeamId: body.selectingTeamId }
        : {}),
    });
    return this.getSession.execute(sessionId, user.id);
  }
}
