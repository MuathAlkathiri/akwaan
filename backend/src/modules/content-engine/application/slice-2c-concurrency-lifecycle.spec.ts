import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeterministicScreenService } from './deterministic-screen.service';
import { ContentEngineReviewService } from './content-engine-review.service';

const config = { get: () => undefined } as unknown as ConfigService;

function mockQueryChain(result: any) {
  const query: any = {};
  query.sort = jest.fn().mockReturnValue(query);
  query.limit = jest.fn().mockReturnValue(query);
  query.lean = jest.fn().mockReturnValue(query);
  query.select = jest.fn().mockReturnValue(query);
  query.exec = jest.fn().mockResolvedValue(result);
  return query;
}

const chain = <T>(value: T) => ({
  lean: () => ({ exec: async () => value }),
  exec: async () => value,
});

const actor = { id: 'reviewer-1', email: 'reviewer@example.test' } as never;

const sampleCandidate = (overrides: Record<string, unknown> = {}) => ({
  _id: 'cand-db-1',
  candidateId: 'cand-1',
  jobId: 'job-1',
  status: 'awaiting_review',
  reviewRevision: 1,
  reviewStatus: 'pending',
  draft: {
    prompt: { ar: 'ما هي عاصمة إيطاليا؟' },
    answerPayload: {
      mode: 'multiple_choice',
      options: [
        { id: '1', label: { ar: 'روما' } },
        { id: '2', label: { ar: 'ميلانو' } },
      ],
      correctOptionId: '1',
    },
  },
  findings: [],
  factualClaims: [],
  compatibilityEvaluation: { preDraft: { blockers: [] } },
  humanAssessment: {
    factualState: 'SUPPORTED',
    assessedRevision: 1,
    evidence: [{ url: 'https://example.test' }],
  },
  reviewDecision: null,
  reviewEvents: [],
  publishedContentItemId: null,
  ...overrides,
});

