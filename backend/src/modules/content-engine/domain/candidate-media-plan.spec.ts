import {
  CandidateMediaSlot,
  CandidateMediaTransitionError,
  acknowledgeMediaRights,
  evaluateCandidateMedia,
  invalidateMediaReviews,
  recordMediaReview,
  replaceMediaSlotAsset,
  withLiveRights,
} from './candidate-media-plan';
import { MediaRequirementEntry } from './media-requirements';

const URL_A = '/uploads/world-content/content-items/engine-a.webp';
const URL_B = '/uploads/world-content/content-items/engine-b.webp';

const registry: MediaRequirementEntry[] = [
  {
    mechanicKey: 'mech',
    slots: [
      {
        slotKey: 'hero',
        purpose: 'gameplay',
        required: true,
        mediaType: 'image',
        targetPath: 'media',
        acquisition: ['retrieve', 'upload'],
        aspectPolicy: 'native',
      },
      {
        slotKey: 'art',
        purpose: 'decorative',
        required: false,
        mediaType: 'image',
        targetPath: 'revealMedia',
        acquisition: ['retrieve'],
        aspectPolicy: 'native',
      },
    ],
  },
];

const draftWith = (url: string | null) => ({
  prompt: { ar: 'سؤال' },
  ...(url ? { media: { type: 'image', assets: [{ url }] } } : {}),
});

const review = (
  status: 'approved' | 'rejected' | 'pending',
  assetUrl = URL_A,
  mediaReviewRevision = 1,
) => ({
  status,
  assetUrl,
  mediaReviewRevision,
  actorId: 'admin-1',
  actorEmail: 'admin@example.test',
  at: '2026-11-11T00:00:00.000Z',
});

const heroSlot = (
  overrides: Partial<CandidateMediaSlot> = {},
): CandidateMediaSlot => ({
  slotKey: 'hero',
  purpose: 'gameplay',
  required: true,
  status: 'resolved',
  asset: { url: URL_A },
  provenance: { acquisition: 'upload', provider: 'admin' },
  rights: { status: 'CLEARED', source: 'media-rights' },
  review: review('approved'),
  ...overrides,
});

const evaluate = (
  mediaPlan: CandidateMediaSlot[] | undefined,
  options: {
    draft?: Record<string, unknown>;
    revision?: number;
    mechanicKey?: string;
  } = {},
) =>
  evaluateCandidateMedia(
    {
      mechanicKey: options.mechanicKey ?? 'mech',
      scopeKey: 'scope',
      draft: options.draft ?? draftWith(URL_A),
      mediaPlan,
      mediaReviewRevision: options.revision ?? 1,
    },
    registry,
  );

const rightsWarnings = (result: { warnings: Array<{ code: string }> }) =>
  result.warnings.filter(
    (finding) => finding.code === 'MEDIA_RIGHTS_NOT_CLEARED',
  );

const codes = (findings: Array<{ code: string }>) =>
  findings.map((finding) => finding.code);

