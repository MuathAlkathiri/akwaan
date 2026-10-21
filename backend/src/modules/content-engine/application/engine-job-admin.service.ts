import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BudgetExceededError,
  CONTENT_ENGINE_ENABLED,
  ENGINE_LIVE_PROVIDER_ENABLED,
  microsToSar,
  PricingUnavailableError,
} from '../domain/content-engine.constants';
import { EngineCandidateDocument } from '../schemas/engine-candidate.schema';
import {
  RuleConflict,
  RuleConflictError,
  assertNoRuleConflicts,
} from '../domain/effective-rules';
import {
  AuthoringContextService,
  AuthoringContextUnavailableError,
} from './authoring-context.service';
import { ContentEngineOrchestratorService } from './content-engine-orchestrator.service';
import { EngineBudgetService } from './engine-budget.service';
import { GenerationJobService } from './generation-job.service';

export interface PreflightRequest {
  mechanicKey: string;
  worldKey: string;
  scopeKey: string;
  targetCount: number;
}

/**
 * The Admin-facing seam for starting work.
 *
 * Phase 1d shipped review but nothing that could *create* a job, so the
 * pipeline was implemented and unreachable. This closes that gap and nothing
 * else: it resolves context, prices the batch, submits idempotently, and runs
 * one job on request. There is no queue, no scheduler and no background worker
 * — a human presses a button, which for a ten-item pilot is the whole
 * requirement and keeps execution attributable to a person.
 */
@Injectable()
export class EngineJobAdminService {
  private readonly logger = new Logger(EngineJobAdminService.name);
  /** In-flight `runNow` owners, so a double click cannot start two runs. */
  private readonly running = new Set<string>();

  constructor(
    @InjectModel(EngineCandidateDocument.name)
    private readonly candidates: Model<EngineCandidateDocument>,
    private readonly jobs: GenerationJobService,
    private readonly budget: EngineBudgetService,
    private readonly contexts: AuthoringContextService,
    private readonly orchestrator: ContentEngineOrchestratorService,
    private readonly config: ConfigService,
  ) {}

  private truthy(key: string): boolean {
    return ['true', '1', 'yes', 'on'].includes(
      this.config.get<string>(key)?.trim().toLowerCase() ?? '',
    );
  }

  /**
   * Everything a human needs before spending: is the combination authorable,
   * what will it cost, and is there room.
   *
   * Deliberately read-only. It resolves the real authoring context — so an
   * unregistered mechanic or a Scope in the wrong World is refused here rather
   * than after a job exists — and prices the batch from configuration only.
   */
  async preflight(input: PreflightRequest): Promise<{
    resolvable: boolean;
    contextHash?: string;
    estimatedMicros?: number;
    estimatedSar?: number;
    pricingConfigured: boolean;
    liveProviderEnabled: boolean;
    engineEnabled: boolean;
    budget: Awaited<ReturnType<EngineBudgetService['snapshot']>>;
    blockedReason?: string;
    ruleConflicts?: RuleConflict[];
  }> {
    const budget = await this.budget.snapshot();
    const engineEnabled = this.truthy(CONTENT_ENGINE_ENABLED);
    const liveProviderEnabled = this.truthy(ENGINE_LIVE_PROVIDER_ENABLED);

    let contextHash: string | undefined;
    let ruleConflicts: RuleConflict[] = [];
    try {
      const context = this.contexts.resolve(input);
      contextHash = context.contextHash;
      ruleConflicts = context.effectiveRules.conflicts;
    } catch (error) {
      if (error instanceof AuthoringContextUnavailableError) {
        return {
          resolvable: false,
          pricingConfigured: false,
          liveProviderEnabled,
          engineEnabled,
          budget,
          blockedReason: error.message,
        };
      }
      throw error;
    }

    // A structurally conflicting configuration is reported here rather than
    // discovered after a paid call. The conflicts travel as data so a reviewer
    // sees which layer attempted what, against which constraint.
    if (ruleConflicts.length) {
      return {
        resolvable: false,
        contextHash,
        pricingConfigured: false,
        liveProviderEnabled,
        engineEnabled,
        budget,
        blockedReason: new RuleConflictError(ruleConflicts).message,
        ruleConflicts,
      };
    }

    const provider = this.config.get<string>('ENGINE_PROVIDER_NAME') ?? 'fake';
    const model =
      this.config.get<string>('ENGINE_GENERATION_MODEL') ?? 'fake-model';
    try {
      // One generation call, plus a judge and a verification call per candidate
      // — the shape the orchestrator actually runs.
      const estimatedMicros =
        this.budget.estimate({
          provider,
          model,
          callsExpected: 1,
          expected: {
            promptTokens: 20_000,
            maxOutputTokens: input.targetCount * 400,
          },
        }) +
        this.budget.estimate({
          provider,
          model: this.config.get<string>('ENGINE_QUALITY_MODEL') ?? model,
          callsExpected: input.targetCount * 2,
          expected: { promptTokens: 2_000, maxOutputTokens: 600 },
        });
      return {
        resolvable: true,
        contextHash,
        estimatedMicros,
        estimatedSar: microsToSar(estimatedMicros),
        pricingConfigured: true,
        liveProviderEnabled,
        engineEnabled,
        budget,
      };
    } catch (error) {
      if (error instanceof PricingUnavailableError) {
        // Not an error state for a preflight — it is the answer. No price, no
        // estimate, and the engine will refuse to reserve later for the same
        // reason.
        return {
          resolvable: true,
          contextHash,
          pricingConfigured: false,
          liveProviderEnabled,
          engineEnabled,
          budget,
          blockedReason: error.message,
        };
      }
      throw error;
    }
  }

