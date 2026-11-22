/**
 * Finding a real image for a subject (roadmap §30.22, "retrieve" acquisition).
 *
 * Discovery answers one question — *which existing images could show this
 * subject?* — and nothing else. It downloads nothing, stores nothing and
 * decides nothing: a discovered image is a suggestion a human picks from, and
 * the pick then goes through `EngineImageIngestionService`, which is the only
 * thing that fetches bytes and the only thing that writes them.
 *
 * Discovery is never evidence of rights. A provider reports the licence a page
 * *claims*; every ingested asset still starts `UNKNOWN` in the rights record
 * and is cleared or acknowledged there, by a person.
 */

export const MEDIA_DISCOVERY_DEFAULT_LIMIT = 6;
export const MEDIA_DISCOVERY_MAX_LIMIT = 20;
/** Shorter side, in pixels, below which an image is not worth showing on a TV. */
export const MEDIA_DISCOVERY_MIN_SHORT_SIDE = 400;

export interface MediaDiscoveryQuery {
  /**
   * What must be in the picture, as a search phrase. Use the name the subject
   * is catalogued under — for most providers that is its Latin-script name.
   */
  subject: string;
  /** Other phrases, tried in order only while results are still short. */
  alternatives?: string[];
  limit?: number;
  minShortSide?: number;
}

export interface DiscoveredMediaLicence {
  /** As the provider states it, e.g. "CC BY-SA 4.0". Never normalised. */
  name: string | null;
  url: string | null;
  attributionRequired: boolean | null;
}

export interface DiscoveredMedia {
  provider: string;
  /** Position in the provider's own ordering for the phrase, from 0. */
  rank: number;
  /** The phrase that found it. */
  matchedPhrase: string;
  title: string;
  /**
   * What to download: a rendition sized for use where the provider offers one,
   * so a 40 MB original never has to be fetched to be refused.
   */
  downloadUrl: string;
  /** Dimensions of `downloadUrl`. */
  width: number;
  height: number;
  /** The full-size file and its page, for provenance and for a human to open. */
  originalUrl: string;
  pageUrl: string;
  originalMimetype: string;
  licence: DiscoveredMediaLicence;
  /** Plain text; provider markup is stripped. */
  author: string | null;
  credit: string | null;
}

export type MediaDiscoveryErrorCode =
  | 'DISCOVERY_INVALID_QUERY'
  | 'DISCOVERY_TIMEOUT'
  | 'DISCOVERY_HTTP_STATUS'
  | 'DISCOVERY_BAD_RESPONSE'
  | 'DISCOVERY_FAILED';

export class MediaDiscoveryError extends Error {
  constructor(
    readonly code: MediaDiscoveryErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(`${code}: ${message}`);
    this.name = 'MediaDiscoveryError';
  }
}

export interface MediaDiscoverySearchOptions {
  limit: number;
  signal?: AbortSignal;
}

/** One place images can be found. Stateless; safe to call concurrently. */
export interface MediaDiscoveryProvider {
  readonly name: string;
  search(
    phrase: string,
    options: MediaDiscoverySearchOptions,
  ): Promise<DiscoveredMedia[]>;
}

export const ENGINE_MEDIA_DISCOVERY_PROVIDERS = Symbol(
  'ENGINE_MEDIA_DISCOVERY_PROVIDERS',
);

export interface MediaDiscoveryReport {
  provider: string;
  phrase: string;
  status: 'ok' | 'failed';
  /** Results the provider returned, before size filtering and de-duplication. */
  returned: number;
  code?: MediaDiscoveryErrorCode;
  detail?: string;
}

export interface MediaDiscoveryResult {
  candidates: DiscoveredMedia[];
  /** One entry per provider call actually made, in order. */
  reports: MediaDiscoveryReport[];
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#039;': "'",
  '&nbsp;': ' ',
};

/**
 * Provider metadata arrives as HTML fragments (a linked author name, a credit
 * line with markup). Stored provenance is plain text.
 */
export function plainText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|nbsp|#0?39);/g, (entity) => ENTITIES[entity])
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

/**
 * The provenance line kept beside an ingested asset. Names what the page
 * claimed and where — enough for a person to check it, not a rights decision.
 */
export function licenceNoteOf(media: DiscoveredMedia): string {
  const parts = [
    media.licence.name ?? 'licence not stated',
    media.author ? `by ${media.author}` : null,
    `via ${media.provider}`,
    media.pageUrl,
  ].filter((part): part is string => Boolean(part));
  return parts.join(' — ');
}

/** Normalised, de-duplicated search phrases, subject first. */
export function discoveryPhrases(query: MediaDiscoveryQuery): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const raw of [query.subject, ...(query.alternatives ?? [])]) {
    if (typeof raw !== 'string') continue;
    const phrase = raw.replace(/\s+/g, ' ').trim();
    const key = phrase.toLowerCase();
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    phrases.push(phrase);
  }
  return phrases;
}

export function discoveryLimit(limit: number | undefined): number {
  if (limit === undefined) return MEDIA_DISCOVERY_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new MediaDiscoveryError(
      'DISCOVERY_INVALID_QUERY',
      'limit must be a positive integer',
    );
  }
  return Math.min(limit, MEDIA_DISCOVERY_MAX_LIMIT);
}
