import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import {
  CONTENT_ENGINE_ENABLED,
  DEFAULT_LEASE_MS,
  ENGINE_JOB_STATUSES,
  EngineDisabledError,
  EnginePipelineStage,
  EngineJobStatus,
  isTerminal,
  LeaseLostError,
  MAX_JOB_ATTEMPTS,
} from '../domain/content-engine.constants';
import {
  GenerationSpecification,
  buildGenerationSpecification,
  computeGenerationRequestHash,
  freezeGenerationSpecification,
  generatorAnswerModeFor,
  isGenerationSpecificationComplete,
} from '../domain/generation-specification';
import { EngineJobDocument } from '../schemas/engine-job.schema';

export interface SubmitJobInput {
  mechanicKey: string;
  worldKey: string;
  scopeKey: string;
  targetCount: number;
  /** Bumped when prompts or context change, so old work is not deduplicated. */
  contextRevision: string;
  generationSpec?: GenerationSpecification | null;
  planDigest?: string | null;
  createdBy?: string | null;
  createdByEmail?: string | null;
}

export interface LeasedJob {
  jobId: string;
  leaseEpoch: number;
  mechanicKey: string;
  worldKey: string;
  scopeKey: string;
  targetCount: number;
  attempts: number;
  generationSpec?: GenerationSpecification | null;
}

/**
 * Stable identity of a request.
 *
 * When a full `GenerationSpecification` is present, hashes the complete
 * canonical specification (World, Scope, mechanic, count, difficulty,
 * guidance, prompt version, model, temperature, and relevant config).
 */
