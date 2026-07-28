import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  Category,
  CategoryGameplayMode,
} from '../../categories/schemas/category.schema';
import {
  DifficultyLevel,
  Question,
  QuestionGameplayType,
  QuestionPoints,
} from '../../questions/schemas/question.schema';
import {
  RankedListQuestionPolicy,
  TOP_10_ENTRY_POINTS,
} from '../../questions/application/ranked-list-question.policy';
import {
  QuestionMediaAvailabilityPolicy,
  type QuestionMediaAvailability,
} from '../../questions/application/question-media-availability.policy';
import {
  type GameQuestionSnapshot,
  QuestionInGame,
} from '../schemas/game.schema';
import { QuestionSelectorService } from '../selectors/question-selector.service';
import { BombQuestionPolicy } from '../../questions/application/bomb-question.policy';
import { QuestionsService } from '../../questions/questions.service';

export type CategoryGameValidationIssue = {
  code: string;
  message: string;
  categoryId: string;
  catalogId?: string;
  gameplayMode: CategoryGameplayMode;
  questionId?: string;
  requiredCounts?: Record<string, number>;
  actualCounts?: Record<string, number>;
  pointDistribution?: Record<string, number>;
};

export type CategoryGameValidationResult = {
  status: 'PASS' | 'FAIL';
  gameplayMode: CategoryGameplayMode;
  questions: Question[];
  boardQuestions: QuestionInGame[];
  issues: CategoryGameValidationIssue[];
};

export type CategoryGameValidationContext = {
  category: Category;
  isFreeGame: boolean;
  seenQuestionIds: Types.ObjectId[];
};

export interface CategoryGameValidationStrategy {
  readonly gameplayMode: CategoryGameplayMode;
  validate(
    context: CategoryGameValidationContext,
  ): Promise<CategoryGameValidationResult>;
}

function categoryDetails(category: Category) {
  return {
    categoryId: String(category._id),
    ...(category.catalogId ? { catalogId: String(category.catalogId) } : {}),
  };
}

function failed(
  mode: CategoryGameplayMode,
  issue: CategoryGameValidationIssue,
): CategoryGameValidationResult {
  return {
    status: 'FAIL',
    gameplayMode: mode,
    questions: [],
    boardQuestions: [],
    issues: [issue],
  };
}

@Injectable()
export class StandardCategoryGameValidation implements CategoryGameValidationStrategy {
  readonly gameplayMode = CategoryGameplayMode.STANDARD;

  constructor(private readonly selector: QuestionSelectorService) {}

  async validate(
    context: CategoryGameValidationContext,
  ): Promise<CategoryGameValidationResult> {
    const distributions = await Promise.all(
      [QuestionPoints.LOW, QuestionPoints.MEDIUM, QuestionPoints.HIGH].map(
        async (points) => ({
          points,
          questions: await this.selector.select({
            categoryId: String(context.category._id),
            points,
            isFreeGame: context.isFreeGame,
            seenQuestionIds: context.seenQuestionIds,
          }),
        }),
      ),
    );
    const pointDistribution = Object.fromEntries(
      distributions.map(({ points, questions }) => [
        String(points),
        questions.length,
      ]),
    );
    const missing = distributions.find(
      ({ questions }) => questions.length !== 2,
    );
    if (missing) {
      const codeByPoints = {
        [QuestionPoints.LOW]: 'STANDARD_MISSING_200_QUESTIONS',
        [QuestionPoints.MEDIUM]: 'STANDARD_MISSING_400_QUESTIONS',
        [QuestionPoints.HIGH]: 'STANDARD_MISSING_600_QUESTIONS',
      } as const;
      return failed(this.gameplayMode, {
        code: codeByPoints[missing.points],
        message: `Standard category requires exactly two approved, game-usable ${missing.points}-point questions.`,
        ...categoryDetails(context.category),
        gameplayMode: this.gameplayMode,
        requiredCounts: { '200': 2, '400': 2, '600': 2 },
        actualCounts: pointDistribution,
        pointDistribution,
      });
    }
    const questions = distributions.flatMap((item) => item.questions);
    const boardQuestions = distributions.flatMap(({ points, questions }) =>
      questions.map((question) => ({
        question: question._id,
        points: points as 200 | 400 | 600,
        isAnswered: false,
        isAnswerRevealed: false,
      })),
    );
    if (
      boardQuestions.length !== 6 ||
      boardQuestions.some(
        (item) =>
          ![200, 400, 600].includes(item.points) ||
          questions.find(
            (question) => String(question._id) === String(item.question),
          )?.points !== item.points,
      )
    ) {
      return failed(this.gameplayMode, {
        code: 'STANDARD_INVALID_QUESTION_DISTRIBUTION',
        message:
          'Standard questions must remain in their authored point buckets.',
        ...categoryDetails(context.category),
        gameplayMode: this.gameplayMode,
        requiredCounts: { '200': 2, '400': 2, '600': 2 },
        actualCounts: pointDistribution,
        pointDistribution,
      });
    }
    return {
      status: 'PASS',
      gameplayMode: this.gameplayMode,
      questions,
      boardQuestions,
      issues: [],
    };
  }
}

