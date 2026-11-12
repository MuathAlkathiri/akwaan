import type { ContentItem } from "@/features/world-management/types";

export type ReviewStatus = "pending" | "approved" | "rejected";
export type FactualState =
  | "SUPPORTED"
  | "UNSUPPORTED"
  | "CONTRADICTED"
  | "UNRESOLVED";

export type FactualOverrideCode =
  | "ACCEPTED_WITH_EVIDENCE"
  | "CLAIM_NOT_ANSWER_CRITICAL"
  | "CLAIM_CORRECTED";

export interface ReviewEligibility {
  assessmentCurrent: boolean;
  assessmentStale: boolean;
  evidenceCount: number;
  requiresFactualOverride: boolean;
  allowedFactualOverrideCodes: FactualOverrideCode[];
  canApprove: boolean;
  canCreateDraft: boolean;
  approvalBlockers: string[];
  /** Server-reported reasons a DRAFT cannot be created (stale/untrusted approval). */
  draftBlockers?: string[];
  /** §30.22 media readiness. Absent on servers before Phase 1. */
  mediaReadiness?: CandidateMediaReadiness;
}

/** Rights as the server reads them; EXPIRED is derived, never stored. */
export type MediaRightsStatus =
  | "UNKNOWN"
  | "PENDING"
  | "CLEARED"
  | "BLOCKED"
  | "EXPIRED";

export interface CandidateMediaSlot {
  slotKey: string;
  purpose: "gameplay" | "decorative";
  required: boolean;
  status: "planned" | "resolved" | "failed" | "skipped";
  asset?: {
    url: string;
    mimetype?: string;
    width?: number;
    height?: number;
    sha256?: string;
  } | null;
  provenance?: {
    acquisition: "retrieve" | "generate" | "edit" | "upload";
    provider: string;
    sourceUrl?: string;
    finalUrl?: string;
    redirects?: string[];
    licenceNote?: string;
    model?: string;
    retrievedAt?: string;
    byteSize?: number;
    actorId?: string;
  } | null;
  rights?: {
    status: MediaRightsStatus;
    source: "media-rights" | "provider" | "unrecorded";
    licence?: string | null;
    rightsHolder?: string | null;
    observedAt?: string;
  } | null;
  rightsAcknowledgement?: {
    assetUrl: string;
    rightsStatus: MediaRightsStatus;
    actorEmail: string;
    at: string;
    note: string;
  } | null;
  review?: {
    status: "pending" | "approved" | "rejected";
    assetUrl: string;
    mediaReviewRevision: number;
    actorEmail: string;
    at: string;
    reasonCode?: string | null;
    explanation?: string | null;
  } | null;
  failureReason?: string | null;
}

export interface CandidateMediaFinding {
  code: string;
  slotKey: string;
  severity: "blocking" | "warning";
  message: string;
  rightsStatus?: MediaRightsStatus;
  acknowledged?: boolean;
}

/** What the registry declares for one slot of the candidate's target. */
export interface CandidateMediaSlotDescriptor {
  slotKey: string;
  purpose: "gameplay" | "decorative";
  required: boolean;
  mediaType: "image" | "audio";
  uploadSupported: boolean;
  uploadUnsupportedReason: string | null;
}

export interface CandidateMediaReadiness {
  governed: boolean;
  slots?: CandidateMediaSlotDescriptor[];
  contractVersion: string | null;
  requirementsDigest: string | null;
  mediaReviewRevision: number;
  requiredSlotKeys: string[];
  ready: boolean;
  blockers: CandidateMediaFinding[];
  warnings: CandidateMediaFinding[];
}

export interface CandidateMediaEvent {
  action:
    | "media_attached"
    | "media_reviewed"
    | "media_rights_acknowledged"
    | "media_reviews_invalidated";
  slotKeys: string[];
  actorEmail: string;
  occurredAt: string;
  mediaReviewRevision: number;
  reviewRevision: number;
  details: Record<string, unknown>;
}

/** R4-A server evidence bound into an `ovl1:` overlap fingerprint. */
export type OverlapReferenceKind =
  | "CANONICAL_READY"
  | "CANONICAL_DRAFT"
  | "APPROVED_CANDIDATE"
  | "BATCH_CANDIDATE";

export interface OverlapEvidence {
  candidateContentHash: string;
  reasonCode: string | null;
  reference: { kind: OverlapReferenceKind | string; id: string; contentHash: string };
}

export interface ScreenFinding {
  code: string;
  severity: "blocking" | "warning" | "deferred";
  message: string;
  /** Present only on server-verifiable POTENTIAL_OVERLAP_* findings. */
  fingerprint?: string;
  evidence?: OverlapEvidence;
}

/** One overlap as described by a 409 approval conflict (`details.overlaps`). */
export interface ServerOverlapRequirement {
  fingerprint: string;
  code: string;
  reasonCode: string | null;
  reference: { kind: OverlapReferenceKind | string; id: string; contentHash: string };
}

