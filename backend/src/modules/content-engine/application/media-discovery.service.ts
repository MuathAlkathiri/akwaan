import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  DiscoveredMedia,
  discoveryLimit,
  discoveryPhrases,
  ENGINE_MEDIA_DISCOVERY_PROVIDERS,
  MEDIA_DISCOVERY_MIN_SHORT_SIDE,
  MediaDiscoveryError,
  MediaDiscoveryProvider,
  MediaDiscoveryQuery,
  MediaDiscoveryReport,
  MediaDiscoveryResult,
} from '../domain/media-discovery';

/**
 * Asks the configured providers for images of a subject.
 *
 * Providers are consulted in the order they are registered, and each phrase is
 * tried only while the result is still short — the common case is one request.
 * A provider that fails is reported and skipped: one source being down must not
 * hide what another found, and must never look like "no images exist".
 *
 * With no provider registered `isAvailable()` is false and `discover` returns
 * nothing; the registration is where discovery is switched on or off.
 */
@Injectable()
export class MediaDiscoveryService {
  private readonly providers: readonly MediaDiscoveryProvider[];

  constructor(
    @Optional()
    @Inject(ENGINE_MEDIA_DISCOVERY_PROVIDERS)
    providers?: readonly MediaDiscoveryProvider[] | null,
  ) {
    this.providers = providers ?? [];
  }

  isAvailable(): boolean {
    return this.providers.length > 0;
  }

  /** Whether a rights-unknown web search is configured as a last resort. */
  hasFallback(): boolean {
    return this.providers.some((provider) => provider.tier === 'fallback');
  }

  providerNames(): string[] {
    return this.providers.map((provider) => provider.name);
  }

  async discover(
    query: MediaDiscoveryQuery,
    options: { signal?: AbortSignal } = {},
  ): Promise<MediaDiscoveryResult> {
    const phrases = discoveryPhrases(query);
    if (phrases.length === 0) {
      throw new MediaDiscoveryError(
        'DISCOVERY_INVALID_QUERY',
        'subject is required',
      );
    }
    const limit = discoveryLimit(query.limit);
    const minShortSide = query.minShortSide ?? MEDIA_DISCOVERY_MIN_SHORT_SIDE;

    const candidates: DiscoveredMedia[] = [];
    const seen = new Set<string>();
    const reports: MediaDiscoveryReport[] = [];

    const tier = query.tier ?? 'primary';
    for (const provider of this.providers) {
      if ((provider.tier ?? 'primary') !== tier) continue;
      for (const phrase of phrases) {
        if (candidates.length >= limit) break;
        let found: DiscoveredMedia[];
        try {
          found = await provider.search(phrase, {
            // Ask for more than is needed: some results are too small or are
            // the same file found again under another phrase.
            limit: Math.min(limit * 2, 50),
            ...(query.kind ? { kind: query.kind } : {}),
            signal: options.signal,
          });
        } catch (error) {
          const known = error instanceof MediaDiscoveryError;
          reports.push({
            provider: provider.name,
            phrase,
            status: 'failed',
            returned: 0,
            code: known ? error.code : 'DISCOVERY_FAILED',
            detail: error instanceof Error ? error.message : String(error),
          });
          // The provider is unwell; another phrase will not fix that.
          break;
        }
        reports.push({
          provider: provider.name,
          phrase,
          status: 'ok',
          returned: found.length,
        });
        for (const media of found) {
          if (candidates.length >= limit) break;
          if (Math.min(media.width, media.height) < minShortSide) continue;
          if (seen.has(media.originalUrl)) continue;
          seen.add(media.originalUrl);
          candidates.push(media);
        }
      }
      if (candidates.length >= limit) break;
    }

    return { candidates, reports };
  }
}
