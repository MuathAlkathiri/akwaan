import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalImageStorageService } from '../../../common/uploads/local-image-storage.service';
import { MediaObjectStorage } from '../../../common/uploads/media-object-storage';
import {
  ImageFetchResponse,
  ImageFetchTransport,
} from '../../../infrastructure/media/guarded-image.transport';
import {
  GIF_3X2,
  JPEG_BASELINE_3X2,
  PNG_3X2,
} from '../../../infrastructure/media/testing/image-fixtures';
import { ImageDownloadService } from '../../ai-agent/infrastructure/assets/image-download.service';
import {
  ENGINE_IMAGE_MAX_BYTES,
  EngineImageIngestionService,
} from './engine-image-ingestion.service';

const ENABLED = {
  CONTENT_ENGINE_ENABLED: 'true',
  ENGINE_MEDIA_ENRICHMENT_ENABLED: 'true',
};

class MapTransport implements ImageFetchTransport {
  calls = 0;
  constructor(
    private readonly bodies: Record<string, { type: string; bytes: Buffer }>,
  ) {}
  async get(url: URL): Promise<ImageFetchResponse> {
    this.calls += 1;
    const entry = this.bodies[url.toString()];
    if (!entry)
      return {
        status: 404,
        headers: {},
        body: (async function* () {})(),
        abort: () => undefined,
      };
    return {
      status: 200,
      headers: { 'content-type': entry.type },
      body: (async function* () {
        yield entry.bytes;
      })(),
      abort: () => undefined,
    };
  }
}