export interface InvalidatedAssessmentSnapshot {
  invalidatedAtRevision: number;
  previousRevision: number;
  invalidatedBy?: string;
  invalidatedByEmail?: string;
  invalidatedAt?: string;
  reason?: string;
  changedFields?: string[];
  factVerification?: Record<string, unknown> | null;
  qualityEvaluation?: Record<string, unknown> | null;
  humanAssessment?: {
    factualState?: FactualState;
    factualExplanation?: string;
    assessedRevision?: number;
    reviewerEmail?: string;
  } | null;
  reviewDecision?: Record<string, unknown> | null;
}

export type SlotGenerationMode = "exploitation" | "exploration";

export interface CreativeSlotAssignment {
  slotIndex: number;
  familyKey: string;
  familyNameAr: string;
  mode: SlotGenerationMode;
  difficulty?: "easy" | "medium" | "hard" | string;
  cognitiveTask?: string;
  creativeAngle?: string;
  mechanicFit?: string;
  selectionReason?: string;
}

export interface FamilyComplianceStatus {
  assignedFamilyKey: string;
  detectedFamilyKey?: string;
  isCompliant: boolean;
  verificationMethod: "heuristic" | "manual_review" | "rule_evaluated";
  mismatchReason?: string;
  resolvedByReviewerId?: string;
}

export interface FamilyComplianceResolution {
  resolvedByReviewer: boolean;
  assignedFamilyKey: string;
  reviewerExplanation: string;
  resolvedAt?: string | Date;
}

export interface ReviewCandidate {
  id: string;
  candidateId: string;
  jobId: string;
  status: string;
  reviewStatus: ReviewStatus;
  reviewRevision: number;
  draft: Partial<ContentItem> | null;
  /** Authoring rationale. Never part of the ContentItem; review context only. */
  authoring: {
    concept?: string;
    answerBasis?: "reasoning" | "knowledge-anchored";
    playerReasoningStrategy?: string;
    domainDescription?: string;
    stepsFromMin?: number;
    /** RYO: why each incorrect option is plausible, keyed by option id. */
    distractorRationale?: Array<{ optionId: string; why: string }>;
    /** RYO: an authoring hypothesis about table difficulty, not a measurement. */
    estimatedConfidence?: { band: string; why: string };
    /** Slice 3: Creative slot assignment from deterministic planner */
    assignedSlot?: CreativeSlotAssignment;
    /** Slice 3C: Family compliance evaluation */
    familyCompliance?: FamilyComplianceStatus;
  } | null;
  factualClaims: string[];
  findings: ScreenFinding[];
  factVerification: Record<string, unknown> | null;
  qualityEvaluation: Record<string, unknown> | null;
  compatibilityEvaluation: Record<string, unknown> | null;
  humanAssessment: {
    factualState: FactualState;
    factualExplanation: string;
    evidence: Array<{
      url: string;
      title?: string;
      note?: string;
      claimIndex?: number;
      claimText?: string;
    }>;
    quality: QualityRubric;
    assessedRevision?: number;
    reviewerEmail: string;
    assessedAt: string;
  } | null;
  lastInvalidatedAssessments?: InvalidatedAssessmentSnapshot | null;
  reviewEligibility?: ReviewEligibility;
  reviewDecision: {
    decision?: string;
    explanation?: string;
    factualOverrideCode?: string;
    factualOverrideExplanation?: string;
    exceptionalOverride?: boolean;
    familyComplianceResolution?: FamilyComplianceResolution | null;
    reviewerId?: string;
    reviewerEmail?: string;
    decidedAt?: string | Date;
    revision?: number;
    [key: string]: unknown;
  } | null;
  reviewEvents: Array<{
    action: string;
    actorEmail: string;
    occurredAt: string;
    revision: number;
    reasonCode?: string | null;
    explanation?: string | null;
    details?: Record<string, unknown> | null;
  }>;
  publishedContentItemId: string | null;
  /** §30.22 media state; empty/0 for candidates outside the media contract. */
  mediaPlan?: CandidateMediaSlot[];
  mediaReviewRevision?: number;
  mediaEvents?: CandidateMediaEvent[];
  canonicalTarget?: {
    worldId: string;
    worldKey?: string;
    scopeId: string;
    scopeKey?: string;
    scopeName?: string;
    challengeTypeId: string;
    mechanicKey?: string;
    challengeTypeName?: string;
    challengeAnswerMode?: string;
  } | null;
  targetResolutionError?: string | null;
  job: {
    id: string;
    mechanicKey: string;
    worldKey: string;
    scopeKey: string;
    status: string;
    specVersion?: string | null;
  } | null;
}

export interface QualityRubric {
  correctness: number;
  mechanicFit: number;
  clarity: number;
  multiplayerFit: number;
  originality: number;
  explanation: string;
}

export interface SpendingSummary {
  jobId: string;
  spentMicros: number;
  reservedMicros: number;
  spentSar: number;
  reservedSar: number;
  stages: Array<{
    stage: string;
    calls: number;
    actualMicros: number;
    reservedMicros: number;
    unknownUsage: number;
  }>;
}
