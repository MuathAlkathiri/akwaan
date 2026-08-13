import { OpenTriviaDbQuestionSourceAdapter } from './open-trivia-db-question-source.adapter';
import { SourceQuestionNormalizerService } from '../../application/source-question-normalizer.service';
import type { ConfigService } from '@nestjs/config';

describe('OpenTriviaDbQuestionSourceAdapter', () => {
  const request = {
    categoryName: 'رياضة',
    locale: 'ar' as const,
    amount: 2,
    difficulty: 'easy' as const,
  };
  afterEach(() => jest.restoreAllMocks());
  const adapter = () =>
    new OpenTriviaDbQuestionSourceAdapter(
      {
        get: (key: string) =>
          key === 'QUESTION_SOURCE_TIMEOUT_MS' ? 100 : undefined,
      } as unknown as ConfigService,
      new SourceQuestionNormalizerService(),
    );
  it('normalizes successful multiple-choice results', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        response_code: 0,
        results: [
          {
            category: 'Sports',
            type: 'multiple',
            difficulty: 'easy',
            question: 'Who &amp; won?',
            correct_answer: 'A',
            incorrect_answers: ['B', 'C', 'D'],
          },
        ],
      }),
    } as Response);
    const result = await adapter().fetch(request);
    expect(result.candidates[0]).toMatchObject({
      originalQuestion: 'Who & won?',
      sourceId: 'open-trivia-db',
    });
  });
  it('reports no results response code', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ response_code: 1, results: [] }),
    } as Response);
    expect((await adapter().fetch(request)).diagnostics[0].code).toBe(
      'OPEN_TDB_RESPONSE_1',
    );
  });
  it('reports invalid parameter response code', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ response_code: 2, results: [] }),
    } as Response);
    expect((await adapter().fetch(request)).diagnostics[0].code).toBe(
      'OPEN_TDB_RESPONSE_2',
    );
  });
  it('reports rate limiting', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ response_code: 5, results: [] }),
    } as Response);
    expect((await adapter().fetch(request)).diagnostics[0].code).toBe(
      'OPEN_TDB_RESPONSE_5',
    );
  });
  it('reports invalid payloads', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ nope: true }),
    } as Response);
    expect((await adapter().fetch(request)).diagnostics[0].code).toBe(
      'SOURCE_INVALID_RESPONSE',
    );
  });
  it('reports HTTP failures', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, status: 503 } as Response);
    expect((await adapter().fetch(request)).diagnostics[0].code).toBe(
      'SOURCE_HTTP_ERROR',
    );
  });
  it('reports network failures', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    expect((await adapter().fetch(request)).diagnostics[0].code).toBe(
      'SOURCE_FETCH_FAILED',
    );
  });
  it('reports timeouts', async () => {
    const timeout = new Error('timed out');
    timeout.name = 'AbortError';
    jest.spyOn(global, 'fetch').mockRejectedValue(timeout);
    expect((await adapter().fetch(request)).diagnostics[0].code).toBe(
      'SOURCE_TIMEOUT',
    );
  });
  it('reports an empty successful response as partial', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ response_code: 0, results: [] }),
    } as Response);
    expect((await adapter().fetch(request)).diagnostics[0].code).toBe(
      'SOURCE_PARTIAL_RESULTS',
    );
  });
  it('normalizes boolean questions', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        response_code: 0,
        results: [
          {
            category: 'Sports',
            type: 'boolean',
            difficulty: 'easy',
            question: 'The statement is true.',
            correct_answer: 'True',
            incorrect_answers: ['False'],
          },
        ],
      }),
    } as Response);
    expect((await adapter().fetch(request)).candidates[0]).toMatchObject({
      originalType: 'boolean',
      originalIncorrectAnswers: ['False'],
    });
  });
  it('rejects unsupported categories without fetching', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const result = await adapter().fetch({
      ...request,
      categoryName: 'Naruto',
    });
    expect(result.diagnostics[0].code).toBe('SOURCE_CATEGORY_UNSUPPORTED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('collects only football candidates for a football-specific category', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        response_code: 0,
        results: [
          {
            category: 'Sports',
            type: 'multiple',
            difficulty: 'easy',
            question: 'Who won the UEFA Champions League in 2017?',
            correct_answer: 'Real Madrid',
            incorrect_answers: ['Juventus', 'Liverpool', 'Chelsea'],
          },
          {
            category: 'Sports',
            type: 'multiple',
            difficulty: 'easy',
            question: 'Who won the 2016 Formula 1 championship?',
            correct_answer: 'Nico Rosberg',
            incorrect_answers: ['Lewis Hamilton', 'Sebastian Vettel'],
          },
        ],
      }),
    } as Response);
    const result = await adapter().fetch({
      ...request,
      categoryName: 'كرة قدم عالمية',
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].originalQuestion).toContain('UEFA');
    expect(String(fetchSpy.mock.calls[0][0])).toContain('amount=50');
    expect(String(fetchSpy.mock.calls[0][0])).toContain('category=21');
  });
});
