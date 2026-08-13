import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssetMetadata,
  AssetProvider,
  AssetRequest,
} from '../../contracts/asset-provider.interface';
import {
  evaluateAssetRelevance,
  normalize,
} from '../../contracts/asset-relevance';
import { AssetProviderStepError } from './youtube-asset.provider';
import { ImageDownloadService } from './image-download.service';
import { entityFirstSearchPolicy } from '../../application/entity-first-search.policy';

type JikanImageSet = { image_url?: string; large_image_url?: string };
type JikanSearchEntry = {
  mal_id: number;
  url?: string;
  name: string;
  name_kanji?: string;
  nicknames: string[];
  images?: { jpg?: JikanImageSet; webp?: JikanImageSet };
};
type JikanAnimeRelation = {
  anime?: { mal_id?: number; name?: string; url?: string };
};
type JikanCharacterDetails = JikanSearchEntry & { anime: JikanAnimeRelation[] };
type JikanCandidate = {
  id: number;
  name: string;
  aliases: string[];
  franchiseEvidence: string[];
  imageUrl: string;
  pageUrl?: string;
  queryUsed: string;
};
type CacheEntry = { expiresAt: number; candidates: JikanCandidate[] };

@Injectable()
export class JikanAnimeImageProvider implements AssetProvider {
  private static readonly cache = new Map<string, CacheEntry>();
  private static requestQueue: Promise<void> = Promise.resolve();
  private static lastRequestAt = 0;
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private readonly timeoutMs: number;
  private readonly positiveTtlMs: number;
  private readonly negativeTtlMs: number;
  private readonly minRequestIntervalMs: number;
  private readonly maxCacheEntries = 200;

  constructor(
    private readonly config: ConfigService,
    private readonly downloader: ImageDownloadService,
  ) {
    this.baseUrl = (
      config.get<string>('JIKAN_API_BASE_URL') ?? 'https://api.jikan.moe/v4'
    ).replace(/\/+$/, '');
    this.enabled =
      (config.get<string>('JIKAN_PROVIDER_ENABLED') ?? 'true').toLowerCase() ===
      'true';
    this.timeoutMs = this.numberConfig('JIKAN_REQUEST_TIMEOUT_MS', 10_000);
    this.positiveTtlMs = this.numberConfig(
      'JIKAN_CACHE_TTL_MS',
      24 * 60 * 60 * 1000,
    );
    this.negativeTtlMs = this.numberConfig(
      'JIKAN_NEGATIVE_CACHE_TTL_MS',
      10 * 60 * 1000,
    );
    this.minRequestIntervalMs = this.numberConfig(
      'JIKAN_MIN_REQUEST_INTERVAL_MS',
      400,
    );
  }

  supports(request: AssetRequest): boolean {
    if (request.type !== 'image' || request.purpose === 'decorative')
      return false;
    if (request.provider && normalize(request.provider) !== 'jikan')
      return false;
    const entityType = normalize(request.entityType ?? '');
    const categoryType = normalize(request.categoryType ?? '');
    const character =
      ['anime character', 'fictional character', 'character'].includes(
        entityType,
      ) || request.gameMode === 'identifyCharacter';
    const anime =
      entityType === 'anime character' ||
      ['anime', 'manga'].includes(categoryType);
    return character && anime && Boolean(this.entityQueries(request).length);
  }

  support(request: AssetRequest) {
    return this.supports(request)
      ? { supported: true }
      : {
          supported: false,
          reason:
            'JIKAN_REQUEST_UNSUPPORTED: request is not a primary anime-character image',
        };
  }