describe('Slice 2C Final Hardening — Concurrency Isolation & Publication Safety', () => {
  let screenService: DeterministicScreenService;

  beforeEach(() => {
    screenService = new DeterministicScreenService(config);
  });

  // =========================================================================
  // Cases 1, 2, 3: Job A & Job B Interleaving
  // =========================================================================
  it('1-3. concurrent jobs retain their isolated historical inventory when interleaved', async () => {
    const sessionA = screenService.createSession({
      worldKey: 'world-1',
      scopeKey: 'capitals',
    });
    const sessionB = screenService.createSession({
      worldKey: 'world-1',
      scopeKey: 'science',
    });

    // 1. Job A registers historical inventory for 'capitals' (Paris)
    screenService.registerHistoricalRecords(
      [
        {
          id: 'hist-paris',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'capitals',
          draft: {
            prompt: { ar: 'ما هي عاصمة فرنسا؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'باريس' } },
                { id: '2', label: { ar: 'ليون' } },
              ],
              correctOptionId: '1',
            },
          },
        },
      ],
      sessionA,
    );

    // 2. Job B interleaves while Job A is in progress, registering records for 'science'
    screenService.registerHistoricalRecords(
      [
        {
          id: 'hist-hydrogen',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'science',
          draft: {
            prompt: { ar: 'ما هو العنصر الأكثر وفرة في الكون؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'الهيدروجين' } },
                { id: '2', label: { ar: 'الهيليوم' } },
              ],
              correctOptionId: '1',
            },
          },
        },
      ],
      sessionB,
    );

    // 3. Job A resumes: screens a candidate asking for Paris
    const candParis = {
      prompt: { ar: 'ما عاصمة فرنسا؟' },
      answerPayload: {
        mode: 'multiple_choice',
        options: [
          { id: 'a', label: { ar: 'باريس' } },
          { id: 'b', label: { ar: 'مارسيليا' } },
        ],
        correctOptionId: 'a',
      },
    };

    const resA = screenService.screen(candParis, null, {
      scopeKey: 'capitals',
      worldKey: 'world-1',
      session: sessionA,
    });

    // Job A retained its historical inventory: detects the Paris duplicate!
    expect(resA.passed).toBe(false);
    expect(
      resA.findings.some((f) => f.code === 'DUPLICATE_HISTORICAL_CONTENT'),
    ).toBe(true);
    // Job A was NOT contaminated with Job B's scope
    expect(
      resA.findings.some(
        (f) => f.code === 'HISTORICAL_INVENTORY_SCOPE_MISMATCH',
      ),
    ).toBe(false);

    // Job B screens Paris question: for Job B (science), Paris is NOT a duplicate
    const resB = screenService.screen(candParis, null, {
      scopeKey: 'science',
      worldKey: 'world-1',
      session: sessionB,
    });
    expect(resB.passed).toBe(true);
    expect(
      resB.findings.some((f) => f.code === 'DUPLICATE_HISTORICAL_CONTENT'),
    ).toBe(false);
  });

  // =========================================================================
  // Case 4: Batch duplicates remain detectable after interleaving
  // =========================================================================
  it('4. batch duplicates remain detectable in Job A after Job B interleaves', () => {
    const sessionA = screenService.createSession({ scopeKey: 'capitals' });
    const sessionB = screenService.createSession({ scopeKey: 'science' });

    screenService.beginBatch(undefined, undefined, { session: sessionA });
    screenService.beginBatch(undefined, undefined, { session: sessionB });

    const candMadrid1 = {
      prompt: { ar: 'ما هي عاصمة إسبانيا؟' },
      answerPayload: {
        mode: 'multiple_choice',
        options: [
          { id: '1', label: { ar: 'مدريد' } },
          { id: '2', label: { ar: 'برشلونة' } },
        ],
        correctOptionId: '1',
      },
    };

    // Job A screens first candidate
    const resA1 = screenService.screen(candMadrid1, null, {
      session: sessionA,
      scopeKey: 'capitals',
    });
    expect(resA1.passed).toBe(true);

    // Job B interleaves and screens its own candidate
    const candScience = {
      prompt: { ar: 'ما هو رمز الماء الكيميائي؟' },
      answerPayload: {
        mode: 'multiple_choice',
        options: [
          { id: '1', label: { ar: 'H2O' } },
          { id: '2', label: { ar: 'CO2' } },
        ],
        correctOptionId: '1',
      },
    };
    const resB1 = screenService.screen(candScience, null, {
      session: sessionB,
      scopeKey: 'science',
    });
    expect(resB1.passed).toBe(true);

    // Job A screens duplicate of Madrid
    const candMadrid2 = {
      prompt: { ar: 'ما عاصمة إسبانيا؟' },
      answerPayload: {
        mode: 'multiple_choice',
        options: [
          { id: 'a', label: { ar: 'مدريد' } },
          { id: 'b', label: { ar: 'إشبيلية' } },
        ],
        correctOptionId: 'a',
      },
    };
    const resA2 = screenService.screen(candMadrid2, null, {
      session: sessionA,
      scopeKey: 'capitals',
    });

    // In-batch duplicate is successfully detected!
    expect(resA2.passed).toBe(false);
    expect(resA2.findings.some((f) => f.code === 'DUPLICATE_IN_BATCH')).toBe(
      true,
    );
  });

  // =========================================================================
  // Case 5: Concurrent Review Studio edit does not clear Job A state
  // =========================================================================
  it('5. concurrent Review Studio edit session does not clear or affect active generation job session', () => {
    const jobSession = screenService.createSession({ scopeKey: 'capitals' });
    screenService.registerHistoricalRecords(
      [
        {
          id: 'hist-rome',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'capitals',
          draft: {
            prompt: { ar: 'ما هي عاصمة إيطاليا؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'روما' } },
                { id: '2', label: { ar: 'ميلانو' } },
              ],
              correctOptionId: '1',
            },
          },
        },
      ],
      jobSession,
    );

    // Reviewer edits a candidate in an isolated review session
    const reviewEditSession = screenService.createSession({
      scopeKey: 'leaders',
    });
    screenService.registerHistoricalRecords([], reviewEditSession);
    screenService.beginBatch(undefined, undefined, {
      session: reviewEditSession,
    });

    // Job A resumes screening
    const candRome = {
      prompt: { ar: 'ما عاصمة إيطاليا؟' },
      answerPayload: {
        mode: 'multiple_choice',
        options: [
          { id: 'a', label: { ar: 'روما' } },
          { id: 'b', label: { ar: 'نابولي' } },
        ],
        correctOptionId: 'a',
      },
    };

    const resJob = screenService.screen(candRome, null, {
      session: jobSession,
      scopeKey: 'capitals',
    });

    expect(resJob.passed).toBe(false);
    expect(
      resJob.findings.some((f) => f.code === 'DUPLICATE_HISTORICAL_CONTENT'),
    ).toBe(true);
  });

  // =========================================================================
  // Cases 6 & 7: Incomplete historical inventory blocks approval & createDraft
  // =========================================================================
  it('6-7. incomplete historical inventory blocks approval and createDraft', async () => {
    const incompleteCandidate = sampleCandidate({
      findings: [
        {
          code: 'HISTORICAL_INVENTORY_UNAVAILABLE',
          severity: 'warning',
          message: 'Historical retrieval failed due to DB timeout',
        },
      ],
    });

    const candidates = {
      findOne: jest.fn(() => chain(incompleteCandidate)),
      findOneAndUpdate: jest.fn(() => chain(incompleteCandidate)),
    };
    const jobs = {
      findById: jest.fn(() =>
        chain({
          _id: 'job-1',
          worldKey: 'w',
          scopeKey: 's',
          mechanicKey: 'read-your-opponent',
          status: 'awaiting_review',
        }),
      ),
    };
    const publications = { findOne: jest.fn(() => chain(null)) };
    const compatibility = {
      evaluate: jest.fn(() => ({
        preDraft: { blockers: [], warnings: [] },
      })),
    };
    const contentItems = { create: jest.fn() };
    const worlds = {
      findBySlug: jest.fn(async () => ({ _id: 'w-id', status: 'active' })),
    };
    const scopes = {
      findBySlugInWorld: jest.fn(async () => ({
        _id: 's-id',
        worldId: 'w-id',
        name: 'Scope',
        slug: 's',
        status: 'active',
        excludedChallengeTypeIds: [],
      })),
    };
    const challengeTypes = {
      findBySlug: jest.fn(async () => ({
        _id: 'c-id',
        name: 'Type',
        slug: 'read-your-opponent',
        answerMode: 'multiple_choice',
      })),
    };

    const reviewService = new ContentEngineReviewService(
      candidates as any,
      jobs as any,
      {} as any,
      publications as any,
      { startSession: jest.fn() } as any,
      screenService,
      compatibility as any,
      contentItems as any,
      worlds as any,
      scopes as any,
      challengeTypes as any,
    );

    // 6. Approval is blocked
    await expect(
      reviewService.approve(
        'cand-1',
        { expectedRevision: 1, explanation: 'Human approval' } as any,
        actor,
      ),
    ).rejects.toThrow(ConflictException);

    // 7. createDraft is blocked
    await expect(reviewService.createDraft('cand-1', 1, actor)).rejects.toThrow(
      ConflictException,
    );
  });

  // =========================================================================
  // Cases 8 & 9: Re-screen resolution & failure preservation
  // =========================================================================
  it('8. successful re-screen resolves an incomplete finding', async () => {
    const candidateWithWarning = sampleCandidate({
      findings: [
        {
          code: 'HISTORICAL_INVENTORY_UNAVAILABLE',
          severity: 'warning',
          message: 'Historical retrieval failed',
        },
      ],
    });

    let storedCandidate = { ...candidateWithWarning };
    const candidates = {
      findOne: jest.fn(() => chain(storedCandidate)),
      findOneAndUpdate: jest.fn((_, update) => {
        storedCandidate = {
          ...storedCandidate,
          ...update.$set,
          reviewRevision: (storedCandidate.reviewRevision ?? 1) + 1,
        };
        return chain(storedCandidate);
      }),
    };
    const jobs = {
      findById: jest.fn(() =>
        chain({
          _id: 'job-1',
          worldKey: 'world-1',
          scopeKey: 'capitals',
          mechanicKey: 'read-your-opponent',
        }),
      ),
    };
    const publications = { findOne: jest.fn(() => chain(null)) };
    const worlds = {
      findBySlug: jest.fn(async () => ({ _id: 'w-1', status: 'active' })),
    };
    const scopes = {
      findBySlugInWorld: jest.fn(async () => ({
        _id: 's-1',
        worldId: 'w-1',
        name: 'Scope',
        slug: 'capitals',
        status: 'active',
        excludedChallengeTypeIds: [],
      })),
    };
    const challengeTypes = {
      findBySlug: jest.fn(async () => ({
        _id: 'c-1',
        slug: 'read-your-opponent',
        answerMode: 'multiple_choice',
      })),
    };

    // Mongoose models for screenService to load historical scope successfully
    const mockContentItems = {
      find: jest.fn().mockReturnValue(mockQueryChain([])),
    };
    const mockCandidates = {
      find: jest.fn().mockReturnValue(mockQueryChain([])),
    };
    const mockPublications = {
      find: jest.fn().mockReturnValue(mockQueryChain([])),
    };
    const mockJobs = { find: jest.fn().mockReturnValue(mockQueryChain([])) };
    const mockWorlds = {
      findOne: jest
        .fn()
        .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'world-1' })),
    };
    const mockScopes = {
      findOne: jest
        .fn()
        .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 'capitals' })),
    };

    const screenWithDb = new DeterministicScreenService(
      config,
      mockContentItems as any,
      mockCandidates as any,
      mockPublications as any,
      mockJobs as any,
      mockWorlds as any,
      mockScopes as any,
    );

    const reviewService = new ContentEngineReviewService(
      candidates as any,
      jobs as any,
      {} as any,
      publications as any,
      { startSession: jest.fn() } as any,
      screenWithDb,
      { evaluate: jest.fn(() => ({ preDraft: { blockers: [] } })) } as any,
      { create: jest.fn() } as any,
      worlds as any,
      scopes as any,
      challengeTypes as any,
    );

    const res = await reviewService.rescreenCandidate('cand-1', 1, actor);
    expect(
      res.findings?.some((f) => f.code === 'HISTORICAL_INVENTORY_UNAVAILABLE'),
    ).toBe(false);
  });

  it('9. failed re-screen preserves incomplete status', async () => {
    const candidateWithWarning = sampleCandidate({
      findings: [
        {
          code: 'HISTORICAL_INVENTORY_UNAVAILABLE',
          severity: 'warning',
          message: 'Historical retrieval failed',
        },
      ],
    });

    const candidates = {
      findOne: jest.fn(() => chain(candidateWithWarning)),
      findOneAndUpdate: jest.fn((_, update) =>
        chain({
          ...candidateWithWarning,
          findings: update.$set.findings,
          reviewRevision: 2,
        }),
      ),
    };
    const jobs = {
      findById: jest.fn(() =>
        chain({
          _id: 'job-1',
          worldKey: 'world-1',
          scopeKey: 'capitals',
          mechanicKey: 'read-your-opponent',
        }),
      ),
    };
    const worlds = {
      findBySlug: jest.fn(async () => ({ _id: 'w-1', status: 'active' })),
    };
    const scopes = {
      findBySlugInWorld: jest.fn(async () => ({
        _id: 's-1',
        worldId: 'w-1',
        slug: 'capitals',
        status: 'active',
        excludedChallengeTypeIds: [],
      })),
    };
    const challengeTypes = {
      findBySlug: jest.fn(async () => ({
        _id: 'c-1',
        slug: 'read-your-opponent',
        answerMode: 'multiple_choice',
      })),
    };

    // Unconfigured models -> screenService loadHistoricalScope returns UNAVAILABLE
    const screenFailing = new DeterministicScreenService(config);

    const reviewService = new ContentEngineReviewService(
      candidates as any,
      jobs as any,
      {} as any,
      { findOne: jest.fn(() => chain(null)) } as any,
      { startSession: jest.fn() } as any,
      screenFailing,
      { evaluate: jest.fn(() => ({ preDraft: { blockers: [] } })) } as any,
      { create: jest.fn() } as any,
      worlds as any,
      scopes as any,
      challengeTypes as any,
    );

    const res = await reviewService.rescreenCandidate('cand-1', 1, actor);
    expect(
      res.findings?.some((f) => f.code === 'HISTORICAL_INVENTORY_UNAVAILABLE'),
    ).toBe(true);
  });

  // =========================================================================
  // Case 10: Human edit cannot bypass historical duplicate detection
  // =========================================================================
  it('10. human edit cannot bypass historical duplicate detection', async () => {
    const currentCandidate = sampleCandidate();

    let storedCandidate = { ...currentCandidate };

    const candidates = {
      findOne: jest.fn(() => chain(storedCandidate)),
      findOneAndUpdate: jest.fn((_, update) => {
        storedCandidate = {
          ...storedCandidate,
          ...update.$set,
          reviewRevision: (storedCandidate.reviewRevision ?? 1) + 1,
        };
        return chain(storedCandidate);
      }),
    };
    const jobs = {
      findById: jest.fn(() =>
        chain({
          _id: 'job-1',
          worldKey: 'world-1',
          scopeKey: 'capitals',
          mechanicKey: 'read-your-opponent',
        }),
      ),
    };

    // Canonical item in DB has Cairo
    const canonicalItem = {
      _id: 'item-cairo',
      status: 'ready',
      prompt: { ar: 'ما هي عاصمة مصر؟' },
      answerPayload: {
        mode: 'multiple_choice',
        options: [
          { id: '1', label: { ar: 'القاهرة' } },
          { id: '2', label: { ar: 'الإسكندرية' } },
        ],
        correctOptionId: '1',
      },
    };

    const mockContentItems = {
      find: jest.fn().mockReturnValue(mockQueryChain([canonicalItem])),
    };
    const mockCandidates = {
      find: jest.fn().mockReturnValue(mockQueryChain([])),
    };
    const mockPublications = {
      find: jest.fn().mockReturnValue(mockQueryChain([])),
    };
    const mockJobs = { find: jest.fn().mockReturnValue(mockQueryChain([])) };
    const mockWorlds = {
      findOne: jest
        .fn()
        .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'world-1' })),
    };
    const mockScopes = {
      findOne: jest
        .fn()
        .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 'capitals' })),
    };

    const screenWithDb = new DeterministicScreenService(
      config,
      mockContentItems as any,
      mockCandidates as any,
      mockPublications as any,
      mockJobs as any,
      mockWorlds as any,
      mockScopes as any,
    );

    const reviewService = new ContentEngineReviewService(
      candidates as any,
      jobs as any,
      {} as any,
      { findOne: jest.fn(() => chain(null)) } as any,
      { startSession: jest.fn() } as any,
      screenWithDb,
      { evaluate: jest.fn(() => ({ preDraft: { blockers: [] } })) } as any,
      { create: jest.fn() } as any,
      {
        findBySlug: jest.fn(async () => ({ _id: 'w-1', status: 'active' })),
      } as any,
      {
        findBySlugInWorld: jest.fn(async () => ({
          _id: 's-1',
          worldId: 'w-1',
          slug: 'capitals',
          status: 'active',
          excludedChallengeTypeIds: [],
        })),
      } as any,
      {
        findBySlug: jest.fn(async () => ({
          _id: 'c-1',
          slug: 'read-your-opponent',
          answerMode: 'multiple_choice',
        })),
      } as any,
    );

    // Reviewer edits candidate to duplicate Cairo!
    const editedDraft = {
      prompt: { ar: 'ما عاصمة مصر؟' },
      answerPayload: {
        mode: 'multiple_choice',
        options: [
          { id: 'a', label: { ar: 'القاهرة' } },
          { id: 'b', label: { ar: 'الجيزة' } },
        ],
        correctOptionId: 'a',
      },
    };

    const res = await reviewService.edit(
      'cand-1',
      {
        expectedRevision: 1,
        draft: editedDraft,
        explanation: 'Changing question to Cairo',
      } as any,
      actor,
    );

    // The edit is caught by deduplication screen!
    expect(
      res.findings?.some((f) => f.code === 'DUPLICATE_HISTORICAL_CONTENT'),
    ).toBe(true);
    expect(res.status).toBe('screened_reject');
  });

  // =========================================================================
  // Case 11: Self-comparison is excluded
  // =========================================================================
  it('11. self-comparison is excluded during screening and edit', () => {
    const session = screenService.createSession({ scopeKey: 'capitals' });
    screenService.registerHistoricalRecords(
      [
        {
          id: 'cand-self',
          sourceType: 'APPROVED_CANDIDATE',
          scopeKey: 'capitals',
          draft: {
            prompt: { ar: 'ما هي عاصمة إيطاليا؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'روما' } },
                { id: '2', label: { ar: 'ميلانو' } },
              ],
              correctOptionId: '1',
            },
          },
        },
      ],
      session,
    );

    // Screening with candidateId === 'cand-self'
    const res = screenService.screen(
      {
        prompt: { ar: 'ما هي عاصمة إيطاليا؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: '1', label: { ar: 'روما' } },
            { id: '2', label: { ar: 'ميلانو' } },
          ],
          correctOptionId: '1',
        },
      },
      null,
      { candidateId: 'cand-self', session, scopeKey: 'capitals' },
    );

    // Excluded from self-comparison: passes clean
    expect(res.passed).toBe(true);
    expect(
      res.findings.some((f) => f.code === 'DUPLICATE_APPROVED_CANDIDATE'),
    ).toBe(false);
  });

  // =========================================================================
  // Case 12: Existing approval events and revisions remain consistent
  // =========================================================================
  it('12. approval events and revision increments remain strictly consistent', async () => {
    const candidate = sampleCandidate();
    const updateSpy = jest.fn((_, update) =>
      chain({
        ...candidate,
        ...update.$set,
        reviewRevision: 2,
      }),
    );
    const candidates = {
      findOne: jest.fn(() => chain(candidate)),
      findOneAndUpdate: updateSpy,
    };

    const reviewService = new ContentEngineReviewService(
      candidates as any,
      {
        findById: jest.fn(() =>
          chain({
            _id: 'job-1',
            worldKey: 'w',
            scopeKey: 's',
            mechanicKey: 'm',
          }),
        ),
      } as any,
      {} as any,
      { findOne: jest.fn(() => chain(null)) } as any,
      { startSession: jest.fn() } as any,
      screenService,
      { evaluate: jest.fn(() => ({ preDraft: { blockers: [] } })) } as any,
      { create: jest.fn() } as any,
      {
        findBySlug: jest.fn(async () => ({ _id: 'w-1', status: 'active' })),
      } as any,
      {
        findBySlugInWorld: jest.fn(async () => ({
          _id: 's-1',
          worldId: 'w-1',
          slug: 's',
          status: 'active',
          excludedChallengeTypeIds: [],
        })),
      } as any,
      {
        findBySlug: jest.fn(async () => ({
          _id: 'c-1',
          slug: 'm',
          answerMode: 'multiple_choice',
        })),
      } as any,
    );

    await reviewService.approve(
      'cand-1',
      { expectedRevision: 1, explanation: 'Human approval reason' } as any,
      actor,
    );

    expect(updateSpy).toHaveBeenCalledWith(
      {
        candidateId: 'cand-1',
        reviewRevision: 1,
        publishedContentItemId: null,
      },
      expect.objectContaining({
        $inc: { reviewRevision: 1 },
        $push: expect.objectContaining({
          reviewEvents: expect.objectContaining({
            action: 'approved',
            revision: 2,
            actorId: 'reviewer-1',
          }),
        }),
      }),
      { returnDocument: 'after', runValidators: true },
    );
  });

  // =========================================================================
  // Case 13: Existing structural blocking remains intact
  // =========================================================================
  it('13. structural blocking remains strictly intact', () => {
    const noPrompt = screenService.screen({
      answerPayload: { mode: 'multiple_choice', options: [] },
    });
    expect(noPrompt.passed).toBe(false);
    expect(noPrompt.findings.some((f) => f.code === 'PROMPT_REQUIRED')).toBe(
      true,
    );

    const leakage = screenService.screen({
      prompt: { ar: 'هل الرياض هي عاصمة السعودية؟' },
      answerPayload: {
        mode: 'multiple_choice',
        options: [
          { id: '1', label: { ar: 'الرياض' } },
          { id: '2', label: { ar: 'جدة' } },
        ],
        correctOptionId: '1',
      },
    });
    expect(leakage.passed).toBe(false);
    expect(leakage.findings.some((f) => f.code === 'ANSWER_LEAKAGE')).toBe(
      true,
    );
  });

  // =========================================================================
  // Case 14: Cross-Scope matches remain advisory
  // =========================================================================
  it('14. cross-scope duplicate matches produce warning advisory and do not block', () => {
    const session = screenService.createSession();
    screenService.registerHistoricalRecords(
      [
        {
          id: 'hist-asia',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'asian-geography',
          draft: {
            prompt: { ar: 'ما هي عاصمة اليابان؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'طوكيو' } },
                { id: '2', label: { ar: 'أوساكا' } },
              ],
              correctOptionId: '1',
            },
          },
        },
      ],
      session,
    );

    const res = screenService.screen(
      {
        prompt: { ar: 'ما عاصمة اليابان؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'طوكيو' } },
            { id: 'b', label: { ar: 'كيوتو' } },
          ],
          correctOptionId: 'a',
        },
      },
      null,
      { scopeKey: 'world-history', session },
    );

    expect(res.passed).toBe(true);
    const advisory = res.findings.find(
      (f) => f.code === 'CROSS_SCOPE_ADVISORY',
    );
    expect(advisory).toBeDefined();
    expect(advisory?.severity).toBe('warning');
  });

  // =========================================================================
  // Case 15: Retry/resume behavior is safe
  // =========================================================================
  it('15. candidates with incomplete historical checks are safely re-screened on retry/resume', () => {
    const staleCandidate = sampleCandidate({
      status: 'screened_pass',
      findings: [
        {
          code: 'HISTORICAL_INVENTORY_UNAVAILABLE',
          severity: 'warning',
          message: 'Previous run had DB timeout',
        },
      ],
    });

    const session = screenService.createSession({ scopeKey: 'capitals' });
    // Recovered DB inventory has Rome
    screenService.registerHistoricalRecords(
      [
        {
          id: 'hist-rome',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'capitals',
          draft: {
            prompt: { ar: 'ما هي عاصمة إيطاليا؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'روما' } },
                { id: '2', label: { ar: 'ميلانو' } },
              ],
              correctOptionId: '1',
            },
          },
        },
      ],
      session,
    );

    // During orchestrator resume, candidate is re-screened
    const res = screenService.screen(staleCandidate.draft, null, {
      scopeKey: 'capitals',
      session,
    });

    // Now correctly blocked as a duplicate against the recovered inventory!
    expect(res.passed).toBe(false);
    expect(
      res.findings?.some((f) => f.code === 'DUPLICATE_HISTORICAL_CONTENT'),
    ).toBe(true);
    expect(
      res.findings.some((f) => f.code === 'HISTORICAL_INVENTORY_UNAVAILABLE'),
    ).toBe(false);
  });
});
