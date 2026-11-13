import { INestApplication } from '@nestjs/common';
import { mkdtemp, rm } from 'fs/promises';
import { Connection, Types } from 'mongoose';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import request from 'supertest';
import {
  MEDIA_OBJECT_STORAGE,
  MediaObjectStorage,
} from '../../src/common/uploads/media-object-storage';
import {
  GIF_3X2,
  JPEG_BASELINE_3X2,
  PNG_3X2,
  WEBP_LOSSY_3X2,
} from '../../src/infrastructure/media/testing/image-fixtures';
import { MediaRightsService } from '../../src/modules/media-rights/application/media-rights.service';
import { DeterministicScreenService } from '../../src/modules/content-engine/application/deterministic-screen.service';
import {
  EKSHIFNI_REGION_ROLES,
  EKSHIFNI_SLUG,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { productionMechanicFixture } from '../fixtures/production-mechanic.fixture';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { loginForToken } from '../helpers/auth-helper';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  isolatedTestDatabaseUri,
  resetTestDatabase,
} from '../helpers/test-database';

/**
 * §30.22 Phase 3A — candidate media review over HTTP, against the full app and
 * an isolated `_test` MongoDB. Real World Content, real media-rights records,
 * real ingestion and storage; only the R2 mirror is replaced by an in-memory
 * recorder, and files go to a temporary UPLOADS_DIR.
 */

class RecordingMirror implements MediaObjectStorage {
  enabled = true;
  readonly puts: string[] = [];
  async put(key: string): Promise<void> {
    this.puts.push(key);
  }
  async remove(): Promise<void> {}
  publicUrl(): undefined {
    return undefined;
  }
}

const SUITE = 'media-review';
const WORLD = 'celebrities';
const SCOPE = 'arab-media-stars';
const SLOT = 'subject-image';