@Injectable()
export class Top10CategoryGameValidation implements CategoryGameValidationStrategy {
  readonly gameplayMode = CategoryGameplayMode.TOP_10;

  constructor(
    private readonly selector: QuestionSelectorService,
    private readonly rankedListPolicy: RankedListQuestionPolicy,
  ) {}

  async validate(
    context: CategoryGameValidationContext,
  ): Promise<CategoryGameValidationResult> {
    const questions = await this.selector.selectTop10({
      categoryId: String(context.category._id),
      isFreeGame: context.isFreeGame,
      seenQuestionIds: context.seenQuestionIds,
    });
    if (!questions.length)
      return failed(this.gameplayMode, {
        code: 'TOP10_NO_APPROVED_QUESTIONS',
        message:
          'Top 10 category requires at least one approved ranked-list question.',
        ...categoryDetails(context.category),
        gameplayMode: this.gameplayMode,
        requiredCounts: { rankedListQuestions: 1 },
        actualCounts: { rankedListQuestions: 0 },
      });

    const question = questions[0];
    const entries = question.rankedList?.entries ?? [];
    const common = {
      ...categoryDetails(context.category),
      gameplayMode: this.gameplayMode,
      questionId: String(question._id),
    };
    if (entries.length !== 10)
      return failed(this.gameplayMode, {
        code: 'TOP10_INVALID_ANSWER_COUNT',
        message: 'Top 10 question must contain exactly ten ranked answers.',
        ...common,
        requiredCounts: { answers: 10 },
        actualCounts: { answers: entries.length },
      });
    if (
      entries.some((entry, index) => entry.rank !== index + 1) ||
      new Set(entries.map((entry) => entry.rank)).size !== 10
    )
      return failed(this.gameplayMode, {
        code: 'TOP10_INVALID_RANKING',
        message: 'Top 10 ranks must be unique and ordered from 1 through 10.',
        ...common,
      });
    if (
      entries.some(
        (entry, index) => entry.points !== TOP_10_ENTRY_POINTS[index],
      )
    )
      return failed(this.gameplayMode, {
        code: 'TOP10_INVALID_SCORE_SEQUENCE',
        message: 'Top 10 answer scores do not match the canonical sequence.',
        ...common,
      });
    const normalizedAnswers = entries.map((entry) =>
      normalizeAnswer(entry.answer.ar || entry.answer.en || ''),
    );
    if (
      normalizedAnswers.some(
        (answer, index) =>
          !answer || normalizedAnswers.indexOf(answer) !== index,
      )
    )
      return failed(this.gameplayMode, {
        code: 'TOP10_DUPLICATE_ANSWER',
        message:
          'Top 10 canonical answers must be unique after deterministic normalization.',
        ...common,
      });
    try {
      this.rankedListPolicy.validate(question.rankedList!);
    } catch {
      return failed(this.gameplayMode, {
        code: 'TOP10_INVALID_ACCEPTED_ANSWERS',
        message:
          'Top 10 accepted-answer aliases violate the existing alias policy.',
        ...common,
      });
    }
    return {
      status: 'PASS',
      gameplayMode: this.gameplayMode,
      questions,
      boardQuestions: [
        {
          question: question._id,
          // The ranked-list runtime owns its 10..130 scoring. The existing
          // board value remains 600 only as the round's maximum value.
          points: 600,
          isAnswered: false,
          isAnswerRevealed: false,
        },
      ],
      issues: [],
    };
  }
}

@Injectable()
export class BombCategoryGameValidation implements CategoryGameValidationStrategy {
  readonly gameplayMode = CategoryGameplayMode.BOMB;

  constructor(
    private readonly selector: QuestionSelectorService,
    private readonly bombQuestions: BombQuestionPolicy,
    private readonly questionsService: QuestionsService,
  ) {}

