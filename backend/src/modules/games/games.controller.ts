import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateGameService } from './application/create-game.service';
import { QueryGameService } from './application/query-game.service';
import { GameProgressService } from './application/game-progress.service';
import { GameScoringService } from './application/game-scoring.service';
import { RankedListRoundService } from './application/ranked-list-round.service';
import { GameQuestionFlowService } from './application/game-question-flow.service';
import { GameResponseMapper } from './mappers/game-response.mapper';
import {
  GameDetailResponseDto,
  GameListResponseDto,
  GameMutationResponseDto,
  GameCreationValidationErrorDto,
} from './dto/game-response.dto';
import {
  CreateGameDto,
  RevealAnswerDto,
  AwardPointsDto,
  SkipQuestionDto,
  AdjustGameScoreDto,
} from './dto/create-game.dto';
import {
  ExpireRankedListTurnDto,
  RankedListRoundActionEnvelopeDto,
  RankedListRoundStateEnvelopeDto,
  StartRankedListRoundDto,
  SubmitRankedListAnswerDto,
} from './dto/ranked-list-round.dto';
import {
  GameQuestionAnswerEnvelopeDto,
  GameQuestionViewEnvelopeDto,
  SubmitGameQuestionResultDto,
} from './dto/game-question-flow.dto';
import { Game } from './schemas/game.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import {
  gameExample,
  ids,
  revealedGameExample,
} from '../../common/swagger/examples';

