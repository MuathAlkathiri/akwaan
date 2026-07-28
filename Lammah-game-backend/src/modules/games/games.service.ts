import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  Game,
  GameStatus,
  CategoryBoard,
  QuestionSelectionMode,
} from './schemas/game.schema';
import {
  CreateGameDto,
  RevealAnswerDto,
  AwardPointsDto,
  SkipQuestionDto,
} from './dto/create-game.dto';
import { CategoriesService } from '../categories/categories.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { SubscriptionAccessPolicy } from '../users/policies/subscription-access.policy';
import { QuestionHistoryService } from '../question-history/question-history.service';
import { GameRepository } from './persistence/game.repository';
import { GameActionPolicy } from './policies/game-action.policy';
import { GameLifecyclePolicy } from './policies/game-lifecycle.policy';
import { ScoringPolicy } from './policies/scoring.policy';
import { CategoryGameAssembler } from './validation/category-game-validation';

@Injectable()
export class GamesService {
  constructor(
    private readonly games: GameRepository,
    private readonly actions: GameActionPolicy,
    private readonly lifecycle: GameLifecyclePolicy,
    private readonly scoring: ScoringPolicy,
    private readonly categoryGameAssembler: CategoryGameAssembler,
    private categoriesService: CategoriesService,
    private usersService: UsersService,
    private subscriptionAccess: SubscriptionAccessPolicy,
    private questionHistoryService: QuestionHistoryService,
  ) {}

  async create(
    createGameDto: CreateGameDto,
    user: AuthenticatedUser,
  ): Promise<Game> {
    const { name, teams, categoryIds } = createGameDto;
    const owner = await this.usersService.findById(user.id);
    const isFreeGame = owner.freeGamesUsed === 0;

    // Validate exactly 2 teams
    if (teams.length !== 2) {
      throw new BadRequestException('Exactly 2 teams are required');
    }

    // Validate at least 1 category
    if (categoryIds.length === 0) {
      throw new BadRequestException('At least 1 category is required');
    }

    // Resolve the canonical category (and gameplayMode) exactly once.
    const selectedCategories = await Promise.all(
      categoryIds.map((categoryId) =>
        this.categoriesService.findByIdForGameSelection(categoryId),
      ),
    );

    if (!isFreeGame && !this.subscriptionAccess.hasActiveSubscription(owner)) {
      throw new ForbiddenException(
        'You need an active subscription to create more games.',
      );
    }

    const questionSelectionMode = isFreeGame
      ? QuestionSelectionMode.FIXED
      : QuestionSelectionMode.RANDOM;
    const seenQuestionIds = isFreeGame
      ? []
      : await this.questionHistoryService.findSeenQuestionIds(owner._id);

    // Build the game board
    const board: CategoryBoard[] = [];

    for (const category of selectedCategories) {
      const assembled = await this.categoryGameAssembler.assemble({
        category,
        isFreeGame,
        seenQuestionIds,
      });
      board.push({
        category: category._id,
        questions: assembled.boardQuestions,
      });
    }

    // Create the game
    const game = await this.games.create({
      name,
      owner: owner._id,
      isFreeGame,
      questionSelectionMode,
      teams: teams.map((t) => ({
        name: t.name,
        members: t.members || [],
        score: 0,
      })),
      selectedCategories: categoryIds.map((id) => new Types.ObjectId(id)),
      board,
      status: GameStatus.ACTIVE,
      currentTurnTeamIndex: 0,
    });

    await this.questionHistoryService.recordQuestions(
      owner._id,
      game._id,
      board.flatMap((categoryBoard) =>
        categoryBoard.questions.map((questionInGame) => ({
          category: categoryBoard.category,
          question: questionInGame.question,
        })),
      ),
    );

    if (isFreeGame) {
      await this.usersService.incrementFreeGamesUsed(owner._id);
    }

    return this.games.populate(game);
  }

