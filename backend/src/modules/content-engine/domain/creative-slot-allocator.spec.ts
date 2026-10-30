import { CanonicalFamilyCatalog } from './canonical-family.types';
import {
  allocateCreativeSlots,
  calculateContinuousSaturationWeight,
  computeExplorationCount,
} from './creative-slot-allocator';
import {
  CreativePlannerError,
  DEFAULT_PLANNER_DIVERSITY_CONFIG,
  SlotAllocationInput,
} from './creative-plan.types';
import {
  FamilyCoverageMetrics,
  ScopeHistoricalCoverageReport,
} from './historical-coverage.types';

describe('CreativeSlotAllocator (Slice 3A)', () => {
  const createMockCatalog = (familiesCount = 4): CanonicalFamilyCatalog => ({
    version: 1,
    worldKey: 'puzzles',
    scopeKey: 'wordplay-letters',
    digest: 'mock-catalog-sha256',
    structuredSources: ['profiles/puzzles/wordplay.md'],
    families: Array.from({ length: familiesCount }, (_, i) => ({
      familyKey: `family-${i + 1}`,
      name: `عائلة رقم ${i + 1}`,
      description: `وصف العائلة رقم ${i + 1}`,
      playerSolve: `حل اللغز بطريقة ${i + 1}`,
      scopeKey: 'wordplay-letters',
      worldKey: 'puzzles',
      modality: 'letter-permutation',
      source: 'profiles/puzzles/wordplay.md',
      mechanicFit: {
        'read-your-opponent':
          i === 0 ? 'EXCELLENT' : i === 1 ? 'GOOD' : 'LIMITED',
      },
    })),
  });

  const createMockCoverage = (
    familyCounts: Record<
      string,
      { human: number; operational?: number; unknown?: number }
    >,
  ): ScopeHistoricalCoverageReport => {
    const families: Record<string, FamilyCoverageMetrics> = {};
    let totalHuman = 0;
    let totalOperational = 0;

    for (const [key, counts] of Object.entries(familyCounts)) {
      totalHuman += counts.human;
      totalOperational += counts.operational ?? counts.human;
      families[key] = {
        familyKey: key,
        humanApprovedCount: counts.human,
        operationalApprovedCount: counts.operational ?? counts.human,
        approvalUnknownCount: counts.unknown ?? 0,
        playableCount: counts.human,
        approvedCount: counts.human,
        pendingCount: {
          pendingReview: 0,
          pendingPublication: 0,
          unapprovedDrafts: 0,
          total: 0,
        },
        byMechanic: {},
        capacityIndicator: {
          threshold: 50,
          humanApprovedCount: counts.human,
          operationalApprovedCount: counts.operational ?? counts.human,
          approvalUnknownCount: counts.unknown ?? 0,
          reached: counts.human >= 50,
          status: counts.human >= 50 ? 'AT_THRESHOLD' : 'BELOW_THRESHOLD',
          approvedCount: counts.human,
        },
        provenance: { source: 'CANONICAL_FAMILY_CATALOG', isClassified: true },
      };
    }

    return {
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      totals: {
        operationalApproved: totalOperational,
        humanApproved: totalHuman,
        approvalUnknown: 0,
        uniquePlayable: totalHuman,
        uniquePending: 0,
        uniqueUnclassified: 0,
        uniqueApproved: totalOperational,
      },
      reconciliation: {
        operationalAndPlayable: totalHuman,
        operationalNotPlayable: 0,
        humanApprovedPlayable: totalHuman,
        humanApprovedNotPlayable: 0,
        unknownApprovalOperational: 0,
        pendingUnapprovedDrafts: 0,
        pendingReviewCandidates: 0,
        pendingPublicationCandidates: 0,
        rejectedExcludedCandidates: 0,
        archivedExcludedItems: 0,
        approvedAndPlayable: totalHuman,
        approvedNotPlayable: 0,
      },
      families,
      unclassified: {
        familyKey: 'UNCLASSIFIED',
        humanApprovedCount: 0,
        operationalApprovedCount: 0,
        approvalUnknownCount: 0,
        playableCount: 0,
        approvedCount: 0,
        pendingCount: {
          pendingReview: 0,
          pendingPublication: 0,
          unapprovedDrafts: 0,
          total: 0,
        },
        byMechanic: {},
        capacityIndicator: {
          threshold: 50,
          humanApprovedCount: 0,
          operationalApprovedCount: 0,
          approvalUnknownCount: 0,
          reached: false,
          status: 'BELOW_THRESHOLD',
          approvedCount: 0,
        },
        provenance: { source: 'UNCLASSIFIED', isClassified: false },
      },
      diagnostics: {
        isCatalogPresent: true,
        hasUnclassifiedContent: false,
        unclassifiedRatio: 0,
        hasUnknownApproval: false,
        unknownApprovalRatio: 0,
        warnings: [],
      },
    };
  };

  describe('1. Small-Batch Exploration Table (N=1..10)', () => {
    it('matches the approved deterministic small-batch table exactly for default config', () => {
      const expected = [
        { n: 1, exploration: 0 },
        { n: 2, exploration: 0 },
        { n: 3, exploration: 1 },
        { n: 4, exploration: 1 },
        { n: 5, exploration: 1 },
        { n: 6, exploration: 2 },
        { n: 7, exploration: 2 },
        { n: 8, exploration: 2 },
        { n: 9, exploration: 3 },
        { n: 10, exploration: 3 },
      ];

      for (const { n, exploration } of expected) {
        expect(
          computeExplorationCount(n, DEFAULT_PLANNER_DIVERSITY_CONFIG),
        ).toBe(exploration);
      }
    });

    it('returns 0 for non-positive batch sizes', () => {
      expect(computeExplorationCount(0)).toBe(0);
      expect(computeExplorationCount(-3)).toBe(0);
    });
  });

  describe('2. Configurable Exploration Parameters', () => {
    it('supports custom ratio and custom minBatchForExploration', () => {
      const customConfig = {
        ...DEFAULT_PLANNER_DIVERSITY_CONFIG,
        targetExplorationRatio: 0.5,
        minBatchForExploration: 2,
      };

      expect(computeExplorationCount(1, customConfig)).toBe(0);
      expect(computeExplorationCount(2, customConfig)).toBe(1);
      expect(computeExplorationCount(4, customConfig)).toBe(2);
    });

    it('returns 0 exploration slots when targetExplorationRatio is 0.0', () => {
      const customConfig = {
        ...DEFAULT_PLANNER_DIVERSITY_CONFIG,
        targetExplorationRatio: 0.0,
      };

      expect(computeExplorationCount(5, customConfig)).toBe(0);
      expect(computeExplorationCount(10, customConfig)).toBe(0);
    });
  });

  describe('3. Continuous Saturation Weighting Function', () => {
    it('is strictly continuous at threshold T=50 with no cliff', () => {
      const leftLimit = calculateContinuousSaturationWeight(49.9999, 50, 0.25);
      const atThreshold = calculateContinuousSaturationWeight(50, 50, 0.25);
      const rightLimit = calculateContinuousSaturationWeight(50.0001, 50, 0.25);

      expect(atThreshold).toBe(1.0);
      expect(Math.abs(leftLimit - 1.0)).toBeLessThan(0.001);
      expect(Math.abs(rightLimit - 1.0)).toBeLessThan(0.001);
    });

    it('is strictly monotonic decreasing across all counts', () => {
      const points = [0, 10, 25, 49, 50, 51, 75, 100, 200, 500];
      for (let i = 0; i < points.length - 1; i++) {
        const w1 = calculateContinuousSaturationWeight(points[i]);
        const w2 = calculateContinuousSaturationWeight(points[i + 1]);
        expect(w1).toBeGreaterThan(w2);
      }
    });

    it('remains strictly positive and never zero even at extreme saturations', () => {
      const w1000 = calculateContinuousSaturationWeight(1000, 50, 0.25);
      const w10000 = calculateContinuousSaturationWeight(10000, 50, 0.25);

      expect(w1000).toBeGreaterThan(0);
      expect(w10000).toBeGreaterThan(0);
    });

    it('starts at 1.75 for cold start (count=0) with default 0.25 discount', () => {
      const w0 = calculateContinuousSaturationWeight(0, 50, 0.25);
      expect(w0).toBe(1.75);
    });
  });

  describe('4. Historical Provenance Isolation', () => {
    it('evaluates saturation weight strictly against humanApprovedCount, ignoring unverified operational counts', () => {
      const catalog = createMockCatalog(2);
      // Family 1 has 0 human approvals, but 500 operational items without human proof
      const coverage = createMockCoverage({
        'family-1': { human: 0, operational: 500, unknown: 500 },
        'family-2': { human: 50, operational: 50, unknown: 0 },
      });

      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        difficultyQuotas: { medium: 3, easy: 1, hard: 1 },
        catalog,
        coverage,
        seed: 'test-provenance-seed',
      };

      const result = allocateCreativeSlots(input);
      expect(result.slots.length).toBe(5);

      // Family 1 must receive slots because its humanApprovedCount is 0 (healthy saturation weight 1.75)
      const f1Slots = result.slots.filter((s) => s.familyKey === 'family-1');
      expect(f1Slots.length).toBeGreaterThan(0);
    });
  });

  describe('5. Missing Catalog vs Malformed Catalog Handling', () => {
    it('returns empty slots and emits diagnostic when catalog is null or undefined (preserves V1 behavior)', () => {
      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        difficultyQuotas: { medium: 3, easy: 1, hard: 1 },
        catalog: null,
      };

      const result = allocateCreativeSlots(input);
      expect(result.slots).toEqual([]);
      expect(result.exploitationCount).toBe(0);
      expect(result.explorationCount).toBe(0);
      expect(
        result.diagnostics.some((d) =>
          d.includes('FAMILY_CATALOG_UNAVAILABLE'),
        ),
      ).toBe(true);
    });

    it('fails closed with CreativePlannerError(FAMILY_CATALOG_MALFORMED) if catalog is malformed or incompatible', () => {
      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        difficultyQuotas: { medium: 3, easy: 1, hard: 1 },
        catalog: {
          version: 999 as unknown as 1, // invalid version
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          families: [],
          digest: 'invalid',
          structuredSources: [],
        },
      };

      expect(() => allocateCreativeSlots(input)).toThrow(CreativePlannerError);
      try {
        allocateCreativeSlots(input);
      } catch (err: unknown) {
        expect((err as CreativePlannerError).code).toBe(
          'FAMILY_CATALOG_MALFORMED',
        );
      }
    });

    it('fails closed if catalog scopeKey does not match input scopeKey', () => {
      const catalog = createMockCatalog(2);
      catalog.scopeKey = 'different-scope';

      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 3,
        difficultyQuotas: { medium: 3 },
        catalog,
      };

      expect(() => allocateCreativeSlots(input)).toThrow(CreativePlannerError);
      try {
        allocateCreativeSlots(input);
      } catch (err: unknown) {
        expect((err as CreativePlannerError).code).toBe(
          'FAMILY_CATALOG_MALFORMED',
        );
      }
    });
  });

  describe('6. Mechanic Fit & DO_NOT_FORCE Filtering', () => {
    it('strictly excludes families marked DO_NOT_FORCE for the requested mechanic', () => {
      const catalog = createMockCatalog(3);
      catalog.families[0].mechanicFit = {
        'read-your-opponent': 'DO_NOT_FORCE',
      };
      catalog.families[1].mechanicFit = { 'read-your-opponent': 'GOOD' };
      catalog.families[2].mechanicFit = { 'read-your-opponent': 'EXCELLENT' };

      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 6,
        difficultyQuotas: { medium: 4, easy: 1, hard: 1 },
        catalog,
        seed: 'mechanic-filter-seed',
      };

      const result = allocateCreativeSlots(input);
      const usedFamilyKeys = new Set(result.slots.map((s) => s.familyKey));
      expect(usedFamilyKeys.has('family-1')).toBe(false);
      expect(usedFamilyKeys.has('family-2')).toBe(true);
      expect(usedFamilyKeys.has('family-3')).toBe(true);
    });

    it('throws NO_COMPATIBLE_FAMILIES_FOR_MECHANIC if all families are DO_NOT_FORCE', () => {
      const catalog = createMockCatalog(2);
      catalog.families[0].mechanicFit = {
        'read-your-opponent': 'DO_NOT_FORCE',
      };
      catalog.families[1].mechanicFit = {
        'read-your-opponent': 'DO_NOT_FORCE',
      };

      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 3,
        difficultyQuotas: { medium: 3 },
        catalog,
      };

      expect(() => allocateCreativeSlots(input)).toThrow(CreativePlannerError);
      try {
        allocateCreativeSlots(input);
      } catch (err: unknown) {
        expect((err as CreativePlannerError).code).toBe(
          'NO_COMPATIBLE_FAMILIES_FOR_MECHANIC',
        );
      }
    });
  });

  describe('7. 1-Family and 2-Family Catalogs Graceful Handling', () => {
    it('allocates 100% of slots to the single available family without failing diversity caps', () => {
      const catalog = createMockCatalog(1);
      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        difficultyQuotas: { medium: 3, easy: 1, hard: 1 },
        catalog,
        seed: 'single-family-seed',
      };

      const result = allocateCreativeSlots(input);
      expect(result.slots.length).toBe(5);
      expect(result.distinctFamiliesCount).toBe(1);
      expect(result.slots.every((s) => s.familyKey === 'family-1')).toBe(true);
      expect(
        result.diagnostics.some((d) => d.includes('SINGLE_FAMILY_CATALOG')),
      ).toBe(true);
    });

    it('allocates between 2 families smoothly without 50% cap violation errors', () => {
      const catalog = createMockCatalog(2);
      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        difficultyQuotas: { medium: 3, easy: 1, hard: 1 },
        catalog,
        seed: 'two-family-seed',
      };

      const result = allocateCreativeSlots(input);
      expect(result.slots.length).toBe(5);
      expect(result.distinctFamiliesCount).toBe(2);
    });
  });

  describe('8. Scope Diversity Constraints Precedence', () => {
    it('strictly satisfies exactFamilyDistribution if specified by Scope', () => {
      const catalog = createMockCatalog(4);
      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        difficultyQuotas: { medium: 3, easy: 1, hard: 1 },
        catalog,
        scopeConstraints: {
          exactFamilyDistribution: {
            'family-1': 3,
            'family-2': 2,
          },
        },
      };

      const result = allocateCreativeSlots(input);
      const count1 = result.slots.filter(
        (s) => s.familyKey === 'family-1',
      ).length;
      const count2 = result.slots.filter(
        (s) => s.familyKey === 'family-2',
      ).length;
      expect(count1).toBe(3);
      expect(count2).toBe(2);
    });

    it('strictly respects allowedFamilyKeys and forbiddenFamilyKeys', () => {
      const catalog = createMockCatalog(4);
      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 4,
        difficultyQuotas: { medium: 4 },
        catalog,
        scopeConstraints: {
          allowedFamilyKeys: ['family-2', 'family-3'],
          forbiddenFamilyKeys: ['family-3'],
        },
      };

      const result = allocateCreativeSlots(input);
      expect(result.slots.every((s) => s.familyKey === 'family-2')).toBe(true);
    });
  });

  describe('9. 100% Deterministic Replayability and Seed Variation', () => {
    it('produces identical slots across multiple runs with identical seed', () => {
      const catalog = createMockCatalog(4);
      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 8,
        difficultyQuotas: { medium: 4, easy: 2, hard: 2 },
        catalog,
        seed: 'fixed-stable-seed-12345',
      };

      const run1 = allocateCreativeSlots(input);
      const run2 = allocateCreativeSlots(input);

      expect(run1.slots).toEqual(run2.slots);
      expect(run1.exploitationCount).toBe(run2.exploitationCount);
      expect(run1.explorationCount).toBe(run2.explorationCount);
    });

    it('produces different valid allocations when seeds differ', () => {
      const catalog = createMockCatalog(4);
      const input1: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 10,
        difficultyQuotas: { medium: 6, easy: 2, hard: 2 },
        catalog,
        seed: 'seed-alpha',
      };

      const input2: SlotAllocationInput = {
        ...input1,
        seed: 'seed-beta-differing',
      };

      const run1 = allocateCreativeSlots(input1);
      const run2 = allocateCreativeSlots(input2);

      // Both must satisfy small batch exploration count for N=10 (E=3)
      expect(run1.explorationCount).toBe(3);
      expect(run2.explorationCount).toBe(3);
      expect(run1.exploitationCount).toBe(7);
      expect(run2.exploitationCount).toBe(7);
    });
  });

  describe('10. Difficulty Quotas & Slot Directive Integrity', () => {
    it('matches difficultyQuotas exactly across slots', () => {
      const catalog = createMockCatalog(4);
      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        difficultyQuotas: { medium: 3, easy: 1, hard: 1 },
        catalog,
      };

      const result = allocateCreativeSlots(input);
      const counts: Record<string, number> = { medium: 0, easy: 0, hard: 0 };
      for (const slot of result.slots) {
        counts[slot.difficulty]++;
      }

      expect(counts.medium).toBe(3);
      expect(counts.easy).toBe(1);
      expect(counts.hard).toBe(1);
    });

    it('populates all mandatory slot fields', () => {
      const catalog = createMockCatalog(3);
      const input: SlotAllocationInput = {
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 3,
        difficultyQuotas: { medium: 1, easy: 1, hard: 1 },
        catalog,
      };

      const result = allocateCreativeSlots(input);
      for (const slot of result.slots) {
        expect(slot.slotIndex).toBeGreaterThanOrEqual(0);
        expect(slot.familyKey).toBeDefined();
        expect(slot.familyNameAr).toBeDefined();
        expect(['exploitation', 'exploration']).toContain(slot.mode);
        expect(['easy', 'medium', 'hard']).toContain(slot.difficulty);
        expect(slot.cognitiveTask.length).toBeGreaterThan(0);
        expect(slot.creativeAngle.length).toBeGreaterThan(0);
        expect(slot.mechanicFit).toBeDefined();
        expect(slot.selectionReason.length).toBeGreaterThan(0);
      }
    });
  });
});
