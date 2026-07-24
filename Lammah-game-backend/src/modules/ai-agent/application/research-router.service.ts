import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  KNOWLEDGE_RESEARCH_PROVIDERS,
  type KnowledgeResearchProvider,
  type ResearchRequest,
  type ResearchProviderResult,
} from '../domain/knowledge-unit.types';
import { AiPipelineConfigService } from './ai-pipeline-config.service';

@Injectable()
export class ResearchRouterService {
  private readonly logger = new Logger(ResearchRouterService.name);
  constructor(
    @Inject(KNOWLEDGE_RESEARCH_PROVIDERS)
    private readonly providers: KnowledgeResearchProvider[],
    private readonly config?: AiPipelineConfigService,
  ) {}
  async research(request: ResearchRequest): Promise<ResearchProviderResult[]> {
    const eligible = this.providers.filter((provider) =>
      provider.supports(request),
    );
    if (!eligible.length) throw new Error('RESEARCH_PROVIDER_UNAVAILABLE');
    const settled: PromiseSettledResult<ResearchProviderResult>[] = new Array(
      eligible.length,
    );
    let cursor = 0;
    const worker = async () => {
      while (cursor < eligible.length) {
        const index = cursor++;
        try {
          settled[index] = {
            status: 'fulfilled',
            value: await eligible[index].research(request),
          };
        } catch (reason) {
          settled[index] = { status: 'rejected', reason };
        }
      }
    };
    const concurrency = this.config?.researchConcurrency() ?? 2;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, eligible.length) }, worker),
    );
    const results = settled.flatMap((item) =>
      item.status === 'fulfilled' ? [item.value] : [],
    );
    this.logger.log(
      JSON.stringify({
        cacheKey: request.cacheKey?.slice(0, 12) ?? 'test',
        query: request.query?.slice(0, 240) ?? '',
        selectedProviders: eligible.map((provider) => provider.id),
        executedProviders: settled.map((_, index) => eligible[index].id),
        successfulProviders: results.map((result) => result.provider),
        providerTimingsMs: Object.fromEntries(
          results.map((result) => [result.provider, result.timingMs ?? null]),
        ),
        evidenceCount: results.reduce(
          (sum, result) => sum + result.facts.length,
          0,
        ),
      }),
    );
    if (!results.length) {
      const codes = settled.flatMap((item) =>
        item.status === 'rejected' && item.reason instanceof Error
          ? [item.reason.message]
          : [],
      );
      throw new Error(
        `RESEARCH_ALL_PROVIDERS_FAILED${codes.length ? `:${codes.join(',')}` : ''}`,
      );
    }
    return results;
  }
}
