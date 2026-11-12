import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import {
  GuardedNodeImageTransport,
  IMAGE_FETCH_TRANSPORT,
  ImageFetchResponse,
  type ImageFetchTransport,
} from '../../../../infrastructure/media/guarded-image.transport';
import {
  InspectedImage,
  ImageInspectionLimits,
  inspectImageBytes,
} from '../../../../infrastructure/media/image-bytes.inspector';
import {
  assertAllowedRemoteUrl,
  RemoteDestinationError,
  RemoteUrlPolicy,
} from '../../../../infrastructure/media/remote-image-destination.guard';

/**
 * The legacy path previously followed redirects without limit (fetch's
 * default of 20). Five keeps every CDN hop seen in practice while bounding it.
 */
const LEGACY_MAX_REDIRECTS = 5;

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** Header types accepted for each sniffed format. */
const HEADER_TYPES: Record<InspectedImage['format'], readonly string[]> = {
  jpeg: ['image/jpeg', 'image/jpg', 'image/pjpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type ImageFetchCode =
  | 'HTTP_STATUS_NOT_OK'
  | 'TOO_MANY_REDIRECTS'
  | 'REDIRECT_LOCATION_MISSING'
  | 'RESPONSE_TOO_LARGE'
  | 'FETCH_TIMEOUT'
  | 'FETCH_FAILED'
  | 'MIME_NOT_ALLOWED'
  | 'MIME_MISMATCH';

export class ImageFetchError extends Error {
  constructor(
    readonly code: ImageFetchCode,
    message: string,
    /** The HTTP status, on HTTP_STATUS_NOT_OK. */
    readonly status?: number,
  ) {
    super(`${code}: ${message}`);
    this.name = 'ImageFetchError';
  }
}

export interface FetchImageOptions {
  /** Hard cap, enforced while streaming. */
  maxBytes: number;
  allowHttp?: boolean;
  maxRedirects?: number;
  /** Whole-operation deadline across every hop and the body. */
  timeoutMs?: number;
  limits?: Omit<ImageInspectionLimits, 'maxBytes'>;
}

export interface FetchedRemoteImage {
  bytes: Buffer;
  image: InspectedImage;
  requestedUrl: string;
  finalUrl: string;
  /** Every URL after the first that was requested, in order. */
  redirects: string[];
  contentType: string | null;
}

@Injectable()
export class ImageDownloadService {
  private readonly maxBytes = 10 * 1024 * 1024;
  private readonly timeoutMs = 15_000;
  private readonly transport: ImageFetchTransport;

  constructor(
    private readonly config: ConfigService,
    @Optional()
    @Inject(IMAGE_FETCH_TRANSPORT)
    transport?: ImageFetchTransport,
  ) {
    this.transport = transport ?? new GuardedNodeImageTransport();
  }

  absolutePath(localPath: string) {
    const uploadsRoot =
      this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    return join(uploadsRoot, localPath);
  }

  /**
   * Legacy question-asset download (Wikimedia, Jikan).
   *
   * Its contract is unchanged: http and https sources, the same error messages
   * for the same failures, the header-derived extension, the
   * `<name>-<uuid><ext>` filename under `question-assets/images`, the
   * `{ localPath, url }` result, and a local-only write.
   *
   * What changed is the network path. It now goes through the same guarded
   * transport as `fetchImage`, so a provider result cannot reach a private,
   * loopback or metadata address, every redirect is re-validated, the 10 MB cap
   * stops the transfer while streaming, and bytes that are not a complete
   * JPEG/PNG/WebP are refused instead of being saved as a broken asset.
   */
  async download(sourceUrl: string, nameHint = 'image') {
    const source = new URL(sourceUrl);
    if (!['http:', 'https:'].includes(source.protocol)) {
      throw new Error('Unsupported image URL protocol');
    }
    const policy = { allowHttp: true };
    assertAllowedRemoteUrl(sourceUrl, policy);

    const { bytes, extension } = await this.withDeadline(
      this.timeoutMs,
      async (signal, timedOut) => {
        let opened: Awaited<ReturnType<ImageDownloadService['open']>>;
        try {
          opened = await this.open(sourceUrl, {
            policy,
            maxRedirects: LEGACY_MAX_REDIRECTS,
            signal,
            timedOut,
            userAgent: 'Akwaan/1.0 (question image retrieval)',
          });
        } catch (error) {
          if (
            error instanceof ImageFetchError &&
            error.code === 'HTTP_STATUS_NOT_OK'
          ) {
            throw new Error(`Image download returned HTTP ${error.status}`);
          }
          throw error;
        }
        const { response } = opened;

        const contentType = this.contentTypeOf(response) ?? '';
        const headerExtension = MIME_EXTENSIONS[contentType];
        if (!headerExtension) {
          response.abort();
          throw new Error(
            `Unsupported image MIME type: ${contentType || 'missing'}`,
          );
        }
        const declaredSize = Number(response.headers['content-length']);
        if (declaredSize > this.maxBytes) {
          response.abort();
          throw new Error('Image exceeds 10 MB limit');
        }
        let body: Buffer;
        try {
          body = await this.readCapped(response, this.maxBytes, timedOut);
        } catch (error) {
          if (
            error instanceof ImageFetchError &&
            error.code === 'RESPONSE_TOO_LARGE'
          ) {
            throw new Error('Image exceeds 10 MB limit');
          }
          throw error;
        }
        if (!body.length) throw new Error('Downloaded image is empty');
        // The extension stays header-derived, as before; the bytes only have
        // to be a complete supported image.
        inspectImageBytes(body, { maxBytes: this.maxBytes });
        return { bytes: body, extension: headerExtension };
      },
    );

    const safeName =
      nameHint
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'image';
    const fileName = `${safeName}-${randomUUID()}${extension || extname(source.pathname)}`;
    const uploadsRoot =
      this.config.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');
    const directory = join(uploadsRoot, 'question-assets', 'images');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, fileName), bytes, { flag: 'wx' });

    return {
      localPath: join('question-assets', 'images', fileName),
      url: `/uploads/question-assets/images/${fileName}`,
    };
  }

  /**
   * Fetches an untrusted image URL into memory and proves it is an image.
   * Writes nothing. Every hop is re-validated, the destination address is
   * checked at connect time, and the byte cap stops the transfer as soon as
   * it is crossed rather than after the body is buffered.
   *
   * Throws `RemoteDestinationError`, `ImageFetchError` or
   * `ImageInspectionError`; never returns an unverified image.
   */
  async fetchImage(
    sourceUrl: string,
    options: FetchImageOptions,
  ): Promise<FetchedRemoteImage> {
    // Validate before arming the deadline, so a refused URL leaves no timer.
    assertAllowedRemoteUrl(sourceUrl, options);
    return this.withDeadline(
      options.timeoutMs ?? this.timeoutMs,
      async (signal, timedOut) => {
        const { response, finalUrl, redirects } = await this.open(sourceUrl, {
          policy: options,
          maxRedirects: options.maxRedirects ?? 3,
          signal,
          timedOut,
          userAgent: 'Akwaan/1.0 (content engine image retrieval)',
        });

        const contentType = this.contentTypeOf(response);
        if (
          contentType &&
          !Object.values(HEADER_TYPES).some((types) =>
            types.includes(contentType),
          )
        ) {
          response.abort();
          throw new ImageFetchError(
            'MIME_NOT_ALLOWED',
            `Content-Type ${contentType} is not an allowed image type`,
          );
        }
        const declared = Number(response.headers['content-length']);
        if (Number.isFinite(declared) && declared > options.maxBytes) {
          response.abort();
          throw new ImageFetchError(
            'RESPONSE_TOO_LARGE',
            `declared ${declared} bytes; the limit is ${options.maxBytes}`,
          );
        }

        const bytes = await this.readCapped(
          response,
          options.maxBytes,
          timedOut,
        );
        const image = inspectImageBytes(bytes, {
          ...options.limits,
          maxBytes: options.maxBytes,
        });
        if (contentType && !HEADER_TYPES[image.format].includes(contentType)) {
          throw new ImageFetchError(
            'MIME_MISMATCH',
            `Content-Type ${contentType} does not match ${image.mimetype} bytes`,
          );
        }
        return {
          bytes,
          image,
          requestedUrl: sourceUrl,
          finalUrl,
          redirects,
          contentType,
        };
      },
    );
  }

  /** Runs `work` under one whole-operation deadline, and always disarms it. */
  private async withDeadline<T>(
    timeoutMs: number,
    work: (signal: AbortSignal, timedOut: () => boolean) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      controller.abort();
    }, timeoutMs);
    try {
      return await work(controller.signal, () => expired);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Validates the URL, follows redirects one hop at a time (re-validating
   * each), and returns the first 2xx response with its body unread. The
   * transport resolves DNS through the guarded lookup on every hop.
   */
  private async open(
    sourceUrl: string,
    input: {
      policy: RemoteUrlPolicy;
      maxRedirects: number;
      signal: AbortSignal;
      timedOut: () => boolean;
      userAgent: string;
    },
  ): Promise<{
    response: ImageFetchResponse;
    finalUrl: string;
    redirects: string[];
  }> {
    let url = assertAllowedRemoteUrl(sourceUrl, input.policy);
    const redirects: string[] = [];
    for (let hop = 0; ; hop += 1) {
      const response = await this.send(
        url,
        input.signal,
        input.timedOut,
        input.userAgent,
      );
      if (REDIRECT_STATUSES.has(response.status)) {
        response.abort();
        const location = response.headers.location;
        if (!location) {
          throw new ImageFetchError(
            'REDIRECT_LOCATION_MISSING',
            `HTTP ${response.status} without a Location header`,
          );
        }
        if (hop >= input.maxRedirects) {
          throw new ImageFetchError(
            'TOO_MANY_REDIRECTS',
            `more than ${input.maxRedirects} redirects`,
          );
        }
        let next: string;
        try {
          next = new URL(location, url).toString();
        } catch {
          throw new RemoteDestinationError(
            'URL_INVALID',
            'redirect Location cannot be parsed',
          );
        }
        url = assertAllowedRemoteUrl(next, input.policy);
        redirects.push(url.toString());
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        response.abort();
        throw new ImageFetchError(
          'HTTP_STATUS_NOT_OK',
          `image request returned HTTP ${response.status}`,
          response.status,
        );
      }
      return { response, finalUrl: url.toString(), redirects };
    }
  }

  private async send(
    url: URL,
    signal: AbortSignal,
    timedOut: () => boolean,
    userAgent: string,
  ): Promise<ImageFetchResponse> {
    try {
      return await this.transport.get(url, { signal, userAgent });
    } catch (error) {
      throw this.normalize(error, timedOut);
    }
  }

  private async readCapped(
    response: ImageFetchResponse,
    maxBytes: number,
    timedOut: () => boolean,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > maxBytes) {
          response.abort();
          throw new ImageFetchError(
            'RESPONSE_TOO_LARGE',
            `response exceeded ${maxBytes} bytes while streaming`,
          );
        }
        chunks.push(chunk);
      }
    } catch (error) {
      response.abort();
      throw this.normalize(error, timedOut);
    }
    return Buffer.concat(chunks, total);
  }

  private normalize(error: unknown, timedOut: () => boolean): Error {
    if (
      error instanceof ImageFetchError ||
      error instanceof RemoteDestinationError
    ) {
      return error;
    }
    if (timedOut()) {
      return new ImageFetchError('FETCH_TIMEOUT', 'image request timed out');
    }
    return new ImageFetchError(
      'FETCH_FAILED',
      error instanceof Error ? error.message : String(error),
    );
  }

  private contentTypeOf(response: ImageFetchResponse): string | null {
    const raw = response.headers['content-type'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.split(';')[0].trim().toLowerCase() || null;
  }
}
