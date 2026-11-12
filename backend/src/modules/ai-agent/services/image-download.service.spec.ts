import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import {
  ImageFetchResponse,
  ImageFetchTransport,
} from '../../../infrastructure/media/guarded-image.transport';
import {
  JPEG_BASELINE_3X2,
  PNG_3X2,
} from '../../../infrastructure/media/testing/image-fixtures';
import { ImageInspectionError } from '../../../infrastructure/media/image-bytes.inspector';
import { RemoteDestinationError } from '../../../infrastructure/media/remote-image-destination.guard';
import { ImageDownloadService } from '../infrastructure/assets/image-download.service';

type Scripted = {
  status?: number;
  headers?: Record<string, string>;
  chunks?: Buffer[];
  hang?: boolean;
};

class ScriptedTransport implements ImageFetchTransport {
  readonly requested: string[] = [];
  readonly consumed: Record<string, number> = {};
  readonly aborted: Record<string, boolean> = {};

  constructor(private readonly script: Record<string, Scripted>) {}

  async get(
    url: URL,
    options: { signal: AbortSignal },
  ): Promise<ImageFetchResponse> {
    const key = url.toString();
    this.requested.push(key);
    const entry = this.script[key];
    if (!entry) throw new Error(`unscripted request ${key}`);
    if (entry.hang) {
      await new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        ),
      );
    }
    const chunks = entry.chunks ?? [];
    const { consumed, aborted } = this;
    consumed[key] = 0;
    return {
      status: entry.status ?? 200,
      headers: entry.headers ?? {},
      abort: () => {
        aborted[key] = true;
      },
      body: (async function* () {
        for (const chunk of chunks) {
          if (aborted[key]) return;
          consumed[key] += 1;
          yield chunk;
        }
      })(),
    };
  }
}

const service = (script: Record<string, Scripted>) => {
  const transport = new ScriptedTransport(script);
  return {
    transport,
    downloader: new ImageDownloadService(new ConfigService({}), transport),
  };
};

const IMG = 'https://img.example.com/a.png';
const png = (extra: Partial<Scripted> = {}): Scripted => ({
  headers: { 'content-type': 'image/png' },
  chunks: [PNG_3X2],
  ...extra,
});

