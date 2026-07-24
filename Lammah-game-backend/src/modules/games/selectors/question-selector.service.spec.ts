import { Types } from 'mongoose';
import { QuestionRepository } from '../../questions/persistence/question.repository';
import {
  AssetStatus,
  QuestionAssetType,
  QuestionGameplayType,
  QuestionPoints,
  QuestionType,
} from '../../questions/schemas/question.schema';
import { QuestionMediaAvailabilityPolicy } from '../../questions/application/question-media-availability.policy';
import { QuestionSelectorService } from './question-selector.service';

describe('QuestionSelectorService', () => {
  const question = (id: Types.ObjectId) => ({ _id: id });
  const createSelector = (repository: QuestionRepository) =>
    new QuestionSelectorService(
      repository,
      new QuestionMediaAvailabilityPolicy(),
    );

  it('excludes seen questions when two unseen candidates are available', async () => {
    const seen = new Types.ObjectId();
    const unseenA = new Types.ObjectId();
    const unseenB = new Types.ObjectId();
    const repository = {
      findEligibleForGame: jest
        .fn()
        .mockResolvedValue([
          question(seen),
          question(unseenA),
          question(unseenB),
        ]),
    } as unknown as QuestionRepository;
    const selector = createSelector(repository);
    jest.spyOn(Math, 'random').mockReturnValue(0);

    const selected = await selector.select({
      categoryId: new Types.ObjectId().toString(),
      points: QuestionPoints.LOW,
      isFreeGame: false,
      seenQuestionIds: [seen],
    });

    expect(selected.map((item) => String(item._id)).sort()).toEqual(
      [String(unseenA), String(unseenB)].sort(),
    );
    expect(repository.findEligibleForGame).toHaveBeenCalledWith(
      expect.objectContaining({
        questionType: QuestionGameplayType.STANDARD,
        points: QuestionPoints.LOW,
      }),
    );
    jest.restoreAllMocks();
  });

  it('keeps fixed free-game ordering', async () => {
    const ids = [
      new Types.ObjectId(),
      new Types.ObjectId(),
      new Types.ObjectId(),
    ];
    const repository = {
      findEligibleForGame: jest.fn().mockResolvedValue(ids.map(question)),
    } as unknown as QuestionRepository;
    const selector = createSelector(repository);
    const selected = await selector.select({
      categoryId: new Types.ObjectId().toString(),
      points: QuestionPoints.LOW,
      isFreeGame: true,
      seenQuestionIds: [],
    });
    expect(selected.map((item) => String(item._id))).toEqual(
      ids.slice(0, 2).map(String),
    );
  });

  it('selects TOP_10 only from ranked-list questions and keeps one record', async () => {
    const ids = [new Types.ObjectId(), new Types.ObjectId()];
    const repository = {
      findEligibleForGame: jest.fn().mockResolvedValue(ids.map(question)),
    } as unknown as QuestionRepository;
    const selector = createSelector(repository);
    const selected = await selector.selectTop10({
      categoryId: new Types.ObjectId().toString(),
      isFreeGame: true,
      seenQuestionIds: [],
    });
    expect(selected).toHaveLength(1);
    expect(repository.findEligibleForGame).toHaveBeenCalledWith(
      expect.objectContaining({
        questionType: QuestionGameplayType.RANKED_LIST,
      }),
    );
  });

  it('prefers effective media variety without moving point buckets', async () => {
    const candidates = [
      {
        _id: new Types.ObjectId(),
        points: QuestionPoints.HIGH,
        type: QuestionType.TEXT,
      },
      {
        _id: new Types.ObjectId(),
        points: QuestionPoints.HIGH,
        type: QuestionType.TEXT,
      },
      {
        _id: new Types.ObjectId(),
        points: QuestionPoints.HIGH,
        type: QuestionType.IMAGE,
        assetStatus: AssetStatus.READY,
        primaryAsset: {
          type: QuestionAssetType.IMAGE,
          url: '/ready.jpg',
        },
      },
    ];
    const repository = {
      findEligibleForGame: jest.fn().mockResolvedValue(candidates),
    } as unknown as QuestionRepository;
    const selector = createSelector(repository);
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const selected = await selector.select({
      categoryId: new Types.ObjectId().toString(),
      points: QuestionPoints.HIGH,
      isFreeGame: false,
      seenQuestionIds: [],
    });
    expect(selected).toHaveLength(2);
    expect(selected.every((item) => item.points === QuestionPoints.HIGH)).toBe(
      true,
    );
    expect(selected.some((item) => item.type === QuestionType.IMAGE)).toBe(
      true,
    );
    jest.restoreAllMocks();
  });
});
