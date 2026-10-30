import {
  CanonicalFamilyCatalog,
  MechanicFitRating,
} from './canonical-family.types';
import { ScopeHistoricalCoverageReport } from './historical-coverage.types';

export type SlotGenerationMode = 'exploitation' | 'exploration';

/**
 * Lightweight per-question generation slot directive.
 * Instructs the generator on the specific family, cognitive task, and difficulty for this index.
 */
export interface GenerationSlot {
  /** 0-based index matching candidate batch ordinal. */
  slotIndex: number;
  /** Canonical family identifier (e.g. 'anagram-rearrange'). */
  familyKey: string;
  /** Human-readable Arabic name from catalog. */
  familyNameAr: string;
  /** Strategic generation mode. */
  mode: SlotGenerationMode;
  /** Pinned difficulty for this slot. */
  difficulty: 'easy' | 'medium' | 'hard';
  /** Primary cognitive solve required of the player. */
  cognitiveTask: string;
  /** Creative angle or challenge direction for generator inspiration. */
  creativeAngle: string;
  /** Canonical rating for this mechanic in the Scope profile. */
  mechanicFit: MechanicFitRating;
  /** Operational justification for why this family was selected. */
  selectionReason: string;
}

/**
 * Diversity configuration parameters for the creative slot allocator.
 */
export interface PlannerDiversityConfig {
  /** Long-run target exploration ratio for batches with N >= minBatchForExploration (default: 0.30). */
  targetExplorationRatio: number;
  /** Minimum batch size before any exploration slot is introduced (default: 3). */
  minBatchForExploration: number;
  /** Soft capacity threshold for verified human-approved questions per family (default: 50). */
  softCapThreshold: number;
  /** Discount multiplier applied to saturation weighting past the threshold (default: 0.25). */
  softCapDiscount: number;
  /** Maximum fraction of slots a single family may occupy when catalog has >= 3 eligible families (default: 0.50). */
  maxFamilyBatchShare: number;
}

export const DEFAULT_PLANNER_DIVERSITY_CONFIG: Readonly<PlannerDiversityConfig> =
  {
    targetExplorationRatio: 0.3,
    minBatchForExploration: 3,
    softCapThreshold: 50,
    softCapDiscount: 0.25,
    maxFamilyBatchShare: 0.5,
  };

/**
 * Authoritative constraints optionally declared by a Scope profile.
 */
export interface ScopeDiversityConstraint {
  allowedFamilyKeys?: string[];
  forbiddenFamilyKeys?: string[];
  maxSlotsPerFamily?: Record<string, number>;
  exactFamilyDistribution?: Record<string, number>;
}

/**
 * Input arguments for allocating creative slots.
 */
export interface SlotAllocationInput {
  worldKey: string;
  scopeKey: string;
  mechanicKey: string;
  count: number;
  difficulty?: string;
  difficultyQuotas: Record<string, number>;
  catalog?: CanonicalFamilyCatalog | null;
  coverage?: ScopeHistoricalCoverageReport | null;
  config?: Partial<PlannerDiversityConfig>;
  scopeConstraints?: ScopeDiversityConstraint;
  seed?: string;
}

/**
 * Result of allocating creative slots for a batch.
 */
export interface CreativeSlotAllocationResult {
  slots: GenerationSlot[];
  catalogDigest?: string;
  coverageDigest?: string;
  exploitationCount: number;
  explorationCount: number;
  distinctFamiliesCount: number;
  diagnostics: string[];
}

/**
 * Boundary contract for future candidate-family compliance validation (Slice 3C / Phase 1c).
 * Slot assignment alone is an authoring directive, not proof of candidate compliance.
 */
export interface FamilyComplianceEvaluation {
  assignedFamilyKey: string;
  detectedFamilyKey?: string;
  isCompliant: boolean;
  verificationMethod: 'heuristic' | 'manual_review' | 'rule_evaluated';
  mismatchReason?: string;
}

export type CreativePlannerErrorCode =
  | 'FAMILY_CATALOG_MALFORMED'
  | 'NO_COMPATIBLE_FAMILIES_FOR_MECHANIC'
  | 'INVALID_ALLOCATION_PARAMETERS'
  | 'SCOPE_CONSTRAINTS_UNSATISFIABLE'
  | 'HISTORICAL_COVERAGE_INCOMPLETE';

export class CreativePlannerError extends Error {
  constructor(
    readonly code: CreativePlannerErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(`CreativePlannerError [${code}]: ${message}`);
    this.name = 'CreativePlannerError';
  }
}
