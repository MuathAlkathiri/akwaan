import { BadRequestException, ConflictException } from '@nestjs/common';
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
  contextHash: 'ctx-hash-1',
  promptVersion: 'mc-v2',
  provider: 'openai',
  model: 'gpt-4.1-mini',
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

const build = (
  options: {
    current?: Record<string, unknown>;
    updated?: Record<string, unknown> | null;
    publication?: Record<string, unknown> | null;
    screen?: Record<string, unknown>;
    canonicalReferences?: boolean;
    jobOverride?: Record<string, unknown> | null;
    compatibilityBlockers?: Array<{ code: string; message: string }>;
  } = {},
) => {
  const current = options.current ?? candidate();
  const updated = options.updated === undefined ? current : options.updated;
  const hasCanonical = options.canonicalReferences ?? true;
  const candidates = {
    findOne: jest.fn(() => chain(current)),
    findOneAndUpdate: jest.fn(() => chain(updated)),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
  };
  const defaultJob = {
    _id: 'job-1',
    mechanicKey: 'read-your-opponent',
    worldKey: 'world',
    scopeKey: 'scope',
    status: 'awaiting_review',
  };
  const jobs = {
    findById: jest.fn(() =>
      chain(
        options.jobOverride !== undefined
          ? options.jobOverride
          : hasCanonical
            ? defaultJob
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
  const blockers = options.compatibilityBlockers ?? [];
  const compatibility = {
    evaluate: jest.fn(() => ({
      status: blockers.length ? 'INCOMPATIBLE' : 'COMPATIBLE',
      preDraft: {
        readiness: blockers.length ? 'blocked' : 'ready',
        blockers,
        warnings: [],
      },
      usedCanonicalReferences: true,
      deferredChecks: [],
    })),
  };
  const contentItems = { create: jest.fn() };
  const worlds = {
    findBySlug: jest.fn(async () =>
      hasCanonical ? { _id: 'world-id', status: 'active' } : null,
    ),
  };
  const scopes = {
    findBySlugInWorld: jest.fn(async () =>
      hasCanonical
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
      hasCanonical
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

  it('invalidates factual and quality assessments when a material edit is saved and preserves historical snapshot', async () => {
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
        factualClaims: [' updated claim '],
        explanation: 'edited wording',
      } as never,
      actor,
    );

    expect(screen.beginBatch).toHaveBeenCalledTimes(1);
    expect(screen.screen).toHaveBeenCalledWith(
      current.draft,
      { rationale: 'keep' },
      expect.anything(),
    );
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
          lastInvalidatedAssessments: expect.objectContaining({
            invalidatedAtRevision: 2,
            previousRevision: 1,
            factVerification: { state: 'SUPPORTED' },
            qualityEvaluation: { recommendation: 'PASS' },
            humanAssessment: { factualState: 'SUPPORTED', assessedRevision: 1 },
          }),
          reviewStatus: 'pending',
        }),
        $inc: { reviewRevision: 1 },
      }),
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('preserves assessments and advances assessedRevision on a non-material metadata-only edit', async () => {
    const current = candidate({
      factVerification: { state: 'SUPPORTED' },
      qualityEvaluation: { recommendation: 'PASS' },
      humanAssessment: {
        factualState: 'SUPPORTED',
        assessedRevision: 1,
        evidence: [{ url: 'https://example.test/ev' }],
      },
    });
    const { service, candidates } = build({
      current,
      canonicalReferences: true,
    });

    await service.edit(
      'candidate-1',
      {
        expectedRevision: 1,
        draft: {
          ...(current.draft as Record<string, unknown>),
          metadata: { notes: 'admin editorial note', tags: ['tag1'] },
        },
        factualClaims: ['claim 1'],
        explanation: 'Added editorial metadata note only',
      } as never,
      actor,
    );

    expect(candidates.findOneAndUpdate).toHaveBeenCalledWith(
      {
        candidateId: 'candidate-1',
        reviewRevision: 1,
        publishedContentItemId: null,
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          humanAssessment: expect.objectContaining({
            factualState: 'SUPPORTED',
            assessedRevision: 2,
            previousAssessedRevision: 1,
          }),
        }),
        $inc: { reviewRevision: 1 },
        $push: {
          reviewEvents: expect.objectContaining({
            action: 'edited',
            details: expect.objectContaining({
              materialChange: false,
              assessmentsInvalidated: false,
              changedFields: ['draft.metadata'],
            }),
          }),
        },
      }),
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('rejects candidate edits that attempt to retarget world, scope, mechanic, or status', async () => {
    const current = candidate();
    const { service, candidates } = build({ current });

    await expect(
      service.edit(
        'candidate-1',
        {
          expectedRevision: 1,
          draft: {
            ...(current.draft as Record<string, unknown>),
            scopeId: 'different-scope-id',
          },
          factualClaims: ['claim 1'],
          explanation: 'try retargeting scope',
        } as never,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.edit(
        'candidate-1',
        {
          expectedRevision: 1,
          draft: {
            ...(current.draft as Record<string, unknown>),
            status: 'ready',
          },
          factualClaims: ['claim 1'],
          explanation: 'try promoting status',
        } as never,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(candidates.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects duplicate normalized multiple-choice options during edit validation', async () => {
    const current = candidate();
    const { service, candidates } = build({ current });

    await expect(
      service.edit(
        'candidate-1',
        {
          expectedRevision: 1,
          draft: {
            prompt: { ar: 'من فاز؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: 'a', label: { ar: 'الأهلي' } },
                { id: 'b', label: { ar: 'الاهلي!' } },
              ],
              correctOptionId: 'a',
            },
          },
          factualClaims: ['claim 1'],
          explanation: 'duplicate normalized options',
        } as never,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(candidates.findOneAndUpdate).not.toHaveBeenCalled();
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

  it('rejects ACCEPTED_WITH_EVIDENCE when humanAssessment has no recorded evidence URLs', async () => {
    const { service, candidates } = build({
      current: candidate({
        humanAssessment: {
          factualState: 'UNSUPPORTED',
          assessedRevision: 1,
          evidence: [],
        },
      }),
    });

    await expect(
      service.approve(
        'candidate-1',
        {
          expectedRevision: 1,
          explanation: 'approve with evidence override',
          factualOverrideCode: 'ACCEPTED_WITH_EVIDENCE',
          factualOverrideExplanation: 'claimed evidence without url',
        } as never,
        actor,
      ),
    ).rejects.toThrow(
      'ACCEPTED_WITH_EVIDENCE requires at least one recorded evidence URL',
    );
    expect(candidates.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('disallows routine CLAIM_NOT_ANSWER_CRITICAL override on CONTRADICTED assessments', async () => {
    const { service, candidates } = build({
      current: candidate({
        humanAssessment: {
          factualState: 'CONTRADICTED',
          assessedRevision: 1,
          evidence: [{ url: 'https://example.test/ev' }],
        },
      }),
    });

    await expect(
      service.approve(
        'candidate-1',
        {
          expectedRevision: 1,
          explanation: 'approve contradicted',
          factualOverrideCode: 'CLAIM_NOT_ANSWER_CRITICAL',
          factualOverrideExplanation: 'not critical',
        } as never,
        actor,
      ),
    ).rejects.toThrow(
      'CONTRADICTED factual assessment can only be resolved with ACCEPTED_WITH_EVIDENCE',
    );
    expect(candidates.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('fails closed during approval when canonical compatibility has blockers or target provenance is broken', async () => {
    const { service, candidates } = build({
      compatibilityBlockers: [
        { code: 'MECHANIC_EXCLUDED_BY_SCOPE', message: 'Excluded' },
      ],
    });

    await expect(
      service.approve(
        'candidate-1',
        { expectedRevision: 1, explanation: 'approve' } as never,
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
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

  describe('Phase C Final Safety Audit characterization', () => {
    it('rejects human assessment trying to directly mark a CONTRADICTED candidate as SUPPORTED', async () => {
      const { service } = build({
        current: candidate({
          factVerification: { state: 'CONTRADICTED' },
          status: 'fact_blocked',
          factualClaims: ['Claim 1'],
        }),
      });

      await expect(
        service.assess(
          'candidate-1',
          {
            expectedRevision: 0,
            factualState: 'SUPPORTED',
            factualExplanation: 'Reviewer thinks it is supported.',
            evidence: [
              {
                url: 'https://example.test/source',
                title: 'Official correction note',
                note: 'Explicit note explaining why the claim is valid.',
              },
            ],
            quality: {
              correctness: 4,
              mechanicFit: 4,
              clarity: 4,
              multiplayerFit: 4,
              originality: 4,
              explanation: 'Quality is sound.',
            },
          } as never,
          actor,
        ),
      ).rejects.toThrow(
        'Candidate has contradictory automated factual verification; it cannot be marked SUPPORTED directly',
      );
    });

    it('rejects bare evidence URLs without explanatory note on CONTRADICTED assessments', async () => {
      const { service } = build({
        current: candidate({
          factVerification: { state: 'CONTRADICTED' },
          status: 'fact_blocked',
          factualClaims: ['Claim 1'],
        }),
      });

      await expect(
        service.assess(
          'candidate-1',
          {
            expectedRevision: 0,
            factualState: 'CONTRADICTED',
            factualExplanation:
              'Automated verification contradicted the claim.',
            evidence: [{ url: 'https://example.test/unrelated' }],
            quality: {
              correctness: 2,
              mechanicFit: 4,
              clarity: 4,
              multiplayerFit: 4,
              originality: 4,
              explanation: 'Requires factual review.',
            },
          } as never,
          actor,
        ),
      ).rejects.toThrow(
        'Evidence for contradicted claims must include an explanatory title or note',
      );
    });

    it('rejects evidence with out-of-range claimIndex', async () => {
      const { service } = build({
        current: candidate({
          factualClaims: ['Claim 1'],
        }),
      });

      await expect(
        service.assess(
          'candidate-1',
          {
            expectedRevision: 0,
            factualState: 'UNSUPPORTED',
            factualExplanation: 'Verification unsupported.',
            evidence: [
              {
                url: 'https://example.test/source',
                claimIndex: 99,
                note: 'Invalid claim index reference.',
              },
            ],
            quality: {
              correctness: 3,
              mechanicFit: 4,
              clarity: 4,
              multiplayerFit: 4,
              originality: 4,
              explanation: 'Quality explanation.',
            },
          } as never,
          actor,
        ),
      ).rejects.toThrow('is out of bounds for candidate factual claims');
    });

    it('voids prior approval decision and resets reviewStatus to pending on non-material edit after approval', async () => {
      const current = candidate({
        reviewStatus: 'approved',
        reviewRevision: 2,
        humanAssessment: {
          factualState: 'SUPPORTED',
          assessedRevision: 2,
          evidence: [{ url: 'https://example.test/ev' }],
        },
        reviewDecision: {
          decision: 'approved',
          explanation: 'Approved at revision 2',
          revision: 2,
        },
      });
      const { service, candidates } = build({
        current,
        canonicalReferences: true,
      });

      await service.edit(
        'candidate-1',
        {
          expectedRevision: 2,
          draft: {
            ...(current.draft as Record<string, unknown>),
            metadata: { notes: 'Post-approval editorial tag' },
          },
          factualClaims: ['claim 1'],
          explanation: 'Editorial note added post-approval',
        } as never,
        actor,
      );

      expect(candidates.findOneAndUpdate).toHaveBeenCalledWith(
        {
          candidateId: 'candidate-1',
          reviewRevision: 2,
          publishedContentItemId: null,
        },
        expect.objectContaining({
          $set: expect.objectContaining({
            reviewStatus: 'pending',
            reviewDecision: null,
            humanAssessment: expect.objectContaining({
              assessedRevision: 3,
              previousAssessedRevision: 2,
            }),
          }),
          $inc: { reviewRevision: 1 },
          $push: {
            reviewEvents: expect.objectContaining({
              action: 'edited',
              details: expect.objectContaining({
                materialChange: false,
                previousApprovalVoided: true,
              }),
            }),
          },
        }),
        { returnDocument: 'after', runValidators: true },
      );
    });

    it('records automatedContradictionOverridden and originalFactVerification on valid ACCEPTED_WITH_EVIDENCE override', async () => {
      const current = candidate({
        reviewRevision: 1,
        status: 'awaiting_review',
        factualClaims: ['Mercy heals allies'],
        factVerification: { state: 'CONTRADICTED', confidence: 0.9 },
        humanAssessment: {
          factualState: 'CONTRADICTED',
          assessedRevision: 1,
          evidence: [
            {
              url: 'https://example.test/patch-notes',
              claimIndex: 0,
              claimText: 'Mercy heals allies',
              title: 'Official patch note',
              note: 'Patch 2.0 confirms healing behavior overrides initial contradiction.',
            },
          ],
        },
      });
      const { service, candidates } = build({
        current,
        canonicalReferences: true,
      });

      await service.approve(
        'candidate-1',
        {
          expectedRevision: 1,
          explanation:
            'Approving with verified official patch evidence override.',
          factualOverrideCode: 'ACCEPTED_WITH_EVIDENCE',
          factualOverrideExplanation:
            'A newer official patch note resolves the contradicted claim completely.',
        } as never,
        actor,
      );

      expect(candidates.findOneAndUpdate).toHaveBeenCalledWith(
        {
          candidateId: 'candidate-1',
          reviewRevision: 1,
          publishedContentItemId: null,
        },
        expect.objectContaining({
          $set: expect.objectContaining({
            reviewStatus: 'approved',
            reviewDecision: expect.objectContaining({
              decision: 'approved',
              exceptionalOverride: true,
              automatedContradictionOverridden: true,
              factualOverrideCode: 'ACCEPTED_WITH_EVIDENCE',
              originalFactVerification: {
                state: 'CONTRADICTED',
                confidence: 0.9,
              },
            }),
          }),
        }),
        { returnDocument: 'after', runValidators: true },
      );
    });
  });

  describe('Slice 3C Family Compliance Enforcement & Invalidation', () => {
    it('blocks approval and throws ConflictException when candidate has FAMILY_COMPLIANCE_MISMATCH finding', async () => {
      const current = candidate({
        findings: [
          {
            code: 'FAMILY_COMPLIANCE_MISMATCH',
            severity: 'warning',
            message: 'Candidate content breaches assigned family directive',
          },
        ],
      });
      const { service } = build({ current });
      await expect(
        service.approve(
          'candidate-1',
          {
            expectedRevision: 1,
            explanation: 'Trying to approve mismatched candidate',
          } as never,
          actor,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('computeReviewEligibility blocks canApprove when candidate has FAMILY_COMPLIANCE_MISMATCH finding', async () => {
      const current = candidate({
        findings: [
          {
            code: 'FAMILY_COMPLIANCE_MISMATCH',
            severity: 'warning',
            message: 'Candidate content breaches assigned family directive',
          },
        ],
      });
      const { service } = build({ current });
      const presented = await service.detail('candidate-1');
      expect(presented.reviewEligibility.canApprove).toBe(false);
      expect(presented.reviewEligibility.canCreateDraft).toBe(false);
      expect(
        presented.reviewEligibility.approvalBlockers.some((b: string) =>
          b.includes('FAMILY_COMPLIANCE_MISMATCH'),
        ),
      ).toBe(true);
    });

    it('allows approval of candidate with FAMILY_COMPLIANCE_UNVERIFIED recording manual_review in familyCompliance and reviewDecision', async () => {
      const current = candidate({
        findings: [
          {
            code: 'FAMILY_COMPLIANCE_UNVERIFIED',
            severity: 'warning',
            message: 'No automated structural rules for assigned family',
          },
        ],
        authoring: {
          assignedSlot: {
            slotIndex: 0,
            familyKey: 'trivia-history',
          },
        },
      });
      const { service, candidates } = build({ current });
      await service.approve(
        'candidate-1',
        {
          expectedRevision: 1,
          explanation:
            'Human reviewer confirmed candidate matches trivia-history family.',
        } as never,
        actor,
      );
      expect(candidates.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            reviewStatus: 'approved',
            authoring: expect.objectContaining({
              familyCompliance: expect.objectContaining({
                assignedFamilyKey: 'trivia-history',
                isCompliant: true,
                verificationMethod: 'manual_review',
                resolvedByReviewerId: 'reviewer-1',
              }),
            }),
            reviewDecision: expect.objectContaining({
              familyComplianceResolution: expect.objectContaining({
                resolvedByReviewer: true,
                assignedFamilyKey: 'trivia-history',
                reviewerExplanation:
                  'Human reviewer confirmed candidate matches trivia-history family.',
              }),
            }),
          }),
        }),
        expect.anything(),
      );
    });

    it('edit re-evaluates family compliance against modified draft and updates authoring', async () => {
      const current = candidate({
        authoring: {
          assignedSlot: {
            slotIndex: 0,
            familyKey: 'anagram-rearrange',
          },
          familyCompliance: {
            assignedFamilyKey: 'anagram-rearrange',
            isCompliant: false,
            verificationMethod: 'rule_evaluated',
          },
        },
      });
      const { service, candidates } = build({ current });
      await service.edit(
        'candidate-1',
        {
          expectedRevision: 1,
          explanation: 'Fixing anagram prompt and options to match family',
          draft: {
            prompt: { ar: 'رتب الحروف: (س - م - ك)' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'سمك' } },
                { id: '2', label: { ar: 'لحم' } },
              ],
              correctOptionId: '1',
            },
          },
        } as never,
        actor,
      );
      expect(candidates.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            authoring: expect.objectContaining({
              familyCompliance: expect.objectContaining({
                assignedFamilyKey: 'anagram-rearrange',
                isCompliant: true,
                verificationMethod: 'rule_evaluated',
              }),
            }),
          }),
        }),
        expect.anything(),
      );
    });

    it('allows normal approval of legacy V1 candidate without assignedSlot', async () => {
      const current = candidate({
        findings: [],
        authoring: {},
      });
      const { service, candidates } = build({ current });
      await service.approve(
        'candidate-1',
        {
          expectedRevision: 1,
          explanation: 'Approving legacy candidate',
        } as never,
        actor,
      );
      expect(candidates.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            reviewStatus: 'approved',
          }),
        }),
        expect.anything(),
      );
    });
  });
});
