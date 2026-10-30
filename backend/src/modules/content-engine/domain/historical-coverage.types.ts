/**
 * Historical Coverage Domain Types for Content Engine V2 (Slice 2A).
 *
 * Defines the models for historical and in-flight inventory tracking across
 * canonical lifecycle states (Operational, Playable, Human-Approved, Pending)
 * and canonical families.
 */

export interface HistoricalCoverageRequest {
  worldKey: string;
  scopeKey: string;
}

export const CAPACITY_THRESHOLD = 50;

export type FamilyCapacityStatus =
  'BELOW_THRESHOLD' | 'AT_THRESHOLD' | 'ABOVE_THRESHOLD';

export interface FamilyCapacityIndicator {
  /** The soft capacity threshold (default: 50). */
  threshold: number;
  /** Verified human-approved questions count for this family. */
  humanApprovedCount: number;
  /** Operational approved count for this family (for visibility). */
  operationalApprovedCount: number;
  /** Approval unknown count for this family. */
  approvalUnknownCount: number;
  /** Whether humanApprovedCount >= threshold. */
  reached: boolean;
  /** Detailed threshold status indicator based strictly on humanApprovedCount. */
  status: FamilyCapacityStatus;
  /** Backward-compatible alias for humanApprovedCount. */
  approvedCount: number;
}

export interface MechanicCoverageCount {
  /** Operational count (READY + approved drafts + unpublished candidates). */
  operationalApprovedCount: number;
  /** Playable count (READY and compatible with this mechanic). */
  playableCount: number;
  /** Verified human-approved questions count for this mechanic. */
  humanApprovedCount: number;
  /** Operational questions with unknown human approval provenance. */
  approvalUnknownCount: number;
  /** Backward-compatible alias for operationalApprovedCount. */
  approvedCount: number;
}

export interface FamilyClassificationProvenance {
  source:
    | 'CANONICAL_FAMILY_CATALOG'
    | 'METADATA_FAMILY_KEY'
    | 'METADATA_TAGS'
    | 'DETERMINISTIC_RULE'
    | 'UNCLASSIFIED';
  isClassified: boolean;
  detail?: string;
}

export interface FamilyCoverageMetrics {
  familyKey: string;
  name?: string;

  /**
   * Operational Approved Inventory: Content eligible operationally:
   * 1. ContentItems with status: READY
   * 2. ContentItems with status: DRAFT with verified publication provenance
   * 3. EngineCandidates with a trusted review-service approval decision and
   *    publishedContentItemId: null
   */
  operationalApprovedCount: number;

  /**
   * Human-Approved Inventory: Content with trustworthy evidence of human approval:
   * 1. ContentItems linked to a publication whose candidate linkage and review
   *    approval event are both verified
   * 2. EngineCandidates with a review-service approval decision and matching
   *    approval event, with publishedContentItemId: null
   * Note: READY status and free-form ContentItem metadata do NOT prove human
   * quality approval.
   */
  humanApprovedCount: number;

  /**
   * Operational inventory whose human approval provenance is UNKNOWN
   * (e.g. historical READY content without review records).
   */
  approvalUnknownCount: number;

  /**
   * Playable Inventory: Canonical ContentItem records with status: READY
   * and compatible with at least one mechanic.
   */
  playableCount: number;

  /** Backward-compatible alias for operationalApprovedCount. */
  approvedCount: number;

  /**
   * Pending Inventory: Staged or in-flight content not yet approved or playable.
   */
  pendingCount: {
    pendingReview: number;
    pendingPublication: number;
    unapprovedDrafts: number;
    total: number;
  };

  /**
   * Breakdown by mechanic slug (e.g. 'read-your-opponent', 'moving-xo', 'bomb', 'closest').
   * Note: Multi-mechanic questions appear under each compatible mechanic, but count
   * strictly ONCE in unique totals!
   */
  byMechanic: Record<string, MechanicCoverageCount>;

  /**
   * Soft Capacity Threshold (50 human-approved questions per family).
   * Review indicator only — never blocks or penalizes generation.
   * Evaluated STRICTLY against humanApprovedCount.
   */
  capacityIndicator: FamilyCapacityIndicator;

  /** Provenance of family assignment. */
  provenance: FamilyClassificationProvenance;
}

export interface ScopeCoverageTotals {
  /** Unique operational questions across Scope (READY + verified drafts + unpublished approved candidates). */
  operationalApproved: number;
  /** Unique questions with verified human approval provenance across the Scope. */
  humanApproved: number;
  /** Unique questions in operational inventory whose human approval provenance is unknown. */
  approvalUnknown: number;
  /** Unique questions live and playable in gameplay pools (status: READY). */
  uniquePlayable: number;
  /** Unique pending items (candidates in review + unapproved drafts). */
  uniquePending: number;
  /** Unique unclassified items (historical or missing family tags). */
  uniqueUnclassified: number;
  /** Backward-compatible alias for operationalApproved. */
  uniqueApproved: number;
}

export interface ScopeCoverageReconciliation {
  /** Ready canonical items (both Operational AND Playable). */
  operationalAndPlayable: number;
  /** Operational approved drafts or unpublished approved candidates (Operational, but NOT YET Playable). */
  operationalNotPlayable: number;
  /** Ready items with verified human approval provenance. */
  humanApprovedPlayable: number;
  /** Staged drafts or unpublished candidates with verified human approval provenance. */
  humanApprovedNotPlayable: number;
  /** Operational items with UNKNOWN human approval provenance (e.g. historical READY items without review records). */
  unknownApprovalOperational: number;
  /** Draft ContentItems lacking approval provenance (Pending, NOT Operational). */
  pendingUnapprovedDrafts: number;
  /** In-flight candidates awaiting human review (Pending, NOT Approved). */
  pendingReviewCandidates: number;
  /** Approved candidates awaiting publication (Pending publication & Approved). */
  pendingPublicationCandidates: number;
  /** Rejected candidates explicitly excluded from all legitimate inventory counts. */
  rejectedExcludedCandidates: number;
  /** Archived content items explicitly excluded from all legitimate inventory counts. */
  archivedExcludedItems: number;
  /** Backward-compatible alias for operationalAndPlayable. */
  approvedAndPlayable: number;
  /** Backward-compatible alias for operationalNotPlayable. */
  approvedNotPlayable: number;
}

export interface ScopeCoverageDiagnostics {
  isCatalogPresent: boolean;
  catalogDigest?: string;
  hasUnclassifiedContent: boolean;
  unclassifiedRatio: number;
  hasUnknownApproval: boolean;
  unknownApprovalRatio: number;
  warnings: string[];
}

export interface ScopeHistoricalCoverageReport {
  worldKey: string;
  scopeKey: string;
  scopeId?: string;

  /** Unique question totals across the Scope. */
  totals: ScopeCoverageTotals;

  /** Explicit reconciliation model explaining overlaps across lifecycle dimensions. */
  reconciliation: ScopeCoverageReconciliation;

  /** Coverage metrics per canonical family declared in Scope's CanonicalFamilyCatalog. */
  families: Record<string, FamilyCoverageMetrics>;

  /** Unclassified historical items (no family key or unrecognized family key). */
  unclassified: FamilyCoverageMetrics;

  /** Diagnostics & coverage completeness warnings. */
  diagnostics: ScopeCoverageDiagnostics;
}
