/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { ContentItemStatus } from '../../world-content/domain/world-content.constants';
import { HistoricalCoverageService } from './historical-coverage.service';
import { AuthoringContextService } from './authoring-context.service';

const ROOT = resolve(__dirname, '../../../../..');

const mockQuery = <T>(result: T) => ({
  lean: jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue(result),
  }),
  exec: jest.fn().mockResolvedValue(result),
});

const rejectingQuery = (error: Error) => ({
  lean: jest.fn().mockReturnValue({
    exec: jest.fn().mockRejectedValue(error),
  }),
  exec: jest.fn().mockRejectedValue(error),
});

describe('HistoricalCoverageService (Slice 2A Final Closure)', () => {
  let service: HistoricalCoverageService;
  let authoringContext: AuthoringContextService;

  let contentItemsModel: any;
  let candidatesModel: any;
  let publicationsModel: any;
  let jobsModel: any;
  let worldsModel: any;
  let scopesModel: any;
  let challengeTypesModel: any;

  const puzzleScopeId = new Types.ObjectId('660000000000000000000001');
  const ctMovingXoId = new Types.ObjectId('660000000000000000000010');
  const ctRyoId = new Types.ObjectId('660000000000000000000011');
  const ctBombId = new Types.ObjectId('660000000000000000000012');

  const standardScope = {
    _id: puzzleScopeId,
    slug: 'wordplay-letters',
    worldId: new Types.ObjectId('660000000000000000000000'),
    name: 'Wordplay & Letters',
  };
  const standardWorld = {
    _id: new Types.ObjectId('660000000000000000000000'),
    slug: 'puzzles',
  };

  const standardChallengeTypes = [
    { _id: ctMovingXoId, slug: 'moving-xo' },
    { _id: ctRyoId, slug: 'read-your-opponent' },
    { _id: ctBombId, slug: 'bomb' },
  ];

  beforeEach(() => {
    authoringContext = new AuthoringContextService({
      get: (key: string) =>
        key === 'ENGINE_AUTHORING_ROOT' ? ROOT : undefined,
    } as unknown as ConfigService);

    scopesModel = {
      findOne: jest.fn().mockReturnValue(mockQuery(standardScope)),
    };

    worldsModel = {
      findOne: jest.fn().mockReturnValue(mockQuery(standardWorld)),
    };

    challengeTypesModel = {
      find: jest.fn().mockReturnValue(mockQuery(standardChallengeTypes)),
    };

    contentItemsModel = {
      find: jest.fn().mockReturnValue(mockQuery([])),
    };

    publicationsModel = {
      find: jest.fn().mockReturnValue(mockQuery([])),
    };

    jobsModel = {
      find: jest.fn().mockReturnValue(mockQuery([])),
    };

    candidatesModel = {
      find: jest.fn().mockReturnValue(mockQuery([])),
    };

    service = new HistoricalCoverageService(
      contentItemsModel,
      candidatesModel,
      publicationsModel,
      jobsModel,
      worldsModel,
      scopesModel,
      challengeTypesModel,
      authoringContext,
    );
  });

  const request = {
    worldKey: 'puzzles',
    scopeKey: 'wordplay-letters',
  };

  const trustedApproval = (
    candidateId: string,
    jobId: string,
    contentItemId: string | null,
    reviewRevision = 3,
    decisionRevision = 2,
  ) => ({
    candidateId,
    jobId,
    reviewStatus: 'approved',
    status: 'awaiting_review',
    reviewRevision,
    publishedContentItemId: contentItemId,
    reviewDecision: {
      decision: 'approved',
      reviewerId: 'admin-1',
      reviewerEmail: 'admin@example.test',
      revision: decisionRevision,
    },
    reviewEvents: [
      {
        action: 'approved',
        actorId: 'admin-1',
        actorEmail: 'admin@example.test',
        revision: decisionRevision,
      },
    ],
    authoring: { familyKey: 'plural-form' },
  });

  const publication = (
    candidateId: string,
    jobId: string,
    contentItemId: string,
    reviewRevision = 2,
  ) => ({
    candidateId,
    jobId,
    reviewRevision,
    contentItemId,
    createdBy: 'admin-1',
    createdByEmail: 'admin@example.test',
  });

  // 1. READY without human approval evidence
  it('1. counts READY without human approval evidence as operational and playable, but humanApproved: 0 and approvalUnknown: 1', async () => {
    const readyItem = {
      _id: new Types.ObjectId('660000000000000000000101'),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.READY,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: { familyKey: 'plural-form' },
    };
    contentItemsModel.find.mockReturnValue(mockQuery([readyItem]));
    publicationsModel.find.mockReturnValue(mockQuery([])); // No review studio publication!

    const report = await service.getCoverage(request);

    // Operational inventory includes READY
    expect(report.totals.operationalApproved).toBe(1);
    expect(report.totals.uniquePlayable).toBe(1);
    // Human approval is strictly separated and NOT inferred
    expect(report.totals.humanApproved).toBe(0);
    expect(report.totals.approvalUnknown).toBe(1);

    expect(report.reconciliation.operationalAndPlayable).toBe(1);
    expect(report.reconciliation.humanApprovedPlayable).toBe(0);
    expect(report.reconciliation.unknownApprovalOperational).toBe(1);

    const family = report.families['plural-form'];
    expect(family.operationalApprovedCount).toBe(1);
    expect(family.playableCount).toBe(1);
    expect(family.humanApprovedCount).toBe(0);
    expect(family.approvalUnknownCount).toBe(1);
    expect(family.capacityIndicator.humanApprovedCount).toBe(0);
  });

  // 2. READY with verified human approval provenance
  it('2. counts READY with verified human approval provenance as both operational and human-approved', async () => {
    const readyItemId = '660000000000000000000102';
    const jobId = '660000000000000000000212';
    const readyItem = {
      _id: new Types.ObjectId(readyItemId),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.READY,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: { familyKey: 'plural-form' },
    };
    contentItemsModel.find.mockReturnValue(mockQuery([readyItem]));
    jobsModel.find.mockReturnValue(
      mockQuery([
        {
          _id: new Types.ObjectId(jobId),
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          mechanicKey: 'read-your-opponent',
        },
      ]),
    );
    candidatesModel.find.mockReturnValue(
      mockQuery([trustedApproval('c-1', jobId, readyItemId)]),
    );
    publicationsModel.find.mockReturnValue(
      mockQuery([publication('c-1', jobId, readyItemId)]),
    );

    const report = await service.getCoverage(request);

    expect(report.totals.operationalApproved).toBe(1);
    expect(report.totals.humanApproved).toBe(1);
    expect(report.totals.approvalUnknown).toBe(0);
    expect(report.totals.uniquePlayable).toBe(1);

    expect(report.reconciliation.operationalAndPlayable).toBe(1);
    expect(report.reconciliation.humanApprovedPlayable).toBe(1);
    expect(report.reconciliation.unknownApprovalOperational).toBe(0);

    const family = report.families['plural-form'];
    expect(family.operationalApprovedCount).toBe(1);
    expect(family.humanApprovedCount).toBe(1);
    expect(family.approvalUnknownCount).toBe(0);
    expect(family.capacityIndicator.humanApprovedCount).toBe(1);
  });

  // 3. DRAFT with verified human approval provenance
  it('3. counts DRAFT with verified human approval provenance as operationalApproved and humanApproved, but NOT playable', async () => {
    const draftItemId = '660000000000000000000103';
    const jobId = '660000000000000000000213';
    const draftItem = {
      _id: new Types.ObjectId(draftItemId),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.DRAFT,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: { familyKey: 'plural-form' },
    };
    contentItemsModel.find.mockReturnValue(mockQuery([draftItem]));
    jobsModel.find.mockReturnValue(
      mockQuery([
        {
          _id: new Types.ObjectId(jobId),
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          mechanicKey: 'read-your-opponent',
        },
      ]),
    );
    candidatesModel.find.mockReturnValue(
      mockQuery([trustedApproval('c-2', jobId, draftItemId)]),
    );
    publicationsModel.find.mockReturnValue(
      mockQuery([publication('c-2', jobId, draftItemId)]),
    );

    const report = await service.getCoverage(request);

    expect(report.totals.operationalApproved).toBe(1);
    expect(report.totals.humanApproved).toBe(1);
    expect(report.totals.approvalUnknown).toBe(0);
    expect(report.totals.uniquePlayable).toBe(0); // Not playable yet!

    expect(report.reconciliation.operationalNotPlayable).toBe(1);
    expect(report.reconciliation.humanApprovedNotPlayable).toBe(1);

    const family = report.families['plural-form'];
    expect(family.operationalApprovedCount).toBe(1);
    expect(family.humanApprovedCount).toBe(1);
    expect(family.playableCount).toBe(0);
    expect(family.capacityIndicator.humanApprovedCount).toBe(1);
  });

  // 4. DRAFT without human approval evidence
  it('4. excludes DRAFT without human approval from operational and humanApproved; tracks under pendingCount.unapprovedDrafts', async () => {
    const draftItem = {
      _id: new Types.ObjectId('660000000000000000000104'),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.DRAFT,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: { familyKey: 'plural-form' },
    };
    contentItemsModel.find.mockReturnValue(mockQuery([draftItem]));
    publicationsModel.find.mockReturnValue(mockQuery([]));

    const report = await service.getCoverage(request);

    expect(report.totals.operationalApproved).toBe(0);
    expect(report.totals.humanApproved).toBe(0);
    expect(report.totals.uniquePending).toBe(1);
    expect(report.reconciliation.pendingUnapprovedDrafts).toBe(1);

    const family = report.families['plural-form'];
    expect(family.operationalApprovedCount).toBe(0);
    expect(family.humanApprovedCount).toBe(0);
    expect(family.pendingCount.unapprovedDrafts).toBe(1);
  });

  // 5. Human-approved candidate awaiting publication
  it('5. counts human-approved candidate awaiting publication as humanApproved and operationalApproved, but NOT playable', async () => {
    const job = {
      _id: new Types.ObjectId('660000000000000000000201'),
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
    };
    const approvedCandidate = {
      ...trustedApproval('cand-approved-1', job._id.toString(), null),
      authoring: { familyKey: 'anagram-rearrange' },
    };

    jobsModel.find.mockReturnValue(mockQuery([job]));
    candidatesModel.find.mockReturnValue(mockQuery([approvedCandidate]));

    const report = await service.getCoverage(request);

    expect(report.totals.operationalApproved).toBe(1);
    expect(report.totals.humanApproved).toBe(1);
    expect(report.totals.uniquePlayable).toBe(0);
    expect(report.reconciliation.humanApprovedNotPlayable).toBe(1);
    expect(report.reconciliation.pendingPublicationCandidates).toBe(1);

    const family = report.families['anagram-rearrange'];
    expect(family.humanApprovedCount).toBe(1);
    expect(family.operationalApprovedCount).toBe(1);
    expect(family.playableCount).toBe(0);
    expect(family.capacityIndicator.humanApprovedCount).toBe(1);
  });

  // 6. Published candidate linked to ContentItem, counted once
  it('6. avoids double-counting published candidate linked to a canonical ContentItem', async () => {
    const contentItemId = '660000000000000000000106';
    const canonicalItem = {
      _id: new Types.ObjectId(contentItemId),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.READY,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: { familyKey: 'plural-form' },
    };
    const job = {
      _id: new Types.ObjectId('660000000000000000000202'),
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
    };
    const publishedCandidate = {
      candidateId: 'cand-pub-1',
      jobId: job._id.toString(),
      reviewStatus: 'approved',
      status: 'awaiting_review',
      publishedContentItemId: contentItemId,
      authoring: { familyKey: 'plural-form' },
    };

    contentItemsModel.find.mockReturnValue(mockQuery([canonicalItem]));
    publicationsModel.find.mockReturnValue(
      mockQuery([publication('cand-pub-1', job._id.toString(), contentItemId)]),
    );
    jobsModel.find.mockReturnValue(mockQuery([job]));
    candidatesModel.find.mockReturnValue(
      mockQuery([
        {
          ...trustedApproval('cand-pub-1', job._id.toString(), contentItemId),
          ...publishedCandidate,
        },
      ]),
    );

    const report = await service.getCoverage(request);

    // Exactly 1, NOT 2!
    expect(report.totals.operationalApproved).toBe(1);
    expect(report.totals.humanApproved).toBe(1);
    expect(report.totals.uniquePlayable).toBe(1);
    expect(report.families['plural-form'].humanApprovedCount).toBe(1);
    expect(report.families['plural-form'].operationalApprovedCount).toBe(1);
  });

  // 7. Conflicting or missing approval provenance
  it('7. treats missing or ambiguous approval provenance as UNKNOWN; never infers human approval', async () => {
    const itemWithVagueMeta = {
      _id: new Types.ObjectId('660000000000000000000107'),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.READY,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: {
        familyKey: 'plural-form',
        notes: 'maybe approved?',
        editorialApproval: { approved: true },
        reviewDecision: { decision: 'approved' },
      },
    };
    contentItemsModel.find.mockReturnValue(mockQuery([itemWithVagueMeta]));
    publicationsModel.find.mockReturnValue(mockQuery([]));

    const report = await service.getCoverage(request);

    expect(report.totals.operationalApproved).toBe(1);
    expect(report.totals.humanApproved).toBe(0);
    expect(report.totals.approvalUnknown).toBe(1);
    expect(
      report.families['plural-form'].capacityIndicator.humanApprovedCount,
    ).toBe(0);
    expect(report.diagnostics.hasUnknownApproval).toBe(true);
  });

  it('7a. does not trust an inconsistent publication linkage', async () => {
    const itemId = '660000000000000000000117';
    const jobId = '660000000000000000000217';
    const item = {
      _id: new Types.ObjectId(itemId),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.READY,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: { familyKey: 'plural-form' },
    };
    const job = {
      _id: new Types.ObjectId(jobId),
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
    };
    contentItemsModel.find.mockReturnValue(mockQuery([item]));
    jobsModel.find.mockReturnValue(mockQuery([job]));
    candidatesModel.find.mockReturnValue(
      mockQuery([trustedApproval('cand-link-mismatch', jobId, 'other-item')]),
    );
    publicationsModel.find.mockReturnValue(
      mockQuery([publication('cand-link-mismatch', jobId, itemId)]),
    );

    const report = await service.getCoverage(request);

    expect(report.totals.humanApproved).toBe(0);
    expect(report.totals.approvalUnknown).toBe(1);
    expect(report.diagnostics.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('publication linkage record'),
      ]),
    );
  });

  it('7b. excludes rejected candidates and keeps unknown family candidates unclassified', async () => {
    const job = {
      _id: new Types.ObjectId('660000000000000000000218'),
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
    };
    const multiMechanicItem = {
      _id: new Types.ObjectId('660000000000000000000118'),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.READY,
      compatibleChallengeTypeIds: [ctRyoId, ctBombId],
      metadata: { familyKey: 'plural-form' },
    };
    const rejected = {
      candidateId: 'cand-rejected',
      jobId: job._id.toString(),
      reviewStatus: 'rejected',
      status: 'awaiting_review',
      publishedContentItemId: null,
      authoring: { familyKey: 'plural-form' },
    };
    const unknownFamily = {
      candidateId: 'cand-unknown-family',
      jobId: job._id.toString(),
      reviewStatus: 'pending',
      status: 'awaiting_review',
      publishedContentItemId: null,
      authoring: { familyKey: 'not-a-canonical-family' },
    };
    contentItemsModel.find.mockReturnValue(mockQuery([multiMechanicItem]));
    jobsModel.find.mockReturnValue(mockQuery([job]));
    candidatesModel.find.mockReturnValue(mockQuery([rejected, unknownFamily]));

    const report = await service.getCoverage(request);

    expect(report.reconciliation.rejectedExcludedCandidates).toBe(1);
    expect(report.totals.uniquePending).toBe(1);
    expect(report.totals.uniqueUnclassified).toBe(1);
    expect(report.families['plural-form'].byMechanic).toEqual({
      'read-your-opponent': expect.objectContaining({ playableCount: 1 }),
      bomb: expect.objectContaining({ playableCount: 1 }),
    });
    expect(report.diagnostics.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('unknown familyKey')]),
    );
  });

  it('12a. bounds Scope lookup by World ownership', async () => {
    await service.getCoverage(request);
    expect(scopesModel.findOne).toHaveBeenCalledWith({
      worldId: standardWorld._id,
      slug: 'wordplay-letters',
    });
  });

  it('12b. returns an empty inventory for a missing Scope without crossing boundaries', async () => {
    scopesModel.findOne.mockReturnValue(mockQuery(null));
    const report = await service.getCoverage(request);
    expect(report.scopeId).toBeUndefined();
    expect(report.totals.operationalApproved).toBe(0);
    expect(contentItemsModel.find).not.toHaveBeenCalled();
  });

  it('12c. returns zeroed inventory for an existing Scope with no content', async () => {
    contentItemsModel.find.mockReturnValue(mockQuery([]));
    jobsModel.find.mockReturnValue(mockQuery([]));
    publicationsModel.find.mockReturnValue(mockQuery([]));

    const report = await service.getCoverage(request);
    expect(report.scopeId).toBe(puzzleScopeId.toString());
    expect(report.totals.operationalApproved).toBe(0);
    expect(report.totals.humanApproved).toBe(0);
    expect(report.totals.approvalUnknown).toBe(0);
    expect(report.totals.uniquePlayable).toBe(0);
    expect(report.totals.uniquePending).toBe(0);
    expect(report.diagnostics.warnings).toEqual([]);
  });

  it('14. handles legacy records with omitted metadata as unclassified without error', async () => {
    const legacyItem = {
      _id: new Types.ObjectId('660000000000000000000114'),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.READY,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: undefined,
    };
    contentItemsModel.find.mockReturnValue(mockQuery([legacyItem]));
    publicationsModel.find.mockReturnValue(mockQuery([]));

    const report = await service.getCoverage(request);
    expect(report.totals.uniqueUnclassified).toBe(1);
    expect(report.unclassified.operationalApprovedCount).toBe(1);
    expect(report.unclassified.humanApprovedCount).toBe(0);
    expect(report.unclassified.approvalUnknownCount).toBe(1);
  });

  it('15. propagates query failures instead of presenting a partial inventory as complete', async () => {
    contentItemsModel.find.mockReturnValue(
      rejectingQuery(new Error('content inventory unavailable')),
    );
    await expect(service.getCoverage(request)).rejects.toThrow(
      'content inventory unavailable',
    );
  });

  // 8. Family soft cap at 49, 50, and 51
  it('8. evaluates soft cap capacity indicator strictly on humanApprovedCount at 49, 50, and 51', async () => {
    const makeHumanApprovedItems = (count: number) => {
      const items = Array.from({ length: count }, () => {
        const id = new Types.ObjectId().toString();
        return {
          _id: new Types.ObjectId(id),
          scopeId: puzzleScopeId,
          status: ContentItemStatus.READY,
          compatibleChallengeTypeIds: [ctRyoId],
          metadata: { familyKey: 'plural-form' },
        };
      });
      const jobId = '660000000000000000000208';
      const candidates = items.map((i) =>
        trustedApproval('c-' + i._id.toString(), jobId, i._id.toString()),
      );
      const pubs = items.map((i) =>
        publication('c-' + i._id.toString(), jobId, i._id.toString()),
      );
      return {
        items,
        pubs,
        candidates,
        job: {
          _id: new Types.ObjectId(jobId),
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          mechanicKey: 'read-your-opponent',
        },
      };
    };

    // 49 human approved
    const set49 = makeHumanApprovedItems(49);
    contentItemsModel.find.mockReturnValue(mockQuery(set49.items));
    publicationsModel.find.mockReturnValue(mockQuery(set49.pubs));
    jobsModel.find.mockReturnValue(mockQuery([set49.job]));
    candidatesModel.find.mockReturnValue(mockQuery(set49.candidates));
    let report = await service.getCoverage(request);
    expect(report.families['plural-form'].capacityIndicator).toEqual({
      threshold: 50,
      humanApprovedCount: 49,
      operationalApprovedCount: 49,
      approvalUnknownCount: 0,
      reached: false,
      status: 'BELOW_THRESHOLD',
      approvedCount: 49,
    });

    // 50 human approved
    const set50 = makeHumanApprovedItems(50);
    contentItemsModel.find.mockReturnValue(mockQuery(set50.items));
    publicationsModel.find.mockReturnValue(mockQuery(set50.pubs));
    jobsModel.find.mockReturnValue(mockQuery([set50.job]));
    candidatesModel.find.mockReturnValue(mockQuery(set50.candidates));
    report = await service.getCoverage(request);
    expect(report.families['plural-form'].capacityIndicator).toEqual({
      threshold: 50,
      humanApprovedCount: 50,
      operationalApprovedCount: 50,
      approvalUnknownCount: 0,
      reached: true,
      status: 'AT_THRESHOLD',
      approvedCount: 50,
    });

    // 51 human approved
    const set51 = makeHumanApprovedItems(51);
    contentItemsModel.find.mockReturnValue(mockQuery(set51.items));
    publicationsModel.find.mockReturnValue(mockQuery(set51.pubs));
    jobsModel.find.mockReturnValue(mockQuery([set51.job]));
    candidatesModel.find.mockReturnValue(mockQuery(set51.candidates));
    report = await service.getCoverage(request);
    expect(report.families['plural-form'].capacityIndicator).toEqual({
      threshold: 50,
      humanApprovedCount: 51,
      operationalApprovedCount: 51,
      approvalUnknownCount: 0,
      reached: true,
      status: 'ABOVE_THRESHOLD',
      approvedCount: 51,
    });
  });

  // 9. READY-only family exceeding 50 without human approval
  it('9. does NOT trigger capacity threshold for 100 READY items lacking human approval evidence', async () => {
    const unapprovedReadyItems = Array.from({ length: 100 }, () => ({
      _id: new Types.ObjectId(),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.READY,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: { familyKey: 'plural-form' },
    }));

    contentItemsModel.find.mockReturnValue(mockQuery(unapprovedReadyItems));
    publicationsModel.find.mockReturnValue(mockQuery([])); // No review publications!

    const report = await service.getCoverage(request);

    const family = report.families['plural-form'];
    expect(family.operationalApprovedCount).toBe(100);
    expect(family.playableCount).toBe(100);
    expect(family.humanApprovedCount).toBe(0);
    expect(family.approvalUnknownCount).toBe(100);

    // CRITICAL POLICY ASSERTION:
    // 100 READY items MUST NOT trigger the soft-cap threshold!
    expect(family.capacityIndicator).toEqual({
      threshold: 50,
      humanApprovedCount: 0,
      operationalApprovedCount: 100,
      approvalUnknownCount: 100,
      reached: false,
      status: 'BELOW_THRESHOLD',
      approvedCount: 0,
    });
  });

  // 10. Mixed human-approved and unknown-provenance inventory
  it('10. handles mixed inventory (40 human-approved + 30 unknown READY) correctly as BELOW threshold (40) with warnings', async () => {
    const humanApprovedItems = Array.from({ length: 40 }, () => {
      const id = new Types.ObjectId().toString();
      return {
        _id: new Types.ObjectId(id),
        scopeId: puzzleScopeId,
        status: ContentItemStatus.READY,
        compatibleChallengeTypeIds: [ctRyoId],
        metadata: { familyKey: 'plural-form' },
      };
    });
    const jobId = '660000000000000000000210';
    const pubs = humanApprovedItems.map((i) =>
      publication('c-' + i._id.toString(), jobId, i._id.toString()),
    );
    const approvedCandidates = humanApprovedItems.map((i) =>
      trustedApproval('c-' + i._id.toString(), jobId, i._id.toString()),
    );

    const unknownReadyItems = Array.from({ length: 30 }, () => ({
      _id: new Types.ObjectId(),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.READY,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: { familyKey: 'plural-form' },
    }));

    contentItemsModel.find.mockReturnValue(
      mockQuery([...humanApprovedItems, ...unknownReadyItems]),
    );
    publicationsModel.find.mockReturnValue(mockQuery(pubs));
    jobsModel.find.mockReturnValue(
      mockQuery([
        {
          _id: new Types.ObjectId(jobId),
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          mechanicKey: 'read-your-opponent',
        },
      ]),
    );
    candidatesModel.find.mockReturnValue(mockQuery(approvedCandidates));

    const report = await service.getCoverage(request);

    const family = report.families['plural-form'];
    expect(family.operationalApprovedCount).toBe(70);
    expect(family.humanApprovedCount).toBe(40);
    expect(family.approvalUnknownCount).toBe(30);

    // Evaluated strictly against humanApprovedCount: 40 < 50
    expect(family.capacityIndicator).toEqual({
      threshold: 50,
      humanApprovedCount: 40,
      operationalApprovedCount: 70,
      approvalUnknownCount: 30,
      reached: false,
      status: 'BELOW_THRESHOLD',
      approvedCount: 40,
    });

    expect(report.diagnostics.hasUnknownApproval).toBe(true);
    expect(report.diagnostics.unknownApprovalRatio).toBeCloseTo(30 / 70);
    expect(
      report.diagnostics.warnings.some((w) =>
        w.includes('UNKNOWN human approval provenance'),
      ),
    ).toBe(true);
  });

  // 11. Unclassified historical content
  it('11. separates unclassified historical items and preserves their operational vs human approval breakdown', async () => {
    const unclassifiedReady = {
      _id: new Types.ObjectId('660000000000000000000111'),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.READY,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: {}, // no family
    };
    contentItemsModel.find.mockReturnValue(mockQuery([unclassifiedReady]));
    publicationsModel.find.mockReturnValue(mockQuery([]));

    const report = await service.getCoverage(request);

    expect(report.totals.uniqueUnclassified).toBe(1);
    expect(report.unclassified.operationalApprovedCount).toBe(1);
    expect(report.unclassified.humanApprovedCount).toBe(0);
    expect(report.unclassified.approvalUnknownCount).toBe(1);
    expect(report.families['plural-form'].operationalApprovedCount).toBe(0);
  });

  // 12. Existing operational inventory reconciliation
  it('12. maintains exact mathematical reconciliation across all lifecycle dimensions', async () => {
    const readyApprovedId = new Types.ObjectId().toString();
    const jobId = '660000000000000000000212';
    const readyApproved = {
      _id: new Types.ObjectId(readyApprovedId),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.READY,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: { familyKey: 'plural-form' },
    };

    const readyUnknown = {
      _id: new Types.ObjectId(),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.READY,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: { familyKey: 'plural-form' },
    };

    const draftApprovedId = new Types.ObjectId().toString();
    const draftApproved = {
      _id: new Types.ObjectId(draftApprovedId),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.DRAFT,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: { familyKey: 'plural-form' },
    };

    const draftUnapproved = {
      _id: new Types.ObjectId(),
      scopeId: puzzleScopeId,
      status: ContentItemStatus.DRAFT,
      compatibleChallengeTypeIds: [ctRyoId],
      metadata: { familyKey: 'plural-form' },
    };

    contentItemsModel.find.mockReturnValue(
      mockQuery([readyApproved, readyUnknown, draftApproved, draftUnapproved]),
    );
    publicationsModel.find.mockReturnValue(
      mockQuery([
        publication('c-r1', jobId, readyApprovedId),
        publication('c-d1', jobId, draftApprovedId),
      ]),
    );
    jobsModel.find.mockReturnValue(
      mockQuery([
        {
          _id: new Types.ObjectId(jobId),
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          mechanicKey: 'read-your-opponent',
        },
      ]),
    );
    candidatesModel.find.mockReturnValue(
      mockQuery([
        trustedApproval('c-r1', jobId, readyApprovedId),
        trustedApproval('c-d1', jobId, draftApprovedId),
      ]),
    );

    const report = await service.getCoverage(request);

    // Invariant 1: operationalApproved = operationalAndPlayable + operationalNotPlayable
    expect(report.totals.operationalApproved).toBe(
      report.reconciliation.operationalAndPlayable +
        report.reconciliation.operationalNotPlayable,
    );

    // Invariant 2: operationalApproved = humanApproved + unknownApprovalOperational
    expect(report.totals.operationalApproved).toBe(
      report.totals.humanApproved +
        report.reconciliation.unknownApprovalOperational,
    );

    // Invariant 3: humanApproved = humanApprovedPlayable + humanApprovedNotPlayable
    expect(report.totals.humanApproved).toBe(
      report.reconciliation.humanApprovedPlayable +
        report.reconciliation.humanApprovedNotPlayable,
    );

    expect(report.totals.operationalApproved).toBe(3);
    expect(report.totals.humanApproved).toBe(2);
    expect(report.totals.approvalUnknown).toBe(1);
    expect(report.totals.uniquePending).toBe(1); // the 1 unapproved draft
  });
});
