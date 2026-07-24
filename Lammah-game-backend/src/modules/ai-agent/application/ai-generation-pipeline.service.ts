import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { CategoryGameplayConfig } from '../../categories/schemas/category.schema';
import type { CategoryGenerationProfile } from './category-generation-profile.registry';
import { GenerationPlannerService } from './generation-planner.service';
import { ResearchAgentService } from './research-agent.service';
import { QuestionWriterAgentService } from './question-writer-agent.service';
import { QuestionReviewAgentService } from './question-review-agent.service';
import { QuestionRepairAgentService } from './question-repair-agent.service';
import { DeterministicQuestionValidatorService } from './deterministic-question-validator.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import type {
  PipelineQuestionCandidate,
  PipelineSlotResult,
} from './ai-generation-pipeline.types';
import { KnowledgePackRegistry } from './knowledge-pack.registry';
import { LanguageValidatorService } from './language-validator.service';
import { QuestionSourceRouterService } from './question-source-router.service';
import { SourceCuratedQuestionValidatorService } from './source-curated-question-validator.service';
import type {
  CuratedQuestionCandidate,
  GenerationPlanSlot,
  SourceCandidatePipelineDiagnostic,
} from './ai-generation-pipeline.types';

@Injectable()
export class AiGenerationPipelineService {
  private readonly logger = new Logger(AiGenerationPipelineService.name);
  private readonly packs = new KnowledgePackRegistry();
  constructor(
    private readonly config: ConfigService,
    private readonly planner: GenerationPlannerService,
    private readonly research: ResearchAgentService,
    private readonly writer: QuestionWriterAgentService,
    private readonly reviewer: QuestionReviewAgentService,
    private readonly repairer: QuestionRepairAgentService,
    private readonly validator: DeterministicQuestionValidatorService,
    private readonly languageValidator: LanguageValidatorService,
    private readonly duplicates: DuplicateDetectionService,
    @Optional() private readonly sourceRouter?: QuestionSourceRouterService,
    @Optional()
    private readonly sourceValidator?: SourceCuratedQuestionValidatorService,
  ) {}

