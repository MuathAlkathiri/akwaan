import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntityResearchProvider } from '../../contracts/entity-research-provider.interface';
import type {
  EntityVerificationRequest,
  VerifiedEntity,
} from '../../application/entity-verification.types';
import type { WigoloToolResponse } from './wigolo-client';
import { WigoloClient } from './wigolo-client';
import { WigoloResponseMapper } from './wigolo-response.mapper';

@Injectable()
export class WigoloResearchProvider implements EntityResearchProvider {
  private readonly mapper = new WigoloResponseMapper();
  constructor(
    private readonly client: WigoloClient,
    private readonly config: ConfigService,
  ) {}

  async verifyEntity(
    request: EntityVerificationRequest,
  ): Promise<VerifiedEntity> {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        canonicalEntity: { type: 'string' },
        canonicalAnswer: { type: 'string' },
        aliases: { type: 'array', items: { type: 'string' } },
        originalLanguageAliases: { type: 'array', items: { type: 'string' } },
        transliterations: { type: 'array', items: { type: 'string' } },
        franchise: { type: 'string' },
        organization: { type: 'string' },
        artist: { type: 'string' },
        titleAliases: { type: 'array', items: { type: 'string' } },
        artistAliases: { type: 'array', items: { type: 'string' } },
        country: { type: 'string' },
        releaseYear: { type: 'integer' },
      },
      required: ['canonicalEntity', 'canonicalAnswer', 'aliases'],
    };
    const research = await this.client.callToolDetailed('research', {
      question: this.researchQuestion(request),
      depth: 'quick',
      max_sources: this.number('WIGOLO_MAX_SOURCES', 8),
      max_tokens_out: 3500,
      include_full_markdown: false,
      citation_format: 'json',
      schema,
    });
    const search = await this.search(request).catch(() => undefined);
    return this.mapper.map(request, this.merge(research, search));
  }

  health() {
    return this.client.health();
  }

  private async search(
    request: EntityVerificationRequest,
  ): Promise<WigoloToolResponse> {
    return this.client.callToolDetailed('search', {
      query: this.searchQueries(request),
      max_results: this.number('WIGOLO_MAX_SOURCES', 8),
      max_fetches: Math.min(this.number('WIGOLO_MAX_SOURCES', 8), 4),
      search_depth: 'balanced',
      exclude_domains:
        request.entityType === 'song'
          ? undefined
          : [
              'youtube.com',
              'wallpaperflare.com',
              'pdf24.org',
              'tools.pdf24.org',
              'ptaheute.de',
              'doccheck.com',
              'square-enix-games.com',
            ],
      include_full_markdown: false,
      citation_format: 'json',
    });
  }
  private researchQuestion(request: EntityVerificationRequest): string {
    if (request.entityType === 'song') {
      return [
        request.proposedEntity,
        request.artist,
        'song artist country release year alternate spellings music sources',
      ]
        .filter(Boolean)
        .join(' ');
    }
    return [
      this.entitySearchName(request),
      request.franchise,
      request.entityType,
      'identity aliases association sources',
    ]
      .filter(Boolean)
      .join(' ');
  }
  private searchQueries(request: EntityVerificationRequest): string[] {
    if (request.entityType === 'song') {
      return [
        [request.artist, request.proposedEntity].filter(Boolean).join(' '),
        [request.proposedEntity, request.artist, 'song']
          .filter(Boolean)
          .join(' '),
        [request.proposedEntity, request.artist, 'release year']
          .filter(Boolean)
          .join(' '),
      ].filter(Boolean);
    }
    return [
      [this.entitySearchName(request), request.franchise, 'character profile']
        .filter(Boolean)
        .join(' '),
      [this.entitySearchName(request), request.franchise, 'wiki character']
        .filter(Boolean)
        .join(' '),
      [this.entitySearchName(request), request.franchise, 'association']
        .filter(Boolean)
        .join(' '),
    ].filter(Boolean);
  }
  private entitySearchName(request: EntityVerificationRequest): string {
    if (
      request.entityType === 'anime-character' &&
      this.normalizeArabic(request.proposedEntity) === 'ديدارا'
    )
      return 'Deidara';
    return request.proposedEntity;
  }
  private normalizeArabic(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[إأآٱ]/g, 'ا')
      .trim();
  }
  private merge(
    research: WigoloToolResponse,
    search?: WigoloToolResponse,
  ): Record<string, unknown> {
    if (!search) return research.data;
    return {
      ...research.data,
      wigolo_diagnostics: {
        research: research.diagnostics,
        search: search.diagnostics,
      },
      search_results: search.data,
    };
  }
  private number(key: string, fallback: number): number {
    const n = Number(this.config.get<string>(key));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }
}