describe('evaluateCandidateMedia', () => {
  describe('legacy compatibility', () => {
    it('leaves candidates outside the contract ungoverned and ready', () => {
      const result = evaluate(undefined, {
        mechanicKey: 'read-your-opponent',
        draft: draftWith(null),
      });
      expect(result).toMatchObject({
        governed: false,
        ready: true,
        blockers: [],
        warnings: [],
        contractVersion: null,
      });
    });

    it('treats a missing mediaReviewRevision as 0', () => {
      const result = evaluateCandidateMedia(
        { mechanicKey: 'read-your-opponent', mediaPlan: null },
        registry,
      );
      expect(result.mediaReviewRevision).toBe(0);
    });
  });

  describe('required gameplay slots', () => {
    it('is ready when the slot is resolved, approved for that asset and present in the draft', () => {
      const result = evaluate([heroSlot()]);
      expect(result.ready).toBe(true);
      expect(result.governed).toBe(true);
      expect(result.requiredSlotKeys).toEqual(['hero']);
      expect(result.requirementsDigest).toMatch(/^[a-f0-9]{64}$/);
    });

    it('blocks when the plan is absent: the registry, not the plan, decides', () => {
      const result = evaluate(undefined);
      expect(result.ready).toBe(false);
      expect(codes(result.blockers)).toEqual(['MEDIA_REQUIRED_SLOT_MISSING']);
    });

    it('does not let an unrelated or decorative plan entry stand in for a required slot', () => {
      const result = evaluate([
        heroSlot({ slotKey: 'other' }),
        heroSlot({ slotKey: 'art', purpose: 'decorative', required: false }),
      ]);
      expect(codes(result.blockers)).toEqual(['MEDIA_REQUIRED_SLOT_MISSING']);
      expect(codes(result.warnings)).toContain('MEDIA_SLOT_UNREGISTERED');
    });

    it('does not let a plan entry downgrade a required slot to optional', () => {
      const result = evaluate([
        heroSlot({
          required: false,
          purpose: 'decorative',
          status: 'failed',
          asset: null,
        }),
      ]);
      expect(codes(result.blockers)).toEqual([
        'MEDIA_REQUIRED_SLOT_UNRESOLVED',
      ]);
    });

    it.each(['planned', 'failed', 'skipped'] as const)(
      'blocks an unresolved (%s) slot',
      (status) => {
        const result = evaluate([heroSlot({ status, asset: null })]);
        expect(codes(result.blockers)).toEqual([
          'MEDIA_REQUIRED_SLOT_UNRESOLVED',
        ]);
      },
    );

    it('blocks a resolved slot without an asset URL', () => {
      const result = evaluate([heroSlot({ asset: { url: '  ' } })]);
      expect(codes(result.blockers)).toEqual([
        'MEDIA_REQUIRED_SLOT_UNRESOLVED',
      ]);
    });

    it.each([
      ['no review', null],
      ['a pending review', review('pending')],
    ])('blocks an unreviewed asset (%s)', (_label, value) => {
      const result = evaluate([heroSlot({ review: value })]);
      expect(codes(result.blockers)).toEqual(['MEDIA_REVIEW_REQUIRED']);
    });

    it('blocks a rejected asset', () => {
      const result = evaluate([heroSlot({ review: review('rejected') })]);
      expect(codes(result.blockers)).toEqual(['MEDIA_REVIEW_REJECTED']);
    });

    it('treats an approval of a different asset as stale', () => {
      const result = evaluate(
        [
          heroSlot({
            asset: { url: URL_B },
            review: review('approved', URL_A),
          }),
        ],
        { draft: draftWith(URL_B) },
      );
      expect(codes(result.blockers)).toEqual(['MEDIA_REVIEW_STALE']);
    });

    it('treats a decision claiming a future media revision as stale', () => {
      const result = evaluate(
        [heroSlot({ review: review('approved', URL_A, 5) })],
        {
          revision: 1,
        },
      );
      expect(codes(result.blockers)).toEqual(['MEDIA_REVIEW_STALE']);
    });

    it('blocks when the draft does not carry the approved asset', () => {
      expect(
        codes(evaluate([heroSlot()], { draft: draftWith(URL_B) }).blockers),
      ).toEqual(['MEDIA_DRAFT_MISMATCH']);
      expect(
        codes(evaluate([heroSlot()], { draft: draftWith(null) }).blockers),
      ).toEqual(['MEDIA_DRAFT_MISMATCH']);
    });

    it('reads nested target paths', () => {
      const nested: MediaRequirementEntry[] = [
        {
          mechanicKey: 'odd',
          slots: [
            {
              slotKey: 'original-image',
              purpose: 'gameplay',
              required: true,
              mediaType: 'image',
              targetPath: 'mechanicPayload.originalImage.media',
              acquisition: ['upload'],
              aspectPolicy: 'native',
            },
          ],
        },
      ];
      const result = evaluateCandidateMedia(
        {
          mechanicKey: 'odd',
          draft: {
            mechanicPayload: {
              originalImage: {
                media: { type: 'image', assets: [{ url: URL_A }] },
              },
            },
          },
          mediaPlan: [heroSlot({ slotKey: 'original-image' })],
          mediaReviewRevision: 1,
        },
        nested,
      );
      expect(result.ready).toBe(true);
    });
  });

  describe('decorative media', () => {
    it('never blocks when decorative media failed, was rejected or is absent', () => {
      for (const art of [
        undefined,
        heroSlot({
          slotKey: 'art',
          purpose: 'decorative',
          required: false,
          status: 'failed',
          asset: null,
        }),
        heroSlot({
          slotKey: 'art',
          purpose: 'decorative',
          required: false,
          review: review('rejected'),
        }),
      ]) {
        const result = evaluate(art ? [heroSlot(), art] : [heroSlot()]);
        expect(result.ready).toBe(true);
        expect(codes(result.warnings)).toContain(
          'MEDIA_DECORATIVE_UNAVAILABLE',
        );
      }
    });
  });

  describe('rights', () => {
    it.each(['UNKNOWN', 'PENDING', 'EXPIRED'] as const)(
      'blocks an unacknowledged %s asset that the draft carries',
      (status) => {
        const result = evaluate([
          heroSlot({ rights: { status, source: 'provider' } }),
        ]);
        expect(result.ready).toBe(false);
        expect(result.blockers).toEqual([
          expect.objectContaining({
            code: 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
            severity: 'blocking',
            rightsStatus: status,
            acknowledged: false,
          }),
        ]);
        expect(rightsWarnings(result)).toEqual([]);
      },
    );

    it('only warns for an asset the canonical draft will not carry', () => {
      const notInDraft = evaluate(
        [heroSlot({ rights: { status: 'UNKNOWN', source: 'provider' } })],
        { draft: draftWith(URL_B) },
      );
      // The draft mismatch blocks on its own; rights do not add a blocker.
      expect(codes(notInDraft.blockers)).toEqual(['MEDIA_DRAFT_MISMATCH']);
      expect(rightsWarnings(notInDraft)[0]).toMatchObject({
        acknowledged: false,
        severity: 'warning',
      });
      const unregistered = evaluate([
        heroSlot(),
        heroSlot({
          slotKey: 'extra',
          rights: { status: 'UNKNOWN', source: 'provider' },
        }),
      ]);
      expect(unregistered.ready).toBe(true);
      expect(rightsWarnings(unregistered)[0]).toMatchObject({
        slotKey: 'extra',
        severity: 'warning',
      });
    });

    it('keeps missing or failed decorative media non-blocking', () => {
      const result = evaluate([
        heroSlot(),
        heroSlot({
          slotKey: 'art',
          purpose: 'decorative',
          required: false,
          status: 'failed',
          asset: null,
          rights: { status: 'UNKNOWN', source: 'provider' },
        }),
      ]);
      expect(result.ready).toBe(true);
    });

    it('treats a slot with no rights snapshot as UNKNOWN', () => {
      const result = evaluate([heroSlot({ rights: null })]);
      expect(result.blockers[0]).toMatchObject({
        code: 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
        rightsStatus: 'UNKNOWN',
      });
    });

    it('marks the warning acknowledged only for the same asset and status', () => {
      const ack = {
        assetUrl: URL_A,
        rightsStatus: 'UNKNOWN' as const,
        actorId: 'admin-1',
        actorEmail: 'admin@example.test',
        at: '2026-11-11T00:00:00.000Z',
        mediaReviewRevision: 2,
        note: 'Press kit image, licence being confirmed',
      };
      const acknowledged = evaluate(
        [
          heroSlot({
            rights: { status: 'UNKNOWN', source: 'provider' },
            rightsAcknowledgement: ack,
          }),
        ],
        { revision: 2 },
      );
      expect(acknowledged.ready).toBe(true);
      expect(rightsWarnings(acknowledged)[0]).toMatchObject({
        code: 'MEDIA_RIGHTS_NOT_CLEARED',
        rightsStatus: 'UNKNOWN',
        acknowledged: true,
      });

      const otherAsset = evaluate(
        [
          heroSlot({
            rights: { status: 'UNKNOWN', source: 'provider' },
            rightsAcknowledgement: { ...ack, assetUrl: URL_B },
          }),
        ],
        { revision: 2 },
      );
      expect(codes(otherAsset.blockers)).toEqual([
        'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
      ]);

      const statusChanged = evaluate(
        [
          heroSlot({
            rights: { status: 'EXPIRED', source: 'media-rights' },
            rightsAcknowledgement: ack,
          }),
        ],
        { revision: 2 },
      );
      expect(statusChanged.blockers).toEqual([
        expect.objectContaining({
          code: 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
          rightsStatus: 'EXPIRED',
        }),
      ]);
    });

    it('blocks an explicitly BLOCKED rights record', () => {
      const result = evaluate([
        heroSlot({ rights: { status: 'BLOCKED', source: 'media-rights' } }),
      ]);
      expect(codes(result.blockers)).toEqual(['MEDIA_RIGHTS_BLOCKED']);
    });

    it('gives CLEARED rights no finding', () => {
      expect(rightsWarnings(evaluate([heroSlot()]))).toEqual([]);
    });
  });
});

