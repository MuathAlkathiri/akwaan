import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ContentItemStatus } from '../../world-content/domain/world-content.constants';
import { ContentItem } from '../../world-content/schemas/content-item.schema';
import { Scope } from '../../world-content/schemas/scope.schema';
import { World } from '../../world-content/schemas/world.schema';
import { ChallengeType } from '../../world-content/schemas/challenge-type.schema';
import { EngineCandidateDocument } from '../schemas/engine-candidate.schema';
import { EngineDraftPublicationDocument } from '../schemas/engine-draft-publication.schema';
import { EngineJobDocument } from '../schemas/engine-job.schema';
import { AuthoringContextService } from './authoring-context.service';
import { CanonicalFamilyCatalog } from '../domain/canonical-family.types';
import {
  CAPACITY_THRESHOLD,
  FamilyCapacityIndicator,
  FamilyCapacityStatus,
  FamilyCoverageMetrics,
  HistoricalCoverageRequest,
  ScopeHistoricalCoverageReport,
} from '../domain/historical-coverage.types';
import {
  hasTrustedCandidateApproval,
  reviewDecisionRevision,
} from '../domain/candidate-approval-provenance';

@Injectable()
export class HistoricalCoverageService {
  private readonly logger = new Logger(HistoricalCoverageService.name);

  constructor(
    @InjectModel(ContentItem.name)
    private readonly contentItems: Model<ContentItem>,
    @InjectModel(EngineCandidateDocument.name)
    private readonly candidates: Model<EngineCandidateDocument>,
    @InjectModel(EngineDraftPublicationDocument.name)
    private readonly publications: Model<EngineDraftPublicationDocument>,
    @InjectModel(EngineJobDocument.name)
    private readonly jobs: Model<EngineJobDocument>,
    @InjectModel(World.name)
    private readonly worlds: Model<World>,
    @InjectModel(Scope.name)
    private readonly scopes: Model<Scope>,
    @InjectModel(ChallengeType.name)
    private readonly challengeTypes: Model<ChallengeType>,
    private readonly authoringContext: AuthoringContextService,
  ) {}

