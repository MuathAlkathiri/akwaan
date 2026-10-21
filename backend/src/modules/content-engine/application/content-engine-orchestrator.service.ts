import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AmbiguousProviderOutcomeError,
  LeaseLostError,
} from '../domain/content-engine.constants';
import { EngineCandidateDocument } from '../schemas/engine-candidate.schema';
import {
  RuleConflictError,
  assertNoRuleConflicts,
} from '../domain/effective-rules';
import { AuthoringContextService } from './authoring-context.service';
import { CandidateCompatibilityService } from './candidate-compatibility.service';
import { CandidateGeneratorService } from './candidate-generator.service';
import { DeterministicScreenService } from './deterministic-screen.service';
import { EngineBudgetService } from './engine-budget.service';
import { FactVerificationService } from './fact-verification.service';
import { GenerationJobService, LeasedJob } from './generation-job.service';
import {
  QualityJudgeParseError,
  QualityJudgeService,
} from './quality-judge.service';

/** Durable, one-job-at-a-time Phase 1c runner. It is not a scheduler or queue. */
@Injectable()
export class ContentEngineOrchestratorService {
  constructor(
    @InjectModel(EngineCandidateDocument.name)
    private readonly candidates: Model<EngineCandidateDocument>,
    private readonly jobs: GenerationJobService,
    private readonly budget: EngineBudgetService,
    private readonly contexts: AuthoringContextService,
    private readonly generator: CandidateGeneratorService,
    private readonly screen: DeterministicScreenService,
    private readonly facts: FactVerificationService,
    private readonly compatibility: CandidateCompatibilityService,
    private readonly quality: QualityJudgeService,
  ) {}

  async runNext(owner: string): Promise<{ jobId: string } | null> {
    const leased = await this.jobs.lease({ owner });
    if (!leased) return null;
    await this.run(leased);
    return { jobId: leased.jobId };
  }

