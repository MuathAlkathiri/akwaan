import { Injectable } from '@nestjs/common';
import { ResearchProviderError } from '../domain/knowledge-unit.types';

export type ResolvedResearchEntity = {
  canonicalName: string;
  aliases: string[];
  entityType?: string;
  identifiers: Record<string, string>;
  confidence: number;
};

@Injectable()
export class EntityResolutionService {
  score(query: string, names: Array<string | undefined>) {
    const q = this.normalize(query);
    const candidates = names
      .filter((value): value is string => Boolean(value))
      .map((value) => this.normalize(value))
      .filter(Boolean);
    if (candidates.some((value) => value === q)) return 1;
    if (candidates.some((value) => q.includes(value) || value.includes(q)))
      return 0.9;
    return Math.max(
      0,
      ...candidates.map((value) => {
        const tokens = value.split(' ');
        const queryTokens = new Set(q.split(' '));
        return (
          tokens.filter((token) => queryTokens.has(token)).length /
          tokens.length
        );
      }),
    );
  }
  select<T extends { score: number }>(ranked: T[], minimum = 0.6): T {
    const sorted = [...ranked].sort((a, b) => b.score - a.score);
    if (!sorted[0]) throw new ResearchProviderError('ENTITY_NOT_FOUND');
    if (sorted[0].score < minimum)
      throw new ResearchProviderError('ENTITY_MATCH_WEAK');
    if (sorted[1] && sorted[0].score - sorted[1].score < 0.04)
      throw new ResearchProviderError('ENTITY_AMBIGUOUS');
    return sorted[0];
  }
  normalize(value: string) {
    return value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }
}
