import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CandidateMediaReviewService } from './candidate-media-review.service';

const actor = { id: 'admin-1', email: 'admin@example.test' } as never;
const URL_A = `/uploads/world-content/content-items/engine-${'a'.repeat(64)}.png`;
const URL_B = `/uploads/world-content/content-items/engine-${'b'.repeat(64)}.png`;

const chain = <T>(value: T) => {
  const query = { lean: () => query, exec: async () => value };
  return query;
};

const resolvedSlot = (overrides: Record<string, unknown> = {}) => ({
  slotKey: 'subject-image',
  purpose: 'gameplay',
  required: true,
  status: 'resolved',
  asset: { url: URL_A, sha256: 'a'.repeat(64), mimetype: 'image/png' },
  provenance: { acquisition: 'upload', provider: 'admin-upload' },
  rights: { status: 'UNKNOWN', source: 'media-rights' },
  review: null,
  rightsAcknowledgement: null,
  ...overrides,
});

const candidate = (overrides: Record<string, unknown> = {}) => ({
  candidateId: 'cand-1',
  jobId: 'job-1',
  reviewStatus: 'pending',
  reviewRevision: 3,
  humanAssessment: { factualState: 'SUPPORTED', assessedRevision: 3 },
  publishedContentItemId: null,
  draft: { prompt: { ar: 'من هذا؟' } },
  mediaPlan: [resolvedSlot()],
  mediaReviewRevision: 1,
  ...overrides,
});

const build = (
  options: {
    current?: Record<string, unknown>;
    mechanicKey?: string;
    scopeKey?: string;
    liveRights?: string;
    recordExists?: boolean;
    matched?: number;
    ingest?: Record<string, unknown>;
  } = {},
) => {
  const current = options.current ?? candidate();
  const candidates = {
    findOne: jest.fn(() => chain(current)),
    updateOne: jest.fn(() => chain({ matchedCount: options.matched ?? 1 })),
  };
  const jobs = {
    findById: jest.fn(() =>
      chain({
        _id: 'job-1',
        mechanicKey: options.mechanicKey ?? 'ekshifni',
        scopeKey: options.scopeKey ?? 'arab-media-stars',
      }),
    ),
  };
  const ingestion = {
    ingestBytes: jest.fn(
      async () =>
        options.ingest ?? {
          status: 'resolved',
          asset: {
            url: URL_B,
            mimetype: 'image/png',
            width: 3,
            height: 2,
            sha256: 'b'.repeat(64),
          },
          provenance: {
            acquisition: 'upload',
            provider: 'admin-upload',
            byteSize: 77,
          },
          rights: { status: 'UNKNOWN', source: 'unrecorded' },
          storage: {
            objectKey: URL_B.slice(9),
            mirrored: true,
            reusedLocalFile: false,
          },
        },
    ),
  };
  const review = { detail: jest.fn(async () => ({ id: 'presented' })) };
  const status = (url: string) => ({
    assetUrl: url,
    assetRights: options.liveRights ?? 'UNKNOWN',
    recordExists: options.recordExists ?? true,
    likenessUseBasis: 'UNKNOWN',
    productionReady: false,
  });
  const mediaRights = {
    statusFor: jest.fn(async (url: string) => status(url)),
    statusForMany: jest.fn(async (urls: string[]) => urls.map(status)),
  };
  const service = new CandidateMediaReviewService(
    candidates as never,
    jobs as never,
    ingestion as never,
    review as never,
    mediaRights as never,
  );
  return { service, candidates, ingestion, review, mediaRights };
};

const file = {
  originalname: 'answer-name.png',
  mimetype: 'image/png',
  size: 77,
  buffer: Buffer.from('png'),
};

const writeOf = (candidates: { updateOne: jest.Mock }) =>
  candidates.updateOne.mock.calls[0] as unknown as [
    Record<string, unknown>,
    { $set: Record<string, unknown>; $push: Record<string, unknown> },
  ];

