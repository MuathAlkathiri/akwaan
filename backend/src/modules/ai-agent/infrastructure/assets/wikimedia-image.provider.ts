import { Injectable } from '@nestjs/common';
import { access } from 'fs/promises';
import {
  AssetMetadata,
  AssetProvider,
  AssetRequest,
} from '../../contracts/asset-provider.interface';
import { AssetProviderStepError } from './youtube-asset.provider';
import { ImageDownloadService } from './image-download.service';
import { evaluateAssetRelevance } from '../../contracts/asset-relevance';
import { entityFirstSearchPolicy } from '../../application/entity-first-search.policy';

type WikiPage = {
  pageid?: number;
  title: string;
  fullurl?: string;
  thumbnail?: { source?: string };
  original?: { source?: string };
  description?: string;
  categories?: Array<{ title?: string }>;
};
type CachedAsset = { asset: AssetMetadata; expiresAt: number };

type WikimediaFailureCode =
  | 'WIKIMEDIA_NO_RESULTS'
  | 'WIKIMEDIA_RESPONSE_INVALID'
  | 'WIKIMEDIA_QUERY_FAILED'
  | 'WIKIMEDIA_NO_VALID_IMAGE'
  | 'WIKIMEDIA_DOWNLOAD_FAILED';

@Injectable()
export class WikimediaImageProvider implements AssetProvider {
  private static readonly cache = new Map<string, CachedAsset>();
  private static requestQueue: Promise<void> = Promise.resolve();
  private static lastRequestAt = 0;
  private readonly cacheTtlMs = 24 * 60 * 60 * 1000;
  private readonly minRequestIntervalMs = 350;
  private readonly maxRetries = 2;

  constructor(private readonly downloader: ImageDownloadService) {}

  supports(request: AssetRequest) {
    return (
      request.type?.trim().toLowerCase() === 'image' &&
      (!request.provider ||
        request.provider.trim().toLowerCase() === 'wikimedia')
    );
  }