  /**
   * Generates a comprehensive historical coverage report for a given Scope.
   *
   * Reconciles inventory across Operational, Playable, Human-Approved, and Pending
   * lifecycle dimensions without double-counting and with strict family boundaries.
   */
  async getCoverage(
    request: HistoricalCoverageRequest,
  ): Promise<ScopeHistoricalCoverageReport> {
    const { worldKey, scopeKey } = request;
    const warnings: string[] = [];

    // 1. Resolve Canonical Family Catalog from authoritative authoring profiles
    let catalog: CanonicalFamilyCatalog | null = null;
    try {
      catalog = this.authoringContext.resolveCanonicalFamiliesForScope({
        worldKey,
        scopeKey,
      });
    } catch (err) {
      warnings.push(
        `Canonical family catalog unavailable for scope "${worldKey}/${scopeKey}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const canonicalFamilyKeys = new Set(
      (catalog?.families ?? []).map((f) => f.familyKey),
    );

    // 2. Resolve World and Scope in MongoDB. Scope slugs are only unique
    // within a World, so the requested World must be part of the lookup.
    const worldDoc = await this.worlds
      .findOne({ slug: worldKey })
      .lean()
      .exec();
    const scopeDoc = await this.scopes
      .findOne(
        worldDoc ? { worldId: worldDoc._id, slug: scopeKey } : { _id: null },
      )
      .lean()
      .exec();
    if (!worldDoc) {
      warnings.push(`World "${worldKey}" not found in database catalog.`);
    }
    if (!scopeDoc) {
      warnings.push(`Scope "${scopeKey}" not found in database catalog.`);
    }

    // 3. Resolve ChallengeTypes map for mechanic slug resolution
    const challengeTypeDocs = await this.challengeTypes.find().lean().exec();
    const challengeTypeIdToSlug = new Map<string, string>();
    for (const ct of challengeTypeDocs) {
      challengeTypeIdToSlug.set(ct._id.toString(), ct.slug);
    }

    // 4. Fetch canonical ContentItems for this Scope
    const items = scopeDoc
      ? await this.contentItems.find({ scopeId: scopeDoc._id }).lean().exec()
      : [];

    // 5. Fetch Engine Candidates associated with jobs in this Scope
    const jobDocs = await this.jobs.find({ worldKey, scopeKey }).lean().exec();
    const jobIds = jobDocs.map((j) => j._id.toString());
    const jobMechanicMap = new Map<string, string>();
    for (const job of jobDocs) {
      jobMechanicMap.set(job._id.toString(), job.mechanicKey);
    }

    const candidateDocs =
      jobIds.length > 0
        ? await this.candidates
            .find({ jobId: { $in: jobIds } })
            .lean()
            .exec()
        : [];

    const candidatesById = new Map(
      candidateDocs.map((candidate) => [candidate.candidateId, candidate]),
    );

    // 6. Identify verified publication provenance for ContentItems. A
    // publication row is trusted only when it still agrees with the
    // review-service candidate approval and candidate -> ContentItem pointer.
    // The unique indexes prevent duplicates; they do not prove provenance.
    const allItemIds = items.map((item) => item._id.toString());
    const approvedPublicationItemIds = new Set<string>();
    let inconsistentPublicationCount = 0;

    if (allItemIds.length > 0) {
      const pubDocs = await this.publications
        .find({ contentItemId: { $in: allItemIds } })
        .lean()
        .exec();
      for (const pub of pubDocs) {
        const candidate = candidatesById.get(pub.candidateId);
        const isConsistent = Boolean(
          candidate &&
          candidate.jobId === pub.jobId &&
          candidate.publishedContentItemId === pub.contentItemId &&
          candidate.reviewStatus === 'approved' &&
          this.hasTrustedCandidateApproval(candidate) &&
          this.reviewDecisionRevision(candidate) === pub.reviewRevision,
        );
        if (isConsistent) {
          approvedPublicationItemIds.add(pub.contentItemId);
        } else {
          inconsistentPublicationCount += 1;
        }
      }
    }

    // 7. Initialize Family Metrics structures
    const families: Record<string, FamilyCoverageMetrics> = {};
    for (const cf of catalog?.families ?? []) {
      families[cf.familyKey] = this.initFamilyMetrics(cf.familyKey, cf.name, {
        source: 'CANONICAL_FAMILY_CATALOG',
        isClassified: true,
      });
    }

    const unclassified = this.initFamilyMetrics('UNCLASSIFIED', 'غير مصنف', {
      source: 'UNCLASSIFIED',
      isClassified: false,
    });

    // 8. Totals and Reconciliation Counters
    const uniqueOperationalApprovedSet = new Set<string>();
    const uniqueHumanApprovedSet = new Set<string>();
    const uniqueApprovalUnknownSet = new Set<string>();
    const uniquePlayableSet = new Set<string>();
    const uniquePendingSet = new Set<string>();
    const uniqueUnclassifiedSet = new Set<string>();

    let operationalAndPlayable = 0;
    let operationalNotPlayable = 0;
    let humanApprovedPlayable = 0;
    let humanApprovedNotPlayable = 0;
    let unknownApprovalOperational = 0;
    let pendingUnapprovedDrafts = 0;
    let pendingReviewCandidates = 0;
    let pendingPublicationCandidates = 0;
    let rejectedExcludedCandidates = 0;
    let archivedExcludedItems = 0;

    // 9. Process Canonical ContentItem records
    for (const item of items) {
      const itemId = item._id.toString();

      // Check for archived items
      if (item.status === ContentItemStatus.ARCHIVED) {
        archivedExcludedItems += 1;
        continue;
      }

      // Determine approval and human review provenance
      const hasPublication = approvedPublicationItemIds.has(itemId);
      // ContentItem metadata has no trusted approval writer. Values such as
      // `editorialApproval: { approved: true }` are therefore historical
      // claims only and must not inflate humanApprovedCount.
      const isHumanApproved = hasPublication;
      const isReady = item.status === ContentItemStatus.READY;
      const isDraft = item.status === ContentItemStatus.DRAFT;

      // Determine mechanics
      const mechanicSlugs = this.resolveMechanics(
        item.compatibleChallengeTypeIds,
        challengeTypeIdToSlug,
      );
      const isPlayable = isReady && mechanicSlugs.length > 0;

      // Determine classification
      const classifiedKey = this.extractFamilyKeyFromContentItem(
        item,
        canonicalFamilyKeys,
        warnings,
      );
      const targetFamily = classifiedKey
        ? families[classifiedKey]
        : unclassified;

      if (!classifiedKey) {
        uniqueUnclassifiedSet.add(itemId);
      }

      if (isReady) {
        // READY is operational and playable
        uniqueOperationalApprovedSet.add(itemId);
        targetFamily.operationalApprovedCount += 1;
        targetFamily.approvedCount += 1;

        if (isPlayable) {
          uniquePlayableSet.add(itemId);
          targetFamily.playableCount += 1;
          operationalAndPlayable += 1;
        } else {
          operationalNotPlayable += 1;
        }

        if (isHumanApproved) {
          uniqueHumanApprovedSet.add(itemId);
          targetFamily.humanApprovedCount += 1;
          humanApprovedPlayable += 1;
        } else {
          // READY alone does NOT prove human approval -> UNKNOWN
          uniqueApprovalUnknownSet.add(itemId);
          targetFamily.approvalUnknownCount += 1;
          unknownApprovalOperational += 1;
        }

        // Mechanic breakdown
        for (const mSlug of mechanicSlugs) {
          let mMetrics = targetFamily.byMechanic[mSlug];
          if (!mMetrics) {
            mMetrics = {
              operationalApprovedCount: 0,
              approvedCount: 0,
              playableCount: 0,
              humanApprovedCount: 0,
              approvalUnknownCount: 0,
            };
            targetFamily.byMechanic[mSlug] = mMetrics;
          }
          mMetrics.operationalApprovedCount += 1;
          mMetrics.approvedCount += 1;
          if (isPlayable) {
            mMetrics.playableCount += 1;
          }
          if (isHumanApproved) {
            mMetrics.humanApprovedCount += 1;
          } else {
            mMetrics.approvalUnknownCount += 1;
          }
        }
      } else if (isDraft) {
        if (isHumanApproved) {
          // DRAFT with verified human approval
          uniqueOperationalApprovedSet.add(itemId);
          uniqueHumanApprovedSet.add(itemId);
          targetFamily.operationalApprovedCount += 1;
          targetFamily.approvedCount += 1;
          targetFamily.humanApprovedCount += 1;
          operationalNotPlayable += 1;
          humanApprovedNotPlayable += 1;

          for (const mSlug of mechanicSlugs) {
            let mMetrics = targetFamily.byMechanic[mSlug];
            if (!mMetrics) {
              mMetrics = {
                operationalApprovedCount: 0,
                approvedCount: 0,
                playableCount: 0,
                humanApprovedCount: 0,
                approvalUnknownCount: 0,
              };
              targetFamily.byMechanic[mSlug] = mMetrics;
            }
            mMetrics.operationalApprovedCount += 1;
            mMetrics.approvedCount += 1;
            mMetrics.humanApprovedCount += 1;
          }
        } else {
          // DRAFT without human approval -> Pending unapproved draft
          uniquePendingSet.add(itemId);
          pendingUnapprovedDrafts += 1;
          targetFamily.pendingCount.unapprovedDrafts += 1;
          targetFamily.pendingCount.total += 1;
        }
      }
    }

    // 10. Process EngineCandidate records
    for (const cand of candidateDocs) {
      const candId = cand.candidateId;

      // INVARIANT: If published to a canonical ContentItem, skip to avoid double-counting!
      if (cand.publishedContentItemId) {
        continue;
      }

      // Filter out rejected or terminal failure candidates
      const isRejected =
        cand.reviewStatus === 'rejected' ||
        ['screened_reject', 'generation_failed', 'fact_blocked'].includes(
          cand.status,
        );
      if (isRejected) {
        rejectedExcludedCandidates += 1;
        continue;
      }

      // Check if candidate is approved awaiting publication
      const isApprovedCandidate = this.hasTrustedCandidateApproval(cand);
      const isPendingReview =
        cand.reviewStatus === 'pending' &&
        ['awaiting_review', 'generated', 'screened_pass'].includes(cand.status);

      const classifiedKey = this.extractFamilyKeyFromCandidate(
        cand,
        canonicalFamilyKeys,
        warnings,
      );
      const targetFamily = classifiedKey
        ? families[classifiedKey]
        : unclassified;

      if (!classifiedKey) {
        uniqueUnclassifiedSet.add(candId);
      }

      const jobMechanic = jobMechanicMap.get(cand.jobId);

      if (isApprovedCandidate) {
        // Human approved awaiting publication
        uniqueOperationalApprovedSet.add(candId);
        uniqueHumanApprovedSet.add(candId);
        targetFamily.operationalApprovedCount += 1;
        targetFamily.approvedCount += 1;
        targetFamily.humanApprovedCount += 1;
        targetFamily.pendingCount.pendingPublication += 1;
        targetFamily.pendingCount.total += 1;
        operationalNotPlayable += 1;
        humanApprovedNotPlayable += 1;
        pendingPublicationCandidates += 1;

        if (jobMechanic) {
          let mMetrics = targetFamily.byMechanic[jobMechanic];
          if (!mMetrics) {
            mMetrics = {
              operationalApprovedCount: 0,
              approvedCount: 0,
              playableCount: 0,
              humanApprovedCount: 0,
              approvalUnknownCount: 0,
            };
            targetFamily.byMechanic[jobMechanic] = mMetrics;
          }
          mMetrics.operationalApprovedCount += 1;
          mMetrics.approvedCount += 1;
          mMetrics.humanApprovedCount += 1;
        }
      } else if (isPendingReview) {
        uniquePendingSet.add(candId);
        targetFamily.pendingCount.pendingReview += 1;
        targetFamily.pendingCount.total += 1;
        pendingReviewCandidates += 1;
      }
    }

    // 11. Finalize Capacity Indicators for all families (Evaluated strictly against humanApprovedCount)
    for (const fam of Object.values(families)) {
      fam.capacityIndicator = this.computeCapacityIndicator(
        fam.humanApprovedCount,
        fam.operationalApprovedCount,
        fam.approvalUnknownCount,
      );
    }
    unclassified.capacityIndicator = this.computeCapacityIndicator(
      unclassified.humanApprovedCount,
      unclassified.operationalApprovedCount,
      unclassified.approvalUnknownCount,
    );

    const totalProcessed = items.length + candidateDocs.length;
    const unclassifiedRatio =
      totalProcessed > 0 ? uniqueUnclassifiedSet.size / totalProcessed : 0;
    const unknownApprovalRatio =
      uniqueOperationalApprovedSet.size > 0
        ? uniqueApprovalUnknownSet.size / uniqueOperationalApprovedSet.size
        : 0;

    if (uniqueApprovalUnknownSet.size > 0) {
      warnings.push(
        `${uniqueApprovalUnknownSet.size} operational question(s) have UNKNOWN human approval provenance. Soft capacity threshold of 50 applies strictly to verified human-approved items.`,
      );
    }
    if (inconsistentPublicationCount > 0) {
      warnings.push(
        `${inconsistentPublicationCount} publication linkage record(s) did not match a trusted approved candidate and were not counted as human-approved provenance.`,
      );
    }

    return {
      worldKey,
      scopeKey,
      scopeId: scopeDoc ? scopeDoc._id.toString() : undefined,
      totals: {
        operationalApproved: uniqueOperationalApprovedSet.size,
        humanApproved: uniqueHumanApprovedSet.size,
        approvalUnknown: uniqueApprovalUnknownSet.size,
        uniquePlayable: uniquePlayableSet.size,
        uniquePending: uniquePendingSet.size,
        uniqueUnclassified: uniqueUnclassifiedSet.size,
        uniqueApproved: uniqueOperationalApprovedSet.size,
      },
      reconciliation: {
        operationalAndPlayable,
        operationalNotPlayable,
        humanApprovedPlayable,
        humanApprovedNotPlayable,
        unknownApprovalOperational,
        pendingUnapprovedDrafts,
        pendingReviewCandidates,
        pendingPublicationCandidates,
        rejectedExcludedCandidates,
        archivedExcludedItems,
        approvedAndPlayable: operationalAndPlayable,
        approvedNotPlayable: operationalNotPlayable,
      },
      families,
      unclassified,
      diagnostics: {
        isCatalogPresent: Boolean(catalog),
        catalogDigest: catalog?.digest,
        hasUnclassifiedContent: uniqueUnclassifiedSet.size > 0,
        unclassifiedRatio,
        hasUnknownApproval: uniqueApprovalUnknownSet.size > 0,
        unknownApprovalRatio,
        warnings,
      },
    };
  }

  private reviewDecisionRevision(
    candidate: Partial<EngineCandidateDocument>,
  ): number | null {
    return reviewDecisionRevision(candidate);
  }

  private hasTrustedCandidateApproval(
    candidate: Partial<EngineCandidateDocument>,
  ): boolean {
    return hasTrustedCandidateApproval(candidate);
  }

  private initFamilyMetrics(
    familyKey: string,
    name?: string,
    provenance: FamilyCoverageMetrics['provenance'] = {
      source: 'UNCLASSIFIED',
      isClassified: false,
    },
  ): FamilyCoverageMetrics {
    return {
      familyKey,
      name,
      operationalApprovedCount: 0,
      approvedCount: 0,
      humanApprovedCount: 0,
      approvalUnknownCount: 0,
      playableCount: 0,
      pendingCount: {
        pendingReview: 0,
        pendingPublication: 0,
        unapprovedDrafts: 0,
        total: 0,
      },
      byMechanic: {},
      capacityIndicator: {
        threshold: CAPACITY_THRESHOLD,
        humanApprovedCount: 0,
        operationalApprovedCount: 0,
        approvalUnknownCount: 0,
        reached: false,
        status: 'BELOW_THRESHOLD',
        approvedCount: 0,
      },
      provenance,
    };
  }

  private computeCapacityIndicator(
    humanApprovedCount: number,
    operationalApprovedCount: number,
    approvalUnknownCount: number,
  ): FamilyCapacityIndicator {
    let status: FamilyCapacityStatus = 'BELOW_THRESHOLD';
    if (humanApprovedCount === CAPACITY_THRESHOLD) {
      status = 'AT_THRESHOLD';
    } else if (humanApprovedCount > CAPACITY_THRESHOLD) {
      status = 'ABOVE_THRESHOLD';
    }
    return {
      threshold: CAPACITY_THRESHOLD,
      humanApprovedCount,
      operationalApprovedCount,
      approvalUnknownCount,
      reached: humanApprovedCount >= CAPACITY_THRESHOLD,
      status,
      approvedCount: humanApprovedCount,
    };
  }

  private resolveMechanics(
    challengeTypeIds: Types.ObjectId[] | undefined,
    slugMap: Map<string, string>,
  ): string[] {
    if (!challengeTypeIds || !Array.isArray(challengeTypeIds)) return [];
    const slugs: string[] = [];
    for (const ctId of challengeTypeIds) {
      const slug = slugMap.get(ctId.toString());
      if (slug) slugs.push(slug);
    }
    return slugs;
  }

  private extractFamilyKeyFromContentItem(
    item: { _id: unknown; metadata?: unknown },
    canonicalFamilyKeys: Set<string>,
    warnings: string[],
  ): string | null {
    // 1. Direct metadata.familyKey
    const meta = item.metadata as
      { familyKey?: string; tags?: string[]; source?: string } | undefined;
    if (meta?.familyKey) {
      const trimmed = meta.familyKey.trim();
      if (canonicalFamilyKeys.has(trimmed)) {
        return trimmed;
      }
      warnings.push(
        `Item "${String(item._id)}" has unknown familyKey "${trimmed}". Counted as unclassified.`,
      );
      return null;
    }

    // 2. Metadata tags (e.g. "family:plural-form" or "plural-form")
    if (Array.isArray(meta?.tags)) {
      for (const tag of meta.tags) {
        const clean = tag.replace(/^family:/i, '').trim();
        if (canonicalFamilyKeys.has(clean)) {
          return clean;
        }
      }
    }

    // 3. Deterministic rule matching based on canonical evidence in metadata.source
    if (meta?.source) {
      for (const key of canonicalFamilyKeys) {
        if (
          meta.source.startsWith(key) ||
          meta.source.includes(`/${key}/`) ||
          meta.source.includes(`:${key}`)
        ) {
          return key;
        }
      }
    }

    return null;
  }

  private extractFamilyKeyFromCandidate(
    cand: { candidateId: string; authoring?: unknown; draft?: unknown },
    canonicalFamilyKeys: Set<string>,
    warnings: string[],
  ): string | null {
    // 1. Candidate authoring familyKey
    const authoring = cand.authoring as { familyKey?: string } | undefined;
    if (authoring?.familyKey) {
      const trimmed = authoring.familyKey.trim();
      if (canonicalFamilyKeys.has(trimmed)) {
        return trimmed;
      }
      warnings.push(
        `Candidate "${cand.candidateId}" has unknown familyKey "${trimmed}". Counted as unclassified.`,
      );
      return null;
    }

    // 2. Draft metadata familyKey or tags
    const draftMeta = (
      cand.draft as
        { metadata?: { familyKey?: string; tags?: string[] } } | undefined
    )?.metadata;
    if (draftMeta?.familyKey) {
      const trimmed = draftMeta.familyKey.trim();
      if (canonicalFamilyKeys.has(trimmed)) {
        return trimmed;
      }
      warnings.push(
        `Candidate "${cand.candidateId}" draft has unknown familyKey "${trimmed}". Counted as unclassified.`,
      );
      return null;
    }

    if (Array.isArray(draftMeta?.tags)) {
      for (const tag of draftMeta.tags) {
        const clean = tag.replace(/^family:/i, '').trim();
        if (canonicalFamilyKeys.has(clean)) {
          return clean;
        }
      }
    }

    return null;
  }
}
