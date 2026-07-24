import { Types } from 'mongoose';
import {
  Category,
  CategoryGameplayMode,
} from '../categories/schemas/category.schema';
import { GamesService } from './games.service';

describe('GamesService category gameplay assembly', () => {
  it('assembles mixed STANDARD and TOP_10 categories through their resolved canonical modes', async () => {
    const standardCategory = {
      _id: new Types.ObjectId(),
      gameplayMode: CategoryGameplayMode.STANDARD,
    } as Category;
    const top10Category = {
      _id: new Types.ObjectId(),
      gameplayMode: CategoryGameplayMode.TOP_10,
    } as Category;
    const standardQuestionIds = Array.from(
      { length: 6 },
      () => new Types.ObjectId(),
    );
    const top10QuestionId = new Types.ObjectId();
    const games = {
      create: jest.fn(async (payload) => ({
        _id: new Types.ObjectId(),
        ...payload,
      })),
      populate: jest.fn(async (game) => game),
    };
    const assembler = {
      assemble: jest.fn(async ({ category }: { category: Category }) =>
        category.gameplayMode === CategoryGameplayMode.TOP_10
          ? {
              boardQuestions: [
                {
                  question: top10QuestionId,
                  points: 600,
                  isAnswered: false,
                  isAnswerRevealed: false,
                },
              ],
            }
          : {
              boardQuestions: standardQuestionIds.map((question, index) => ({
                question,
                points: ([200, 200, 400, 400, 600, 600] as const)[index],
                isAnswered: false,
                isAnswerRevealed: false,
              })),
            },
      ),
    };
    const categories = {
      findByIdForGameSelection: jest.fn(async (id: string) =>
        id === String(standardCategory._id) ? standardCategory : top10Category,
      ),
    };
    const users = {
      findById: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        freeGamesUsed: 1,
      }),
    };
    const history = {
      findSeenQuestionIds: jest.fn().mockResolvedValue([]),
      recordQuestions: jest.fn(),
    };
    const service = new GamesService(
      games as never,
      {} as never,
      {} as never,
      {} as never,
      assembler as never,
      categories as never,
      users as never,
      { hasActiveSubscription: jest.fn().mockReturnValue(true) } as never,
      history as never,
    );
    const result = await service.create(
      {
        name: 'Mixed game',
        teams: [
          { name: 'A', members: [] },
          { name: 'B', members: [] },
        ],
        categoryIds: [String(standardCategory._id), String(top10Category._id)],
      },
      { id: String(new Types.ObjectId()) } as never,
    );
    const board = result.board;
    expect(assembler.assemble).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ category: standardCategory }),
    );
    expect(assembler.assemble).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ category: top10Category }),
    );
    expect(board[0].questions.map((item) => item.points)).toEqual([
      200, 200, 400, 400, 600, 600,
    ]);
    expect(board[1].questions).toEqual([
      expect.objectContaining({
        question: top10QuestionId,
        points: 600,
      }),
    ]);
    expect(board[0].questions).not.toContainEqual(
      expect.objectContaining({ question: top10QuestionId }),
    );
    expect(history.recordQuestions).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ question: top10QuestionId }),
      ]),
    );
  });
});
