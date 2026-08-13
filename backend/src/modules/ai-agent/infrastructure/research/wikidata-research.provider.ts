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
  search?: Array<{
    id: string;
    label?: string;
    description?: string;
    aliases?: string[];
    match?: { text?: string };
  }>;
};
type SnakValue =
  | { id?: string; time?: string; amount?: string; unit?: string }
  | string
  | number;
type EntityResponse = {
  entities?: Record<
    string,
    {
      id: string;
      labels?: Record<string, { value: string }>;
      aliases?: Record<string, Array<{ value: string }>>;
      descriptions?: Record<string, { value: string }>;
      claims?: Record<
        string,
        Array<{
          mainsnak?: { snaktype?: string; datavalue?: { value?: SnakValue } };
        }>
      >;
    }
  >;
};

const PROPERTY_LABELS: Record<string, string> = {
  P31: 'instance of',
  P17: 'country',
  P27: 'country of citizenship',
  P569: 'date of birth',
  P571: 'inception',
  P577: 'publication or release date',
  P106: 'occupation',
  P178: 'developer',
  P123: 'publisher',
  P400: 'platform',
  P54: 'member of sports team',
  P1344: 'participant in',
  P161: 'cast member',
  P725: 'voice actor',
  P179: 'part of series',
  P131: 'located in',
  P166: 'award received',
  P749: 'parent organization',
};

