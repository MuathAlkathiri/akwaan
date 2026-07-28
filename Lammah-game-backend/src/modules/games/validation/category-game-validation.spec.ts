import { Types } from 'mongoose';
import {
  Category,
  CategoryGameplayMode,
} from '../../categories/schemas/category.schema';
import {
  AssetStatus,
  AudioAssetStatus,
  AudioReviewStatus,
  Question,
  QuestionAssetType,
  QuestionGameplayType,
  QuestionPoints,
  QuestionType,
} from '../../questions/schemas/question.schema';
import {
  RankedListQuestionPolicy,
  TOP_10_ENTRY_POINTS,
} from '../../questions/application/ranked-list-question.policy';
import { QuestionMediaAvailabilityPolicy } from '../../questions/application/question-media-availability.policy';
import {
  CategoryGameAssembler,
  CategoryGameValidationRegistry,
  GameQuestionMediaValidation,
  StandardCategoryGameValidation,
  Top10CategoryGameValidation,
} from './category-game-validation';

const mediaValidation = () =>
  new GameQuestionMediaValidation(new QuestionMediaAvailabilityPolicy());

const category = (gameplayMode: CategoryGameplayMode) =>
  ({
    _id: new Types.ObjectId(),
    catalogId: new Types.ObjectId(),
    gameplayMode,
  }) as unknown as Category;

const standardQuestion = (
  points: QuestionPoints,
  type: QuestionType = QuestionType.TEXT,
) =>
  ({
    _id: new Types.ObjectId(),
    points,
    type,
    questionType: QuestionGameplayType.STANDARD,
    ...(type === QuestionType.IMAGE
      ? {
          assetStatus: AssetStatus.READY,
          primaryAsset: {
            type: QuestionAssetType.IMAGE,
            url: '/image.jpg',
            source: 'upload',
          },
        }
      : {}),
  }) as unknown as Question;

const top10Question = (
  type: QuestionType = QuestionType.TEXT,
  overrides: Record<string, unknown> = {},
) =>
  ({
    _id: new Types.ObjectId(),
    points: QuestionPoints.HIGH,
    type,
    questionType: QuestionGameplayType.RANKED_LIST,
    rankedList: {
      displayName: { ar: 'أفضل عشرة' },
      entries: TOP_10_ENTRY_POINTS.map((points, index) => ({
        id: `entry-${index}`,
        rank: index + 1,
        answer: { ar: `الإجابة ${index + 1}` },
        aliases: [`بديل ${index + 1}`],
        points,
      })),
    },
    ...(type === QuestionType.IMAGE
      ? {
          assetStatus: AssetStatus.READY,
          primaryAsset: {
            type: QuestionAssetType.IMAGE,
            url: '/image.jpg',
            source: 'upload',
          },
        }
      : {}),
    ...(type === QuestionType.AUDIO || type === QuestionType.VIDEO
      ? {
          requiresAudio: true,
          audioStatus: AudioAssetStatus.READY,
          assetStatus: AssetStatus.READY,
          audioReviewStatus: AudioReviewStatus.APPROVED,
          audioAsset: {
            type:
              type === QuestionType.VIDEO
                ? QuestionAssetType.VIDEO
                : QuestionAssetType.AUDIO,
            url: '/media',
            source: 'upload',
          },
          primaryAsset: {
            type:
              type === QuestionType.VIDEO
                ? QuestionAssetType.VIDEO
                : QuestionAssetType.AUDIO,
            url: '/media',
            source: 'upload',
          },
        }
      : {}),
    ...overrides,
  }) as unknown as Question;

