import type { ContentItem } from "@/features/world-management/types";

export type ReviewStatus = "pending" | "approved" | "rejected";
export type FactualState =
  "SUPPORTED" | "UNSUPPORTED" | "CONTRADICTED" | "UNRESOLVED";

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
    evidence: Array<{ url: string; title?: string; note?: string }>;
    quality: QualityRubric;
    reviewerEmail: string;
    assessedAt: string;
  } | null;
  reviewDecision: Record<string, unknown> | null;
  reviewEvents: Array<{
    action: string;
    actorEmail: string;
    occurredAt: string;
    revision: number;
    reasonCode?: string | null;
    explanation?: string | null;
  }>;
  publishedContentItemId: string | null;
  canonicalTarget?: {
    worldId: string;
    scopeId: string;
    challengeTypeId: string;
  } | null;
  job: {
    id: string;
    mechanicKey: string;
    worldKey: string;
    scopeKey: string;
    status: string;
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