@Injectable()
export class WikidataResearchProvider implements KnowledgeResearchProvider {
  readonly id = 'wikidata';
  private readonly logger = new Logger(WikidataResearchProvider.name);
  constructor(
    private readonly http: AuthoritativeHttpClient,
    private readonly config: AiPipelineConfigService,
    private readonly resolver: EntityResolutionService,
  ) {
    this.config.wikidata();
  }
  supports(request: ResearchRequest) {
    if (
      !this.config.wikidata().enabled ||
      !request.pack.sourceStrategies.includes('web')
    )
      return false;
    return (
      request.pack.sourcePreferenceByIntent[request.topicIntent] !== 'narrative'
    );
  }
  async research(request: ResearchRequest): Promise<ResearchProviderResult> {
    const started = Date.now();
    const language = request.locale?.split('-')[0] || 'ar';
    const candidate = await this.resolve(request, language);
    const entities = await this.entities([candidate.id], language, true);
    const entity = entities[candidate.id];
    if (!entity) throw new ResearchProviderError('ENTITY_NOT_FOUND');
    const referencedIds = this.referencedEntityIds(entity.claims ?? {}).slice(
      0,
      50,
    );
    const referenced = referencedIds.length
      ? await this.entities(referencedIds, language, false)
      : {};
    const subject =
      this.label(entity, language) ?? candidate.label ?? candidate.id;
    const facts: ResearchProviderResult['facts'] = [];
    let rejectedFacts = 0;
    const maxFacts = this.config.wikidata().maxFactsPerEntity;
    for (const [propertyId, statements] of Object.entries(
      entity.claims ?? {},
    )) {
      const property = PROPERTY_LABELS[propertyId];
      if (!property) {
        rejectedFacts += statements.length;
        continue;
      }
      for (const statement of statements.slice(0, maxFacts - facts.length)) {
        const raw = statement.mainsnak?.datavalue?.value;
        const answer = this.value(raw, referenced, language);
        if (!answer) {
          rejectedFacts += 1;
          continue;
        }
        const fact = `${subject} — ${property}: ${answer}`;
        facts.push({
          fact,
          canonicalAnswer: answer,
          acceptedAnswers: [],
          entities: [subject, answer],
          confidence: 0.94,
          evidence: {
            sourceId: `wikidata:${candidate.id}:${propertyId}`,
            provider: this.id,
            title: subject,
            url: `https://www.wikidata.org/wiki/${candidate.id}`,
            excerpt: fact,
            retrievedAt: new Date().toISOString(),
            trustScore: 0.9,
            sourceType: 'structured-data',
            language,
            independenceGroup: `wikimedia:${candidate.id}`,
            propertyId,
          },
        });
      }
      if (facts.length >= maxFacts) break;
    }
    if (!facts.length)
      throw new ResearchProviderError(
        'ENTITY_NOT_FOUND',
        'WIKIDATA_NO_ALLOWLISTED_FACTS',
      );
    const timingMs = Date.now() - started;
    this.logger.log(
      JSON.stringify({
        provider: this.id,
        query: this.safeQuery(request),
        entityId: candidate.id,
        evidenceCount: facts.length,
        rejectedFacts,
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
        resolvedEntityIds: [candidate.id],
        acceptedFacts: facts.length,
        rejectedFacts,
      },
    };
  }
  private async resolve(request: ResearchRequest, language: string) {
    const query = this.safeQuery(request);
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'wbsearchentities',
      search: query,
      language,
      uselang: language,
      limit: String(this.config.wikidata().maxEntities),
      type: 'item',
      format: 'json',
      origin: '*',
    }).toString();
    const response = await this.http.getJson<SearchResponse>(url, {
      timeoutMs: this.config.wikidata().timeoutMs,
      maxBytes: 500_000,
    });
    const ranked = (response.search ?? []).map((item) => ({
      ...item,
      score:
        this.resolver.score(query, [
          item.label,
          item.match?.text,
          ...(item.aliases ?? []),
        ]) *
          0.95 +
        (this.descriptionMatches(
          item.description,
          `${request.topicIntent} ${request.entityType ?? ''}`,
        )
          ? 0.05
          : 0),
    }));
    return this.resolver.select(ranked, 0.58);
  }
  private async entities(
    ids: string[],
    language: string,
    includeClaims: boolean,
  ) {
    const limited = [...new Set(ids)].slice(0, 50);
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'wbgetentities',
      ids: limited.join('|'),
      props: includeClaims
        ? 'labels|aliases|descriptions|claims'
        : 'labels|aliases|descriptions',
      languages: `${language}|en`,
      languagefallback: '1',
      format: 'json',
      origin: '*',
    }).toString();
    return (
      (
        await this.http.getJson<EntityResponse>(url, {
          timeoutMs: this.config.wikidata().timeoutMs,
          maxBytes: 2_000_000,
        })
      ).entities ?? {}
    );
  }
  private referencedEntityIds(
    claims: NonNullable<EntityResponse['entities']>[string]['claims'],
  ) {
    return Object.entries(claims ?? {})
      .filter(([id]) => id in PROPERTY_LABELS)
      .flatMap(([, values]) =>
        values
          .map((statement) => statement.mainsnak?.datavalue?.value)
          .flatMap((value) =>
            typeof value === 'object' &&
            value &&
            'id' in value &&
            typeof value.id === 'string'
              ? [value.id]
              : [],
          ),
      );
  }
  private value(
    raw: SnakValue | undefined,
    entities: NonNullable<EntityResponse['entities']>,
    language: string,
  ): string | undefined {
    if (typeof raw === 'string' || typeof raw === 'number') return String(raw);
    if (!raw || typeof raw !== 'object') return undefined;
    if (raw.id) return this.label(entities[raw.id], language) ?? raw.id;
    if (raw.time) return raw.time.replace(/^\+/, '').replace(/T00:00:00Z$/, '');
    if (raw.amount) return raw.amount.replace(/^\+/, '');
    return undefined;
  }
  private label(
    entity: NonNullable<EntityResponse['entities']>[string] | undefined,
    language: string,
  ) {
    return (
      entity?.labels?.[language]?.value ??
      entity?.labels?.en?.value ??
      Object.values(entity?.labels ?? {})[0]?.value
    );
  }
  private safeQuery(request: ResearchRequest) {
    const parts = [request.entityHint, request.categoryName].filter(
      (value): value is string => Boolean(value),
    );
    return parts
      .filter(
        (value, index) =>
          parts.findIndex(
            (candidate) =>
              this.resolver.normalize(candidate) ===
              this.resolver.normalize(value),
          ) === index,
      )
      .join(' ')
      .slice(0, 180);
  }
  private descriptionMatches(description: string | undefined, context: string) {
    if (!description) return false;
    const descriptionTokens = new Set(
      this.resolver.normalize(description).split(' '),
    );
    return this.resolver
      .normalize(context)
      .split(' ')
      .some((token) => token.length > 3 && descriptionTokens.has(token));
  }
}