  async process(request: AssetRequest): Promise<AssetMetadata> {
    if (!this.supports(request))
      throw this.failure(
        'JIKAN_REQUEST_UNSUPPORTED',
        'Jikan does not support this image request',
      );
    if (!this.enabled)
      throw this.failure(
        'JIKAN_PROVIDER_DISABLED',
        'Jikan provider is disabled',
      );
    const queries = this.entityQueries(request);
    const cacheKey = this.cacheKey(request, queries);
    const cached = this.readCache(cacheKey);
    let candidates = cached?.candidates;
    let cacheHit = Boolean(cached);
    if (!candidates) {
      candidates = await this.searchQueries(queries);
      this.writeCache(cacheKey, candidates);
      cacheHit = false;
    }
    if (!candidates.length)
      throw this.failure(
        'JIKAN_NO_RESULTS',
        'Jikan returned no character results',
        { queryCount: queries.length, cacheHit, resultCount: 0 },
      );

    const rejectionCounts: Record<string, number> = {};
    const ranked = candidates
      .flatMap((candidate) => {
        const decision = evaluateAssetRelevance(request, {
          provider: 'jikan',
          assetType: 'image',
          title: candidate.name,
          description: candidate.aliases.join(' '),
          mediaUrl: candidate.imageUrl,
          pageUrl: candidate.pageUrl,
          queryUsed: candidate.queryUsed,
          metadataTerms: ['anime character', ...candidate.franchiseEvidence],
          providerMetadata: { providerEntityId: String(candidate.id) },
        });
        if (!decision.accepted) {
          for (const code of decision.rejectionCodes)
            rejectionCounts[code] = (rejectionCounts[code] ?? 0) + 1;
          return [];
        }
        return [{ candidate, decision }];
      })
      .sort((left, right) => right.decision.score - left.decision.score);
    const selected = ranked[0];
    if (!selected)
      throw this.failure(
        'JIKAN_NO_VALID_CHARACTER',
        'Jikan results did not match the requested character and franchise',
        {
          queryCount: queries.length,
          cacheHit,
          resultCount: candidates.length,
          validCandidateCount: 0,
          rejectedCount: candidates.length,
          relevanceRejections: rejectionCounts,
        },
      );
    try {
      const stored = await this.downloader.download(
        selected.candidate.imageUrl,
        selected.candidate.name,
      );
      return {
        ...stored,
        type: 'image',
        source: 'jikan',
        provider: 'jikan',
        sourceUrl: selected.candidate.pageUrl,
        searchQuery: selected.candidate.queryUsed,
        metadata: {
          title: selected.candidate.name,
          providerEntityId: String(selected.candidate.id),
          sourceLabel: 'Jikan / MyAnimeList',
          usageType: 'third-party-reference',
          retrievedAt: new Date().toISOString(),
          queryCount: queries.length,
          cacheHit,
          resultCount: candidates.length,
          validCandidateCount: ranked.length,
          rejectedCount: candidates.length - ranked.length,
          relevanceScore: selected.decision.score,
          relevanceEvidence: selected.decision.evidence,
          relevanceRejections: rejectionCounts,
        },
      };
    } catch (error) {
      throw this.failure(
        'JIKAN_DOWNLOAD_FAILED',
        'The selected Jikan image could not be downloaded',
        {
          selectedCharacterId: String(selected.candidate.id),
          selectedQuery: selected.candidate.queryUsed,
          cacheHit,
          reason: error instanceof Error ? error.message : 'download failed',
        },
      );
    }
  }

  normalizeSearchResponse(payload: unknown, query: string): JikanSearchEntry[] {
    if (!this.isRecord(payload) || !Array.isArray(payload.data))
      throw this.failure(
        'JIKAN_RESPONSE_INVALID',
        'Jikan search response was invalid',
      );
    return payload.data.flatMap((value) => {
      if (
        !this.isRecord(value) ||
        typeof value.mal_id !== 'number' ||
        typeof value.name !== 'string'
      )
        return [];
      const nicknames = Array.isArray(value.nicknames)
        ? value.nicknames.filter(
            (item): item is string => typeof item === 'string',
          )
        : [];
      const images = this.isRecord(value.images) ? value.images : undefined;
      return [
        {
          mal_id: value.mal_id,
          name: value.name,
          url: typeof value.url === 'string' ? value.url : undefined,
          name_kanji:
            typeof value.name_kanji === 'string' ? value.name_kanji : undefined,
          nicknames,
          images: images as JikanSearchEntry['images'],
          queryUsed: query,
        } as JikanSearchEntry & { queryUsed: string },
      ];
    });
  }

  private async searchQueries(queries: string[]): Promise<JikanCandidate[]> {
    const seen = new Set<number>();
    const candidates: JikanCandidate[] = [];
    for (const query of queries.slice(0, 4)) {
      const payload = await this.request(
        `/characters?q=${encodeURIComponent(query)}&limit=5`,
      );
      const entries = this.normalizeSearchResponse(payload, query).slice(0, 3);
      for (const entry of entries) {
        if (seen.has(entry.mal_id)) continue;
        seen.add(entry.mal_id);
        const imageUrl = this.imageUrl(entry);
        if (!imageUrl) continue;
        const details = await this.characterDetails(entry);
        candidates.push({
          id: entry.mal_id,
          name: entry.name,
          aliases: [entry.name_kanji, ...entry.nicknames].filter(
            (value): value is string => Boolean(value),
          ),
          franchiseEvidence: details.anime
            .map((relation) => relation.anime?.name)
            .filter((value): value is string => Boolean(value)),
          imageUrl,
          pageUrl: entry.url,
          queryUsed: query,
        });
      }
      if (candidates.length) break;
    }
    return candidates;
  }

