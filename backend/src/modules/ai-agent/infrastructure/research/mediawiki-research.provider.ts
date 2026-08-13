import { Injectable, Logger } from '@nestjs/common';
import type {
  KnowledgeResearchProvider,
  ResearchProviderResult,
  ResearchRequest,
} from '../../domain/knowledge-unit.types';
import { ResearchProviderError } from '../../domain/knowledge-unit.types';
import { AiPipelineConfigService } from '../../application/ai-pipeline-config.service';
import { AuthoritativeHttpClient } from './authoritative-http.client';
import { EntityResolutionService } from '../../application/entity-resolution.service';

type SearchResponse = {
  query?: {
    search?: Array<{ pageid: number; title: string; snippet?: string }>;
  };
};
type PageResponse = {
  query?: {
    pages?: Record<
      string,
      {
        pageid: number;
        title: string;
        extract?: string;
        fullurl?: string;
        pageprops?: { disambiguation?: string; wikibase_item?: string };
      }
    >;
  };
};

@Injectable()
export class MediaWikiResearchProvider implements KnowledgeResearchProvider {
  readonly id = 'wikipedia';
  private readonly logger = new Logger(MediaWikiResearchProvider.name);
  constructor(
    private readonly http: AuthoritativeHttpClient,
    private readonly config: AiPipelineConfigService,
    private readonly entities: EntityResolutionService,
  ) {
    this.config.wikipedia();
  }
  supports(request: ResearchRequest) {
    if (
      !this.config.wikipedia().enabled ||
      !request.pack.sourceStrategies.includes('web')
    )
      return false;
    return (
      request.pack.sourcePreferenceByIntent[request.topicIntent] !==
      'structured'
    );
  }
  async research(request: ResearchRequest): Promise<ResearchProviderResult> {
    const started = Date.now();
    const cfg = this.config.wikipedia();
    const languages = this.preferredLanguages(request.locale, cfg.languages);
    let weakMatch = false;
    for (const [index, language] of languages.entries()) {
      const candidate = await this.resolve(request, language, cfg.maxResults);
      if (!candidate) continue;
      if (candidate.score < 0.62) {
        weakMatch = true;
        continue;
      }
      const page = await this.page(
        language,
        candidate.pageid,
        cfg.maxExtractChars,
      );
      if (page.pageprops?.disambiguation !== undefined) continue;
      const extract = (page.extract ?? '').trim().slice(0, cfg.maxExtractChars);
      if (!extract) continue;
      const sentences = this.sentences(extract).slice(0, 4);
      const sourceId = `wikipedia:${language}:${page.pageid}`;
      const facts = sentences.map((sentence) => ({
        fact: sentence,
        canonicalAnswer: page.title,
        acceptedAnswers:
          candidate.title === page.title ? [] : [candidate.title],
        entities: [page.title],
        confidence: Math.min(0.92, candidate.score),
        evidence: {
          sourceId,
          provider: this.id,
          title: page.title,
          url:
            page.fullurl ??
            `https://${language}.wikipedia.org/?curid=${page.pageid}`,
          excerpt: sentence,
          retrievedAt: new Date().toISOString(),
          trustScore: 0.78,
          sourceType: 'encyclopedia' as const,
          language,
          independenceGroup: `wikimedia:${page.pageprops?.wikibase_item ?? `${language}:${page.pageid}`}`,
        },
      }));
      const timingMs = Date.now() - started;
      this.logger.log(
        JSON.stringify({
          provider: this.id,
          query: this.safeQuery(request),
          language,
          fallbackLanguageUsed: index > 0,
          pageId: page.pageid,
          evidenceCount: facts.length,
          timingMs,
          outcome: 'success',
        }),
      );
      return {
        provider: this.id,
        facts,
        timingMs,
        warnings: [],
        diagnostics: {
          query: this.safeQuery(request),
          language,
          fallbackLanguageUsed: index > 0,
          resolvedEntityIds: [`wikipedia:${language}:${page.pageid}`],
          acceptedFacts: facts.length,
          rejectedFacts: 0,
        },
      };
    }
    throw new ResearchProviderError(
      weakMatch ? 'ENTITY_MATCH_WEAK' : 'ENTITY_NOT_FOUND',
    );
  }
  private async resolve(
    request: ResearchRequest,
    language: string,
    maxResults: number,
  ) {
    const query = this.safeQuery(request);
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
    url.search = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: String(maxResults),
      srnamespace: '0',
      format: 'json',
      origin: '*',
    }).toString();
    const response = await this.http.getJson<SearchResponse>(url, {
      timeoutMs: this.config.wikipedia().timeoutMs,
      maxBytes: 500_000,
    });
    const ranked = (response.query?.search ?? []).map((item) => ({
      ...item,
      score: this.entities.score(query, [item.title]),
    }));
    if (!ranked.length) return undefined;
    ranked.sort((a, b) => b.score - a.score);
    if (ranked[0].score < 0.62) return ranked[0];
    return this.entities.select(ranked, 0.62);
  }
  private async page(language: string, pageid: number, maxChars: number) {
    const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
    url.search = new URLSearchParams({
      action: 'query',
      pageids: String(pageid),
      prop: 'extracts|info|pageprops',
      exintro: '1',
      explaintext: '1',
      exchars: String(maxChars),
      inprop: 'url',
      redirects: '1',
      format: 'json',
      origin: '*',
    }).toString();
    const response = await this.http.getJson<PageResponse>(url, {
      timeoutMs: this.config.wikipedia().timeoutMs,
      maxBytes: Math.max(500_000, maxChars * 4),
    });
    const page = Object.values(response.query?.pages ?? {})[0];
    if (!page) throw new ResearchProviderError('ENTITY_NOT_FOUND');
    return page;
  }
  private safeQuery(request: ResearchRequest) {
    const parts = request.entityHint
      ? [request.entityHint]
      : [request.categoryName, request.topicIntent].filter(
          (value): value is string => Boolean(value),
        );
    return parts
      .filter(
        (value, index) =>
          parts.findIndex(
            (candidate) =>
              this.entities.normalize(candidate) ===
              this.entities.normalize(value),
          ) === index,
      )
      .join(' ')
      .slice(0, 240);
  }
  private preferredLanguages(locale: string | undefined, configured: string[]) {
    const preferred = locale?.split('-')[0]?.toLowerCase();
    return [
      ...new Set(
        [preferred, ...configured].filter((value): value is string =>
          Boolean(value),
        ),
      ),
    ];
  }
  private sentences(extract: string) {
    return extract
      .split(/(?<=[.!؟])\s+/u)
      .map((value) => value.trim())
      .filter((value) => value.length >= 30 && value.length <= 700);
  }
}
