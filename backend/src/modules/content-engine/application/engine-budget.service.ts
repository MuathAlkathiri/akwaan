import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, isValidObjectId, Model } from 'mongoose';
import {
  BudgetExceededError,
  DEFAULT_BATCH_CAP_SAR,
  DEFAULT_MONTHLY_CAP_SAR,
  sarToMicros,
  UsageSource,
} from '../domain/content-engine.constants';
import {
  EnginePricingService,
  TokenUsage,
} from '../domain/engine-pricing.service';
import {
  EngineBudgetDocument,
  EngineBudgetDocument as BudgetDoc,
} from '../schemas/engine-budget.schema';
import { EngineCostEntryDocument } from '../schemas/engine-cost-entry.schema';
import { EngineJobDocument } from '../schemas/engine-job.schema';

export interface ReserveInput {
  reservationId: string;
  jobId: string;
  stage: string;
  provider: string;
  model: string;
  expected: { promptTokens: number; maxOutputTokens: number };
  now?: Date;
}

export interface SettleInput {
  reservationId: string;
  /** Absent means the provider reported nothing. */
  usage?: TokenUsage;
  /** True when the call timed out and billing is genuinely unknown. */
  timedOut?: boolean;
  /**
   * True only when the provider explicitly refused the request before running
   * it. Releases the reservation instead of charging it. Never infer this from
   * a generic failure — an unexplained error stays billable.
   */
  providerRejected?: boolean;
  /**
   * Provider-measured observations to record beside the settlement. Never
   * affects what is charged.
   */
  diagnostics?: Record<string, unknown>;
}

export const periodKeyOf = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

/**
 * Money for the Content Engine.
 *
 * Three guarantees, each resting on one atomic Mongo operation rather than on
 * application-level sequencing:
 *
 * 1. **A reservation cannot overdraw.** The conditional `$inc` below admits a
 *    reservation only if `spent + reserved + amount <= cap`, evaluated by the
 *    server inside the same write. Concurrent reservations therefore serialize
 *    on the document; there is no read-then-write window to lose.
 * 2. **Reconciliation is idempotent.** The ledger entry moves out of `reserved`
 *    under a conditional update keyed by its unique `reservationId`. A second
 *    settle matches nothing and returns without touching the budget.
 * 3. **Unknown usage is charged, not forgiven.** A provider that reports no
 *    usage, or times out, settles at the reserved amount.
 *
 * **Stated limitation — this is a bound on estimates, not on bills.** A
 * reservation is computed from an expected token count. If a provider returns
 * far more tokens than expected, the settled cost exceeds the reservation, the
 * overage is recorded on the entry (`exceededReservation`), and the period's
 * `spentMicros` may finish above `capMicros`. Nothing here can un-spend money
 * that has already been billed. The engine's defence is a deliberately
 * generous estimate, a bounded retry count, and refusing *subsequent* work once
 * the cap is reached — not a promise the cap is inviolable.
 *
 * Equally: after an ambiguous network timeout the engine cannot know whether
 * the provider billed the call. It charges as though it did. That is safe for
 * the budget and may over-count real spend; the alternative under-counts, which
 * is the direction that breaks a cap.
 */
@Injectable()
export class EngineBudgetService {
  private readonly logger = new Logger(EngineBudgetService.name);

