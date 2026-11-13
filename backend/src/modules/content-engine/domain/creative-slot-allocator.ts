import { createHash } from 'crypto';
import { CanonicalFamily, MechanicFitRating } from './canonical-family.types';
import {
  CreativePlannerError,
  CreativeSlotAllocationResult,
  DEFAULT_PLANNER_DIVERSITY_CONFIG,
  GenerationSlot,
  PlannerDiversityConfig,
  SlotAllocationInput,
  SlotGenerationMode,
} from './creative-plan.types';

/**
 * Returns a deterministic pseudo-random number generator (sfc32)
 * seeded by a SHA-256 digest of the given seed string.
 */
export function createDeterministicRng(seedStr: string): () => number {
  const hash = createHash('sha256').update(seedStr).digest();
  let a = hash.readUInt32BE(0);
  let b = hash.readUInt32BE(4);
  let c = hash.readUInt32BE(8);
  let d = hash.readUInt32BE(12);

  return function sfc32(): number {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    t = (t + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * Computes the number of exploration slots for a batch.
 *
 * Implements the approved deterministic small-batch table for default configuration:
 * N=1 -> 0, N=2 -> 0, N=3 -> 1, N=4 -> 1, N=5 -> 1,
 * N=6 -> 2, N=7 -> 2, N=8 -> 2, N=9 -> 3, N=10 -> 3.
 */
export function computeExplorationCount(
  batchSize: number,
  config: PlannerDiversityConfig = DEFAULT_PLANNER_DIVERSITY_CONFIG,
): number {
  if (batchSize <= 0) return 0;
  if (batchSize < config.minBatchForExploration) return 0;

  // Approved small-batch exact table for default configuration
  if (
    config.targetExplorationRatio ===
      DEFAULT_PLANNER_DIVERSITY_CONFIG.targetExplorationRatio &&
    config.minBatchForExploration ===
      DEFAULT_PLANNER_DIVERSITY_CONFIG.minBatchForExploration
  ) {
    if (batchSize === 1) return 0;
    if (batchSize === 2) return 0;
    if (batchSize === 3) return 1;
    if (batchSize === 4) return 1;
    if (batchSize === 5) return 1;
    if (batchSize === 6) return 2;
    if (batchSize === 7) return 2;
    if (batchSize === 8) return 2;
    if (batchSize === 9) return 3;
    if (batchSize === 10) return 3;
  }

  // General rounding for larger batches or custom configurations
  const raw = Math.round(batchSize * config.targetExplorationRatio);
  const minExploration = config.targetExplorationRatio > 0 ? 1 : 0;
  const maxExploration =
    config.targetExplorationRatio >= 1.0
      ? batchSize
      : Math.max(0, batchSize - 1);

  return Math.max(minExploration, Math.min(maxExploration, raw));
}

/**
 * Calculates continuous, strictly positive saturation weighting based on
 * verified human-approved item count.
 *
 * Properties:
 * - Strictly positive (never zero, never negative, never hard-blocking)
 * - Monotonically decreasing
 * - Continuous at threshold T (no cliff or discontinuity)
 * - S(0) = 1 + (1 - discount) [1.75 with default discount 0.25]
 * - S(T) = 1.0
 * - S(C) decays smoothly as C > T
 */
export function calculateContinuousSaturationWeight(
  humanApprovedCount: number,
  threshold: number = DEFAULT_PLANNER_DIVERSITY_CONFIG.softCapThreshold,
  discount: number = DEFAULT_PLANNER_DIVERSITY_CONFIG.softCapDiscount,
): number {
  if (threshold <= 0) return 1.0;
  const count = Math.max(
    0,
    Number.isFinite(humanApprovedCount) ? humanApprovedCount : 0,
  );
  const effectiveDiscount = Math.max(0.01, Math.min(0.99, discount));

  if (count <= threshold) {
    return 1.0 + (1.0 - effectiveDiscount) * (1.0 - count / threshold);
  }

  return 1.0 / (1.0 + (count - threshold) / (effectiveDiscount * threshold));
}

/**
 * Maps a canonical mechanic fit rating to a numeric base multiplier.
 */
export function getMechanicFitMultiplier(rating?: MechanicFitRating): number {
  switch (rating) {
    case 'EXCELLENT':
      return 1.5;
    case 'GOOD':
      return 1.0;
    case 'LIMITED':
      return 0.5;
    case 'DO_NOT_FORCE':
      return 0.0;
    default:
      return 0.8;
  }
}

/**
 * Validates canonical family catalog format and compatibility.
 */
function validateCatalog(
  catalog: unknown,
  expectedWorldKey: string,
  expectedScopeKey: string,
): void {
  if (!catalog || typeof catalog !== 'object') {
    throw new CreativePlannerError(
      'FAMILY_CATALOG_MALFORMED',
      'Provided catalog is not a valid object',
    );
  }

  const cat = catalog as Record<string, unknown>;

  if (cat.version !== 1) {
    throw new CreativePlannerError(
      'FAMILY_CATALOG_MALFORMED',
      `Unsupported catalog version: ${String(cat.version)} (expected 1)`,
    );
  }

  if (typeof cat.worldKey !== 'string' || cat.worldKey !== expectedWorldKey) {
    throw new CreativePlannerError(
      'FAMILY_CATALOG_MALFORMED',
      `Catalog worldKey mismatch: received "${String(cat.worldKey)}", expected "${expectedWorldKey}"`,
    );
  }

  if (typeof cat.scopeKey !== 'string' || cat.scopeKey !== expectedScopeKey) {
    throw new CreativePlannerError(
      'FAMILY_CATALOG_MALFORMED',
      `Catalog scopeKey mismatch: received "${String(cat.scopeKey)}", expected "${expectedScopeKey}"`,
    );
  }

  if (!Array.isArray(cat.families) || cat.families.length === 0) {
    throw new CreativePlannerError(
      'FAMILY_CATALOG_MALFORMED',
      'Catalog must declare a non-empty array of canonical families',
    );
  }

  for (const [index, f] of cat.families.entries()) {
    if (!f || typeof f !== 'object') {
      throw new CreativePlannerError(
        'FAMILY_CATALOG_MALFORMED',
        `Catalog family at index ${index} is invalid`,
      );
    }
    const fam = f as Record<string, unknown>;
    if (typeof fam.familyKey !== 'string' || !fam.familyKey.trim()) {
      throw new CreativePlannerError(
        'FAMILY_CATALOG_MALFORMED',
        `Catalog family at index ${index} is missing a valid familyKey`,
      );
    }
    if (typeof fam.name !== 'string' || !fam.name.trim()) {
      throw new CreativePlannerError(
        'FAMILY_CATALOG_MALFORMED',
        `Catalog family "${fam.familyKey}" is missing a valid Arabic name`,
      );
    }
  }
}

/**
 * Interleaves difficulty quotas deterministically into an ordered list.
 */
function buildSlotDifficulties(
  count: number,
  difficultyQuotas: Record<string, number>,
): Array<'easy' | 'medium' | 'hard'> {
  const tiers: Array<'easy' | 'medium' | 'hard'> = ['medium', 'easy', 'hard'];
  const remaining: Record<string, number> = { ...difficultyQuotas };
  const result: Array<'easy' | 'medium' | 'hard'> = [];

  for (let i = 0; i < count; i++) {
    let assigned: 'easy' | 'medium' | 'hard' | null = null;
    for (let offset = 0; offset < tiers.length; offset++) {
      const tier = tiers[(i + offset) % tiers.length];
      if ((remaining[tier] ?? 0) > 0) {
        assigned = tier;
        remaining[tier]--;
        break;
      }
    }
    if (!assigned) {
      assigned = 'medium';
    }
    result.push(assigned);
  }
  return result;
}

/**
 * Builds slot generation mode sequence (exploitation vs exploration).
 */
function buildSlotModes(
  batchSize: number,
  explorationCount: number,
): SlotGenerationMode[] {
  if (batchSize <= 0) return [];
  if (explorationCount <= 0) {
    return Array.from({ length: batchSize }, () => 'exploitation');
  }
  if (explorationCount >= batchSize) {
    return Array.from({ length: batchSize }, () => 'exploration');
  }

  const modes: SlotGenerationMode[] = Array.from(
    { length: batchSize },
    () => 'exploitation',
  );

  // Deterministically space exploration slots across the batch
  const interval = batchSize / explorationCount;
  for (let e = 0; e < explorationCount; e++) {
    const idx = Math.min(batchSize - 1, Math.floor((e + 1) * interval - 0.5));
    modes[idx] = 'exploration';
  }

  return modes;
}

/**
 * Allocates creative slots deterministically for a batch.
 */
export function allocateCreativeSlots(
  input: SlotAllocationInput,
): CreativeSlotAllocationResult {
  if (input.count < 0) {
    throw new CreativePlannerError(
      'INVALID_ALLOCATION_PARAMETERS',
      `Requested candidate count cannot be negative: ${input.count}`,
    );
  }

  // Missing catalog: preserve V1 behavior by emitting diagnostic and returning empty slots
  if (input.catalog === null || input.catalog === undefined) {
    return {
      slots: [],
      exploitationCount: 0,
      explorationCount: 0,
      distinctFamiliesCount: 0,
      diagnostics: [
        `FAMILY_CATALOG_UNAVAILABLE: No canonical family catalog provided for scope "${input.scopeKey}"`,
      ],
    };
  }

  // Validate catalog schema and scope/world compatibility (fail closed on malformed)
  validateCatalog(input.catalog, input.worldKey, input.scopeKey);

  if (input.count === 0) {
    return {
      slots: [],
      catalogDigest: input.catalog.digest,
      exploitationCount: 0,
      explorationCount: 0,
      distinctFamiliesCount: 0,
      diagnostics: ['EMPTY_BATCH: Zero candidates requested'],
    };
  }

  // Fail closed if coverage is explicitly incomplete or unavailable
  if (input.coverage) {
    if (
      input.coverage.worldKey !== input.worldKey ||
      input.coverage.scopeKey !== input.scopeKey
    ) {
      throw new CreativePlannerError(
        'HISTORICAL_COVERAGE_INCOMPLETE',
        `Coverage report scope mismatch: coverage is for "${input.coverage.worldKey}/${input.coverage.scopeKey}", but planning requested "${input.worldKey}/${input.scopeKey}"`,
      );
    }

    const hasIncompleteWarning = (
      input.coverage.diagnostics?.warnings ?? []
    ).some(
      (w) =>
        w.includes('HISTORICAL_INVENTORY_PARTIAL') ||
        w.includes('HISTORICAL_INVENTORY_UNAVAILABLE') ||
        w.includes('HISTORICAL_INVENTORY_NOT_CONFIGURED') ||
        w.includes('HISTORICAL_INVENTORY_SCOPE_MISMATCH') ||
        w.includes('not found in database catalog'),
    );
    if (hasIncompleteWarning) {
      throw new CreativePlannerError(
        'HISTORICAL_COVERAGE_INCOMPLETE',
        `Historical coverage for scope "${input.worldKey}/${input.scopeKey}" is incomplete or unavailable`,
        { warnings: input.coverage.diagnostics?.warnings },
      );
    }
  }

  const config: PlannerDiversityConfig = {
    ...DEFAULT_PLANNER_DIVERSITY_CONFIG,
    ...input.config,
  };

  // Filter eligible families according to mechanic fit and scope constraints
  const allFamilies = [...input.catalog.families].sort((a, b) =>
    a.familyKey.localeCompare(b.familyKey),
  );

  const eligibleFamilies: CanonicalFamily[] = [];
  const diagnostics: string[] = [];

  for (const fam of allFamilies) {
    const fit = fam.mechanicFit?.[input.mechanicKey];

    // Exclude DO_NOT_FORCE
    if (fit === 'DO_NOT_FORCE') {
      continue;
    }

    // Check scopeConstraints
    if (input.scopeConstraints?.forbiddenFamilyKeys?.includes(fam.familyKey)) {
      continue;
    }

    if (
      input.scopeConstraints?.allowedFamilyKeys &&
      !input.scopeConstraints.allowedFamilyKeys.includes(fam.familyKey)
    ) {
      continue;
    }

    eligibleFamilies.push(fam);
  }

  if (eligibleFamilies.length === 0) {
    throw new CreativePlannerError(
      'NO_COMPATIBLE_FAMILIES_FOR_MECHANIC',
      `No compatible canonical families found for mechanic "${input.mechanicKey}" in scope "${input.scopeKey}"`,
      {
        totalCatalogFamilies: input.catalog.families.length,
        mechanicKey: input.mechanicKey,
        scopeKey: input.scopeKey,
      },
    );
  }

  // Check exact distribution if requested
  if (input.scopeConstraints?.exactFamilyDistribution) {
    const dist = input.scopeConstraints.exactFamilyDistribution;
    let distTotal = 0;
    for (const [key, qty] of Object.entries(dist)) {
      if (qty < 0) {
        throw new CreativePlannerError(
          'SCOPE_CONSTRAINTS_UNSATISFIABLE',
          `Negative quota specified for family "${key}": ${qty}`,
        );
      }
      distTotal += qty;
      const found = eligibleFamilies.some((f) => f.familyKey === key);
      if (!found && qty > 0) {
        throw new CreativePlannerError(
          'SCOPE_CONSTRAINTS_UNSATISFIABLE',
          `Exact distribution requested family "${key}" which is not eligible for mechanic "${input.mechanicKey}"`,
        );
      }
    }

    if (distTotal !== input.count) {
      throw new CreativePlannerError(
        'SCOPE_CONSTRAINTS_UNSATISFIABLE',
        `Sum of exactFamilyDistribution (${distTotal}) does not match requested batch count (${input.count})`,
      );
    }
  }

  // Calculate exploration count
  const explorationCount = computeExplorationCount(input.count, config);
  const exploitationCount = input.count - explorationCount;

  // PRNG initialization
  const seedString =
    input.seed ??
    `${input.worldKey}:${input.scopeKey}:${input.mechanicKey}:${input.count}:${JSON.stringify(input.difficultyQuotas)}`;
  const rng = createDeterministicRng(seedString);

  // Calculate weights for each eligible family
  interface WeightedFamily {
    family: CanonicalFamily;
    fitRating: MechanicFitRating;
    fitMultiplier: number;
    humanApprovedCount: number;
    saturationWeight: number;
    compositeWeight: number;
    maxAllowedSlots: number;
  }

  const weightedFamilies: WeightedFamily[] = eligibleFamilies.map((fam) => {
    const fitRating = fam.mechanicFit?.[input.mechanicKey] ?? 'GOOD';
    const fitMultiplier = getMechanicFitMultiplier(fitRating);

    // Provenance isolation: evaluated strictly against humanApprovedCount
    const cov = input.coverage?.families?.[fam.familyKey];
    const humanApprovedCount =
      cov?.humanApprovedCount ??
      cov?.capacityIndicator?.humanApprovedCount ??
      0;

    const saturationWeight = calculateContinuousSaturationWeight(
      humanApprovedCount,
      config.softCapThreshold,
      config.softCapDiscount,
    );

    const compositeWeight = fitMultiplier * saturationWeight;

    // Determine max allowed slots for this family
    let maxAllowedSlots: number;
    if (input.scopeConstraints?.exactFamilyDistribution) {
      maxAllowedSlots =
        input.scopeConstraints.exactFamilyDistribution[fam.familyKey] ?? 0;
    } else if (
      input.scopeConstraints?.maxSlotsPerFamily?.[fam.familyKey] !== undefined
    ) {
      maxAllowedSlots = input.scopeConstraints.maxSlotsPerFamily[fam.familyKey];
    } else if (eligibleFamilies.length >= 3) {
      // Soft diversity cap applies when catalog has >= 3 eligible families
      maxAllowedSlots = Math.max(
        1,
        Math.floor(input.count * config.maxFamilyBatchShare),
      );
    } else {
      // 1 or 2 families: relaxed cap
      maxAllowedSlots = input.count;
    }

    return {
      family: fam,
      fitRating,
      fitMultiplier,
      humanApprovedCount,
      saturationWeight,
      compositeWeight,
      maxAllowedSlots,
    };
  });

  // If constraints make total capacity < batch size, gracefully expand caps unless strict exact distribution
  if (!input.scopeConstraints?.exactFamilyDistribution) {
    const totalCapacity = weightedFamilies.reduce(
      (sum, wf) => sum + wf.maxAllowedSlots,
      0,
    );
    if (totalCapacity < input.count) {
      diagnostics.push(
        `CAPS_EXPANDED: Available family slot caps (${totalCapacity}) were less than batch count (${input.count}); caps expanded gracefully`,
      );
      for (const wf of weightedFamilies) {
        wf.maxAllowedSlots = input.count;
      }
    }
  }

  // Generate difficulty sequence
  const slotDifficulties = buildSlotDifficulties(
    input.count,
    input.difficultyQuotas,
  );

  // Generate slot modes sequence
  const slotModes = buildSlotModes(input.count, explorationCount);

  // Allocate slots
  const familyUsageCount: Record<string, number> = {};
  for (const wf of weightedFamilies) {
    familyUsageCount[wf.family.familyKey] = 0;
  }

  const slots: GenerationSlot[] = [];

  for (let slotIndex = 0; slotIndex < input.count; slotIndex++) {
    const mode = slotModes[slotIndex];
    const difficulty = slotDifficulties[slotIndex];

    let selectedWf: WeightedFamily;

    if (input.scopeConstraints?.exactFamilyDistribution) {
      // Find eligible family with remaining exact quota
      const available = weightedFamilies.filter(
        (wf) =>
          familyUsageCount[wf.family.familyKey] <
          (input.scopeConstraints?.exactFamilyDistribution?.[
            wf.family.familyKey
          ] ?? 0),
      );
      if (available.length === 0) {
        throw new CreativePlannerError(
          'SCOPE_CONSTRAINTS_UNSATISFIABLE',
          'Failed to satisfy exactFamilyDistribution',
        );
      }
      selectedWf = available[0];
    } else if (mode === 'exploration') {
      // Exploration: favor unused families to introduce cognitive variety
      const unusedFamilies = weightedFamilies.filter(
        (wf) =>
          familyUsageCount[wf.family.familyKey] === 0 &&
          familyUsageCount[wf.family.familyKey] < wf.maxAllowedSlots,
      );

      const candidatePool =
        unusedFamilies.length > 0
          ? unusedFamilies
          : weightedFamilies.filter(
              (wf) =>
                familyUsageCount[wf.family.familyKey] < wf.maxAllowedSlots,
            );

      selectedWf = pickWeightedFamily(
        candidatePool.length > 0 ? candidatePool : weightedFamilies,
        rng,
        familyUsageCount,
        true,
      );
    } else {
      // Exploitation: standard weighted selection respecting caps
      const candidatePool = weightedFamilies.filter(
        (wf) => familyUsageCount[wf.family.familyKey] < wf.maxAllowedSlots,
      );

      selectedWf = pickWeightedFamily(
        candidatePool.length > 0 ? candidatePool : weightedFamilies,
        rng,
        familyUsageCount,
        false,
      );
    }

    familyUsageCount[selectedWf.family.familyKey]++;

    // Construct slot directive
    const cognitiveTask =
      selectedWf.family.playerSolve?.trim() ||
      `Solve ${selectedWf.family.name} via ${selectedWf.family.modality || 'deductive reasoning'}`;

    const creativeAngle =
      mode === 'exploitation'
        ? `Core execution: Standard ${input.mechanicKey} interaction pattern emphasizing ${selectedWf.family.name} mechanics.`
        : `Exploratory variation: Cognitive stretch within ${selectedWf.family.name}; introduce novel lateral framing or nuanced challenge.`;

    const selectionReason =
      mode === 'exploitation'
        ? `Exploitation: fit=${selectedWf.fitRating}, approved=${selectedWf.humanApprovedCount}`
        : `Exploration: cognitive variation within ${selectedWf.family.name}`;

    slots.push({
      slotIndex,
      familyKey: selectedWf.family.familyKey,
      familyNameAr: selectedWf.family.name,
      mode,
      difficulty,
      cognitiveTask,
      creativeAngle,
      mechanicFit: selectedWf.fitRating,
      selectionReason,
    });
  }

  const distinctFamiliesCount = Object.values(familyUsageCount).filter(
    (c) => c > 0,
  ).length;

  if (eligibleFamilies.length === 1) {
    diagnostics.push(
      `SINGLE_FAMILY_CATALOG: All ${input.count} slot(s) allocated to the only compatible family "${eligibleFamilies[0].familyKey}"`,
    );
  }

  // Compute coverage digest if coverage present: must deterministically capture the exact
  // verified human-approved saturation values per eligible family that shaped allocation.
  let coverageDigest: string | undefined;
  if (input.coverage) {
    const familyCountsRecord: Record<string, number> = {};
    for (const fam of eligibleFamilies) {
      const cov = input.coverage.families?.[fam.familyKey];
      familyCountsRecord[fam.familyKey] =
        cov?.humanApprovedCount ??
        cov?.capacityIndicator?.humanApprovedCount ??
        0;
    }

    coverageDigest = createHash('sha256')
      .update(
        JSON.stringify({
          worldKey: input.coverage.worldKey,
          scopeKey: input.coverage.scopeKey,
          humanApproved: input.coverage.totals.humanApproved,
          operationalApproved: input.coverage.totals.operationalApproved,
          familyCounts: familyCountsRecord,
        }),
      )
      .digest('hex');
  }

  return {
    slots,
    catalogDigest: input.catalog.digest,
    coverageDigest,
    exploitationCount,
    explorationCount,
    distinctFamiliesCount,
    diagnostics,
  };
}

/**
 * Deterministically samples a family from a candidate pool according to composite weights.
 */
function pickWeightedFamily<
  T extends {
    family: CanonicalFamily;
    compositeWeight: number;
  },
>(
  pool: T[],
  rng: () => number,
  familyUsageCount: Record<string, number>,
  isExploration: boolean,
): T {
  if (pool.length === 1) {
    return pool[0];
  }

  // Calculate adjusted weights
  const adjusted = pool.map((item) => {
    const usage = familyUsageCount[item.family.familyKey] ?? 0;
    // For exploration, penalize already-used families to force diversity
    const usageDampening = isExploration ? 1.0 / (1.0 + usage * 2.0) : 1.0;
    return {
      item,
      weight: Math.max(0.001, item.compositeWeight * usageDampening),
    };
  });

  const totalWeight = adjusted.reduce((acc, a) => acc + a.weight, 0);
  const sample = rng() * totalWeight;

  let cumulative = 0;
  for (const { item, weight } of adjusted) {
    cumulative += weight;
    if (sample <= cumulative) {
      return item;
    }
  }

  return pool[pool.length - 1];
}