export const requestHashOf = (input: SubmitJobInput): string => {
  if (
    input.generationSpec &&
    isGenerationSpecificationComplete(input.generationSpec)
  ) {
    return computeGenerationRequestHash(input.generationSpec);
  }
  return createHash('sha256')
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
};

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
  async submit(input: SubmitJobInput): Promise<{
    jobId: string;
    created: boolean;
    generationSpec: GenerationSpecification | null;
  }> {
    this.assertEnabled();
    const resolvedSpec = this.resolveSpecificationForSubmit(input);
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
            specVersion: resolvedSpec?.specVersion ?? null,
            generationSpec: resolvedSpec,
            planDigest: input.planDigest ?? null,
            createdBy: input.createdBy ?? null,
            createdByEmail: input.createdByEmail ?? null,
            lastExecutedBy: null,
            lastExecutedByEmail: null,
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

    if (before) {
      return {
        jobId: String(before._id),
        created: false,
        generationSpec: before.generationSpec
          ? freezeGenerationSpecification(before.generationSpec)
          : resolvedSpec,
      };
    }

    const created = await this.jobs.findOne({ requestHash }).lean().exec();
    return {
      jobId: String(created!._id),
      created: true,
      generationSpec: created?.generationSpec
        ? freezeGenerationSpecification(created.generationSpec)
        : resolvedSpec,
    };
  }

  private resolveSpecificationForSubmit(
    input: SubmitJobInput,
  ): GenerationSpecification | null {
    if (input.generationSpec) {
      return freezeGenerationSpecification(input.generationSpec);
    }
    if (!generatorAnswerModeFor(input.mechanicKey)) {
      return null;
    }
    try {
      return buildGenerationSpecification({
        config: this.config,
        context: {
          worldKey: input.worldKey,
          scopeKey: input.scopeKey,
          mechanicKey: input.mechanicKey,
          contextHash: input.contextRevision,
          effectiveRules: {
            version: 1,
            digest: createHash('sha256')
              .update(`rules:${input.mechanicKey}:${input.contextRevision}`)
              .digest('hex'),
            rules: [],
            resolved: [],
            conflicts: [],
            structuredSources: [],
          },
        },
        targetCount: input.targetCount,
      });
    } catch {
      return null;
    }
  }

  async findById(jobId: string): Promise<EngineJobDocument | null> {
    if (!Types.ObjectId.isValid(jobId)) return null;
    return this.jobs.findById(jobId).lean().exec();
  }

  /**
   * Read-only paginated job listing ordered newest-first (`_id: -1`).
   *
   * Uses existing `engine_jobs` persistence with bounded page size (1..50,
   * default 20) and deterministic cursor pagination (`_id < cursor`).
   */
  async list(input?: {
    cursor?: string;
    limit?: number;
    status?: string;
    worldKey?: string;
    scopeKey?: string;
    mechanicKey?: string;
  }): Promise<{
    items: Array<EngineJobDocument & { _id?: unknown }>;
    nextCursor: string | null;
  }> {
    const rawLimit = input?.limit ?? 20;
    if (
      !Number.isFinite(rawLimit) ||
      !Number.isInteger(rawLimit) ||
      rawLimit < 1 ||
      rawLimit > 50
    ) {
      throw new BadRequestException({
        code: 'INVALID_PAGE_LIMIT',
        message:
          'INVALID_PAGE_LIMIT: limit must be an integer between 1 and 50',
      });
    }

    const filter: Record<string, unknown> = {};
    if (input?.cursor !== undefined && input.cursor.trim().length > 0) {
      const trimmedCursor = input.cursor.trim();
      if (!Types.ObjectId.isValid(trimmedCursor)) {
        throw new BadRequestException({
          code: 'INVALID_CURSOR',
          message: 'INVALID_CURSOR: cursor must be a valid job identifier',
        });
      }
      filter._id = { $lt: new Types.ObjectId(trimmedCursor) };
    }
    if (input?.status !== undefined && input.status.trim().length > 0) {
      const trimmedStatus = input.status.trim() as EngineJobStatus;
      if (!ENGINE_JOB_STATUSES.includes(trimmedStatus)) {
        throw new BadRequestException({
          code: 'INVALID_JOB_STATUS',
          message: `INVALID_JOB_STATUS: unsupported status filter "${trimmedStatus}"`,
        });
      }
      filter.status = trimmedStatus;
    }
    if (input?.worldKey !== undefined && input.worldKey.trim().length > 0) {
      filter.worldKey = input.worldKey.trim();
    }
    if (input?.scopeKey !== undefined && input.scopeKey.trim().length > 0) {
      filter.scopeKey = input.scopeKey.trim();
    }
    if (
      input?.mechanicKey !== undefined &&
      input.mechanicKey.trim().length > 0
    ) {
      filter.mechanicKey = input.mechanicKey.trim();
    }

    const rows = await this.jobs
      .find(filter)
      .sort({ _id: -1 })
      .limit(rawLimit + 1)
      .lean()
      .exec();

    const items = rows.slice(0, rawLimit);
    const nextCursor =
      rows.length > rawLimit && items.length > 0
        ? String(items[items.length - 1]._id)
        : null;

    return { items, nextCursor };
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
      generationSpec: claimed.generationSpec
        ? freezeGenerationSpecification(claimed.generationSpec)
        : null,
    };
  }

  /**
   * Claim one exact job by `jobId`.
   *
   * Used by targeted Admin execution so an Admin can never accidentally lease
   * or execute a different queued job.
   */
  async leaseById(input: {
    jobId: string;
    owner: string;
    leaseMs?: number;
    now?: Date;
    executedBy?: string | null;
    executedByEmail?: string | null;
  }): Promise<LeasedJob | null> {
    this.assertEnabled();
    if (!Types.ObjectId.isValid(input.jobId)) return null;
    const now = input.now ?? new Date();
    const expiresAt = new Date(
      now.getTime() + (input.leaseMs ?? DEFAULT_LEASE_MS),
    );

    const claimed = await this.jobs
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(input.jobId),
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
            ...(input.executedBy !== undefined
              ? { lastExecutedBy: input.executedBy }
              : {}),
            ...(input.executedByEmail !== undefined
              ? { lastExecutedByEmail: input.executedByEmail }
              : {}),
          },
          $inc: { leaseEpoch: 1, attempts: 1 },
        },
        { returnDocument: 'after' },
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
      generationSpec: claimed.generationSpec
        ? freezeGenerationSpecification(claimed.generationSpec)
        : null,
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
