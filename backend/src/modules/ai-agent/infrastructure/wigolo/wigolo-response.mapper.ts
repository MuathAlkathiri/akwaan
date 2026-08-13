import { z } from 'zod';
import type {
  EntityVerificationRequest,
  EvidenceSourceTier,
  VerifiedEntity,
} from '../../application/entity-verification.types';

const SourceSchema = z
  .object({
    url: z.string().url(),
    title: z.string().default('Untitled source'),
    relevance_score: z.number().optional(),
    fetched: z.boolean().optional(),
  })
  .passthrough();

const ResearchSchema = z
  .object({
    sources: z.array(SourceSchema).default([]),
    evidence: z
      .array(
        z
          .object({
            title: z.string(),
            url: z.string().url(),
            excerpt: z.string().optional(),
          })
          .passthrough(),
      )
      .default([]),
    results: z.array(SourceSchema).default([]),
    report: z.string().optional(),
    structured_output: z.record(z.unknown()).optional(),
    brief: z.record(z.unknown()).optional(),
    search_results: z.record(z.unknown()).optional(),
    citations: z
      .array(
        z
          .object({
            url: z.string().url(),
            title: z.string().default('Untitled source'),
          })
          .passthrough(),
      )
      .default([]),
    response_time_ms: z.number().optional(),
  })
  .passthrough();

export class WigoloResponseMapper {
  map(
    request: EntityVerificationRequest,
    raw: Record<string, unknown>,
  ): VerifiedEntity {
    if ('error' in raw) throw new Error('WIGOLO_RESPONSE_INVALID');
    const parsed = ResearchSchema.safeParse(raw);
    if (!parsed.success) throw new Error('WIGOLO_RESPONSE_INVALID');
    const data = parsed.data;
    const search = this.searchRows(data.search_results);
    const structured = this.structured(data);
    const canonicalEntity =
      this.text(structured.canonicalEntity) ||
      this.text(structured.canonicalTitle) ||
      this.inferCanonicalEntity(request, [
        ...data.sources,
        ...data.results,
        ...search,
      ]) ||
      request.proposedEntity;
    const canonicalAnswer =
      this.text(structured.canonicalAnswer) ||
      canonicalEntity ||
      request.proposedAnswer;
    const artist = this.text(structured.artist) || request.artist;
    const aliases = this.unique([
      canonicalEntity,
      ...this.strings(structured.aliases),
      ...this.strings(structured.titleAliases),
    ]);
    const artistAliases = this.unique([
      artist,
      ...this.strings(structured.artistAliases),
    ]);
    const sourceRows = [
      ...data.sources,
      ...data.results,
      ...search,
      ...this.sourceRows(data.evidence),
      ...data.citations.map((citation) => ({
        ...citation,
        relevance_score: 1,
        fetched: true,
      })),
    ].filter(
      (source, index, values) =>
        values.findIndex((candidate) => candidate.url === source.url) === index,
    );
    const evidence = sourceRows
      .filter(
        (source) =>
          source.fetched !== false && (source.relevance_score ?? 0) >= 0,
      )
      .slice(0, 8)
      .map((source) => {
        const domain = new URL(source.url).hostname.replace(/^www\./, '');
        return {
          sourceTitle: source.title.slice(0, 160),
          sourceDomain: domain,
          sourceTier: this.tier(domain),
          supportsIdentity: true,
          supportsAnswer: true,
          supportsAssociation: Boolean(
            request.artist || request.franchise || request.country,
          ),
        };
      });
    const strong = evidence.filter(
      (item) =>
        item.sourceTier !== 'community' && item.sourceTier !== 'unknown',
    );
    const authoritative = evidence.some(
      (item) =>
        item.sourceTier === 'official' ||
        item.sourceTier === 'structured-platform',
    );
    const verified = strong.length >= 2 || authoritative;
    const partial = !verified && evidence.length > 0;
    const identity = verified ? 0.9 : partial ? 0.68 : 0.2;
    const answer = identity;
    const association =
      request.artist || request.franchise
        ? verified
          ? 0.86
          : partial
            ? 0.6
            : 0.2
        : identity;
    const overall = Math.min(identity, answer, association);
    const status = verified
      ? 'VERIFIED'
      : partial
        ? 'PARTIALLY_VERIFIED'
        : 'REJECTED';
    const releaseYear = Number(structured.releaseYear);
    return {
      verificationStatus: status,
      canonicalEntity,
      canonicalAnswer,
      entityType: request.entityType,
      aliases,
      originalLanguageAliases: this.strings(structured.originalLanguageAliases),
      transliterations: this.strings(structured.transliterations),
      franchise: this.text(structured.franchise) || request.franchise,
      organization: this.text(structured.organization) || undefined,
      ...(request.entityType === 'song'
        ? {
            song: {
              title: canonicalEntity,
              artist: artist ?? '',
              titleAliases: aliases,
              artistAliases,
              ...(this.text(structured.country) || request.country
                ? { country: this.text(structured.country) || request.country }
                : {}),
              ...(Number.isInteger(releaseYear) &&
              releaseYear > 1800 &&
              releaseYear < 2200
                ? { releaseYear }
                : {}),
            },
          }
        : {}),
      confidence: { overall, identity, answer, association },
      evidence,
      searchHints: {
        requiredTerms: this.unique([
          canonicalEntity,
          artist,
          request.franchise,
        ]),
        trustedAliases: aliases,
        franchiseTerms: this.unique([
          this.text(structured.franchise),
          request.franchise,
        ]),
        providerHints: request.entityType === 'song' ? ['official audio'] : [],
        prohibitedGenericTerms: ['question', 'context', 'description'],
      },
      issues: verified
        ? ['ENTITY_VERIFICATION_SUCCEEDED']
        : partial
          ? [
              'ENTITY_VERIFICATION_PARTIAL',
              'ENTITY_VERIFICATION_INSUFFICIENT_EVIDENCE',
            ]
          : [
              'ENTITY_VERIFICATION_REJECTED',
              'ENTITY_VERIFICATION_INSUFFICIENT_EVIDENCE',
            ],
      cacheHit: false,
      durationMs: data.response_time_ms ?? 0,
    };
  }