describe('media transitions', () => {
  const actor = { actorId: 'admin-1', actorEmail: 'admin@example.test' };
  const at = new Date('2026-11-11T10:00:00.000Z');

  it('records a review against the current asset and bumps only the media revision', () => {
    const state = {
      mediaPlan: [heroSlot({ review: null })],
      mediaReviewRevision: 0,
    };
    const next = recordMediaReview(state, {
      ...actor,
      slotKey: 'hero',
      expectedMediaReviewRevision: 0,
      status: 'approved',
      at,
    });
    expect(next.mediaReviewRevision).toBe(1);
    expect(Object.keys(next).sort()).toEqual([
      'mediaPlan',
      'mediaReviewRevision',
    ]);
    expect(next.mediaPlan[0].review).toMatchObject({
      status: 'approved',
      assetUrl: URL_A,
      mediaReviewRevision: 1,
    });
    expect(state.mediaPlan[0].review).toBeNull();
  });

  it('rejects a stale media revision', () => {
    expect(() =>
      recordMediaReview(
        { mediaPlan: [heroSlot()], mediaReviewRevision: 3 },
        {
          ...actor,
          slotKey: 'hero',
          expectedMediaReviewRevision: 2,
          status: 'approved',
          at,
        },
      ),
    ).toThrow(CandidateMediaTransitionError);
  });

  it('requires an explanation to reject and a resolved asset to review', () => {
    expect(() =>
      recordMediaReview(
        { mediaPlan: [heroSlot()], mediaReviewRevision: 1 },
        {
          ...actor,
          slotKey: 'hero',
          expectedMediaReviewRevision: 1,
          status: 'rejected',
          at,
        },
      ),
    ).toThrow('explanation');
    expect(() =>
      recordMediaReview(
        {
          mediaPlan: [heroSlot({ status: 'failed', asset: null })],
          mediaReviewRevision: 1,
        },
        {
          ...actor,
          slotKey: 'hero',
          expectedMediaReviewRevision: 1,
          status: 'approved',
          at,
        },
      ),
    ).toThrow('resolved');
  });

  it('acknowledges unknown rights without clearing them or staling the media approval', () => {
    const state = {
      mediaPlan: [
        heroSlot({ rights: { status: 'UNKNOWN', source: 'provider' } }),
      ],
      mediaReviewRevision: 1,
    };
    const next = acknowledgeMediaRights(state, {
      ...actor,
      slotKey: 'hero',
      expectedMediaReviewRevision: 1,
      note: 'Accepted for internal beta',
      at,
    });
    expect(next.mediaReviewRevision).toBe(2);
    expect(next.mediaPlan[0].rights).toEqual({
      status: 'UNKNOWN',
      source: 'provider',
    });
    expect(next.mediaPlan[0].rightsAcknowledgement).toMatchObject({
      assetUrl: URL_A,
      rightsStatus: 'UNKNOWN',
      mediaReviewRevision: 2,
    });
    const readiness = evaluate(next.mediaPlan, {
      revision: next.mediaReviewRevision,
    });
    expect(readiness.ready).toBe(true);
    expect(rightsWarnings(readiness)[0]).toMatchObject({ acknowledged: true });
  });

  it('refuses to acknowledge CLEARED or BLOCKED rights, or without a note', () => {
    const base = {
      ...actor,
      slotKey: 'hero',
      expectedMediaReviewRevision: 1,
      note: 'n',
      at,
    };
    expect(() =>
      acknowledgeMediaRights(
        { mediaPlan: [heroSlot()], mediaReviewRevision: 1 },
        base,
      ),
    ).toThrow('Cleared');
    expect(() =>
      acknowledgeMediaRights(
        {
          mediaPlan: [
            heroSlot({ rights: { status: 'BLOCKED', source: 'media-rights' } }),
          ],
          mediaReviewRevision: 1,
        },
        base,
      ),
    ).toThrow('BLOCKED');
    expect(() =>
      acknowledgeMediaRights(
        { mediaPlan: [heroSlot({ rights: null })], mediaReviewRevision: 1 },
        { ...base, note: '  ' },
      ),
    ).toThrow('note');
  });

  it('fails on an unknown slot', () => {
    expect(() =>
      recordMediaReview(
        { mediaPlan: [], mediaReviewRevision: 0 },
        {
          ...actor,
          slotKey: 'hero',
          expectedMediaReviewRevision: 0,
          status: 'approved',
          at,
        },
      ),
    ).toThrow('No media plan entry');
  });
});

