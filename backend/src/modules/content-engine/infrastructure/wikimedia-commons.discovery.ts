import {
  DiscoveredMedia,
  MediaDiscoveryError,
  MediaDiscoveryProvider,
  MediaDiscoverySearchOptions,
  plainText,
} from '../domain/media-discovery';
import { DEFAULT_DISCOVERY_USER_AGENT, discoveryJson } from './discovery-http';

export { DEFAULT_DISCOVERY_USER_AGENT };

export const WIKIMEDIA_COMMONS_PROVIDER = 'wikimedia-commons';
const API_URL = 'https://commons.wikimedia.org/w/api.php';
/**
 * Rendition width asked for. Commons scales down, never up.
 *
 * 1280 on purpose: Wikimedia serves a fixed ladder of thumbnail widths from
 * cache and rate-limits requests that make it render any other size. The first
 * live run asked for 1600 and one download in four came back HTTP 429.
 */
const RENDITION_WIDTH = 1280;
/**
 * Originals we can end up with a usable raster of. SVG is listed because the
 * rendition Commons returns for it is a PNG; it is only accepted when that
 * rendition exists. TIFF, GIF, PDF, DjVu, audio and video are left out.
 */
const ACCEPTED_ORIGINALS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
]);

interface CommonsMetadataValue {
  value?: unknown;
}

interface CommonsImageInfo {
  url?: unknown;
  descriptionurl?: unknown;
  width?: unknown;
  height?: unknown;
  mime?: unknown;
  thumburl?: unknown;
  thumbwidth?: unknown;
  thumbheight?: unknown;
  extmetadata?: Record<string, CommonsMetadataValue | undefined>;
}

interface CommonsPage {
  title?: unknown;
  index?: unknown;
  imageinfo?: CommonsImageInfo[];
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;

/**
 * Wikimedia Commons as a discovery provider.
 *
 * One read-only request to the public MediaWiki API: a full-text search in the
 * File namespace, with each hit's image info and licence metadata in the same
 * response. No key, no account. Commons is the first provider because it is the
 * one large source whose pages state a licence and an author for every file —
 * which is what a reviewer needs in order to decide about rights at all.
 */
export class WikimediaCommonsDiscoveryProvider implements MediaDiscoveryProvider {
  readonly name = WIKIMEDIA_COMMONS_PROVIDER;

  constructor(
    private readonly options: {
      fetchImpl?: typeof fetch;
      userAgent?: string;
      timeoutMs?: number;
    } = {},
  ) {}

  async search(
    phrase: string,
    options: MediaDiscoverySearchOptions,
  ): Promise<DiscoveredMedia[]> {
    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      generator: 'search',
      gsrsearch: phrase,
      gsrnamespace: '6',
      gsrlimit: String(options.limit),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: String(RENDITION_WIDTH),
    }).toString();

    const payload = await this.request(url, options.signal);
    const pages = (payload as { query?: { pages?: unknown } })?.query?.pages;
    // No hits is a normal answer: the API simply omits `query`.
    if (pages === undefined) return [];
    if (!Array.isArray(pages)) {
      throw new MediaDiscoveryError(
        'DISCOVERY_BAD_RESPONSE',
        'expected query.pages to be an array (formatversion=2)',
      );
    }

    const found: DiscoveredMedia[] = [];
    for (const page of pages as CommonsPage[]) {
      const media = this.toMedia(page, phrase);
      if (media) found.push(media);
    }
    // The API returns pages in page-id order; `index` carries search relevance.
    found.sort((a, b) => a.rank - b.rank);
    return found.map((media, rank) => ({ ...media, rank }));
  }

  /**
   * The named files themselves, in the order asked for. For a caller that
   * already knows which file it wants and needs its sizes and licence.
   */
  async lookup(
    fileNames: string[],
    phrase: string,
    signal?: AbortSignal,
  ): Promise<DiscoveredMedia[]> {
    if (fileNames.length === 0) return [];
    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      titles: fileNames.map((name) => `File:${name}`).join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: String(RENDITION_WIDTH),
    }).toString();
    const payload = await this.request(url, signal);
    const pages = (payload as { query?: { pages?: unknown } })?.query?.pages;
    if (!Array.isArray(pages)) return [];
    const key = (name: string) => name.replace(/_/g, ' ').trim();
    const found: DiscoveredMedia[] = [];
    for (const name of fileNames) {
      const page = (pages as CommonsPage[]).find(
        (entry) =>
          typeof entry?.title === 'string' &&
          key(entry.title.replace(/^File:/i, '')) === key(name),
      );
      const media = page ? this.toMedia(page, phrase) : null;
      if (media) found.push({ ...media, rank: found.length });
    }
    return found;
  }

  private toMedia(page: CommonsPage, phrase: string): DiscoveredMedia | null {
    const info = page?.imageinfo?.[0];
    if (!info) return null;

    const originalUrl = text(info.url);
    const pageUrl = text(info.descriptionurl);
    const originalMimetype = text(info.mime);
    const originalWidth = positive(info.width);
    const originalHeight = positive(info.height);
    if (
      !originalUrl ||
      !pageUrl ||
      !originalMimetype ||
      !originalWidth ||
      !originalHeight ||
      !ACCEPTED_ORIGINALS.has(originalMimetype)
    ) {
      return null;
    }

    const rendition = text(info.thumburl);
    const renditionWidth = positive(info.thumbwidth);
    const renditionHeight = positive(info.thumbheight);
    const hasRendition = Boolean(
      rendition && renditionWidth && renditionHeight,
    );
    const vector = originalMimetype === 'image/svg+xml';
    // An SVG is only usable through its raster rendition.
    if (vector && !hasRendition) return null;
    // For an original narrower than the width asked for, the API still reports
    // the asked-for size while serving the original's bytes: the first live run
    // listed a 404x575 photo as 1600x2277. Only a rendition that is genuinely
    // smaller than a raster original is a rendition; otherwise the original's
    // own numbers are the true ones. (An SVG has no pixel size of its own, so
    // its rendition is always real.)
    const useRendition =
      hasRendition && (vector || (renditionWidth as number) < originalWidth);

    const meta = info.extmetadata ?? {};
    const attribution = text(meta.AttributionRequired?.value)?.toLowerCase();
    const title = text(page.title) ?? pageUrl;

    return {
      provider: this.name,
      rank: positive(page.index) ?? Number.MAX_SAFE_INTEGER,
      matchedPhrase: phrase,
      title: title.replace(/^File:/i, ''),
      downloadUrl: useRendition ? (rendition as string) : originalUrl,
      width: useRendition ? (renditionWidth as number) : originalWidth,
      height: useRendition ? (renditionHeight as number) : originalHeight,
      originalUrl,
      pageUrl,
      originalMimetype,
      licence: {
        name: plainText(meta.LicenseShortName?.value),
        url: text(meta.LicenseUrl?.value),
        attributionRequired:
          attribution === 'true'
            ? true
            : attribution === 'false'
              ? false
              : null,
      },
      author: plainText(meta.Artist?.value),
      credit: plainText(meta.Credit?.value),
    };
  }

  private request(url: URL, outer?: AbortSignal): Promise<unknown> {
    return discoveryJson(url, 'Wikimedia Commons', this.options, outer);
  }
}