@ApiTags('Games')
@ApiBearerAuth()
@Controller('games')
@UseGuards(JwtAuthGuard)
export class GamesController {
  constructor(
    private readonly createGame: CreateGameService,
    private readonly queryGames: QueryGameService,
    private readonly progress: GameProgressService,
    private readonly scoring: GameScoringService,
    private readonly rankedListRounds: RankedListRoundService,
    private readonly questionFlow: GameQuestionFlowService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'gamesCreate',
    summary: 'Create a new game with 2 teams',
  })
  @ApiBody({
    type: CreateGameDto,
    examples: {
      default: {
        summary: 'Create game',
        value: {
          name: 'Friday Family Game',
          teams: [
            {
              name: 'Team Falcons',
              members: ['Muath', 'Sara'],
              color: 'blue',
            },
            {
              name: 'Team Stars',
              members: ['Noura', 'Fahad'],
              color: 'red',
            },
          ],
          categoryIds: [ids.category, ids.categoryTwo],
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Game created successfully',
    type: GameMutationResponseDto,
    schema: {
      example: {
        statusCode: 201,
        message: 'Game created successfully',
        data: gameExample,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - validation error',
    type: GameCreationValidationErrorDto,
    schema: {
      example: {
        statusCode: 400,
        message: 'Exactly 2 teams are required',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Subscription required after free game is used',
    schema: {
      example: {
        statusCode: 403,
        message: 'You need an active subscription to create more games.',
        error: 'Forbidden',
      },
    },
  })
  async create(
    @Body() createGameDto: CreateGameDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    statusCode: number;
    message: string;
    data: Game;
  }> {
    const game = await this.createGame.execute(createGameDto, user);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Game created successfully',
      data: GameResponseMapper.toResponse(game) as unknown as Game,
    };
  }

  @Get()
  @ApiOperation({ operationId: 'gamesList', summary: 'Get all games' })
  @ApiResponse({
    status: 200,
    description: 'Games retrieved successfully',
    type: GameListResponseDto,
    schema: {
      example: {
        statusCode: 200,
        data: [gameExample],
      },
    },
  })
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<{
    statusCode: number;
    data: Game[];
  }> {
    const games = await this.queryGames.list(user);
    return {
      statusCode: HttpStatus.OK,
      data: GameResponseMapper.toResponseList(games) as unknown as Game[],
    };
  }

  @Post(':id/replay')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'gamesReplay',
    summary: 'Replay a game using the same immutable question snapshots',
  })
  @ApiResponse({
    status: 201,
    description: 'Game replay created successfully',
    type: GameMutationResponseDto,
  })
  async replay(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    statusCode: number;
    message: string;
    data: Game;
  }> {
    const game = await this.createGame.replay(id, user);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Game replay created successfully',
      data: GameResponseMapper.toResponse(game) as unknown as Game,
    };
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'gamesGetById',
    summary: 'Get a specific game by ID',
  })
  @ApiParam({
    name: 'id',
    example: ids.game,
    description: 'Game MongoDB ObjectId',
  })
  @ApiResponse({
    status: 200,
    description: 'Game retrieved successfully. Answers hidden by default.',
    type: GameDetailResponseDto,
    schema: {
      example: {
        statusCode: 200,
        data: gameExample,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Game not found',
    schema: {
      example: {
        statusCode: 404,
        message: `Game with ID "${ids.game}" not found`,
        error: 'Not Found',
      },
    },
  })
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    statusCode: number;
    data: Game;
  }> {
    const game = await this.queryGames.get(id, user);
    return {
      statusCode: HttpStatus.OK,
      data: GameResponseMapper.toResponse(game) as unknown as Game,
    };
  }

  @Get(':id/questions/:gameQuestionId')
  @ApiOperation({
    operationId: 'gamesGetQuestionView',
    summary: 'Get one immutable game-question snapshot without its answer',
  })
  @ApiResponse({ status: 200, type: GameQuestionViewEnvelopeDto })
  @ApiResponse({ status: 404, description: 'Game or question not found' })
  async getQuestionView(
    @Param('id') id: string,
    @Param('gameQuestionId') gameQuestionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.questionFlow.question(id, gameQuestionId, user),
    };
  }

  @Post(':id/questions/:gameQuestionId/reveal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'gamesRevealQuestionView',
    summary: 'Reveal one game-question answer idempotently',
  })
  @ApiResponse({ status: 200, type: GameQuestionAnswerEnvelopeDto })
  async revealQuestionView(
    @Param('id') id: string,
    @Param('gameQuestionId') gameQuestionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.questionFlow.reveal(id, gameQuestionId, user),
    };
  }

  @Get(':id/questions/:gameQuestionId/answer')
  @ApiOperation({
    operationId: 'gamesGetQuestionAnswerView',
    summary: 'Get a previously revealed game-question answer',
  })
  @ApiResponse({ status: 200, type: GameQuestionAnswerEnvelopeDto })
  @ApiResponse({ status: 400, description: 'Answer is not revealed' })
  async getQuestionAnswerView(
    @Param('id') id: string,
    @Param('gameQuestionId') gameQuestionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.questionFlow.answer(id, gameQuestionId, user),
    };
  }

  @Post(':id/questions/:gameQuestionId/result')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'gamesSubmitQuestionResult',
    summary: 'Finalize a game question for a team or no one',
  })
  @ApiBody({ type: SubmitGameQuestionResultDto })
  @ApiResponse({ status: 200, type: GameMutationResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid team, unrevealed answer, or already answered',
  })
  async submitQuestionResult(
    @Param('id') id: string,
    @Param('gameQuestionId') gameQuestionId: string,
    @Body() dto: SubmitGameQuestionResultDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const game = await this.questionFlow.submitResult(
      id,
      gameQuestionId,
      dto.teamId,
      user,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Question result submitted successfully',
      data: GameResponseMapper.toResponse(game),
    };
  }

  @Post(':id/reveal-answer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'gamesRevealAnswer',
    summary: 'Reveal the correct answer for a question',
  })
  @ApiParam({
    name: 'id',
    example: ids.game,
    description: 'Game MongoDB ObjectId',
  })
  @ApiBody({
    type: RevealAnswerDto,
    examples: {
      default: {
        summary: 'Reveal answer',
        value: {
          questionId: ids.question,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Answer revealed successfully',
    type: GameMutationResponseDto,
    schema: {
      example: {
        statusCode: 200,
        message: 'Answer revealed successfully',
        data: revealedGameExample,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - question not found in game',
    schema: {
      example: {
        statusCode: 400,
        message: 'Question not found in this game board',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Game not found' })
  async revealAnswer(
    @Param('id') id: string,
    @Body() revealAnswerDto: RevealAnswerDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    statusCode: number;
    message: string;
    data: Game;
  }> {
    const game = await this.progress.reveal(id, revealAnswerDto, user);
    return {
      statusCode: HttpStatus.OK,
      message: 'Answer revealed successfully',
      data: GameResponseMapper.toResponse(game) as unknown as Game,
    };
  }

  @Post(':id/award-points')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'gamesAwardPoints',
    summary: 'Award points to a team for answering correctly',
  })
  @ApiParam({
    name: 'id',
    example: ids.game,
    description: 'Game MongoDB ObjectId',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['questionId', 'teamIndex'],
      properties: {
        questionId: {
          type: 'string',
          example: ids.question,
        },
        teamIndex: {
          type: 'number',
          example: 0,
        },
      },
    },
    examples: {
      default: {
        summary: 'Award points to team 0',
        value: {
          questionId: ids.question,
          teamIndex: 0,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Points awarded successfully',
    type: GameMutationResponseDto,
    schema: {
      example: {
        statusCode: 200,
        message: 'Points awarded successfully',
        data: {
          ...revealedGameExample,
          teams: [
            { name: 'Team Falcons', members: ['Muath', 'Sara'], score: 200 },
            { name: 'Team Stars', members: ['Noura', 'Fahad'], score: 0 },
          ],
          currentTurnTeamIndex: 1,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - invalid teamIndex or question already answered',
    schema: {
      example: {
        statusCode: 400,
        message: 'Question is already answered',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Game not found' })
  async awardPoints(
    @Param('id') id: string,
    @Body() awardPointsDto: AwardPointsDto & { teamIndex: number },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    statusCode: number;
    message: string;
    data: Game;
  }> {
    const { teamIndex, ...dto } = awardPointsDto;

    if (teamIndex === undefined || teamIndex === null) {
      throw new BadRequestException(
        'teamIndex is required in the request body',
      );
    }

    const game = await this.scoring.award(id, dto, teamIndex, user);
    return {
      statusCode: HttpStatus.OK,
      message: 'Points awarded successfully',
      data: GameResponseMapper.toResponse(game) as unknown as Game,
    };
  }

  @Post(':id/adjust-score')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'gamesAdjustScore',
    summary: 'Manually adjust one team score by 50 points',
  })
  @ApiBody({ type: AdjustGameScoreDto })
  @ApiResponse({ status: 200, type: GameMutationResponseDto })
  async adjustScore(
    @Param('id') id: string,
    @Body() dto: AdjustGameScoreDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const game = await this.scoring.adjust(id, dto, user);
    return {
      statusCode: HttpStatus.OK,
      message: 'Score adjusted successfully',
      data: GameResponseMapper.toResponse(game),
    };
  }

  @Post(':id/change-turn')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'gamesChangeTurn',
    summary: 'Manually switch the active team',
  })
  @ApiResponse({ status: 200, type: GameMutationResponseDto })
  async changeTurn(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const game = await this.progress.changeTurn(id, user);
    return {
      statusCode: HttpStatus.OK,
      message: 'Turn changed successfully',
      data: GameResponseMapper.toResponse(game),
    };
  }

  @Post(':id/skip-question')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'gamesSkipQuestion',
    summary: 'Skip a question without awarding points',
  })
  @ApiParam({
    name: 'id',
    example: ids.game,
    description: 'Game MongoDB ObjectId',
  })
  @ApiBody({
    type: SkipQuestionDto,
    examples: {
      default: {
        summary: 'Skip question',
        value: {
          questionId: ids.question,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Question skipped successfully',
    type: GameMutationResponseDto,
    schema: {
      example: {
        statusCode: 200,
        message: 'Question skipped successfully',
        data: {
          ...revealedGameExample,
          currentTurnTeamIndex: 1,
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - question already answered',
    schema: {
      example: {
        statusCode: 400,
        message: 'Question is already answered',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Game not found' })
  async skipQuestion(
    @Param('id') id: string,
    @Body() skipQuestionDto: SkipQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    statusCode: number;
    message: string;
    data: Game;
  }> {
    const game = await this.progress.skip(id, skipQuestionDto, user);
    return {
      statusCode: HttpStatus.OK,
      message: 'Question skipped successfully',
      data: GameResponseMapper.toResponse(game) as unknown as Game,
    };
  }

  @Post(':id/ranked-list-rounds/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'gamesStartRankedListRound',
    summary: 'Start or resume a ranked-list round',
  })
  @ApiResponse({ status: 200, type: RankedListRoundActionEnvelopeDto })
  async startRankedListRound(
    @Param('id') id: string,
    @Body() dto: StartRankedListRoundDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.rankedListRounds.start(id, dto.questionId, user),
    };
  }

  @Get(':id/ranked-list-rounds/:questionId')
  @ApiOperation({
    operationId: 'gamesGetRankedListRoundState',
    summary: 'Get backend-authoritative ranked-list round state',
  })
  @ApiResponse({ status: 200, type: RankedListRoundStateEnvelopeDto })
  async getRankedListRoundState(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.rankedListRounds.getState(id, questionId, user),
    };
  }

  @Post(':id/ranked-list-rounds/:questionId/answers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'gamesSubmitRankedListAnswer',
    summary: 'Submit the active team ranked-list answer',
  })
  @ApiResponse({ status: 200, type: RankedListRoundActionEnvelopeDto })
  async submitRankedListAnswer(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: SubmitRankedListAnswerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.rankedListRounds.submit(id, questionId, dto, user),
    };
  }

  @Post(':id/ranked-list-rounds/:questionId/expire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'gamesExpireRankedListTurn',
    summary: 'Expire the current ranked-list turn idempotently',
  })
  @ApiResponse({ status: 200, type: RankedListRoundActionEnvelopeDto })
  async expireRankedListTurn(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: ExpireRankedListTurnDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.rankedListRounds.expire(id, questionId, dto, user),
    };
  }

  @Post(':id/ranked-list-rounds/:questionId/finalize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'gamesFinalizeRankedListRound',
    summary: 'Finalize a completed ranked-list round idempotently',
  })
  @ApiResponse({ status: 200, type: RankedListRoundActionEnvelopeDto })
  async finalizeRankedListRound(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      statusCode: HttpStatus.OK,
      data: await this.rankedListRounds.finalize(id, questionId, user),
    };
  }
}
