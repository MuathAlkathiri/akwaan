import {
  Body,
  Controller,
  Get,
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
import {
  CreateGameplayRuntime,
  GetGameplayRuntime,
} from '../application/gameplay-runtime.queries';
import {
  CancelGameplayRound,
  CancelGameplayRuntime,
  CompleteGameplayRound,
  CompleteGameplayRuntime,
  CreateGameplayRound,
  PauseGameplayRound,
  ResumeGameplayRound,
  StartGameplayRound,
  StartGameplayRuntime,
} from '../application/gameplay-runtime.lifecycle';
import { SubmitGameplayCommand } from '../application/submit-gameplay-command.use-case';
import { LiveSessionActor } from '../application/live-session-actor';
import {
  CompleteGameplayRoundDto,
  CreateGameplayRoundDto,
  CreateGameplayRuntimeDto,
  GameplayRuntimeMutationDto,
  SubmitGameplayCommandDto,
  StartRyoGameplayDto,
  StartTop10PoisonDeckDto,
} from './gameplay-runtime.dto';
import { LiveSessionHttpExceptionFilter } from './live-session-http-exception.filter';
import { StartBombGameplay } from '../application/start-bomb-gameplay.use-case';
import { StartRyoGameplay } from '../application/start-ryo-gameplay.use-case';
import { StartTop10PoisonDeck } from '../application/start-top10-poison-deck.use-case';

@ApiTags('live-gameplay-runtime')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseFilters(LiveSessionHttpExceptionFilter)
@Controller('live-game-sessions/:sessionId/runtime')
export class GameplayRuntimeController {
  constructor(
    private readonly createRuntime: CreateGameplayRuntime,
    private readonly getRuntime: GetGameplayRuntime,
    private readonly startRuntime: StartGameplayRuntime,
    private readonly createRound: CreateGameplayRound,
    private readonly startRound: StartGameplayRound,
    private readonly pauseRound: PauseGameplayRound,
    private readonly resumeRound: ResumeGameplayRound,
    private readonly completeRound: CompleteGameplayRound,
    private readonly cancelRound: CancelGameplayRound,
    private readonly submitCommand: SubmitGameplayCommand,
    private readonly completeRuntime: CompleteGameplayRuntime,
    private readonly cancelRuntime: CancelGameplayRuntime,
    private readonly startBomb: StartBombGameplay,
    private readonly startRyo: StartRyoGameplay,
    private readonly startTop10: StartTop10PoisonDeck,
  ) {}

  @Post()
  create(
    @Param('sessionId') sessionId: string,
    @Body() body: CreateGameplayRuntimeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createRuntime.execute({
      sessionId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('development/top-10/poison-deck/start')
  top10PoisonDeckStart(
    @Param('sessionId') sessionId: string,
    @Body() body: StartTop10PoisonDeckDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.startTop10.execute({ sessionId, actorId: user.id, ...body });
  }

  @Post('development/ryo/start')
  ryoStart(
    @Param('sessionId') sessionId: string,
    @Body() body: StartRyoGameplayDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.startRyo.execute({ sessionId, actorId: user.id, ...body });
  }

  @Post('bomb/start')
  bombStart(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.startBomb.execute(sessionId, user.id);
  }

  @Get()
  get(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.getRuntime.execute(sessionId, this.actor(user));
  }

  @Post('start')
  start(
    @Param('sessionId') sessionId: string,
    @Body() body: GameplayRuntimeMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.startRuntime.execute({
      sessionId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('rounds')
  round(
    @Param('sessionId') sessionId: string,
    @Body() body: CreateGameplayRoundDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createRound.execute({
      sessionId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('rounds/:roundId/start')
  roundStart(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() body: GameplayRuntimeMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.startRound.execute({
      sessionId,
      roundId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('rounds/:roundId/pause')
  roundPause(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() body: GameplayRuntimeMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pauseRound.execute({
      sessionId,
      roundId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('rounds/:roundId/resume')
  roundResume(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() body: GameplayRuntimeMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.resumeRound.execute({
      sessionId,
      roundId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('rounds/:roundId/complete')
  roundComplete(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() body: CompleteGameplayRoundDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.completeRound.execute({
      sessionId,
      roundId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('rounds/:roundId/cancel')
  roundCancel(
    @Param('sessionId') sessionId: string,
    @Param('roundId') roundId: string,
    @Body() body: GameplayRuntimeMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cancelRound.execute({
      sessionId,
      roundId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('commands')
  command(
    @Param('sessionId') sessionId: string,
    @Body() body: SubmitGameplayCommandDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.submitCommand.execute({
      sessionId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('complete')
  complete(
    @Param('sessionId') sessionId: string,
    @Body() body: GameplayRuntimeMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.completeRuntime.execute({
      sessionId,
      actor: this.actor(user),
      ...body,
    });
  }

  @Post('cancel')
  cancel(
    @Param('sessionId') sessionId: string,
    @Body() body: GameplayRuntimeMutationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cancelRuntime.execute({
      sessionId,
      actor: this.actor(user),
      ...body,
    });
  }

  private actor(user: AuthenticatedUser): LiveSessionActor {
    return { kind: 'user', actorId: user.id };
  }
}