  async process(request: AssetRequest): Promise<AssetMetadata> {
    const attemptedQueries: string[] = [];
    const cacheKey = this.buildCacheKey(request);
    const cached = await this.getCached(cacheKey);
    if (cached)
      return this.withDiagnostics(
        cached,
        attemptedQueries,
        cached.searchQuery,
        true,
        0,
      );

    const candidates = this.buildCandidates(request);
    if (!candidates.length) {
      throw new AssetProviderStepError(
        'image-search',
        'Image request has no concise searchable metadata',
        {
          attemptedQueries,
          provider: 'wikimedia',
          cacheHit: false,
          retryCount: 0,
        },
      );
    }

    const failures: Array<{
      query: string;
      code: WikimediaFailureCode;
      reason: string;
    }> = [];
    const pool: Array<{
      page: WikiPage;
      query: string;
      score: number;
      relevance: ReturnType<typeof evaluateAssetRelevance>;
    }> = [];
    const relevanceRejections: Record<string, number> = {};
    const seen = new Set<string>();
    let totalRetries = 0;
    let successfulQueryCount = 0;
    let rawCandidateCount = 0;
    let rejectedCandidateCount = 0;
    let invalidResponseCount = 0;
    for (const query of candidates.slice(0, 5)) {
      attemptedQueries.push(query);
      try {
        const result = await this.search(query);
        totalRetries += result.retryCount;
        successfulQueryCount += 1;
        rawCandidateCount += result.rawCount;
        rejectedCandidateCount += result.rejectedCount;
        const queryTerms = this.searchTerms(query);
        for (const [index, page] of result.pages.slice(0, 5).entries()) {
          const imageUrl = page.original?.source ?? page.thumbnail?.source;
          const key = String(
            page.pageid ?? imageUrl ?? page.title,
          ).toLowerCase();
          if (!imageUrl || seen.has(key) || this.isLowQualityPage(page))
            continue;
          seen.add(key);
          const relevance = evaluateAssetRelevance(request, {
            provider: 'wikimedia',
            assetType: 'image',
            title: page.title,
            description: page.description,
            pageUrl: page.fullurl,
            mediaUrl: imageUrl,
            queryUsed: query,
            metadataTerms: (page.categories ?? []).map(
              ({ title }) => title ?? '',
            ),
          });
          if (!relevance.accepted) {
            for (const code of relevance.rejectionCodes)
              relevanceRejections[code] = (relevanceRejections[code] ?? 0) + 1;
            continue;
          }
          const score =
            this.pageScore(page, queryTerms, index) + relevance.score;
          pool.push({ page, query, score, relevance });
        }
        if (!result.pages.length) {
          failures.push({
            query,
            code:
              result.rawCount > 0
                ? 'WIKIMEDIA_NO_VALID_IMAGE'
                : 'WIKIMEDIA_NO_RESULTS',
            reason:
              result.rawCount > 0
                ? 'Wikimedia returned malformed or incomplete page entries'
                : 'Wikimedia returned no pages',
          });
        }
      } catch (error) {
        const retryCount =
          error instanceof WikimediaRequestError ? error.retryCount : 0;
        totalRetries += retryCount;
        const code: WikimediaFailureCode =
          error instanceof WikimediaResponseError
            ? 'WIKIMEDIA_RESPONSE_INVALID'
            : 'WIKIMEDIA_QUERY_FAILED';
        if (code === 'WIKIMEDIA_RESPONSE_INVALID') invalidResponseCount += 1;
        failures.push({
          query,
          code,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    rejectedCandidateCount = Math.max(
      rejectedCandidateCount,
      rawCandidateCount - pool.length,
    );
    const selected = pool.sort((left, right) => right.score - left.score)[0];
    if (selected) {
      const imageUrl =
        selected.page.original?.source ?? selected.page.thumbnail?.source;
      try {
        const stored = await this.downloader.download(
          imageUrl!,
          selected.page.title,
        );
        const asset: AssetMetadata = {
          type: 'image',
          ...stored,
          source: 'wikimedia',
          sourceUrl: selected.page.fullurl ?? imageUrl,
          provider: 'wikimedia',
          searchQuery: selected.query,
          metadata: {
            title: selected.page.title,
            attribution: 'Wikimedia contributors',
            attemptedQueryCount: attemptedQueries.length,
            successfulQueryCount,
            rawCandidateCount,
            candidateCount: pool.length,
            deduplicatedCandidateCount: pool.length,
            rejectedCandidateCount,
            fallbackUsed: selected.query !== attemptedQueries[0],
            relevanceScore: selected.relevance.score,
            relevanceEvidence: selected.relevance.evidence,
          },
        };
        WikimediaImageProvider.cache.set(cacheKey, {
          asset,
          expiresAt: Date.now() + this.cacheTtlMs,
        });
        return this.withDiagnostics(
          asset,
          attemptedQueries,
          selected.query,
          false,
          totalRetries,
        );
      } catch (error) {
        throw new AssetProviderStepError(
          'download',
          'The selected Wikimedia image could not be downloaded',
          {
            failureCode: 'WIKIMEDIA_DOWNLOAD_FAILED',
            attemptedQueryCount: attemptedQueries.length,
            successfulQueryCount,
            rawCandidateCount,
            candidateCount: pool.length,
            deduplicatedCandidateCount: pool.length,
            rejectedCandidateCount,
            fallbackUsed: selected.query !== attemptedQueries[0],
          },
        );
      }
    }

    const failureCode: WikimediaFailureCode =
      successfulQueryCount === 0
        ? invalidResponseCount === attemptedQueries.length
          ? 'WIKIMEDIA_RESPONSE_INVALID'
          : 'WIKIMEDIA_QUERY_FAILED'
        : rawCandidateCount === 0
          ? 'WIKIMEDIA_NO_RESULTS'
          : 'WIKIMEDIA_NO_VALID_IMAGE';
    throw new AssetProviderStepError(
      'image-search',
      failureCode === 'WIKIMEDIA_RESPONSE_INVALID'
        ? 'Wikimedia returned an invalid page collection'
        : failureCode === 'WIKIMEDIA_QUERY_FAILED'
          ? 'Wikimedia queries failed before candidates could be evaluated'
          : failureCode === 'WIKIMEDIA_NO_RESULTS'
            ? 'Wikimedia returned no search results'
            : 'Wikimedia returned pages but no suitable image matched the request',
      {
        failureCode,
        attemptedQueries,
        attemptedQueryCount: attemptedQueries.length,
        successfulQueryCount,
        provider: 'wikimedia',
        cacheHit: false,
        retryCount: totalRetries,
        rawCandidateCount,
        candidateCount: pool.length,
        deduplicatedCandidateCount: pool.length,
        rejectedCandidateCount,
        fallbackUsed: attemptedQueries.length > 1,
        attempts: failures,
        relevanceRejections,
      },
    );
  }

  buildCandidates(request: AssetRequest): string[] {
    const plan = entityFirstSearchPolicy.create(request);
    const entity = plan.canonicalEntity;
    const franchise = plan.franchise;
    const entityType = this.cleanTerm(request.entityType);
    const candidates: Array<string | undefined> = [];

    if (request.purpose === 'decorative') {
      const coverTopic =
        plan.coverTopic ||
        (entityType === 'character' && franchise ? franchise : entity);
      const coverPlan =
        coverTopic === plan.canonicalEntity
          ? plan
          : entityFirstSearchPolicy.create({
              ...request,
              canonicalEntity: coverTopic,
              entity: coverTopic,
              coverTopic,
              aliases: [coverTopic],
            });
      candidates.push(
        coverTopic,
        coverTopic && franchise && coverTopic !== franchise
          ? `${franchise} ${coverTopic}`
          : undefined,
        coverTopic && `${coverTopic} logo`,
      );
      return entityFirstSearchPolicy.queries(coverPlan, candidates, 'cover')
        .queries;
    } else if (entityType === 'location') {
      candidates.push(
        entity,
        entity && franchise ? `${entity} ${franchise}` : undefined,
        entity && `${entity} location`,
      );
    } else if (entityType === 'character' || entity) {
      candidates.push(
        entity,
        entity && franchise ? `${entity} ${franchise}` : undefined,
        entity && `${entity} portrait`,
        plan.aliases.find((alias) => alias !== entity),
      );
    } else {
      candidates.push(entity, ...plan.aliases.slice(1));
    }
    const legacy = entityFirstSearchPolicy.legacyQuery(
      plan,
      request.query,
      'primary',
    );
    if (legacy) candidates.push(legacy);
    return entityFirstSearchPolicy.queries(plan, candidates, 'primary').queries;
  }

  private cleanTerm(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const cleaned = value
      .replace(/[؟?!.،,:;؛"'()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned && cleaned.length <= 80 && cleaned.split(' ').length <= 8
      ? cleaned
      : undefined;
  }

  private cleanLegacyQuery(value: unknown): string | undefined {
    const cleaned = this.cleanTerm(value);
    if (!cleaned) return undefined;
    const questionWords =
      /^(من|ما|ماذا|أين|اين|متى|كيف|لماذا|هل|who|what|where|when|how)\b/i;
    const explanatory =
      /(صورة|ابحث|توضح|تظهر|تمثل|لقطة|الشخصية التي|image of|photo of|showing)/i;
    return questionWords.test(cleaned) || explanatory.test(cleaned)
      ? undefined
      : cleaned;
  }

  private async search(query: string): Promise<{
    pages: WikiPage[];
    rawCount: number;
    rejectedCount: number;
    retryCount: number;
  }> {
    return this.serialize(async () => {
      let retryCount = 0;
      while (true) {
        await this.waitForRateWindow();
        const endpoint = this.buildEndpoint(query);
        const response = await fetch(endpoint, {
          signal: AbortSignal.timeout(10_000),
          headers: {
            'User-Agent':
              'LammahQuiz/1.0 (contact: admin@lammah.app; question image retrieval)',
            Accept: 'application/json',
          },
        });
        WikimediaImageProvider.lastRequestAt = Date.now();
        if (response.status !== 429) {
          if (!response.ok)
            throw new WikimediaRequestError(
              `Wikipedia returned HTTP ${response.status}`,
              retryCount,
            );
          const payload = (await response.json()) as unknown;
          const parsed = this.parseSearchResponse(payload);
          return { ...parsed, retryCount };
        }
        if (retryCount >= this.maxRetries)
          throw new WikimediaRequestError(
            'Wikipedia rate limit persisted after retries',
            retryCount,
          );
        const retryAfter = Number(response.headers.get('retry-after'));
        const delayMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 1000 * 2 ** retryCount;
        retryCount += 1;
        await this.delay(Math.min(delayMs, 10_000));
      }
    });
  }

  normalizePages(pages: unknown): WikiPage[] {
    const entries = Array.isArray(pages)
      ? pages
      : this.isRecord(pages)
        ? Object.values(pages)
        : [];
    return entries.filter((entry): entry is WikiPage => this.isWikiPage(entry));
  }

  private parseSearchResponse(payload: unknown) {
    if (!this.isRecord(payload))
      throw new WikimediaResponseError('Wikimedia response was not an object');
    const query = payload.query;
    if (query === undefined)
      return { pages: [], rawCount: 0, rejectedCount: 0 };
    if (!this.isRecord(query))
      throw new WikimediaResponseError('Wikimedia query field was invalid');
    const collection = query.pages;
    if (collection === undefined || collection === null)
      return { pages: [], rawCount: 0, rejectedCount: 0 };
    if (!Array.isArray(collection) && !this.isRecord(collection))
      throw new WikimediaResponseError(
        'Wikimedia pages field was neither an array nor an object map',
      );
    const rawCount = Array.isArray(collection)
      ? collection.length
      : Object.keys(collection).length;
    const pages = this.normalizePages(collection);
    return {
      pages,
      rawCount,
      rejectedCount: rawCount - pages.length,
    };
  }

  private isWikiPage(value: unknown): value is WikiPage {
    return (
      this.isRecord(value) &&
      typeof value.title === 'string' &&
      value.title.trim().length > 0 &&
      (value.pageid === undefined || typeof value.pageid === 'number') &&
      (value.fullurl === undefined || typeof value.fullurl === 'string') &&
      (value.thumbnail === undefined ||
        this.isImageReference(value.thumbnail)) &&
      (value.original === undefined || this.isImageReference(value.original))
    );
  }

  private isImageReference(value: unknown) {
    return (
      this.isRecord(value) &&
      (value.source === undefined || typeof value.source === 'string')
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private buildEndpoint(query: string) {
    const language = /[\u0600-\u06ff]/.test(query) ? 'ar' : 'en';
    const endpoint = new URL(`https://${language}.wikipedia.org/w/api.php`);
    const params = {
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrlimit: '5',
      prop: 'pageimages|info|description|categories',
      piprop: 'original|thumbnail|name',
      pithumbsize: '1200',
      inprop: 'url',
      cllimit: '20',
      format: 'json',
      origin: '*',
    };
    Object.entries(params).forEach(([key, value]) =>
      endpoint.searchParams.set(key, value),
    );
    return endpoint;
  }

  selectPage(pages: WikiPage[], query: string) {
    const queryTerms = this.searchTerms(query);
    return pages
      .filter((page) => page.original?.source || page.thumbnail?.source)
      .filter((page) => !this.isLowQualityPage(page))
      .map((page, index) => ({
        page,
        score: this.pageScore(page, queryTerms, index),
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)[0]?.page;
  }

  private pageScore(page: WikiPage, queryTerms: string[], index: number) {
    const title = this.normalizeSearchText(page.title);
    const titleTerms = new Set(title.split(' ').filter(Boolean));
    const matched = queryTerms.filter((term) => titleTerms.has(term)).length;
    const coverage = queryTerms.length ? matched / queryTerms.length : 0;
    const exact = title === queryTerms.join(' ') ? 8 : 0;
    const originalBonus = page.original?.source ? 1 : 0;
    return exact + coverage * 6 + originalBonus - index * 0.05;
  }

  private isLowQualityPage(page: WikiPage) {
    return /\b(disambiguation|list of|episode|season|soundtrack)\b|توضيح|قائمة/i.test(
      page.title,
    );
  }

  private searchTerms(value: string) {
    const ignored = new Set([
      'logo',
      'portrait',
      'location',
      'promotional',
      'visual',
      'character',
      'صورة',
    ]);
    return this.normalizeSearchText(value)
      .split(' ')
      .filter((term) => term.length > 1 && !ignored.has(term));
  }

  private normalizeSearchText(value: string) {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLowerCase();
  }

  private buildCacheKey(request: AssetRequest) {
    return ['wikimedia', request.entity, request.franchise, request.purpose]
      .map((value) =>
        String(value ?? '')
          .trim()
          .toLowerCase(),
      )
      .join('|');
  }

  private async getCached(key: string) {
    const cached = WikimediaImageProvider.cache.get(key);
    if (!cached || cached.expiresAt <= Date.now()) {
      WikimediaImageProvider.cache.delete(key);
      return null;
    }
    try {
      await access(
        cached.asset.localPath.startsWith('/')
          ? cached.asset.localPath
          : this.downloader.absolutePath(cached.asset.localPath),
      );
      return cached.asset;
    } catch {
      WikimediaImageProvider.cache.delete(key);
      return null;
    }
  }

  private withDiagnostics(
    asset: AssetMetadata,
    attemptedQueries: string[],
    successfulQuery: string | undefined,
    cacheHit: boolean,
    retryCount: number,
  ): AssetMetadata {
    return {
      ...asset,
      metadata: {
        ...asset.metadata,
        attemptedQueries,
        successfulQuery,
        provider: 'wikimedia',
        cacheHit,
        retryCount,
      },
    };
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = WikimediaImageProvider.requestQueue;
    let release!: () => void;
    WikimediaImageProvider.requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async waitForRateWindow() {
    const remaining =
      this.minRequestIntervalMs -
      (Date.now() - WikimediaImageProvider.lastRequestAt);
    if (remaining > 0) await this.delay(remaining);
  }
  private delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}

class WikimediaRequestError extends Error {
  constructor(
    message: string,
    readonly retryCount: number,
  ) {
    super(message);
  }
}

class WikimediaResponseError extends Error {}
