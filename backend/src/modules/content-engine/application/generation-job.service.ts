import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import {
  CONTENT_ENGINE_ENABLED,
  DEFAULT_LEASE_MS,
  EngineDisabledError,
  EnginePipelineStage,
  EngineJobStatus,
  isTerminal,
  LeaseLostError,
  MAX_JOB_ATTEMPTS,
} from '../domain/content-engine.constants';
import { EngineJobDocument } from '../schemas/engine-job.schema';

export interface SubmitJobInput {
  mechanicKey: string;
  worldKey: string;
  scopeKey: string;
  targetCount: number;
  /** Bumped when prompts or context change, so old work is not deduplicated. */
  contextRevision: string;
}

export interface LeasedJob {
  jobId: string;
  leaseEpoch: number;
  mechanicKey: string;
  worldKey: string;
  scopeKey: string;
  targetCount: number;
  attempts: number;
}

/** Stable identity of a request. Order-independent, revision-sensitive. */
export const requestHashOf = (input: SubmitJobInput): string =>
  createHash('sha256')
    .update(
      JSON.stringify([
        input.mechanicKey,
        input.worldKey,
        input.scopeKey,
        input.targetCount,
        input.contextRevision,
      ]),
    )
    .digest('hex');

/**
 * Job lifecycle for the Content Engine.
 *
 * Everything here is one atomic Mongo operation per transition. There are no
 * in-process locks, because a Node process is not the unit of correctness: two
 * instances, a restart mid-flight, and a worker paused past its lease are all
 * ordinary, and only the database can arbitrate between them.
 *
 * The engine performs no generation in this phase. `lease` hands a worker a job
 * and a fencing epoch; what the worker then does arrives in Phase 1b.
 */
@Injectable()
export class GenerationJobService {
  private readonly logger = new Logger(GenerationJobService.name);

  constructor(
    @InjectModel(EngineJobDocument.name)
    private readonly jobs: Model<EngineJobDocument>,
    private readonly config: ConfigService,
  ) {}

  /** Absent or falsy disables the engine. Default is off. */
  enabled(): boolean {
    const raw = this.config
      .get<string>(CONTENT_ENGINE_ENABLED)
      ?.trim()
      .toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
  }

  private assertEnabled(): void {
    if (!this.enabled()) throw new EngineDisabledError();
  }

  /**
   * Submit a job, or return the one that already exists.
   *
   * The unique index on `requestHash` is the arbiter: two concurrent
   * submissions race on the insert, exactly one wins, and both callers are
   * handed the same job. Nothing is deduplicated in application code.
   */
  async submit(
    input: SubmitJobInput,
  ): Promise<{ jobId: string; created: boolean }> {
    this.assertEnabled();
    const requestHash = requestHashOf(input);

    const before = await this.jobs
      .findOneAndUpdate(
        { requestHash },
        {
          $setOnInsert: {
            requestHash,
            mechanicKey: input.mechanicKey,
            worldKey: input.worldKey,
            scopeKey: input.scopeKey,
            targetCount: input.targetCount,
            status: 'queued' as EngineJobStatus,
            leaseOwner: null,
            leaseExpiresAt: null,
            leaseEpoch: 0,
            attempts: 0,
            cancellationRequested: false,
            reservedMicros: 0,
            spentMicros: 0,
            pipelineStage: 'pending' as EnginePipelineStage,
            stageCheckpoints: {},
            awaitingReviewReason: null,
          },
        },
        { upsert: true, returnDocument: 'before' },
      )
      .lean()
      .exec();

    if (before) return { jobId: String(before._id), created: false };

    const created = await this.jobs.findOne({ requestHash }).lean().exec();
    return { jobId: String(created!._id), created: true };
  }

  async findById(jobId: string): Promise<EngineJobDocument | null> {
    return this.jobs.findById(jobId).lean().exec();
  }

  /**
   * Claim one claimable job.
   *
   * Claimable means queued, or leased with an expired lease. The `$inc` on
   * `leaseEpoch` issues the fencing token: whoever claims gets a strictly
   * higher epoch than every previous holder, so a previous holder's writes
   * — which all carry its own epoch — can no longer match.
   */
  async lease(input: {
    owner: string;
    leaseMs?: number;
    now?: Date;
  }): Promise<LeasedJob | null> {
    this.assertEnabled();
    const now = input.now ?? new Date();
    const expiresAt = new Date(
      now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS),
    );