describe('Phase 3A media transitions', () => {
  const requirement = {
    slotKey: 'hero',
    purpose: 'gameplay' as const,
    required: true,
  };
  const newAsset = {
    url: URL_B,
    sha256: 'b'.repeat(64),
    mimetype: 'image/webp',
  };
  const newRights = {
    status: 'UNKNOWN' as const,
    source: 'media-rights' as const,
  };
  const acknowledgedHero = () =>
    heroSlot({
      rights: { status: 'UNKNOWN', source: 'provider' },
      rightsAcknowledgement: {
        assetUrl: URL_A,
        rightsStatus: 'UNKNOWN',
        actorId: 'admin-1',
        actorEmail: 'admin@example.test',
        at: '2026-11-11T00:00:00.000Z',
        mediaReviewRevision: 2,
        note: 'agency confirming',
      },
    });

  describe('replaceMediaSlotAsset', () => {
    it('drops the previous approval and acknowledgment and bumps only the media revision', () => {
      const state = { mediaPlan: [acknowledgedHero()], mediaReviewRevision: 2 };
      const next = replaceMediaSlotAsset(state, {
        requirement,
        expectedMediaReviewRevision: 2,
        asset: newAsset,
        provenance: { acquisition: 'upload', provider: 'admin-upload' },
        rights: newRights,
      });
      expect(next.mediaReviewRevision).toBe(3);
      expect(next.mediaPlan[0]).toMatchObject({
        slotKey: 'hero',
        status: 'resolved',
        asset: newAsset,
        review: null,
        rightsAcknowledgement: null,
        rights: newRights,
      });
      expect(next.previous?.review?.status).toBe('approved');
      // The replacement fails the gate until it is reviewed again.
      expect(
        codes(
          evaluate(next.mediaPlan, { draft: draftWith(URL_B), revision: 3 })
            .blockers,
        ),
      ).toEqual([
        'MEDIA_REVIEW_REQUIRED',
        'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
      ]);
    });

    it('takes purpose and required from the registry, never from the old plan entry', () => {
      const tampered = heroSlot({ purpose: 'decorative', required: false });
      const next = replaceMediaSlotAsset(
        { mediaPlan: [tampered], mediaReviewRevision: 0 },
        {
          requirement,
          expectedMediaReviewRevision: 0,
          asset: newAsset,
          provenance: { acquisition: 'upload', provider: 'admin-upload' },
          rights: newRights,
        },
      );
      expect(next.mediaPlan[0]).toMatchObject({
        purpose: 'gameplay',
        required: true,
      });
    });

    it('creates the slot when the plan has none, and refuses a stale revision', () => {
      const created = replaceMediaSlotAsset(
        { mediaPlan: undefined, mediaReviewRevision: undefined },
        {
          requirement,
          expectedMediaReviewRevision: 0,
          asset: newAsset,
          provenance: { acquisition: 'upload', provider: 'admin-upload' },
          rights: newRights,
        },
      );
      expect(created.mediaPlan).toHaveLength(1);
      expect(created.previous).toBeNull();
      expect(() =>
        replaceMediaSlotAsset(
          { mediaPlan: [], mediaReviewRevision: 4 },
          {
            requirement,
            expectedMediaReviewRevision: 3,
            asset: newAsset,
            provenance: { acquisition: 'upload', provider: 'admin-upload' },
            rights: newRights,
          },
        ),
      ).toThrow(CandidateMediaTransitionError);
    });
  });

  describe('invalidateMediaReviews', () => {
    it('withdraws decisions but keeps rights acknowledgments', () => {
      const next = invalidateMediaReviews({
        mediaPlan: [acknowledgedHero()],
        mediaReviewRevision: 2,
      });
      expect(next?.mediaReviewRevision).toBe(3);
      expect(next?.mediaPlan[0].review).toBeNull();
      expect(next?.mediaPlan[0].rightsAcknowledgement?.assetUrl).toBe(URL_A);
      expect(next?.invalidated).toEqual([
        {
          slotKey: 'hero',
          review: expect.objectContaining({ status: 'approved' }),
        },
      ]);
    });

    it('returns null when there is nothing to withdraw', () => {
      expect(
        invalidateMediaReviews({
          mediaPlan: [heroSlot({ review: null })],
          mediaReviewRevision: 1,
        }),
      ).toBeNull();
      expect(invalidateMediaReviews({ mediaPlan: undefined })).toBeNull();
    });
  });

  describe('withLiveRights', () => {
    it('replaces the snapshot with the live status so a later BLOCKED stops approval', () => {
      const live = withLiveRights(
        [heroSlot()],
        new Map([[URL_A, 'BLOCKED' as const]]),
        new Date('2026-11-11T00:00:00.000Z'),
      );
      expect(live[0].rights).toMatchObject({
        status: 'BLOCKED',
        source: 'media-rights',
      });
      expect(codes(evaluate(live).blockers)).toEqual(['MEDIA_RIGHTS_BLOCKED']);
    });

    it('turns an acknowledgment stale when the live status differs from the acknowledged one', () => {
      const live = withLiveRights(
        [acknowledgedHero()],
        new Map([[URL_A, 'EXPIRED' as const]]),
        new Date(),
      );
      // An acknowledgment of UNKNOWN does not cover a later EXPIRED.
      expect(evaluate(live, { revision: 2 }).blockers).toEqual([
        expect.objectContaining({
          code: 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
          rightsStatus: 'EXPIRED',
        }),
      ]);
    });

    it('carries the record licence and rights holder, without inventing absent ones', () => {
      const [withDetails] = withLiveRights(
        [heroSlot()],
        new Map([
          [
            URL_A,
            {
              status: 'PENDING' as const,
              licence: 'CC BY 4.0',
              rightsHolder: 'Example Agency',
            },
          ],
        ]),
        new Date('2026-11-11T00:00:00.000Z'),
      );
      expect(withDetails.rights).toMatchObject({
        status: 'PENDING',
        source: 'media-rights',
        licence: 'CC BY 4.0',
        rightsHolder: 'Example Agency',
      });
      const [statusOnly] = withLiveRights(
        [heroSlot({ rights: { status: 'UNKNOWN', source: 'unrecorded' } })],
        new Map([[URL_A, 'CLEARED' as const]]),
        new Date(),
      );
      expect(statusOnly.rights).not.toHaveProperty('licence');
      expect(statusOnly.rights).not.toHaveProperty('rightsHolder');
    });

    it('leaves slots without a live status untouched', () => {
      const plan = [heroSlot()];
      expect(withLiveRights(plan, new Map(), new Date())).toEqual(plan);
    });
  });
});
