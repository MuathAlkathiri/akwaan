import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { Question } from '../../questions/schemas/question.schema';
import {
  Game,
  GameQuestionSnapshot,
  GameStatus,
  QuestionInGame,
} from '../schemas/game.schema';
import { GameRepository } from '../persistence/game.repository';
import { GameActionPolicy } from '../policies/game-action.policy';
import { GameLifecyclePolicy } from '../policies/game-lifecycle.policy';
import { ScoringPolicy } from '../policies/scoring.policy';

type LocatedQuestion = {
  boardQuestion: QuestionInGame;
  category: unknown;
};

@Injectable()
export class GameQuestionFlowService {
  constructor(
    private readonly games: GameRepository,
    private readonly actions: GameActionPolicy,
    private readonly lifecycle: GameLifecyclePolicy,
    private readonly scoring: ScoringPolicy,
  ) {}

  async question(
    gameId: string,
    gameQuestionId: string,
    user: AuthenticatedUser,
  ) {
    const game = await this.requiredGame(gameId, user);
    const located = this.locate(game, gameQuestionId);
    const snapshot = await this.snapshot(game, located);
    return this.questionView(game, located.boardQuestion, snapshot);
  }

  async reveal(
    gameId: string,
    gameQuestionId: string,
    user: AuthenticatedUser,
  ) {
    const game = await this.requiredGame(gameId, user);
    const located = this.locate(game, gameQuestionId);
    this.actions.assertUnanswered(located.boardQuestion);
    const snapshot = await this.snapshot(game, located);
    if (!located.boardQuestion.isAnswerRevealed) {
      located.boardQuestion.isAnswerRevealed = true;
      game.updatedAt = new Date();
      await this.save(game);
    }
    return this.answerView(game, located.boardQuestion, snapshot);
  }

  async answer(
    gameId: string,
    gameQuestionId: string,
    user: AuthenticatedUser,
  ) {
    const game = await this.requiredGame(gameId, user);
    const located = this.locate(game, gameQuestionId);
    if (!located.boardQuestion.isAnswerRevealed)
      throw new BadRequestException({
        code: 'GAME_QUESTION_NOT_REVEALED',
        message: 'Reveal the answer before opening the answer view.',
      });
    const snapshot = await this.snapshot(game, located);
    return this.answerView(game, located.boardQuestion, snapshot);
  }

  async submitResult(
    gameId: string,
    gameQuestionId: string,
    teamId: string | null,
    user: AuthenticatedUser,
  ): Promise<Game> {
    const game = await this.requiredGame(gameId, user);
    const { boardQuestion } = this.locate(game, gameQuestionId);
    this.actions.assertUnanswered(boardQuestion);
    if (!boardQuestion.isAnswerRevealed)
      throw new BadRequestException({
        code: 'GAME_QUESTION_NOT_REVEALED',
        message: 'Reveal the answer before submitting a result.',
      });

    if (teamId === null) {
      boardQuestion.isAnswered = true;
      boardQuestion.awardedPoints = 0;
      boardQuestion.answeredByTeamIndex = undefined;
    } else {
      const teamIndex = game.teams.findIndex(
        (team) => String(team._id) === teamId,
      );
      if (teamIndex < 0)
        throw new BadRequestException({
          code: 'GAME_TEAM_NOT_FOUND',
          message: 'The selected team does not belong to this game.',
        });
      this.scoring.assertTeamIndex(teamIndex);
      this.scoring.award(game, boardQuestion, teamIndex);
    }

    this.lifecycle.advanceTurn(game);
    if (this.lifecycle.isComplete(game)) {
      game.status = GameStatus.FINISHED;
      game.finishedAt = new Date();
    }
    game.updatedAt = new Date();
    await this.save(game);
    return this.games.populate(game);
  }

  private async requiredGame(
    gameId: string,
    user: AuthenticatedUser,
  ): Promise<Game> {
    if (!Types.ObjectId.isValid(gameId))
      throw new NotFoundException('Game not found');
    const game = await this.games.findById(gameId);
    if (!game) throw new NotFoundException('Game not found');
    this.actions.assertCanAccess(game, user);
    return game;
  }

  private locate(game: Game, gameQuestionId: string): LocatedQuestion {
    for (const category of game.board) {
      for (const boardQuestion of category.questions) {
        const embeddedId = String(boardQuestion._id ?? '');
        const sourceId = String(
          boardQuestion.snapshot?.sourceQuestionId ?? boardQuestion.question,
        );
        if (embeddedId === gameQuestionId || sourceId === gameQuestionId)
          return { boardQuestion, category: category.category };
      }
    }
    throw new NotFoundException('Question not found in this game');
  }

