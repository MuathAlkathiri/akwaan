import { Injectable, Logger } from '@nestjs/common';
import type {
  KnowledgeUnit,
  ResearchRequest,
} from '../domain/knowledge-unit.types';
import { KnowledgeUnitRepository } from '../infrastructure/persistence/knowledge-unit.repository';
import { AiPipelineConfigService } from './ai-pipeline-config.service';
import { ResearchRouterService } from './research-router.service';
import { KnowledgeNormalizerService } from './knowledge-normalizer.service';
import { EvidenceEvaluatorService } from './evidence-evaluator.service';

@Injectable()
export class KnowledgeAcquisitionCoordinatorService {
  private readonly logger = new Logger(
    KnowledgeAcquisitionCoordinatorService.name,
  );
  private readonly inFlight = new Map<string, Promise<KnowledgeUnit[]>>();
  constructor(
    private readonly router: ResearchRouterService,
    private readonly repository: KnowledgeUnitRepository,
    private readonly config: AiPipelineConfigService,
    normalizer?: KnowledgeNormalizerService,
    evaluator?: EvidenceEvaluatorService,
  ) {
    this.normalizer = normalizer ?? new KnowledgeNormalizerService(config);
    this.evaluator = evaluator ?? new EvidenceEvaluatorService(this.normalizer);
  }
  private readonly normalizer: KnowledgeNormalizerService;
  private readonly evaluator: EvidenceEvaluatorService;
  async acquire(request: ResearchRequest): Promise<KnowledgeUnit[]> {
    const cached = await this.repository.findFresh(request.cacheKey);
    if (cached.length) {
      this.logger.log(
        JSON.stringify({
          cacheKey: request.cacheKey.slice(0, 12),
          cache: 'hit',
          knowledgeUnits: cached.length,
        }),
      );
      return cached;
    }
    const active = this.inFlight.get(request.cacheKey);
    if (active) return active;
    const work = this.fetch(request).finally(() =>
      this.inFlight.delete(request.cacheKey),
    );
    this.inFlight.set(request.cacheKey, work);
    return work;
  }
  private async fetch(request: ResearchRequest): Promise<KnowledgeUnit[]> {
    const results = await this.router.research(request);
    const normalized = this.normalizer.normalize(request, results);
    const evaluation = this.evaluator.evaluate(request, normalized);
    const units = evaluation.accepted;
    this.logger.log(
      JSON.stringify({
        cacheKey: request.cacheKey.slice(0, 12),
        cache: 'miss',
        providers: results.map((result) => result.provider),
        evidenceCount: results.reduce(
          (sum, result) => sum + result.facts.length,
          0,
        ),
        acceptedFacts: units.length,
        rejectedFacts: evaluation.rejectedCount,
        conflictCount: evaluation.conflictCount,
      }),
    );
    if (!units.length) throw new Error('RESEARCH_INSUFFICIENT_EVIDENCE');
    await this.repository.putMany(units);
    return units;
  }
}
