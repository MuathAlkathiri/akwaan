import {
  DiscoveredMedia,
  MediaDiscoveryError,
  MediaDiscoveryProvider,
  MediaDiscoverySearchOptions,
  plainText,
} from '../domain/media-discovery';

export const WIKIMEDIA_COMMONS_PROVIDER = 'wikimedia-commons';
const API_URL = 'https://commons.wikimedia.org/w/api.php';
/** Rendition width asked for. Commons scales down, never up. */
const RENDITION_WIDTH = 1600;
const DEFAULT_TIMEOUT_MS = 10_000;
/**
 * Wikimedia asks every client to identify itself and blocks generic agents.
 * Overridable so a deployment can put its own contact address in it.
 */
export const DEFAULT_DISCOVERY_USER_AGENT =
  'Akwaan/1.0 (https://playakwaan.com; content engine media discovery)';

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
    // An SVG is only usable through its raster rendition.
    if (originalMimetype === 'image/svg+xml' && !hasRendition) return null;

    const meta = info.extmetadata ?? {};
    const attribution = text(meta.AttributionRequired?.value)?.toLowerCase();
    const title = text(page.title) ?? pageUrl;

    return {
      provider: this.name,
      rank: positive(page.index) ?? Number.MAX_SAFE_INTEGER,
      matchedPhrase: phrase,
      title: title.replace(/^File:/i, ''),
      downloadUrl: hasRendition ? (rendition as string) : originalUrl,
      width: hasRendition ? (renditionWidth as number) : originalWidth,
      height: hasRendition ? (renditionHeight as number) : originalHeight,
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

  private async request(url: URL, outer?: AbortSignal): Promise<unknown> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const forward = () => controller.abort();
    outer?.addEventListener('abort', forward, { once: true });
    if (outer?.aborted) controller.abort();

    try {
      const response = await fetchImpl(url.toString(), {
        headers: {
          accept: 'application/json',
          'user-agent': this.options.userAgent ?? DEFAULT_DISCOVERY_USER_AGENT,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new MediaDiscoveryError(
          'DISCOVERY_HTTP_STATUS',
          `Wikimedia Commons responded ${response.status}`,
          response.status,
        );
      }
      const payload = (await response.json().catch(() => {
        throw new MediaDiscoveryError(
          'DISCOVERY_BAD_RESPONSE',
          'Wikimedia Commons did not return JSON',
        );
      })) as { error?: { code?: unknown; info?: unknown } };
      // MediaWiki reports its own errors with HTTP 200.
      if (payload?.error) {
        throw new MediaDiscoveryError(
          'DISCOVERY_BAD_RESPONSE',
          `Wikimedia Commons API error: ${String(payload.error.code ?? 'unknown')}`,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof MediaDiscoveryError) throw error;
      if (timedOut) {
        throw new MediaDiscoveryError(
          'DISCOVERY_TIMEOUT',
          'Wikimedia Commons did not answer in time',
        );
      }
      throw new MediaDiscoveryError(
        'DISCOVERY_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', forward);
    }
  }
}
