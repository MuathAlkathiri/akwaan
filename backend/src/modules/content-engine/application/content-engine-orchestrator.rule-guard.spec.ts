import { ContentEngineOrchestratorService } from './content-engine-orchestrator.service';
import { CandidateParseError } from './candidate-generator.service';
import { EffectiveRuleSet, RuleConflict } from '../domain/effective-rules';

/**
 * The guard that protects spend.
 *
 * Preflight and submit also check, but a job queued before a profile changed
 * would otherwise reach the provider under a configuration nobody validated.
 * These assert that a conflicting context stops before generation — so no
 * paid call is made — and that a retry re-enters the same guard.
 */
const conflict = (): RuleConflict => ({
  code: 'RULE_BOUND_WIDENED',
  ruleId: 'm.range',
  layer: 'scope',
  source: 'SCOPE.md',
  attempted: { min: 1, max: 9 },
  parent: { min: 2, max: 4 },
  parentLayer: 'mechanic',
  parentSource: 'SKILL.md',
  policy: 'bounded',
  message: 'widens it',
});

const ruleSet = (conflicts: RuleConflict[]): EffectiveRuleSet => ({
  version: 1,
  rules: [],
  resolved: [],
  conflicts,
  digest: 'd'.repeat(64),
  structuredSources: [],
});

const context = (conflicts: RuleConflict[]) => ({
  mechanicKey: 'read-your-opponent',
  worldKey: 'w',
  scopeKey: 's',
  global: '',
  mechanic: '',
  world: '',
  scope: '',
  knowledge: '',
  exemplars: '',
  historicalExemplars: '',
  exemplarDiagnostics: [],
  contextHash: 'c'.repeat(64),
  sources: {},
  effectiveRules: ruleSet(conflicts),
});

const job = {
  jobId: 'job-1',
  leaseEpoch: 1,
  attempts: 1,
  mechanicKey: 'read-your-opponent',
  worldKey: 'w',
  scopeKey: 's',
  targetCount: 3,
};

const build = (conflicts: RuleConflict[]) => {
  const generate = jest.fn();
  const awaitReview = jest.fn(async () => undefined);
  const checkpoint = jest.fn(async () => undefined);
  const releaseForRetry = jest.fn(async () => undefined);
  const service = new ContentEngineOrchestratorService(
    {
      find: () => ({
        sort: () => ({ lean: () => ({ exec: async () => [] }) }),
      }),
    } as never,
    {
      checkpoint,
      awaitReview,
      releaseForRetry,
      isCancellationRequested: async () => false,
      holdsLease: async () => true,
    } as never,
    {
      hasLedgerEntry: async () => false,
      reservationIds: async () => [],
    } as never,
    { resolve: () => context(conflicts) } as never,
    { generate } as never,
    { beginBatch: jest.fn(), screen: jest.fn() } as never,
    { verify: jest.fn() } as never,
    { evaluate: jest.fn() } as never,
    { judge: jest.fn() } as never,
  );
  return { service, generate, awaitReview, checkpoint, releaseForRetry };
};

describe('rule-conflict guard before any paid call', () => {
  it('never reaches generation when the configuration conflicts', async () => {
    const { service, generate } = build([conflict()]);
    await service.run(job as never);
    expect(generate).not.toHaveBeenCalled();
  });

  it('stops before the first checkpoint, so nothing is recorded as resolved', async () => {
    const { service, checkpoint } = build([conflict()]);
    await service.run(job as never);
    expect(checkpoint).not.toHaveBeenCalled();
  });

  it('waits for a human rather than retrying a configuration error', async () => {
    const { service, awaitReview, releaseForRetry } = build([conflict()]);
    await service.run(job as never);
    expect(releaseForRetry).not.toHaveBeenCalled();
    expect(awaitReview).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        reason: expect.stringContaining('RULE_BOUND_WIDENED'),
      }),
    );
  });

  it('re-enters the guard on every attempt — a retry cannot bypass it', async () => {
    const { service, generate, awaitReview } = build([conflict()]);
    await service.run(job as never);
    await service.run({ ...job, attempts: 2 } as never);
    await service.run({ ...job, attempts: 3 } as never);
    expect(generate).not.toHaveBeenCalled();
    expect(awaitReview).toHaveBeenCalledTimes(3);
  });

  it('proceeds to generation when the configuration is clean', async () => {
    const { service, generate, checkpoint } = build([]);
    await service.run(job as never);
    expect(checkpoint).toHaveBeenCalled();
    expect(generate).toHaveBeenCalled();
  });
});

