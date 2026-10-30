import { GenerationPlannerService } from './generation-planner.service';
import { ScopeHistoricalCoverageReport } from '../domain/historical-coverage.types';

describe('GenerationPlannerService', () => {
  let planner: GenerationPlannerService;

  beforeEach(() => {
    planner = new GenerationPlannerService();
  });

  it('computes mixed difficulty quotas for N=5 candidates', () => {
    const plan = planner.plan({
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
      count: 5,
      difficulty: 'mixed',
    });

    expect(plan.difficultyQuotas).toEqual({
      medium: 3,
      easy: 1,
      hard: 1,
    });
    expect(plan.count).toBe(5);
    expect(plan.digest).toBeDefined();
    expect(plan.digest).toHaveLength(64);
  });

  it('computes targeted quotas when specific difficulty is requested', () => {
    const plan = planner.plan({
      worldKey: 'football',
      scopeKey: 'world-cup',
      mechanicKey: 'read-your-opponent',
      count: 4,
      difficulty: 'hard',
    });

    expect(plan.difficultyQuotas).toEqual({
      hard: 4,
    });
  });

  it('includes RYO archetypes, 40-80% bluff sweet spot, and anti-patterns', () => {
    const plan = planner.plan({
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
      count: 5,
    });

    expect(plan.archetypes.some((a) => a.includes('Misconception Trap'))).toBe(
      true,
    );
    expect(
      plan.decisionLoopGuidelines.some((g) =>
        g.includes('40-80% CONFIDENCE SWEET SPOT'),
      ),
    ).toBe(true);
    expect(
      plan.antiPatterns.some((ap) => ap.includes('NO 100% ELEMENTARY TRIVIA')),
    ).toBe(true);
    expect(
      plan.antiPatterns.some((ap) => ap.includes('NO UNSOLVABLE ANAGRAMS')),
    ).toBe(true);
    expect(
      plan.antiPatterns.some((ap) => ap.includes('NO ANSWER LEAKAGE')),
    ).toBe(true);
  });

  it('specifies 16:9 aspect ratio and fallback policy in media intent', () => {
    const plan = planner.plan({
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
      count: 3,
    });

    expect(plan.mediaIntent.allowedAspectRatios).toEqual(['16:9']);
    expect(plan.mediaIntent.displayArtworkPolicy).toContain(
      'World Question Fallback',
    );
  });

  it('formats plan cleanly into markdown for prompt embedding', () => {
    const plan = planner.plan({
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
      count: 5,
    });

    const formatted = planner.formatPlanForPrompt(plan);
    expect(formatted).toContain('## TACTICAL GENERATION PLAN');
    expect(formatted).toContain('### 1. DIFFICULTY TARGET QUOTAS');
    expect(formatted).toContain(
      '### 3. GAMEPLAY DECISION LOOP & BLUFF SWEET SPOT',
    );
    expect(formatted).toContain('### 4. CRITICAL NEGATIVE ANTI-PATTERNS');
    expect(formatted).toContain('NO UNSOLVABLE ANAGRAMS');
    expect(formatted).not.toContain('### 7. PER-QUESTION CREATIVE SLOTS');
  });

  it('allocates creative slots when catalog is supplied and includes section 7 in prompt format', () => {
    const mockCatalog = {
      version: 1 as const,
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      digest: 'catalog-hash-1234',
      structuredSources: ['profiles/puzzles/wordplay.md'],
      families: [
        {
          familyKey: 'anagram-rearrange',
          name: 'إعادة ترتيب الحروف',
          description: 'تكوين كلمة من حروف مبعثرة',
          playerSolve: 'إعادة ترتيب الحروف المحددة',
          scopeKey: 'wordplay-letters',
          worldKey: 'puzzles',
          modality: 'letter-permutation',
          source: 'profiles/puzzles/wordplay.md',
          mechanicFit: { 'read-your-opponent': 'EXCELLENT' as const },
        },
        {
          familyKey: 'crossword-clue',
          name: 'كلمة السر',
          description: 'تخمين الكلمة من دلالات متقاطعة',
          playerSolve: 'إيجاد الرابط المشترك',
          scopeKey: 'wordplay-letters',
          worldKey: 'puzzles',
          modality: 'morphology-lexical',
          source: 'profiles/puzzles/wordplay.md',
          mechanicFit: { 'read-your-opponent': 'GOOD' as const },
        },
      ],
    };

    const plan = planner.plan({
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
      count: 4,
      catalog: mockCatalog,
      seed: 'integration-test-seed',
    });

    expect(plan.slots).toBeDefined();
    expect(plan.slots?.length).toBe(4);
    expect(plan.catalogDigest).toBe('catalog-hash-1234');
    expect(plan.diversityMetrics).toBeDefined();
    expect(plan.diversityMetrics?.exploitationCount).toBe(3);
    expect(plan.diversityMetrics?.explorationCount).toBe(1);

    const formatted = planner.formatPlanForPrompt(plan);
    expect(formatted).toContain('### 7. PER-QUESTION CREATIVE SLOTS');
    expect(formatted).toContain('[Slot #1]');
    expect(formatted).toContain('[Slot #4]');
  });

  describe('Slice 3B: Canonical Catalog & Historical Coverage Integration (planWithResolvedContext)', () => {
    const createMockCoverage = (
      humanCounts: Record<string, number>,
      warnings: string[] = [],
      options?: { worldKey?: string; scopeKey?: string },
    ): ScopeHistoricalCoverageReport => {
      const worldKey = options?.worldKey ?? 'puzzles';
      const scopeKey = options?.scopeKey ?? 'wordplay-letters';
      const families: Record<string, any> = {};
      let totalHuman = 0;
      for (const [key, count] of Object.entries(humanCounts)) {
        totalHuman += count;
        families[key] = {
          familyKey: key,
          humanApprovedCount: count,
          operationalApprovedCount: count,
          approvalUnknownCount: 0,
          playableCount: count,
          approvedCount: count,
          pendingCount: {
            pendingReview: 0,
            pendingPublication: 0,
            unapprovedDrafts: 0,
            total: 0,
          },
          byMechanic: {},
          capacityIndicator: {
            threshold: 50,
            humanApprovedCount: count,
            operationalApprovedCount: count,
            approvalUnknownCount: 0,
            reached: count >= 50,
            status: count >= 50 ? 'AT_THRESHOLD' : 'BELOW_THRESHOLD',
            approvedCount: count,
          },
          provenance: {
            source: 'CANONICAL_FAMILY_CATALOG',
            isClassified: true,
          },
        };
      }

      return {
        worldKey,
        scopeKey,
        totals: {
          operationalApproved: totalHuman,
          humanApproved: totalHuman,
          approvalUnknown: 0,
          uniquePlayable: totalHuman,
          uniquePending: 0,
          uniqueUnclassified: 0,
          uniqueApproved: totalHuman,
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
          warnings,
        },
      };
    };

    it('1. resolves real canonical catalog for valid Scope (puzzles/wordplay-letters)', async () => {
      // Mock authoringContext and historicalCoverage services
      const mockAuthoringContext = {
        resolveCanonicalFamiliesForScope: jest.fn().mockReturnValue({
          version: 1,
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          digest: 'canonical-catalog-digest-1',
          structuredSources: ['profiles/puzzles/wordplay.md'],
          families: [
            {
              familyKey: 'anagram-rearrange',
              name: 'إعادة ترتيب الحروف',
              description: 'وصف',
              playerSolve: 'حل',
              scopeKey: 'wordplay-letters',
              worldKey: 'puzzles',
              source: 'profiles/test.md',
              mechanicFit: { 'read-your-opponent': 'EXCELLENT' },
            },
            {
              familyKey: 'add-letter',
              name: 'إضافة حرف',
              description: 'وصف',
              playerSolve: 'حل',
              scopeKey: 'wordplay-letters',
              worldKey: 'puzzles',
              source: 'profiles/test.md',
              mechanicFit: { 'read-your-opponent': 'GOOD' },
            },
          ],
        }),
      } as any;

      const mockHistoricalCoverage = {
        getCoverage: jest.fn().mockResolvedValue(
          createMockCoverage({
            'anagram-rearrange': 10,
            'add-letter': 5,
          }),
        ),
      } as any;

      const integratedPlanner = new GenerationPlannerService(
        mockAuthoringContext,
        mockHistoricalCoverage,
      );

      const plan = await integratedPlanner.planWithResolvedContext({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 4,
        seed: 'slice-3b-test-seed',
      });

      expect(plan.slots).toBeDefined();
      expect(plan.slots?.length).toBe(4);
      expect(plan.catalogDigest).toBe('canonical-catalog-digest-1');
      expect(plan.coverageDigest).toBeDefined();
      expect(
        mockAuthoringContext.resolveCanonicalFamiliesForScope,
      ).toHaveBeenCalledWith({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
      });
      expect(mockHistoricalCoverage.getCoverage).toHaveBeenCalledWith({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
      });
    });

    it('2. preserves World and Scope isolation during resolution', async () => {
      const mockAuthoringContext = {
        resolveCanonicalFamiliesForScope: jest
          .fn()
          .mockImplementation(
            (input: { worldKey: string; scopeKey: string }) => {
              if (
                input.worldKey === 'football' &&
                input.scopeKey === 'world-cup'
              ) {
                return {
                  version: 1,
                  worldKey: 'football',
                  scopeKey: 'world-cup',
                  digest: 'football-digest',
                  structuredSources: [],
                  families: [
                    {
                      familyKey: 'champions-history',
                      name: 'أبطال كأس العالم',
                      description: 'تاريخ الفائزين',
                      scopeKey: 'world-cup',
                      worldKey: 'football',
                      source: 'profiles/test.md',
                      mechanicFit: { 'read-your-opponent': 'EXCELLENT' },
                    },
                  ],
                };
              }
              throw new Error('UNKNOWN_SCOPE');
            },
          ),
      } as any;

      const mockHistoricalCoverage = {
        getCoverage: jest.fn().mockResolvedValue(
          createMockCoverage({ 'champions-history': 2 }, [], {
            worldKey: 'football',
            scopeKey: 'world-cup',
          }),
        ),
      } as any;

      const integratedPlanner = new GenerationPlannerService(
        mockAuthoringContext,
        mockHistoricalCoverage,
      );

      const plan = await integratedPlanner.planWithResolvedContext({
        worldKey: 'football',
        scopeKey: 'world-cup',
        mechanicKey: 'read-your-opponent',
        count: 2,
      });

      expect(plan.worldKey).toBe('football');
      expect(plan.scopeKey).toBe('world-cup');
      expect(plan.slots?.[0].familyKey).toBe('champions-history');
    });

    it('3. distinguishes missing catalog (V1 preserved) from malformed catalog (fail closed)', async () => {
      const mockAuthoringContext = {
        resolveCanonicalFamiliesForScope: jest
          .fn()
          .mockImplementation(
            (input: { worldKey: string; scopeKey: string }) => {
              if (input.scopeKey === 'absent-scope') {
                throw new Error(
                  'AUTHORING_BLOCKED — UNKNOWN_SCOPE (absent-scope)',
                );
              }
              if (input.scopeKey === 'malformed-scope') {
                throw new Error(
                  'FamilyResolutionError [MALFORMED_JSON]: Invalid JSON syntax in akwaan-families block',
                );
              }
              return null;
            },
          ),
      } as any;

      const integratedPlanner = new GenerationPlannerService(
        mockAuthoringContext,
        undefined,
      );

      // Absent scope: gracefully preserves V1 planning with empty slots
      const planAbsent = await integratedPlanner.planWithResolvedContext({
        worldKey: 'puzzles',
        scopeKey: 'absent-scope',
        mechanicKey: 'read-your-opponent',
        count: 3,
      });
      expect(planAbsent.slots).toBeUndefined();
      expect(planAbsent.digest).toBeDefined();

      // Malformed scope: fails closed with thrown error!
      await expect(
        integratedPlanner.planWithResolvedContext({
          worldKey: 'puzzles',
          scopeKey: 'malformed-scope',
          mechanicKey: 'read-your-opponent',
          count: 3,
        }),
      ).rejects.toThrow('MALFORMED_JSON');
    });

    it('4. strictly excludes families with DO_NOT_FORCE mechanic compatibility', async () => {
      const mockAuthoringContext = {
        resolveCanonicalFamiliesForScope: jest.fn().mockReturnValue({
          version: 1,
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          digest: 'cat-filter-digest',
          structuredSources: [],
          families: [
            {
              familyKey: 'word-math',
              name: 'معادلات الحروف',
              description: 'حساب',
              scopeKey: 'wordplay-letters',
              worldKey: 'puzzles',
              source: 'profiles/test.md',
              mechanicFit: { 'read-your-opponent': 'DO_NOT_FORCE' },
            },
            {
              familyKey: 'crossword-clue',
              name: 'كلمة السر',
              description: 'لغز',
              scopeKey: 'wordplay-letters',
              worldKey: 'puzzles',
              source: 'profiles/test.md',
              mechanicFit: { 'read-your-opponent': 'EXCELLENT' },
            },
          ],
        }),
      } as any;

      const mockHistoricalCoverage = {
        getCoverage: jest
          .fn()
          .mockResolvedValue(
            createMockCoverage({ 'crossword-clue': 5, 'word-math': 0 }),
          ),
      } as any;

      const integratedPlanner = new GenerationPlannerService(
        mockAuthoringContext,
        mockHistoricalCoverage,
      );

      const plan = await integratedPlanner.planWithResolvedContext({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 3,
      });

      expect(plan.slots?.every((s) => s.familyKey === 'crossword-clue')).toBe(
        true,
      );
      expect(plan.slots?.some((s) => s.familyKey === 'word-math')).toBe(false);
    });

    it('5. enforces Scope-specific diversity constraints precedence', async () => {
      const mockCatalog = {
        version: 1 as const,
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        digest: 'cat-constraints-digest',
        structuredSources: [],
        families: [
          {
            familyKey: 'fam-a',
            name: 'أ',
            description: 'أ',
            scopeKey: 'wordplay-letters',
            worldKey: 'puzzles',
            source: 'profiles/test.md',
            mechanicFit: { 'read-your-opponent': 'GOOD' as const },
          },
          {
            familyKey: 'fam-b',
            name: 'ب',
            description: 'ب',
            scopeKey: 'wordplay-letters',
            worldKey: 'puzzles',
            source: 'profiles/test.md',
            mechanicFit: { 'read-your-opponent': 'GOOD' as const },
          },
        ],
      };

      const integratedPlanner = new GenerationPlannerService();

      const plan = await integratedPlanner.planWithResolvedContext({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        catalogOverride: mockCatalog,
        coverageOverride: createMockCoverage({ 'fam-a': 0, 'fam-b': 0 }),
        scopeDiversityConstraints: {
          exactFamilyDistribution: {
            'fam-a': 4,
            'fam-b': 1,
          },
        },
      });

      const countA = plan.slots?.filter((s) => s.familyKey === 'fam-a').length;
      const countB = plan.slots?.filter((s) => s.familyKey === 'fam-b').length;
      expect(countA).toBe(4);
      expect(countB).toBe(1);
    });

    it('6. verified human-approved counts influence allocation', async () => {
      const mockCatalog = {
        version: 1 as const,
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        digest: 'cat-saturation-digest',
        structuredSources: [],
        families: [
          {
            familyKey: 'fam-saturated',
            name: 'عائلة مشبعة',
            description: 'وصف',
            scopeKey: 'wordplay-letters',
            worldKey: 'puzzles',
            source: 'profiles/test.md',
            mechanicFit: { 'read-your-opponent': 'GOOD' as const },
          },
          {
            familyKey: 'fam-fresh',
            name: 'عائلة جديدة',
            description: 'وصف',
            scopeKey: 'wordplay-letters',
            worldKey: 'puzzles',
            source: 'profiles/test.md',
            mechanicFit: { 'read-your-opponent': 'GOOD' as const },
          },
        ],
      };

      const coverage = createMockCoverage({
        'fam-saturated': 500, // deeply saturated -> low weight
        'fam-fresh': 0, // fresh -> maximum saturation bonus (1.75)
      });

      const integratedPlanner = new GenerationPlannerService();
      const plan = await integratedPlanner.planWithResolvedContext({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 8,
        catalogOverride: mockCatalog,
        coverageOverride: coverage,
        seed: 'influence-test-seed',
      });

      const freshSlots =
        plan.slots?.filter((s) => s.familyKey === 'fam-fresh').length ?? 0;
      const saturatedSlots =
        plan.slots?.filter((s) => s.familyKey === 'fam-saturated').length ?? 0;
      expect(freshSlots).toBeGreaterThan(saturatedSlots);
    });

    it('7. approval-unknown inventory does not masquerade as verified approval', async () => {
      const mockCatalog = {
        version: 1 as const,
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        digest: 'cat-provenance-digest',
        structuredSources: [],
        families: [
          {
            familyKey: 'fam-unknown-prov',
            name: 'غير موثق الاعتماد البشري',
            description: 'وصف',
            scopeKey: 'wordplay-letters',
            worldKey: 'puzzles',
            source: 'profiles/test.md',
            mechanicFit: { 'read-your-opponent': 'GOOD' as const },
          },
        ],
      };

      // 1000 operational items, but 0 humanApproved items
      const coverage = createMockCoverage({ 'fam-unknown-prov': 0 });
      coverage.families['fam-unknown-prov'].operationalApprovedCount = 1000;
      coverage.families['fam-unknown-prov'].approvalUnknownCount = 1000;

      const integratedPlanner = new GenerationPlannerService();
      const plan = await integratedPlanner.planWithResolvedContext({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 2,
        catalogOverride: mockCatalog,
        coverageOverride: coverage,
      });

      // The slot's selectionReason must report approved=0 (verified human count), NOT 1000!
      expect(plan.slots?.[0].selectionReason).toContain('approved=0');
      expect(plan.slots?.[0].selectionReason).not.toContain('approved=1000');
    });

    it('8. fails closed when historical coverage is incomplete or unavailable', async () => {
      const mockCatalog = {
        version: 1 as const,
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        digest: 'cat-incomplete-digest',
        structuredSources: [],
        families: [
          {
            familyKey: 'fam-1',
            name: 'عائلة 1',
            description: 'وصف',
            scopeKey: 'wordplay-letters',
            worldKey: 'puzzles',
            source: 'profiles/test.md',
            mechanicFit: { 'read-your-opponent': 'GOOD' as const },
          },
        ],
      };

      const coverageIncomplete = createMockCoverage({ 'fam-1': 10 }, [
        'HISTORICAL_INVENTORY_PARTIAL: Truncated records due to limit',
      ]);

      const integratedPlanner = new GenerationPlannerService();
      await expect(
        integratedPlanner.planWithResolvedContext({
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          mechanicKey: 'read-your-opponent',
          count: 2,
          catalogOverride: mockCatalog,
          coverageOverride: coverageIncomplete,
        }),
      ).rejects.toThrow('HISTORICAL_COVERAGE_INCOMPLETE');
    });

    it('9. equivalent effective snapshots produce stable plans and digests', async () => {
      const mockCatalog = {
        version: 1 as const,
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        digest: 'cat-stable-digest',
        structuredSources: [],
        families: [
          {
            familyKey: 'fam-1',
            name: 'عائلة 1',
            description: 'وصف',
            scopeKey: 'wordplay-letters',
            worldKey: 'puzzles',
            source: 'profiles/test.md',
            mechanicFit: { 'read-your-opponent': 'GOOD' as const },
          },
          {
            familyKey: 'fam-2',
            name: 'عائلة 2',
            description: 'وصف',
            scopeKey: 'wordplay-letters',
            worldKey: 'puzzles',
            source: 'profiles/test.md',
            mechanicFit: { 'read-your-opponent': 'GOOD' as const },
          },
        ],
      };

      const coverage = createMockCoverage({ 'fam-1': 12, 'fam-2': 18 });

      const integratedPlanner = new GenerationPlannerService();
      const planA = await integratedPlanner.planWithResolvedContext({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        catalogOverride: mockCatalog,
        coverageOverride: coverage,
        seed: 'fixed-snapshot-seed',
      });

      const planB = await integratedPlanner.planWithResolvedContext({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        catalogOverride: mockCatalog,
        coverageOverride: coverage,
        seed: 'fixed-snapshot-seed',
      });

      expect(planA.digest).toBe(planB.digest);
      expect(planA.coverageDigest).toBe(planB.coverageDigest);
      expect(planA.slots).toEqual(planB.slots);
    });

    it('10. different effective coverage inputs produce distinct planning identities and digests', async () => {
      const mockCatalog = {
        version: 1 as const,
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        digest: 'cat-diff-digest',
        structuredSources: [],
        families: [
          {
            familyKey: 'fam-1',
            name: 'عائلة 1',
            description: 'وصف',
            scopeKey: 'wordplay-letters',
            worldKey: 'puzzles',
            source: 'profiles/test.md',
            mechanicFit: { 'read-your-opponent': 'GOOD' as const },
          },
          {
            familyKey: 'fam-2',
            name: 'عائلة 2',
            description: 'وصف',
            scopeKey: 'wordplay-letters',
            worldKey: 'puzzles',
            source: 'profiles/test.md',
            mechanicFit: { 'read-your-opponent': 'GOOD' as const },
          },
        ],
      };

      const coverage1 = createMockCoverage({ 'fam-1': 5, 'fam-2': 25 });
      const coverage2 = createMockCoverage({ 'fam-1': 45, 'fam-2': 2 });

      const integratedPlanner = new GenerationPlannerService();
      const plan1 = await integratedPlanner.planWithResolvedContext({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        catalogOverride: mockCatalog,
        coverageOverride: coverage1,
        seed: 'same-seed',
      });

      const plan2 = await integratedPlanner.planWithResolvedContext({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        catalogOverride: mockCatalog,
        coverageOverride: coverage2,
        seed: 'same-seed',
      });

      expect(plan1.coverageDigest).not.toBe(plan2.coverageDigest);
      expect(plan1.digest).not.toBe(plan2.digest);
    });

    it('11. existing pinned plans remain stable across retries without recomputing newer coverage', () => {
      // Direct call to planner.plan with already pinned inputs and digests
      const planner = new GenerationPlannerService();
      const mockCatalog = {
        version: 1 as const,
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        digest: 'pinned-catalog-digest',
        structuredSources: [],
        families: [
          {
            familyKey: 'fam-1',
            name: 'عائلة 1',
            description: 'وصف',
            scopeKey: 'wordplay-letters',
            worldKey: 'puzzles',
            source: 'profiles/test.md',
            mechanicFit: { 'read-your-opponent': 'EXCELLENT' as const },
          },
        ],
      };

      const pinnedPlan = planner.plan({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 3,
        catalog: mockCatalog,
        coverage: createMockCoverage({ 'fam-1': 10 }),
        seed: 'pinned-seed-1234',
      });

      // Simulating a worker restart/retry replay with the exact same pinned inputs:
      const replayPlan = planner.plan({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 3,
        catalog: mockCatalog,
        coverage: createMockCoverage({ 'fam-1': 10 }),
        seed: 'pinned-seed-1234',
      });

      expect(replayPlan.digest).toBe(pinnedPlan.digest);
      expect(replayPlan.slots).toEqual(pinnedPlan.slots);
    });

    it('12. existing V1 callers retain 100% backward-compatible behavior without slots', () => {
      const planner = new GenerationPlannerService();
      const planV1 = planner.plan({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 4,
      });

      expect(planV1.slots).toBeUndefined();
      expect(planV1.catalogDigest).toBeUndefined();
      expect(planV1.coverageDigest).toBeUndefined();
      expect(planV1.diversityMetrics).toBeUndefined();
      expect(planV1.digest).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
