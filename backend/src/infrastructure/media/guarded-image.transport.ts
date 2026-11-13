import { request as httpRequest, IncomingHttpHeaders } from 'http';
import { request as httpsRequest } from 'https';
import { createGuardedLookup } from './remote-image-destination.guard';

/** Injection token, so tests can drive redirects and streams without a network. */
export const IMAGE_FETCH_TRANSPORT = Symbol('IMAGE_FETCH_TRANSPORT');

export interface ImageFetchResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: AsyncIterable<Buffer>;
  /** Stops the transfer and releases the socket. Safe to call twice. */
  abort(): void;
}

/**
 * One GET, no redirect following: the caller re-validates every hop, so the
 * transport must never follow one on its own.
 */
export interface ImageFetchTransport {
  get(
    url: URL,
    options: { signal: AbortSignal; userAgent: string },
  ): Promise<ImageFetchResponse>;
}

type GuardedLookup = ReturnType<typeof createGuardedLookup>;

/**
 * Node's own http/https with DNS replaced by the guarded lookup.
 *
 * - `agent: false` — no pooled socket can carry a connection that was
 *   validated for a different request;
 * - `Accept-Encoding: identity` — the byte cap applies to what is stored, and
 *   a compressed response cannot expand past it after the check;
 * - redirects are returned, never followed.
 */
export class GuardedNodeImageTransport implements ImageFetchTransport {
  constructor(private readonly lookup: GuardedLookup = createGuardedLookup()) {}

  get(
    url: URL,
    options: { signal: AbortSignal; userAgent: string },
  ): Promise<ImageFetchResponse> {
    const send = url.protocol === 'http:' ? httpRequest : httpsRequest;
    return new Promise((resolve, reject) => {
      const req = send(url, {
        method: 'GET',
        agent: false,
        lookup: this.lookup as never,
        signal: options.signal,
        maxHeaderSize: 16 * 1024,
        headers: {
          'User-Agent': options.userAgent,
          Accept: 'image/jpeg, image/png, image/webp',
          'Accept-Encoding': 'identity',
        },
      });
      req.once('error', reject);
      req.once('response', (res) => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: res,
          abort: () => {
            res.destroy();
            req.destroy();
          },
        });
      });
      req.end();
    });
  }
}
