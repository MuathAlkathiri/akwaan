import { ConfigService } from '@nestjs/config';
import {
  CandidateGeneratorService,
  CandidateParseError,
  RYO_TASK_GUIDANCE,
  CLOSEST_TASK_GUIDANCE,
  RYO_CANDIDATE_SCHEMA,
  CLOSEST_CANDIDATE_SCHEMA,
} from './candidate-generator.service';
import { ContentEngineOrchestratorService } from './content-engine-orchestrator.service';
import { AmbiguousProviderOutcomeError } from '../domain/content-engine.constants';
import { FactVerificationService } from './fact-verification.service';
import { GenerationJobService } from './generation-job.service';
import {
  computeGenerationRequestHash,
  GenerationSpecification,
} from '../domain/generation-specification';

describe('Track B1 Pilot Failure & Active Lock Investigation Regression Suite', () => {
  /* ------------------------------------------------------------------ */
  /* Section 1: Factual Claims Contract                                 */
  /* ------------------------------------------------------------------ */
  describe('Factual Claims Contract', () => {
    const generatorService = new CandidateGeneratorService(
      { create: jest.fn() } as never,
      { holdsLease: jest.fn() } as never,
      { reserve: jest.fn(), settle: jest.fn() } as never,
      new ConfigService({ CONTENT_ENGINE_ENABLED: 'true' }),
      { generateStructured: jest.fn() } as never,
    );

    const parseMc = (candidates: unknown[]) =>
      (
        generatorService as unknown as {
          parse: (raw: string, count: number, mode: string) => unknown[];
        }
      ).parse(
        JSON.stringify({ candidates }),
        candidates.length,
        'multiple_choice',
      );

    const parseClosest = (candidates: unknown[]) =>
      (
        generatorService as unknown as {
          parse: (raw: string, count: number, mode: string) => unknown[];
        }
      ).parse(JSON.stringify({ candidates }), candidates.length, 'closest');

    it('parses valid candidate with required factual claims for knowledge-anchored questions', () => {
      const candidates = [
        {
          concept: 'Atmospheric gas concentrations',
          prompt: 'ما هو الغاز الأكثر وفرة في الغلاف الجوي؟',
          options: [
            { id: 'opt_1', label: 'النيتروجين' },
            { id: 'opt_2', label: 'الأكسجين' },
          ],
          correctOptionId: 'opt_1',
          distractorRationale: [
            { optionId: 'opt_2', why: 'Common confusion with breathing.' },
          ],
          estimatedConfidence: { band: 'even', why: 'Popular misconception.' },
          factualClaims: [
            'Nitrogen makes up approximately 78% of Earth atmosphere.',
          ],
        },
      ];

      const result = parseMc(candidates) as {
        draft: Record<string, unknown>;
        factualClaims: string[];
      }[];
      expect(result).toHaveLength(1);
      expect(result[0].factualClaims).toEqual([
        'Nitrogen makes up approximately 78% of Earth atmosphere.',
      ]);
      expect(result[0].draft.answerPayload).toMatchObject({
        mode: 'multiple_choice',
        correctOptionId: 'opt_1',
      });
    });

    it('parses self-contained puzzle with appropriate correctness evidence (logical/spatial claims)', () => {
      const candidates = [
        {
          concept: 'Mental rotation of 2D geometry',
          prompt:
            'أي الأشكال التالية يمثل الشكل الأصلي بعد تدويره 90 درجة مع عقارب الساعة؟',
          options: [
            { id: 'opt_a', label: 'الشكل أ' },
            { id: 'opt_b', label: 'الشكل ب' },
          ],
          correctOptionId: 'opt_a',
          distractorRationale: [
            {
              optionId: 'opt_b',
              why: 'Reflects across vertical axis instead of rotating.',
            },
          ],
          estimatedConfidence: {
            band: 'likely',
            why: 'Requires visual projection.',
          },
          factualClaims: [
            'Rotating shape S clockwise by 90 degrees maps vertex (0,1) to (1,0) and matches Option A identically.',
          ],
        },
      ];

      const result = parseMc(candidates) as {
        draft: Record<string, unknown>;
        factualClaims: string[];
      }[];
      expect(result).toHaveLength(1);
      expect(result[0].factualClaims[0]).toContain(
        'Rotating shape S clockwise by 90 degrees',
      );
    });

    it('rejects candidate missing required factual claims with CANDIDATE_FACTUAL_CLAIMS_REQUIRED', () => {
      const candidates = [
        {
          concept: 'Spatial puzzle without claim',
          prompt: 'ما الشكل المطابق؟',
          options: [
            { id: '1', label: 'أ' },
            { id: '2', label: 'ب' },
          ],
          correctOptionId: '1',
          distractorRationale: [{ optionId: '2', why: 'Wrong orientation.' }],
          estimatedConfidence: { band: 'even', why: 'Hard.' },
          factualClaims: [], // Empty claims array reproduces the pilot defect!
        },
      ];

      expect(() => parseMc(candidates)).toThrow(CandidateParseError);
      expect(() => parseMc(candidates)).toThrow(
        /CANDIDATE_FACTUAL_CLAIMS_REQUIRED/,
      );
    });

    it('rejects closest candidate missing factual claims with CANDIDATE_FACTUAL_CLAIMS_REQUIRED', () => {
      const closestCandidates = [
        {
          concept: 'Estimation of building height',
          answerBasis: 'knowledge-anchored',
          playerReasoningStrategy: 'Reasoning from standard floor heights.',
          prompt: 'كم متراً يبلغ ارتفاع برج الفيصلية تقريباً؟',
          domainDescription: 'ارتفاعات ناطحات السحاب في الرياض',
          min: 100,
          max: 500,
          step: 5,
          correctValue: 267,
          stepsFromMin: 33,
          factualClaims: [],
        },
      ];

      expect(() => parseClosest(closestCandidates)).toThrow(
        expect.objectContaining({
          code: 'CANDIDATE_FACTUAL_CLAIMS_REQUIRED',
        }),
      );
    });

    it('maintains prompt and schema consistency for factualClaims across both mechanics', () => {
      // 1. RYO Guidance includes factualClaims instruction
      expect(RYO_TASK_GUIDANCE).toContain('5. factualClaims');
      expect(RYO_TASK_GUIDANCE).toContain(
        'For self-contained puzzles or wordplay, state the definitive rule, mathematical calculation, or lexical derivation',
      );

      // 2. Closest Guidance includes factualClaims instruction
      expect(CLOSEST_TASK_GUIDANCE).toContain('7. factualClaims');

      // 3. Schema descriptions are clear and defined
      const mcFactualClaims = (
        RYO_CANDIDATE_SCHEMA.properties as {
          candidates: {
            items: {
              properties: { factualClaims: { description?: string } };
            };
          };
        }
      ).candidates.items.properties.factualClaims;
      expect(mcFactualClaims.description).toBeDefined();
      expect(mcFactualClaims.description).toContain(
        'answer-critical factual or logical claim',
      );

      const closestFactualClaims = (
        CLOSEST_CANDIDATE_SCHEMA.properties as {
          candidates: {
            items: {
              properties: { factualClaims: { description?: string } };
            };
          };
        }
      ).candidates.items.properties.factualClaims;
      expect(closestFactualClaims.description).toBeDefined();
      expect(closestFactualClaims.description).toContain(
        'answer-critical factual or logical claim',
      );
    });

    it('does not fabricate evidence or silently auto-approve unverified puzzle claims', async () => {
      const factsService = new FactVerificationService(
        new ConfigService({ CONTENT_ENGINE_ENABLED: 'true' }),
        undefined, // No retriever
      );

      const verification = await factsService.verify([
        'Rotating shape S clockwise by 90 degrees matches Option A identically.',
      ]);

      // Unresolved claim cannot automatic-advance
      expect(verification.state).toBe('UNRESOLVED');
      expect(verification.automaticAdvance).toBe(false);
      expect(verification.claims[0].reason).toBe(
        'EVIDENCE_RETRIEVER_UNAVAILABLE',
      );
    });
  });

  /* ------------------------------------------------------------------ */
  /* Section 2: Provider Outcomes & Failure Classification              */
  /* ------------------------------------------------------------------ */
  describe('Provider Outcomes & Failure Classification', () => {
    const makeOrchestrator = (options: {
      generatorMock?: unknown;
      budgetMock?: unknown;
      jobsMock?: unknown;
      contextsMock?: unknown;
    }) => {
      const candidateModel = {
        find: () => ({
          sort: () => ({
            lean: () => ({
              exec: async () => [],
            }),
          }),
        }),
      };
      return new ContentEngineOrchestratorService(
        candidateModel as never,
        options.jobsMock as never,
        options.budgetMock as never,
        options.contextsMock as never,
        options.generatorMock as never,
        { beginBatch: jest.fn(), screen: jest.fn() } as never,
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
      );
    };

    it('fails closed deterministically on CandidateParseError without retrying or entering ambiguous review', async () => {
      const failMock = jest.fn(async () => undefined);
      const releaseForRetryMock = jest.fn(async () => undefined);
      const awaitReviewMock = jest.fn(async () => undefined);

      const generatorMock = {
        generate: jest.fn(async () => {
          throw new CandidateParseError(
            'CANDIDATE_FACTUAL_CLAIMS_REQUIRED',
            'every candidate must state its answer-critical claim',
          );
        }),
      };

      const jobsMock = {
        checkpoint: jest.fn(async () => undefined),
        awaitReview: awaitReviewMock,
        releaseForRetry: releaseForRetryMock,
        fail: failMock,
        isCancellationRequested: async () => false,
        holdsLease: async () => true,
      };

      const budgetMock = {
        hasLedgerEntry: jest.fn(async () => false),
      };

      const contextsMock = {
        resolve: () => ({
          mechanicKey: 'read-your-opponent',
          worldKey: 'puzzles',
          scopeKey: 'assembly-rotation',
          contextHash: 'hash',
          effectiveRules: {
            version: 1,
            digest: 'digest',
            rules: [],
            conflicts: [],
          },
        }),
      };

      const orchestrator = makeOrchestrator({
        generatorMock,
        jobsMock,
        budgetMock,
        contextsMock,
      });

      const leasedJob = {
        jobId: 'test-job-parse-fail',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'assembly-rotation',
        targetCount: 5,
      };

      await orchestrator.run(leasedJob as never);

      // Verifies the fix: CandidateParseError calls fail() directly!
      expect(failMock).toHaveBeenCalledWith(
        'test-job-parse-fail',
        1,
        expect.stringContaining('CANDIDATE_FACTUAL_CLAIMS_REQUIRED'),
      );
      // Must NOT be released for retry (which would trigger attempt 2 reconciliation halt!)
      expect(releaseForRetryMock).not.toHaveBeenCalled();
      // Must NOT be placed in ambiguous review
      expect(awaitReviewMock).not.toHaveBeenCalled();
    });

    it('reconciliation-required halt activates if a retried job has spend but zero candidate rows', async () => {
      const awaitReviewMock = jest.fn(async () => undefined);
      const failMock = jest.fn(async () => undefined);

      const jobsMock = {
        checkpoint: jest.fn(async () => undefined),
        awaitReview: awaitReviewMock,
        releaseForRetry: jest.fn(async () => undefined),
        fail: failMock,
        isCancellationRequested: async () => false,
        holdsLease: async () => true,
      };

      // Simulates attempt 2 where attempt 1 wrote a generation ledger entry but failed before saving rows
      const budgetMock = {
        hasLedgerEntry: jest.fn(async (jobId: string, stage: string) => {
          return stage === 'generation';
        }),
      };

      const contextsMock = {
        resolve: () => ({
          mechanicKey: 'read-your-opponent',
          worldKey: 'puzzles',
          scopeKey: 'assembly-rotation',
          contextHash: 'hash',
          effectiveRules: {
            version: 1,
            digest: 'digest',
            rules: [],
            conflicts: [],
          },
        }),
      };

      const orchestrator = makeOrchestrator({
        generatorMock: { generate: jest.fn() },
        jobsMock,
        budgetMock,
        contextsMock,
      });

      const leasedJob = {
        jobId: 'reconciliation-job',
        leaseEpoch: 2,
        attempts: 2,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'assembly-rotation',
        targetCount: 5,
      };

      await orchestrator.run(leasedJob as never);

      expect(awaitReviewMock).toHaveBeenCalledWith({
        jobId: 'reconciliation-job',
        leaseEpoch: 2,
        reason: 'GENERATION_OUTCOME_REQUIRES_RECONCILIATION',
        stage: 'provider_outcome_ambiguous',
      });
    });

    it('handles timeout with AmbiguousProviderOutcomeError by entering provider_outcome_ambiguous', async () => {
      const awaitReviewMock = jest.fn(async () => undefined);

      const generatorMock = {
        generate: jest.fn(async () => {
          throw new AmbiguousProviderOutcomeError(
            'generation',
            'OpenRouter gateway timeout 504',
          );
        }),
      };

      const jobsMock = {
        checkpoint: jest.fn(async () => undefined),
        awaitReview: awaitReviewMock,
        fail: jest.fn(),
        releaseForRetry: jest.fn(),
        isCancellationRequested: async () => false,
        holdsLease: async () => true,
      };

      const budgetMock = {
        hasLedgerEntry: jest.fn(async () => false),
      };

      const contextsMock = {
        resolve: () => ({
          mechanicKey: 'read-your-opponent',
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          contextHash: 'hash',
          effectiveRules: {
            version: 1,
            digest: 'digest',
            rules: [],
            conflicts: [],
          },
        }),
      };

      const orchestrator = makeOrchestrator({
        generatorMock,
        jobsMock,
        budgetMock,
        contextsMock,
      });

      await orchestrator.run({
        jobId: 'timeout-job',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 5,
      } as never);

      expect(awaitReviewMock).toHaveBeenCalledWith({
        jobId: 'timeout-job',
        leaseEpoch: 1,
        reason: expect.stringContaining('OpenRouter gateway timeout 504'),
        stage: 'provider_outcome_ambiguous',
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Section 3: Job Lock & Submission Deduplication                     */
  /* ------------------------------------------------------------------ */
  describe('Job Lock & Submission Deduplication', () => {
    it('requestHash is deterministic and identical for same generation specification', () => {
      const spec: GenerationSpecification = {
        specVersion: 'generation-spec-v1',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        answerMode: 'multiple_choice',
        targetCount: 5,
        difficulty: 'mixed',
        ryoDifficultyTargets: { easy: 25, medium: 50, relativelyDifficult: 25 },
        batchGuidance: null,
        contextHash: 'a'.repeat(64),
        ruleSetDigest: 'b'.repeat(64),
        promptVersion: 'mc-v2',
        provider: 'openrouter',
        generationModel: 'openai/gpt-4o-mini',
        qualityModel: 'openai/gpt-4o-mini',
        temperature: 0.8,
        omitTemperature: false,
        reasoningEffort: null,
        outputTokensPerCandidate: 800,
        maxOutputTokens: 4000,
      };

      const hash1 = computeGenerationRequestHash(spec);
      const hash2 = computeGenerationRequestHash({ ...spec });
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('varying batchGuidance produces a distinct requestHash to allow subsequent pilot batches', () => {
      const baseSpec: GenerationSpecification = {
        specVersion: 'generation-spec-v1',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        answerMode: 'multiple_choice',
        targetCount: 5,
        difficulty: 'mixed',
        ryoDifficultyTargets: { easy: 25, medium: 50, relativelyDifficult: 25 },
        batchGuidance: null,
        contextHash: 'a'.repeat(64),
        ruleSetDigest: 'b'.repeat(64),
        promptVersion: 'mc-v2',
        provider: 'openrouter',
        generationModel: 'openai/gpt-4o-mini',
        qualityModel: 'openai/gpt-4o-mini',
        temperature: 0.8,
        omitTemperature: false,
        reasoningEffort: null,
        outputTokensPerCandidate: 800,
        maxOutputTokens: 4000,
      };

      const pilot1Hash = computeGenerationRequestHash(baseSpec);
      const pilot2Hash = computeGenerationRequestHash({
        ...baseSpec,
        batchGuidance:
          'Pilot 2: focus on anagrams and subtle word associations',
      });

      expect(pilot1Hash).not.toBe(pilot2Hash);
    });

    it('simulates atomic findOneAndUpdate idempotency for active and terminal specifications', async () => {
      const db = new Map<string, Record<string, unknown>>();

      const mockJobModel = {
        findOneAndUpdate: jest.fn(
          (
            query: { requestHash: string },
            update: { $setOnInsert: Record<string, unknown> },
          ) => ({
            lean: () => ({
              exec: async () => {
                const existing = db.get(query.requestHash);
                if (existing) {
                  return existing;
                }
                const inserted = {
                  _id: 'job-' + Math.random().toString(36).slice(2, 9),
                  ...update.$setOnInsert,
                };
                db.set(query.requestHash, inserted);
                return null; // findOneAndUpdate returnDocument: 'before' returns null on insert
              },
            }),
          }),
        ),
        findOne: jest.fn((query: { requestHash: string }) => ({
          lean: () => ({
            exec: async () => db.get(query.requestHash),
          }),
        })),
      };

      const jobService = new GenerationJobService(
        mockJobModel as never,
        new ConfigService({ CONTENT_ENGINE_ENABLED: 'true' }),
      );

      const spec: GenerationSpecification = {
        specVersion: 'generation-spec-v1',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        answerMode: 'multiple_choice',
        targetCount: 5,
        difficulty: 'mixed',
        ryoDifficultyTargets: { easy: 25, medium: 50, relativelyDifficult: 25 },
        batchGuidance: null,
        contextHash: 'c'.repeat(64),
        ruleSetDigest: 'd'.repeat(64),
        promptVersion: 'mc-v2',
        provider: 'openrouter',
        generationModel: 'openai/gpt-4o-mini',
        qualityModel: 'openai/gpt-4o-mini',
        temperature: 0.8,
        omitTemperature: false,
        reasoningEffort: null,
        outputTokensPerCandidate: 800,
        maxOutputTokens: 4000,
      };

      // First submission: created = true
      const sub1 = await jobService.submit({
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 5,
        contextRevision: 'c'.repeat(64),
        generationSpec: spec,
      });
      expect(sub1.created).toBe(true);

      // Concurrent duplicate submission with identical spec: created = false, returns existing jobId
      const sub2 = await jobService.submit({
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 5,
        contextRevision: 'c'.repeat(64),
        generationSpec: spec,
      });
      expect(sub2.created).toBe(false);
      expect(sub2.jobId).toBe(sub1.jobId);

      // Submission with different batch guidance creates a distinct new job
      const sub3 = await jobService.submit({
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 5,
        contextRevision: 'c'.repeat(64),
        generationSpec: {
          ...spec,
          batchGuidance: 'Pilot Run 2',
        },
      });
      expect(sub3.created).toBe(true);
      expect(sub3.jobId).not.toBe(sub1.jobId);
    });
  });
});
