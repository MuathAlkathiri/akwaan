import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  FactCandidate,
  GenerationPlanSlot,
} from './ai-generation-pipeline.types';
import { KnowledgeAcquisitionCoordinatorService } from './knowledge-acquisition-coordinator.service';
import { KnowledgePackRegistry } from './knowledge-pack.registry';
import type { CategoryGenerationProfile } from './category-generation-profile.registry';

@Injectable()
export class ResearchAgentService {
  constructor(
    private readonly coordinator: KnowledgeAcquisitionCoordinatorService,
    private readonly packs: KnowledgePackRegistry,
  ) {}
  async research(input: {
    slot: GenerationPlanSlot;
    categoryName: string;
    knowledgeTitle: string;
    knowledge: string;
    instructions?: string[];
    preferredExcerpt?: string;
    profile: CategoryGenerationProfile;
  }): Promise<{ fact: FactCandidate; provider: string; model: string }> {
    const pack = this.packs.fromProfile(input.profile);
    const topicIntent = input.slot.topicIntent ?? 'general';
    const entityCandidate = input.slot.entityCandidate;
    const query = entityCandidate
      ? `${entityCandidate} ${topicIntent}`
      : `${input.categoryName} ${topicIntent}`;
    const cacheKey = createHash('sha256')
      .update(
        `${pack.id}|focused-v1|${this.normalize(entityCandidate ?? input.categoryName)}|${topicIntent}|ar`,
      )
      .digest('hex');
    const units = await this.coordinator.acquire({
      cacheKey,
      pack,
      topicIntent,
      categoryName: input.categoryName,
      query,
      locale: 'ar',
      entityHint: entityCandidate ?? input.categoryName,
      candidateSource: input.slot.candidateSource,
      ...(input.knowledge.trim() && !entityCandidate
        ? {
            localSource: {
              title: input.knowledgeTitle,
              content: input.knowledge,
              preferredExcerpt: input.preferredExcerpt,
            },
          }
        : {}),
    });
    const unit = this.selectExplicitUnit(units);
    const evidence = unit.evidence[0];
    return {
      fact: {
        id: unit.id,
        fact: unit.fact,
        canonicalAnswer: unit.canonicalAnswer,
        acceptedAnswerHints: unit.acceptedAnswers,
        entities: unit.entities,
        topic: unit.topicIntent,
        confidence: unit.confidence,
        source: {
          title: evidence.title,
          url: evidence.url,
          excerpt: evidence.excerpt,
        },
        sources: unit.evidence.map((item) => ({
          sourceId: item.sourceId,
          title: item.title,
          url: item.url,
          excerpt: item.excerpt,
        })),
      },
      provider: evidence.provider,
      model: 'knowledge-unit-v1',
    };
  }

  private normalize(value: string) {
    return value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  private selectExplicitUnit<
    T extends { fact: string; canonicalAnswer: string },
  >(units: T[]): T {
    return [...units].sort((left, right) => {
      const score = (unit: T) => {
        const fact = new Set(this.normalize(unit.fact).split(/\s+/));
        return this.normalize(unit.canonicalAnswer)
          .split(/\s+/)
          .filter((token) => token.length >= 3 && fact.has(token)).length;
      };
      return (
        Number(score(right) > 0) - Number(score(left) > 0) ||
        left.fact.length - right.fact.length
      );
    })[0];
  }
}
