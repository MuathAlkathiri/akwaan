import {
  DiscoveredMedia,
  MediaDiscoveryProvider,
  MediaDiscoverySearchOptions,
} from '../domain/media-discovery';
import { DiscoveryHttpOptions, discoveryJson } from './discovery-http';

export const BRAVE_SEARCH_PROVIDER = 'brave-search';
const API_URL = 'https://api.search.brave.com/res/v1/images/search';

interface BraveImageResult {
  title?: unknown;
  url?: unknown;
  source?: unknown;
  thumbnail?: { src?: unknown };
  properties?: { url?: unknown; width?: unknown; height?: unknown };
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * General web image search, through the Brave Search API.
 *
 * It finds nearly anything — which is the point and the problem. A result is
 * whatever some page on the web happens to show: there is no licence, no
 * author and no reason to think the picture is free to use. So this provider
 * is the *fallback* tier: it is asked only when the catalogued sources found
 * nothing that could be trusted, and what it returns is only ever offered to a
 * reviewer, never attached unseen.
 */
export class BraveImageSearchDiscoveryProvider implements MediaDiscoveryProvider {
  readonly name = BRAVE_SEARCH_PROVIDER;
  readonly tier = 'fallback' as const;

  constructor(
    private readonly apiKey: string,
    private readonly options: DiscoveryHttpOptions = {},
  ) {}

  async search(
    phrase: string,
    options: MediaDiscoverySearchOptions,
  ): Promise<DiscoveredMedia[]> {
    const subject = phrase.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      // A club's name alone finds match photos; its mark has to be asked for.
      q: options.kind === 'club-or-brand-mark' ? `${subject} logo` : subject,
      count: String(Math.min(Math.max(options.limit, 1), 50)),
      safesearch: 'strict',
      spellcheck: 'false',
    }).toString();

    const payload = await discoveryJson(
      url,
      'Brave Search',
      {
        ...this.options,
        headers: { 'x-subscription-token': this.apiKey },
      },
      options.signal,
    );
    const results = (payload as { results?: unknown })?.results;
    if (!Array.isArray(results)) return [];

    const found: DiscoveredMedia[] = [];
    for (const result of results as BraveImageResult[]) {
      const imageUrl = text(result?.properties?.url);
      const pageUrl = text(result?.url);
      const width = positive(result?.properties?.width);
      const height = positive(result?.properties?.height);
      // Without a size the image cannot be judged fit for a TV; skip it.
      if (!imageUrl || !pageUrl || !width || !height) continue;
      if (!/^https:\/\//i.test(imageUrl)) continue;
      const extension = /\.([a-z0-9]+)(?:[?#]|$)/i
        .exec(new URL(imageUrl).pathname)?.[1]
        ?.toLowerCase();
      const preview = text(result?.thumbnail?.src);
      found.push({
        provider: this.name,
        rank: found.length,
        matchedPhrase: phrase,
        title: text(result?.title) ?? text(result?.source) ?? pageUrl,
        downloadUrl: imageUrl,
        width,
        height,
        originalUrl: imageUrl,
        pageUrl,
        // A guess from the address; the downloader verifies the real bytes.
        originalMimetype:
          MIME_BY_EXTENSION[extension ?? ''] ?? 'application/octet-stream',
        licence: { name: null, url: null, attributionRequired: null },
        author: null,
        credit: text(result?.source),
        ...(preview ? { previewUrl: preview } : {}),
      });
    }
    return found;
  }
}