describe('ImageDownloadService.fetchImage', () => {
  it('returns verified bytes and retrieval evidence', async () => {
    const { downloader } = service({ [IMG]: png() });
    const result = await downloader.fetchImage(IMG, { maxBytes: 1024 });
    expect(result).toMatchObject({
      requestedUrl: IMG,
      finalUrl: IMG,
      redirects: [],
      contentType: 'image/png',
      image: { format: 'png', width: 3, height: 2 },
    });
    expect(result.bytes.equals(PNG_3X2)).toBe(true);
  });

  it('refuses a private destination before any request', async () => {
    const { downloader, transport } = service({});
    await expect(
      downloader.fetchImage('https://169.254.169.254/latest', {
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: 'DESTINATION_NOT_ALLOWED' });
    expect(transport.requested).toEqual([]);
  });

  it('follows a relative redirect and records it', async () => {
    const next = 'https://img.example.com/b.png';
    const { downloader } = service({
      [IMG]: { status: 302, headers: { location: '/b.png' } },
      [next]: png(),
    });
    const result = await downloader.fetchImage(IMG, { maxBytes: 1024 });
    expect(result.finalUrl).toBe(next);
    expect(result.redirects).toEqual([next]);
  });

  it.each([
    ['a private address', 'https://10.0.0.1/a.png', 'DESTINATION_NOT_ALLOWED'],
    [
      'cloud metadata',
      'http://169.254.169.254/latest/meta-data/',
      'URL_PROTOCOL_NOT_ALLOWED',
    ],
    [
      'an https-to-http downgrade',
      'http://img.example.com/a.png',
      'URL_PROTOCOL_NOT_ALLOWED',
    ],
    ['localhost', 'https://localhost/a.png', 'DESTINATION_NOT_ALLOWED'],
    [
      'a non-default port',
      'https://img.example.com:8443/a.png',
      'URL_PORT_NOT_ALLOWED',
    ],
  ])('re-validates a redirect to %s', async (_label, location, code) => {
    const { downloader, transport } = service({
      [IMG]: { status: 301, headers: { location } },
    });
    await expect(
      downloader.fetchImage(IMG, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code });
    expect(transport.requested).toEqual([IMG]);
  });

  it('caps the redirect chain', async () => {
    const script: Record<string, Scripted> = {};
    for (let i = 0; i < 5; i += 1) {
      script[`https://img.example.com/${i}`] = {
        status: 302,
        headers: { location: `/${i + 1}` },
      };
    }
    const { downloader, transport } = service(script);
    await expect(
      downloader.fetchImage('https://img.example.com/0', { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REDIRECTS' });
    expect(transport.requested).toHaveLength(4);
  });

  it('refuses a redirect without a Location', async () => {
    const { downloader } = service({ [IMG]: { status: 302 } });
    await expect(
      downloader.fetchImage(IMG, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: 'REDIRECT_LOCATION_MISSING' });
  });

  it('refuses non-2xx responses', async () => {
    const { downloader } = service({ [IMG]: { status: 404 } });
    await expect(
      downloader.fetchImage(IMG, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: 'HTTP_STATUS_NOT_OK' });
  });

  it('refuses a declared oversize body without reading it', async () => {
    const { downloader, transport } = service({
      [IMG]: png({
        headers: { 'content-type': 'image/png', 'content-length': '2048' },
      }),
    });
    await expect(
      downloader.fetchImage(IMG, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
    expect(transport.consumed[IMG]).toBe(0);
    expect(transport.aborted[IMG]).toBe(true);
  });

  it('stops streaming as soon as the cap is crossed, even with no Content-Length', async () => {
    const chunk = Buffer.alloc(400, 7);
    const { downloader, transport } = service({
      [IMG]: png({
        chunks: [chunk, chunk, chunk, chunk, chunk, chunk, chunk, chunk],
      }),
    });
    await expect(
      downloader.fetchImage(IMG, { maxBytes: 1000 }),
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
    expect(transport.consumed[IMG]).toBe(3);
    expect(transport.aborted[IMG]).toBe(true);
  });

  it.each([
    ['text/html', 'MIME_NOT_ALLOWED'],
    ['image/svg+xml', 'MIME_NOT_ALLOWED'],
    ['image/gif', 'MIME_NOT_ALLOWED'],
  ])('refuses Content-Type %s', async (type, code) => {
    const { downloader } = service({
      [IMG]: png({ headers: { 'content-type': type } }),
    });
    await expect(
      downloader.fetchImage(IMG, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code });
  });

  it('refuses bytes that do not match the declared type', async () => {
    const { downloader } = service({
      [IMG]: png({ chunks: [JPEG_BASELINE_3X2] }),
    });
    await expect(
      downloader.fetchImage(IMG, { maxBytes: 4096 }),
    ).rejects.toMatchObject({ code: 'MIME_MISMATCH' });
  });

  it('trusts the bytes when no Content-Type is sent', async () => {
    const { downloader } = service({ [IMG]: { chunks: [PNG_3X2] } });
    const result = await downloader.fetchImage(IMG, { maxBytes: 1024 });
    expect(result.image.format).toBe('png');
  });

  it('refuses invalid and truncated image bytes', async () => {
    const html = service({
      [IMG]: png({ chunks: [Buffer.from('<html>not an image</html>')] }),
    });
    await expect(
      html.downloader.fetchImage(IMG, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: 'IMAGE_FORMAT_UNSUPPORTED' });

    const cut = service({ [IMG]: png({ chunks: [PNG_3X2.subarray(0, 50)] }) });
    await expect(
      cut.downloader.fetchImage(IMG, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: 'IMAGE_TRUNCATED' });
  });

  it('times out a stalled request', async () => {
    const { downloader } = service({ [IMG]: { hang: true } });
    await expect(
      downloader.fetchImage(IMG, { maxBytes: 1024, timeoutMs: 20 }),
    ).rejects.toMatchObject({ code: 'FETCH_TIMEOUT' });
  });
});

describe('ImageDownloadService.download (legacy Wikimedia/Jikan contract)', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'akwaan-legacy-dl-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const legacy = (script: Record<string, Scripted>) => {
    const transport = new ScriptedTransport(script);
    return {
      transport,
      downloader: new ImageDownloadService(
        new ConfigService({ UPLOADS_DIR: root }),
        transport,
      ),
    };
  };
  const stored = async () =>
    fs
      .readdir(path.join(root, 'question-assets', 'images'))
      .catch(() => [] as string[]);
  const JPG = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Goku.jpg';
  const jpeg = (extra: Partial<Scripted> = {}): Scripted => ({
    headers: { 'content-type': 'image/jpeg' },
    chunks: [JPEG_BASELINE_3X2],
    ...extra,
  });

  it('keeps the stored name, location and return shape', async () => {
    const { downloader } = legacy({ [JPG]: jpeg() });
    const result = await downloader.download(JPG, 'Son Gokū (Super Saiyan)!');
    expect(result.localPath).toMatch(
      /^question-assets\/images\/Son-Goku-Super-Saiyan-[0-9a-f-]{36}\.jpg$/,
    );
    expect(result.url).toBe(`/uploads/${result.localPath}`);
    const written = await fs.readFile(path.join(root, result.localPath));
    expect(written.equals(JPEG_BASELINE_3X2)).toBe(true);
  });

  it('still accepts public http sources and follows a CDN redirect', async () => {
    const http = 'http://cdn.example.com/a.png';
    const hop = 'https://cdn2.example.com/a.png';
    const { downloader } = legacy({
      [http]: { status: 302, headers: { location: hop } },
      [hop]: png(),
    });
    const result = await downloader.download(http, 'a');
    expect(result.url).toMatch(/\.png$/);
  });

  it('keeps the header-derived extension when bytes disagree, as before', async () => {
    const { downloader } = legacy({
      [JPG]: jpeg({ headers: { 'content-type': 'image/png' } }),
    });
    expect((await downloader.download(JPG, 'x')).url).toMatch(/\.png$/);
  });

  it.each([['ftp://example.com/a.jpg', 'Unsupported image URL protocol']])(
    'keeps the legacy protocol message for %s',
    async (url, message) => {
      const { downloader } = legacy({});
      await expect(downloader.download(url, 'x')).rejects.toThrow(message);
    },
  );

  it.each([
    ['a loopback literal', 'http://127.0.0.1/a.jpg'],
    ['the metadata endpoint', 'http://169.254.169.254/latest/meta-data/'],
    ['localhost', 'https://localhost/a.jpg'],
    ['a private literal', 'https://10.0.0.8/a.jpg'],
    ['a non-default port', 'https://upload.wikimedia.org:8443/a.jpg'],
  ])('can no longer reach %s', async (_label, url) => {
    const { downloader, transport } = legacy({});
    await expect(downloader.download(url, 'x')).rejects.toBeInstanceOf(
      RemoteDestinationError,
    );
    expect(transport.requested).toEqual([]);
    expect(await stored()).toEqual([]);
  });

  it('re-validates provider redirects into private space', async () => {
    const { downloader, transport } = legacy({
      [JPG]: { status: 302, headers: { location: 'http://169.254.169.254/' } },
    });
    await expect(downloader.download(JPG, 'x')).rejects.toMatchObject({
      code: 'DESTINATION_NOT_ALLOWED',
    });
    expect(transport.requested).toEqual([JPG]);
    expect(await stored()).toEqual([]);
  });

  it('keeps the legacy HTTP, MIME and empty-body messages', async () => {
    await expect(
      legacy({ [JPG]: { status: 404 } }).downloader.download(JPG, 'x'),
    ).rejects.toThrow('Image download returned HTTP 404');
    await expect(
      legacy({
        [JPG]: jpeg({
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      }).downloader.download(JPG, 'x'),
    ).rejects.toThrow('Unsupported image MIME type: text/html');
    await expect(
      legacy({ [JPG]: jpeg({ headers: {} }) }).downloader.download(JPG, 'x'),
    ).rejects.toThrow('Unsupported image MIME type: missing');
    await expect(
      legacy({ [JPG]: jpeg({ chunks: [] }) }).downloader.download(JPG, 'x'),
    ).rejects.toThrow('Downloaded image is empty');
    expect(await stored()).toEqual([]);
  });

  it('keeps the 10 MB message, now enforced while streaming', async () => {
    const declared = legacy({
      [JPG]: jpeg({
        headers: {
          'content-type': 'image/jpeg',
          'content-length': String(11 * 1024 * 1024),
        },
      }),
    });
    await expect(declared.downloader.download(JPG, 'x')).rejects.toThrow(
      'Image exceeds 10 MB limit',
    );
    expect(declared.transport.consumed[JPG]).toBe(0);

    const megabyte = Buffer.alloc(1024 * 1024, 1);
    const streamed = legacy({
      [JPG]: jpeg({ chunks: Array.from({ length: 14 }, () => megabyte) }),
    });
    await expect(streamed.downloader.download(JPG, 'x')).rejects.toThrow(
      'Image exceeds 10 MB limit',
    );
    expect(streamed.transport.consumed[JPG]).toBe(11);
    expect(await stored()).toEqual([]);
  });

  it('no longer saves bytes that are not a complete image', async () => {
    for (const chunks of [
      [Buffer.from('<html>Error 503</html>')],
      [JPEG_BASELINE_3X2.subarray(0, 300)],
    ]) {
      await expect(
        legacy({ [JPG]: jpeg({ chunks }) }).downloader.download(JPG, 'x'),
      ).rejects.toBeInstanceOf(ImageInspectionError);
    }
    expect(await stored()).toEqual([]);
  });
});
