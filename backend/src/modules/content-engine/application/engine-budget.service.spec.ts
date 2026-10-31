import { ConfigService } from '@nestjs/config';
import { BudgetExceededError } from '../domain/content-engine.constants';
import { EngineBudgetService } from './engine-budget.service';
import { EnginePricingService } from '../domain/engine-pricing.service';

describe('EngineBudgetService Job-Level Budget Enforcement', () => {
  interface MockBudgetDoc {
    periodKey: string;
    capMicros: number;
    spentMicros: number;
    reservedMicros: number;
  }

  interface MockLedgerDoc {
    reservationId: string;
    jobId: string;
    stage: string;
    provider: string;
    model: string;
    reservedMicros: number;
    actualMicros: number | null;
    status: 'reserved' | 'reconciled' | 'released' | 'orphaned';
    usageKnown: boolean;
    createdAt?: Date;
  }

  let budgetsStore: Map<string, MockBudgetDoc>;
  let ledgerStore: Map<string, MockLedgerDoc>;
  let service: EngineBudgetService;
  let pricingService: EnginePricingService;

  const createService = (configMap: Record<string, string> = {}) => {
    budgetsStore = new Map<string, MockBudgetDoc>();
    ledgerStore = new Map<string, MockLedgerDoc>();

    const config = new ConfigService({
      ENGINE_MONTHLY_CAP_SAR: '5.00',
      ENGINE_BATCH_CAP_SAR: '0.50',
      ...configMap,
    });

    pricingService = {
      estimateMicros: jest.fn((provider, model, expected) => {
        // Simple deterministic pricing for test expectations
        return expected.promptTokens + expected.maxOutputTokens;
      }),
      costMicros: jest.fn((provider, model, usage) => {
        return (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
      }),
    } as unknown as EnginePricingService;

    // Concurrency-safe in-memory budget document simulation
    const mockBudgetsModel = {
      updateOne: jest.fn((filter, update) => {
        const doc = budgetsStore.get(filter.periodKey);
        if (!doc) {
          if (update.$setOnInsert) {
            budgetsStore.set(filter.periodKey, {
              periodKey: filter.periodKey,
              capMicros:
                update.$set?.capMicros ?? update.$setOnInsert.capMicros,
              spentMicros: update.$setOnInsert.spentMicros ?? 0,
              reservedMicros: update.$setOnInsert.reservedMicros ?? 0,
            });
          }
        } else {
          if (update.$set?.capMicros !== undefined) {
            doc.capMicros = update.$set.capMicros;
          }
          if (update.$inc) {
            if (update.$inc.reservedMicros !== undefined) {
              doc.reservedMicros += update.$inc.reservedMicros;
            }
            if (update.$inc.spentMicros !== undefined) {
              doc.spentMicros += update.$inc.spentMicros;
            }
          }
        }
        return {
          exec: async () => ({ acknowledged: true }),
        };
      }),
      findOneAndUpdate: jest.fn((filter, update, options) => {
        const doc = budgetsStore.get(filter.periodKey);
        let res: MockBudgetDoc | null = null;
        if (doc) {
          const incAmount = update.$inc?.reservedMicros ?? 0;
          const projected = doc.spentMicros + doc.reservedMicros + incAmount;
          if (projected <= doc.capMicros) {
            options?.session?.recordBudget?.(filter.periodKey, { ...doc });
            doc.reservedMicros += incAmount;
            res = { ...doc };
          }
        }
        return {
          lean: () => ({
            exec: async () => res,
          }),
          exec: async () => res,
        };
      }),
      findOne: jest.fn((filter) => {
        const query = {
          session: () => query,
          lean: () => ({
            exec: async () => {
              const doc = budgetsStore.get(filter.periodKey);
              return doc ? { ...doc } : null;
            },
          }),
          exec: async () => {
            const doc = budgetsStore.get(filter.periodKey);
            return doc ? { ...doc } : null;
          },
        };
        return query;
      }),
    };

    const mockLedgerModel = {
      findOne: jest.fn((filter) => {
        const query = {
          session: () => query,
          lean: () => ({
            exec: async () => {
              const doc = ledgerStore.get(filter.reservationId);
              return doc ? { ...doc } : null;
            },
          }),
          exec: async () => {
            const doc = ledgerStore.get(filter.reservationId);
            return doc ? { ...doc } : null;
          },
        };
        return query;
      }),
      find: jest.fn((filter) => ({
        lean: () => ({
          exec: async () => {
            const rows: MockLedgerDoc[] = [];
            for (const doc of ledgerStore.values()) {
              if (filter.jobId && doc.jobId !== filter.jobId) continue;
              if (filter.status && doc.status !== filter.status) continue;
              rows.push({ ...doc });
            }
            return rows;
          },
        }),
      })),
      create: jest.fn(async (arg, options) => {
        const entry = Array.isArray(arg) ? arg[0] : arg;
        if (ledgerStore.has(entry.reservationId)) {
          const err = new Error('E11000 duplicate key error');
          (err as { code?: number }).code = 11000;
          throw err;
        }
        options?.session?.recordLedger?.(entry.reservationId);
        const created: MockLedgerDoc = {
          ...entry,
          actualMicros: null,
          status: 'reserved',
          usageKnown: false,
          createdAt: new Date(),
        };
        ledgerStore.set(entry.reservationId, created);
        return Array.isArray(arg) ? [created] : created;
      }),
      findOneAndUpdate: jest.fn((filter, update) => {
        const doc = ledgerStore.get(filter.reservationId);
        let res: MockLedgerDoc | null = null;
        if (doc && (!filter.status || doc.status === filter.status)) {
          if (update.$set) {
            Object.assign(doc, update.$set);
          }
          res = { ...doc };
        }
        return {
          lean: () => ({
            exec: async () => res,
          }),
          exec: async () => res,
        };
      }),
    };

    const mockJobsModel = {
      findOne: jest.fn(() => ({
        lean: () => ({
          exec: async () => ({
            status: 'leased',
            leaseExpiresAt: new Date(Date.now() + 60000),
          }),
        }),
      })),
    };

    const mockConnection = {
      startSession: async () => {
        const sessionBudgetRollbacks: Array<{
          key: string;
          beforeDoc: MockBudgetDoc;
        }> = [];
        const sessionLedgerInserts: string[] = [];

        const session = {
          recordBudget: (key: string, beforeDoc: MockBudgetDoc) => {
            sessionBudgetRollbacks.push({ key, beforeDoc });
          },
          recordLedger: (reservationId: string) => {
            sessionLedgerInserts.push(reservationId);
          },
          withTransaction: async (work: () => Promise<unknown>) => {
            try {
              return await work();
            } catch (error) {
              // Roll back only mutations performed in THIS session
              for (let i = sessionBudgetRollbacks.length - 1; i >= 0; i--) {
                const item = sessionBudgetRollbacks[i];
                budgetsStore.set(item.key, { ...item.beforeDoc });
              }
              for (const id of sessionLedgerInserts) {
                ledgerStore.delete(id);
              }
              throw error;
            }
          },
          endSession: async () => {},
        };

        return session;
      },
    };

    service = new EngineBudgetService(
      mockBudgetsModel as never,
      mockLedgerModel as never,
      mockJobsModel as never,
      mockConnection as never,
      pricingService,
      config,
    );
  };

  beforeEach(() => {
    createService();
  });

  describe('Aggregate Job-Level Budget Enforcement (ENGINE_BATCH_CAP_SAR = 0.50 SAR = 500,000 micros)', () => {
    it('Generation SAR 0.40 + three Judge reservations SAR 0.05 each must not all pass under a SAR 0.50 job cap', async () => {
      const jobId = 'job-ryo-pilot-1';

      // 1. Generation reservation: SAR 0.40 (400,000 micros) -> PASS
      const gen = await service.reserve({
        reservationId: `${jobId}:generation:1`,
        jobId,
        stage: 'generation',
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5.5',
        expected: { promptTokens: 350_000, maxOutputTokens: 50_000 },
      });
      expect(gen.reservedMicros).toBe(400_000);

      // Remaining job budget is 100,000 micros (0.10 SAR)
      const afterGen = await service.jobBudgetSnapshot(jobId);
      expect(afterGen.availableMicros).toBe(100_000);

      // 2. Candidate 1 Judge: SAR 0.05 (50,000 micros) -> PASS
      const judge1 = await service.reserve({
        reservationId: `${jobId}:quality:cand-1:1`,
        jobId,
        stage: 'quality',
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        expected: { promptTokens: 40_000, maxOutputTokens: 10_000 },
      });
      expect(judge1.reservedMicros).toBe(50_000);

      // 3. Candidate 2 Judge: SAR 0.05 (50,000 micros) -> PASS (total reaches 500,000 micros)
      const judge2 = await service.reserve({
        reservationId: `${jobId}:quality:cand-2:1`,
        jobId,
        stage: 'quality',
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        expected: { promptTokens: 40_000, maxOutputTokens: 10_000 },
      });
      expect(judge2.reservedMicros).toBe(50_000);

      const atCap = await service.jobBudgetSnapshot(jobId);
      expect(atCap.availableMicros).toBe(0);

      // 4. Candidate 3 Judge: SAR 0.05 (50,000 micros) -> MUST FAIL CLOSED with BudgetExceededError('batch')
      let caughtError: unknown;
      try {
        await service.reserve({
          reservationId: `${jobId}:quality:cand-3:1`,
          jobId,
          stage: 'quality',
          provider: 'openrouter',
          model: 'openai/gpt-4o-mini',
          expected: { promptTokens: 40_000, maxOutputTokens: 10_000 },
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(BudgetExceededError);
      const budgetError = caughtError as BudgetExceededError;
      expect(budgetError.scope).toBe('batch');
      expect(budgetError.requestedMicros).toBe(50_000);
      expect(budgetError.availableMicros).toBe(0);
      expect(budgetError.message).toContain(
        'Content engine batch budget would be exceeded',
      );
    });

    it('concurrent reservations cannot collectively exceed the job cap', async () => {
      const jobId = 'job-concurrent-race';
      // 5 concurrent reservation requests of SAR 0.15 each (150,000 micros).
      // Job cap is SAR 0.50 (500,000 micros).
      // Exactly 3 can succeed (3 * 150k = 450k <= 500k), and 2 must be rejected.
      const calls = Array.from({ length: 5 }, (_, i) =>
        service.reserve({
          reservationId: `${jobId}:quality:cand-${i}:1`,
          jobId,
          stage: 'quality',
          provider: 'openrouter',
          model: 'openai/gpt-4o-mini',
          expected: { promptTokens: 100_000, maxOutputTokens: 50_000 },
        }),
      );

      const results = await Promise.allSettled(calls);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(3);
      expect(rejected).toHaveLength(2);
      for (const rej of rejected) {
        if (rej.status === 'rejected') {
          expect(rej.reason).toBeInstanceOf(BudgetExceededError);
          expect(rej.reason.scope).toBe('batch');
        }
      }

      const snapshot = await service.jobBudgetSnapshot(jobId);
      expect(snapshot.reservedMicros).toBe(450_000);
      expect(snapshot.availableMicros).toBe(50_000);
    });

    it('retry attempts cannot bypass the cap', async () => {
      const jobId = 'job-retry-test';
      // Attempt 1 generation: SAR 0.35 (350,000 micros)
      await service.reserve({
        reservationId: `${jobId}:generation:1`,
        jobId,
        stage: 'generation',
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5.5',
        expected: { promptTokens: 300_000, maxOutputTokens: 50_000 },
      });

      // Attempt 2 generation for another SAR 0.35 (350,000 micros) without releasing attempt 1
      // 350k + 350k = 700k > 500k cap -> MUST FAIL
      await expect(
        service.reserve({
          reservationId: `${jobId}:generation:2`,
          jobId,
          stage: 'generation',
          provider: 'openrouter',
          model: 'anthropic/claude-sonnet-5.5',
          expected: { promptTokens: 300_000, maxOutputTokens: 50_000 },
        }),
      ).rejects.toThrow(BudgetExceededError);
    });

    it('released reservations free reserved capacity on both job and monthly budgets', async () => {
      const jobId = 'job-release-test';
      // Reserve SAR 0.35
      await service.reserve({
        reservationId: `${jobId}:generation:1`,
        jobId,
        stage: 'generation',
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5.5',
        expected: { promptTokens: 300_000, maxOutputTokens: 50_000 },
      });

      let snapshot = await service.jobBudgetSnapshot(jobId);
      expect(snapshot.availableMicros).toBe(150_000);

      // Release attempt 1 (e.g. gateway error definitelyNotBilled: true)
      const released = await service.release(`${jobId}:generation:1`);
      expect(released).toBe(true);

      snapshot = await service.jobBudgetSnapshot(jobId);
      expect(snapshot.reservedMicros).toBe(0);
      expect(snapshot.availableMicros).toBe(500_000);

      // Now attempt 2 can reserve full SAR 0.35 safely
      const retry = await service.reserve({
        reservationId: `${jobId}:generation:2`,
        jobId,
        stage: 'generation',
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5.5',
        expected: { promptTokens: 300_000, maxOutputTokens: 50_000 },
      });
      expect(retry.reservedMicros).toBe(350_000);
    });

    it('settled actual costs count against subsequent reservations', async () => {
      const jobId = 'job-settle-test';
      await service.reserve({
        reservationId: `${jobId}:generation:1`,
        jobId,
        stage: 'generation',
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5.5',
        expected: { promptTokens: 200_000, maxOutputTokens: 50_000 }, // 250,000 micros
      });

      // Settle at actual cost = 250,000 micros
      await service.settle({
        reservationId: `${jobId}:generation:1`,
        usage: { promptTokens: 200_000, completionTokens: 50_000 },
      });

      const snapshot = await service.jobBudgetSnapshot(jobId);
      expect(snapshot.spentMicros).toBe(250_000);
      expect(snapshot.reservedMicros).toBe(0);
      expect(snapshot.availableMicros).toBe(250_000);

      // A subsequent reservation of 300,000 micros exceeds the remaining 250,000 micros
      await expect(
        service.reserve({
          reservationId: `${jobId}:quality:cand-1:1`,
          jobId,
          stage: 'quality',
          provider: 'openrouter',
          model: 'openai/gpt-4o-mini',
          expected: { promptTokens: 250_000, maxOutputTokens: 50_000 },
        }),
      ).rejects.toThrow(BudgetExceededError);
    });

    it('over-reservation settlement remains visible, correctly accounted, and bounds subsequent reservations', async () => {
      const jobId = 'job-overrun-test';
      // Reserve SAR 0.30 (300,000 micros)
      await service.reserve({
        reservationId: `${jobId}:generation:1`,
        jobId,
        stage: 'generation',
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5.5',
        expected: { promptTokens: 250_000, maxOutputTokens: 50_000 },
      });

      // Settle at actual SAR 0.38 (380,000 micros) - exceeds reservation!
      const settled = await service.settle({
        reservationId: `${jobId}:generation:1`,
        usage: { promptTokens: 300_000, completionTokens: 80_000 },
      });

      expect(settled).toBeDefined();
      expect(settled!.exceededReservation).toBe(true);
      expect(settled!.actualMicros).toBe(380_000);

      const snapshot = await service.jobBudgetSnapshot(jobId);
      expect(snapshot.spentMicros).toBe(380_000);
      expect(snapshot.reservedMicros).toBe(0);
      expect(snapshot.availableMicros).toBe(120_000); // 500k - 380k = 120k remaining

      // Trying to reserve SAR 0.15 (150,000 micros) must be rejected because only 120k is available
      await expect(
        service.reserve({
          reservationId: `${jobId}:quality:cand-1:1`,
          jobId,
          stage: 'quality',
          provider: 'openrouter',
          model: 'openai/gpt-4o-mini',
          expected: { promptTokens: 100_000, maxOutputTokens: 50_000 },
        }),
      ).rejects.toThrow(BudgetExceededError);
    });

    it('monthly cap behavior remains intact across multiple distinct jobs', async () => {
      // Monthly cap: 0.70 SAR (700,000 micros). Batch cap: 0.50 SAR (500,000 micros).
      createService({
        ENGINE_MONTHLY_CAP_SAR: '0.70',
        ENGINE_BATCH_CAP_SAR: '0.50',
      });

      // Job A takes SAR 0.40 -> PASS (Job A has 0.40 <= 0.50, Month has 0.40 <= 0.70)
      await service.reserve({
        reservationId: 'job-A:generation:1',
        jobId: 'job-A',
        stage: 'generation',
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5.5',
        expected: { promptTokens: 350_000, maxOutputTokens: 50_000 },
      });

      // Job B wants SAR 0.40.
      // Job B by itself is 0.40 <= 0.50 (batch cap is fine).
      // BUT month would be 0.40 + 0.40 = 0.80 > 0.70 monthly cap!
      // Must throw BudgetExceededError('monthly') and roll back Job B hold
      let caughtError: unknown;
      try {
        await service.reserve({
          reservationId: 'job-B:generation:1',
          jobId: 'job-B',
          stage: 'generation',
          provider: 'openrouter',
          model: 'anthropic/claude-sonnet-5.5',
          expected: { promptTokens: 350_000, maxOutputTokens: 50_000 },
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(BudgetExceededError);
      const budgetError = caughtError as BudgetExceededError;
      expect(budgetError.scope).toBe('monthly');
      expect(budgetError.requestedMicros).toBe(400_000);
      expect(budgetError.availableMicros).toBe(300_000); // 700k - 400k = 300k available

      // Verify Job B reservation hold was rolled back
      const jobBSnapshot = await service.jobBudgetSnapshot('job-B');
      expect(jobBSnapshot.reservedMicros).toBe(0);
      expect(jobBSnapshot.spentMicros).toBe(0);
    });

    it('ledger creation failure rolls back both job and monthly reservations (simulated transaction rollback)', async () => {
      createService({
        ENGINE_MONTHLY_CAP_SAR: '1.00',
        ENGINE_BATCH_CAP_SAR: '0.50',
      });

      // Force ledger creation to fail (simulating driver or disk failure during insert)
      const mockLedger = (
        service as unknown as { ledger: { create: jest.Mock } }
      ).ledger;
      mockLedger.create = jest
        .fn()
        .mockRejectedValueOnce(new Error('EIO: disk write failure'));

      const now = new Date('2026-10-15T12:00:00Z');
      await expect(
        service.reserve({
          reservationId: 'fail-ledger:generation:1',
          jobId: 'job-fail-ledger',
          stage: 'generation',
          provider: 'openrouter',
          model: 'anthropic/claude-sonnet-5.5',
          expected: { promptTokens: 250_000, maxOutputTokens: 50_000 },
          now,
        }),
      ).rejects.toThrow('EIO: disk write failure');

      // Both job and monthly reservations must have rolled back completely
      const jobSnapshot = await service.jobBudgetSnapshot('job-fail-ledger');
      expect(jobSnapshot.reservedMicros).toBe(0);
      expect(jobSnapshot.spentMicros).toBe(0);

      const monthlySnapshot = await service.snapshot(now);
      expect(monthlySnapshot.reservedMicros).toBe(0);
      expect(monthlySnapshot.spentMicros).toBe(0);
    });

    it('simulated process interruption / unexpected error during transaction does not leave committed partial reservations', async () => {
      createService({
        ENGINE_MONTHLY_CAP_SAR: '1.00',
        ENGINE_BATCH_CAP_SAR: '0.50',
      });

      // Simulate connection drop while evaluating monthly budget inside transaction
      const mockBudgets = (
        service as unknown as { budgets: { findOneAndUpdate: jest.Mock } }
      ).budgets;
      const originalFindOneAndUpdate = mockBudgets.findOneAndUpdate;
      let callCount = 0;
      mockBudgets.findOneAndUpdate = jest.fn((filter, update, options) => {
        callCount++;
        // First call is job budget (succeeds), second call is monthly budget (unexpected socket drop)
        if (callCount === 2) {
          throw new Error('MongoNetworkError: connection closed');
        }
        return originalFindOneAndUpdate(filter, update, options);
      });

      const now = new Date('2026-10-15T12:00:00Z');
      await expect(
        service.reserve({
          reservationId: 'socket-drop:generation:1',
          jobId: 'job-socket-drop',
          stage: 'generation',
          provider: 'openrouter',
          model: 'anthropic/claude-sonnet-5.5',
          expected: { promptTokens: 250_000, maxOutputTokens: 50_000 },
          now,
        }),
      ).rejects.toThrow('MongoNetworkError: connection closed');

      // Job budget hold must have rolled back
      const jobSnapshot = await service.jobBudgetSnapshot('job-socket-drop');
      expect(jobSnapshot.reservedMicros).toBe(0);
      expect(jobSnapshot.spentMicros).toBe(0);

      const monthlySnapshot = await service.snapshot(now);
      expect(monthlySnapshot.reservedMicros).toBe(0);
      expect(monthlySnapshot.spentMicros).toBe(0);
    });

    it('duplicate reservationId handles collision safely and does not create duplicate holds', async () => {
      createService({
        ENGINE_MONTHLY_CAP_SAR: '1.00',
        ENGINE_BATCH_CAP_SAR: '0.50',
      });

      const now = new Date('2026-10-15T12:00:00Z');
      const input = {
        reservationId: 'dup-idempotency-test:generation:1',
        jobId: 'job-dup-test',
        stage: 'generation' as const,
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-5.5',
        expected: { promptTokens: 250_000, maxOutputTokens: 50_000 },
        now,
      };

      const res1 = await service.reserve(input);
      expect(res1.reservedMicros).toBe(300_000);

      // Second call with same reservationId returns same reservation amount
      const res2 = await service.reserve(input);
      expect(res2.reservedMicros).toBe(300_000);

      // Verify that budget was only charged ONCE (300k, not 600k)
      const jobSnapshot = await service.jobBudgetSnapshot('job-dup-test');
      expect(jobSnapshot.reservedMicros).toBe(300_000);
      expect(jobSnapshot.availableMicros).toBe(200_000); // 500k - 300k = 200k

      const monthlySnapshot = await service.snapshot(now);
      expect(monthlySnapshot.reservedMicros).toBe(300_000);
    });
  });
});