  private async snapshot(
    game: Game,
    located: LocatedQuestion,
  ): Promise<GameQuestionSnapshot> {
    if (located.boardQuestion.snapshot) {
      return located.boardQuestion.snapshot;
    }

    // Compatibility for games created before immutable question snapshots.
    await this.games.populate(game, true);

    const refreshed = this.locate(
      game,
      String(located.boardQuestion._id ?? located.boardQuestion.question),
    );

    const populated = refreshed.boardQuestion.question as unknown as Question;

    if (!populated || typeof populated !== 'object' || !populated.question) {
      throw new NotFoundException('Question not found in this game');
    }

    const category = refreshed.category as {
      _id?: Types.ObjectId;
      name?: string;
    };

    const baseSnapshot = {
      sourceQuestionId: populated._id,
      categoryId:
        category?._id ?? (populated.category as unknown as Types.ObjectId),
      categoryName: category?.name ?? '',
      question: populated.question,
      ...(populated.explanation ? { explanation: populated.explanation } : {}),
    };

    if (populated.questionType === 'ranked_list') {
      if (!populated.rankedList) {
        throw new NotFoundException(
          'Ranked-list data not found for this question',
        );
      }

      return {
        ...baseSnapshot,
        questionType: 'ranked_list',
        ...(populated.turnDurationSeconds
          ? { turnDurationSeconds: populated.turnDurationSeconds }
          : {}),
        ...(populated.maxStrikesPerTeam
          ? { maxStrikesPerTeam: populated.maxStrikesPerTeam }
          : {}),
        rankedList: {
          displayName: {
            ...populated.rankedList.displayName,
          },
          entries: populated.rankedList.entries.map((entry) => ({
            id: entry.id,
            rank: entry.rank,
            answer: {
              ...entry.answer,
            },
            aliases: [...entry.aliases],
            points: entry.points,
          })),
        },
      };
    }

    const answer = populated.answer?.trim();

    if (!answer) {
      throw new NotFoundException('Answer not found for this question');
    }

    return {
      ...baseSnapshot,
      questionType: 'standard',
      answer,
      acceptedAnswers: [...(populated.acceptedAnswers ?? [])],
    };
  }

  private questionView(
    game: Game,
    boardQuestion: QuestionInGame,
    snapshot: GameQuestionSnapshot,
  ) {
    return {
      gameId: String(game._id),
      gameQuestionId: String(boardQuestion._id),
      sourceQuestionId: String(snapshot.sourceQuestionId),
      category: {
        id: String(snapshot.categoryId),
        name: snapshot.categoryName,
      },
      points: boardQuestion.points,
      question: snapshot.question,
      questionType: snapshot.questionType,
      isAnswered: boardQuestion.isAnswered,
      isAnswerRevealed: boardQuestion.isAnswerRevealed,
      ...(boardQuestion.presentation
        ? { presentation: boardQuestion.presentation }
        : {}),
    };
  }

  private answerView(
    game: Game,
    boardQuestion: QuestionInGame,
    snapshot: GameQuestionSnapshot,
  ) {
    const answeredTeam =
      boardQuestion.answeredByTeamIndex === undefined
        ? undefined
        : game.teams[boardQuestion.answeredByTeamIndex];

    const baseView = {
      ...this.questionView(game, boardQuestion, snapshot),
      ...(snapshot.explanation ? { explanation: snapshot.explanation } : {}),
      teams: game.teams.map((team, teamIndex) => ({
        _id: String(team._id),
        name: team.name,
        members: team.members,
        score: team.score,
        color: team.color || (teamIndex === 1 ? 'red' : 'blue'),
      })),
      ...(answeredTeam ? { answeredByTeamId: String(answeredTeam._id) } : {}),
      ...(boardQuestion.awardedPoints !== undefined
        ? { awardedPoints: boardQuestion.awardedPoints }
        : {}),
    };

    if (snapshot.questionType === 'ranked_list') {
      return {
        ...baseView,
        rankedList: snapshot.rankedList,
      };
    }

    if (snapshot.questionType === 'bomb_sequence') {
      return {
        ...baseView,
        bombContent: {
          items: snapshot.bombContent.items.map((item) => ({
            id: item.id,
            order: item.order,
            image: item.image,
            altText: item.altText,
          })),
        },
      };
    }

    return {
      ...baseView,
      answer: snapshot.answer,
      ...(snapshot.acceptedAnswers.length
        ? { acceptedAnswers: snapshot.acceptedAnswers }
        : {}),
    };
  }

  private async save(game: Game): Promise<void> {
    try {
      await game.save();
    } catch (error) {
      if (error instanceof Error && error.name === 'VersionError')
        throw new ConflictException({
          code: 'CONCURRENT_GAME_UPDATE',
          message: 'Game state changed. Reload and try again.',
        });
      throw error;
    }
  }
}