  async run(job: LeasedJob): Promise<void> {
    try {
      if (await this.stopIfCancelled(job)) return;
      const context = this.contexts.resolve(job);
      // The guard that actually protects spend. Preflight and submit both
      // check too, but a job queued before a profile changed would otherwise
      // reach the provider under a configuration nobody validated — and a
      // retry re-enters here, so there is no path around it.
      //
      // It sits before the first checkpoint and before generation, so a
      // conflicting context cannot reach a paid call.
      assertNoRuleConflicts(context.effectiveRules);
      await this.jobs.checkpoint({
        jobId: job.jobId,
        leaseEpoch: job.leaseEpoch,
        stage: 'context_resolved',
        // `stageCheckpoints` already carries free-form details, so provenance
        // records here without a schema change or a migration. Historical
        // checkpoints simply lack the key.
        details: {
          contextHash: context.contextHash,
          ruleSetDigest: context.effectiveRules.digest,
          structuredRuleCount: context.effectiveRules.rules.length,
        },
      });

      let rows = await this.rows(job.jobId);
      if (!rows.length) {
        if (await this.budget.hasLedgerEntry(job.jobId, 'generation')) {
          await this.jobs.awaitReview({
            jobId: job.jobId,
            leaseEpoch: job.leaseEpoch,
            reason: 'GENERATION_OUTCOME_REQUIRES_RECONCILIATION',
            stage: 'provider_outcome_ambiguous',
          });
          return;
        }
        await this.generator.generate({
          jobId: job.jobId,
          leaseEpoch: job.leaseEpoch,
          attempt: job.attempts,
          context,
          count: job.targetCount,
        });
        rows = await this.rows(job.jobId);
      }
      await this.jobs.checkpoint({
        jobId: job.jobId,
        leaseEpoch: job.leaseEpoch,
        stage: 'generated',
        details: { candidateCount: rows.length },
      });

      if (await this.stopIfCancelled(job)) return;
      this.screen.beginBatch(context.exemplars, context.mechanic);
      for (const row of rows) {
        if (row.status !== 'generated') continue;
        const result = this.screen.screen(row.draft ?? {}, row.authoring);
        await this.updateCandidate(job, String(row._id), {
          status: result.passed ? 'screened_pass' : 'screened_reject',
          findings: result.findings,
        });
      }
      await this.jobs.checkpoint({
        jobId: job.jobId,
        leaseEpoch: job.leaseEpoch,
        stage: 'screened',
      });

      rows = await this.rows(job.jobId);
      for (const row of rows) {
        if (row.status !== 'screened_pass' || row.factVerification) continue;
        if (await this.stopIfCancelled(job)) return;
        const result = await this.facts.verify(row.factualClaims ?? []);
        await this.updateCandidate(job, String(row._id), {
          factVerification: result,
          ...(result.state === 'CONTRADICTED'
            ? { status: 'fact_blocked' }
            : {}),
        });
      }
      await this.jobs.checkpoint({
        jobId: job.jobId,
        leaseEpoch: job.leaseEpoch,
        stage: 'verified',
      });

      rows = await this.rows(job.jobId);
      for (const row of rows) {
        if (row.status === 'screened_reject' || row.compatibilityEvaluation) {
          continue;
        }
        const result = this.compatibility.evaluate({
          mechanicKey: job.mechanicKey,
          draft: row.draft ?? {},
        });
        await this.updateCandidate(job, String(row._id), {
          compatibilityEvaluation: result,
          ...(result.preDraft.blockers.length
            ? { status: 'screened_reject' }
            : {}),
        });
      }
      await this.jobs.checkpoint({
        jobId: job.jobId,
        leaseEpoch: job.leaseEpoch,
        stage: 'compatibility_checked',
      });

      rows = await this.rows(job.jobId);
      const priorQualityReservations = await this.budget.reservationIds(
        job.jobId,
        'quality',
      );
      for (const row of rows) {
        if (!this.mayJudge(row)) continue;
        if (await this.stopIfCancelled(job)) return;
        if (
          priorQualityReservations.some((reservationId) =>
            reservationId.includes(`:quality:${row.candidateId}:`),
          )
        ) {
          await this.updateCandidate(job, String(row._id), {
            qualityEvaluation: {
              error: 'QUALITY_OUTCOME_REQUIRES_RECONCILIATION',
            },
            status: 'awaiting_review',
          });
          continue;
        }
        try {
          const result = await this.quality.judge({
            jobId: job.jobId,
            candidateId: row.candidateId,
            attempt: job.attempts,
            draft: row.draft ?? {},
            context,
          });
          await this.updateCandidate(job, String(row._id), {
            qualityEvaluation: result,
            status: 'awaiting_review',
          });
        } catch (error) {
          if (error instanceof QualityJudgeParseError) {
            await this.updateCandidate(job, String(row._id), {
              qualityEvaluation: { error: error.code },
              status: 'awaiting_review',
            });
            continue;
          }
          throw error;
        }
      }
      rows = await this.rows(job.jobId);
      for (const row of rows) {
        // Unsupported/unresolved facts and advisory judge rejections are not
        // automatic rejects; make their required human handoff explicit.
        if (row.status !== 'screened_pass') continue;
        await this.updateCandidate(job, String(row._id), {
          status: 'awaiting_review',
        });
      }
      await this.jobs.checkpoint({
        jobId: job.jobId,
        leaseEpoch: job.leaseEpoch,
        stage: 'judged',
      });
      // Every surviving candidate still requires authoritative human approval.
      await this.jobs.awaitReview({
        jobId: job.jobId,
        leaseEpoch: job.leaseEpoch,
        reason: 'PHASE_1C_EVALUATION_COMPLETE',
      });
    } catch (error) {
      if (error instanceof LeaseLostError) throw error;
      if (error instanceof RuleConflictError) {
        // A configuration conflict will not resolve itself, so retrying only
        // burns attempts. It waits for a human to fix the profile, using the
        // existing await-review convention rather than a new job state.
        await this.jobs.awaitReview({
          jobId: job.jobId,
          leaseEpoch: job.leaseEpoch,
          reason: error.message,
        });
        return;
      }
      if (error instanceof AmbiguousProviderOutcomeError) {
        await this.jobs.awaitReview({
          jobId: job.jobId,
          leaseEpoch: job.leaseEpoch,
          reason: error.message,
          stage: 'provider_outcome_ambiguous',
        });
        return;
      }
      await this.jobs.releaseForRetry(
        job.jobId,
        job.leaseEpoch,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async stopIfCancelled(job: LeasedJob): Promise<boolean> {
    if (!(await this.jobs.isCancellationRequested(job.jobId))) return false;
    await this.jobs.cancelLeased(job.jobId, job.leaseEpoch);
    return true;
  }

  private rows(jobId: string) {
    return this.candidates.find({ jobId }).sort({ ordinal: 1 }).lean().exec();
  }

  private mayJudge(row: EngineCandidateDocument): boolean {
    const facts = row.factVerification as { state?: string } | null;
    const compatibility = row.compatibilityEvaluation as {
      preDraft?: { blockers?: unknown[] };
    } | null;
    return (
      row.status === 'screened_pass' &&
      facts?.state === 'SUPPORTED' &&
      !compatibility?.preDraft?.blockers?.length &&
      !row.qualityEvaluation
    );
  }

  private async updateCandidate(
    job: LeasedJob,
    id: string,
    changes: Record<string, unknown>,
  ): Promise<void> {
    if (!(await this.jobs.holdsLease(job.jobId, job.leaseEpoch))) {
      throw new LeaseLostError(job.jobId, job.leaseEpoch);
    }
    const result = await this.candidates
      .updateOne(
        {
          _id: id,
          jobId: job.jobId,
          writeEpoch: { $lte: job.leaseEpoch },
        },
        { $set: { ...changes, writeEpoch: job.leaseEpoch } },
      )
      .exec();
    if (result.matchedCount !== 1) {
      throw new LeaseLostError(job.jobId, job.leaseEpoch);
    }
  }
}
