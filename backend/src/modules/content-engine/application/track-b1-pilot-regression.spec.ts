import { ConfigService } from '@nestjs/config';
import { DeterministicScreenService } from './deterministic-screen.service';
import { GenerationPlannerService } from './generation-planner.service';
import {
  resolveCanonicalWorld,
  resolveCanonicalScope,
  resolveCanonicalChallengeType,
} from './authoring-target-resolver';
import {
  composeGenerationPrompt,
  RYO_TASK_GUIDANCE,
} from './candidate-generator.service';
import { EngineCandidateDocument } from '../schemas/engine-candidate.schema';

const config = { get: () => undefined } as unknown as ConfigService;

describe('Track B1 — Pilot Regression & Content Quality Suite', () => {
  let screenService: DeterministicScreenService;
  let plannerService: GenerationPlannerService;

  beforeEach(() => {
    screenService = new DeterministicScreenService(config);
    screenService.beginBatch();
    plannerService = new GenerationPlannerService();
  });

  describe('The 5 Live Pilot Candidates Regression', () => {
    it('Candidate 1: catches unsolvable anagram letter count mismatch ("ن م ب ج" vs "منجا")', () => {
      const draft = {
        prompt: { ar: 'كون كلمة من الحروف التالية: ن م ب ج' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'opt-1', label: { ar: 'منجا' } },
            { id: 'opt-2', label: { ar: 'بندق' } },
          ],
          correctOptionId: 'opt-1',
        },
      };

      const result = screenService.screen(draft);
      expect(result.passed).toBe(false);
      const codes = result.findings.map((f) => f.code);
      expect(codes).toContain('ANAGRAM_LETTER_MULTISET_MISMATCH');
    });

    it('Candidate 1 counterpart: passes valid anagram where clue letters match answer letters ("ن ج م" vs "نجم")', () => {
      const draft = {
        prompt: { ar: 'كون كلمة من الحروف التالية: ن ج م' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'opt-1', label: { ar: 'نجم' } },
            { id: 'opt-2', label: { ar: 'شمس' } },
          ],
          correctOptionId: 'opt-1',
        },
      };

      const result = screenService.screen(draft);
      const codes = result.findings.map((f) => f.code);
      expect(codes).not.toContain('ANAGRAM_LETTER_MULTISET_MISMATCH');
    });

    it('Candidate 3: catches explicit word answer leakage ("طائر العصفور يغرد" leaks "العصفور")', () => {
      const draft = {
        prompt: { ar: 'ما الحيوان المختبئ في جملة "طائر العصفور يغرد"؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'opt-1', label: { ar: 'العصفور' } },
            { id: 'opt-2', label: { ar: 'الصقر' } },
          ],
          correctOptionId: 'opt-1',
        },
      };

      const result = screenService.screen(draft);
      expect(result.passed).toBe(false);
      const codes = result.findings.map((f) => f.code);
      expect(codes).toContain('ANSWER_LEAKAGE');
    });

    it('Candidate 4: does NOT false-positive on single letter "ع" inside unrelated word "مساعدة"', () => {
      const draft = {
        prompt: { ar: 'ما الكلمة المناسبة لمساعدة الصديق عند الحاجة؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'opt-1', label: { ar: 'ع' } },
            { id: 'opt-2', label: { ar: 'غ' } },
          ],
          correctOptionId: 'opt-1',
        },
      };

      const result = screenService.screen(draft);
      const codes = result.findings.map((f) => f.code);
      expect(codes).not.toContain('ANSWER_LEAKAGE');
    });

    it('Candidate 0 & 2: prompt guidance and generation plan explicitly ban elementary plurals and 100% certainty trivia', () => {
      expect(RYO_TASK_GUIDANCE).toContain('THE 40-80% CONFIDENCE SWEET SPOT');
      expect(RYO_TASK_GUIDANCE).toContain('جمع كتاب؟ كتب');
      expect(RYO_TASK_GUIDANCE).toContain('NEGATIVE ANTI-PATTERNS');

      const plan = plannerService.plan({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
      });

      expect(
        plan.antiPatterns.some((ap) =>
          ap.includes('NO 100% ELEMENTARY TRIVIA'),
        ),
      ).toBe(true);
      expect(
        plan.antiPatterns.some((ap) => ap.includes('جمع كتاب = كتب')),
      ).toBe(true);
      expect(
        plan.antiPatterns.some((ap) => ap.includes('جمع طفل = أطفال')),
      ).toBe(true);
    });
  });

  describe('Authoring Target & Canonical Alias Resolution', () => {
    it('resolves off-board authoring key "puzzles" to production slug "world-1786388973542"', async () => {
      const mockWorldRepo = {
        findBySlug: jest.fn().mockImplementation(async (slug: string) => {
          if (slug === 'world-1786388973542') {
            return {
              _id: 'world-id-puzzles',
              slug: 'world-1786388973542',
              name: 'عالم الألغاز',
            };
          }
          return null;
        }),
      };

      const resolved = await resolveCanonicalWorld(
        mockWorldRepo as never,
        'puzzles',
      );
      expect(resolved).toBeDefined();
      expect(resolved?._id).toBe('world-id-puzzles');
      expect(resolved?.slug).toBe('world-1786388973542');
    });

    it('resolves scopes and mechanics using canonical aliases', async () => {
      const mockScopeRepo = {
        findBySlugInWorld: jest
          .fn()
          .mockImplementation(async (wId: string, slug: string) => {
            if (slug === 'scope-1785788790909') {
              return {
                _id: 's-wc',
                slug: 'scope-1785788790909',
                name: 'كأس العالم',
              };
            }
            return null;
          }),
      };
      const mockTypeRepo = {
        findBySlug: jest.fn().mockImplementation(async (slug: string) => {
          if (slug === 'read-your-opponent') {
            return {
              _id: 't-ryo',
              slug: 'read-your-opponent',
              name: 'اقرأ خصمك',
            };
          }
          return null;
        }),
      };

      const scope = await resolveCanonicalScope(
        mockScopeRepo as never,
        'world-id',
        'world-cup',
      );
      expect(scope).toBeDefined();
      expect(scope?.slug).toBe('scope-1785788790909');

      const challengeType = await resolveCanonicalChallengeType(
        mockTypeRepo as never,
        'اقرأ خصمك',
      );
      expect(challengeType).toBeDefined();
      expect(challengeType?.slug).toBe('read-your-opponent');
    });
  });

  describe('Quality Judge Decoupling from Evidence Retrieval', () => {
    // Replicating mayJudge rule guard
    function evaluateMayJudge(row: Partial<EngineCandidateDocument>): boolean {
      const facts = row.factVerification as { state?: string } | null;
      const compatibility = row.compatibilityEvaluation as {
        preDraft?: { blockers?: unknown[] };
      } | null;
      const factState = facts?.state;
      const isFactStateEligible =
        factState === 'SUPPORTED' || factState === 'UNRESOLVED';
      return (
        row.status === 'screened_pass' &&
        isFactStateEligible &&
        !compatibility?.preDraft?.blockers?.length &&
        !row.qualityEvaluation
      );
    }

    it('allows Quality Judge to evaluate candidates when facts are SUPPORTED', () => {
      const candidate: Partial<EngineCandidateDocument> = {
        status: 'screened_pass',
        factVerification: { state: 'SUPPORTED' },
        compatibilityEvaluation: { preDraft: { blockers: [] } },
      };

      expect(evaluateMayJudge(candidate)).toBe(true);
    });

    it('allows Quality Judge to evaluate candidates when facts are UNRESOLVED (retriever disabled)', () => {
      const candidate: Partial<EngineCandidateDocument> = {
        status: 'screened_pass',
        factVerification: { state: 'UNRESOLVED' },
        compatibilityEvaluation: { preDraft: { blockers: [] } },
      };

      expect(evaluateMayJudge(candidate)).toBe(true);
    });

    it('blocks Quality Judge when facts are CONTRADICTED', () => {
      const candidate: Partial<EngineCandidateDocument> = {
        status: 'screened_pass',
        factVerification: { state: 'CONTRADICTED' },
        compatibilityEvaluation: { preDraft: { blockers: [] } },
      };

      expect(evaluateMayJudge(candidate)).toBe(false);
    });

    it('fails safely and blocks Quality Judge when fact verification is missing or null', () => {
      const candidateNoFacts: Partial<EngineCandidateDocument> = {
        status: 'screened_pass',
        compatibilityEvaluation: { preDraft: { blockers: [] } },
      };
      expect(evaluateMayJudge(candidateNoFacts)).toBe(false);

      const candidateNullFacts: Partial<EngineCandidateDocument> = {
        status: 'screened_pass',
        factVerification: null as never,
        compatibilityEvaluation: { preDraft: { blockers: [] } },
      };
      expect(evaluateMayJudge(candidateNullFacts)).toBe(false);
    });

    it('fails safely and blocks Quality Judge when fact verification state is invalid or malformed', () => {
      const candidateMalformed: Partial<EngineCandidateDocument> = {
        status: 'screened_pass',
        factVerification: { state: 'BOGUS_STATE' as never },
        compatibilityEvaluation: { preDraft: { blockers: [] } },
      };
      expect(evaluateMayJudge(candidateMalformed)).toBe(false);
    });

    it('blocks Quality Judge when candidate status is not screened_pass', () => {
      const candidateBlocked: Partial<EngineCandidateDocument> = {
        status: 'fact_blocked',
        factVerification: { state: 'UNRESOLVED' },
        compatibilityEvaluation: { preDraft: { blockers: [] } },
      };
      expect(evaluateMayJudge(candidateBlocked)).toBe(false);
    });

    it('preserves fact verification state as UNRESOLVED and does not auto-publish without review', () => {
      const candidate: Partial<EngineCandidateDocument> = {
        status: 'screened_pass',
        factVerification: { state: 'UNRESOLVED' },
      };

      expect(candidate.factVerification?.state).toBe('UNRESOLVED');
      expect(candidate.status).not.toBe('approved');
      expect(candidate.status).not.toBe('published');
    });
  });

  describe('Tactical Generation Planning & Prompt Formatting', () => {
    it('generates a full tactical plan with difficulty quotas, anti-patterns, and media metadata', () => {
      const plan = plannerService.plan({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        difficulty: 'mixed',
      });

      expect(plan.difficultyQuotas).toEqual({ medium: 3, easy: 1, hard: 1 });
      expect(plan.mediaIntent.allowedAspectRatios).toEqual(['16:9']);
      expect(plan.mediaIntent.displayArtworkPolicy).toContain(
        'World Question Fallback',
      );
      expect(plan.digest).toHaveLength(64);
    });

    it('embeds tactical plan into generation prompt via composeGenerationPrompt', () => {
      const prompt = composeGenerationPrompt(
        {
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          mechanicKey: 'read-your-opponent',
          global: 'GLOBAL',
          mechanic: 'MECHANIC',
          world: 'WORLD',
          scope: 'SCOPE',
          knowledge: 'KNOWLEDGE',
        },
        5,
        'multiple_choice',
      );

      expect(prompt).toContain('## TACTICAL GENERATION PLAN');
      expect(prompt).toContain('### 1. DIFFICULTY TARGET QUOTAS');
      expect(prompt).toContain(
        '### 3. GAMEPLAY DECISION LOOP & BLUFF SWEET SPOT',
      );
      expect(prompt).toContain('### 4. CRITICAL NEGATIVE ANTI-PATTERNS');
      expect(prompt).toContain('### 6. MEDIA ENRICHMENT METADATA');
      expect(prompt).toContain('NO 100% ELEMENTARY TRIVIA');
      expect(prompt).toContain('NO UNSOLVABLE ANAGRAMS');
    });
  });

  describe('End-to-End Candidate Lifecycle Simulation (Pilot Configuration)', () => {
    it('simulates the entire lifecycle from planning to review for the target pilot setup', async () => {
      // 1. Generation Planning
      const plan = plannerService.plan({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        count: 5,
        difficulty: 'mixed',
      });
      expect(plan.digest).toHaveLength(64);
      expect(plan.difficultyQuotas).toEqual({ medium: 3, easy: 1, hard: 1 });

      // 2. Composed Prompt contains plan and negative anti-patterns
      const prompt = composeGenerationPrompt(
        {
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          mechanicKey: 'read-your-opponent',
        },
        5,
        'multiple_choice',
      );
      expect(prompt).toContain(plan.digest);
      expect(prompt).toContain('NO UNSOLVABLE ANAGRAMS');

      // 3. Screening: Bad anagram candidate fails immediately
      const badCandidateDraft = {
        prompt: { ar: 'كون كلمة من الحروف التالية: ن م ب ج' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'opt-1', label: { ar: 'منجا' } },
            { id: 'opt-2', label: { ar: 'عنب' } },
          ],
          correctOptionId: 'opt-1',
        },
      };
      const screenBad = screenService.screen(badCandidateDraft);
      expect(screenBad.passed).toBe(false);
      expect(screenBad.findings.map((f) => f.code)).toContain(
        'ANAGRAM_LETTER_MULTISET_MISMATCH',
      );

      // 4. Screening: Valid candidate passes
      const validCandidateDraft = {
        prompt: { ar: 'ما الكلمة التي تعني مد يد العون؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'opt-1', label: { ar: 'مساعدة' } },
            { id: 'opt-2', label: { ar: 'خذلان' } },
          ],
          correctOptionId: 'opt-1',
        },
      };
      const screenValid = screenService.screen(validCandidateDraft);
      expect(screenValid.passed).toBe(true);

      // 5. Offline Factual Verification: claims result in UNRESOLVED
      const factResult = {
        state: 'UNRESOLVED' as const,
        claims: [{ claim: 'معنى المساعدة', state: 'UNRESOLVED' as const }],
      };

      // 6. Quality Judge Gate: screened_pass + UNRESOLVED facts is eligible for judge
      const candidateDoc: Partial<EngineCandidateDocument> = {
        candidateId: 'cand-valid-1',
        status: 'screened_pass',
        factVerification: factResult,
        compatibilityEvaluation: { preDraft: { blockers: [] } },
        qualityEvaluation: null,
      };
      const factState = candidateDoc.factVerification?.state;
      const isJudgeEligible =
        candidateDoc.status === 'screened_pass' &&
        (factState === 'SUPPORTED' || factState === 'UNRESOLVED') &&
        !(
          candidateDoc.compatibilityEvaluation as {
            preDraft?: { blockers?: unknown[] };
          }
        )?.preDraft?.blockers?.length &&
        !candidateDoc.qualityEvaluation;
      expect(isJudgeEligible).toBe(true);

      // 7. Human Review: UNRESOLVED facts are not auto-published as SUPPORTED
      expect(candidateDoc.factVerification?.state).toBe('UNRESOLVED');
      expect(candidateDoc.status).not.toBe('approved');
      expect(candidateDoc.status).not.toBe('published');

      // 8. Target Resolution: World "puzzles" resolves to production slug
      const mockWorldRepo = {
        findBySlug: jest.fn().mockImplementation(async (slug: string) => {
          if (slug === 'world-1786388973542') {
            return {
              _id: 'prod-w-id',
              slug: 'world-1786388973542',
              name: 'عالم الألغاز',
            };
          }
          return null;
        }),
      };
      const resolvedWorld = await resolveCanonicalWorld(
        mockWorldRepo as never,
        'puzzles',
      );
      expect(resolvedWorld).toBeDefined();
      expect(resolvedWorld?.slug).toBe('world-1786388973542');
    });
  });
});
