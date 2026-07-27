import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { CategoryGameplayConfig } from '../../categories/schemas/category.schema';
import type { CategoryGenerationProfile } from './category-generation-profile.registry';
import { GenerationPlannerService } from './generation-planner.service';
import { ResearchAgentService } from './research-agent.service';
import { QuestionWriterAgentService } from './question-writer-agent.service';
import type { BatchedStandardQuestion } from './question-writer-agent.service';
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
    const sourceRequired = this.planner.isSourceRequired(input.profile, 'text');
    const plannedSlots = this.planner.planSourceCandidates({
      count: input.count,
      requestedDifficulty: input.difficulty,
      profile: input.profile,
      candidates: collection.candidates,
      sourceRequired,
    });
    const canBatchStandard =
      plannedSlots.length > 1 &&
      plannedSlots.every(
        (slot) =>
          !slot.sourceRequired &&
          slot.gameMode === plannedSlots[0].gameMode &&
          slot.requestedAssetType === plannedSlots[0].requestedAssetType &&
          slot.difficulty === plannedSlots[0].difficulty,
      ) &&
      plannedSlots[0].gameMode === 'trivia' &&
      (plannedSlots[0].requestedAssetType ?? 'text') === 'text';
    // Optional research candidates do not make otherwise-identical text slots
    // heterogeneous. The batch writer may proceed without them.
    const slots = canBatchStandard
      ? plannedSlots.map((slot) => ({
          ...slot,
          sourceCandidate: undefined,
        }))
      : plannedSlots;
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
    let batch:
      | Awaited<ReturnType<QuestionWriterAgentService['generateStandardBatch']>>
      | undefined;
    let batchError: unknown;
    if (canBatchStandard) {
      try {
        this.logger.log(
          JSON.stringify({
            event: 'generation.batch_started',
            requestId: generationRequestId,
            slotCount: slots.length,
            llmRequestCount: 1,
          }),
        );
        batch = await this.writer.generateStandardBatch({
          categoryName: input.categoryName,
          catalogName: input.catalogName,
          slots,
          profile: input.profile,
          requestedLanguage: input.requestedLanguage ?? 'ar',
          excludedQuestions: input.persisted.map((item) => item.question),
        });
        this.logger.log(
          JSON.stringify({
            event: 'generation.batch_completed',
            requestId: generationRequestId,
            slotCount: slots.length,
            llmRequestCount: 1,
            provider: batch.provider,
            model: batch.model,
            promptLength: batch.promptLength,
            diagnostics: batch.diagnostics,
          }),
        );
      } catch (error) {
        batchError = error;
      }
    }
    for (const slot of slots) {
      if (canBatchStandard) {
        const prepared = batch?.value.find(
          (item) => item.slotId === slot.slotId,
        );
        results.push(
          await this.processOptionalSourceSlot(
            slot,
            input,
            generationRequestId,
            collection,
            'not_required',
            prepared && batch
              ? {
                  item: prepared,
                  provider: batch.provider,
                  model: batch.model,
                  diagnostics: batch.diagnostics,
                  promptLength: batch.promptLength,
                }
              : undefined,
            batchError,
          ),
        );
        continue;
      }
      if (slot.sourceCandidate) {
        const sourceResult = await this.processSourceSlot(
          slot,
          input,
          generationRequestId,
          collection,
          candidateDiagnostics.get(slot.sourceCandidate.fingerprint),
        );
        if (sourceResult.status === 'created' || slot.sourceRequired)
          results.push(sourceResult);
        else
          results.push(
            await this.processOptionalSourceSlot(
              slot,
              input,
              generationRequestId,
              collection,
              sourceResult.status === 'failed'
                ? 'optional_curator_unavailable'
                : 'optional_sources_exhausted',
            ),
          );
      } else if (slot.sourceRequired)
        results.push(
          await this.processSourceSlot(
            slot,
            input,
            generationRequestId,
            collection,
          ),
        );
      else
        results.push(
          await this.processOptionalSourceSlot(
            slot,
            input,
            generationRequestId,
            collection,
          ),
        );
    }
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
        approved: [...candidateDiagnostics.values()].filter(
          (diagnostic) => diagnostic.outcome === 'CREATED',
        ).length,
        rejected: [...candidateDiagnostics.values()].filter(
          (diagnostic) => diagnostic.outcome === 'REJECTED',
        ).length,
        failed: results.filter((result) => result.status === 'failed').length,
        curatorFailed: [...candidateDiagnostics.values()].filter(
          (diagnostic) => diagnostic.outcome === 'FAILED',
        ).length,
        curatorRejected: [...candidateDiagnostics.values()].filter(
          (diagnostic) => diagnostic.outcome === 'REJECTED',
        ).length,
        sourceFallbackUsed: results.filter((result) =>
          [
            'optional_curator_unavailable',
            'optional_sources_exhausted',
          ].includes(result.sourceStatus ?? ''),
        ).length,
        generationFailed: results.filter((result) => result.status === 'failed')
          .length,
        generationRejected: results.filter(
          (result) => result.status === 'rejected',
        ).length,
        notSelected: Math.max(
          0,
          collection.candidates.length -
            slots.filter((slot) => Boolean(slot.sourceCandidate)).length,
        ),
        returned: results.filter((result) => result.status === 'created')
          .length,
        sourceRequired,
        optionalSourceUnavailable: results.filter(
          (result) => result.sourceStatus === 'unavailable_optional',
        ).length,
        requiredSourceMissing: results.filter(
          (result) => result.sourceStatus === 'required_missing',
        ).length,
      },
      llmBatch: canBatchStandard
        ? {
            enabled: true,
            requestCount: 1,
            slotCount: slots.length,
            provider: batch?.provider ?? null,
            model: batch?.model ?? null,
            tokenUsage: batch?.diagnostics?.usage ?? null,
          }
        : {
            enabled: false,
            requestCount: results.length,
            slotCount: slots.length,
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
        sourceStatus: 'required_missing',
      };
    if (sourceCandidateDiagnostic)
      sourceCandidateDiagnostic.curator = {
        sourceId: source.sourceId,
        sourceQuestionId: source.sourceQuestionId,
        slotId: slot.slotId,
        category: source.sourceCategory,
        requestedDifficulty: slot.difficulty,
        stageEntered: true,
        implementation: 'QuestionWriterAgentService.curate',
        callsLlm: true,
        provider: null,
        model: null,
        inputShapeKeys: [
          'sourceQuestion',
          'sourceAnswer',
          'sourceType',
          'sourceCategory',
          'requestedLanguage',
        ],
        outputTextLength: null,
        parseStatus: 'not_started',
        schemaValidationStatus: 'not_started',
        errorCode: null,
        errorMessage: null,
        finalStatus: 'failed',
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
        Object.assign(sourceCandidateDiagnostic.curator!, {
          provider: written.provider,
          model: written.model,
          outputTextLength:
            typeof written.diagnostics?.textLength === 'number'
              ? written.diagnostics.textLength
              : null,
          parseStatus: 'succeeded',
          schemaValidationStatus: 'succeeded',
        });
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
          sourceCandidateDiagnostic.curator!.finalStatus = 'rejected';
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
          sourceCandidateDiagnostic.curator!.finalStatus = 'rejected';
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
        sourceCandidateDiagnostic.curator!.finalStatus = 'approved';
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
        sourceStatus: 'used',
      };
    } catch (error) {
      const described = this.describeError(error);
      const message = described.message;
      if (sourceCandidateDiagnostic) {
        Object.assign(sourceCandidateDiagnostic.curator!, {
          provider:
            typeof described.provider === 'string' ? described.provider : null,
          model: typeof described.model === 'string' ? described.model : null,
          parseStatus:
            described.stage === 'structured-parse' ? 'failed' : 'not_started',
          schemaValidationStatus:
            described.stage === 'structured-parse' ||
            described.stage === 'response-content'
              ? 'failed'
              : 'not_started',
          errorCode: described.code,
          errorMessage: described.message,
          finalStatus: 'failed',
        });
        sourceCandidateDiagnostic.validationResult = {
          status: 'FAIL',
          issueCodes: [
            'SOURCE_CURATOR_FAILED',
            ...(described.code ? [described.code] : []),
          ],
        };
        sourceCandidateDiagnostic.outcome = 'FAILED';
        sourceCandidateDiagnostic.rejectionReason = `SOURCE_CURATOR_FAILED: ${message}`;
      }
      return {
        slotId: slot.slotId,
        status: 'failed',
        diagnostics: [
          {
            code: described.code ?? 'SOURCE_CURATOR_FAILED',
            stage: described.stage,
            message,
            details: described,
          },
        ],
        candidateSource: source.sourceId,
        blockingIssues: [described.code ?? 'SOURCE_CURATOR_FAILED'],
        canonicalFinalDecision: 'failed',
        totalTimingMs: Date.now() - started,
      };
    }
  }

  private async processOptionalSourceSlot(
    slot: GenerationPlanSlot,
    input: Parameters<AiGenerationPipelineService['execute']>[0],
    requestId: string,
    collection: Awaited<ReturnType<QuestionSourceRouterService['collect']>>,
    fallbackSourceStatus?:
      | 'not_required'
      | 'optional_curator_unavailable'
      | 'optional_sources_exhausted',
    batched?: {
      item: BatchedStandardQuestion;
      provider: string;
      model: string;
      diagnostics?: Record<string, unknown>;
      promptLength: number;
    },
    batchError?: unknown,
  ): Promise<PipelineSlotResult> {
    const started = Date.now();
    const requestedLanguage = input.requestedLanguage ?? 'ar';
    const trace: NonNullable<PipelineSlotResult['trace']> = [];
    const record = (
      stage: string,
      event: string,
      details?: Record<string, unknown>,
    ) => {
      const entry = {
        stage,
        event,
        timestamp: new Date().toISOString(),
        ...(details ? { details } : {}),
      };
      trace.push(entry);
      this.logger.log(
        JSON.stringify({
          logEvent: 'optional_generation.trace',
          requestId,
          slotId: slot.slotId,
          ...entry,
        }),
      );
    };
    record('planner', 'started');
    record('planner', 'finished', {
      difficulty: slot.difficulty,
      gameMode: slot.gameMode,
      requestedAssetType: slot.requestedAssetType,
      sourceRequired: slot.sourceRequired ?? false,
    });
    record('source', 'entered');
    const sourceStatus =
      fallbackSourceStatus ??
      (collection.sourcesAttempted.length
        ? ('unavailable_optional' as const)
        : collection.diagnostics.some(
              (item) => item.code === 'SOURCE_CATEGORY_UNSUPPORTED',
            )
          ? ('unavailable_optional' as const)
          : ('not_required' as const));
    const optionalDiagnostic = {
      code:
        sourceStatus === 'not_required'
          ? 'SOURCE_NOT_REQUIRED'
          : sourceStatus === 'optional_curator_unavailable'
            ? 'OPTIONAL_SOURCE_CURATOR_UNAVAILABLE'
            : sourceStatus === 'optional_sources_exhausted'
              ? 'OPTIONAL_SOURCES_EXHAUSTED'
              : 'OPTIONAL_SOURCE_UNAVAILABLE',
      stage: 'source-policy',
    };
    record('source', 'skipped_optional', { sourceStatus });
    record('source', 'result', {
      sourceStatus,
      candidates: collection.candidates.length,
      sourcesAttempted: collection.sourcesAttempted,
      diagnosticCodes: collection.diagnostics.map((item) => item.code),
    });
    const languageFact = (candidate: PipelineQuestionCandidate) => ({
      id: 'optional-source',
      fact: candidate.explanation,
      canonicalAnswer: candidate.answer,
      acceptedAnswerHints: candidate.acceptedAnswers,
      entities: [candidate.answer],
      source: {
        title: 'Optional source unavailable',
        url: 'internal://optional-source',
        excerpt: candidate.explanation,
      },
      confidence: 0,
    });
    try {
      const writerInput = {
        categoryName: input.categoryName,
        catalogName: input.catalogName,
        slot,
        profile: input.profile,
        requestedLanguage,
        excludedQuestions: input.persisted.map((item) => item.question),
        noveltyAttempt: 0,
      };
      const promptLength =
        batched?.promptLength ?? this.writer.standardPromptLength(writerInput);
      record('writer', 'entered', {
        promptLength,
        mode: batched || batchError ? 'batch' : 'single',
      });
      record(
        'gemini',
        batched || batchError ? 'batch_request_reused' : 'request_started',
        {
          provider: this.config.get('AI_PROVIDER') ?? null,
          model: this.config.get('GEMINI_MODEL') ?? null,
          promptLength,
          sharedBatchRequest: Boolean(batched || batchError),
        },
      );
      if (batchError) throw batchError;
      const written = batched
        ? {
            value: batched.item.candidate,
            provider: batched.provider,
            model: batched.model,
            diagnostics: batched.diagnostics,
            promptLength: batched.promptLength,
          }
        : await this.writer.generateStandard(writerInput);
      record('writer', 'completed', {
        promptLength: written.promptLength,
        provider: written.provider,
        model: written.model,
      });
      record('gemini', 'request_completed', written.diagnostics);
      record('json-parse', 'started');
      record('json-parse', 'succeeded');
      record('schema-validation', 'succeeded');
      let candidate = written.value;
      let validation = this.validator.validateGenerated(
        candidate,
        slot,
        input.profile,
      );
      let language = this.languageValidator.validate(
        candidate,
        languageFact(candidate),
        requestedLanguage,
      );
      record('reviewer', 'entered');
      let review =
        batched?.item.review ??
        (
          await this.reviewer.reviewGenerated(
            {
              categoryName: input.categoryName,
              difficulty: slot.difficulty,
            },
            candidate,
            requestedLanguage,
          )
        ).value;
      let repairAttempts = 0;
      const maxRepairs = Math.max(
        0,
        Math.min(2, Number(this.config.get('AI_MAX_REPAIR_ATTEMPTS')) || 2),
      );
      while (
        (review.verdict === 'repairable' ||
          validation.length > 0 ||
          language.status !== 'PASS') &&
        repairAttempts < maxRepairs
      ) {
        repairAttempts += 1;
        record('repair', 'entered', { attempt: repairAttempts });
        candidate = (
          await this.repairer.repairGenerated(
            {
              categoryName: input.categoryName,
              difficulty: slot.difficulty,
            },
            candidate,
            [
              ...review.issues.map((issue) => issue.code),
              ...validation.map((issue) => issue.code),
              ...language.issueCodes,
            ],
            requestedLanguage,
          )
        ).value;
        validation = this.validator.validateGenerated(
          candidate,
          slot,
          input.profile,
        );
        language = this.languageValidator.validate(
          candidate,
          languageFact(candidate),
          requestedLanguage,
        );
        record('reviewer', 'entered', { afterRepair: repairAttempts });
        review = (
          await this.reviewer.reviewGenerated(
            {
              categoryName: input.categoryName,
              difficulty: slot.difficulty,
            },
            candidate,
            requestedLanguage,
          )
        ).value;
      }
      const minimumQualityScore = 7;
      const diagnostics = [
        ...validation,
        ...language.issueCodes.map((code) => ({
          code,
          stage: 'language',
        })),
        ...review.issues.map((issue) => ({ ...issue, stage: 'review' })),
        ...(review.score < minimumQualityScore
          ? [
              {
                code: 'QUALITY_SCORE_BELOW_THRESHOLD',
                stage: 'review',
              },
            ]
          : []),
      ];
      if (
        review.verdict !== 'approved' ||
        review.score < minimumQualityScore ||
        validation.length ||
        language.status !== 'PASS'
      ) {
        record('slot', 'final_result', {
          status: 'rejected',
          blockingIssues: diagnostics.map((item) => item.code),
        });
        return {
          slotId: slot.slotId,
          status: 'rejected',
          diagnostics: [optionalDiagnostic, ...diagnostics],
          blockingIssues: diagnostics.map((item) => item.code),
          reviewerScore: review.score,
          repairAttempts,
          canonicalFinalDecision: 'rejected',
          totalTimingMs: Date.now() - started,
          sourceStatus,
          trace,
        };
      }
      record('duplicate-detector', 'entered');
      const duplicateCodes = this.duplicates.checkGenerated(
        candidate,
        input.persisted,
      );
      if (duplicateCodes.length) {
        record('slot', 'final_result', {
          status: 'rejected',
          blockingIssues: duplicateCodes,
        });
        return {
          slotId: slot.slotId,
          status: 'rejected',
          diagnostics: [
            optionalDiagnostic,
            ...duplicateCodes.map((code) => ({
              code,
              stage: 'duplicate',
            })),
          ],
          blockingIssues: duplicateCodes,
          reviewerScore: review.score,
          repairAttempts,
          canonicalFinalDecision: 'rejected',
          totalTimingMs: Date.now() - started,
          sourceStatus,
          trace,
        };
      }
      record('slot', 'final_result', { status: 'created' });
      return {
        slotId: slot.slotId,
        status: 'created',
        draft: {
          ...candidate,
          qualityScore: review.score,
          issues: [],
          aiMetadata: {
            pipelineVersion: '4.1',
            generationRequestId: requestId,
            slotId: slot.slotId,
            provider: written.provider,
            models: {
              writer: written.model,
              reviewer: 'provider-review',
            },
            sourceStatus,
            sourceRequired: false,
            batching: {
              enabled: Boolean(batched),
              sharedRequest: Boolean(batched),
            },
            verificationStatus: 'model-reviewed-no-external-source',
            review: {
              score: review.score,
              verdict: review.verdict,
              issueCodes: [],
            },
            validationIssueCodes: [],
            repairAttempts,
            finalStage: 'approved',
            canonicalFinalDecision: 'created',
          },
        },
        diagnostics: [optionalDiagnostic],
        blockingIssues: [],
        warnings: [optionalDiagnostic.code],
        reviewerScore: review.score,
        repairAttempts,
        canonicalFinalDecision: 'created',
        totalTimingMs: Date.now() - started,
        requestedLanguage,
        detectedLanguage: language.detectedLanguage,
        languageIssueCodes: [],
        sourceStatus,
        trace,
      };
    } catch (error) {
      const providerError = this.describeError(error);
      record('slot', 'final_result', {
        status: 'failed',
        error: providerError,
      });
      this.logger.error(
        JSON.stringify({
          event: 'optional_generation.provider_error',
          requestId,
          slotId: slot.slotId,
          ...providerError,
        }),
      );
      return {
        slotId: slot.slotId,
        status: 'failed',
        diagnostics: [
          optionalDiagnostic,
          {
            code: providerError.code ?? 'OPTIONAL_GENERATION_FAILED',
            stage: providerError.stage ?? 'pipeline',
            message: providerError.message,
            details: providerError,
          },
        ],
        blockingIssues: [providerError.code ?? 'OPTIONAL_GENERATION_FAILED'],
        canonicalFinalDecision: 'failed',
        totalTimingMs: Date.now() - started,
        sourceStatus,
        trace,
      };
    }
  }

  private describeError(error: unknown): {
    errorType: string;
    code: string | null;
    message: string;
    stage: string;
    provider: unknown;
    model: unknown;
    providerDetails: unknown;
    stack: string | null;
  } {
    const value =
      error && typeof error === 'object'
        ? (error as {
            name?: unknown;
            code?: unknown;
            message?: unknown;
            stack?: unknown;
            diagnostics?: unknown;
            cause?: unknown;
          })
        : {};
    const diagnostics =
      value.diagnostics && typeof value.diagnostics === 'object'
        ? (value.diagnostics as Record<string, unknown>)
        : {};
    const cause =
      value.cause && typeof value.cause === 'object'
        ? (value.cause as {
            name?: unknown;
            code?: unknown;
            message?: unknown;
            stack?: unknown;
            details?: unknown;
          })
        : {};
    return {
      errorType: String(value.name ?? cause.name ?? typeof error),
      code:
        typeof diagnostics.errorType === 'string' &&
        diagnostics.errorType.startsWith('AI_PROVIDER_')
          ? diagnostics.errorType
          : typeof value.code === 'string'
            ? value.code
            : typeof cause.code === 'string'
              ? cause.code
              : typeof diagnostics.errorType === 'string'
                ? diagnostics.errorType
                : null,
      message:
        typeof value.message === 'string'
          ? value.message
          : typeof cause.message === 'string'
            ? cause.message
            : String(error),
      stage:
        typeof diagnostics.stage === 'string' ? diagnostics.stage : 'pipeline',
      provider: diagnostics.provider ?? null,
      model: diagnostics.model ?? null,
      providerDetails:
        diagnostics.providerDetails ??
        (cause.details && typeof cause.details === 'object'
          ? cause.details
          : null),
      stack:
        typeof value.stack === 'string'
          ? value.stack.slice(0, 8_000)
          : typeof cause.stack === 'string'
            ? cause.stack.slice(0, 8_000)
            : null,
    };
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