  async findAll(user: AuthenticatedUser): Promise<Game[]> {
    return this.games.findAll(
      user.role === UserRole.ADMIN ? undefined : user.id,
    );
  }

  async findById(id: string, user: AuthenticatedUser): Promise<Game> {
    const game = await this.games.findById(id, true);

    if (!game) {
      throw new NotFoundException(`Game with ID "${id}" not found`);
    }

    this.actions.assertCanAccess(game, user);

    return game;
  }

  async liveGameplaySetup(id: string, gameQuestionId?: string) {
    const game = await this.games.findById(id);
    if (!game) {
      throw new NotFoundException(`Game with ID "${id}" not found`);
    }
    const allBombQuestions = game.board
      .flatMap((category) => category.questions)
      .flatMap((entry) => {
        const matchesQuestion =
          !gameQuestionId ||
          String(entry._id ?? '') === gameQuestionId ||
          String(entry.snapshot?.sourceQuestionId ?? entry.question) ===
            gameQuestionId;
        return matchesQuestion &&
          entry.snapshot?.questionType === 'bomb_sequence'
          ? [entry.snapshot]
          : [];
      });
    const bombQuestions = gameQuestionId
      ? allBombQuestions.slice(0, 1)
      : allBombQuestions;
    if (!bombQuestions.length) {
      return {
        sessionModeKey: 'core-timed-turns',
        sessionModeVersion: 1,
        runtimeModeKey: 'core-round-runtime',
        runtimeModeVersion: 1,
      };
    }
    if (
      (!gameQuestionId && bombQuestions.length !== 6) ||
      (gameQuestionId && bombQuestions.length !== 1)
    ) {
      throw new BadRequestException({
        code: 'BOMB_CATEGORY_NOT_READY',
        message: 'A playable Bomb game requires exactly six Bomb questions.',
      });
    }
    return {
      sessionModeKey: 'bomb',
      sessionModeVersion: 1,
      runtimeModeKey: 'bomb',
      runtimeModeVersion: 1,
      initialRuntimeState: {
        phase: 'ready',
        questionIndex: 0,
        questionsJson: JSON.stringify(
          bombQuestions.map((question) => ({
            id: String(question.sourceQuestionId),
            prompt: question.question,
            items: question.bombContent.items
              .slice()
              .sort((left, right) => left.order - right.order)
              .map((item) => ({
                id: item.id,
                imageUrl: item.image.url,
                altText: item.altText,
                acceptedAnswers: item.acceptedAnswers,
              })),
          })),
        ),
      },
      teamNames: game.teams.map((team) => team.name),
    };
  }

  async markLiveQuestionStarted(
    gameId: string,
    gameQuestionId: string,
  ): Promise<void> {
    const game = await this.games.findById(gameId);
    if (!game)
      throw new NotFoundException(`Game with ID "${gameId}" not found`);
    const boardQuestion = game.board
      .flatMap((category) => category.questions)
      .find(
        (entry) =>
          String(entry._id ?? '') === gameQuestionId ||
          String(entry.snapshot?.sourceQuestionId ?? entry.question) ===
            gameQuestionId,
      );
    if (!boardQuestion) throw new NotFoundException('Game question not found');
    if (boardQuestion.isAnswered) return;
    if (boardQuestion.snapshot?.questionType !== 'bomb_sequence') {
      throw new BadRequestException({
        code: 'GAME_QUESTION_NOT_BOMB',
        message: 'Only Bomb questions can be launched as Bomb sessions.',
      });
    }
    game.updatedAt = new Date();
    await game.save();
  }

