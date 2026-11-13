import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  getConnectionToken,
  getModelToken,
  MongooseModule,
} from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises';
import { Connection, Model, Types } from 'mongoose';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { LocalImageStorageService } from '../../src/common/uploads/local-image-storage.service';
import {
  MEDIA_OBJECT_STORAGE,
  MediaObjectStorage,
} from '../../src/common/uploads/media-object-storage';
import {
  ImageFetchResponse,
  ImageFetchTransport,
} from '../../src/infrastructure/media/guarded-image.transport';
import {
  JPEG_BASELINE_3X2,
  PNG_3X2,
} from '../../src/infrastructure/media/testing/image-fixtures';
import { ImageDownloadService } from '../../src/modules/ai-agent/infrastructure/assets/image-download.service';
import { ContentEngineReviewService } from '../../src/modules/content-engine/application/content-engine-review.service';
import { ContentEngineModule } from '../../src/modules/content-engine/content-engine.module';
import {
  acknowledgeMediaRights,
  CandidateMediaSlot,
  recordMediaReview,
} from '../../src/modules/content-engine/domain/candidate-media-plan';
import { ENGINE_AI_PROVIDER } from '../../src/modules/content-engine/domain/content-engine.constants';
import { EngineImageIngestionService } from '../../src/modules/content-engine/infrastructure/engine-image-ingestion.service';
import { EngineCandidateDocument } from '../../src/modules/content-engine/schemas/engine-candidate.schema';
import { EngineJobDocument } from '../../src/modules/content-engine/schemas/engine-job.schema';
import { isolatedTestDatabaseUri } from '../helpers/test-database';

/**
 * §30.22 Phase 2 against the real ContentEngineModule and an isolated `_test`
 * MongoDB. Only the two external edges are replaced: the R2 mirror
 * (`MEDIA_OBJECT_STORAGE`) records puts in memory, and the HTTP transport
 * serves local fixtures. Files go to a temporary UPLOADS_DIR.
 */

class FixtureTransport implements ImageFetchTransport {
  readonly requested: string[] = [];
  constructor(
    private readonly bodies: Record<string, { type: string; bytes: Buffer }>,
  ) {}
  async get(url: URL): Promise<ImageFetchResponse> {
    this.requested.push(url.toString());
    const entry = this.bodies[url.toString()];
    const empty = (async function* () {})();
    if (!entry) {
      return { status: 404, headers: {}, body: empty, abort: () => undefined };
    }
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

class RecordingMirror implements MediaObjectStorage {
  enabled = true;
  readonly puts: string[] = [];
  readonly removes: string[] = [];
  failNextPut = false;
  async put(key: string): Promise<void> {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error('R2 503 Service Unavailable');
    }
    this.puts.push(key);
  }
  async remove(key: string): Promise<void> {
    this.removes.push(key);
  }
  publicUrl(): undefined {
    return undefined;
  }
}

const URL_A = 'https://upload.wikimedia.org/a.png';
const URL_B = 'https://cdn.example.com/b.png';
const URL_JPEG = 'https://upload.wikimedia.org/c.jpg';

async function buildModule(input: {
  suite: string;
  uploadsDir: string;
  enrichment: boolean;
  transport: FixtureTransport;
  mirror: RecordingMirror;
}): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            ENGINE_AUTHORING_ROOT: resolve(__dirname, '../../..'),
            UPLOADS_DIR: input.uploadsDir,
            ...(input.enrichment
              ? {
                  CONTENT_ENGINE_ENABLED: 'true',
                  ENGINE_MEDIA_ENRICHMENT_ENABLED: 'true',
                }
              : {}),
          }),
        ],
      }),
      MongooseModule.forRoot(isolatedTestDatabaseUri(input.suite)),
      ContentEngineModule,
    ],
  })
    .overrideProvider(ENGINE_AI_PROVIDER)
    .useValue(null)
    .overrideProvider(MEDIA_OBJECT_STORAGE)
    .useValue(input.mirror)
    .overrideProvider(ImageDownloadService)
    .useFactory({
      factory: (config: ConfigService) =>
        new ImageDownloadService(config, input.transport),
      inject: [ConfigService],
    })
    .compile();
}

