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
import {
  GenerationSpecValidationError,
  GenerationSpecification,
  PROMPT_VERSIONS,
  generatorAnswerModeFor,
  isGenerationSpecificationComplete,
} from '../domain/generation-specification';
import { AuthoringContextService } from './authoring-context.service';
import { CandidateCompatibilityService } from './candidate-compatibility.service';
import {
  CandidateGeneratorService,
  CandidateParseError,
} from './candidate-generator.service';
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

  async runJob(
    jobId: string,
    owner: string,
    actor?: { actorId?: string | null; actorEmail?: string | null },
  ): Promise<{ jobId: string } | null> {
    const leased = await this.jobs.leaseById({
      jobId,
      owner,
      executedBy: actor?.actorId,
      executedByEmail: actor?.actorEmail,
    });
    if (!leased) return null;
    await this.run(leased);
    return { jobId: leased.jobId };
  }

  private async resolveProvenanceSpecification(job: LeasedJob): Promise<{
    valid: boolean;
    spec: GenerationSpecification | null;
    reason?: string;
  }> {
    let candidateSpec: unknown = job.generationSpec;
    if (
      candidateSpec === undefined &&
      typeof this.jobs.findById === 'function'
    ) {
      const stored = await this.jobs.findById(job.jobId);
      if (stored && ('_id' in stored || 'status' in stored)) {
        candidateSpec = stored.generationSpec ?? null;
      }
    }

    if (candidateSpec === undefined) {
      return { valid: true, spec: null };
    }
    if (!isGenerationSpecificationComplete(candidateSpec)) {
      return {
        valid: false,
        spec: null,
        reason:
          'JOB_PROVENANCE_INSUFFICIENT: job lacks a complete, valid generationSpecification',
      };
    }
    if (
      candidateSpec.mechanicKey !== job.mechanicKey ||
      candidateSpec.worldKey !== job.worldKey ||
      candidateSpec.scopeKey !== job.scopeKey ||
      candidateSpec.targetCount !== job.targetCount
    ) {
      return {
        valid: false,
        spec: null,
        reason:
          'JOB_PROVENANCE_INSUFFICIENT: generationSpec target fields do not match job record',
      };
    }
    const expectedAnswerMode = generatorAnswerModeFor(job.mechanicKey);
    if (
      expectedAnswerMode &&
      (candidateSpec.answerMode !== expectedAnswerMode ||
        candidateSpec.promptVersion !== PROMPT_VERSIONS[expectedAnswerMode])
    ) {
      return {
        valid: false,
        spec: null,
        reason:
          'JOB_PROVENANCE_DRIFT: generationSpec answerMode or promptVersion does not match active generator',
      };
    }
    return { valid: true, spec: candidateSpec };
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

      let rows = await this.rows(job.jobId);
      const provenance = await this.resolveProvenanceSpecification(job);
      if (!provenance.valid && !rows.length) {
        await this.jobs.awaitReview({
          jobId: job.jobId,
          leaseEpoch: job.leaseEpoch,
          reason: provenance.reason!,
        });
        return;
      }

      if (
        provenance.spec &&
        !rows.length &&
        /^[a-f0-9]{64}$/.test(provenance.spec.contextHash)
      ) {
        if (provenance.spec.contextHash !== context.contextHash) {
          await this.jobs.awaitReview({
            jobId: job.jobId,
            leaseEpoch: job.leaseEpoch,
            reason:
              'JOB_CONTEXT_DRIFT: authoring context has changed since the job specification was pinned',
          });
          return;
        }
        if (
          /^[a-f0-9]{64}$/.test(provenance.spec.ruleSetDigest) &&
          provenance.spec.ruleSetDigest !== context.effectiveRules.digest
        ) {
          await this.jobs.awaitReview({
            jobId: job.jobId,
            leaseEpoch: job.leaseEpoch,
            reason:
              'JOB_RULESET_DRIFT: effective authoring rules have changed since the job specification was pinned',
          });
          return;
        }
      }

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
          ...(provenance.spec
            ? {
                specVersion: provenance.spec.specVersion,
                promptVersion: provenance.spec.promptVersion,
              }
            : {}),
        },
      });

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
          count: provenance.spec?.targetCount ?? job.targetCount,
          ...(provenance.spec
            ? {
                generationSpec: provenance.spec,
                difficulty: provenance.spec.difficulty,
                batchGuidance: provenance.spec.batchGuidance,
              }
            : {}),
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
      // Screening intentionally sees the untouched historical corpus so
      // withheld/rejected subjects remain detectable as duplicates. The
      // generator only receives context.exemplars (the APPROVED-only view).
      this.screen.beginBatch(context.historicalExemplars, context.mechanic);
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
            ...(provenance.spec ? { generationSpec: provenance.spec } : {}),
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
      if (
        error instanceof GenerationSpecValidationError ||
        (error instanceof CandidateParseError &&
          error.code === 'MECHANIC_NOT_GENERATABLE')
      ) {
        // This is a deterministic capability boundary, not a transient
        // provider failure. A queued job that bypassed preflight must fail
        // without retrying or reaching another paid attempt.
        await this.jobs.fail(job.jobId, job.leaseEpoch, error.message);
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
    const factState = facts?.state;
    const isFactStateEligible =
      factState === 'SUPPORTED' || factState === 'UNRESOLVED';
    return (
      row.status === 'screened_pass' &&
      isFactStateEligible &&
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