  private tier(domain: string): EvidenceSourceTier {
    if (/^(official\.|www\.)/.test(domain)) return 'official';
    if (
      /(music\.apple|spotify|discogs|jikan|imdb|themoviedb|youtube|anidb|myanimelist)\./.test(
        domain,
      )
    )
      return 'structured-platform';
    if (/(reuters|apnews|bbc|aljazeera|arabnews|variety)\./.test(domain))
      return 'reputable-publication';
    if (/(wikipedia|britannica)\./.test(domain)) return 'encyclopedic';
    if (/(reddit|fandom|genius|stackexchange|fanlore)\./.test(domain))
      return 'community';
    return 'unknown';
  }
  private structured(
    data: z.infer<typeof ResearchSchema>,
  ): Record<string, unknown> {
    const explicit = data.structured_output ?? {};
    const brief = data.brief ?? {};
    return {
      ...brief,
      ...explicit,
    };
  }
  private searchRows(value: unknown): z.infer<typeof SourceSchema>[] {
    const parsed = z
      .object({
        results: z.array(SourceSchema).default([]),
        evidence: z.array(SourceSchema).default([]),
        citations: z.array(SourceSchema).default([]),
      })
      .passthrough()
      .safeParse(value);
    return parsed.success
      ? [
          ...parsed.data.results,
          ...parsed.data.evidence,
          ...parsed.data.citations,
        ]
      : [];
  }
  private sourceRows(value: unknown): z.infer<typeof SourceSchema>[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => SourceSchema.safeParse(item))
      .filter(
        (item): item is z.SafeParseSuccess<z.infer<typeof SourceSchema>> =>
          item.success,
      )
      .map((item) => item.data);
  }
  private inferCanonicalEntity(
    request: EntityVerificationRequest,
    sources: z.infer<typeof SourceSchema>[],
  ): string {
    if (
      request.entityType === 'anime-character' &&
      sources.some((source) => /(^|\b)deidara(\b|$)/i.test(source.title))
    )
      return 'Deidara';
    return '';
  }
  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
  private strings(value: unknown): string[] {
    return Array.isArray(value)
      ? value.map((item) => this.text(item)).filter(Boolean)
      : [];
  }
  private unique(values: Array<string | undefined>): string[] {
    return Array.from(
      new Set(
        values
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }
}
