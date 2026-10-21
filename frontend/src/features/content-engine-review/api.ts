import apiClient from "@/lib/api/client";
import type { QualityRubric, ReviewCandidate, SpendingSummary } from "./types";

const unwrap = async <T>(request: Promise<{ data: { data: T } }>) =>
  (await request).data.data;

export const listCandidates = (params: Record<string, string | undefined>) =>
  unwrap<ReviewCandidate[]>(
    apiClient.get("/admin/content-engine/candidates", { params }),
  );

export const getCandidate = (candidateId: string) =>
  unwrap<ReviewCandidate>(
    apiClient.get(`/admin/content-engine/candidates/${candidateId}`),
  );

export const getSpending = (jobId: string) =>
  unwrap<SpendingSummary>(
    apiClient.get(`/admin/content-engine/jobs/${jobId}/spending`),
  );

export const editCandidate = (
  candidateId: string,
  data: {
    expectedRevision: number;
    draft: Record<string, unknown>;
    factualClaims: string[];
    explanation: string;
  },
) =>
  unwrap<ReviewCandidate>(
    apiClient.patch(`/admin/content-engine/candidates/${candidateId}`, data),
  );

export const assessCandidate = (
  candidateId: string,
  data: {
    expectedRevision: number;
    factualState: string;
    factualExplanation: string;
    evidence: Array<{ url: string; title?: string }>;
    quality: QualityRubric;
  },
) =>
  unwrap<ReviewCandidate>(
    apiClient.post(
      `/admin/content-engine/candidates/${candidateId}/assessment`,
      data,
    ),
  );

export const approveCandidate = (
  candidateId: string,
  data: Record<string, unknown>,
) =>
  unwrap<ReviewCandidate>(
    apiClient.post(
      `/admin/content-engine/candidates/${candidateId}/approve`,
      data,
    ),
  );

export const rejectCandidate = (
  candidateId: string,
  data: Record<string, unknown>,
) =>
  unwrap<ReviewCandidate>(
    apiClient.post(
      `/admin/content-engine/candidates/${candidateId}/reject`,
      data,
    ),
  );

export const createCanonicalDraft = (
  candidateId: string,
  expectedRevision: number,
) =>
  unwrap<{ contentItemId: string; status: "draft"; alreadyCreated: boolean }>(
    apiClient.post(
      `/admin/content-engine/candidates/${candidateId}/create-draft`,
      { expectedRevision },
    ),
  );

/** A batch request: the authorable combination plus how many candidates. */
export interface EngineJobRequest {
  mechanicKey: string;
  worldKey: string;
  scopeKey: string;
  targetCount: number;
}

export interface EnginePreflight {
  resolvable: boolean;
  contextHash?: string;
  estimatedMicros?: number;
  estimatedSar?: number;
  pricingConfigured: boolean;
  liveProviderEnabled: boolean;
  engineEnabled: boolean;
  budget: {
    periodKey: string;
    capMicros: number;
    spentMicros: number;
    reservedMicros: number;
    availableMicros: number;
  };
  blockedReason?: string;
}

export interface EngineJobStatus {
  jobId: string;
  status: string;
  pipelineStage: string;
  attempts: number;
  cancellationRequested: boolean;
  awaitingReviewReason: string | null;
  lastError: string | null;
  candidates: Record<string, number>;
  spentMicros: number;
  spentSar: number;
  outstandingReservedMicros: number;
  providerCalls: number;
}

/** Read-only: what it would cost and whether it is even authorable. */
export const preflightJob = (data: EngineJobRequest) =>
  unwrap<EnginePreflight>(
    apiClient.post("/admin/content-engine/jobs/preflight", data),
  );

/** Idempotent server-side: the same combination resolves to one job. */
export const submitJob = (data: EngineJobRequest) =>
  unwrap<{ jobId: string; created: boolean; contextHash: string }>(
    apiClient.post("/admin/content-engine/jobs", data),
  );

/** Explicitly runs one queued job. There is no background worker. */
export const runNextJob = () =>
  unwrap<{ jobId: string | null; alreadyRunning: boolean }>(
    apiClient.post("/admin/content-engine/jobs/run", {}),
  );

export const getJobStatus = (jobId: string) =>
  unwrap<EngineJobStatus>(apiClient.get(`/admin/content-engine/jobs/${jobId}`));

export const cancelJob = (jobId: string) =>
  unwrap<boolean>(apiClient.post(`/admin/content-engine/jobs/${jobId}/cancel`, {}));