describe('CandidateMediaReviewService', () => {
  describe('slot identity and locks', () => {
    it('refuses a slot the registry does not declare for the candidate target', async () => {
      const { service, candidates } = build();
      await expect(
        service.recordReview(
          'cand-1',
          'hero-image',
          { expectedMediaReviewRevision: 1, status: 'approved' },
          actor,
        ),
      ).rejects.toMatchObject({
        response: { code: 'MEDIA_SLOT_NOT_REGISTERED' },
      });
      expect(candidates.updateOne).not.toHaveBeenCalled();
    });

    it('refuses every media action on a legacy (ungoverned) candidate', async () => {
      const { service, candidates, ingestion } = build({
        mechanicKey: 'read-your-opponent',
        scopeKey: 'club-history',
        current: candidate({
          mediaPlan: undefined,
          mediaReviewRevision: undefined,
        }),
      });
      await expect(
        service.attachUpload(
          'cand-1',
          'subject-image',
          { expectedMediaReviewRevision: 0 },
          file,
          actor,
        ),
      ).rejects.toMatchObject({
        response: { code: 'MEDIA_SLOT_NOT_REGISTERED' },
      });
      expect(ingestion.ingestBytes).not.toHaveBeenCalled();
      expect(candidates.updateOne).not.toHaveBeenCalled();
    });

    it.each([
      ['approved', { reviewStatus: 'approved' }],
      ['rejected', { reviewStatus: 'rejected' }],
      ['published', { publishedContentItemId: 'item-1' }],
    ])('locks media on a %s candidate', async (_label, overrides) => {
      const { service, candidates } = build({ current: candidate(overrides) });
      await expect(
        service.recordReview(
          'cand-1',
          'subject-image',
          { expectedMediaReviewRevision: 1, status: 'approved' },
          actor,
        ),
      ).rejects.toMatchObject({ response: { code: 'MEDIA_LOCKED' } });
      expect(candidates.updateOne).not.toHaveBeenCalled();
    });

    it('rejects a malformed slot key before any read', async () => {
      const { service, candidates } = build();
      await expect(
        service.recordReview(
          'cand-1',
          '../x',
          { expectedMediaReviewRevision: 1, status: 'approved' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(candidates.findOne).not.toHaveBeenCalled();
    });
  });

  describe('optimistic concurrency', () => {
    it('refuses a stale expected media revision without writing', async () => {
      const { service, candidates } = build();
      await expect(
        service.recordReview(
          'cand-1',
          'subject-image',
          { expectedMediaReviewRevision: 0, status: 'approved' },
          actor,
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'MEDIA_REVISION_CONFLICT',
          currentMediaReviewRevision: 1,
        },
      });
      expect(candidates.updateOne).not.toHaveBeenCalled();
    });

    it('reports a lost race on the conditional write as a conflict', async () => {
      const { service } = build({ matched: 0 });
      await expect(
        service.recordReview(
          'cand-1',
          'subject-image',
          { expectedMediaReviewRevision: 1, status: 'approved' },
          actor,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('conditions the write on the media revision and an open candidate, not the text revision', async () => {
      const { service, candidates } = build();
      await service.recordReview(
        'cand-1',
        'subject-image',
        { expectedMediaReviewRevision: 1, status: 'approved' },
        actor,
      );
      const [filter] = writeOf(candidates);
      expect(filter).toEqual({
        candidateId: 'cand-1',
        publishedContentItemId: null,
        reviewStatus: { $nin: ['approved', 'rejected'] },
        mediaReviewRevision: 1,
      });
    });

    it('matches a missing media revision as 0', async () => {
      const { service, candidates } = build({
        current: candidate({ mediaReviewRevision: undefined }),
      });
      await service.recordReview(
        'cand-1',
        'subject-image',
        { expectedMediaReviewRevision: 0, status: 'approved' },
        actor,
      );
      expect(writeOf(candidates)[0].mediaReviewRevision).toEqual({
        $in: [0, null],
      });
    });
  });

  describe('review and rights acknowledgment', () => {
    describe('after text approval', () => {
      it('allows a rights-only acknowledgment, conditioned on the same approval', async () => {
        const { service, candidates } = build({
          liveRights: 'PENDING',
          current: candidate({ reviewStatus: 'approved' }),
        });
        await service.acknowledgeRights(
          'cand-1',
          'subject-image',
          { expectedMediaReviewRevision: 1, note: 'Grant renewal in progress' },
          actor,
        );
        const [filter, update] = writeOf(candidates);
        expect(filter).toEqual({
          candidateId: 'cand-1',
          publishedContentItemId: null,
          reviewStatus: 'approved',
          reviewRevision: 3,
          mediaReviewRevision: 1,
        });
        // Media fields only: no draft path, no text review field.
        expect(Object.keys(update.$set).sort()).toEqual([
          'mediaPlan',
          'mediaReviewRevision',
        ]);
        expect(update.$push.mediaEvents).toMatchObject({
          action: 'media_rights_acknowledged',
          details: { afterApproval: true, rightsStatus: 'PENDING' },
        });
      });

      it('keeps upload, replacement and review locked', async () => {
        const { service, candidates, ingestion } = build({
          current: candidate({ reviewStatus: 'approved' }),
        });
        await expect(
          service.attachUpload(
            'cand-1',
            'subject-image',
            { expectedMediaReviewRevision: 1 },
            file,
            actor,
          ),
        ).rejects.toMatchObject({ response: { code: 'MEDIA_LOCKED' } });
        await expect(
          service.recordReview(
            'cand-1',
            'subject-image',
            {
              expectedMediaReviewRevision: 1,
              status: 'rejected',
              explanation: 'x',
            },
            actor,
          ),
        ).rejects.toMatchObject({ response: { code: 'MEDIA_LOCKED' } });
        expect(ingestion.ingestBytes).not.toHaveBeenCalled();
        expect(candidates.updateOne).not.toHaveBeenCalled();
      });

      it.each([
        ['rejected', { reviewStatus: 'rejected' }],
        [
          'published',
          { reviewStatus: 'approved', publishedContentItemId: 'item-1' },
        ],
      ])(
        'still refuses acknowledgment on a %s candidate',
        async (_label, overrides) => {
          const { service, candidates } = build({
            current: candidate(overrides),
          });
          await expect(
            service.acknowledgeRights(
              'cand-1',
              'subject-image',
              { expectedMediaReviewRevision: 1, note: 'n' },
              actor,
            ),
          ).rejects.toMatchObject({ response: { code: 'MEDIA_LOCKED' } });
          expect(candidates.updateOne).not.toHaveBeenCalled();
        },
      );

      it('turns a lost race with an approval-voiding edit into a conflict', async () => {
        const { service } = build({
          matched: 0,
          current: candidate({ reviewStatus: 'approved' }),
        });
        await expect(
          service.acknowledgeRights(
            'cand-1',
            'subject-image',
            { expectedMediaReviewRevision: 1, note: 'n' },
            actor,
          ),
        ).rejects.toMatchObject({
          response: { code: 'MEDIA_REVISION_CONFLICT' },
        });
      });
    });

    it('keeps a stored BLOCKED observation when no rights record exists', async () => {
      const { service, candidates } = build({
        recordExists: false,
        current: candidate({
          mediaPlan: [
            resolvedSlot({ rights: { status: 'BLOCKED', source: 'provider' } }),
          ],
        }),
      });
      await expect(
        service.acknowledgeRights(
          'cand-1',
          'subject-image',
          { expectedMediaReviewRevision: 1, note: 'n' },
          actor,
        ),
      ).rejects.toMatchObject({ response: { code: 'MEDIA_RIGHTS_BLOCKED' } });
      expect(candidates.updateOne).not.toHaveBeenCalled();
    });

    it('lets an existing rights record override the stored observation', async () => {
      const { service, candidates } = build({
        recordExists: true,
        liveRights: 'PENDING',
        current: candidate({
          mediaPlan: [
            resolvedSlot({ rights: { status: 'BLOCKED', source: 'provider' } }),
          ],
        }),
      });
      await service.acknowledgeRights(
        'cand-1',
        'subject-image',
        { expectedMediaReviewRevision: 1, note: 'record corrected' },
        actor,
      );
      const [, update] = writeOf(candidates);
      expect(
        (update.$set.mediaPlan as Array<{ rightsAcknowledgement: unknown }>)[0]
          .rightsAcknowledgement,
      ).toMatchObject({ rightsStatus: 'PENDING' });
    });

    it('records the ingestion observation on attach when no rights record exists', async () => {
      const { service, candidates } = build({ recordExists: false });
      await service.attachUpload(
        'cand-1',
        'subject-image',
        { expectedMediaReviewRevision: 1 },
        file,
        actor,
      );
      const [, update] = writeOf(candidates);
      expect(
        (update.$set.mediaPlan as Array<{ rights: unknown }>)[0].rights,
      ).toEqual({ status: 'UNKNOWN', source: 'unrecorded' });
    });

    it('records approval and touches only media fields', async () => {
      const { service, candidates } = build();
      await service.recordReview(
        'cand-1',
        'subject-image',
        { expectedMediaReviewRevision: 1, status: 'approved' },
        actor,
      );
      const [, update] = writeOf(candidates);
      expect(Object.keys(update.$set).sort()).toEqual([
        'mediaPlan',
        'mediaReviewRevision',
      ]);
      expect(Object.keys(update.$push)).toEqual(['mediaEvents']);
      expect(update.$set.mediaReviewRevision).toBe(2);
      expect(
        (update.$set.mediaPlan as Array<{ review: unknown }>)[0].review,
      ).toMatchObject({
        status: 'approved',
        assetUrl: URL_A,
        mediaReviewRevision: 2,
        actorId: 'admin-1',
      });
      expect(update.$push.mediaEvents).toMatchObject({
        action: 'media_reviewed',
        slotKeys: ['subject-image'],
        reviewRevision: 3,
        mediaReviewRevision: 2,
      });
    });

    it('requires an explanation to reject', async () => {
      const { service, candidates } = build();
      await expect(
        service.recordReview(
          'cand-1',
          'subject-image',
          { expectedMediaReviewRevision: 1, status: 'rejected' },
          actor,
        ),
      ).rejects.toMatchObject({
        response: { code: 'MEDIA_REJECTION_EXPLANATION_REQUIRED' },
      });
      expect(candidates.updateOne).not.toHaveBeenCalled();
    });

    it('cannot review a slot that has no resolved asset', async () => {
      const { service } = build({
        current: candidate({
          mediaPlan: [resolvedSlot({ status: 'failed', asset: null })],
        }),
      });
      await expect(
        service.recordReview(
          'cand-1',
          'subject-image',
          { expectedMediaReviewRevision: 1, status: 'approved' },
          actor,
        ),
      ).rejects.toMatchObject({ response: { code: 'MEDIA_SLOT_UNRESOLVED' } });
    });

    it('binds an acknowledgment to the live rights status and never changes it', async () => {
      const { service, candidates } = build({ liveRights: 'PENDING' });
      await service.acknowledgeRights(
        'cand-1',
        'subject-image',
        { expectedMediaReviewRevision: 1, note: 'Agency confirming' },
        actor,
      );
      const [, update] = writeOf(candidates);
      const slot = (
        update.$set.mediaPlan as Array<{
          rights: { status: string };
          rightsAcknowledgement: unknown;
        }>
      )[0];
      expect(slot.rightsAcknowledgement).toMatchObject({
        assetUrl: URL_A,
        rightsStatus: 'PENDING',
      });
      expect(slot.rights.status).toBe('PENDING');
      expect(Object.keys(update.$set).sort()).toEqual([
        'mediaPlan',
        'mediaReviewRevision',
      ]);
    });

    it.each([
      ['BLOCKED', ConflictException, 'MEDIA_RIGHTS_BLOCKED'],
      ['CLEARED', BadRequestException, 'MEDIA_RIGHTS_ALREADY_CLEARED'],
    ])('refuses to acknowledge %s rights', async (liveRights, type, code) => {
      const { service, candidates } = build({ liveRights });
      const attempt = service.acknowledgeRights(
        'cand-1',
        'subject-image',
        { expectedMediaReviewRevision: 1, note: 'n' },
        actor,
      );
      await expect(attempt).rejects.toBeInstanceOf(type);
      await expect(
        service.acknowledgeRights(
          'cand-1',
          'subject-image',
          { expectedMediaReviewRevision: 1, note: 'n' },
          actor,
        ),
      ).rejects.toMatchObject({ response: { code } });
      expect(candidates.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('attaching an uploaded asset', () => {
    it('stores verified bytes, replaces the slot, writes the draft field and keeps text state', async () => {
      const approvedAndAcknowledged = resolvedSlot({
        review: {
          status: 'approved',
          assetUrl: URL_A,
          mediaReviewRevision: 1,
          actorId: 'a',
          actorEmail: 'a',
          at: 'x',
        },
        rightsAcknowledgement: {
          assetUrl: URL_A,
          rightsStatus: 'UNKNOWN',
          actorId: 'a',
          actorEmail: 'a',
          at: 'x',
          mediaReviewRevision: 1,
          note: 'n',
        },
      });
      const { service, candidates, ingestion } = build({
        current: candidate({ mediaPlan: [approvedAndAcknowledged] }),
      });
      await service.attachUpload(
        'cand-1',
        'subject-image',
        { expectedMediaReviewRevision: 1 },
        file,
        actor,
      );

      expect(ingestion.ingestBytes).toHaveBeenCalledWith({
        bytes: file.buffer,
        acquisition: 'upload',
        provenance: { provider: 'admin-upload' },
      });
      const [filter, update] = writeOf(candidates);
      // Writing into the draft also requires the text revision to be unchanged.
      expect(filter).toMatchObject({
        mediaReviewRevision: 1,
        reviewRevision: 3,
      });
      expect(Object.keys(update.$set).sort()).toEqual([
        'draft.media',
        'mediaPlan',
        'mediaReviewRevision',
      ]);
      expect(update.$set['draft.media']).toEqual({
        type: 'image',
        assets: [{ url: URL_B }],
      });
      const slot = (update.$set.mediaPlan as Array<Record<string, unknown>>)[0];
      expect(slot).toMatchObject({
        status: 'resolved',
        asset: expect.objectContaining({ url: URL_B }),
        review: null,
        rightsAcknowledgement: null,
        provenance: expect.objectContaining({ actorId: 'admin-1' }),
      });
      // The original filename never reaches stored state: it can name the answer.
      expect(JSON.stringify(update)).not.toContain('answer-name');
      expect(update.$push.mediaEvents).toMatchObject({
        action: 'media_attached',
        details: {
          superseded: {
            assetUrl: URL_A,
            reviewStatus: 'approved',
            rightsAcknowledged: true,
          },
        },
      });
    });

    it('requires a file', async () => {
      const { service } = build();
      await expect(
        service.attachUpload(
          'cand-1',
          'subject-image',
          { expectedMediaReviewRevision: 1 },
          undefined,
          actor,
        ),
      ).rejects.toMatchObject({ response: { code: 'MEDIA_ASSET_REQUIRED' } });
    });

    it('refuses an audio slot, since only image ingestion exists', async () => {
      const { service, ingestion } = build({
        mechanicKey: 'first-note',
        scopeKey: 'any',
      });
      await expect(
        service.attachUpload(
          'cand-1',
          'song-audio',
          { expectedMediaReviewRevision: 1 },
          file,
          actor,
        ),
      ).rejects.toMatchObject({
        response: { code: 'MEDIA_SLOT_UPLOAD_UNSUPPORTED' },
      });
      expect(ingestion.ingestBytes).not.toHaveBeenCalled();
    });

    it('refuses an Odd Piece V2 slot, whose draft needs fields an upload cannot set', async () => {
      const { service, ingestion } = build({
        mechanicKey: 'odd-piece',
        scopeKey: 'any',
      });
      await expect(
        service.attachUpload(
          'cand-1',
          'original-image',
          { expectedMediaReviewRevision: 1 },
          file,
          actor,
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'MEDIA_SLOT_UPLOAD_UNSUPPORTED',
          reason: 'ODD_PIECE_V2_IMAGE_FIELDS_NOT_SUPPORTED',
        },
      });
      expect(ingestion.ingestBytes).not.toHaveBeenCalled();
    });

    it.each([
      ['IMAGE_FORMAT_UNSUPPORTED', UnprocessableEntityException],
      ['IMAGE_TRUNCATED', UnprocessableEntityException],
      ['STORAGE_MIRROR_WRITE_FAILED', ServiceUnavailableException],
      ['STORAGE_NOT_DURABLE', ServiceUnavailableException],
    ])(
      'maps an ingestion failure %s and writes nothing',
      async (reason, type) => {
        const { service, candidates } = build({
          ingest: { status: 'failed', failureReason: reason, detail: 'x' },
        });
        await expect(
          service.attachUpload(
            'cand-1',
            'subject-image',
            { expectedMediaReviewRevision: 1 },
            file,
            actor,
          ),
        ).rejects.toBeInstanceOf(type);
        expect(candidates.updateOne).not.toHaveBeenCalled();
      },
    );

    it('checks the media revision before storing anything', async () => {
      const { service, ingestion } = build();
      await expect(
        service.attachUpload(
          'cand-1',
          'subject-image',
          { expectedMediaReviewRevision: 7 },
          file,
          actor,
        ),
      ).rejects.toMatchObject({
        response: { code: 'MEDIA_REVISION_CONFLICT' },
      });
      expect(ingestion.ingestBytes).not.toHaveBeenCalled();
    });
  });
});
