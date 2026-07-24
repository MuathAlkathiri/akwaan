import { QuestionSourceRouterService } from './question-source-router.service';
import { SourceQuestionNormalizerService } from './source-question-normalizer.service';
import type {
  QuestionSourceAdapter,
  QuestionSourceRequest,
} from '../domain/question-source.types';

describe('QuestionSourceRouterService', () => {
  const request: QuestionSourceRequest = {
    categoryName: 'عام',
    locale: 'ar',
    amount: 2,
  };
  const make = (
    id: string,
    supports = true,
    reject = false,
  ): QuestionSourceAdapter => ({
    sourceId: id,
    supports: () => supports,
    fetch: reject
      ? jest.fn().mockRejectedValue(new Error('failed'))
      : jest.fn().mockResolvedValue({
          sourceId: id,
          candidates: [],
          diagnostics: [],
          requestedCount: 2,
          receivedCount: 0,
          durationMs: 1,
        }),
  });
  it('reports an unsupported source category', async () =>
    expect(
      (
        await new QuestionSourceRouterService(
          [make('x', false)],
          new SourceQuestionNormalizerService(),
        ).collect(request)
      ).diagnostics[0].code,
    ).toBe('SOURCE_CATEGORY_UNSUPPORTED'));
  it('honors explicit source IDs', async () => {
    const a = make('a');
    const b = make('b');
    const result = await new QuestionSourceRouterService(
      [a, b],
      new SourceQuestionNormalizerService(),
    ).collect({ ...request, sourceIds: ['b'] });
    expect(result.sourcesAttempted).toEqual(['b']);
  });
  it('isolates a failed adapter while retaining another adapter result', async () => {
    const a = make('a');
    const b = make('b', true, true);
    const result = await new QuestionSourceRouterService(
      [a, b],
      new SourceQuestionNormalizerService(),
    ).collect(request);
    expect(result.sourcesAttempted).toEqual(['a', 'b']);
    expect(result.diagnostics[0].code).toBe('SOURCE_ADAPTER_FAILED');
  });
});