  async validate(
    context: CategoryGameValidationContext,
  ): Promise<CategoryGameValidationResult> {
    const readiness = await this.questionsService.bombReadiness(
      String(context.category._id),
    );
    if (!readiness.isComplete) {
      return failed(this.gameplayMode, {
        code: 'BOMB_CATEGORY_NOT_READY',
        message:
          'Bomb category must pass readiness before it can be added to a game.',
        ...categoryDetails(context.category),
        gameplayMode: this.gameplayMode,
        requiredCounts: { easy: 2, medium: 2, hard: 2 },
        actualCounts: {
          easy: readiness.easy,
          medium: readiness.medium,
          hard: readiness.hard,
          invalid: readiness.invalidQuestionCount,
        },
      });
    }
    const distributions = await Promise.all(
      [
        [DifficultyLevel.EASY, QuestionPoints.LOW],
        [DifficultyLevel.MEDIUM, QuestionPoints.MEDIUM],
        [DifficultyLevel.HARD, QuestionPoints.HIGH],
      ].map(async ([difficulty, points]) => ({
        difficulty: difficulty as DifficultyLevel,
        points: points as QuestionPoints,
        questions: await this.selector.selectBomb({
          categoryId: String(context.category._id),
          difficulty: difficulty as DifficultyLevel,
          seenQuestionIds: context.seenQuestionIds,
        }),
      })),
    );
    const counts = Object.fromEntries(
      distributions.map(({ difficulty, questions }) => [
        difficulty,
        questions.length,
      ]),
    );
    const invalid = distributions
      .flatMap(({ questions }) => questions)
      .find((question) => !this.bombQuestions.isValid(question.bombContent));
    const missing = distributions.find(
      ({ questions }) => questions.length !== 2,
    );
    if (missing || invalid) {
      return failed(this.gameplayMode, {
        code: invalid ? 'BOMB_INVALID_QUESTION' : 'BOMB_CATEGORY_NOT_READY',
        message: invalid
          ? 'Bomb category contains an invalid approved Bomb question.'
          : 'Bomb category requires at least two valid approved questions for each difficulty.',
        ...categoryDetails(context.category),
        gameplayMode: this.gameplayMode,
        ...(invalid ? { questionId: String(invalid._id) } : {}),
        requiredCounts: { easy: 2, medium: 2, hard: 2 },
        actualCounts: counts,
      });
    }
    const questions = distributions.flatMap(({ questions }) => questions);
    return {
      status: 'PASS',
      gameplayMode: this.gameplayMode,
      questions,
      boardQuestions: distributions.flatMap(({ points, questions }) =>
        questions.map((question) => ({
          question: question._id,
          points: points as 200 | 400 | 600,
          isAnswered: false,
          isAnswerRevealed: false,
        })),
      ),
      issues: [],
    };
  }
}

@Injectable()
export class CategoryGameValidationRegistry {
  private readonly strategies: Map<
    CategoryGameplayMode,
    CategoryGameValidationStrategy
  >;

  constructor(
    standard: StandardCategoryGameValidation,
    top10: Top10CategoryGameValidation,
    bomb: BombCategoryGameValidation,
  ) {
    this.strategies = new Map<
      CategoryGameplayMode,
      CategoryGameValidationStrategy
    >([
      [standard.gameplayMode, standard],
      [top10.gameplayMode, top10],
      [bomb.gameplayMode, bomb],
    ]);
  }

  resolve(mode: CategoryGameplayMode): CategoryGameValidationStrategy {
    const strategy = this.strategies.get(mode);
    if (!strategy)
      throw new BadRequestException({
        code: 'CATEGORY_GAMEPLAY_MODE_UNSUPPORTED',
        message: `Unsupported category gameplay mode: ${mode}`,
      });
    return strategy;
  }
}

@Injectable()
export class GameQuestionMediaValidation {
  constructor(
    private readonly mediaAvailability: QuestionMediaAvailabilityPolicy,
  ) {}

  validate(
    _category: Category,
    _gameplayMode: CategoryGameplayMode,
    questions: Question[],
  ): Map<string, QuestionMediaAvailability> {
    return new Map(
      questions.map((question) => [
        String(question._id),
        this.mediaAvailability.resolve(question),
      ]),
    );
  }
}

@Injectable()
export class CategoryGameAssembler {
  private readonly logger = new Logger(CategoryGameAssembler.name);

  constructor(
    private readonly registry: CategoryGameValidationRegistry,
    private readonly mediaValidation: GameQuestionMediaValidation,
  ) {}

