import { ConfigService } from '@nestjs/config';
import {
  AuthoringContextService,
  AuthoringContextUnavailableError,
} from './authoring-context.service';
import { EngineJobAdminService } from './engine-job-admin.service';

const budgetSnapshot = {
  periodKey: '2026-10',
  capMicros: 1_000_000,
  spentMicros: 0,
  reservedMicros: 0,
  availableMicros: 1_000_000,
};

const request = (mechanicKey: string) => ({
  mechanicKey,
  worldKey: 'puzzles',
  scopeKey: 'wordplay-letters',
  targetCount: 3,
});

const context = (mechanicKey: string) => ({
  mechanicKey,
  contextHash: 'c'.repeat(64),
  effectiveRules: { conflicts: [] },
});

const build = (mechanicKey: string) => {
  const contexts = { resolve: jest.fn(() => context(mechanicKey)) };
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        ENGINE_PROVIDER_NAME: 'fake',
        ENGINE_GENERATION_MODEL: 'fake-model',
        ENGINE_QUALITY_MODEL: 'fake-model',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const budget = {
    snapshot: jest.fn(async () => budgetSnapshot),
    estimate: jest.fn(() => 1_000),
  };
  const service = new EngineJobAdminService(
    {} as never,
    {} as never,
    budget as never,
    contexts as never,
    {} as never,
    config,
  );
  return { service, contexts, budget };
};

describe('Content Engine generator capability preflight', () => {
  it.each(['read-your-opponent', 'closest'])(
    'marks %s as generator-supported',
    async (mechanicKey) => {
      const { service } = build(mechanicKey);

      const result = await service.preflight(request(mechanicKey));

      expect(result.resolvable).toBe(true);
      expect(result.generatorSupported).toBe(true);
      expect(result.diagnostic).toBeUndefined();
      expect(result.pricingConfigured).toBe(true);
    },
  );

  it.each(['moving-xo', 'bomb'])(
    'keeps %s authoring-resolvable but blocks generation capability',
    async (mechanicKey) => {
      const { service, budget } = build(mechanicKey);

      const result = await service.preflight(request(mechanicKey));

      expect(result.resolvable).toBe(true);
      expect(result.generatorSupported).toBe(false);
      expect(result.diagnostic).toEqual({
        code: 'MECHANIC_NOT_GENERATABLE',
        message: `MECHANIC_NOT_GENERATABLE: no authored answer mode for mechanic "${mechanicKey}"`,
      });
      expect(result.blockedReason).toBe(result.diagnostic?.message);
      expect(result.pricingConfigured).toBe(false);
      expect(budget.estimate).not.toHaveBeenCalled();
    },
  );

  it('returns the resolver blocker for retained-inactive Rakkibha', async () => {
    const budget = {
      snapshot: jest.fn(async () => budgetSnapshot),
      estimate: jest.fn(() => 1_000),
    };
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService;
    const service = new EngineJobAdminService(
      {} as never,
      {} as never,
      budget as never,
      new AuthoringContextService(config),
      {} as never,
      config,
    );

    const result = await service.preflight(request('rakkibha'));

    expect(result.resolvable).toBe(false);
    expect(result.blockedReason).toContain('MECHANIC_NOT_AUTHORABLE');
    expect(result.generatorSupported).toBeUndefined();
    expect(result.diagnostic).toBeUndefined();
  });

  it('preserves authoring errors for invalid World/Scope combinations', async () => {
    const { service, contexts } = build('moving-xo');
    contexts.resolve.mockImplementation(() => {
      throw new AuthoringContextUnavailableError(
        'MECHANIC_WORLD_MISMATCH',
        'moving-xo is bound to puzzles',
      );
    });

    const result = await service.preflight(request('moving-xo'));

    expect(result.resolvable).toBe(false);
    expect(result.blockedReason).toContain('MECHANIC_WORLD_MISMATCH');
    expect(result.generatorSupported).toBeUndefined();
    expect(result.diagnostic).toBeUndefined();
  });

  it.each(['moving-xo', 'bomb'])(
    'rejects unsupported %s before job persistence when preflight is skipped',
    async (mechanicKey) => {
      const jobs = {
        submit: jest.fn(async () => ({
          jobId: `job-${mechanicKey}`,
          created: true,
        })),
      };
      const contexts = {
        resolve: jest.fn(() => context(mechanicKey)),
      };
      const budget = {
        snapshot: jest.fn(async () => budgetSnapshot),
      };
      const config = {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService;
      const service = new EngineJobAdminService(
        {} as never,
        jobs as never,
        budget as never,
        contexts as never,
        {} as never,
        config,
      );

      await expect(service.submit(request(mechanicKey))).rejects.toMatchObject({
        response: {
          code: 'MECHANIC_NOT_GENERATABLE',
          message: `MECHANIC_NOT_GENERATABLE: no authored answer mode for mechanic "${mechanicKey}"`,
        },
      });
      expect(jobs.submit).not.toHaveBeenCalled();
      expect(budget.snapshot).not.toHaveBeenCalled();
    },
  );

  it.each(['read-your-opponent', 'closest'])(
    'preserves submission for generator-supported %s',
    async (mechanicKey) => {
      const jobs = {
        submit: jest.fn(async () => ({
          jobId: `job-${mechanicKey}`,
          created: true,
        })),
      };
      const contexts = {
        resolve: jest.fn(() => context(mechanicKey)),
      };
      const config = {
        get: jest.fn(() => undefined),
      } as unknown as ConfigService;
      const service = new EngineJobAdminService(
        {} as never,
        jobs as never,
        {} as never,
        contexts as never,
        {} as never,
        config,
      );

      const result = await service.submit(request(mechanicKey));

      expect(result).toEqual({
        jobId: `job-${mechanicKey}`,
        created: true,
        contextHash: 'c'.repeat(64),
      });
      expect(jobs.submit).toHaveBeenCalledWith({
        mechanicKey,
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        targetCount: 3,
        contextRevision: 'c'.repeat(64),
      });
    },
  );
});