  async finalizeBombQuestion(
    gameId: string,
    gameQuestionId: string,
    winnerTeamIndex: number,
  ): Promise<void> {
    const game = await this.games.findById(gameId);
    if (!game)
      throw new NotFoundException(`Game with ID "${gameId}" not found`);
    const boardQuestion = game.board
      .flatMap((category) => category.questions)
      .find(
        (entry) =>
          String(entry._id ?? '') === gameQuestionId ||
          String(entry.snapshot?.sourceQuestionId ?? entry.question) ===
            gameQuestionId,
      );
    if (!boardQuestion) throw new NotFoundException('Game question not found');
    if (boardQuestion.snapshot?.questionType !== 'bomb_sequence') {
      throw new BadRequestException({
        code: 'GAME_QUESTION_NOT_BOMB',
        message: 'Only Bomb questions can receive a Bomb result.',
      });
    }
    if (
      boardQuestion.isAnswered &&
      boardQuestion.awardedPoints === boardQuestion.points
    )
      return;
    this.scoring.assertTeamIndex(winnerTeamIndex);
    this.scoring.award(game, boardQuestion, winnerTeamIndex as 0 | 1);
    this.lifecycle.advanceTurn(game);
    if (this.lifecycle.isComplete(game)) {
      game.status = GameStatus.FINISHED;
      game.finishedAt = new Date();
    }
    game.updatedAt = new Date();
    await game.save();
  }

  async revealAnswer(
    id: string,
    revealAnswerDto: RevealAnswerDto,
    user: AuthenticatedUser,
  ): Promise<Game> {
    const game = await this.games.findById(id);

    if (!game) {
      throw new NotFoundException(`Game with ID "${id}" not found`);
    }

    this.actions.assertCanAccess(game, user);

    const questionId = new Types.ObjectId(revealAnswerDto.questionId);
    const question = this.actions.findQuestion(game, questionId);
    question.isAnswerRevealed = true;

    game.updatedAt = new Date();
    await this.saveGame(game);

    return this.games.populate(game, true);
  }

  async awardPoints(
    id: string,
    awardPointsDto: AwardPointsDto,
    teamIndex: number,
    user: AuthenticatedUser,
  ): Promise<Game> {
    this.scoring.assertTeamIndex(teamIndex);

    const game = await this.games.findById(id);

    if (!game) {
      throw new NotFoundException(`Game with ID "${id}" not found`);
    }

    this.actions.assertCanAccess(game, user);

    const questionId = new Types.ObjectId(awardPointsDto.questionId);
    const question = this.actions.findQuestion(game, questionId);
    this.actions.assertUnanswered(question);
    this.scoring.award(game, question, teamIndex);
    this.lifecycle.advanceTurn(game);

    // Check if all questions are answered
    if (this.lifecycle.isComplete(game)) {
      game.status = GameStatus.FINISHED;
      game.finishedAt = new Date();
    }

    game.updatedAt = new Date();
    await this.saveGame(game);

    return this.games.populate(game, true);
  }

  async skipQuestion(
    id: string,
    skipQuestionDto: SkipQuestionDto,
    user: AuthenticatedUser,
  ): Promise<Game> {
    const game = await this.games.findById(id);

    if (!game) {
      throw new NotFoundException(`Game with ID "${id}" not found`);
    }

    this.actions.assertCanAccess(game, user);

    const questionId = new Types.ObjectId(skipQuestionDto.questionId);
    const question = this.actions.findQuestion(game, questionId);
    this.actions.assertUnanswered(question);
    question.isAnswered = true;
    question.isAnswerRevealed = true;
    question.awardedPoints = 0;
    this.lifecycle.advanceTurn(game);

    // Check if all questions are answered
    if (this.lifecycle.isComplete(game)) {
      game.status = GameStatus.FINISHED;
      game.finishedAt = new Date();
    }

    game.updatedAt = new Date();
    await this.saveGame(game);

    return this.games.populate(game, true);
  }

  private async saveGame(game: Game): Promise<void> {
    try {
      await game.save();
    } catch (error) {
      if (error instanceof Error && error.name === 'VersionError') {
        throw new ConflictException({
          code: 'CONCURRENT_GAME_UPDATE',
          message: 'Game state changed. Reload and try again.',
        });
      }
      throw error;
    }
  }
}