describe('Content Engine media ingestion with MongoDB (§30.22 Phase 2)', () => {
  let uploadsDir: string;
  let moduleRef: TestingModule;
  let db: Connection;
  let ingestion: EngineImageIngestionService;
  let storage: LocalImageStorageService;
  let review: ContentEngineReviewService;
  let candidates: Model<EngineCandidateDocument>;
  let jobs: Model<EngineJobDocument>;
  const mirror = new RecordingMirror();
  const transport = new FixtureTransport({
    [URL_A]: { type: 'image/png', bytes: PNG_3X2 },
    [URL_B]: { type: 'image/png', bytes: PNG_3X2 },
    [URL_JPEG]: { type: 'image/jpeg', bytes: JPEG_BASELINE_3X2 },
  });
  const engineDir = () => join(uploadsDir, 'world-content', 'content-items');

  const collectionCounts = async () => {
    const counts: Record<string, number> = {};
    for (const { name } of await db.db!.listCollections().toArray()) {
      counts[name] = await db.collection(name).countDocuments();
    }
    return counts;
  };

  beforeAll(async () => {
    uploadsDir = await mkdtemp(join(tmpdir(), 'akwaan-media-it-'));
    moduleRef = await buildModule({
      suite: 'media-ingestion',
      uploadsDir,
      enrichment: true,
      transport,
      mirror,
    });
    db = moduleRef.get(getConnectionToken());
    await Promise.all(db.modelNames().map((name) => db.model(name).init()));
    ingestion = moduleRef.get(EngineImageIngestionService);
    storage = moduleRef.get(LocalImageStorageService);
    review = moduleRef.get(ContentEngineReviewService);
    candidates = moduleRef.get(getModelToken(EngineCandidateDocument.name));
    jobs = moduleRef.get(getModelToken(EngineJobDocument.name));
  });

  afterAll(async () => {
    await db?.dropDatabase();
    await moduleRef?.close();
    await rm(uploadsDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    for (const { name } of await db.db!.listCollections().toArray()) {
      await db.collection(name).deleteMany({});
    }
    await rm(engineDir(), { recursive: true, force: true });
    mirror.puts.length = 0;
    mirror.removes.length = 0;
    mirror.failNextPut = false;
  });

  it('resolves a verified, mirrored, content-addressed asset without writing to MongoDB', async () => {
    const before = await collectionCounts();
    const result = await ingestion.ingestRemote({
      url: URL_A,
      provenance: { provider: 'wikimedia' },
    });
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    const key = `world-content/content-items/engine-${result.asset.sha256}.png`;
    expect(result.asset.url).toBe(`/uploads/${key}`);
    expect(mirror.puts).toEqual([key]);
    expect(await readdir(engineDir())).toEqual([
      `engine-${result.asset.sha256}.png`,
    ]);
    expect(await collectionCounts()).toEqual(before);
  });

  it('never resolves when the R2 write fails, and the retry is idempotent', async () => {
    mirror.failNextPut = true;
    const failed = await ingestion.ingestRemote({
      url: URL_A,
      provenance: { provider: 'wikimedia' },
    });
    expect(failed).toMatchObject({
      status: 'failed',
      failureReason: 'STORAGE_MIRROR_WRITE_FAILED',
    });
    expect(mirror.puts).toEqual([]);

    const retried = await ingestion.ingestRemote({
      url: URL_A,
      provenance: { provider: 'wikimedia' },
    });
    const again = await ingestion.ingestRemote({
      url: URL_A,
      provenance: { provider: 'wikimedia' },
    });
    expect(retried.status).toBe('resolved');
    expect(again.status).toBe('resolved');
    if (retried.status !== 'resolved' || again.status !== 'resolved') return;
    expect(again.asset.url).toBe(retried.asset.url);
    expect(new Set(mirror.puts)).toEqual(
      new Set([retried.asset.url.replace(/^\/uploads\//, '')]),
    );
    expect(await readdir(engineDir())).toHaveLength(1);
  });

  it('stores identical content from different sources once, and different content separately', async () => {
    const a = await ingestion.ingestRemote({
      url: URL_A,
      provenance: { provider: 'p' },
    });
    const b = await ingestion.ingestRemote({
      url: URL_B,
      provenance: { provider: 'p' },
    });
    const c = await ingestion.ingestRemote({
      url: URL_JPEG,
      provenance: { provider: 'p' },
    });
    if (
      a.status !== 'resolved' ||
      b.status !== 'resolved' ||
      c.status !== 'resolved'
    ) {
      throw new Error('expected all resolved');
    }
    expect(b.asset.url).toBe(a.asset.url);
    expect(b.provenance.sourceUrl).toBe(URL_B);
    expect(c.asset.url).not.toBe(a.asset.url);
    expect((await readdir(engineDir())).sort()).toHaveLength(2);
  });

  it('round-trips an ingested slot through MongoDB into the unchanged Phase 1 gate and rights policy', async () => {
    const ingested = await ingestion.ingestRemote({
      url: URL_A,
      provenance: { provider: 'wikimedia' },
    });
    if (ingested.status !== 'resolved') throw new Error('expected resolved');

    const job = await jobs.create({
      requestHash: `media-it-${new Types.ObjectId()}`,
      mechanicKey: 'ekshifni',
      worldKey: 'celebrities',
      scopeKey: 'arab-media-stars',
      targetCount: 1,
      status: 'awaiting_review',
    });
    const slot: CandidateMediaSlot = {
      slotKey: 'subject-image',
      purpose: 'gameplay',
      required: true,
      status: 'resolved',
      asset: ingested.asset,
      provenance: ingested.provenance,
      rights: ingested.rights,
      review: null,
    };
    await candidates.create({
      candidateId: 'media-it-1',
      jobId: String(job._id),
      ordinal: 0,
      status: 'awaiting_review',
      contextHash: 'ctx',
      promptVersion: 'test',
      provider: 'fake',
      model: 'fake',
      reviewRevision: 4,
      humanAssessment: { factualState: 'SUPPORTED', assessedRevision: 4 },
      draft: {
        prompt: { ar: 'من هذه الشخصية؟' },
        media: { type: 'image', assets: [{ url: ingested.asset.url }] },
      },
      mediaPlan: [slot],
    });

    type Detail = {
      mediaPlan: CandidateMediaSlot[];
      mediaReviewRevision: number;
      reviewRevision: number;
      humanAssessment: unknown;
      reviewEligibility: {
        mediaReadiness: {
          governed: boolean;
          ready: boolean;
          blockers: Array<{ code: string }>;
          warnings: Array<{
            code: string;
            rightsStatus?: string;
            acknowledged?: boolean;
          }>;
        };
      };
    };
    const unreviewed = (await review.detail('media-it-1')) as unknown as Detail;
    // A read presents live rights but never rewrites the stored snapshot.
    const persisted = await candidates
      .findOne({ candidateId: 'media-it-1' })
      .lean();
    expect(
      (persisted?.mediaPlan as Array<{ rights: unknown }>)[0].rights,
    ).toEqual({ status: 'UNKNOWN', source: 'unrecorded' });
    expect(unreviewed.mediaPlan[0].asset?.url).toBe(ingested.asset.url);
    expect(unreviewed.reviewEligibility.mediaReadiness).toMatchObject({
      governed: true,
      ready: false,
      blockers: [
        { code: 'MEDIA_REVIEW_REQUIRED' },
        {
          code: 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
          rightsStatus: 'UNKNOWN',
        },
      ],
      warnings: [],
    });

    const at = new Date('2026-11-11T12:00:00.000Z');
    const actor = { actorId: 'admin-1', actorEmail: 'admin@example.test' };
    const reviewed = recordMediaReview(
      {
        mediaPlan: unreviewed.mediaPlan,
        mediaReviewRevision: unreviewed.mediaReviewRevision,
      },
      {
        ...actor,
        slotKey: 'subject-image',
        expectedMediaReviewRevision: 0,
        status: 'approved',
        at,
      },
    );
    const acknowledged = acknowledgeMediaRights(reviewed, {
      ...actor,
      slotKey: 'subject-image',
      expectedMediaReviewRevision: reviewed.mediaReviewRevision,
      note: 'Licence being confirmed with the agency',
      at,
    });
    await candidates.updateOne(
      { candidateId: 'media-it-1', mediaReviewRevision: { $in: [0, null] } },
      { $set: acknowledged },
    );

    const ready = (await review.detail('media-it-1')) as unknown as Detail;
    expect(ready.mediaReviewRevision).toBe(2);
    expect(ready.reviewRevision).toBe(4);
    expect(ready.humanAssessment).toMatchObject({ assessedRevision: 4 });
    // No media-rights record exists, so the stored observation is presented.
    expect(ready.mediaPlan[0].rights).toEqual({
      status: 'UNKNOWN',
      source: 'unrecorded',
    });
    expect(ready.reviewEligibility.mediaReadiness).toMatchObject({
      governed: true,
      ready: true,
      blockers: [],
      warnings: [
        {
          code: 'MEDIA_RIGHTS_NOT_CLEARED',
          rightsStatus: 'UNKNOWN',
          acknowledged: true,
        },
      ],
    });

    // BLOCKED rights remain a hard blocker even with an approved review.
    await candidates.updateOne(
      { candidateId: 'media-it-1' },
      {
        $set: {
          'mediaPlan.0.rights': { status: 'BLOCKED', source: 'media-rights' },
        },
      },
    );
    const blocked = (await review.detail('media-it-1')) as unknown as Detail;
    expect(blocked.reviewEligibility.mediaReadiness.blockers).toEqual([
      expect.objectContaining({ code: 'MEDIA_RIGHTS_BLOCKED' }),
    ]);
  });

  it('leaves legacy candidates ungoverned with an empty plan', async () => {
    const job = await jobs.create({
      requestHash: `media-it-legacy-${new Types.ObjectId()}`,
      mechanicKey: 'read-your-opponent',
      worldKey: 'football',
      scopeKey: 'club-history',
      targetCount: 1,
      status: 'awaiting_review',
    });
    await candidates.create({
      candidateId: 'media-it-legacy',
      jobId: String(job._id),
      ordinal: 0,
      status: 'awaiting_review',
      contextHash: 'ctx',
      promptVersion: 'mc-v2',
      provider: 'fake',
      model: 'fake',
      draft: { prompt: { ar: 'سؤال' } },
    });
    const stored = await candidates
      .findOne({ candidateId: 'media-it-legacy' })
      .lean();
    expect(stored).not.toHaveProperty('mediaPlan');
    expect(stored).not.toHaveProperty('mediaReviewRevision');
    const detail = (await review.detail('media-it-legacy')) as unknown as {
      mediaPlan: unknown[];
      mediaReviewRevision: number;
      reviewEligibility: { mediaReadiness: { governed: boolean } };
    };
    expect(detail.mediaPlan).toEqual([]);
    expect(detail.mediaReviewRevision).toBe(0);
    expect(detail.reviewEligibility.mediaReadiness.governed).toBe(false);
  });

  it('protects only engine content-addressed files from deletion', async () => {
    const ingested = await ingestion.ingestRemote({
      url: URL_A,
      provenance: { provider: 'p' },
    });
    if (ingested.status !== 'resolved') throw new Error('expected resolved');
    const legacyDir = join(uploadsDir, 'world-content', 'content-items');
    const legacyNames = [
      'content-item-1731300000000-abcdef012345.png',
      `photo-${'c'.repeat(64)}.png`,
    ];
    await mkdir(legacyDir, { recursive: true });
    for (const name of legacyNames)
      await writeFile(join(legacyDir, name), PNG_3X2);

    await storage.delete({ path: ingested.asset.url.replace(/^\//, '') });
    for (const name of legacyNames) {
      await storage.delete({
        path: `uploads/world-content/content-items/${name}`,
      });
    }
    expect(await readdir(engineDir())).toEqual([
      `engine-${ingested.asset.sha256}.png`,
    ]);
    expect(mirror.removes.sort()).toEqual(
      legacyNames.map((name) => `world-content/content-items/${name}`).sort(),
    );
  });
});

describe('Content Engine media ingestion with flags off (default)', () => {
  it('fetches nothing, stores nothing and writes nothing', async () => {
    const uploadsDir = await mkdtemp(join(tmpdir(), 'akwaan-media-off-'));
    const mirror = new RecordingMirror();
    const transport = new FixtureTransport({
      [URL_A]: { type: 'image/png', bytes: PNG_3X2 },
    });
    const moduleRef = await buildModule({
      suite: 'media-ingestion-off',
      uploadsDir,
      enrichment: false,
      transport,
      mirror,
    });
    const db = moduleRef.get<Connection>(getConnectionToken());
    try {
      const result = await moduleRef
        .get(EngineImageIngestionService)
        .ingestRemote({ url: URL_A, provenance: { provider: 'p' } });
      expect(result).toMatchObject({
        status: 'failed',
        failureReason: 'MEDIA_ENRICHMENT_DISABLED',
      });
      expect(transport.requested).toEqual([]);
      expect(mirror.puts).toEqual([]);
      expect(await readdir(uploadsDir)).toEqual([]);
      // Index builds may create empty collections; no document may exist.
      for (const { name } of await db.db!.listCollections().toArray()) {
        expect(await db.collection(name).countDocuments()).toBe(0);
      }
    } finally {
      await db.dropDatabase();
      await moduleRef.close();
      await rm(uploadsDir, { recursive: true, force: true });
    }
  });
});