    const claimed = await this.jobs
      .findOneAndUpdate(
        {
          cancellationRequested: false,
          attempts: { $lt: MAX_JOB_ATTEMPTS },
          $or: [
            { status: 'queued' },
            { status: 'leased', leaseExpiresAt: { $lt: now } },
          ],
        },
        {
          $set: {
            status: 'leased' as EngineJobStatus,
            leaseOwner: input.owner,
            leaseExpiresAt: expiresAt,
          },
          $inc: { leaseEpoch: 1, attempts: 1 },
        },
        { returnDocument: 'after', sort: { createdAt: 1 } },
      )
      .lean()
      .exec();

    if (!claimed) return null;
    return {
      jobId: String(claimed._id),
      leaseEpoch: claimed.leaseEpoch,
      mechanicKey: claimed.mechanicKey,
      worldKey: claimed.worldKey,
      scopeKey: claimed.scopeKey,
      targetCount: claimed.targetCount,
      attempts: claimed.attempts,
    };
  }

  /**
   * Extend a lease the caller still holds.
   *
   * Conditioned on the epoch, so a worker that already lost the job cannot
   * resurrect its claim by renewing.
   */
  async renew(input: {
    jobId: string;
    leaseEpoch: number;
    leaseMs?: number;
    now?: Date;
  }): Promise<boolean> {
    const now = input.now ?? new Date();
    const result = await this.jobs
      .updateOne(
        { _id: input.jobId, leaseEpoch: input.leaseEpoch, status: 'leased' },
        {
          $set: {
            leaseExpiresAt: new Date(
              now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS),
            ),
          },
        },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  /** True when the holder's epoch is still the current one. */
  async holdsLease(jobId: string, leaseEpoch: number): Promise<boolean> {
    const job = await this.jobs
      .findOne({ _id: jobId, leaseEpoch, status: 'leased' })
      .lean()
      .exec();
    return Boolean(job);
  }

  /**
   * A fenced terminal transition.
   *
   * Idempotent in the way that matters: a repeated call from the same holder
   * finds the job already terminal and reports success rather than throwing, so
   * an at-least-once completion signal is safe. A *stale* holder is refused.
   */
  private async finish(input: {
    jobId: string;
    leaseEpoch: number;
    status: Extract<EngineJobStatus, 'completed' | 'failed' | 'cancelled'>;
    lastError?: string;
  }): Promise<void> {
    const updated = await this.jobs
      .findOneAndUpdate(
        { _id: input.jobId, leaseEpoch: input.leaseEpoch },
        {
          $set: {
            status: input.status,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: input.lastError ?? null,
          },
        },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();

    if (updated) return;

    const current = await this.jobs.findById(input.jobId).lean().exec();
    if (current && isTerminal(current.status)) return; // already settled
    throw new LeaseLostError(input.jobId, input.leaseEpoch);
  }

  complete(jobId: string, leaseEpoch: number): Promise<void> {
    return this.finish({ jobId, leaseEpoch, status: 'completed' });
  }

  fail(jobId: string, leaseEpoch: number, reason: string): Promise<void> {
    return this.finish({
      jobId,
      leaseEpoch,
      status: 'failed',
      lastError: reason,
    });
  }

  /**
   * Request cancellation.
   *
   * Deliberately not an interruption. An in-flight provider call cannot be
   * unsent, and money already reserved for it must still settle — so this sets
   * a flag the worker observes between stages, and a job that is mid-call
   * finishes its accounting before stopping.
   */
  async requestCancellation(jobId: string): Promise<boolean> {
    const updated = await this.jobs
      .findOneAndUpdate(
        {
          _id: jobId,
          status: {
            $nin: ['awaiting_review', 'completed', 'failed', 'cancelled'],
          },
        },
        { $set: { cancellationRequested: true } },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();
    if (!updated) return false;

    // A job nobody holds can be stopped immediately; a leased one stops when
    // its worker next looks.
    if (updated.status === 'queued') {
      await this.jobs
        .updateOne(
          { _id: jobId, status: 'queued' },
          { $set: { status: 'cancelled' as EngineJobStatus } },
        )
        .exec();
    }
    return true;
  }

  async isCancellationRequested(jobId: string): Promise<boolean> {
    const job = await this.jobs
      .findOne({ _id: jobId }, { cancellationRequested: 1 })
      .lean()
      .exec();
    return Boolean(job?.cancellationRequested);
  }

  /**
   * Persist one pipeline boundary under the current fencing epoch.
   * A recovered worker uses these checkpoints to resume after, rather than
   * repeat, an already completed chargeable stage.
   */
  async checkpoint(input: {
    jobId: string;
    leaseEpoch: number;
    stage: EnginePipelineStage;
    details?: Record<string, unknown>;
    now?: Date;
  }): Promise<void> {
    const completedAt = (input.now ?? new Date()).toISOString();
    const updated = await this.jobs
      .updateOne(
        {
          _id: input.jobId,
          leaseEpoch: input.leaseEpoch,
          status: 'leased',
        },
        {
          $set: {
            pipelineStage: input.stage,
            [`stageCheckpoints.${input.stage}`]: {
              completedAt,
              ...(input.details ?? {}),
            },
          },
        },
      )
      .exec();
    if (updated.modifiedCount !== 1) {
      throw new LeaseLostError(input.jobId, input.leaseEpoch);
    }
  }

  /** End the automated slice without claiming approval or ContentItem creation. */
  async awaitReview(input: {
    jobId: string;
    leaseEpoch: number;
    reason: string;
    stage?: EnginePipelineStage;
  }): Promise<void> {
    const stage = input.stage ?? 'awaiting_review';
    const updated = await this.jobs
      .updateOne(
        {
          _id: input.jobId,
          leaseEpoch: input.leaseEpoch,
          status: 'leased',
        },
        {
          $set: {
            status: 'awaiting_review' as EngineJobStatus,
            pipelineStage: stage,
            awaitingReviewReason: input.reason,
            leaseOwner: null,
            leaseExpiresAt: null,
            [`stageCheckpoints.${stage}`]: {
              completedAt: new Date().toISOString(),
              reason: input.reason,
            },
          },
        },
      )
      .exec();
    if (updated.modifiedCount !== 1) {
      throw new LeaseLostError(input.jobId, input.leaseEpoch);
    }
  }

  async cancelLeased(jobId: string, leaseEpoch: number): Promise<void> {
    await this.finish({ jobId, leaseEpoch, status: 'cancelled' });
  }

  /** Retry only non-ambiguous failures; leasing enforces the hard attempt cap. */
  async releaseForRetry(
    jobId: string,
    leaseEpoch: number,
    reason: string,
  ): Promise<void> {
    const current = await this.jobs.findById(jobId).lean().exec();
    const exhausted =
      (current?.attempts ?? MAX_JOB_ATTEMPTS) >= MAX_JOB_ATTEMPTS;
    const updated = await this.jobs
      .updateOne(
        { _id: jobId, leaseEpoch, status: 'leased' },
        {
          $set: exhausted
            ? {
                status: 'failed' as EngineJobStatus,
                leaseOwner: null,
                leaseExpiresAt: null,
                lastError: reason,
              }
            : {
                status: 'queued' as EngineJobStatus,
                leaseOwner: null,
                leaseExpiresAt: null,
                lastError: reason,
              },
        },
      )
      .exec();
    if (updated.modifiedCount !== 1) {
      throw new LeaseLostError(jobId, leaseEpoch);
    }
  }

  /**
   * Return jobs whose leases lapsed to the queue.
   *
   * Not a background poller — a narrowly scoped routine a caller invokes. A
   * job past `MAX_JOB_ATTEMPTS` is failed rather than re-queued, so a crash
   * loop cannot spend forever.
   */
  async recoverExpiredLeases(now = new Date()): Promise<{
    requeued: number;
    exhausted: number;
  }> {
    const expired = await this.jobs
      .find({ status: 'leased', leaseExpiresAt: { $lt: now } })
      .lean()
      .exec();

    let requeued = 0;
    let exhausted = 0;
    for (const job of expired) {
      const terminal = job.attempts >= MAX_JOB_ATTEMPTS;
      const result = await this.jobs
        .updateOne(
          { _id: job._id, leaseEpoch: job.leaseEpoch, status: 'leased' },
          {
            $set: terminal
              ? {
                  status: 'failed' as EngineJobStatus,
                  leaseOwner: null,
                  leaseExpiresAt: null,
                  lastError: 'attempt limit reached after lease expiry',
                }
              : {
                  status: 'queued' as EngineJobStatus,
                  leaseOwner: null,
                  leaseExpiresAt: null,
                },
          },
        )
        .exec();
      if (result.modifiedCount !== 1) continue;
      if (terminal) exhausted += 1;
      else requeued += 1;
    }
    if (requeued || exhausted) {
      this.logger.log({ event: 'engine_lease_recovery', requeued, exhausted });
    }
    return { requeued, exhausted };
  }
}