describe('EngineImageIngestionService', () => {
  let root: string;
  let mirror: jest.Mocked<MediaObjectStorage> & { enabled: boolean };

  const build = (
    env: Record<string, string>,
    bodies: Record<string, { type: string; bytes: Buffer }> = {},
  ) => {
    const config = new ConfigService({ UPLOADS_DIR: root, ...env });
    const transport = new MapTransport(bodies);
    const downloader = new ImageDownloadService(config, transport);
    const storage = new LocalImageStorageService(config, mirror);
    return {
      transport,
      ingestion: new EngineImageIngestionService(config, downloader, storage),
    };
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'akwaan-ingest-'));
    mirror = {
      enabled: true,
      put: jest.fn<Promise<void>, [string, Buffer, string?]>(
        async () => undefined,
      ),
      remove: jest.fn<Promise<void>, [string]>(async () => undefined),
      publicUrl: jest.fn<string | undefined, [string]>(() => undefined),
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('refuses remote retrieval while media enrichment is off (the default)', async () => {
    const { ingestion, transport } = build({});
    await expect(
      ingestion.ingestRemote({
        url: 'https://img.example.com/a.png',
        provenance: { provider: 'wikimedia' },
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'MEDIA_ENRICHMENT_DISABLED',
    });
    expect(transport.calls).toBe(0);
  });

  it('resolves a verified, mirrored, content-addressed asset with provenance and UNKNOWN rights', async () => {
    const url = 'https://img.example.com/a.png';
    const { ingestion } = build(ENABLED, {
      [url]: { type: 'image/png', bytes: PNG_3X2 },
    });
    const result = await ingestion.ingestRemote({
      url,
      provenance: {
        provider: 'wikimedia',
        licenceNote: 'CC BY-SA 4.0 (claimed)',
      },
      now: new Date('2026-11-11T10:00:00.000Z'),
    });
    expect(result).toMatchObject({
      status: 'resolved',
      asset: { mimetype: 'image/png', width: 3, height: 2 },
      provenance: {
        acquisition: 'retrieve',
        provider: 'wikimedia',
        sourceUrl: url,
        requestedUrl: url,
        finalUrl: url,
        redirects: [],
        responseContentType: 'image/png',
        retrievedAt: '2026-11-11T10:00:00.000Z',
        byteSize: PNG_3X2.length,
        licenceNote: 'CC BY-SA 4.0 (claimed)',
      },
      rights: { status: 'UNKNOWN', source: 'unrecorded' },
      storage: { mirrored: true },
    });
    if (result.status !== 'resolved') throw new Error('expected resolved');
    expect(result.asset.url).toBe(
      `/uploads/world-content/content-items/engine-${result.asset.sha256}.png`,
    );
  });

  it('deduplicates identical images from different URLs to one shared asset', async () => {
    const { ingestion } = build(ENABLED, {
      'https://a.example.com/x.png': { type: 'image/png', bytes: PNG_3X2 },
      'https://b.example.com/y.png': { type: 'image/png', bytes: PNG_3X2 },
    });
    const first = await ingestion.ingestRemote({
      url: 'https://a.example.com/x.png',
      provenance: { provider: 'p' },
    });
    const second = await ingestion.ingestRemote({
      url: 'https://b.example.com/y.png',
      provenance: { provider: 'p' },
    });
    expect(first.status === 'resolved' && second.status === 'resolved').toBe(
      true,
    );
    if (first.status !== 'resolved' || second.status !== 'resolved') return;
    expect(second.asset.url).toBe(first.asset.url);
    expect(second.storage.reusedLocalFile).toBe(true);
    expect(second.provenance.sourceUrl).toBe('https://b.example.com/y.png');
    expect(
      await readdir(join(root, 'world-content', 'content-items')),
    ).toHaveLength(1);
  });

  it('fails the slot (never resolves) when the R2 mirror write fails, and the retry resolves the same asset', async () => {
    const url = 'https://img.example.com/a.png';
    const { ingestion } = build(ENABLED, {
      [url]: { type: 'image/png', bytes: PNG_3X2 },
    });
    mirror.put.mockRejectedValueOnce(new Error('R2 unavailable'));
    const failed = await ingestion.ingestRemote({
      url,
      provenance: { provider: 'p' },
    });
    expect(failed).toMatchObject({
      status: 'failed',
      failureReason: 'STORAGE_MIRROR_WRITE_FAILED',
    });
    expect(failed).not.toHaveProperty('asset');

    const retried = await ingestion.ingestRemote({
      url,
      provenance: { provider: 'p' },
    });
    expect(retried.status).toBe('resolved');
  });

  it('fails closed without durable storage unless local-only is explicitly allowed', async () => {
    mirror.enabled = false;
    const blocked = build(ENABLED);
    await expect(
      blocked.ingestion.ingestBytes({
        bytes: PNG_3X2,
        acquisition: 'upload',
        provenance: { provider: 'admin' },
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'STORAGE_NOT_DURABLE',
    });

    const local = build({
      ...ENABLED,
      ENGINE_MEDIA_REQUIRE_OBJECT_STORAGE: 'false',
    });
    await expect(
      local.ingestion.ingestBytes({
        bytes: PNG_3X2,
        acquisition: 'upload',
        provenance: { provider: 'admin' },
      }),
    ).resolves.toMatchObject({
      status: 'resolved',
      storage: { mirrored: false },
    });
  });

  it('enforces the 5 MB engine limit while streaming', async () => {
    const url = 'https://img.example.com/huge.png';
    const huge = Buffer.concat([PNG_3X2, Buffer.alloc(ENGINE_IMAGE_MAX_BYTES)]);
    const { ingestion } = build(ENABLED, {
      [url]: { type: 'image/png', bytes: huge },
    });
    await expect(
      ingestion.ingestRemote({ url, provenance: { provider: 'p' } }),
    ).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'RESPONSE_TOO_LARGE',
    });
    expect(mirror.put).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a private redirect target',
      'https://10.0.0.1/a.png',
      'DESTINATION_NOT_ALLOWED',
    ],
    ['a 404', 'https://img.example.com/missing.png', 'HTTP_STATUS_NOT_OK'],
  ])('maps %s to a failed slot', async (_label, url, reason) => {
    const { ingestion } = build(ENABLED);
    await expect(
      ingestion.ingestRemote({ url, provenance: { provider: 'p' } }),
    ).resolves.toMatchObject({ status: 'failed', failureReason: reason });
  });

  it.each([
    ['GIF', GIF_3X2, 'IMAGE_FORMAT_UNSUPPORTED'],
    ['truncated JPEG', JPEG_BASELINE_3X2.subarray(0, 200), 'IMAGE_TRUNCATED'],
    [
      'an oversized upload',
      Buffer.concat([PNG_3X2, Buffer.alloc(ENGINE_IMAGE_MAX_BYTES)]),
      'IMAGE_TOO_LARGE',
    ],
  ])(
    'refuses %s bytes without storing anything',
    async (_label, bytes, reason) => {
      const { ingestion } = build(ENABLED);
      await expect(
        ingestion.ingestBytes({
          bytes,
          acquisition: 'upload',
          provenance: { provider: 'admin' },
        }),
      ).resolves.toMatchObject({ status: 'failed', failureReason: reason });
      expect(mirror.put).not.toHaveBeenCalled();
    },
  );
});

describe('EngineImageIngestionService dependency wiring', () => {
  it('resolves through Nest with the canonical storage module and no transport override', async () => {
    const { Test } = await import('@nestjs/testing');
    const { ConfigModule } = await import('@nestjs/config');
    const { MediaStorageModule } =
      await import('../../../common/uploads/media-storage.module');
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({})],
        }),
        MediaStorageModule,
      ],
      providers: [
        ImageDownloadService,
        LocalImageStorageService,
        EngineImageIngestionService,
      ],
    }).compile();
    const ingestion = moduleRef.get(EngineImageIngestionService);
    // Defaults hold under real DI: enrichment off, so nothing is fetched.
    await expect(
      ingestion.ingestRemote({
        url: 'https://img.example.com/a.png',
        provenance: { provider: 'p' },
      }),
    ).resolves.toMatchObject({ failureReason: 'MEDIA_ENRICHMENT_DISABLED' });
    await moduleRef.close();
  });
});