describe('generator capability guard when preflight is bypassed', () => {
  it('fails the job without retrying an unsupported mechanic', async () => {
    const fail = jest.fn(async () => undefined);
    const releaseForRetry = jest.fn(async () => undefined);
    const generate = jest.fn(async () => {
      throw new CandidateParseError(
        'MECHANIC_NOT_GENERATABLE',
        'no authored answer mode for mechanic "moving-xo"',
      );
    });
    const service = new ContentEngineOrchestratorService(
      {
        find: () => ({
          sort: () => ({
            lean: () => ({
              exec: async () => [],
            }),
          }),
        }),
      } as never,
      {
        checkpoint: jest.fn(async () => undefined),
        awaitReview: jest.fn(async () => undefined),
        releaseForRetry,
        fail,
        isCancellationRequested: async () => false,
        holdsLease: async () => true,
      } as never,
      {
        hasLedgerEntry: async () => false,
        reservationIds: async () => [],
      } as never,
      {
        resolve: () => context([]),
      } as never,
      { generate } as never,
      { beginBatch: jest.fn(), screen: jest.fn() } as never,
      { verify: jest.fn() } as never,
      { evaluate: jest.fn() } as never,
      { judge: jest.fn() } as never,
    );

    await service.run(job as never);

    expect(generate).toHaveBeenCalled();
    expect(fail).toHaveBeenCalledWith(
      'job-1',
      1,
      expect.stringContaining('MECHANIC_NOT_GENERATABLE'),
    );
    expect(releaseForRetry).not.toHaveBeenCalled();
  });
});

describe('exemplar corpus wiring', () => {
  it('screens historical exemplars while generation context remains filtered', async () => {
    const beginBatch = jest.fn();
    const screen = jest.fn(() => ({ passed: true, findings: [] }));
    const context = {
      mechanicKey: 'closest',
      worldKey: 'puzzles',
      scopeKey: 'numbers-estimation',
      global: '',
      mechanic: 'MECHANIC-PROFILE',
      world: '',
      scope: '',
      knowledge: '',
      exemplars: 'APPROVED-ONLY',
      historicalExemplars: 'WITHHELD-HISTORICAL-CORPUS',
      exemplarDiagnostics: [],
      contextHash: 'c'.repeat(64),
      sources: {},
      effectiveRules: ruleSet([]),
    };
    const rows = [
      {
        _id: 'candidate-1',
        jobId: 'job-1',
        status: 'generated',
        draft: {},
        authoring: {},
      },
    ];
    const find = jest.fn(() => ({
      sort: () => ({ lean: () => ({ exec: async () => rows }) }),
    }));
    const updateOne = jest.fn(() => ({
      exec: async () => ({ matchedCount: 1 }),
    }));
    const awaitReview = jest.fn(async () => undefined);
    const service = new ContentEngineOrchestratorService(
      { find, updateOne } as never,
      {
        checkpoint: jest.fn(async () => undefined),
        awaitReview,
        releaseForRetry: jest.fn(async () => undefined),
        isCancellationRequested: async () => false,
        holdsLease: async () => true,
      } as never,
      {
        hasLedgerEntry: async () => false,
        reservationIds: async () => [],
      } as never,
      { resolve: () => context } as never,
      { generate: jest.fn() } as never,
      { beginBatch, screen } as never,
      { verify: jest.fn() } as never,
      { evaluate: jest.fn(() => ({ preDraft: { blockers: [] } })) } as never,
      { judge: jest.fn() } as never,
    );

    await service.run(job as never);

    expect(beginBatch).toHaveBeenCalledWith(
      'WITHHELD-HISTORICAL-CORPUS',
      'MECHANIC-PROFILE',
    );
    expect(screen).toHaveBeenCalled();
    expect(awaitReview).toHaveBeenCalled();
  });
});