describe('Content Engine media review over HTTP (§30.22 Phase 3A)', () => {
  let app: INestApplication;
  let database: Connection;
  let uploadsDir: string;
  let adminToken: string;
  let userToken: string;
  const mirror = new RecordingMirror();

  const http = () => request(app.getHttpServer());
  const asAdmin = <T extends request.Test>(test: T): T =>
    test.set('Authorization', `Bearer ${adminToken}`) as T;
  const base = (candidateId: string) =>
    `/admin/content-engine/candidates/${candidateId}`;

  const ekshifniDraft = () => ({
    prompt: { ar: 'من هذه الشخصية؟' },
    answerPayload: {
      mode: 'match',
      acceptedAnswers: ['شخصية معروفة', 'known figure'],
    },
    mechanicPayload: {
      variant: 'ekshifni',
      regions: EKSHIFNI_REGION_ROLES.map((role, index) => ({
        localId: `region-${index + 1}`,
        role,
        shape: {
          x: (index % 3) * 0.32 + 0.02,
          y: index < 3 ? 0.05 : 0.5,
          width: 0.28,
          height: 0.4,
        },
      })),
    },
  });

  const seedJob = async (mechanicKey: string, scopeKey: string) => {
    const jobId = new Types.ObjectId();
    await database.collection('engine_jobs').insertOne({
      _id: jobId,
      requestHash: `media-review-${jobId}`,
      mechanicKey,
      worldKey: WORLD,
      scopeKey,
      targetCount: 1,
      status: 'awaiting_review',
      leaseEpoch: 1,
      attempts: 1,
      cancellationRequested: false,
      reservedMicros: 0,
      spentMicros: 0,
      pipelineStage: 'awaiting_review',
      stageCheckpoints: {},
    });
    return String(jobId);
  };

  const seedCandidate = async (
    candidateId: string,
    options: { mechanicKey?: string; draft?: Record<string, unknown> } = {},
  ) => {
    const jobId = await seedJob(options.mechanicKey ?? EKSHIFNI_SLUG, SCOPE);
    await database.collection('engine_candidates').insertOne({
      candidateId,
      jobId,
      ordinal: 0,
      status: 'awaiting_review',
      draft: options.draft ?? ekshifniDraft(),
      findings: [],
      contextHash: 'fixture',
      promptVersion: 'fixture',
      provider: 'fake',
      model: 'fake',
      attempt: 1,
      factualClaims: ['claim'],
      reviewRevision: 0,
      reviewStatus: 'pending',
      humanAssessment: {
        factualState: 'SUPPORTED',
        assessedRevision: 0,
        evidence: [{ url: 'https://example.test/source' }],
      },
      reviewEvents: [],
      compatibilityEvaluation: { preDraft: { blockers: [] } },
      publishedContentItemId: null,
      writeEpoch: 1,
    });
  };

  const stored = (candidateId: string) =>
    database.collection('engine_candidates').findOne({ candidateId });

  const attach = (
    candidateId: string,
    expected: number,
    bytes: Buffer,
    name = 'upload.png',
    contentType = 'image/png',
  ) =>
    asAdmin(http().post(`${base(candidateId)}/media/${SLOT}/asset`))
      .field('expectedMediaReviewRevision', String(expected))
      .attach('asset', bytes, { filename: name, contentType });

  const reviewMedia = (
    candidateId: string,
    body: Record<string, unknown>,
    token = adminToken,
  ) =>
    http()
      .post(`${base(candidateId)}/media/${SLOT}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const acknowledge = (candidateId: string, expected: number, note: string) =>
    asAdmin(
      http().post(`${base(candidateId)}/media/${SLOT}/rights-acknowledgement`),
    ).send({ expectedMediaReviewRevision: expected, note });

  const detail = async (candidateId: string) =>
    (await asAdmin(http().get(base(candidateId))).expect(200)).body.data;

  beforeAll(async () => {
    uploadsDir = await mkdtemp(join(tmpdir(), 'akwaan-media-review-'));
    database = await connectTestDatabase(SUITE);
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: {
        MONGODB_URI: isolatedTestDatabaseUri(SUITE),
        UPLOADS_DIR: uploadsDir,
        ENGINE_AUTHORING_ROOT: resolve(__dirname, '../../..'),
      },
      configure: (builder) =>
        builder.overrideProvider(MEDIA_OBJECT_STORAGE).useValue(mirror),
    });
    adminToken = await loginForToken(app, fixtureCredentials.admin);
    userToken = await loginForToken(app, fixtureCredentials.user);

    // Canonical World Content for the candidate's target, through the Admin API.
    await asAdmin(http().post('/admin/challenge-types'))
      .send(
        productionMechanicFixture(EKSHIFNI_SLUG, {
          status: WorldContentStatus.ACTIVE,
        }),
      )
      .expect(201);
    const world = (
      await asAdmin(http().post('/admin/worlds'))
        .send({ name: 'المشاهير', slug: WORLD })
        .expect(201)
    ).body.data as { id: string };
    await asAdmin(http().post(`/admin/worlds/${world.id}/scopes`))
      .send({
        name: 'نجوم الإعلام العربي',
        slug: SCOPE,
        status: WorldContentStatus.ACTIVE,
      })
      .expect(201);
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    if (database) await resetTestDatabase(database);
    await database?.close();
    if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true });
  });

  it('requires an authenticated Admin for every media action', async () => {
    await seedCandidate('auth-1');
    const paths = [
      `${base('auth-1')}/media/${SLOT}/asset`,
      `${base('auth-1')}/media/${SLOT}/review`,
      `${base('auth-1')}/media/${SLOT}/rights-acknowledgement`,
    ];
    for (const path of paths) {
      await http().post(path).send({}).expect(401);
      await http()
        .post(path)
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(403);
    }
    expect((await stored('auth-1'))?.mediaPlan).toBeUndefined();
  });

  it('keeps legacy candidates ungoverned and refuses media actions on them', async () => {
    const legacyDraft = {
      prompt: { ar: 'سؤال' },
      answerPayload: {
        mode: 'multiple_choice',
        options: [
          { id: 'a', label: { ar: 'أ' } },
          { id: 'b', label: { ar: 'ب' } },
        ],
        correctOptionId: 'a',
      },
    };
    await seedCandidate('legacy-1', {
      mechanicKey: 'read-your-opponent',
      draft: legacyDraft,
    });
    const view = await detail('legacy-1');
    expect(view.mediaPlan).toEqual([]);
    expect(view.mediaReviewRevision).toBe(0);
    expect(view.reviewEligibility.mediaReadiness.governed).toBe(false);

    const refused = await reviewMedia('legacy-1', {
      expectedMediaReviewRevision: 0,
      status: 'approved',
    }).expect(400);
    expect(refused.body.code).toBe('MEDIA_SLOT_NOT_REGISTERED');
    const upload = await attach('legacy-1', 0, PNG_3X2).expect(400);
    expect(upload.body.code).toBe('MEDIA_SLOT_NOT_REGISTERED');
    expect((await stored('legacy-1'))?.mediaPlan).toBeUndefined();
  });

  it('reports a missing required slot from the registry and blocks approval', async () => {
    await seedCandidate('missing-1');
    const view = await detail('missing-1');
    expect(view.reviewEligibility.mediaReadiness).toMatchObject({
      governed: true,
      ready: false,
      blockers: [
        expect.objectContaining({
          code: 'MEDIA_REQUIRED_SLOT_MISSING',
          slotKey: SLOT,
        }),
      ],
    });
    expect(view.reviewEligibility.canApprove).toBe(false);
    await asAdmin(http().post(`${base('missing-1')}/approve`))
      .send({ expectedRevision: 0, explanation: 'looks right' })
      .expect(409);
    expect((await stored('missing-1'))?.reviewStatus).toBe('pending');
  });

  describe('one candidate through attach, review, rights and replacement', () => {
    const id = 'flow-1';
    let firstUrl: string;
    const textState = async () => {
      const row = await stored(id);
      return {
        reviewRevision: row?.reviewRevision,
        humanAssessment: row?.humanAssessment,
        reviewEvents: row?.reviewEvents,
        reviewStatus: row?.reviewStatus,
      };
    };
    let textBefore: Awaited<ReturnType<typeof textState>>;

    beforeAll(async () => {
      await seedCandidate(id);
      textBefore = await textState();
    });

    it('refuses bytes that are not a complete image, and non-image uploads', async () => {
      const lying = await attach(
        id,
        0,
        Buffer.from('<html>not an image</html>'),
      ).expect(422);
      expect(lying.body.code).toBe('IMAGE_FORMAT_UNSUPPORTED');
      await attach(id, 0, GIF_3X2, 'x.gif', 'image/gif').expect(400);
      expect((await stored(id))?.mediaPlan).toBeUndefined();
      expect(mirror.puts).toEqual([]);
    });

    it('attaches verified, mirrored, content-addressed media without touching text review', async () => {
      const response = await attach(id, 0, PNG_3X2, 'answer-name.png').expect(
        201,
      );
      const view = response.body.data;
      expect(view.mediaReviewRevision).toBe(1);
      const slot = view.mediaPlan[0];
      firstUrl = slot.asset.url;
      expect(firstUrl).toMatch(
        /^\/uploads\/world-content\/content-items\/engine-[0-9a-f]{64}\.png$/,
      );
      expect(slot).toMatchObject({
        slotKey: SLOT,
        purpose: 'gameplay',
        required: true,
        status: 'resolved',
        review: null,
        rights: { status: 'UNKNOWN', source: 'unrecorded' },
      });
      expect(view.draft.media).toEqual({
        type: 'image',
        assets: [{ url: firstUrl }],
      });
      expect(mirror.puts).toEqual([firstUrl.replace(/^\/uploads\//, '')]);
      expect(JSON.stringify(await stored(id))).not.toContain('answer-name');
      expect(await textState()).toEqual(textBefore);
      expect(view.reviewEligibility.mediaReadiness.blockers).toEqual([
        expect.objectContaining({ code: 'MEDIA_REVIEW_REQUIRED' }),
        expect.objectContaining({
          code: 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
          rightsStatus: 'UNKNOWN',
        }),
      ]);
    });

    it('blocks text approval while the media is unreviewed', async () => {
      const blocked = await asAdmin(http().post(`${base(id)}/approve`))
        .send({ expectedRevision: 0, explanation: 'looks right' })
        .expect(409);
      expect(blocked.body.code).toBe('MEDIA_NOT_READY');
    });

    it('refuses a stale media revision', async () => {
      const stale = await reviewMedia(id, {
        expectedMediaReviewRevision: 0,
        status: 'approved',
      }).expect(409);
      expect(stale.body.code).toBe('MEDIA_REVISION_CONFLICT');
    });

    it('lets exactly one of two concurrent decisions on the same revision win', async () => {
      const results = await Promise.all([
        reviewMedia(id, { expectedMediaReviewRevision: 1, status: 'approved' }),
        reviewMedia(id, { expectedMediaReviewRevision: 1, status: 'approved' }),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      const row = await stored(id);
      expect(row?.mediaReviewRevision).toBe(2);
      expect(
        (row?.mediaEvents as Array<{ action: string }>).filter(
          (event) => event.action === 'media_reviewed',
        ),
      ).toHaveLength(1);
    });

    it('requires an acknowledgment of UNKNOWN rights, which marks the asset without clearing it', async () => {
      let view = await detail(id);
      expect(view.reviewEligibility.mediaReadiness).toMatchObject({
        ready: false,
        blockers: [
          expect.objectContaining({
            code: 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
            rightsStatus: 'UNKNOWN',
          }),
        ],
      });
      expect(view.reviewEligibility.approvalBlockers.join(' ')).toContain(
        'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
      );
      view = (
        await acknowledge(id, 2, 'Press-kit image; agency confirming').expect(
          201,
        )
      ).body.data;
      expect(view.mediaPlan[0].rights.status).toBe('UNKNOWN');
      expect(view.mediaPlan[0].review.status).toBe('approved');
      expect(view.reviewEligibility.mediaReadiness).toMatchObject({
        ready: true,
        blockers: [],
        warnings: [
          expect.objectContaining({
            code: 'MEDIA_RIGHTS_NOT_CLEARED',
            acknowledged: true,
          }),
        ],
      });
      const rights = await app.get(MediaRightsService).statusFor(firstUrl);
      expect(rights.assetRights).toBe('UNKNOWN');
      expect(await textState()).toEqual(textBefore);
    });

    it('turns a later BLOCKED rights record into a hard blocker, read live', async () => {
      await app.get(MediaRightsService).record(firstUrl, {
        assetRights: { status: 'BLOCKED' } as never,
      });
      const view = await detail(id);
      expect(view.reviewEligibility.mediaReadiness.blockers).toEqual([
        expect.objectContaining({ code: 'MEDIA_RIGHTS_BLOCKED' }),
      ]);
      const ack = await acknowledge(id, 3, 'try anyway').expect(409);
      expect(ack.body.code).toBe('MEDIA_RIGHTS_BLOCKED');
      const approve = await asAdmin(http().post(`${base(id)}/approve`))
        .send({ expectedRevision: 0, explanation: 'looks right' })
        .expect(409);
      expect(approve.body.code).toBe('MEDIA_NOT_READY');
    });

    it('refuses to change gameplay media through a text edit', async () => {
      const current = await stored(id);
      const edited = await asAdmin(http().patch(base(id)))
        .send({
          expectedRevision: 0,
          explanation: 'swap the picture',
          factualClaims: ['claim'],
          draft: {
            ...(current?.draft as Record<string, unknown>),
            media: {
              type: 'image',
              assets: [{ url: 'https://evil.example.com/other.png' }],
            },
          },
        })
        .expect(400);
      expect(edited.body.code).toBe('MEDIA_FIELD_REQUIRES_MEDIA_ACTION');
      expect(await textState()).toEqual(textBefore);
    });

    it('replacing the asset withdraws its approval and acknowledgment', async () => {
      const view = (
        await attach(id, 3, JPEG_BASELINE_3X2, 'b.jpg', 'image/jpeg').expect(
          201,
        )
      ).body.data;
      const slot = view.mediaPlan[0];
      expect(slot.asset.url).not.toBe(firstUrl);
      expect(slot.asset.url).toMatch(/\.jpg$/);
      expect(slot.review).toBeNull();
      expect(slot.rightsAcknowledgement).toBeNull();
      expect(view.draft.media.assets[0].url).toBe(slot.asset.url);
      expect(view.reviewEligibility.mediaReadiness).toMatchObject({
        ready: false,
        // The replacement also withdrew the acknowledgment: it is required again.
        blockers: [
          expect.objectContaining({ code: 'MEDIA_REVIEW_REQUIRED' }),
          expect.objectContaining({
            code: 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
          }),
        ],
      });
      const attachedEvents = (
        view.mediaEvents as Array<{
          action: string;
          details: { superseded?: unknown };
        }>
      ).filter((event) => event.action === 'media_attached');
      expect(attachedEvents.at(-1)?.details.superseded).toEqual({
        assetUrl: firstUrl,
        reviewStatus: 'approved',
        rightsAcknowledged: true,
      });
      expect(await textState()).toEqual(textBefore);
    });

    it('refuses an unregistered slot key', async () => {
      const response = await asAdmin(
        http().post(`${base(id)}/media/hero-image/review`),
      )
        .send({ expectedMediaReviewRevision: 4, status: 'approved' })
        .expect(400);
      expect(response.body.code).toBe('MEDIA_SLOT_NOT_REGISTERED');
    });

    it('locks media once the candidate is approved', async () => {
      await database
        .collection('engine_candidates')
        .updateOne({ candidateId: id }, { $set: { reviewStatus: 'approved' } });
      const locked = await reviewMedia(id, {
        expectedMediaReviewRevision: 4,
        status: 'approved',
      }).expect(409);
      expect(locked.body.code).toBe('MEDIA_LOCKED');
      const upload = await attach(id, 4, PNG_3X2).expect(409);
      expect(upload.body.code).toBe('MEDIA_LOCKED');
      // The forced status bypassed real approval provenance, which would mark
      // the Scope's historical inventory incomplete for later scenarios.
      await database
        .collection('engine_candidates')
        .updateOne({ candidateId: id }, { $set: { reviewStatus: 'pending' } });
    });
  });

  describe('approval and draft creation with real media gates', () => {
    const id = 'draft-1';
    let assetUrl: string;

    it('approves only after media review, and draft creation re-reads rights live', async () => {
      await seedCandidate(id);
      const attached = (await attach(id, 0, PNG_3X2).expect(201)).body.data;
      assetUrl = attached.mediaPlan[0].asset.url;
      // Same bytes as an earlier test: the shared asset already has a BLOCKED
      // record, so start this scenario from a clean CLEARED record instead.
      await app.get(MediaRightsService).record(assetUrl, {
        assetRights: { status: 'CLEARED', basisType: 'owned' } as never,
      });
      await reviewMedia(id, {
        expectedMediaReviewRevision: 1,
        status: 'approved',
      }).expect(201);

      // Precondition owned by duplicate screening, not media: the Scope's
      // historical inventory must be loadable as COMPLETE.
      const inventory = await app
        .get(DeterministicScreenService)
        .loadHistoricalScope({ worldKey: WORLD, scopeKey: SCOPE });
      expect(inventory).toMatchObject({ status: 'COMPLETE' });

      const approved = await asAdmin(http().post(`${base(id)}/approve`)).send({
        expectedRevision: 0,
        explanation: 'Media reviewed; question correct',
      });
      expect([approved.status, approved.body.code]).toEqual([201, undefined]);
      const afterApproval = await stored(id);
      expect(afterApproval?.reviewStatus).toBe('approved');
      expect(afterApproval?.mediaReviewRevision).toBe(2);

      await app.get(MediaRightsService).record(assetUrl, {
        assetRights: { status: 'BLOCKED' } as never,
      });
      const refused = await asAdmin(
        http().post(`${base(id)}/create-draft`),
      ).send({ expectedRevision: afterApproval?.reviewRevision });
      expect([refused.status, refused.body]).toEqual([
        409,
        expect.objectContaining({ code: 'MEDIA_NOT_READY' }),
      ]);
      expect((await stored(id))?.publishedContentItemId).toBeNull();

      await app.get(MediaRightsService).record(assetUrl, {
        assetRights: { status: 'CLEARED', basisType: 'owned' } as never,
      });
      const created = await asAdmin(http().post(`${base(id)}/create-draft`))
        .send({ expectedRevision: afterApproval?.reviewRevision })
        .expect(201);
      const contentItemId = created.body.data.contentItemId as string;
      const item = await database
        .collection('content_items')
        .findOne({ _id: new Types.ObjectId(contentItemId) });
      expect(item?.status).toBe('draft');
      expect(
        (item?.media as { assets: Array<{ url: string }> }).assets[0].url,
      ).toBe(assetUrl);
    });
  });

  describe('rights acknowledgment around text approval', () => {
    const id = 'ack-1';
    let assetUrl: string;
    let approvedRevision: number;
    const rights = () => app.get(MediaRightsService);
    const distinctDraft = () => ({
      ...ekshifniDraft(),
      prompt: { ar: 'من صاحب هذه الصورة؟' },
      answerPayload: {
        mode: 'match',
        acceptedAnswers: ['شخصية ثانية', 'second figure'],
      },
    });
    const textOf = async () => {
      const row = await stored(id);
      return {
        reviewRevision: row?.reviewRevision,
        humanAssessment: row?.humanAssessment,
        reviewDecision: row?.reviewDecision,
        reviewEvents: row?.reviewEvents,
        draft: row?.draft,
      };
    };
    const approveText = (expectedRevision = 0) =>
      asAdmin(http().post(`${base(id)}/approve`)).send({
        expectedRevision,
        explanation: 'Media reviewed and rights acknowledged',
      });

    it('refuses text approval until PENDING rights on the drafted asset are acknowledged', async () => {
      await seedCandidate(id, { draft: distinctDraft() });
      const attached = (
        await attach(id, 0, WEBP_LOSSY_3X2, 'w.webp', 'image/webp').expect(201)
      ).body.data;
      assetUrl = attached.mediaPlan[0].asset.url;
      await rights().record(assetUrl, {
        assetRights: { status: 'PENDING' } as never,
      });
      await reviewMedia(id, {
        expectedMediaReviewRevision: 1,
        status: 'approved',
      }).expect(201);

      const blocked = await approveText().expect(409);
      // The HTTP error carries the code; the actionable detail is served in
      // reviewEligibility, which is what the Review Studio renders.
      expect(blocked.body.code).toBe('MEDIA_NOT_READY');
      const pendingView = await detail(id);
      expect(pendingView.reviewEligibility.mediaReadiness.blockers).toEqual([
        expect.objectContaining({
          code: 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
          rightsStatus: 'PENDING',
        }),
      ]);
      expect(pendingView.reviewEligibility.canApprove).toBe(false);
      expect(
        pendingView.reviewEligibility.approvalBlockers.join(' '),
      ).toContain('MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED');
      expect((await stored(id))?.reviewStatus).toBe('pending');

      await acknowledge(
        id,
        2,
        'Agency grant pending; accepted for beta',
      ).expect(201);
      expect((await rights().statusFor(assetUrl)).assetRights).toBe('PENDING');
      await approveText().expect(201);
      const approved = await stored(id);
      expect(approved?.reviewStatus).toBe('approved');
      approvedRevision = approved?.reviewRevision as number;
    });

    it('blocks draft creation when rights change after approval, with an actionable draft blocker', async () => {
      // EXPIRED is never stored: it is a CLEARED grant whose term has lapsed.
      await rights().record(assetUrl, {
        assetRights: {
          status: 'CLEARED',
          basisType: 'grant',
          expiresAt: new Date(Date.now() - 60_000),
        } as never,
      });
      const view = await detail(id);
      expect(view.reviewEligibility.canCreateDraft).toBe(false);
      expect(view.reviewEligibility.draftBlockers.join(' ')).toContain(
        'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
      );
      const refused = await asAdmin(http().post(`${base(id)}/create-draft`))
        .send({ expectedRevision: approvedRevision })
        .expect(409);
      expect(refused.body.code).toBe('MEDIA_NOT_READY');
      expect(view.reviewEligibility.mediaReadiness.blockers).toEqual([
        expect.objectContaining({
          code: 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
          rightsStatus: 'EXPIRED',
        }),
      ]);
      expect((await stored(id))?.publishedContentItemId).toBeNull();
    });

    it('allows only a rights acknowledgment on the approved candidate, without touching text review', async () => {
      const textBefore = await textOf();
      const revision = (await stored(id))?.mediaReviewRevision as number;
      const locked = await reviewMedia(id, {
        expectedMediaReviewRevision: revision,
        status: 'rejected',
        explanation: 'no',
      }).expect(409);
      expect(locked.body.code).toBe('MEDIA_LOCKED');
      const upload = await attach(id, revision, PNG_3X2).expect(409);
      expect(upload.body.code).toBe('MEDIA_LOCKED');

      const results = await Promise.all([
        acknowledge(id, revision, 'Grant renewal requested'),
        acknowledge(id, revision, 'Grant renewal requested'),
      ]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      const after = await stored(id);
      expect(after?.reviewStatus).toBe('approved');
      expect(after?.mediaReviewRevision).toBe(revision + 1);
      expect(await textOf()).toEqual(textBefore);
      expect((await rights().statusFor(assetUrl)).assetRights).toBe('EXPIRED');
      const event = (after?.mediaEvents as Array<Record<string, unknown>>).at(
        -1,
      );
      expect(event).toMatchObject({
        action: 'media_rights_acknowledged',
        details: { afterApproval: true, rightsStatus: 'EXPIRED' },
      });
    });

    it('then creates the canonical DRAFT, after which media is fully locked', async () => {
      const created = await asAdmin(http().post(`${base(id)}/create-draft`))
        .send({ expectedRevision: approvedRevision })
        .expect(201);
      const item = await database.collection('content_items').findOne({
        _id: new Types.ObjectId(created.body.data.contentItemId as string),
      });
      expect(
        (item?.media as { assets: Array<{ url: string }> }).assets[0].url,
      ).toBe(assetUrl);
      const revision = (await stored(id))?.mediaReviewRevision as number;
      const late = await acknowledge(id, revision, 'too late').expect(409);
      expect(late.body.code).toBe('MEDIA_LOCKED');
    });
  });
});
