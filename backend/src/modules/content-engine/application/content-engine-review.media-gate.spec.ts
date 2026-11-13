import { ConflictException } from '@nestjs/common';
import { ContentEngineReviewService } from './content-engine-review.service';

/**
 * §30.22 Phase 1 wiring. No generatable mechanic is in the production media
 * registry, so this spec governs the RYO `scope` target through a test registry
 * to exercise the real approve / createDraft / detail paths. `other-scope`
 * stays outside the contract and stands for every legacy candidate.
 */
jest.mock('../domain/media-requirements', () => {
  const actual = jest.requireActual('../domain/media-requirements');
  const testRegistry = [
    {
      mechanicKey: 'read-your-opponent',
      scopeKeys: ['scope'],
      slots: [
        {
          slotKey: 'hero',
          purpose: 'gameplay',
          required: true,
          mediaType: 'image',
          targetPath: 'media',
          acquisition: ['upload'],
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
  return {
    ...actual,
    MEDIA_REQUIREMENTS: testRegistry,
    resolveMediaRequirements: (target: unknown, registry?: unknown) =>
      actual.resolveMediaRequirements(target, registry ?? testRegistry),
  };
});

const chain = <T>(value: T) => {
  const query = {
    lean: () => query,
    session: () => query,
    limit: () => query,
    sort: () => query,
    exec: async () => value,
  };
  return query;
};

const actor = { id: 'reviewer-1', email: 'reviewer@example.test' } as never;
const URL_A = '/uploads/world-content/content-items/engine-a.webp';

const approvedHero = (overrides: Record<string, unknown> = {}) => ({
  slotKey: 'hero',
  purpose: 'gameplay',
  required: true,
  status: 'resolved',
  asset: { url: URL_A },
  rights: { status: 'CLEARED', source: 'media-rights' },
  review: {
    status: 'approved',
    assetUrl: URL_A,
    mediaReviewRevision: 1,
    actorId: 'admin-1',
    actorEmail: 'admin@example.test',
    at: '2026-11-11T00:00:00.000Z',
  },
  ...overrides,
});

const candidate = (overrides: Record<string, unknown> = {}) => ({
  _id: 'candidate-db-id',
  candidateId: 'candidate-1',
  jobId: 'job-1',
  ordinal: 0,
  status: 'awaiting_review',
  contextHash: 'ctx-hash-1',
  promptVersion: 'mc-v2',
  provider: 'openai',
  model: 'gpt-4.1-mini',
  draft: {
    prompt: { ar: 'من فاز؟' },
    media: { type: 'image', assets: [{ url: URL_A }] },
    answerPayload: {
      mode: 'multiple_choice',
      options: [
        { id: 'a', label: { ar: 'أ' } },
        { id: 'b', label: { ar: 'ب' } },
      ],
      correctOptionId: 'a',
    },
  },
  factualClaims: ['claim 1'],
  findings: [],
  reviewRevision: 1,
  reviewStatus: 'pending',
  compatibilityEvaluation: { preDraft: { blockers: [] } },
  humanAssessment: {
    factualState: 'SUPPORTED',
    assessedRevision: 1,
    evidence: [{ url: 'https://example.test/source' }],
  },
  publishedContentItemId: null,
  reviewEvents: [],
  ...overrides,
});

const build = (current: Record<string, unknown>, scopeKey = 'scope') => {
  const candidates = {
    findOne: jest.fn(() => chain(current)),
    findOneAndUpdate: jest.fn(() => chain(current)),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
  };
  const job = {
    _id: 'job-1',
    mechanicKey: 'read-your-opponent',
    worldKey: 'world',
    scopeKey,
    status: 'awaiting_review',
  };
  const jobs = { findById: jest.fn(() => chain(job)) };
  const publications = { findOne: jest.fn(() => chain(null)) };
  const screen = {
    beginBatch: jest.fn(),
    screen: jest.fn(() => ({ passed: true, findings: [] })),
    createSession: jest.fn(() => ({})),
    loadHistoricalScope: jest.fn(async () => ({ status: 'COMPLETE' })),
  };
  const compatibility = {
    evaluate: jest.fn(() => ({
      status: 'COMPATIBLE',
      preDraft: { readiness: 'ready', blockers: [], warnings: [] },
      usedCanonicalReferences: true,
      deferredChecks: [],
    })),
  };
  const contentItems = { create: jest.fn() };
  const scopeDoc = {
    _id: 'scope-id',
    worldId: 'world-id',
    name: 'Scope',
    slug: scopeKey,
    status: 'active',
    excludedChallengeTypeIds: [],
  };
  const worlds = {
    findBySlug: jest.fn(async () => ({ _id: 'world-id', status: 'active' })),
  };
  const scopes = { findBySlugInWorld: jest.fn(async () => scopeDoc) };
  const challengeTypes = {
    findBySlug: jest.fn(async () => ({
      _id: 'challenge-id',
      name: 'Read Your Opponent',
      slug: 'read-your-opponent',
      family: 'RYO',
      itemStructure: 'discrete-triple',
      answerMode: 'ryo',
      defaultPresentation: { inputType: 'multiple-choice' },
      scoringRuleId: 'ryo-payoff-matrix',
      status: 'active',
    })),
  };
  const mongoSession = {
    withTransaction: async (fn: () => Promise<void>) => fn(),
    endSession: async () => undefined,
  };
  const fence = { updateOne: jest.fn(() => chain({ matchedCount: 1 })) };
  const worldModel = {
    find: jest.fn(() =>
      chain([{ _id: 'world-id', slug: 'world', name: 'World' }]),
    ),
  };
  const scopeModel = {
    find: jest.fn(() =>
      chain([{ _id: 'scope-id', slug: scopeKey, name: 'Scope' }]),
    ),
  };
  const connection = {
    startSession: async () => mongoSession,
    model: (name: string) =>
      name === 'World' ? worldModel : name === 'Scope' ? scopeModel : fence,
  };
  const service = new ContentEngineReviewService(
    candidates as never,
    jobs as never,
    {} as never,
    publications as never,
    connection as never,
    screen as never,
    compatibility as never,
    contentItems as never,
    worlds as never,
    scopes as never,
    challengeTypes as never,
  );
  return { service, candidates, contentItems };
};

const approve = (service: ContentEngineReviewService) =>
  service.approve(
    'candidate-1',
    { expectedRevision: 1, explanation: 'reviewed' } as never,
    actor,
  );

describe('ContentEngineReviewService media gate (§30.22 Phase 1)', () => {
  it('blocks approval when a required slot has no plan entry at all', async () => {
    const { service, candidates } = build(candidate());
    await expect(approve(service)).rejects.toMatchObject({
      response: {
        code: 'MEDIA_NOT_READY',
        blockers: [
          expect.objectContaining({
            code: 'MEDIA_REQUIRED_SLOT_MISSING',
            slotKey: 'hero',
          }),
        ],
      },
    });
    expect(candidates.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    [
      'unresolved',
      { status: 'failed', asset: null },
      'MEDIA_REQUIRED_SLOT_UNRESOLVED',
    ],
    ['unreviewed', { review: null }, 'MEDIA_REVIEW_REQUIRED'],
    [
      'rejected',
      { review: { ...approvedHero().review, status: 'rejected' } },
      'MEDIA_REVIEW_REJECTED',
    ],
  ])('blocks approval for an %s required asset', async (_label, slot, code) => {
    const { service, candidates } = build(
      candidate({ mediaPlan: [approvedHero(slot)], mediaReviewRevision: 1 }),
    );
    await expect(approve(service)).rejects.toMatchObject({
      response: {
        code: 'MEDIA_NOT_READY',
        blockers: [expect.objectContaining({ code })],
      },
    });
    expect(candidates.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each(['UNKNOWN', 'PENDING', 'EXPIRED'])(
    'blocks approval while %s rights on the drafted asset are unacknowledged',
    async (status) => {
      const { service, candidates } = build(
        candidate({
          mediaPlan: [approvedHero({ rights: { status, source: 'provider' } })],
          mediaReviewRevision: 1,
        }),
      );
      await expect(approve(service)).rejects.toMatchObject({
        response: {
          code: 'MEDIA_NOT_READY',
          blockers: [
            expect.objectContaining({
              code: 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
              rightsStatus: status,
            }),
          ],
        },
      });
      expect(candidates.findOneAndUpdate).not.toHaveBeenCalled();
    },
  );

  it('approves with acknowledged unknown rights and failed decorative media, and CASes on the media revision', async () => {
    const { service, candidates } = build(
      candidate({
        mediaPlan: [
          approvedHero({
            rights: { status: 'UNKNOWN', source: 'provider' },
            rightsAcknowledgement: {
              assetUrl: URL_A,
              rightsStatus: 'UNKNOWN',
              actorId: 'admin-1',
              actorEmail: 'admin@example.test',
              at: '2026-11-11T00:00:00.000Z',
              mediaReviewRevision: 1,
              note: 'licence being confirmed',
            },
          }),
          {
            slotKey: 'art',
            purpose: 'decorative',
            required: false,
            status: 'failed',
            asset: null,
          },
        ],
        mediaReviewRevision: 1,
      }),
    );
    await approve(service);
    expect(candidates.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ reviewRevision: 1, mediaReviewRevision: 1 }),
      expect.objectContaining({
        $set: expect.objectContaining({ reviewStatus: 'approved' }),
      }),
      expect.anything(),
    );
  });

  it('matches a missing media revision as 0 in the CAS', async () => {
    const { service, candidates } = build(
      candidate({
        mediaPlan: [
          approvedHero({
            review: { ...approvedHero().review, mediaReviewRevision: 0 },
          }),
        ],
      }),
    );
    await approve(service);
    expect(candidates.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ mediaReviewRevision: { $in: [0, null] } }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('leaves an ungoverned (legacy) candidate and its write filter unchanged', async () => {
    const { service, candidates } = build(
      candidate({ draft: { ...candidate().draft, media: undefined } }),
      'other-scope',
    );
    await approve(service);
    const [filter] = candidates.findOneAndUpdate.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(filter).toEqual({
      candidateId: 'candidate-1',
      reviewRevision: 1,
      publishedContentItemId: null,
    });
  });

  it('re-checks media at draft creation, so a media rejection after text approval blocks the draft', async () => {
    const approved = candidate({
      reviewStatus: 'approved',
      mediaPlan: [
        approvedHero({
          review: {
            ...approvedHero().review,
            status: 'rejected',
            mediaReviewRevision: 2,
          },
        }),
      ],
      mediaReviewRevision: 2,
    });
    const { service, contentItems } = build(approved);
    const internals = service as unknown as Record<string, unknown>;
    jest
      .spyOn(internals as never, 'assertDraftCreationSafety' as never)
      .mockImplementation((() => undefined) as never);
    jest
      .spyOn(internals as never, 'canonicalDto' as never)
      .mockResolvedValue({} as never);
    await expect(
      service.createDraft('candidate-1', 1, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.createDraft('candidate-1', 1, actor),
    ).rejects.toMatchObject({
      response: { code: 'MEDIA_NOT_READY' },
    });
    expect(contentItems.create).not.toHaveBeenCalled();
  });

  it('reports media readiness and state in review eligibility without touching text assessment', async () => {
    const current = candidate({
      mediaPlan: [approvedHero({ review: null })],
      mediaReviewRevision: 3,
    });
    const { service } = build(current);
    const detail = (await service.detail('candidate-1')) as unknown as {
      mediaPlan: unknown[];
      mediaReviewRevision: number;
      reviewRevision: number;
      humanAssessment: unknown;
      reviewEligibility: {
        canApprove: boolean;
        assessmentCurrent: boolean;
        approvalBlockers: string[];
        mediaReadiness: {
          governed: boolean;
          ready: boolean;
          blockers: Array<{ code: string }>;
        };
      };
    };
    expect(detail.mediaReviewRevision).toBe(3);
    expect(detail.mediaPlan).toHaveLength(1);
    expect(detail.reviewRevision).toBe(1);
    expect(detail.reviewEligibility.assessmentCurrent).toBe(true);
    expect(detail.reviewEligibility.canApprove).toBe(false);
    expect(detail.reviewEligibility.mediaReadiness).toMatchObject({
      governed: true,
      ready: false,
      blockers: [{ code: 'MEDIA_REVIEW_REQUIRED' }],
    });
    expect(detail.reviewEligibility.approvalBlockers.join(' ')).toContain(
      'MEDIA_REVIEW_REQUIRED',
    );
  });

  it('presents legacy candidates as ungoverned with an empty plan', async () => {
    const { service } = build(candidate(), 'other-scope');
    const detail = (await service.detail('candidate-1')) as unknown as {
      mediaPlan: unknown[];
      mediaReviewRevision: number;
      reviewEligibility: {
        canApprove: boolean;
        mediaReadiness: { governed: boolean };
      };
    };
    expect(detail.mediaPlan).toEqual([]);
    expect(detail.mediaReviewRevision).toBe(0);
    expect(detail.reviewEligibility.mediaReadiness.governed).toBe(false);
    expect(detail.reviewEligibility.canApprove).toBe(true);
  });
});

describe('ContentEngineReviewService text edits on media-governed candidates (§30.22 Phase 3A)', () => {
  const edit = (
    service: ContentEngineReviewService,
    draft: Record<string, unknown>,
  ) =>
    service.edit(
      'candidate-1',
      {
        expectedRevision: 1,
        explanation: 'tighten the wording',
        draft,
        factualClaims: ['claim 1'],
      } as never,
      actor,
    );
  const governed = () =>
    candidate({ mediaPlan: [approvedHero()], mediaReviewRevision: 1 });

  it('refuses a text edit that changes a registry media field, so no client URL reaches a governed slot', async () => {
    const { service, candidates } = build(governed());
    await expect(
      edit(service, {
        ...candidate().draft,
        media: {
          type: 'image',
          assets: [{ url: 'https://evil.example/x.png' }],
        },
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'MEDIA_FIELD_REQUIRES_MEDIA_ACTION',
        slotKeys: ['hero'],
      },
    });
    expect(candidates.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('withdraws media approvals on a material question edit and CASes on the media revision', async () => {
    const { service, candidates } = build(governed());
    await edit(service, {
      ...candidate().draft,
      prompt: { ar: 'من فاز بالبطولة؟' },
    });
    const [filter, update] = candidates.findOneAndUpdate.mock
      .calls[0] as unknown as [
      Record<string, unknown>,
      {
        $set: {
          mediaReviewRevision: number;
          mediaPlan: Array<{ review: unknown; asset: { url: string } }>;
        };
        $push: Record<string, unknown>;
      },
    ];
    expect(filter).toMatchObject({ reviewRevision: 1, mediaReviewRevision: 1 });
    expect(update.$set.mediaReviewRevision).toBe(2);
    expect(update.$set.mediaPlan[0].review).toBeNull();
    // Rights acknowledgments concern the asset, not the question; untouched here.
    expect(update.$set.mediaPlan[0].asset.url).toBe(URL_A);
    expect(update.$push.mediaEvents).toMatchObject({
      action: 'media_reviews_invalidated',
      slotKeys: ['hero'],
      details: { reason: 'MATERIAL_QUESTION_EDIT' },
    });
  });

  it('keeps media approvals on a non-material edit, still CASing on the media revision', async () => {
    const { service, candidates } = build(governed());
    await edit(service, { ...candidate().draft, metadata: { notes: 'typo' } });
    const [filter, update] = candidates.findOneAndUpdate.mock
      .calls[0] as unknown as [
      Record<string, unknown>,
      { $set: Record<string, unknown>; $push: Record<string, unknown> },
    ];
    expect(filter).toMatchObject({ mediaReviewRevision: 1 });
    expect(update.$set).not.toHaveProperty('mediaPlan');
    expect(update.$set).not.toHaveProperty('mediaReviewRevision');
    expect(update.$push).not.toHaveProperty('mediaEvents');
  });

  it('leaves legacy edit filters and media fields exactly as before', async () => {
    const legacyDraft = { ...candidate().draft, media: undefined };
    const { service, candidates } = build(
      candidate({ draft: legacyDraft }),
      'other-scope',
    );
    await edit(service, {
      ...legacyDraft,
      prompt: { ar: 'سؤال معدل' },
      media: { type: 'image', assets: [{ url: '/uploads/legacy.png' }] },
    });
    const [filter, update] = candidates.findOneAndUpdate.mock
      .calls[0] as unknown as [
      Record<string, unknown>,
      { $set: Record<string, unknown>; $push: Record<string, unknown> },
    ];
    expect(filter).toEqual({
      candidateId: 'candidate-1',
      reviewRevision: 1,
      publishedContentItemId: null,
    });
    expect(update.$set).not.toHaveProperty('mediaPlan');
    expect(update.$push).not.toHaveProperty('mediaEvents');
  });
});
