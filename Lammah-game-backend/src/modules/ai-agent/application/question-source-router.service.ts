import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  QUESTION_SOURCE_ADAPTERS,
  type QuestionSourceAdapter,
  type QuestionSourceRequest,
} from '../domain/question-source.types';
import { SourceQuestionNormalizerService } from './source-question-normalizer.service';

@Injectable()
export class QuestionSourceRouterService {
  private readonly logger = new Logger(QuestionSourceRouterService.name);
  constructor(
    @Inject(QUESTION_SOURCE_ADAPTERS)
    private readonly adapters: QuestionSourceAdapter[],
    private readonly normalizer: SourceQuestionNormalizerService,
  ) {}

  async collect(request: QuestionSourceRequest) {
    const requested = request.sourceIds?.length
      ? new Set(request.sourceIds)
      : null;
    const selected = this.adapters.filter(
      (adapter) =>
        (!requested || requested.has(adapter.sourceId)) &&
        adapter.supports(request),
    );
    if (!selected.length)
      return {
        candidates: [],
        diagnostics: [
          {
            code: requested
              ? 'QUESTION_SOURCE_NOT_REGISTERED_OR_UNSUPPORTED'
              : 'SOURCE_CATEGORY_UNSUPPORTED',
            sourceId: 'router',
          },
        ],
        sourcesAttempted: [] as string[],
        sourcesUsed: [] as string[],
        results: [],
      };
    const settled = await Promise.all(
      selected.map(async (adapter) => {
        const started = Date.now();
        try {
          return await adapter.fetch(request);
        } catch (error) {
          return {
            sourceId: adapter.sourceId,
            candidates: [],
            diagnostics: [
              {
                code: 'SOURCE_ADAPTER_FAILED',
                sourceId: adapter.sourceId,
                message: error instanceof Error ? error.message : String(error),
              },
            ],
            requestedCount: request.amount,
            receivedCount: 0,
            durationMs: Date.now() - started,
          };
        }
      }),
    );
    const candidates = this.normalizer.deduplicate(
      settled.flatMap((result) => result.candidates),
    );
    const sourcesUsed = [
      ...new Set(candidates.map((candidate) => candidate.sourceId)),
    ];
    this.logger.log(
      JSON.stringify({
        stage: 'source-routing',
        sourcesAttempted: selected.map((item) => item.sourceId),
        sourcesUsed,
        candidates: candidates.length,
      }),
    );
    return {
      candidates,
      diagnostics: settled.flatMap((result) => result.diagnostics),
      sourcesAttempted: selected.map((item) => item.sourceId),
      sourcesUsed,
      results: settled,
    };
  }
}