  /** Submit, idempotently. The same combination twice is one job. */
  async submit(input: PreflightRequest): Promise<{
    jobId: string;
    created: boolean;
    contextHash: string;
  }> {
    if (input.targetCount < 1 || input.targetCount > 50) {
      throw new BadRequestException('targetCount must be between 1 and 50');
    }
    let contextHash: string;
    try {
      const context = this.contexts.resolve(input);
      assertNoRuleConflicts(context.effectiveRules);
      contextHash = context.contextHash;
    } catch (error) {
      if (
        error instanceof AuthoringContextUnavailableError ||
        error instanceof RuleConflictError
      ) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const result = await this.jobs.submit({
      mechanicKey: input.mechanicKey,
      worldKey: input.worldKey,
      scopeKey: input.scopeKey,
      targetCount: input.targetCount,
      // The context hash is part of the request identity: a Skill edit makes
      // this genuinely different work, while a repeated click does not.
      contextRevision: contextHash,
    });
    this.logger.log({
      event: 'engine_job_submitted',
      jobId: result.jobId,
      created: result.created,
      mechanicKey: input.mechanicKey,
      scopeKey: input.scopeKey,
    });
    return { ...result, contextHash };
  }

  /**
   * Run one job now, under an explicit owner.
   *
   * Two guards against a double click: the in-process set below, and — the one
   * that actually matters across processes — the job lease the orchestrator
   * takes. The set only spares the database a pointless contended claim.
   */
  async runNow(
    owner: string,
  ): Promise<{ jobId: string | null; alreadyRunning: boolean }> {
    if (this.running.has(owner)) return { jobId: null, alreadyRunning: true };
    this.running.add(owner);
    try {
      const result = await this.orchestrator.runNext(owner);
      return { jobId: result?.jobId ?? null, alreadyRunning: false };
    } catch (error) {
      if (error instanceof BudgetExceededError)
        throw new BadRequestException(error.message);
      throw error;
    } finally {
      this.running.delete(owner);
    }
  }

  /** Progress for one job: stage, attempts, failure, and what it has spent. */
  async status(jobId: string): Promise<Record<string, unknown> | null> {
    const job = await this.jobs.findById(jobId);
    if (!job) return null;
    const spend = await this.budget.spentForJob(jobId);
    const counts = await this.candidates.aggregate<{
      _id: string;
      count: number;
    }>([
      { $match: { jobId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return {
      jobId,
      status: job.status,
      pipelineStage: job.pipelineStage,
      attempts: job.attempts,
      cancellationRequested: job.cancellationRequested,
      awaitingReviewReason: job.awaitingReviewReason,
      lastError: job.lastError,
      candidates: Object.fromEntries(counts.map((row) => [row._id, row.count])),
      spentMicros: spend.spentMicros,
      spentSar: microsToSar(spend.spentMicros),
      outstandingReservedMicros: spend.reservedMicros,
      providerCalls: spend.calls,
    };
  }

  cancel(jobId: string): Promise<boolean> {
    return this.jobs.requestCancellation(jobId);
  }
}
