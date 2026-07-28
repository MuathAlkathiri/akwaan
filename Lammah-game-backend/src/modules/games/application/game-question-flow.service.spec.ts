import { Types } from 'mongoose';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../users/schemas/user.schema';
import { GameQuestionFlowService } from './game-question-flow.service';
import { GameActionPolicy } from '../policies/game-action.policy';
import { GameLifecyclePolicy } from '../policies/game-lifecycle.policy';
import { ScoringPolicy } from '../policies/scoring.policy';

describe('GameQuestionFlowService', () => {
  const ownerId = new Types.ObjectId();
  const gameId = new Types.ObjectId();
  const gameQuestionId = new Types.ObjectId();
  const sourceQuestionId = new Types.ObjectId();
  const categoryId = new Types.ObjectId();
  const teamIds = [new Types.ObjectId(), new Types.ObjectId()];
  const user = {
    id: String(ownerId),
    role: UserRole.USER,
  } as never;

  const createGame = () => {
    const save = jest.fn().mockResolvedValue(undefined);
    return {
      _id: gameId,
      owner: ownerId,
      status: 'active',
      currentTurnTeamIndex: 0,
      teams: [
        { _id: teamIds[0], name: 'A', members: [], score: 10 },
        { _id: teamIds[1], name: 'B', members: [], score: 20 },
      ],
      board: [
        {
          category: categoryId,
          questions: [
            {
              _id: gameQuestionId,
              question: sourceQuestionId,
              points: 400,
              isAnswered: false,
              isAnswerRevealed: false,
              presentation: {
                preferredType: 'image',
                type: 'text',
                mediaAvailable: false,
                fallbackReason: 'MISSING_ASSET',
              },
              snapshot: {
                sourceQuestionId,
                categoryId,
                categoryName: 'Football',
                question: 'Snapshot question',
                answer: 'Snapshot answer',
                acceptedAnswers: ['Alias'],
                questionType: 'standard',
              },
            },
          ],
        },
      ],
      save,
    };
  };

  const setup = () => {
    const game = createGame();
    const repository = {
      findById: jest.fn().mockResolvedValue(game),
      populate: jest.fn(async (value) => value),
    };
    const service = new GameQuestionFlowService(
      repository as never,
      new GameActionPolicy(),
      new GameLifecyclePolicy(),
      new ScoringPolicy(),
    );
    return { service, game, repository };
  };

  it('returns the immutable game snapshot without exposing its answer', async () => {
    const { service, repository } = setup();
    const result = await service.question(
      String(gameId),
      String(gameQuestionId),
      user,
    );
    expect(result).toMatchObject({
      gameQuestionId: String(gameQuestionId),
      sourceQuestionId: String(sourceQuestionId),
      question: 'Snapshot question',
      points: 400,
    });
    expect(result).not.toHaveProperty('answer');
    expect(repository.populate).not.toHaveBeenCalled();
  });

  it('reveals the answer once and persists the reveal state', async () => {
    const { service, game } = setup();

    const first = await service.reveal(
      String(gameId),
      String(gameQuestionId),
      user,
    );

    const second = await service.reveal(
      String(gameId),
      String(gameQuestionId),
      user,
    );

    expect(first).toMatchObject({
      answer: 'Snapshot answer',
      acceptedAnswers: ['Alias'],
    });

    expect(game.board[0].questions[0].isAnswerRevealed).toBe(true);
    expect(game.save).toHaveBeenCalledTimes(1);

    const standard = second as {
      answer: string;
      acceptedAnswers: string[];
    };

    expect(standard.answer).toBe('Snapshot answer');
    expect(standard.acceptedAnswers).toEqual(['Alias']);
  });

  it('derives awarded points from the game snapshot board value', async () => {
    const { service, game } = setup();
    game.board[0].questions[0].isAnswerRevealed = true;
    await service.submitResult(
      String(gameId),
      String(gameQuestionId),
      String(teamIds[1]),
      user,
    );
    expect(game.teams[1].score).toBe(420);
    expect(game.board[0].questions[0]).toMatchObject({
      isAnswered: true,
      awardedPoints: 400,
      answeredByTeamIndex: 1,
    });
  });

  it('rejects a team that does not belong to the game', async () => {
    const { service, game } = setup();
    game.board[0].questions[0].isAnswerRevealed = true;
    await expect(
      service.submitResult(
        String(gameId),
        String(gameQuestionId),
        String(new Types.ObjectId()),
        user,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'GAME_TEAM_NOT_FOUND' }),
    });
  });

  it('finalizes no-one exactly once without changing either score', async () => {
    const { service, game } = setup();
    game.board[0].questions[0].isAnswerRevealed = true;
    await service.submitResult(
      String(gameId),
      String(gameQuestionId),
      null,
      user,
    );
    expect(game.teams.map((team) => team.score)).toEqual([10, 20]);
    expect(game.board[0].questions[0]).toMatchObject({
      isAnswered: true,
      awardedPoints: 0,
    });
    await expect(
      service.submitResult(String(gameId), String(gameQuestionId), null, user),
    ).rejects.toThrow('Question is already answered');
  });

  it('requires reveal before accepting a result', async () => {
    const { service } = setup();
    await expect(
      service.submitResult(String(gameId), String(gameQuestionId), null, user),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'GAME_QUESTION_NOT_REVEALED',
      }),
    });
  });

  it('rejects a question ID outside the requested game', async () => {
    const { service } = setup();
    await expect(
      service.question(
        gameId.toString(),
        new Types.ObjectId().toString(),
        user,
      ),
    ).rejects.toThrow('Question not found in this game');
  });

  it('prevents another owner from viewing or scoring the game', async () => {
    const { service } = setup();
    await expect(
      service.question(String(gameId), String(gameQuestionId), {
        id: String(new Types.ObjectId()),
        role: UserRole.USER,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
