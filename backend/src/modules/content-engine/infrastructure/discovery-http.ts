import { MediaDiscoveryError } from '../domain/media-discovery';

/**
 * Wikimedia asks every client to identify itself and blocks generic agents.
 * Overridable so a deployment can put its own contact address in it.
 */
export const DEFAULT_DISCOVERY_USER_AGENT =
  'Akwaan/1.0 (https://playakwaan.com; content engine media discovery)';
const DEFAULT_TIMEOUT_MS = 10_000;

export interface DiscoveryHttpOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  /** Extra request headers, e.g. a provider's API key. */
  headers?: Record<string, string>;
}

/**
 * One read-only JSON request to a MediaWiki API, with every way it can go
 * wrong turned into a `MediaDiscoveryError`. `source` names the site in the
 * message a reviewer may end up reading.
 */
export async function discoveryJson(
  url: URL,
  source: string,
  options: DiscoveryHttpOptions,
  outer?: AbortSignal,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const forward = () => controller.abort();
  outer?.addEventListener('abort', forward, { once: true });
  if (outer?.aborted) controller.abort();

  try {
    const response = await fetchImpl(url.toString(), {
      headers: {
        accept: 'application/json',
        'user-agent': options.userAgent ?? DEFAULT_DISCOVERY_USER_AGENT,
        ...options.headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new MediaDiscoveryError(
        'DISCOVERY_HTTP_STATUS',
        `${source} responded ${response.status}`,
        response.status,
      );
    }
    const payload = (await response.json().catch(() => {
      throw new MediaDiscoveryError(
        'DISCOVERY_BAD_RESPONSE',
        `${source} did not return JSON`,
      );
    })) as { error?: { code?: unknown; info?: unknown } };
    // MediaWiki reports its own errors with HTTP 200.
    if (payload?.error) {
      throw new MediaDiscoveryError(
        'DISCOVERY_BAD_RESPONSE',
        `${source} API error: ${String(payload.error.code ?? 'unknown')}`,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof MediaDiscoveryError) throw error;
    if (timedOut) {
      throw new MediaDiscoveryError(
        'DISCOVERY_TIMEOUT',
        `${source} did not answer in time`,
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