  async assemble(context: CategoryGameValidationContext) {
    const gameplayMode =
      context.category.gameplayMode ?? CategoryGameplayMode.STANDARD;
    const startedAt = Date.now();
    const result = await this.registry.resolve(gameplayMode).validate(context);
    this.logger.log(
      JSON.stringify({
        operation: 'category_game_validation',
        categoryId: String(context.category._id),
        catalogId: context.category.catalogId
          ? String(context.category.catalogId)
          : undefined,
        gameplayMode,
        status: result.status,
        issueCodes: result.issues.map((issue) => issue.code),
        selectedQuestionIds: result.questions.map((question) =>
          String(question._id),
        ),
        durationMs: Date.now() - startedAt,
      }),
    );
    if (result.status === 'FAIL')
      throw new BadRequestException({
        error: 'Bad Request',
        code: result.issues[0].code,
        message: result.issues[0].message,
        issueCodes: result.issues.map((issue) => issue.code),
        details: result.issues,
      });
    const presentations = this.mediaValidation.validate(
      context.category,
      gameplayMode,
      result.questions,
    );
    const boardQuestions = result.boardQuestions.map((boardQuestion) => {
      const presentation = presentations.get(String(boardQuestion.question));
      const question = result.questions.find(
        (candidate) => String(candidate._id) === String(boardQuestion.question),
      );
      if (!question) return boardQuestion;
      const baseSnapshot = {
        sourceQuestionId: question._id,
        categoryId: context.category._id,
        categoryName: context.category.name,
        question: question.question,
        ...(question.explanation ? { explanation: question.explanation } : {}),
      };

      let snapshot: GameQuestionSnapshot;

      if (question.questionType === QuestionGameplayType.RANKED_LIST) {
        if (!question.rankedList) {
          throw new BadRequestException({
            code: 'RANKED_LIST_DATA_MISSING',
            message: 'Ranked-list question is missing ranked-list data.',
            questionId: String(question._id),
          });
        }

        snapshot = {
          ...baseSnapshot,
          questionType: 'ranked_list',
          ...(question.turnDurationSeconds
            ? { turnDurationSeconds: question.turnDurationSeconds }
            : {}),
          ...(question.maxStrikesPerTeam
            ? { maxStrikesPerTeam: question.maxStrikesPerTeam }
            : {}),
          rankedList: {
            displayName: { ...question.rankedList.displayName },
            entries: question.rankedList.entries.map((entry) => ({
              id: entry.id,
              rank: entry.rank,
              answer: { ...entry.answer },
              aliases: [...entry.aliases],
              points: entry.points,
            })),
          },
        };
      } else if (question.questionType === QuestionGameplayType.BOMB_SEQUENCE) {
        if (!this.bombContentValid(question)) {
          throw new BadRequestException({
            code: 'BOMB_CONTENT_MISSING',
            message: 'Bomb question is missing valid ordered item content.',
            questionId: String(question._id),
          });
        }
        snapshot = {
          ...baseSnapshot,
          questionType: 'bomb_sequence',
          bombContent: {
            items: question.bombContent!.items.map((item, order) => ({
              ...item,
              order,
              image: { ...item.image },
              acceptedAnswers: [...item.acceptedAnswers],
            })),
          },
        };
      } else {
        const answer = question.answer?.trim();

        if (!answer) {
          throw new BadRequestException({
            code: 'QUESTION_ANSWER_MISSING',
            message: 'Standard question is missing its answer.',
            questionId: String(question._id),
          });
        }

        snapshot = {
          ...baseSnapshot,
          questionType: 'standard',
          answer,
          acceptedAnswers: [...(question.acceptedAnswers ?? [])],
        };
      }
      if (!presentation) return { ...boardQuestion, snapshot };
      if (!presentation.mediaAvailable)
        this.logger.log(
          JSON.stringify({
            operation: 'question_media_text_fallback',
            questionId: String(boardQuestion.question),
            preferredMediaType: presentation.preferredPresentationType,
            effectiveMediaType: presentation.effectivePresentationType,
            fallbackReason: presentation.mediaFallbackReason,
          }),
        );
      return {
        ...boardQuestion,
        snapshot,
        presentation: {
          preferredType: presentation.preferredPresentationType,
          type: presentation.effectivePresentationType,
          mediaAvailable: presentation.mediaAvailable,
          ...(presentation.mediaUrl ? { mediaUrl: presentation.mediaUrl } : {}),
          ...(presentation.resolvedMedia?.duration
            ? { mediaDuration: presentation.resolvedMedia.duration }
            : {}),
          ...(presentation.mediaFallbackReason
            ? { fallbackReason: presentation.mediaFallbackReason }
            : {}),
        },
      };
    });
    return { ...result, boardQuestions };
  }

  private bombContentValid(question: Question): boolean {
    return (
      question.questionType === QuestionGameplayType.BOMB_SEQUENCE &&
      Array.isArray(question.bombContent?.items) &&
      question.bombContent.items.length >= 10 &&
      question.bombContent.items.length <= 15
    );
  }
}
