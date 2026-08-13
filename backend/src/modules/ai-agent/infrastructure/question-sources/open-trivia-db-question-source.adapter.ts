import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  QuestionSourceAdapter,
  QuestionSourceRequest,
  QuestionSourceResult,
} from '../../domain/question-source.types';
import { SourceQuestionNormalizerService } from '../../application/source-question-normalizer.service';
import {
  resolveOpenTriviaDbCategory,
  type OpenTriviaDbCategorySelection,
} from './open-trivia-db-category.mapper';

type OpenTdbPayload = {
  response_code?: number;
  results?: Array<{
    category: string;
    type: string;
    difficulty: string;
    question: string;
    correct_answer: string;
    incorrect_answers: string[];
  }>;
};

@Injectable()
export class OpenTriviaDbQuestionSourceAdapter implements QuestionSourceAdapter {
  readonly sourceId = 'open-trivia-db';
  private readonly logger = new Logger(OpenTriviaDbQuestionSourceAdapter.name);
  constructor(
    private readonly config: ConfigService,
    private readonly normalizer: SourceQuestionNormalizerService,
  ) {}

  supports(context: QuestionSourceRequest): boolean {
    return resolveOpenTriviaDbCategory(context.categoryName) !== null;
  }

  async fetch(request: QuestionSourceRequest): Promise<QuestionSourceResult> {
    const started = Date.now();
    const selection = resolveOpenTriviaDbCategory(request.categoryName);
    if (selection === null)
      return this.result(request, started, [], 'SOURCE_CATEGORY_UNSUPPORTED');
    const base =
      this.config.get<string>('OPEN_TRIVIA_DB_BASE_URL') ||
      'https://opentdb.com';
    const timeoutMs = Math.max(
      1,
      Number(this.config.get('QUESTION_SOURCE_TIMEOUT_MS')) || 15000,
    );
    const url = new URL('/api.php', base);
    url.searchParams.set(
      'amount',
      String(
        selection.topicFilter ? 50 : Math.min(50, Math.max(1, request.amount)),
      ),
    );
    url.searchParams.set('category', String(selection.category));
    if (request.difficulty)
      url.searchParams.set('difficulty', request.difficulty);
    this.logger.log(
      JSON.stringify({
        event: 'question_source.request.started',
        sourceId: this.sourceId,
        categoryId: request.categoryId,
        category: selection.category,
        topicFilter: selection.topicFilter,
        requested: request.amount,
        outcome: 'started',
      }),
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok)
        return this.result(
          request,
          started,
          [],
          'SOURCE_HTTP_ERROR',
          `HTTP ${response.status}`,
        );
      const payload = (await response.json()) as OpenTdbPayload;
      if (
        !Number.isInteger(payload.response_code) ||
        !Array.isArray(payload.results)
      )
        return this.result(request, started, [], 'SOURCE_INVALID_RESPONSE');
      if (payload.response_code !== 0)
        return this.result(
          request,
          started,
          [],
          `OPEN_TDB_RESPONSE_${payload.response_code}`,
        );
      const candidates = payload.results.flatMap((item) => {
        if (
          !['multiple', 'boolean'].includes(item.type) ||
          !['easy', 'medium', 'hard'].includes(item.difficulty)
        )
          return [];
        const normalized = this.normalizer.normalize({
          sourceId: this.sourceId,
          sourceUrl: url.toString(),
          sourceLicense: 'CC BY-SA 4.0',
          sourceCategory: item.category,
          question: item.question,
          correctAnswer: item.correct_answer,
          incorrectAnswers: item.incorrect_answers,
          type: item.type as 'multiple' | 'boolean',
          difficulty: item.difficulty as 'easy' | 'medium' | 'hard',
        });
        return normalized && this.matchesSelection(normalized, selection)
          ? [normalized]
          : [];
      });
      const unique = this.normalizer
        .deduplicate(candidates)
        .slice(0, request.amount);
      this.logger.log(
        JSON.stringify({
          event: 'question_source.request.completed',
          sourceId: this.sourceId,
          category: selection.category,
          topicFilter: selection.topicFilter,
          requested: request.amount,
          received: unique.length,
          durationMs: Date.now() - started,
          outcome: 'completed',
        }),
      );
      return {
        sourceId: this.sourceId,
        candidates: unique,
        diagnostics:
          unique.length < request.amount
            ? [{ code: 'SOURCE_PARTIAL_RESULTS', sourceId: this.sourceId }]
            : [],
        requestedCount: request.amount,
        receivedCount: unique.length,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      const code =
        error instanceof Error && error.name === 'AbortError'
          ? 'SOURCE_TIMEOUT'
          : 'SOURCE_FETCH_FAILED';
      return this.result(
        request,
        started,
        [],
        code,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private matchesSelection(
    candidate: {
      originalQuestion: string;
      originalCorrectAnswer: string;
      originalIncorrectAnswers: string[];
    },
    selection: OpenTriviaDbCategorySelection,
  ): boolean {
    if (!selection.topicFilter) return true;
    const text = [
      candidate.originalQuestion,
      candidate.originalCorrectAnswer,
      ...candidate.originalIncorrectAnswers,
    ]
      .join(' ')
      .normalize('NFKC')
      .toLocaleLowerCase();
    return FOOTBALL_SOURCE_PATTERN.test(text);
  }

  private result(
    request: QuestionSourceRequest,
    started: number,
    candidates: never[],
    code: string,
    message?: string,
  ): QuestionSourceResult {
    this.logger.warn(
      JSON.stringify({
        event: 'question_source.request.failed',
        sourceId: this.sourceId,
        categoryName: request.categoryName,
        durationMs: Date.now() - started,
        outcome: code,
      }),
    );
    return {
      sourceId: this.sourceId,
      candidates,
      diagnostics: [{ code, sourceId: this.sourceId, message }],
      requestedCount: request.amount,
      receivedCount: 0,
      durationMs: Date.now() - started,
    };
  }
}

const FOOTBALL_SOURCE_PATTERN =
  /\b(football|soccer|fifa|uefa|champions league|premier league|world cup|copa am(?:e|\u00e9)rica|la liga|bundesliga|serie a|ligue 1|fa cup|ballon d['’]or|europa league|real madrid|barcelona|bayern munich|manchester (?:united|city)|liverpool|chelsea|arsenal|juventus|inter milan|ac milan|paris saint-germain|psg|cristiano ronaldo|lionel messi)\b/i;
