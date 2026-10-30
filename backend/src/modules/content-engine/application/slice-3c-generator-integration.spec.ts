import { ContentEngineOrchestratorService } from './content-engine-orchestrator.service';
import { CandidateGeneratorService } from './candidate-generator.service';
import {
  GenerationPlannerService,
  GenerationPlan,
  computeGenerationPlanDigest,
} from './generation-planner.service';
import { DeterministicScreenService } from './deterministic-screen.service';
import {
  CreativePlannerError,
  GenerationSlot,
} from '../domain/creative-plan.types';
import { ResolvedAuthoringContext } from './authoring-context.service';
import { LeaseLostError } from '../domain/content-engine.constants';

describe('Slice 3C — Generator Integration, Pinned Plans & Family Compliance', () => {
  const dummyContext = (): ResolvedAuthoringContext =>
    ({
      mechanicKey: 'read-your-opponent',
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      global: 'GLOBAL',
      mechanic: 'MECHANIC',
      world: 'WORLD',
      scope: 'SCOPE',
      knowledge: 'KNOWLEDGE',
      exemplars: '',
      historicalExemplars: '',
      exemplarDiagnostics: [],
      sources: {} as never,
      canonicalFamilies: {} as never,
      contextHash: 'a'.repeat(64),
      effectiveRules: {
        version: 1,
        digest: 'b'.repeat(64),
        rules: [],
        resolved: [],
        conflicts: [],
        structuredSources: [],
      },
    }) as unknown as ResolvedAuthoringContext;

  const dummySlot = (
    ordinal: number,
    familyKey: string,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  ): GenerationSlot => ({
    slotIndex: ordinal,
    familyKey,
    familyNameAr:
      familyKey === 'anagram-rearrange'
        ? 'إعادة ترتيب الحروف'
        : 'صيغ الجمع والمفرد',
    mode: 'exploitation',
    difficulty,
    cognitiveTask: 'test cognitive task',
    creativeAngle: 'test angle',
    mechanicFit: 'EXCELLENT',
    selectionReason: 'test reason',
  });

  const createDummyPlan = (slots: GenerationSlot[]): GenerationPlan => {
    const base = {
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
      count: slots.length,
      difficulty: 'mixed',
      difficultyQuotas: { medium: slots.length },
      archetypes: ['puzzle'],
      decisionLoopGuidelines: ['test guideline'],
      antiPatterns: ['test anti-pattern'],
      correctnessRequirements: ['test req'],
      mediaIntent: {
        gameplayMediaRequired: false,
        displayArtworkPolicy: 'none',
        allowedAspectRatios: [],
      },
      catalogDigest: 'd'.repeat(64),
      coverageDigest: 'e'.repeat(64),
      slots,
    };
    return {
      ...base,
      digest: computeGenerationPlanDigest(base),
    };
  };

  describe('1. Pinned Plan Lifecycle & Worker Recovery', () => {
    it('resolves and pins creative plan at context_resolved before generation', async () => {
      const plan = createDummyPlan([
        dummySlot(0, 'anagram-rearrange'),
        dummySlot(1, 'plural-form'),
      ]);

      const planWithResolvedContext = jest.fn(async () => plan);
      const mockPlanner = {
        planWithResolvedContext,
      } as unknown as GenerationPlannerService;

      const checkpoint = jest.fn(async () => undefined);
      const generate = jest.fn(async () => []);

      const orchestrator = new ContentEngineOrchestratorService(
        {
          find: () => ({
            sort: () => ({ lean: () => ({ exec: async () => [] }) }),
          }),
        } as never,
        {
          findById: async () => null, // No existing pinned plan
          checkpoint,
          awaitReview: jest.fn(),
          releaseForRetry: jest.fn(),
          holdsLease: async () => true,
          isCancellationRequested: async () => false,
        } as never,
        { hasLedgerEntry: async () => false } as never,
        { resolve: () => dummyContext() } as never,
        { generate } as never,
        { beginBatch: jest.fn(), screen: jest.fn() } as never,
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { judge: jest.fn() } as never,
        mockPlanner,
      );

      const job = {
        jobId: 'job-slice-3c-1',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 2,
      };

      await orchestrator.run(job as never);

      // Plan should be resolved with resolved context
      expect(planWithResolvedContext).toHaveBeenCalledWith(
        expect.objectContaining({
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          mechanicKey: 'read-your-opponent',
          count: 2,
          seed: 'job-slice-3c-1',
        }),
      );

      // Plan must be pinned in context_resolved checkpoint
      expect(checkpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-slice-3c-1',
          stage: 'context_resolved',
          details: expect.objectContaining({
            pinnedPlan: plan,
            planDigest: plan.digest,
            slotCount: 2,
          }),
        }),
      );

      // Generator must receive pinned generationPlan
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-slice-3c-1',
          generationPlan: plan,
          count: 2,
        }),
      );
    });

    it('reuses existing pinned plan across retries and resumes without re-calling planner', async () => {
      const previouslyPinnedPlan = createDummyPlan([
        dummySlot(0, 'anagram-rearrange'),
        dummySlot(1, 'palindrome-symmetry'),
      ]);

      const planWithResolvedContext = jest.fn();
      const mockPlanner = {
        planWithResolvedContext,
      } as unknown as GenerationPlannerService;

      const checkpoint = jest.fn(async () => undefined);
      const generate = jest.fn(async () => []);

      const orchestrator = new ContentEngineOrchestratorService(
        {
          find: () => ({
            sort: () => ({ lean: () => ({ exec: async () => [] }) }),
          }),
        } as never,
        {
          // Simulating recovered job with already pinned plan
          findById: async () => ({
            stageCheckpoints: {
              context_resolved: {
                pinnedPlan: previouslyPinnedPlan,
                planDigest: previouslyPinnedPlan.digest,
              },
            },
          }),
          checkpoint,
          awaitReview: jest.fn(),
          releaseForRetry: jest.fn(),
          holdsLease: async () => true,
          isCancellationRequested: async () => false,
        } as never,
        { hasLedgerEntry: async () => false } as never,
        { resolve: () => dummyContext() } as never,
        { generate } as never,
        { beginBatch: jest.fn(), screen: jest.fn() } as never,
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { judge: jest.fn() } as never,
        mockPlanner,
      );

      const job = {
        jobId: 'job-resumed-1',
        leaseEpoch: 2,
        attempts: 2,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 2,
      };

      await orchestrator.run(job as never);

      // Must NOT re-resolve plan when already pinned
      expect(planWithResolvedContext).not.toHaveBeenCalled();

      // Checkpoint must preserve the previously pinned plan
      expect(checkpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-resumed-1',
          stage: 'context_resolved',
          details: expect.objectContaining({
            pinnedPlan: previouslyPinnedPlan,
          }),
        }),
      );

      // Generator must receive the previously pinned plan
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-resumed-1',
          generationPlan: previouslyPinnedPlan,
        }),
      );
    });

    it('fails closed to awaitReview if planner throws CreativePlannerError', async () => {
      const planWithResolvedContext = jest.fn(async () => {
        throw new CreativePlannerError(
          'HISTORICAL_COVERAGE_INCOMPLETE',
          'Historical coverage is partial (only 20 items checked)',
        );
      });
      const mockPlanner = {
        planWithResolvedContext,
      } as unknown as GenerationPlannerService;

      const awaitReview = jest.fn(async () => undefined);
      const generate = jest.fn();

      const orchestrator = new ContentEngineOrchestratorService(
        {
          find: () => ({
            sort: () => ({ lean: () => ({ exec: async () => [] }) }),
          }),
        } as never,
        {
          findById: async () => null,
          checkpoint: jest.fn(),
          awaitReview,
          releaseForRetry: jest.fn(),
          holdsLease: async () => true,
          isCancellationRequested: async () => false,
        } as never,
        { hasLedgerEntry: async () => false } as never,
        { resolve: () => dummyContext() } as never,
        { generate } as never,
        { beginBatch: jest.fn(), screen: jest.fn() } as never,
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { judge: jest.fn() } as never,
        mockPlanner,
      );

      const job = {
        jobId: 'job-failed-plan-1',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 2,
      };

      await orchestrator.run(job as never);

      expect(generate).not.toHaveBeenCalled();
      expect(awaitReview).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-failed-plan-1',
          reason: expect.stringContaining('HISTORICAL_COVERAGE_INCOMPLETE'),
        }),
      );
    });

    it('halts in awaitReview with PINNED_PLAN_TARGET_MISMATCH when existing pinned plan parameters do not match leased job', async () => {
      const previouslyPinnedPlan = createDummyPlan([
        dummySlot(0, 'anagram-rearrange'),
        dummySlot(1, 'palindrome-symmetry'),
      ]);
      // Mutate plan target count so it mismatches job.targetCount (which will be 3)
      previouslyPinnedPlan.count = 2;

      const awaitReview = jest.fn(async () => undefined);
      const generate = jest.fn();

      const orchestrator = new ContentEngineOrchestratorService(
        {
          find: () => ({
            sort: () => ({ lean: () => ({ exec: async () => [] }) }),
          }),
        } as never,
        {
          findById: async () => ({
            stageCheckpoints: {
              context_resolved: {
                pinnedPlan: previouslyPinnedPlan,
                planDigest: previouslyPinnedPlan.digest,
              },
            },
          }),
          checkpoint: jest.fn(),
          awaitReview,
          releaseForRetry: jest.fn(),
          holdsLease: async () => true,
          isCancellationRequested: async () => false,
        } as never,
        { hasLedgerEntry: async () => false } as never,
        { resolve: () => dummyContext() } as never,
        { generate } as never,
        { beginBatch: jest.fn(), screen: jest.fn() } as never,
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { judge: jest.fn() } as never,
      );

      const job = {
        jobId: 'job-mismatch-target-1',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 3, // Mismatch: plan has 2, job has 3
      };

      await orchestrator.run(job as never);

      expect(generate).not.toHaveBeenCalled();
      expect(awaitReview).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-mismatch-target-1',
          reason: expect.stringContaining('PINNED_PLAN_TARGET_MISMATCH'),
        }),
      );
    });

    it('halts in awaitReview with PINNED_PLAN_MALFORMED when existing pinned plan has corrupted or missing digest', async () => {
      const malformedPlan = {
        ...createDummyPlan([dummySlot(0, 'anagram-rearrange')]),
        digest: '', // Missing digest
      };

      const awaitReview = jest.fn(async () => undefined);
      const generate = jest.fn();

      const orchestrator = new ContentEngineOrchestratorService(
        {
          find: () => ({
            sort: () => ({ lean: () => ({ exec: async () => [] }) }),
          }),
        } as never,
        {
          findById: async () => ({
            stageCheckpoints: {
              context_resolved: {
                pinnedPlan: malformedPlan,
              },
            },
          }),
          checkpoint: jest.fn(),
          awaitReview,
          releaseForRetry: jest.fn(),
          holdsLease: async () => true,
          isCancellationRequested: async () => false,
        } as never,
        { hasLedgerEntry: async () => false } as never,
        { resolve: () => dummyContext() } as never,
        { generate } as never,
        { beginBatch: jest.fn(), screen: jest.fn() } as never,
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { judge: jest.fn() } as never,
      );

      const job = {
        jobId: 'job-malformed-plan-1',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 1,
      };

      await orchestrator.run(job as never);

      expect(generate).not.toHaveBeenCalled();
      expect(awaitReview).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-malformed-plan-1',
          reason: expect.stringContaining('PINNED_PLAN_MALFORMED'),
        }),
      );
    });

    it('aborts generation if lease is lost during context checkpointing before candidate generation', async () => {
      const plan = createDummyPlan([dummySlot(0, 'anagram-rearrange')]);
      const generate = jest.fn();

      const orchestrator = new ContentEngineOrchestratorService(
        {
          find: () => ({
            sort: () => ({ lean: () => ({ exec: async () => [] }) }),
          }),
        } as never,
        {
          findById: async () => null,
          checkpoint: jest.fn(async () => {
            throw new LeaseLostError('job-lease-lost-1', 1);
          }),
          awaitReview: jest.fn(),
          releaseForRetry: jest.fn(),
          holdsLease: async () => false,
          isCancellationRequested: async () => false,
        } as never,
        { hasLedgerEntry: async () => false } as never,
        { resolve: () => dummyContext() } as never,
        { generate } as never,
        { beginBatch: jest.fn(), screen: jest.fn() } as never,
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { judge: jest.fn() } as never,
        {
          planWithResolvedContext: jest.fn(async () => plan),
        } as never,
      );

      const job = {
        jobId: 'job-lease-lost-1',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 1,
      };

      await expect(orchestrator.run(job as never)).rejects.toThrow(
        LeaseLostError,
      );

      // Candidate generator must never be called when lease was lost at context checkpoint
      expect(generate).not.toHaveBeenCalled();
    });

    it('rejects plan when slot family is tampered (PINNED_PLAN_DIGEST_MISMATCH)', async () => {
      const previouslyPinnedPlan = createDummyPlan([
        dummySlot(0, 'anagram-rearrange'),
        dummySlot(1, 'palindrome-symmetry'),
      ]);
      // Tamper slot family without updating digest
      previouslyPinnedPlan.slots![0].familyKey = 'unauthorized-family';

      const awaitReview = jest.fn(async () => undefined);
      const generate = jest.fn();

      const orchestrator = new ContentEngineOrchestratorService(
        {
          find: () => ({
            sort: () => ({ lean: () => ({ exec: async () => [] }) }),
          }),
        } as never,
        {
          findById: async () => ({
            stageCheckpoints: {
              context_resolved: {
                pinnedPlan: previouslyPinnedPlan,
              },
            },
          }),
          checkpoint: jest.fn(),
          awaitReview,
          releaseForRetry: jest.fn(),
          holdsLease: async () => true,
          isCancellationRequested: async () => false,
        } as never,
        { hasLedgerEntry: async () => false } as never,
        { resolve: () => dummyContext() } as never,
        { generate } as never,
        { beginBatch: jest.fn(), screen: jest.fn() } as never,
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { judge: jest.fn() } as never,
      );

      const job = {
        jobId: 'job-tampered-slot-family',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 2,
      };

      await orchestrator.run(job as never);

      expect(generate).not.toHaveBeenCalled();
      expect(awaitReview).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-tampered-slot-family',
          reason: expect.stringContaining('PINNED_PLAN_DIGEST_MISMATCH'),
        }),
      );
    });

    it('rejects plan when slot order is tampered (PINNED_PLAN_DIGEST_MISMATCH)', async () => {
      const previouslyPinnedPlan = createDummyPlan([
        dummySlot(0, 'anagram-rearrange'),
        dummySlot(1, 'palindrome-symmetry'),
      ]);
      // Tamper slot order by swapping slots
      previouslyPinnedPlan.slots = [
        previouslyPinnedPlan.slots![1],
        previouslyPinnedPlan.slots![0],
      ];

      const awaitReview = jest.fn(async () => undefined);
      const generate = jest.fn();

      const orchestrator = new ContentEngineOrchestratorService(
        {
          find: () => ({
            sort: () => ({ lean: () => ({ exec: async () => [] }) }),
          }),
        } as never,
        {
          findById: async () => ({
            stageCheckpoints: {
              context_resolved: {
                pinnedPlan: previouslyPinnedPlan,
              },
            },
          }),
          checkpoint: jest.fn(),
          awaitReview,
          releaseForRetry: jest.fn(),
          holdsLease: async () => true,
          isCancellationRequested: async () => false,
        } as never,
        { hasLedgerEntry: async () => false } as never,
        { resolve: () => dummyContext() } as never,
        { generate } as never,
        { beginBatch: jest.fn(), screen: jest.fn() } as never,
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { judge: jest.fn() } as never,
      );

      const job = {
        jobId: 'job-tampered-slot-order',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 2,
      };

      await orchestrator.run(job as never);

      expect(generate).not.toHaveBeenCalled();
      expect(awaitReview).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-tampered-slot-order',
          reason: expect.stringContaining('PINNED_PLAN_DIGEST_MISMATCH'),
        }),
      );
    });

    it('rejects plan when digest-covered configuration is tampered (PINNED_PLAN_DIGEST_MISMATCH)', async () => {
      const previouslyPinnedPlan = createDummyPlan([
        dummySlot(0, 'anagram-rearrange'),
      ]);
      // Tamper difficulty
      previouslyPinnedPlan.difficulty = 'hard';

      const awaitReview = jest.fn(async () => undefined);
      const generate = jest.fn();

      const orchestrator = new ContentEngineOrchestratorService(
        {
          find: () => ({
            sort: () => ({ lean: () => ({ exec: async () => [] }) }),
          }),
        } as never,
        {
          findById: async () => ({
            stageCheckpoints: {
              context_resolved: {
                pinnedPlan: previouslyPinnedPlan,
              },
            },
          }),
          checkpoint: jest.fn(),
          awaitReview,
          releaseForRetry: jest.fn(),
          holdsLease: async () => true,
          isCancellationRequested: async () => false,
        } as never,
        { hasLedgerEntry: async () => false } as never,
        { resolve: () => dummyContext() } as never,
        { generate } as never,
        { beginBatch: jest.fn(), screen: jest.fn() } as never,
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { judge: jest.fn() } as never,
      );

      const job = {
        jobId: 'job-tampered-config',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 1,
      };

      await orchestrator.run(job as never);

      expect(generate).not.toHaveBeenCalled();
      expect(awaitReview).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-tampered-config',
          reason: expect.stringContaining('PINNED_PLAN_DIGEST_MISMATCH'),
        }),
      );
    });

    it('rejects plan when stored digest alone is tampered (PINNED_PLAN_DIGEST_MISMATCH)', async () => {
      const previouslyPinnedPlan = createDummyPlan([
        dummySlot(0, 'anagram-rearrange'),
      ]);
      // Tamper digest alone
      previouslyPinnedPlan.digest = 'f'.repeat(64);

      const awaitReview = jest.fn(async () => undefined);
      const generate = jest.fn();

      const orchestrator = new ContentEngineOrchestratorService(
        {
          find: () => ({
            sort: () => ({ lean: () => ({ exec: async () => [] }) }),
          }),
        } as never,
        {
          findById: async () => ({
            stageCheckpoints: {
              context_resolved: {
                pinnedPlan: previouslyPinnedPlan,
              },
            },
          }),
          checkpoint: jest.fn(),
          awaitReview,
          releaseForRetry: jest.fn(),
          holdsLease: async () => true,
          isCancellationRequested: async () => false,
        } as never,
        { hasLedgerEntry: async () => false } as never,
        { resolve: () => dummyContext() } as never,
        { generate } as never,
        { beginBatch: jest.fn(), screen: jest.fn() } as never,
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { judge: jest.fn() } as never,
      );

      const job = {
        jobId: 'job-tampered-digest',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 1,
      };

      await orchestrator.run(job as never);

      expect(generate).not.toHaveBeenCalled();
      expect(awaitReview).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'job-tampered-digest',
          reason: expect.stringContaining('PINNED_PLAN_DIGEST_MISMATCH'),
        }),
      );
    });
  });

  describe('2. Generator Slot Mapping & Candidate Authoring', () => {
    it('maps candidates to assigned slots by ordinal and persists assignedSlot in authoring', async () => {
      const plan = createDummyPlan([
        dummySlot(0, 'anagram-rearrange', 'easy'),
        dummySlot(1, 'plural-form', 'hard'),
      ]);

      const updateOne = jest.fn(() => ({
        exec: async () => ({ matchedCount: 1 }),
      }));
      const reserve = jest.fn(async () => ({ reservedMicros: 1000 }));
      const settle = jest.fn(async () => ({ actualMicros: 800 }));

      const fakeProvider = {
        generateText: jest.fn(async () => ({
          text: JSON.stringify({
            candidates: [
              {
                slotIndex: 0,
                concept: 'Anagram for peach',
                prompt: 'رتب الحروف: خ - و - خ',
                options: [
                  { id: '1', label: 'خوخ' },
                  { id: '2', label: 'توت' },
                ],
                correctOptionId: '1',
                distractorRationale: [{ optionId: '2', why: 'Fruit' }],
                estimatedConfidence: { band: 'likely', why: 'common' },
                factualClaims: ['خوخ is spelled خ و خ'],
              },
              {
                slotIndex: 1,
                concept: 'Plural of key',
                prompt: 'ما جمع مفتاح؟',
                options: [
                  { id: '1', label: 'مفاتيح' },
                  { id: '2', label: 'مفاتيحات' },
                ],
                correctOptionId: '1',
                distractorRationale: [{ optionId: '2', why: 'Wrong plural' }],
                estimatedConfidence: { band: 'likely', why: 'standard' },
                factualClaims: ['مفاتيح is plural of مفتاح'],
              },
            ],
          }),
          usage: { promptTokens: 100, outputTokens: 200 },
        })),
      };

      const mockConfig = {
        get: (k: string) => {
          if (k === 'ENGINE_RYO_DIFFICULTY_EASY_PERCENT') return '25';
          if (k === 'ENGINE_RYO_DIFFICULTY_MEDIUM_PERCENT') return '50';
          if (k === 'ENGINE_RYO_DIFFICULTY_RELATIVELY_DIFFICULT_PERCENT')
            return '25';
          if (k === 'ENGINE_GENERATION_MODEL') return 'fake-model';
          return undefined;
        },
      };

      const generator = new CandidateGeneratorService(
        { updateOne } as never,
        { holdsLease: async () => true } as never,
        { reserve, settle } as never,
        mockConfig as never,
        fakeProvider as never,
      );

      const candidates = await generator.generate({
        jobId: 'job-gen-slots-1',
        leaseEpoch: 1,
        attempt: 1,
        context: dummyContext(),
        count: 2,
        generationPlan: plan,
      });

      expect(candidates).toHaveLength(2);

      // Verify that the prompt sent to provider included per-question slot instructions
      const callArg = (
        fakeProvider.generateText.mock.calls[0] as unknown as [
          { prompt: string },
        ]
      )[0];
      expect(callArg.prompt).toContain('### 7. PER-QUESTION CREATIVE SLOTS');
      expect(callArg.prompt).toContain(
        '[Slot #1] (EXPLOITATION) إعادة ترتيب الحروف [anagram-rearrange]',
      );
      expect(callArg.prompt).toContain(
        '[Slot #2] (EXPLOITATION) صيغ الجمع والمفرد [plural-form]',
      );

      // Verify candidate ordinal 0 has slot 0 authoring
      expect(updateOne).toHaveBeenCalledWith(
        { jobId: 'job-gen-slots-1', ordinal: 0 },
        expect.objectContaining({
          $set: expect.objectContaining({
            authoring: expect.objectContaining({
              concept: 'Anagram for peach',
              assignedSlot: expect.objectContaining({
                slotIndex: 0,
                familyKey: 'anagram-rearrange',
                difficulty: 'easy',
              }),
            }),
          }),
        }),
        { upsert: true },
      );

      // Verify candidate ordinal 1 has slot 1 authoring
      expect(updateOne).toHaveBeenCalledWith(
        { jobId: 'job-gen-slots-1', ordinal: 1 },
        expect.objectContaining({
          $set: expect.objectContaining({
            authoring: expect.objectContaining({
              concept: 'Plural of key',
              assignedSlot: expect.objectContaining({
                slotIndex: 1,
                familyKey: 'plural-form',
                difficulty: 'hard',
              }),
            }),
          }),
        }),
        { upsert: true },
      );

      // Verify that provider received schema with slotIndex
      const schemaItems = (
        callArg as unknown as {
          responseSchema: {
            properties: {
              candidates: {
                items: {
                  required: string[];
                  properties: Record<string, unknown>;
                };
              };
            };
          };
        }
      ).responseSchema.properties.candidates.items;
      expect(schemaItems.required).toContain('slotIndex');
      expect(schemaItems.properties.slotIndex).toEqual(
        expect.objectContaining({ type: 'integer' }),
      );
    });

    it('fails closed with SLOT_IDENTITY_MISSING when creative-slot job candidate lacks slotIndex', () => {
      const generator = new CandidateGeneratorService(
        {} as never,
        {} as never,
        {} as never,
        { get: () => undefined } as never,
      );

      const payload = JSON.stringify({
        candidates: [
          {
            concept: 'Concept 1',
            prompt: 'Prompt 1',
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
            factualClaims: ['Claim 1'],
          },
          {
            concept: 'Concept 2',
            prompt: 'Prompt 2',
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
            factualClaims: ['Claim 2'],
          },
        ],
      });

      expect(() =>
        generator.parse(payload, 2, 'multiple_choice', {
          requireSlotIdentity: true,
        }),
      ).toThrow(expect.objectContaining({ code: 'SLOT_IDENTITY_MISSING' }));
    });

    it('fails closed with SLOT_INDEX_CONFLICT when candidate provides conflicting slotIndex and slotNumber', () => {
      const generator = new CandidateGeneratorService(
        {} as never,
        {} as never,
        {} as never,
        { get: () => undefined } as never,
      );

      const conflicting = JSON.stringify({
        candidates: [
          {
            slotIndex: 0,
            slotNumber: 2, // Contradicts slotIndex 0!
            concept: 'Concept 1',
            prompt: 'Prompt 1',
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
            factualClaims: ['Claim 1'],
          },
          {
            slotIndex: 1,
            slotNumber: 2,
            concept: 'Concept 2',
            prompt: 'Prompt 2',
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
            factualClaims: ['Claim 2'],
          },
        ],
      });

      expect(() => generator.parse(conflicting, 2, 'multiple_choice')).toThrow(
        expect.objectContaining({ code: 'SLOT_INDEX_CONFLICT' }),
      );
    });

    it('maps reordered candidate responses to correct slots and preserves stable ordinals in persistence', async () => {
      const plan = createDummyPlan([
        dummySlot(0, 'anagram-rearrange', 'easy'),
        dummySlot(1, 'plural-form', 'hard'),
      ]);

      const updateOne = jest.fn(() => ({
        exec: async () => ({ matchedCount: 1 }),
      }));
      const reserve = jest.fn(async () => ({ reservedMicros: 1000 }));
      const settle = jest.fn(async () => ({ actualMicros: 800 }));

      // Model returns slot 1 first, then slot 0 second:
      const fakeProvider = {
        generateText: jest.fn(async () => ({
          text: JSON.stringify({
            candidates: [
              {
                slotIndex: 1,
                concept: 'Plural candidate returned first',
                prompt: 'ما جمع مفتاح؟',
                options: [
                  { id: '1', label: 'مفاتيح' },
                  { id: '2', label: 'مفاتيحات' },
                ],
                correctOptionId: '1',
                distractorRationale: [{ optionId: '2', why: 'Wrong plural' }],
                estimatedConfidence: { band: 'likely', why: 'standard' },
                factualClaims: ['مفاتيح is plural of مفتاح'],
              },
              {
                slotIndex: 0,
                concept: 'Anagram candidate returned second',
                prompt: 'رتب الحروف: خ - و - خ',
                options: [
                  { id: '1', label: 'خوخ' },
                  { id: '2', label: 'توت' },
                ],
                correctOptionId: '1',
                distractorRationale: [{ optionId: '2', why: 'Fruit' }],
                estimatedConfidence: { band: 'likely', why: 'common' },
                factualClaims: ['خوخ is spelled خ و خ'],
              },
            ],
          }),
          usage: { promptTokens: 100, outputTokens: 200 },
        })),
      };

      const generator = new CandidateGeneratorService(
        { updateOne } as never,
        { holdsLease: async () => true } as never,
        { reserve, settle } as never,
        { get: () => undefined } as never,
        fakeProvider as never,
      );

      const candidates = await generator.generate({
        jobId: 'job-reordered-persistence',
        leaseEpoch: 1,
        attempt: 1,
        context: dummyContext(),
        count: 2,
        generationPlan: plan,
      });

      expect(candidates).toHaveLength(2);

      // Ordinal 0 must have Anagram (slotIndex 0)
      expect(updateOne).toHaveBeenCalledWith(
        { jobId: 'job-reordered-persistence', ordinal: 0 },
        expect.objectContaining({
          $set: expect.objectContaining({
            authoring: expect.objectContaining({
              concept: 'Anagram candidate returned second',
              assignedSlot: expect.objectContaining({
                slotIndex: 0,
                familyKey: 'anagram-rearrange',
              }),
            }),
          }),
        }),
        { upsert: true },
      );

      // Ordinal 1 must have Plural (slotIndex 1)
      expect(updateOne).toHaveBeenCalledWith(
        { jobId: 'job-reordered-persistence', ordinal: 1 },
        expect.objectContaining({
          $set: expect.objectContaining({
            authoring: expect.objectContaining({
              concept: 'Plural candidate returned first',
              assignedSlot: expect.objectContaining({
                slotIndex: 1,
                familyKey: 'plural-form',
              }),
            }),
          }),
        }),
        { upsert: true },
      );
    });

    it('V1 generation without creative slots passes unmodified schema and preserves positional behavior', async () => {
      const updateOne = jest.fn(() => ({
        exec: async () => ({ matchedCount: 1 }),
      }));
      const reserve = jest.fn(async () => ({ reservedMicros: 1000 }));
      const settle = jest.fn(async () => ({ actualMicros: 800 }));

      const fakeProvider = {
        generateText: jest.fn(async () => ({
          text: JSON.stringify({
            candidates: [
              {
                concept: 'Legacy V1 Candidate',
                prompt: 'سؤال عام',
                options: [
                  { id: '1', label: 'أ' },
                  { id: '2', label: 'ب' },
                ],
                correctOptionId: '1',
                distractorRationale: [{ optionId: '2', why: 'خطأ' }],
                estimatedConfidence: { band: 'likely', why: 'standard' },
                factualClaims: ['حقيقة عامة'],
              },
            ],
          }),
          usage: { promptTokens: 50, outputTokens: 100 },
        })),
      };

      const generator = new CandidateGeneratorService(
        { updateOne } as never,
        { holdsLease: async () => true } as never,
        { reserve, settle } as never,
        { get: () => undefined } as never,
        fakeProvider as never,
      );

      const candidates = await generator.generate({
        jobId: 'job-v1-legacy',
        leaseEpoch: 1,
        attempt: 1,
        context: dummyContext(),
        count: 1,
      });

      expect(candidates).toHaveLength(1);

      // Verify that provider received base RYO schema without slotIndex
      const callArg = (
        fakeProvider.generateText.mock.calls[0] as unknown as [
          { responseSchema: Record<string, unknown> },
        ]
      )[0];
      const items = (
        callArg.responseSchema.properties as {
          candidates: { items: { required: string[] } };
        }
      ).candidates.items;
      expect(items.required).not.toContain('slotIndex');

      // Candidate authoring must NOT have assignedSlot
      expect(updateOne).toHaveBeenCalledWith(
        { jobId: 'job-v1-legacy', ordinal: 0 },
        expect.objectContaining({
          $set: expect.objectContaining({
            authoring: expect.not.objectContaining({
              assignedSlot: expect.anything(),
            }),
          }),
        }),
        { upsert: true },
      );
    });

    it('throws CANDIDATE_COUNT_INVALID when model generates fewer or extra candidates than requested', () => {
      const generator = new CandidateGeneratorService(
        {} as never,
        {} as never,
        {} as never,
        { get: () => undefined } as never,
      ) as unknown as {
        parse: (
          raw: string,
          count: number,
          mode?: 'closest' | 'multiple_choice',
        ) => Array<{ authoring: { concept: string } }>;
      };

      const makePayload = (count: number) =>
        JSON.stringify({
          candidates: Array.from({ length: count }, (_, i) => ({
            concept: `c-${i}`,
            prompt: `q-${i}`,
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
          })),
        });

      // Requested 2, but received 1
      expect(() => generator.parse(makePayload(1), 2)).toThrow(
        expect.objectContaining({ code: 'CANDIDATE_COUNT_INVALID' }),
      );

      // Requested 2, but received 3
      expect(() => generator.parse(makePayload(3), 2)).toThrow(
        expect.objectContaining({ code: 'CANDIDATE_COUNT_INVALID' }),
      );
    });

    it('handles explicit slot indexing: enforces bounds, rejects duplicates and partial indexing, and orders candidates properly', () => {
      const generator = new CandidateGeneratorService(
        {} as never,
        {} as never,
        {} as never,
        { get: () => undefined } as never,
      ) as unknown as {
        parse: (
          raw: string,
          count: number,
          mode?: 'closest' | 'multiple_choice',
        ) => Array<{ authoring: { concept: string } }>;
      };

      // 1. Out of bounds index
      const outOfBounds = JSON.stringify({
        candidates: [
          {
            slotIndex: 5,
            concept: 'Out of bounds',
            prompt: 'q1',
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
          },
          {
            slotIndex: 0,
            concept: 'Zero',
            prompt: 'q2',
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
          },
        ],
      });
      expect(() => generator.parse(outOfBounds, 2)).toThrow(
        expect.objectContaining({ code: 'SLOT_INDEX_OUT_OF_BOUNDS' }),
      );

      // 2. Duplicate slot index
      const duplicateIndices = JSON.stringify({
        candidates: [
          {
            slotIndex: 0,
            concept: 'First copy',
            prompt: 'q1',
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
          },
          {
            slotIndex: 0,
            concept: 'Second copy',
            prompt: 'q2',
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
          },
        ],
      });
      expect(() => generator.parse(duplicateIndices, 2)).toThrow(
        expect.objectContaining({ code: 'DUPLICATE_SLOT_INDEX' }),
      );

      // 3. Partially specified indices
      const partiallySpecified = JSON.stringify({
        candidates: [
          {
            slotIndex: 0,
            concept: 'Has index',
            prompt: 'q1',
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
          },
          {
            concept: 'Missing index',
            prompt: 'q2',
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
          },
        ],
      });
      expect(() => generator.parse(partiallySpecified, 2)).toThrow(
        expect.objectContaining({ code: 'SLOT_INDEX_PARTIALLY_SPECIFIED' }),
      );

      // 4. Valid reordered 1-based slot numbers are sorted to matching ordinals
      const reordered = JSON.stringify({
        candidates: [
          {
            slotNumber: 2,
            concept: 'Second candidate returned first',
            prompt: 'q2',
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
            factualClaims: ['Fact 2'],
          },
          {
            slotNumber: 1,
            concept: 'First candidate returned second',
            prompt: 'q1',
            options: [
              { id: '1', label: 'o1' },
              { id: '2', label: 'o2' },
            ],
            correctOptionId: '1',
            factualClaims: ['Fact 1'],
          },
        ],
      });
      const parsed = generator.parse(reordered, 2);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].authoring.concept).toBe(
        'First candidate returned second',
      );
      expect(parsed[1].authoring.concept).toBe(
        'Second candidate returned first',
      );
    });
  });

  describe('3. Screening Family Compliance Validation', () => {
    const screenService = new DeterministicScreenService({
      get: () => undefined,
    } as never);

    it('emits no compliance warning when candidate satisfies assigned family rules', () => {
      const result = screenService.screen(
        {
          prompt: { ar: 'رتب الحروف التالية: (م - ن - ج - ا)' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: '1', label: { ar: 'منجا' } },
              { id: '2', label: { ar: 'تفاح' } },
            ],
            correctOptionId: '1',
          },
        },
        {
          assignedSlot: {
            slotIndex: 0,
            familyKey: 'anagram-rearrange',
          },
        },
      );

      const familyFindings = result.findings.filter((f) =>
        f.code.startsWith('FAMILY_COMPLIANCE'),
      );
      expect(familyFindings).toHaveLength(0);
    });

    it('emits FAMILY_COMPLIANCE_MISMATCH warning when candidate breaches assigned family directive', () => {
      const result = screenService.screen(
        {
          // Candidate prompt is actually plural-form, not anagram-rearrange
          prompt: { ar: 'ما جمع كلمة كتاب في اللغة العربية؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: '1', label: { ar: 'كتب' } },
              { id: '2', label: { ar: 'كتيبات' } },
            ],
            correctOptionId: '1',
          },
        },
        {
          assignedSlot: {
            slotIndex: 0,
            familyKey: 'anagram-rearrange',
          },
        },
      );

      const mismatchFinding = result.findings.find(
        (f) => f.code === 'FAMILY_COMPLIANCE_MISMATCH',
      );
      expect(mismatchFinding).toBeDefined();
      expect(mismatchFinding?.severity).toBe('warning');
      expect(mismatchFinding?.message).toContain('plural-form');
    });

    it('emits FAMILY_COMPLIANCE_UNVERIFIED warning when family has no automated structural rules', () => {
      const result = screenService.screen(
        {
          prompt: { ar: 'ما عاصمة عمان؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: '1', label: { ar: 'مسقط' } },
              { id: '2', label: { ar: 'صلالة' } },
            ],
            correctOptionId: '1',
          },
        },
        {
          assignedSlot: {
            slotIndex: 0,
            familyKey: 'middle-east-geography-trivia',
          },
        },
      );

      const unverifiedFinding = result.findings.find(
        (f) => f.code === 'FAMILY_COMPLIANCE_UNVERIFIED',
      );
      expect(unverifiedFinding).toBeDefined();
      expect(unverifiedFinding?.severity).toBe('warning');
      expect(unverifiedFinding?.message).toContain(
        'middle-east-geography-trivia',
      );
    });

    it('candidate metadata declaring assignedFamilyKey does NOT forge rule_evaluated compliance without structural evidence', () => {
      // 1. Strictly verifiable family (plural-form) with unrelated prompt emits mismatch even if metadata claims it
      const strictlyVerifiableResult = screenService.screen(
        {
          prompt: { ar: 'ما هي عاصمة دولة سلطنة عمان؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: '1', label: { ar: 'مسقط' } },
              { id: '2', label: { ar: 'نزوى' } },
            ],
            correctOptionId: '1',
          },
        },
        {
          assignedSlot: {
            slotIndex: 0,
            familyKey: 'plural-form',
          },
          declaredFamilyKey: 'plural-form',
        },
      );
      expect(
        strictlyVerifiableResult.findings.some(
          (f) => f.code === 'FAMILY_COMPLIANCE_MISMATCH',
        ),
      ).toBe(true);

      // 2. Unverified family with declared metadata still emits FAMILY_COMPLIANCE_UNVERIFIED (never rule_evaluated)
      const unverifiedResult = screenService.screen(
        {
          prompt: { ar: 'ما هي عاصمة سلطنة عمان؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: '1', label: { ar: 'مسقط' } },
              { id: '2', label: { ar: 'نزوى' } },
            ],
            correctOptionId: '1',
          },
        },
        {
          assignedSlot: {
            slotIndex: 0,
            familyKey: 'middle-east-geography-trivia',
          },
          declaredFamilyKey: 'middle-east-geography-trivia',
        },
      );
      expect(
        unverifiedResult.findings.some(
          (f) => f.code === 'FAMILY_COMPLIANCE_UNVERIFIED',
        ),
      ).toBe(true);
    });
  });

  describe('4. Orchestrator Integration with Screening and Candidate Compliance Persistence', () => {
    it('persists familyCompliance evaluation on candidate document during orchestrator screening', async () => {
      const updateCandidateDoc = jest.fn(() => ({
        exec: async () => ({ matchedCount: 1 }),
      }));

      const existingRows = [
        {
          _id: 'cand-1',
          candidateId: 'cid-1',
          ordinal: 0,
          status: 'generated',
          draft: {
            prompt: { ar: 'ما جمع كلمة باب؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'أبواب' } },
                { id: '2', label: { ar: 'بيبان' } },
              ],
              correctOptionId: '1',
            },
          },
          authoring: {
            concept: 'Plural of door',
            assignedSlot: {
              slotIndex: 0,
              familyKey: 'plural-form',
            },
          },
          findings: [],
        },
      ];

      const orchestrator = new ContentEngineOrchestratorService(
        {
          find: () => ({
            sort: () => ({ lean: () => ({ exec: async () => existingRows }) }),
          }),
          updateOne: updateCandidateDoc,
        } as never,
        {
          findById: async () => ({
            stageCheckpoints: {
              context_resolved: {
                pinnedPlan: createDummyPlan([dummySlot(0, 'plural-form')]),
              },
            },
          }),
          checkpoint: jest.fn(async () => undefined),
          awaitReview: jest.fn(),
          releaseForRetry: jest.fn(),
          holdsLease: async () => true,
          isCancellationRequested: async () => false,
        } as never,
        { hasLedgerEntry: async () => false } as never,
        { resolve: () => dummyContext() } as never,
        { generate: jest.fn() } as never,
        new DeterministicScreenService({ get: () => undefined } as never),
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { judge: jest.fn() } as never,
      );

      const job = {
        jobId: 'job-compliance-persist-1',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 1,
      };

      await orchestrator.run(job as never);

      // Verify that candidate was updated with screened_pass and authoring.familyCompliance
      expect(updateCandidateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'cand-1' }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'screened_pass',
            authoring: expect.objectContaining({
              familyCompliance: expect.objectContaining({
                assignedFamilyKey: 'plural-form',
                detectedFamilyKey: 'plural-form',
                isCompliant: true,
                verificationMethod: 'rule_evaluated',
              }),
            }),
          }),
        }),
      );
    });
  });
});
