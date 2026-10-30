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
  findings: Array<{
    code: string;
    severity: "blocking" | "warning" | "deferred";
    message: string;
  }>;
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
