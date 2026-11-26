import { GenerationPlannerService } from './generation-planner.service';
import { HistoricalCoverageService } from './historical-coverage.service';

const chain = <T>(rows: T) => {
  const query = {
    sort: () => query,
    limit: () => query,
    select: () => query,
    lean: () => query,
    exec: async () => rows,
  };
  return query;
};

const slot = (familyKey: string, variantKey?: string) => ({
  authoring: {
    assignedSlot: { familyKey, ...(variantKey ? { variantKey } : {}) },
  },
});

const build = (
  jobs: Array<{ jobId: string }>,
  candidatesByJob: Record<string, unknown[]>,
) => {
  const findJobs = jest.fn(() => chain(jobs));
  const findCandidates = jest.fn((filter: { jobId: string }) =>
    chain(candidatesByJob[filter.jobId] ?? []),
  );
  const service = new HistoricalCoverageService(
    {} as never,
    { find: findCandidates } as never,
    {} as never,
    { find: findJobs } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, findJobs, findCandidates };
};

const target = {
  worldKey: 'puzzles',
  scopeKey: 'numbers-estimation',
  mechanicKey: 'closest',
};

describe('the previous batch for a target', () => {
  it('reads the families and templates of the newest batch that has candidates', async () => {
    const { service, findJobs } = build(
      [
        { jobId: 'job-being-planned' },
        { jobId: 'job-last' },
        { jobId: 'job-older' },
      ],
      {
        // The job being planned has generated nothing yet.
        'job-being-planned': [],
        'job-last': [
          slot('gathering-pairs', 'handshakes'),
          slot('gathering-pairs', 'gift-exchange'),
          slot('quick-total', 'one-to-n'),
          slot('battery-level'),
          { authoring: null },
        ],
        'job-older': [slot('occurrence-count', 'book-pages')],
      },
    );

    expect(await service.getRecentSlotUsage(target)).toEqual({
      familyKeys: ['battery-level', 'gathering-pairs', 'quick-total'],
      variantKeys: {
        'gathering-pairs': ['handshakes', 'gift-exchange'],
        'quick-total': ['one-to-n'],
      },
    });
    expect(findJobs).toHaveBeenCalledWith(target);
  });

  it('has nothing to say for a target that has never generated', async () => {
    expect(await build([], {}).service.getRecentSlotUsage(target)).toBeNull();
    expect(
      await build([{ jobId: 'job-1' }], {
        'job-1': [],
      }).service.getRecentSlotUsage(target),
    ).toBeNull();
  });
});

describe('the planner and the previous batch', () => {
  const catalog = {
    version: 1 as const,
    worldKey: 'puzzles',
    scopeKey: 'numbers-estimation',
    digest: 'd',
    structuredSources: ['s'],
    families: ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => ({
      familyKey: `family-${key}`,
      name: `عائلة ${key}`,
      description: 'd',
      scopeKey: 'numbers-estimation',
      worldKey: 'puzzles',
      mechanicFit: { closest: 'EXCELLENT' as const },
      source: 's',
    })),
  };
  const coverage = {
    worldKey: 'puzzles',
    scopeKey: 'numbers-estimation',
    families: {},
    totals: { humanApproved: 0, operationalApproved: 0 },
    diagnostics: { warnings: [] },
  };

  it('asks for it and keeps the new batch away from its families', async () => {
    const getRecentSlotUsage = jest.fn(async () => ({
      familyKeys: ['family-a', 'family-b', 'family-c'],
      variantKeys: {},
    }));
    const planner = new GenerationPlannerService(undefined, {
      getRecentSlotUsage,
    } as never);

    const plan = await planner.planWithResolvedContext({
      ...target,
      count: 5,
      seed: 'job-next',
      catalogOverride: catalog,
      coverageOverride: coverage as never,
    });

    expect(getRecentSlotUsage).toHaveBeenCalledWith(target);
    const repeated = (plan.slots ?? []).filter((entry) =>
      ['family-a', 'family-b', 'family-c'].includes(entry.familyKey),
    );
    expect(plan.slots).toHaveLength(5);
    expect(repeated.length).toBeLessThanOrEqual(1);
  });

  it('plans as before when the previous batch cannot be read', async () => {
    const planner = new GenerationPlannerService(undefined, {
      getRecentSlotUsage: jest.fn(async () => {
        throw new Error('database unavailable');
      }),
    } as never);
    const plan = await planner.planWithResolvedContext({
      ...target,
      count: 5,
      seed: 'job-next',
      catalogOverride: catalog,
      coverageOverride: coverage as never,
    });
    expect(plan.slots).toHaveLength(5);
  });
});
