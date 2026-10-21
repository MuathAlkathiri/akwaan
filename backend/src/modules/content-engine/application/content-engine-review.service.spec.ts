import { ConflictException } from '@nestjs/common';
import { ContentEngineReviewService } from './content-engine-review.service';

const chain = <T>(value: T) => ({
  lean: () => ({ exec: async () => value }),
  exec: async () => value,
});

const actor = { id: 'reviewer-1', email: 'reviewer@example.test' } as never;

const candidate = (overrides: Record<string, unknown> = {}) => ({
  _id: 'candidate-db-id',
  candidateId: 'candidate-1',
  jobId: 'job-1',
  ordinal: 0,
  status: 'awaiting_review',
  draft: {
    prompt: { ar: 'من فاز؟' },
    answerPayload: {
      mode: 'multiple_choice',
      options: [
        { id: 'a', label: { ar: 'أ' } },
        { id: 'b', label: { ar: 'ب' } },
      ],
      correctOptionId: 'a',
    },
  },
  findings: [],
  reviewRevision: 1,
  reviewStatus: 'pending',
  compatibilityEvaluation: { preDraft: { blockers: [] } },
  humanAssessment: {
    factualState: 'SUPPORTED',
    assessedRevision: 1,
  },
  publishedContentItemId: null,
  reviewEvents: [],
  ...overrides,
});

const build = (
  options: {
    current?: Record<string, unknown>;
    updated?: Record<string, unknown> | null;
    publication?: Record<string, unknown> | null;
    screen?: Record<string, unknown>;
    canonicalReferences?: boolean;
  } = {},
) => {
  const current = options.current ?? candidate();
  const updated = options.updated === undefined ? current : options.updated;
  const candidates = {
    findOne: jest.fn(() => chain(current)),
    findOneAndUpdate: jest.fn(() => chain(updated)),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
  };
  const jobs = {
    findById: jest.fn(() =>
      chain(
        options.canonicalReferences
          ? {
              _id: 'job-1',
              mechanicKey: 'read-your-opponent',
              worldKey: 'world',
              scopeKey: 'scope',
              status: 'awaiting_review',
            }
          : null,
      ),
    ),
  };
  const publications = {
    findOne: jest.fn(() => chain(options.publication ?? null)),
  };
  const screen = {
    beginBatch: jest.fn(),
    screen: jest.fn(() => options.screen ?? { passed: true, findings: [] }),
  };
  const compatibility = {
    evaluate: jest.fn(() => ({
      status: 'DEFERRED',
      preDraft: { readiness: 'ready', blockers: [], warnings: [] },
      usedCanonicalReferences: true,
      deferredChecks: [],
    })),
  };
  const contentItems = { create: jest.fn() };
  const worlds = {
    findBySlug: jest.fn(async () =>
      options.canonicalReferences
        ? { _id: 'world-id', status: 'active' }
        : null,
    ),
  };
  const scopes = {
    findBySlugInWorld: jest.fn(async () =>
      options.canonicalReferences
        ? {
            _id: 'scope-id',
            worldId: 'world-id',
            name: 'Scope',
            slug: 'scope',
            status: 'active',
            excludedChallengeTypeIds: [],
          }
        : null,
    ),
  };
  const challengeTypes = {
    findBySlug: jest.fn(async () =>
      options.canonicalReferences
        ? {
            _id: 'challenge-id',
            name: 'Read Your Opponent',
            slug: 'read-your-opponent',
            family: 'RYO',
            itemStructure: 'discrete-triple',
            answerMode: 'ryo',
            defaultPresentation: { inputType: 'multiple-choice' },
            scoringRuleId: 'ryo-payoff-matrix',
            status: 'active',
          }
        : null,
    ),
  };
  const service = new ContentEngineReviewService(
    candidates as never,
    jobs as never,
    {} as never,
    publications as never,
    {} as never,
    screen as never,
    compatibility as never,
    contentItems as never,
    worlds as never,
    scopes as never,
    challengeTypes as never,
  );
  return { service, candidates, publications, screen, compatibility };
};

describe('ContentEngineReviewService enforcement characterization', () => {
  it('rejects an approval when the reviewer revision is stale', async () => {
    const { service, candidates } = build({
      current: candidate({
        reviewRevision: 2,
        humanAssessment: { factualState: 'SUPPORTED', assessedRevision: 2 },
      }),
      updated: null,
    });

    await expect(
      service.approve(
        'candidate-1',
        { expectedRevision: 1, explanation: 'stale' } as never,
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(candidates.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: 'candidate-1',
        reviewRevision: 1,
        publishedContentItemId: null,
      }),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it('invalidates factual and quality assessments when an edit is saved', async () => {
    const current = candidate({
      authoring: { stepsFromMin: 3, rationale: 'keep' },
      factVerification: { state: 'SUPPORTED' },
      qualityEvaluation: { recommendation: 'PASS' },
      humanAssessment: { factualState: 'SUPPORTED', assessedRevision: 1 },
    });
    const { service, candidates, screen, compatibility } = build({
      current,
      canonicalReferences: true,
    });

    await service.edit(
      'candidate-1',
      {
        expectedRevision: 1,
        draft: current.draft,
        factualClaims: [' claim '],
        explanation: 'edited wording',
      } as never,
      actor,
    );

    expect(screen.beginBatch).toHaveBeenCalledTimes(1);
    expect(screen.screen).toHaveBeenCalledWith(current.draft, {
      rationale: 'keep',
    });
    expect(compatibility.evaluate).toHaveBeenCalled();
    expect(candidates.findOneAndUpdate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        reviewRevision: 1,
        publishedContentItemId: null,
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          factVerification: null,
          qualityEvaluation: null,
          humanAssessment: null,
          reviewStatus: 'pending',
        }),
        $inc: { reviewRevision: 1 },
      }),
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('requires an explicit factual override for non-supported assessments', async () => {
    const { service, candidates } = build({
      current: candidate({
        humanAssessment: {
          factualState: 'UNSUPPORTED',
          assessedRevision: 1,
        },
      }),
    });

    await expect(
      service.approve(
        'candidate-1',
        { expectedRevision: 1, explanation: 'approve anyway' } as never,
        actor,
      ),
    ).rejects.toThrow(
      'UNSUPPORTED factual assessment requires explicit resolution',
    );
    expect(candidates.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('prevents rejected candidates from creating canonical drafts', async () => {
    const { service } = build({
      current: candidate({ reviewStatus: 'rejected' }),
    });

    await expect(service.createDraft('candidate-1', 1, actor)).rejects.toThrow(
      'Rejected candidates cannot create drafts',
    );
  });

  it('returns the existing publication instead of creating a duplicate draft', async () => {
    const { service, publications } = build({
      publication: { contentItemId: 'content-1' },
    });

    await expect(service.createDraft('candidate-1', 1, actor)).resolves.toEqual(
      {
        contentItemId: 'content-1',
        status: 'draft',
        alreadyCreated: true,
      },
    );
    expect(publications.findOne).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
    });
  });
});