  constructor(
    @InjectModel(EngineBudgetDocument.name)
    private readonly budgets: Model<BudgetDoc>,
    @InjectModel(EngineCostEntryDocument.name)
    private readonly ledger: Model<EngineCostEntryDocument>,
    @InjectModel(EngineJobDocument.name)
    private readonly jobs: Model<EngineJobDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly pricing: EnginePricingService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Run the ledger write and the budget write as one transaction.
   *
   * Phase 1a settled these as two sequential writes, which left a real hole: a
   * crash between them marked the entry settled while the period still held the
   * reservation, and the reclaim sweep only looks at `reserved` entries, so the
   * hold was stranded for good. Capacity leaked until the cap refused
   * everything. The two writes are one fact and now commit together.
   */
  private async inTransaction<T>(
    work: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  private capMicros(): number {
    const configured = Number(
      this.config.get<string>('ENGINE_MONTHLY_CAP_SAR') ??
        DEFAULT_MONTHLY_CAP_SAR,
    );
    const sar = Number.isFinite(configured)
      ? configured
      : DEFAULT_MONTHLY_CAP_SAR;
    return sarToMicros(sar);
  }

  batchCapMicros(): number {
    const configured = Number(
      this.config.get<string>('ENGINE_BATCH_CAP_SAR') ?? DEFAULT_BATCH_CAP_SAR,
    );
    const sar = Number.isFinite(configured)
      ? configured
      : DEFAULT_BATCH_CAP_SAR;
    return sarToMicros(sar);
  }

  /** Creates the period document on first use. Safe under concurrency. */
  private async ensurePeriod(periodKey: string): Promise<void> {
    await this.budgets.updateOne(
      { periodKey },
      {
        $setOnInsert: {
          periodKey,
          capMicros: this.capMicros(),
          spentMicros: 0,
          reservedMicros: 0,
        },
      },
      { upsert: true },
    );
  }

  /** What a batch would cost, before anything is committed. */
  estimate(input: {
    provider: string;
    model: string;
    callsExpected: number;
    expected: { promptTokens: number; maxOutputTokens: number };
  }): number {
    const per = this.pricing.estimateMicros(
      input.provider,
      input.model,
      input.expected,
    );
    return per * Math.max(0, input.callsExpected);
  }

  /**
   * Read-only view of the current period's budget state.
   *
   * Never upserts or mutates the `engine_budget` collection so preflight and
   * status queries remain strictly side-effect free.
   */
  async snapshot(now = new Date()): Promise<{
    periodKey: string;
    capMicros: number;
    spentMicros: number;
    reservedMicros: number;
    availableMicros: number;
  }> {
    const periodKey = periodKeyOf(now);
    const doc = await this.budgets.findOne({ periodKey }).lean().exec();
    const capMicros = doc?.capMicros ?? this.capMicros();
    const spentMicros = doc?.spentMicros ?? 0;
    const reservedMicros = doc?.reservedMicros ?? 0;
    return {
      periodKey,
      capMicros,
      spentMicros,
      reservedMicros,
      availableMicros: Math.max(0, capMicros - spentMicros - reservedMicros),
    };
  }

  /** Recovery guard: a missing checkpoint must not cause a paid call to repeat. */
  async hasLedgerEntry(jobId: string, stage: string): Promise<boolean> {
    return Boolean(
      await this.ledger.exists({ jobId, stage }).session(null).exec(),
    );
  }

  /** IDs of earlier calls, used to prevent replay after a crash before checkpoint. */
  async reservationIds(jobId: string, stage: string): Promise<string[]> {
    const entries = await this.ledger
      .find({ jobId, stage }, { reservationId: 1 })
      .lean()
      .exec();
    return entries.map((entry) => entry.reservationId);
  }

  /**
   * What one job actually spent, from the ledger.
   *
   * The job document carries a `spentMicros` field that nothing ever
   * increments, so reading it reports zero for every job that ever ran. The
   * ledger is where money is actually recorded, and deriving the figure from it
   * keeps one source of truth rather than adding a second that can drift.
   */
  async spentForJob(jobId: string): Promise<{
    spentMicros: number;
    reservedMicros: number;
    calls: number;
  }> {
    const rows = await this.ledger.find({ jobId }).lean().exec();
    return {
      spentMicros: rows.reduce(
        (total, row) => total + (row.actualMicros ?? 0),
        0,
      ),
      reservedMicros: rows
        .filter((row) => row.status === 'reserved')
        .reduce((total, row) => total + row.reservedMicros, 0),
      calls: rows.length,
    };
  }

  /**
   * Commit money for one upcoming provider call.
   *
   * Throws `PricingUnavailableError` when the model has no configured rate —
   * fail closed, before any reservation exists.
   */
  async reserve(input: ReserveInput): Promise<{ reservedMicros: number }> {
    const now = input.now ?? new Date();
    const periodKey = periodKeyOf(now);

    // Fail closed on unknown pricing *first*: no ledger row, no reservation.
    const amount = this.pricing.estimateMicros(
      input.provider,
      input.model,
      input.expected,
    );

    const batchCap = this.batchCapMicros();
    if (amount > batchCap) {
      throw new BudgetExceededError('batch', amount, batchCap);
    }

    // A retried reservation under the same id must not double-commit.
    const existing = await this.ledger
      .findOne({ reservationId: input.reservationId })
      .lean()
      .exec();
    if (existing) return { reservedMicros: existing.reservedMicros };

    await this.ensurePeriod(periodKey);

    // The whole guarantee is this one write. `$expr` lets the condition read
    // the document's own fields, so "is there room" and "take the room" are a
    // single atomic act.
    const updated = await this.budgets
      .findOneAndUpdate(
        {
          periodKey,
          $expr: {
            $lte: [
              { $add: ['$spentMicros', '$reservedMicros', amount] },
              '$capMicros',
            ],
          },
        },
        { $inc: { reservedMicros: amount } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (!updated) {
      const state = await this.snapshot(now);
      throw new BudgetExceededError('monthly', amount, state.availableMicros);
    }

    try {
      await this.ledger.create({
        reservationId: input.reservationId,
        jobId: input.jobId,
        stage: input.stage,
        provider: input.provider,
        model: input.model,
        reservedMicros: amount,
        status: 'reserved',
        usageKnown: false,
      });
    } catch (error) {
      // Give the money back rather than stranding it: a duplicate key here
      // means a concurrent caller already owns this reservation id.
      await this.budgets
        .updateOne({ periodKey }, { $inc: { reservedMicros: -amount } })
        .exec();
      const existingEntry = await this.ledger
        .findOne({ reservationId: input.reservationId })
        .lean()
        .exec();
      if (existingEntry)
        return { reservedMicros: existingEntry.reservedMicros };
      throw error;
    }

    return { reservedMicros: amount };
  }

  /**
   * Settle a reservation against what actually happened. Idempotent.
   *
   * Returns the settled cost, or `null` when the entry was already settled.
   */
  async settle(input: SettleInput): Promise<{
    actualMicros: number;
    usageSource: UsageSource;
    exceededReservation: boolean;
  } | null> {
    const entry = await this.ledger
      .findOne({ reservationId: input.reservationId })
      .lean()
      .exec();
    if (!entry) return null;
    if (entry.status !== 'reserved') return null; // already settled

    const rejected = Boolean(input.providerRejected);
    const usageKnown = Boolean(input.usage) && !input.timedOut && !rejected;
    const usageSource: UsageSource = rejected
      ? 'provider-rejected'
      : input.timedOut
        ? 'unknown-timeout'
        : usageKnown
          ? 'reported'
          : 'estimated';

    // Unknown usage settles at the reservation. Never assume a call was free —
    // except where the provider itself said it did not run the request, which
    // is the one case where "free" is a fact rather than an assumption.
    const actualMicros = rejected
      ? 0
      : usageKnown
        ? this.pricing.costMicros(entry.provider, entry.model, input.usage!)
        : entry.reservedMicros;

    const exceededReservation = actualMicros > entry.reservedMicros;

    // Ledger settlement and the budget movement commit together, or neither
    // does. The CAS on `status: 'reserved'` stays inside: two concurrent
    // settles still resolve to exactly one winner.
    const claimed = await this.inTransaction(async (session) => {
      const won = await this.ledger
        .findOneAndUpdate(
          { reservationId: input.reservationId, status: 'reserved' },
          {
            $set: {
              status: 'reconciled',
              actualMicros,
              usageKnown,
              usageSource,
              exceededReservation,
              reportedUsage: (input.usage as Record<string, number>) ?? null,
              providerDiagnostics: input.diagnostics ?? null,
            },
          },
          { returnDocument: 'after', session },
        )
        .lean()
        .exec();
      if (!won) return null;

      await this.budgets
        .updateOne(
          {
            periodKey: periodKeyOf(
              (entry as { createdAt?: Date }).createdAt ?? new Date(),
            ),
          },
          {
            $inc: {
              reservedMicros: -entry.reservedMicros,
              spentMicros: actualMicros,
            },
          },
          { session },
        )
        .exec();
      return won;
    });
    if (!claimed) return null; // lost the race; the winner did the accounting

    if (exceededReservation) {
      this.logger.warn({
        event: 'engine_cost_exceeded_reservation',
        reservationId: input.reservationId,
        reservedMicros: entry.reservedMicros,
        actualMicros,
      });
    }
    return { actualMicros, usageSource, exceededReservation };
  }

  /**
   * Release a reservation for a call that provably never happened — refused
   * before dispatch, or cancelled before the request left the process.
   *
   * Not for timeouts: see `settle`.
   */
  async release(reservationId: string): Promise<boolean> {
    return this.inTransaction(async (session) => {
      const entry = await this.ledger
        .findOneAndUpdate(
          { reservationId, status: 'reserved' },
          { $set: { status: 'released', actualMicros: 0 } },
          { returnDocument: 'before', session },
        )
        .lean()
        .exec();
      if (!entry) return false;
      await this.budgets
        .updateOne(
          {
            periodKey: periodKeyOf(
              (entry as { createdAt?: Date }).createdAt ?? new Date(),
            ),
          },
          { $inc: { reservedMicros: -entry.reservedMicros } },
          { session },
        )
        .exec();
      return true;
    });
  }

  /**
   * Recover money stranded by a crash.
   *
   * Age alone is not evidence of a crash. A worker that still holds a valid
   * lease and is waiting on a slow provider call looks exactly like a dead one
   * from the ledger's point of view, and reclaiming its reservation would
   * charge the job as orphaned while the call is still in flight — then the
   * worker's own `settle()` would find the entry no longer `reserved` and
   * silently record nothing.
   *
   * So a reservation is reclaimable only when **its job's lease has also
   * lapsed**: terminal, unleased, or leased with an expired `leaseExpiresAt`.
   * The owning worker is then provably no longer entitled to settle it.
   *
   * Reclaimed money is charged as spent, not released: the process died after
   * reserving, and whether the provider billed is exactly as unknowable as a
   * timeout.
   */
  async reclaimStaleReservations(input: {
    staleAfterMs: number;
    now?: Date;
    limit?: number;
  }): Promise<number> {
    const now = input.now ?? new Date();
    const cutoff = new Date(now.getTime() - input.staleAfterMs);
    const stale = await this.ledger
      .find({ status: 'reserved', createdAt: { $lt: cutoff } })
      .limit(input.limit ?? 100)
      .lean()
      .exec();

    let reclaimed = 0;
    let skippedActive = 0;
    for (const entry of stale) {
      if (await this.jobStillHoldsLease(entry.jobId, now)) {
        skippedActive += 1;
        continue;
      }
      const done = await this.inTransaction(async (session) => {
        const claimed = await this.ledger
          .findOneAndUpdate(
            { reservationId: entry.reservationId, status: 'reserved' },
            {
              $set: {
                status: 'orphaned',
                actualMicros: entry.reservedMicros,
                usageKnown: false,
                usageSource: 'unknown-timeout',
              },
            },
            { returnDocument: 'after', session },
          )
          .lean()
          .exec();
        if (!claimed) return false;
        await this.budgets
          .updateOne(
            {
              periodKey: periodKeyOf(
                (entry as { createdAt?: Date }).createdAt ?? now,
              ),
            },
            {
              $inc: {
                reservedMicros: -entry.reservedMicros,
                spentMicros: entry.reservedMicros,
              },
            },
            { session },
          )
          .exec();
        return true;
      });
      if (done) reclaimed += 1;
    }
    if (skippedActive) {
      this.logger.log({
        event: 'engine_reclaim_skipped_active_lease',
        skippedActive,
      });
    }
    return reclaimed;
  }

  /**
   * True while the reservation's job is still legitimately held.
   *
   * An unknown job id is treated as not-held: a reservation whose job no longer
   * exists cannot be settled by anyone, so its money must come back.
   */
  private async jobStillHoldsLease(jobId: string, now: Date): Promise<boolean> {
    if (!isValidObjectId(jobId)) return false;
    const job = await this.jobs
      .findOne({ _id: jobId }, { status: 1, leaseExpiresAt: 1 })
      .lean()
      .exec();
    if (!job) return false;
    if (job.status !== 'leased') return false;
    return Boolean(job.leaseExpiresAt && job.leaseExpiresAt > now);
  }
}
