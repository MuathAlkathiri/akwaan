import { ContentEngineOrchestratorService } from './content-engine-orchestrator.service';
import { ENGINE_PIPELINE_STAGES } from '../domain/content-engine.constants';
import { EffectiveRuleSet } from '../domain/effective-rules';

/**
 * Where media planning sits in the pipeline (roadmap §30.22 decision 2).
 *
 * The position is the guarantee: after the free deterministic checks and the
 * paid quality judgement, on survivors only, and before the human. A stage that
 * ran earlier would spend on candidates that were about to be thrown away; one
 * that ran later would hand the reviewer a question whose media nobody had
 * even planned.
 */
const ruleSet = (): EffectiveRuleSet => ({
  version: 1,
  rules: [],
  resolved: [],
  conflicts: [],
  digest: 'd'.repeat(64),
  structuredSources: [],
});

const context = (mechanicKey: string, scopeKey: string) => ({
  mechanicKey,
  worldKey: 'w',
  scopeKey,
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
  effectiveRules: ruleSet(),
});

const job = (over: Record<string, unknown> = {}) => ({
  jobId: 'job-1',
  leaseEpoch: 1,
  attempts: 1,
  mechanicKey: 'read-your-opponent',
  worldKey: 'w',
  scopeKey: 'arab-media-stars',
  targetCount: 3,
  ...over,
});

const build = (
  rows: Record<string, unknown>[],
  env: Record<string, string> = {},
  mechanicKey = 'read-your-opponent',
) => {
  // Typed as plain mocks so a call can be read positionally: these assertions
  // are about what was written, not merely that something was.
  const checkpoint: jest.Mock = jest.fn(async () => undefined);
  const awaitReview: jest.Mock = jest.fn(async () => undefined);
  const updateOne: jest.Mock = jest.fn(() => ({
    exec: async () => ({ matchedCount: 1 }),
  }));
  const service = new ContentEngineOrchestratorService(
    {
      find: () => ({
        sort: () => ({ lean: () => ({ exec: async () => rows }) }),
      }),
      updateOne,
    } as never,
    {
      checkpoint,
      awaitReview,
      releaseForRetry: jest.fn(async () => undefined),
      isCancellationRequested: async () => false,
      holdsLease: async () => true,
    } as never,
    {
      hasLedgerEntry: async () => false,
      reservationIds: async () => [],
    } as never,
    { resolve: () => context(mechanicKey, 'arab-media-stars') } as never,
    { generate: jest.fn() } as never,
    {
      createSession: () => undefined,
      loadHistoricalScope: async () => ({ status: 'COMPLETE' }),
      beginBatch: jest.fn(),
      screen: jest.fn(),
    } as never,
    { verify: jest.fn() } as never,
    { evaluate: jest.fn() } as never,
    { judge: jest.fn() } as never,
    undefined as never,
    { get: (key: string) => env[key] } as never,
  );
  return { service, checkpoint, awaitReview, updateOne };
};

const plans = (updateOne: jest.Mock) =>
  updateOne.mock.calls.map((call) => call[1].$set.mediaPlan);