  async execute(input: {
    count: number;
    difficulty?: 'easy' | 'medium' | 'hard';
    categoryId?: string;
    catalogName?: string;
    categoryName: string;
    requestedLanguage?: 'ar';
    profile: CategoryGenerationProfile;
    gameplay?: CategoryGameplayConfig;
    knowledgeFile: string;
    knowledge: string;
    persisted: Array<{ question: string; correctAnswer?: string }>;
    sourceIds?: string[];
    strategy?: 'source-curated';
    allowGeneratedFallback?: boolean;
  }) {
    if (this.sourceRouter && this.sourceValidator)
      return this.executeSourceCurated(input);
    const generationRequestId = randomUUID();
    const slots = this.planner.plan({
      count: input.count,
      requestedDifficulty: input.difficulty,
      profile: input.profile,
      gameplay: input.gameplay,
      pack: this.packs.fromProfile(input.profile),
    });
    const concurrency = Math.max(
      1,
      Math.min(4, Number(this.config.get('AI_GENERATION_CONCURRENCY')) || 1),
    );
    this.duplicates.reset();
    const results: PipelineSlotResult[] = new Array(slots.length);
    let cursor = 0;
    const configuredBatchSize = Number(
      this.config.get('AI_GENERATION_BATCH_SIZE'),
    );
    const batchSize =
      Number.isInteger(configuredBatchSize) && configuredBatchSize > 0
        ? Math.min(24, configuredBatchSize)
        : 6;
    const batches: string[][] = [];
    for (let offset = 0; offset < slots.length; offset += batchSize) {
      const end = Math.min(offset + batchSize, slots.length);
      batches.push(slots.slice(offset, end).map((slot) => slot.slotId));
      cursor = offset;
      const batchWorker = async () => {
        while (cursor < end) {
          const index = cursor++;
          results[index] = await this.processSlot(
            slots[index],
            input,
            generationRequestId,
          );
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(concurrency, end - offset) },
          batchWorker,
        ),
      );
    }
    return {
      generationRequestId,
      slots,
      batches,
      results,
      candidateDiagnostics: [] as SourceCandidatePipelineDiagnostic[],
      drafts: results.flatMap((result) =>
        result.status === 'created' && result.draft ? [result.draft] : [],
      ),
    };
  }

  private async executeSourceCurated(
    input: Parameters<AiGenerationPipelineService['execute']>[0],
  ) {
    const generationRequestId = randomUUID();
    this.duplicates.reset();
    const collection = await this.sourceRouter!.collect({
      categoryId: input.categoryId,
      catalogName: input.catalogName,
      categoryName: input.categoryName,
      locale: input.requestedLanguage ?? 'ar',
      amount: Math.min(50, Math.max(input.count, input.count * 3)),
      difficulty: input.difficulty,
      sourceIds: input.sourceIds,
    });
    const slots = this.planner.planSourceCandidates({
      count: input.count,
      requestedDifficulty: input.difficulty,
      profile: input.profile,
      candidates: collection.candidates,
    });
    const candidateDiagnostics = new Map<
      string,
      SourceCandidatePipelineDiagnostic
    >(
      collection.candidates.map((candidate) => [
        candidate.fingerprint,
        {
          sourceId: candidate.sourceId,
          sourceQuestionId: candidate.sourceQuestionId,
          sourceQuestion: candidate.originalQuestion,
          sourceAnswer: candidate.originalCorrectAnswer,
          curatedQuestion: null,
          curatedAnswer: null,
          semanticFingerprint: candidate.fingerprint,
          duplicateScore: this.duplicates.scoreSource(
            null,
            candidate,
            input.persisted,
            collection.candidates,
          ),
          validationResult: {
            status: 'NOT_EVALUATED',
            issueCodes: [],
          },
          outcome: 'NOT_SELECTED',
          rejectionReason: 'NOT_SELECTED_FOR_REQUEST',
        },
      ]),
    );
    const batches = [slots.map((slot) => slot.slotId)];
    const results: PipelineSlotResult[] = [];
    for (const slot of slots)
      results.push(
        await this.processSourceSlot(
          slot,
          input,
          generationRequestId,
          collection,
          slot.sourceCandidate
            ? candidateDiagnostics.get(slot.sourceCandidate.fingerprint)
            : undefined,
        ),
      );
    for (const diagnostic of candidateDiagnostics.values())
      this.logger.log(
        JSON.stringify({
          event: 'source_candidate.pipeline_diagnostic',
          requestId: generationRequestId,
          categoryId: input.categoryId,
          ...diagnostic,
        }),
      );
    return {
      generationRequestId,
      slots,
      batches,
      results,
      sourceDiagnostics: collection.diagnostics,
      candidateDiagnostics: [...candidateDiagnostics.values()],
      sourceSummary: {
        requested: input.count,
        collected: collection.candidates.length,
        selected: slots.filter((slot) => Boolean(slot.sourceCandidate)).length,
        approved: results.filter((result) => result.status === 'created')
          .length,
        rejected: results.filter((result) => result.status === 'rejected')
          .length,
        failed: results.filter((result) => result.status === 'failed').length,
        notSelected: Math.max(
          0,
          collection.candidates.length -
            slots.filter((slot) => Boolean(slot.sourceCandidate)).length,
        ),
        returned: results.filter((result) => result.status === 'created')
          .length,
      },
      drafts: results.flatMap((result) =>
        result.status === 'created' && result.draft ? [result.draft] : [],
      ),
    };
  }

  private async processSourceSlot(
    slot: GenerationPlanSlot,
    input: Parameters<AiGenerationPipelineService['execute']>[0],
    requestId: string,
    collection: Awaited<ReturnType<QuestionSourceRouterService['collect']>>,
    sourceCandidateDiagnostic?: SourceCandidatePipelineDiagnostic,
  ): Promise<PipelineSlotResult> {
    const started = Date.now();
    const source = slot.sourceCandidate;
    if (!source)
      return {
        slotId: slot.slotId,
        status: 'failed',
        diagnostics: [
          { code: 'NO_SOURCE_CANDIDATE', stage: 'source' },
          ...collection.diagnostics.map((item) => ({
            ...item,
            stage: 'source',
          })),
        ],
        providersAttempted: collection.sourcesAttempted,
        providersUsed: collection.sourcesUsed,
        blockingIssues: ['NO_SOURCE_CANDIDATE'],
        canonicalFinalDecision: 'failed',
        totalTimingMs: Date.now() - started,
      };
    try {
      this.logger.log(
        JSON.stringify({
          event: 'source_candidate.curated',
          requestId,
          categoryId: input.categoryId,
          sourceId: source.sourceId,
          sourceQuestionId: source.sourceQuestionId,
          stage: 'curator',
          outcome: 'started',
        }),
      );
      const written = await this.writer.curate(
        source,
        slot,
        input.requestedLanguage ?? 'ar',
      );
      const candidate = written.value as CuratedQuestionCandidate;
      if (sourceCandidateDiagnostic) {
        sourceCandidateDiagnostic.curatedQuestion = candidate.question;
        sourceCandidateDiagnostic.curatedAnswer = candidate.answer;
        sourceCandidateDiagnostic.duplicateScore = this.duplicates.scoreSource(
          candidate,
          source,
          input.persisted,
          collection.candidates,
        );
      }
      const validation = this.sourceValidator!.validate(
        candidate,
        source,
        slot,
      );
      const diagnostics = [...validation];
      if (sourceCandidateDiagnostic) {
        sourceCandidateDiagnostic.validationResult = {
          status: diagnostics.length ? 'FAIL' : 'PASS',
          issueCodes: diagnostics.map((item) => item.code),
        };
      }
      if (diagnostics.length) {
        if (sourceCandidateDiagnostic) {
          sourceCandidateDiagnostic.outcome = 'REJECTED';
          sourceCandidateDiagnostic.rejectionReason = diagnostics.length
            ? diagnostics.map((item) => item.code).join(',')
            : 'SOURCE_CURATION_REJECTED';
        }
        return {
          slotId: slot.slotId,
          status: 'rejected',
          diagnostics,
          candidateSource: source.sourceId,
          providersAttempted: collection.sourcesAttempted,
          providersUsed: collection.sourcesUsed,
          blockingIssues: diagnostics.map((item) => item.code),
          repairAttempts: 0,
          canonicalFinalDecision: 'rejected',
          totalTimingMs: Date.now() - started,
          requestedLanguage: input.requestedLanguage ?? 'ar',
          languageRepairAttempted: false,
          languageRepairSucceeded: false,
          languageIssueCodes: diagnostics
            .map((item) => item.code)
            .filter((code) => code === 'OUTPUT_LANGUAGE_MISMATCH'),
        };
      }
      const duplicateCodes = this.duplicates.checkSource(
        candidate,
        source,
        input.persisted,
      );
      if (duplicateCodes.length) {
        if (sourceCandidateDiagnostic) {
          sourceCandidateDiagnostic.validationResult = {
            status: 'FAIL',
            issueCodes: duplicateCodes,
          };
          sourceCandidateDiagnostic.outcome = 'REJECTED';
          sourceCandidateDiagnostic.rejectionReason = duplicateCodes.join(',');
        }
        return {
          slotId: slot.slotId,
          status: 'rejected',
          diagnostics: duplicateCodes.map((code) => ({
            code,
            stage: 'duplicate',
          })),
          blockingIssues: duplicateCodes,
          canonicalFinalDecision: 'rejected',
          totalTimingMs: Date.now() - started,
        };
      }
      const draft = {
        ...candidate,
        // Required by the compatible reviewed-draft contract; SOURCE_CURATED
        // does not gate approval on this value in the MVP.
        qualityScore: 10,
        issues: [],
        aiMetadata: {
          pipelineVersion: '4.0',
          strategy: 'SOURCE_CURATED',
          generationRequestId: requestId,
          slotId: slot.slotId,
          provider: written.provider,
          models: { curator: written.model },
          source: {
            sourceId: source.sourceId,
            sourceQuestionId: source.sourceQuestionId,
            sourceUrl: source.sourceUrl,
            sourceCategory: source.sourceCategory,
            originalType: source.originalType,
            originalDifficulty: source.originalDifficulty,
            sourceLicense: source.sourceLicense,
            fetchedAt: source.fetchedAt,
            originalQuestion: source.originalQuestion,
            originalCorrectAnswer: source.originalCorrectAnswer,
            fingerprint: source.fingerprint,
          },
          curation: {
            status: 'ACCEPT',
            translationNotes: candidate.translationNotes,
            humanReviewRequired: true,
          },
          blockingIssues: [],
          warnings: [],
          qualityScoreApplied: false,
          finalStage: 'deterministic-validation-passed',
          canonicalFinalDecision: 'created',
          requestedLanguage: input.requestedLanguage ?? 'ar',
          languageRepairAttempted: false,
          languageRepairSucceeded: false,
          languageIssueCodes: [],
        },
      };
      if (sourceCandidateDiagnostic) {
        sourceCandidateDiagnostic.validationResult = {
          status: 'PASS',
          issueCodes: [],
        };
        sourceCandidateDiagnostic.outcome = 'CREATED';
        sourceCandidateDiagnostic.rejectionReason = null;
      }
      return {
        slotId: slot.slotId,
        status: 'created',
        draft,
        diagnostics: [],
        candidateSource: source.sourceId,
        providersAttempted: collection.sourcesAttempted,
        providersUsed: collection.sourcesUsed,
        acceptedEvidenceCount: 1,
        blockingIssues: [],
        warnings: [],
        repairAttempts: 0,
        canonicalFinalDecision: 'created',
        totalTimingMs: Date.now() - started,
        requestedLanguage: input.requestedLanguage ?? 'ar',
        languageRepairAttempted: false,
        languageRepairSucceeded: false,
        languageIssueCodes: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (sourceCandidateDiagnostic) {
        sourceCandidateDiagnostic.validationResult = {
          status: 'FAIL',
          issueCodes: ['SOURCE_CURATOR_FAILED'],
        };
        sourceCandidateDiagnostic.outcome = 'FAILED';
        sourceCandidateDiagnostic.rejectionReason = `SOURCE_CURATOR_FAILED: ${message}`;
      }
      return {
        slotId: slot.slotId,
        status: 'failed',
        diagnostics: [
          { code: 'SOURCE_CURATOR_FAILED', stage: 'curation', message },
        ],
        candidateSource: source.sourceId,
        blockingIssues: ['SOURCE_CURATOR_FAILED'],
        canonicalFinalDecision: 'failed',
        totalTimingMs: Date.now() - started,
      };
    }
  }

  private async processSlot(
    slot: ReturnType<GenerationPlannerService['plan']>[number],
    input: Parameters<AiGenerationPipelineService['execute']>[0],
    requestId: string,
  ): Promise<PipelineSlotResult> {
    const configuredRetries = Number(
      this.config.get('AI_DUPLICATE_RETRY_ATTEMPTS'),
    );
    const maxDuplicateRetries = Number.isFinite(configuredRetries)
      ? Math.max(0, Math.min(5, configuredRetries))
      : 2;
    let result: PipelineSlotResult;
    for (let noveltyAttempt = 0; ; noveltyAttempt += 1) {
      result = await this.attemptSlot(
        slot,
        { ...input, noveltyAttempt },
        requestId,
      );
      const retryable = result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code.startsWith('DUPLICATE_') ||
          diagnostic.message === 'RESEARCH_SOURCE_EXCERPT_MISMATCH',
      );
      if (!retryable || noveltyAttempt >= maxDuplicateRetries) return result;
    }
  }

  private async attemptSlot(
    slot: ReturnType<GenerationPlannerService['plan']>[number],
    input: Parameters<AiGenerationPipelineService['execute']>[0] & {
      noveltyAttempt: number;
    },
    requestId: string,
  ): Promise<PipelineSlotResult> {
    const started = Date.now();
    const log = (stage: string, outcome: string) =>
      this.logger.log(
        JSON.stringify({
          generationRequestId: requestId,
          slotId: slot.slotId,
          categoryId: input.categoryId,
          stage,
          durationMs: Date.now() - started,
          outcome,
        }),
      );
    try {
      const curatedFacts = this.curatedFactBank(input.knowledge);
      const slotIndex = Math.max(
        0,
        Number(slot.slotId.replace(/^slot-/, '')) - 1,
      );
      const preferredExcerpt = curatedFacts.length
        ? curatedFacts[
            (slotIndex + input.noveltyAttempt * input.count) %
              curatedFacts.length
          ]
        : undefined;
      const researched = await this.research.research({
        slot,
        categoryName: input.categoryName,
        knowledgeTitle: input.knowledgeFile,
        knowledge: input.knowledge,
        preferredExcerpt,
        profile: input.profile,
        instructions: [
          ...(input.profile.promptFragments?.guidance
            ? [input.profile.promptFragments.guidance]
            : []),
          `Novelty attempt ${input.noveltyAttempt + 1}. Select a fact whose canonical answer is not in this excluded-answer list: ${JSON.stringify(
            input.persisted
              .slice(-50)
              .map((item) => item.correctAnswer)
              .filter(Boolean),
          )}. Copy excerpt verbatim from the source. Diversity seed: ${randomUUID()}`,
        ],
      });
      log('research', 'completed');
      const written = await this.writer.write(
        researched.fact,
        slot,
        input.profile,
        input.requestedLanguage ?? 'ar',
      );
      log('writer', 'completed');
      let candidate = written.value;
      let validation = this.validator.validate(
        candidate,
        researched.fact,
        slot,
        input.profile,
      );
      const requestedLanguage = input.requestedLanguage ?? 'ar';
      let language = this.languageValidator.validate(
        candidate,
        researched.fact,
        requestedLanguage,
      );
      let languageRepairAttempted = false;
      let languageRepairSucceeded = language.status === 'PASS';
      if (language.status !== 'PASS' && validation.length === 0) {
        languageRepairAttempted = true;
        candidate = (
          await this.repairer.repair(
            researched.fact,
            candidate,
            language.issueCodes,
            { requestedLanguage, languageOnly: true },
          )
        ).value;
        validation = this.validator.validate(
          candidate,
          researched.fact,
          slot,
          input.profile,
        );
        language = this.languageValidator.validate(
          candidate,
          researched.fact,
          requestedLanguage,
        );
        languageRepairSucceeded = language.status === 'PASS';
      }
      let review = (
        await this.reviewer.review(
          researched.fact,
          candidate,
          requestedLanguage,
        )
      ).value;
      log('review', review.verdict);
      let repairAttempts = 0;
      const maxRepairs = Math.max(
        0,
        Math.min(2, Number(this.config.get('AI_MAX_REPAIR_ATTEMPTS')) || 2),
      );
      while (
        (review.verdict === 'repairable' || validation.length > 0) &&
        repairAttempts < maxRepairs
      ) {
        repairAttempts += 1;
        const codes = [
          ...review.issues.map((issue) => issue.code),
          ...validation.map((issue) => issue.code),
        ];
        candidate = (
          await this.repairer.repair(researched.fact, candidate, codes)
        ).value;
        review = (
          await this.reviewer.review(
            researched.fact,
            candidate,
            requestedLanguage,
          )
        ).value;
        validation = this.validator.validate(
          candidate,
          researched.fact,
          slot,
          input.profile,
        );
        language = this.languageValidator.validate(
          candidate,
          researched.fact,
          requestedLanguage,
        );
      }
      const minimumQualityScore = 7;
      if (
        review.verdict !== 'approved' ||
        review.score < minimumQualityScore ||
        validation.length ||
        language.status !== 'PASS'
      ) {
        const diagnostics = [
          ...review.issues.map((issue) => ({ ...issue, stage: 'review' })),
          ...validation,
          ...language.issueCodes.map((code) => ({
            code,
            stage: 'language',
          })),
          ...(review.score < minimumQualityScore
            ? [
                {
                  code: 'QUALITY_SCORE_BELOW_THRESHOLD',
                  stage: 'review',
                  message: `Reviewer score ${review.score} is below ${minimumQualityScore}`,
                },
              ]
            : []),
        ];
        log(
          'rejected',
          diagnostics.map((diagnostic) => diagnostic.code).join(','),
        );
        return {
          slotId: slot.slotId,
          status: 'rejected',
          diagnostics,
          topicIntent: slot.topicIntent,
          entityCandidate: slot.entityCandidate,
          candidateSource: slot.candidateSource,
          blockingIssues: diagnostics.map((item) => item.code),
          warnings: [],
          reviewerScore: review.score,
          repairAttempts,
          canonicalFinalDecision: 'rejected',
          totalTimingMs: Date.now() - started,
          requestedLanguage,
          detectedLanguage: language.detectedLanguage,
          arabicCharacterRatio: language.arabicCharacterRatio,
          foreignCharacterRatio: language.foreignCharacterRatio,
          allowedProperNameRatio: language.allowedProperNameRatio,
          languageRepairAttempted,
          languageRepairSucceeded,
          languageIssueCodes: language.issueCodes,
        };
      }
      const duplicateCodes = this.duplicates.check(
        candidate,
        researched.fact,
        input.persisted,
      );
      if (duplicateCodes.length) {
        log('duplicate', duplicateCodes.join(','));
        return {
          slotId: slot.slotId,
          status: 'rejected',
          diagnostics: duplicateCodes.map((code) => ({
            code,
            stage: 'duplicate',
          })),
        };
      }
      const draft: PipelineQuestionCandidate & {
        aiMetadata: Record<string, unknown>;
      } = {
        ...candidate,
        qualityScore: review.score,
        issues: [],
        aiMetadata: {
          pipelineVersion: '3.0',
          generationRequestId: requestId,
          slotId: slot.slotId,
          provider: written.provider,
          models: { research: researched.model, writer: written.model },
          source: researched.fact.source,
          factId: researched.fact.id,
          sourceIds: candidate.sourceIds,
          review: {
            score: review.score,
            verdict: review.verdict,
            issueCodes: review.issues.map((issue) => issue.code),
          },
          validationIssueCodes: [],
          blockingIssues: [],
          warnings: [],
          qualityScore: review.score,
          verificationStatus: 'verified-by-research-evidence',
          repairAttempts,
          finalStage: 'approved',
          canonicalFinalDecision: 'created',
          topicIntent: slot.topicIntent,
          entityCandidate: slot.entityCandidate,
          candidateSource: slot.candidateSource,
          candidateAliasUsed: slot.candidateAliasUsed,
          requestedLanguage,
          detectedLanguage: language.detectedLanguage,
          arabicCharacterRatio: language.arabicCharacterRatio,
          foreignCharacterRatio: language.foreignCharacterRatio,
          allowedProperNameRatio: language.allowedProperNameRatio,
          languageRepairAttempted,
          languageRepairSucceeded,
          languageIssueCodes: language.issueCodes,
        },
      };
      log('complete', 'created');
      return {
        slotId: slot.slotId,
        status: 'created',
        draft,
        diagnostics: [],
        topicIntent: slot.topicIntent,
        entityCandidate: slot.entityCandidate,
        candidateSource: slot.candidateSource,
        providersUsed: [researched.provider],
        acceptedEvidenceCount: researched.fact.sources?.length ?? 1,
        blockingIssues: [],
        warnings: [],
        reviewerScore: review.score,
        repairAttempts,
        canonicalFinalDecision: 'created',
        totalTimingMs: Date.now() - started,
        requestedLanguage,
        detectedLanguage: language.detectedLanguage,
        arabicCharacterRatio: language.arabicCharacterRatio,
        foreignCharacterRatio: language.foreignCharacterRatio,
        allowedProperNameRatio: language.allowedProperNameRatio,
        languageRepairAttempted,
        languageRepairSucceeded,
        languageIssueCodes: language.issueCodes,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('failed', message);
      return {
        slotId: slot.slotId,
        status: 'failed',
        diagnostics: [
          { code: 'PIPELINE_SLOT_FAILED', stage: 'pipeline', message },
        ],
        topicIntent: slot.topicIntent,
        entityCandidate: slot.entityCandidate,
        candidateSource: slot.candidateSource,
        blockingIssues: ['PIPELINE_SLOT_FAILED'],
        warnings: [],
        canonicalFinalDecision: 'failed',
        totalTimingMs: Date.now() - started,
      };
    }
  }

  private curatedFactBank(knowledge: string): string[] {
    const section = knowledge.split(/^# Curated Fact Bank\s*$/m)[1];
    if (!section) return [];
    return section
      .split(/^---\s*$/m)[0]
      .split('\n')
      .map((line) => line.match(/^\s*-\s+(.+?)\s*$/)?.[1]?.trim())
      .filter((line): line is string => Boolean(line));
  }
}