describe('category gameplay validation', () => {
  const context = (mode: CategoryGameplayMode) => ({
    category: category(mode),
    isFreeGame: false,
    seenQuestionIds: [],
  });

  it('passes STANDARD only with two questions in every authored bucket', async () => {
    const selector = {
      select: jest.fn(({ points }) =>
        Promise.resolve([standardQuestion(points), standardQuestion(points)]),
      ),
    };
    const result = await new StandardCategoryGameValidation(
      selector as never,
    ).validate(context(CategoryGameplayMode.STANDARD));
    expect(result.status).toBe('PASS');
    expect(result.boardQuestions.map((item) => item.points)).toEqual([
      200, 200, 400, 400, 600, 600,
    ]);
  });

  it('fails six 600-point questions instead of remapping their slots', async () => {
    const selector = {
      select: jest.fn(({ points }) =>
        Promise.resolve(
          points === QuestionPoints.HIGH
            ? Array.from({ length: 2 }, () => standardQuestion(points))
            : [],
        ),
      ),
    };
    const result = await new StandardCategoryGameValidation(
      selector as never,
    ).validate(context(CategoryGameplayMode.STANDARD));
    expect(result.issues[0].code).toBe('STANDARD_MISSING_200_QUESTIONS');
  });

  it('reports the missing 200 bucket with structured counts', async () => {
    const selector = {
      select: jest.fn(({ points }) =>
        Promise.resolve(
          Array.from({ length: points === QuestionPoints.LOW ? 1 : 2 }, () =>
            standardQuestion(points),
          ),
        ),
      ),
    };
    const result = await new StandardCategoryGameValidation(
      selector as never,
    ).validate(context(CategoryGameplayMode.STANDARD));
    expect(result.issues[0]).toMatchObject({
      code: 'STANDARD_MISSING_200_QUESTIONS',
      requiredCounts: { '200': 2, '400': 2, '600': 2 },
      actualCounts: { '200': 1, '400': 2, '600': 2 },
    });
  });

  it('keeps a STANDARD image question in its authored bucket', async () => {
    const selector = {
      select: jest.fn(({ points }) =>
        Promise.resolve([
          standardQuestion(points, QuestionType.IMAGE),
          standardQuestion(points),
        ]),
      ),
    };
    const result = await new StandardCategoryGameValidation(
      selector as never,
    ).validate(context(CategoryGameplayMode.STANDARD));
    expect(result.status).toBe('PASS');
    mediaValidation().validate(
      context(CategoryGameplayMode.STANDARD).category,
      CategoryGameplayMode.STANDARD,
      result.questions,
    );
  });

  it.each([
    QuestionType.TEXT,
    QuestionType.IMAGE,
    QuestionType.AUDIO,
    QuestionType.VIDEO,
  ])('validates TOP_10 independently of %s presentation', async (type) => {
    const question = top10Question(type);
    const validator = new Top10CategoryGameValidation(
      { selectTop10: jest.fn().mockResolvedValue([question]) } as never,
      new RankedListQuestionPolicy(),
    );
    const result = await validator.validate(
      context(CategoryGameplayMode.TOP_10),
    );
    expect(result.status).toBe('PASS');
    expect(result.boardQuestions).toHaveLength(1);
    mediaValidation().validate(
      context(CategoryGameplayMode.TOP_10).category,
      CategoryGameplayMode.TOP_10,
      result.questions,
    );
  });

  it('fails TOP_10 with no approved ranked-list question', async () => {
    const validator = new Top10CategoryGameValidation(
      { selectTop10: jest.fn().mockResolvedValue([]) } as never,
      new RankedListQuestionPolicy(),
    );
    const result = await validator.validate(
      context(CategoryGameplayMode.TOP_10),
    );
    expect(result.issues[0].code).toBe('TOP10_NO_APPROVED_QUESTIONS');
  });

  it('fails TOP_10 answer count', async () => {
    const question = top10Question();
    question.rankedList!.entries.pop();
    const result = await new Top10CategoryGameValidation(
      { selectTop10: jest.fn().mockResolvedValue([question]) } as never,
      new RankedListQuestionPolicy(),
    ).validate(context(CategoryGameplayMode.TOP_10));
    expect(result.issues[0].code).toBe('TOP10_INVALID_ANSWER_COUNT');
  });

  it('fails TOP_10 score sequence', async () => {
    const question = top10Question();
    question.rankedList!.entries[0].points = 11;
    const result = await new Top10CategoryGameValidation(
      { selectTop10: jest.fn().mockResolvedValue([question]) } as never,
      new RankedListQuestionPolicy(),
    ).validate(context(CategoryGameplayMode.TOP_10));
    expect(result.issues[0].code).toBe('TOP10_INVALID_SCORE_SEQUENCE');
  });

  it('fails duplicate normalized TOP_10 answers', async () => {
    const question = top10Question();
    question.rankedList!.entries[1].answer.ar = 'الإِجابة 1';
    const result = await new Top10CategoryGameValidation(
      { selectTop10: jest.fn().mockResolvedValue([question]) } as never,
      new RankedListQuestionPolicy(),
    ).validate(context(CategoryGameplayMode.TOP_10));
    expect(result.issues[0].code).toBe('TOP10_DUPLICATE_ANSWER');
  });

  it('fails invalid TOP_10 ranks separately', async () => {
    const question = top10Question();
    question.rankedList!.entries[1].rank = 1;
    const result = await new Top10CategoryGameValidation(
      { selectTop10: jest.fn().mockResolvedValue([question]) } as never,
      new RankedListQuestionPolicy(),
    ).validate(context(CategoryGameplayMode.TOP_10));
    expect(result.issues[0].code).toBe('TOP10_INVALID_RANKING');
  });

  it('routes mixed categories by their own explicit mode', () => {
    const standard = new StandardCategoryGameValidation({} as never);
    const top10 = new Top10CategoryGameValidation(
      {} as never,
      new RankedListQuestionPolicy(),
    );
    const registry = new CategoryGameValidationRegistry(
      standard,
      top10,
      {} as never,
    );
    expect(registry.resolve(CategoryGameplayMode.STANDARD)).toBe(standard);
    expect(registry.resolve(CategoryGameplayMode.TOP_10)).toBe(top10);
  });

  it('falls pending video back to text without rejecting game creation', () => {
    const question = top10Question(QuestionType.VIDEO, {
      audioStatus: AudioAssetStatus.PENDING,
    });
    const presentations = mediaValidation().validate(
      context(CategoryGameplayMode.TOP_10).category,
      CategoryGameplayMode.TOP_10,
      [question],
    );
    expect(presentations.get(String(question._id))).toMatchObject({
      effectivePresentationType: 'text',
      mediaFallbackReason: 'PROCESSING',
    });
  });

  it('allows an approved legacy image without a ready asset as text', () => {
    const question = standardQuestion(QuestionPoints.LOW, QuestionType.IMAGE);
    question.primaryAsset = undefined;
    question.assetStatus = AssetStatus.NOT_REQUIRED;
    const presentations = mediaValidation().validate(
      context(CategoryGameplayMode.STANDARD).category,
      CategoryGameplayMode.STANDARD,
      [question],
    );
    expect(presentations.get(String(question._id))).toMatchObject({
      effectivePresentationType: 'text',
      mediaFallbackReason: 'MISSING_ASSET',
    });
  });

  it('persists immutable question content and answer data in the board snapshot', async () => {
    const selected = {
      ...standardQuestion(QuestionPoints.LOW, QuestionType.IMAGE),
      question: 'Snapshot question',
      answer: 'Snapshot answer',
      acceptedAnswers: ['Alias'],
      explanation: 'Explanation',
    } as Question;
    const selectedCategory = {
      ...category(CategoryGameplayMode.STANDARD),
      name: 'Football',
    } as Category;
    const assembler = new CategoryGameAssembler(
      {
        resolve: jest.fn().mockReturnValue({
          validate: jest.fn().mockResolvedValue({
            status: 'PASS',
            gameplayMode: CategoryGameplayMode.STANDARD,
            questions: [selected],
            boardQuestions: [
              {
                question: selected._id,
                points: 200,
                isAnswered: false,
                isAnswerRevealed: false,
              },
            ],
            issues: [],
          }),
        }),
      } as never,
      mediaValidation(),
    );
    const result = await assembler.assemble({
      category: selectedCategory,
      isFreeGame: false,
      seenQuestionIds: [],
    });
    expect(result.boardQuestions[0]).toMatchObject({
      presentation: {
        preferredType: 'image',
        type: 'image',
        mediaAvailable: true,
        mediaUrl: '/image.jpg',
      },
      snapshot: {
        sourceQuestionId: selected._id,
        categoryId: selectedCategory._id,
        categoryName: 'Football',
        question: 'Snapshot question',
        answer: 'Snapshot answer',
        acceptedAnswers: ['Alias'],
        explanation: 'Explanation',
      },
    });
    selected.primaryAsset!.url = '/replacement.jpg';
    expect(result.boardQuestions[0].presentation?.mediaUrl).toBe('/image.jpg');
  });
});