describe('media planning stage', () => {
  it('is a durable checkpoint of its own', () => {
    expect(ENGINE_PIPELINE_STAGES).toContain('media_enriched');
    // Resuming is a re-lease, not a restart, so the stage needs its own mark.
    expect(ENGINE_PIPELINE_STAGES.indexOf('media_enriched')).toBeGreaterThan(
      ENGINE_PIPELINE_STAGES.indexOf('judged'),
    );
  });

  it('runs after judging and before the human handoff', async () => {
    const { service, checkpoint, awaitReview } = build([]);
    await service.run(job() as never);
    const stages = checkpoint.mock.calls.map((call) => call[0].stage);
    expect(stages).toEqual([
      'context_resolved',
      'generated',
      'screened',
      'verified',
      'compatibility_checked',
      'judged',
      'media_enriched',
    ]);
    expect(awaitReview).toHaveBeenCalledTimes(1);
    // The order that matters, asserted as an order and not as two facts.
    expect(checkpoint.mock.invocationCallOrder.at(-1)).toBeLessThan(
      awaitReview.mock.invocationCallOrder[0],
    );
  });

  it('writes nothing for a candidate outside the media contract', async () => {
    const { service, updateOne, checkpoint } = build([
      { _id: 'c1', status: 'awaiting_review' },
    ]);
    await (
      service as unknown as { planMedia: (j: unknown) => Promise<void> }
    ).planMedia(job());
    expect(updateOne).not.toHaveBeenCalled();
    // It still marks the stage: nothing to do is a completed stage, not a gap.
    expect(checkpoint).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'media_enriched' }),
    );
  });

  it('records the required slot for a governed candidate', async () => {
    const { service, updateOne } = build(
      [{ _id: 'c1', status: 'awaiting_review' }],
      {},
      'ekshifni',
    );
    await (
      service as unknown as { planMedia: (j: unknown) => Promise<void> }
    ).planMedia(job({ mechanicKey: 'ekshifni' }));
    expect(plans(updateOne)).toEqual([
      [
        {
          slotKey: 'subject-image',
          purpose: 'gameplay',
          required: true,
          status: 'planned',
          failureReason: 'MEDIA_ENRICHMENT_DISABLED',
        },
      ],
    ]);
  });

  it('plans survivors only', async () => {
    // Media is the expensive half of authoring. A candidate the free checks
    // already rejected must never reach it, now or when it starts costing.
    const { service, updateOne } = build(
      [
        { _id: 'c1', status: 'screened_reject' },
        { _id: 'c2', status: 'fact_blocked' },
        { _id: 'c3', status: 'generation_failed' },
        { _id: 'c4', status: 'generated' },
        { _id: 'c5', status: 'awaiting_review' },
      ],
      {},
      'ekshifni',
    );
    await (
      service as unknown as { planMedia: (j: unknown) => Promise<void> }
    ).planMedia(job({ mechanicKey: 'ekshifni' }));
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(updateOne.mock.calls[0][0]).toMatchObject({ _id: 'c5' });
  });

  it('reads the flags fail-closed, so the switch decides and nothing else', async () => {
    const live = build(
      [{ _id: 'c1', status: 'awaiting_review' }],
      {
        CONTENT_ENGINE_ENABLED: 'true',
        ENGINE_MEDIA_ENRICHMENT_ENABLED: 'true',
      },
      'ekshifni',
    );
    await (
      live.service as unknown as { planMedia: (j: unknown) => Promise<void> }
    ).planMedia(job({ mechanicKey: 'ekshifni' }));
    expect(plans(live.updateOne)[0][0].failureReason).toBe(
      'MEDIA_RETRIEVAL_NOT_CONFIGURED',
    );

    // Enrichment on with the engine itself off is not enrichment.
    const stray = build(
      [{ _id: 'c1', status: 'awaiting_review' }],
      { ENGINE_MEDIA_ENRICHMENT_ENABLED: 'true' },
      'ekshifni',
    );
    await (
      stray.service as unknown as { planMedia: (j: unknown) => Promise<void> }
    ).planMedia(job({ mechanicKey: 'ekshifni' }));
    expect(plans(stray.updateOne)[0][0].failureReason).toBe(
      'MEDIA_ENRICHMENT_DISABLED',
    );
  });

  it('plans nothing at all without a ConfigService', async () => {
    const { service, updateOne } = build(
      [{ _id: 'c1', status: 'awaiting_review' }],
      {},
      'ekshifni',
    );
    (service as unknown as { config: undefined }).config = undefined;
    await (
      service as unknown as { planMedia: (j: unknown) => Promise<void> }
    ).planMedia(job({ mechanicKey: 'ekshifni' }));
    // A wiring mistake has to disable enrichment, never authorize a call.
    expect(plans(updateOne)[0][0].failureReason).toBe(
      'MEDIA_ENRICHMENT_DISABLED',
    );
  });

  it('does not rewrite a slot an Admin already filled', async () => {
    const { service, updateOne } = build(
      [
        {
          _id: 'c1',
          status: 'awaiting_review',
          mediaPlan: [
            {
              slotKey: 'subject-image',
              purpose: 'gameplay',
              required: true,
              status: 'resolved',
              asset: { url: 'https://cdn.example/engine-abc.jpg' },
            },
          ],
        },
      ],
      {},
      'ekshifni',
    );
    await (
      service as unknown as { planMedia: (j: unknown) => Promise<void> }
    ).planMedia(job({ mechanicKey: 'ekshifni' }));
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('writes only the media plan, and never a text field', async () => {
    const { service, updateOne } = build(
      [{ _id: 'c1', status: 'awaiting_review' }],
      {},
      'ekshifni',
    );
    await (
      service as unknown as { planMedia: (j: unknown) => Promise<void> }
    ).planMedia(job({ mechanicKey: 'ekshifni' }));
    expect(Object.keys(updateOne.mock.calls[0][1].$set).sort()).toEqual([
      'mediaPlan',
      'writeEpoch',
    ]);
  });
});
