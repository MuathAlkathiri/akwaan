import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  KnowledgeResearchProvider,
  ResearchRequest,
  ResearchProviderResult,
} from '../../domain/knowledge-unit.types';
import { LlmClientService } from '../ai/llm-client.service';

@Injectable()
export class LocalKnowledgeProvider implements KnowledgeResearchProvider {
  readonly id = 'local-knowledge';
  constructor(private readonly llm: LlmClientService) {}
  supports(request: ResearchRequest) {
    return Boolean(request.localSource?.content.trim());
  }
  async research(request: ResearchRequest): Promise<ResearchProviderResult> {
    const source = request.localSource;
    if (!source) throw new Error('RESEARCH_SOURCE_UNAVAILABLE');
    const result = await this.llm.generateStructured<{
      fact: string;
      canonicalAnswer: string;
      acceptedAnswers: string[];
      entities: string[];
      confidence: number;
      excerpt: string;
    }>({
      purpose: 'research-normalization',
      systemPrompt:
        'Extract one objective fact from the supplied source only. Copy excerpt exactly. Never use memory.',
      userPrompt: JSON.stringify({
        query: request.query,
        topicIntent: request.topicIntent,
        preferredExcerpt: source.preferredExcerpt,
        source: source.content,
      }),
      schema: {
        fact: 'string',
        canonicalAnswer: 'string',
        acceptedAnswers: ['string'],
        entities: ['string'],
        confidence: 'number',
        excerpt: 'string',
      },
      temperature: 0.1,
    });
    const value = result.value;
    if (!value.excerpt?.trim() || !source.content.includes(value.excerpt))
      throw new Error('RESEARCH_SOURCE_EXCERPT_MISMATCH');
    if (!value.fact?.trim() || !value.canonicalAnswer?.trim())
      throw new Error('RESEARCH_FACT_AMBIGUOUS');
    return {
      provider: this.id,
      facts: [
        {
          fact: value.fact,
          canonicalAnswer: value.canonicalAnswer,
          acceptedAnswers: value.acceptedAnswers ?? [],
          entities: value.entities ?? [],
          confidence: Number(value.confidence) || 0,
          evidence: {
            sourceId: createHash('sha256')
              .update(source.title)
              .digest('hex')
              .slice(0, 16),
            provider: this.id,
            title: source.title,
            url: `knowledge://${encodeURIComponent(source.title)}`,
            excerpt: value.excerpt,
            retrievedAt: new Date().toISOString(),
            trustScore: 0.9,
            sourceType: 'local',
            language: request.locale ?? 'ar',
            independenceGroup: `local:${source.title}`,
          },
        },
      ],
    };
  }
}