describe('legacy job provenance guard and exact-job execution', () => {
  it('fails closed before checkpoint or generation when a persisted job has incomplete generationSpec', async () => {
    const { service, generate, awaitReview, checkpoint } = build([]);
    await service.run({
      ...job,
      generationSpec: {
        specVersion: 'generation-spec-v1',
        mechanicKey: 'read-your-opponent',
        // Missing required fields (provider, generationModel, contextHash, etc.)
      },
    } as never);

    expect(checkpoint).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(awaitReview).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        reason: expect.stringContaining('JOB_PROVENANCE_INSUFFICIENT'),
      }),
    );
  });

  it('runJob leases only the exact requested jobId via jobs.leaseById', async () => {
    const leaseById = jest.fn(async () => null);
    const leaseNext = jest.fn(async () => null);
    const service = new ContentEngineOrchestratorService(
      {} as never,
      { leaseById, leaseNext } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const res = await service.runJob('job-exact-1', 'admin:admin-1', {
      actorId: 'admin-1',
      actorEmail: 'admin1@akwaan.test',
    });

    expect(res).toBeNull();
    expect(leaseById).toHaveBeenCalledWith({
      jobId: 'job-exact-1',
      owner: 'admin:admin-1',
      executedBy: 'admin-1',
      executedByEmail: 'admin1@akwaan.test',
    });
    expect(leaseNext).not.toHaveBeenCalled();
  });

  const completeSpec = (overrides: Record<string, unknown> = {}) => ({
    specVersion: 'generation-spec-v1',
    worldKey: 'w',
    scopeKey: 's',
    mechanicKey: 'read-your-opponent',
    answerMode: 'multiple_choice',
    targetCount: 3,
    difficulty: 'mixed',
    ryoDifficultyTargets: { easy: 25, medium: 50, relativelyDifficult: 25 },
    batchGuidance: null,
    promptVersion: 'mc-v2',
    provider: 'pinned-provider',
    generationModel: 'pinned-gen-model',
    qualityModel: 'pinned-quality-model',
    temperature: 0.8,
    omitTemperature: false,
    reasoningEffort: null,
    outputTokensPerCandidate: 800,
    maxOutputTokens: 2400,
    contextHash: 'c'.repeat(64),
    ruleSetDigest: 'd'.repeat(64),
    ...overrides,
  });

  it('fails closed before generation when generationSpec.promptVersion has drifted from active generator', async () => {
    const { service, generate, awaitReview, checkpoint } = build([]);
    await service.run({
      ...job,
      generationSpec: completeSpec({ promptVersion: 'mc-v1' }),
    } as never);

    expect(checkpoint).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(awaitReview).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        reason: expect.stringContaining('JOB_PROVENANCE_DRIFT'),
      }),
    );
  });

  it('fails closed before generation when authoring contextHash has drifted since job submission', async () => {
    const { service, generate, awaitReview, checkpoint } = build([]);
    await service.run({
      ...job,
      generationSpec: completeSpec({ contextHash: 'e'.repeat(64) }),
    } as never);

    expect(checkpoint).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(awaitReview).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        reason: expect.stringContaining('JOB_CONTEXT_DRIFT'),
      }),
    );
  });

  it('fails closed before generation when effective ruleset digest has drifted since job submission', async () => {
    const { service, generate, awaitReview, checkpoint } = build([]);
    await service.run({
      ...job,
      generationSpec: completeSpec({ ruleSetDigest: 'f'.repeat(64) }),
    } as never);

    expect(checkpoint).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(awaitReview).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        reason: expect.stringContaining('JOB_RULESET_DRIFT'),
      }),
    );
  });

  it('propagates pinned generationSpec to both CandidateGeneratorService and QualityJudgeService', async () => {
    const spec = completeSpec();
    const candidateRow = {
      _id: 'cand-doc-1',
      jobId: 'job-1',
      candidateId: 'cand-1',
      status: 'screened_pass',
      draft: { prompt: { ar: 'سؤال؟' } },
      factualClaims: ['claim'],
      factVerification: { state: 'SUPPORTED', claims: [] },
      compatibilityEvaluation: { preDraft: { blockers: [] } },
      qualityEvaluation: null,
    };
    let generated = false;
    const find = jest.fn(() => ({
      sort: () => ({
        lean: () => ({
          exec: async () => (generated ? [candidateRow] : []),
        }),
      }),
    }));
    const updateOne = jest.fn(() => ({
      exec: async () => ({ matchedCount: 1 }),
    }));
    const generate = jest.fn(async () => {
      generated = true;
      return [];
    });
    const judge = jest.fn(async () => ({
      scores: {},
      reasons: {},
      difficulty: 'medium',
      recommendation: 'PASS',
      rejectionFeedback: [],
    }));
    const service = new ContentEngineOrchestratorService(
      { find, updateOne } as never,
      {
        checkpoint: jest.fn(async () => undefined),
        awaitReview: jest.fn(async () => undefined),
        releaseForRetry: jest.fn(async () => undefined),
        isCancellationRequested: async () => false,
        holdsLease: async () => true,
      } as never,
      {
        hasLedgerEntry: async () => false,
        reservationIds: async () => [],
      } as never,
      { resolve: () => context([]) } as never,
      { generate } as never,
      {
        beginBatch: jest.fn(),
        screen: jest.fn(() => ({ passed: true, findings: [] })),
      } as never,
      {
        verify: jest.fn(async () => ({ state: 'SUPPORTED', claims: [] })),
      } as never,
      { evaluate: jest.fn(() => ({ preDraft: { blockers: [] } })) } as never,
      { judge } as never,
    );

    await service.run({
      ...job,
      generationSpec: spec,
    } as never);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        generationSpec: spec,
        count: 3,
      }),
    );
    expect(judge).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-1',
        candidateId: 'cand-1',
        generationSpec: spec,
      }),
    );
  });
});
