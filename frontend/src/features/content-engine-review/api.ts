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

export const rescreenCandidate = (
  candidateId: string,
  expectedRevision: number,
) =>
  unwrap<ReviewCandidate>(
    apiClient.post(
      `/admin/content-engine/candidates/${candidateId}/rescreen`,
      { expectedRevision },
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
export type RyoRequestedDifficulty =
  | "mixed"
  | "easy"
  | "medium"
  | "relatively_difficult";

export interface EngineJobRequest {
  mechanicKey: string;
  worldKey: string;
  scopeKey: string;
  targetCount: number;
  difficulty?: RyoRequestedDifficulty | string;
  batchGuidance?: string;
}

export interface EngineSubmitJobRequest extends EngineJobRequest {
  planDigest: string;
}

export interface EngineGenerationSpecification {
  specVersion: number;
  worldKey: string;
  scopeKey: string;
  mechanicKey: string;
  answerMode: "MC" | "NUMERIC";
  targetCount: number;
  difficulty: RyoRequestedDifficulty | null;
  ryoDifficultyTargets: {
    easy: number;
    medium: number;
    relativelyDifficult?: number;
    relatively_difficult?: number;
  } | null;
  batchGuidance: string | null;
  promptVersion: string;
  provider: string;
  generationModel: string;
  qualityModel: string | null;
  temperature: number;
  outputTokensPerCandidate: number;
  maxOutputTokens: number;
  contextHash: string;
  ruleSetDigest: string;
}

export interface EngineScopeMechanicOption {
  mechanicKey: string;
  category: "standard" | "signature";
  boundWorldKey: string | null;
  manifestStatus: string;
  generatorSupported: boolean;
  answerMode: "MC" | "NUMERIC" | null;
  authorable: boolean;
  runtimeCompatible: boolean;
  runtimeTargetResolved: boolean;
  eligible: boolean;
  onBoard: boolean;
  offBoardAuthoringAllowed: boolean;
  boardSlotKeys: string[];
  supportsDifficultySelection: boolean;
  supportedDifficulties: RyoRequestedDifficulty[];
  defaultDifficulty: RyoRequestedDifficulty | null;
  difficultyDeferredReason: string | null;
  blockedCode: string | null;
  blockedReason: string | null;
}

export interface EngineScopeOption {
  scopeKey: string;
  worldKey: string;
  name: string | null;
  runtimeScopeId: string | null;
  runtimeStatus: string | null;
  runtimeTargetResolved: boolean;
  exemplarsPresent: boolean;
  excludedMechanicKeys: string[];
  eligible: boolean;
  blockedCode: string | null;
  blockedReason: string | null;
  mechanics: EngineScopeMechanicOption[];
}

export interface EngineWorldOption {
  worldKey: string;
  name: string | null;
  runtimeWorldId: string | null;
  runtimeStatus: string | null;
  runtimeTargetResolved: boolean;
  eligible: boolean;
  blockedCode: string | null;
  blockedReason: string | null;
  scopes: EngineScopeOption[];
}

export interface EngineMechanicCatalogOption {
  mechanicKey: string;
  aliases: string[];
  name: string | null;
  category: "standard" | "signature";
  boundWorldKey: string | null;
  manifestStatus: string;
  generatorSupported: boolean;
  answerMode: "MC" | "NUMERIC" | null;
  runtimeChallengeTypeId: string | null;
  runtimeStatus: string | null;
  runtimeTargetResolved: boolean;
  eligible: boolean;
  supportsDifficultySelection: boolean;
  supportedDifficulties: RyoRequestedDifficulty[];
  defaultDifficulty: RyoRequestedDifficulty | null;
  difficultyDeferredReason: string | null;
  experimentalDifficultyDistribution: {
    easy: number;
    medium: number;
    relativelyDifficult?: number;
    relatively_difficult?: number;
  } | null;
  blockedCode: string | null;
  blockedReason: string | null;
}

export interface EngineAuthoringOptions {
  specVersion: number;
  limits: {
    minTargetCount: number;
    maxTargetCount: number;
    maxBatchGuidanceLength: number;
  };
  engine: {
    engineEnabled: boolean;
    provider: string | null;
    generationModel: string | null;
    qualityModel: string | null;
    providerConfigured: boolean;
    generationModelConfigured: boolean;
    qualityModelConfigured: boolean;
    liveProviderEnabled: boolean;
    providerReady: boolean;
    pricingConfigured: boolean;
    estimatedMicros?: number;
    estimatedSar?: number;
    submissionReady: boolean;
    blockedCode: string | null;
    blockedReason: string | null;
  };
  worlds: EngineWorldOption[];
  scopes: EngineScopeOption[];
  mechanics: EngineMechanicCatalogOption[];
}

export interface EnginePreflight {
  resolvable: boolean;
  submissionReady?: boolean;
  planDigest?: string;
  generationPlan?: {
    digest?: string;
    catalogDigest?: string;
    coverageDigest?: string;
    slots?: Array<{
      slotIndex: number;
      familyKey: string;
      familyNameAr: string;
      mode: "exploitation" | "exploration";
      difficulty?: string;
      cognitiveTask?: string;
      creativeAngle?: string;
      mechanicFit?: string;
      selectionReason?: string;
    }>;
    diversityMetrics?: {
      exploitationCount: number;
      explorationCount: number;
      distinctFamiliesCount: number;
      diagnostics: string[];
    };
    [key: string]: unknown;
  };
  generationSpec?: EngineGenerationSpecification;
  contextHash?: string;
  ruleSetDigest?: string;
  estimatedMicros?: number;
  estimatedSar?: number;
  generationEstimatedMicros?: number;
  conditionalJudgeEstimatedMicros?: number;
  maxJudgeEstimatedMicros?: number;
  judgeEligible?: boolean;
  pricingConfigured: boolean;
  liveProviderEnabled: boolean;
  engineEnabled: boolean;
  providerConfigured?: boolean;
  providerReady?: boolean;
  onBoard?: boolean;
  offBoardAuthoringAllowed?: boolean;
  boardSlotKeys?: string[];
  withinBatchCap?: boolean;
  withinMonthlyBudget?: boolean;
  generatorSupported?: boolean;
  budget: {
    periodKey: string;
    capMicros: number;
    spentMicros: number;
    reservedMicros: number;
    availableMicros: number;
  };
  diagnostic?: {
    code: string;
    message: string;
  };
  blockedCode?: string;
  blockedReason?: string;
  ruleConflicts?: Array<{
    field: string;
    message: string;
    sources?: string[];
  }>;
}

export type EngineLifecycleStatus =
  | "queued"
  | "leased"
  | "awaiting_review"
  | "completed"
  | "failed"
  | "cancelled";

export interface EngineJobStatus {
  jobId: string;
  worldKey?: string;
  scopeKey?: string;
  mechanicKey?: string;
  targetCount?: number;
  status: EngineLifecycleStatus | string;
  pipelineStage: string;
  attempts: number;
  cancellationRequested: boolean;
  awaitingReviewReason: string | null;
  lastError: string | null;
  specVersion?: number | null;
  generationSpec?: EngineGenerationSpecification | null;
  planDigest?: string | null;
  pinnedPlan?: {
    digest?: string;
    catalogDigest?: string;
    coverageDigest?: string;
    slots?: Array<{
      slotIndex: number;
      familyKey: string;
      familyNameAr: string;
      mode: "exploitation" | "exploration";
      difficulty?: string;
      cognitiveTask?: string;
      creativeAngle?: string;
      mechanicFit?: string;
      selectionReason?: string;
    }>;
    diversityMetrics?: {
      exploitationCount: number;
      explorationCount: number;
      distinctFamiliesCount: number;
      diagnostics: string[];
    };
    [key: string]: unknown;
  } | null;
  provenanceComplete?: boolean;
  createdBy?: string | null;
  createdByEmail?: string | null;
  lastExecutedBy?: string | null;
  lastExecutedByEmail?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  candidates: Record<string, number>;
  spentMicros: number;
  spentSar: number;
  outstandingReservedMicros: number;
  providerCalls: number;
}

export interface EngineJobListResponse {
  items: EngineJobStatus[];
  nextCursor: string | null;
}

export interface EngineJobListQuery {
  cursor?: string;
  limit?: number;
  status?: string;
  worldKey?: string;
  scopeKey?: string;
  mechanicKey?: string;
}

/**
 * Normalizes operator batch guidance consistently with backend
 * `normalizeBatchGuidance` (CRLF -> LF, trim, empty -> undefined).
 */
export const normalizeBatchGuidanceInput = (
  raw: string | null | undefined,
): string | undefined => {
  if (typeof raw !== "string") return undefined;
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  return normalized.length > 0 ? normalized : undefined;
};

/** Read-only server-derived authoring options. */
export const getAuthoringOptions = () =>
  unwrap<EngineAuthoringOptions>(
    apiClient.get("/admin/content-engine/options"),
  );

/** Read-only: what it would cost and whether it is even authorable. */
export const preflightJob = (data: EngineJobRequest) =>
  unwrap<EnginePreflight>(
    apiClient.post("/admin/content-engine/jobs/preflight", data),
  );

/** Idempotent server-side: the same combination resolves to one job. */
export const submitJob = (data: EngineSubmitJobRequest) =>
  unwrap<{
    jobId: string;
    created: boolean;
    contextHash: string;
    planDigest?: string;
    specVersion?: number;
    generationSpec?: EngineGenerationSpecification | null;
    createdBy?: string;
    createdByEmail?: string;
  }>(apiClient.post("/admin/content-engine/jobs", data));

/** Explicitly runs the targeted queued job. Never triggers untargeted run-next. */
export const runJob = (jobId: string) =>
  unwrap<{ jobId: string | null; alreadyRunning: boolean }>(
    apiClient.post(`/admin/content-engine/jobs/${jobId}/run`, {}),
  );

/** Explicitly runs the targeted queued job via `/jobs/run` with `{ jobId }`. */
export const runNextJob = (jobId: string) =>
  unwrap<{ jobId: string | null; alreadyRunning: boolean }>(
    apiClient.post("/admin/content-engine/jobs/run", { jobId }),
  );

/** Read-only paginated job list ordered newest-first. */
export const listJobs = (params?: EngineJobListQuery) =>
  unwrap<EngineJobListResponse>(
    apiClient.get("/admin/content-engine/jobs", { params }),
  );

export const getJobStatus = (jobId: string) =>
  unwrap<EngineJobStatus>(apiClient.get(`/admin/content-engine/jobs/${jobId}`));

export const cancelJob = (jobId: string) =>
  unwrap<boolean>(
    apiClient.post(`/admin/content-engine/jobs/${jobId}/cancel`, {}),
  );
