import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type {
  KnowledgeUnit,
  ResearchProviderResult,
  ResearchRequest,
} from '../domain/knowledge-unit.types';
import { AiPipelineConfigService } from './ai-pipeline-config.service';

@Injectable()
export class KnowledgeNormalizerService {
  constructor(private readonly config: AiPipelineConfigService) {}
  normalize(
    request: ResearchRequest,
    results: ResearchProviderResult[],
  ): KnowledgeUnit[] {
    const grouped = new Map<string, KnowledgeUnit>();
    for (const result of results)
      for (const item of result.facts) {
        const factHash = this.hash(
          `${this.norm(item.fact)}|${this.norm(item.canonicalAnswer)}`,
        );
        const existing = grouped.get(factHash);
        if (existing) {
          if (
            !existing.evidence.some(
              (evidence) => evidence.sourceId === item.evidence.sourceId,
            )
          )
            existing.evidence.push(item.evidence);
          existing.confidence = Math.max(existing.confidence, item.confidence);
          existing.acceptedAnswers = [
            ...new Set([
              ...existing.acceptedAnswers,
              ...(item.acceptedAnswers ?? []),
            ]),
          ];
          existing.entities = [
            ...new Set([...existing.entities, ...(item.entities ?? [])]),
          ];
          continue;
        }
        grouped.set(factHash, {
          id: randomUUID(),
          cacheKey: request.cacheKey,
          packId: request.pack.id,
          topicIntent: request.topicIntent,
          fact: item.fact.trim(),
          canonicalAnswer: item.canonicalAnswer.trim(),
          acceptedAnswers: item.acceptedAnswers ?? [],
          entities: item.entities ?? [],
          evidence: [item.evidence],
          confidence: item.confidence,
          status: 'verified',
          factHash,
          expiresAt: new Date(
            Date.now() +
              this.config.cacheTtlSeconds(request.pack.freshnessPolicy) * 1000,
          ),
        });
      }
    return [...grouped.values()];
  }
  normalizeText(value: string) {
    return value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }
  private norm(value: string) {
    return this.normalizeText(value);
  }
  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