  private async characterDetails(
    entry: JikanSearchEntry,
  ): Promise<JikanCharacterDetails> {
    const payload = await this.request(`/characters/${entry.mal_id}/full`);
    if (!this.isRecord(payload) || !this.isRecord(payload.data))
      return { ...entry, anime: [] };
    const anime = Array.isArray(payload.data.anime)
      ? payload.data.anime.filter((value): value is JikanAnimeRelation =>
          this.isRecord(value),
        )
      : [];
    return { ...entry, anime };
  }

  private async request(path: string): Promise<unknown> {
    return this.serialize(async () => {
      let retries = 0;
      while (true) {
        const remaining =
          this.minRequestIntervalMs -
          (Date.now() - JikanAnimeImageProvider.lastRequestAt);
        if (remaining > 0)
          await new Promise((resolve) => setTimeout(resolve, remaining));
        try {
          const response = await fetch(`${this.baseUrl}${path}`, {
            signal: AbortSignal.timeout(this.timeoutMs),
            headers: {
              Accept: 'application/json',
              'User-Agent': 'LammahQuiz/1.0 (anime character image retrieval)',
            },
          });
          JikanAnimeImageProvider.lastRequestAt = Date.now();
          if (response.status === 429 && retries < 2) {
            const retryAfter = Number(response.headers.get('retry-after'));
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                Number.isFinite(retryAfter) && retryAfter > 0
                  ? Math.min(retryAfter * 1000, 5000)
                  : 750 * 2 ** retries,
              ),
            );
            retries += 1;
            continue;
          }
          if (response.status === 429)
            throw this.failure(
              'JIKAN_RATE_LIMITED',
              'Jikan rate limit persisted after bounded retries',
              { retryCount: retries },
            );
          if (!response.ok)
            throw this.failure(
              'JIKAN_PROVIDER_UNAVAILABLE',
              `Jikan returned HTTP ${response.status}`,
              { retryCount: retries },
            );
          return response.json() as Promise<unknown>;
        } catch (error) {
          if (error instanceof AssetProviderStepError) throw error;
          if (
            error instanceof Error &&
            (error.name === 'TimeoutError' || error.name === 'AbortError')
          )
            throw this.failure('JIKAN_TIMEOUT', 'Jikan request timed out');
          throw this.failure(
            'JIKAN_PROVIDER_UNAVAILABLE',
            'Jikan request failed',
          );
        }
      }
    });
  }

  private entityQueries(request: AssetRequest): string[] {
    const plan = entityFirstSearchPolicy.create(request);
    return entityFirstSearchPolicy
      .queries(plan, plan.aliases, 'primary')
      .queries.slice(0, 4);
  }
  private imageUrl(entry: JikanSearchEntry): string | undefined {
    return [
      entry.images?.webp?.large_image_url,
      entry.images?.jpg?.large_image_url,
      entry.images?.webp?.image_url,
      entry.images?.jpg?.image_url,
    ].find(
      (value) => typeof value === 'string' && value.startsWith('https://'),
    );
  }
  private cacheKey(request: AssetRequest, queries: string[]) {
    return [
      queries.map(normalize).join('|'),
      normalize(request.franchise ?? ''),
      normalize(request.entityType ?? ''),
      normalize(request.categoryType ?? ''),
    ].join('::');
  }
  private readCache(key: string) {
    const entry = JikanAnimeImageProvider.cache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      JikanAnimeImageProvider.cache.delete(key);
      return undefined;
    }
    return entry;
  }
  private writeCache(key: string, candidates: JikanCandidate[]) {
    if (JikanAnimeImageProvider.cache.size >= this.maxCacheEntries)
      JikanAnimeImageProvider.cache.delete(
        JikanAnimeImageProvider.cache.keys().next().value as string,
      );
    JikanAnimeImageProvider.cache.set(key, {
      candidates,
      expiresAt:
        Date.now() +
        (candidates.length ? this.positiveTtlMs : this.negativeTtlMs),
    });
  }
  private async serialize<T>(operation: () => Promise<T>) {
    const previous = JikanAnimeImageProvider.requestQueue;
    let release!: () => void;
    JikanAnimeImageProvider.requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
  private numberConfig(key: string, fallback: number) {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
  private failure(
    code: string,
    message: string,
    diagnostics?: Record<string, unknown>,
  ) {
    return new AssetProviderStepError('image-search', message, {
      failureCode: code,
      provider: 'jikan',
      ...diagnostics,
    });
  }
}
