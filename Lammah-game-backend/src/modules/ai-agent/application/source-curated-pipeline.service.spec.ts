import type { ConfigService } from '@nestjs/config';
import { AiGenerationPipelineService } from './ai-generation-pipeline.service';
import { GenerationPlannerService } from './generation-planner.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { LanguageValidatorService } from './language-validator.service';
import { SourceQuestionNormalizerService } from './source-question-normalizer.service';
import { SourceCuratedQuestionValidatorService } from './source-curated-question-validator.service';
import { categoryProfileRegistry } from './category-generation-profile.registry';
import { DeterministicQuestionValidatorService } from './deterministic-question-validator.service';

describe('source-curated pipeline', () => {
  const normalizer = new SourceQuestionNormalizerService();
  const source = normalizer.normalize({
    sourceId: 'open-trivia-db',
    sourceUrl: 'https://opentdb.com/api.php',
    sourceCategory: 'Sports',
    question: 'Which player won the award?',
    correctAnswer: 'Lionel Messi',
    incorrectAnswers: ['Player A', 'Player B', 'Player C'],
    type: 'multiple',
    difficulty: 'easy',
  })!;
  const unselectedSource = normalizer.normalize({
    sourceId: 'open-trivia-db',
    sourceUrl: 'https://opentdb.com/api.php',
    sourceCategory: 'Sports',
    question: 'Which team won the second award?',
    correctAnswer: 'Team B',
    incorrectAnswers: ['Team A', 'Team C', 'Team D'],
    type: 'multiple',
    difficulty: 'easy',
  })!;
  const arabic = {
    curationStatus: 'APPROVE',
    sameMeaning: true,
    curationConfidence: 1,
    translationNotes: 'ترجمة أمينة',
    sourceFingerprint: source.fingerprint,
    question: 'أي لاعب فاز بالجائزة؟',
    answer: 'Lionel Messi',
    acceptedAnswers: [],
    wrongAnswers: ['اللاعب أ', 'اللاعب ب', 'اللاعب ج'],
    difficulty: 'easy',
    gameMode: 'trivia',
    type: 'text',
    explanation: 'فاز اللاعب بالجائزة.',
    assetRequest: null,
    knowledgeFactIds: [],
    sourceIds: ['open-trivia-db'],
  };
  const generated = {
    ...arabic,
    question: 'ما أكبر كوكب في المجموعة الشمسية؟',
    answer: 'المشتري',
    wrongAnswers: ['الأرض', 'المريخ', 'الزهرة'],
    explanation: 'المشتري هو أكبر كواكب المجموعة الشمسية.',
    knowledgeFactIds: [],
    sourceIds: [],
  };
  const make = (overrides: Record<string, unknown> = {}) => {
    const writer = {
      standardPromptLength: jest.fn().mockReturnValue(500),
      curate: jest.fn().mockResolvedValue({
        value: arabic,
        provider: 'test',
        model: 'curator',
      }),
      generateStandard: jest.fn().mockResolvedValue({
        value: generated,
        provider: 'gemini',
        model: 'gemini-test',
      }),
      generateStandardBatch: jest.fn().mockImplementation(({ slots }) =>
        Promise.resolve({
          value: slots.map(
            (slot: { slotId: string; difficulty: string }, index: number) => ({
              slotId: slot.slotId,
              candidate: {
                ...generated,
                question: `${generated.question} ${index + 1}`,
                answer: `${generated.answer} ${index + 1}`,
                difficulty: slot.difficulty,
              },
              review: { verdict: 'approved', score: 9, issues: [] },
            }),
          ),
          provider: 'gemini',
          model: 'gemini-test',
          diagnostics: { usage: { promptTokens: 100, outputTokens: 200 } },
          promptLength: 700,
          requestCount: 1,
        }),
      ),
    };
    const repairer = {
      repairCuration: jest.fn().mockResolvedValue({ value: arabic }),
      repairGenerated: jest.fn().mockResolvedValue({ value: generated }),
    };
    const reviewer = {
      reviewCuration: jest.fn().mockResolvedValue({
        value: {
          verdict: 'approved',
          score: 9,
          issues: [],
          sameQuestionMeaning: true,
          sameCorrectAnswer: true,
          noNewFacts: true,
          optionsFaithful: true,
        },
      }),
      reviewGenerated: jest.fn().mockResolvedValue({
        value: { verdict: 'approved', score: 9, issues: [] },
      }),
    };
    Object.assign(writer, overrides.writer);
    Object.assign(repairer, overrides.repairer);
    Object.assign(reviewer, overrides.reviewer);
    const router = {
      collect: jest.fn().mockResolvedValue({
        candidates: [source],
        diagnostics: [],
        sourcesAttempted: ['open-trivia-db'],
        sourcesUsed: ['open-trivia-db'],
        results: [],
      }),
    };
    Object.assign(router, overrides.router);
    return {
      pipeline: new AiGenerationPipelineService(
        { get: () => 1 } as unknown as ConfigService,
        new GenerationPlannerService(),
        {} as never,
        writer as never,
        reviewer as never,
        repairer as never,
        new DeterministicQuestionValidatorService(),
        new LanguageValidatorService(),
        new DuplicateDetectionService(),
        router as never,
        new SourceCuratedQuestionValidatorService(normalizer),
      ),
      writer,
      repairer,
      reviewer,
      router,
    };
  };
  const execute = (
    pipeline: AiGenerationPipelineService,
    count = 1,
    persisted: Array<{ question: string; correctAnswer?: string }> = [],
  ) =>
    pipeline.execute({
      count,
      difficulty: 'easy',
      categoryName: 'رياضة',
      requestedLanguage: 'ar',
      profile: categoryProfileRegistry.byId('general-text-trivia'),
      knowledgeFile: '',
      knowledge: '',
      persisted,
    });

  it('creates a source-curated draft with provenance', async () => {
    const { pipeline } = make();
    const result = await execute(pipeline);
    expect(result.drafts[0].aiMetadata).toMatchObject({
      strategy: 'SOURCE_CURATED',
      source: { sourceId: 'open-trivia-db', fingerprint: source.fingerprint },
    });
    expect(result.candidateDiagnostics).toEqual([
      expect.objectContaining({
        sourceQuestion: source.originalQuestion,
        sourceAnswer: source.originalCorrectAnswer,
        curatedQuestion: arabic.question,
        curatedAnswer: arabic.answer,
        semanticFingerprint: source.fingerprint,
        duplicateScore: expect.any(Number),
        validationResult: { status: 'PASS', issueCodes: [] },
        outcome: 'CREATED',
        rejectionReason: null,
      }),
    ]);
  });

  it('uses one batch Gemini request for homogeneous text slots', async () => {
    const { pipeline, writer } = make({
      router: {
        collect: jest.fn().mockResolvedValue({
          candidates: [source, unselectedSource],
          diagnostics: [],
          sourcesAttempted: ['open-trivia-db'],
          sourcesUsed: ['open-trivia-db'],
          results: [],
        }),
      },
    });

    const result = await execute(pipeline, 15);

    expect(writer.generateStandardBatch).toHaveBeenCalledTimes(1);
    expect(writer.generateStandardBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        slots: expect.arrayContaining([
          expect.objectContaining({ gameMode: 'trivia' }),
        ]),
      }),
    );
    expect(writer.generateStandard).not.toHaveBeenCalled();
    expect(writer.curate).not.toHaveBeenCalled();
    expect(result.results).toHaveLength(15);
  });
  it('allows English source wrong answers because they are not displayed', async () => {
    const english = {
      ...arabic,
      wrongAnswers: source.originalIncorrectAnswers,
    };
    const { pipeline, repairer } = make({
      writer: {
        curate: jest.fn().mockResolvedValue({
          value: english,
          provider: 'test',
          model: 'curator',
        }),
      },
    });
    const result = await execute(pipeline);
    expect(repairer.repairCuration).not.toHaveBeenCalled();
    expect(result.drafts).toHaveLength(1);
  });
  it('preserves source provenance without repair', async () => {
    const candidate = {
      ...arabic,
      wrongAnswers: source.originalIncorrectAnswers,
    };
    const { pipeline, repairer } = make({
      writer: {
        curate: jest.fn().mockResolvedValue({
          value: candidate,
          provider: 'test',
          model: 'curator',
        }),
      },
    });
    const result = await execute(pipeline);
    expect(result.drafts[0]).toMatchObject({
      answer: source.originalCorrectAnswer,
      sourceIds: [source.sourceId],
      sourceFingerprint: source.fingerprint,
    });
    expect(repairer.repairCuration).not.toHaveBeenCalled();
  });
  it('cannot approve while language blocking issues remain', async () => {
    const english = {
      ...arabic,
      question: source.originalQuestion,
      wrongAnswers: source.originalIncorrectAnswers,
      explanation: 'English explanation',
    };
    const { pipeline } = make({
      writer: {
        curate: jest.fn().mockResolvedValue({
          value: english,
          provider: 'test',
          model: 'curator',
        }),
      },
      repairer: {
        repairCuration: jest.fn().mockResolvedValue({ value: english }),
      },
    });
    const result = await execute(pipeline);
    expect(result.drafts).toHaveLength(1);
    expect(result.results[0].sourceStatus).toBe('optional_sources_exhausted');
    expect(result.candidateDiagnostics[0]).toMatchObject({
      outcome: 'REJECTED',
      validationResult: {
        issueCodes: expect.arrayContaining(['OUTPUT_LANGUAGE_MISMATCH']),
      },
      curator: { finalStatus: 'rejected' },
    });
  });
  it('fills optional text slots without inventing a source candidate', async () => {
    const { pipeline } = make();
    const result = await execute(pipeline, 2);
    expect(result.slots).toHaveLength(2);
    expect(result.drafts).toHaveLength(2);
    expect(result.results[1]).toMatchObject({
      status: 'created',
      sourceStatus: 'not_required',
      blockingIssues: [],
    });
  });
  it('bypasses reviewer and repair agents', async () => {
    const { pipeline, reviewer, repairer } = make();
    const result = await execute(pipeline);
    expect(result.drafts).toHaveLength(1);
    expect(reviewer.reviewCuration).not.toHaveBeenCalled();
    expect(repairer.repairCuration).not.toHaveBeenCalled();
  });

  it('uses exactly one curation call for a selected candidate', async () => {
    const { pipeline, writer } = make();
    const result = await execute(pipeline);
    expect(writer.curate).toHaveBeenCalledTimes(1);
    expect(result.drafts).toHaveLength(1);
  });

  it('rejects only a structural REJECT returned by the curation call', async () => {
    const rejected = { ...arabic, curationStatus: 'REJECT' };
    const { pipeline } = make({
      writer: {
        curate: jest.fn().mockResolvedValue({
          value: rejected,
          provider: 'test',
          model: 'curator',
        }),
      },
    });
    const result = await execute(pipeline);
    expect(result.drafts).toHaveLength(1);
    expect(result.results[0].sourceStatus).toBe('optional_sources_exhausted');
    expect(result.candidateDiagnostics[0]).toMatchObject({
      outcome: 'REJECTED',
      validationResult: { issueCodes: ['SOURCE_STRUCTURE_UNUSABLE'] },
      curator: { finalStatus: 'rejected' },
    });
  });

  it('keeps existing duplicate detection', async () => {
    const { pipeline } = make();
    const result = await execute(pipeline, 1, [
      { question: arabic.question, correctAnswer: arabic.answer },
    ]);
    expect(result.drafts).toHaveLength(1);
    expect(result.results[0].sourceStatus).toBe('optional_sources_exhausted');
    expect(result.candidateDiagnostics[0]).toMatchObject({
      outcome: 'REJECTED',
      validationResult: { issueCodes: ['DUPLICATE_EXACT'] },
    });
  });

  it('returns diagnostics for collected candidates not selected for a slot', async () => {
    const { pipeline } = make({
      router: {
        collect: jest.fn().mockResolvedValue({
          candidates: [source, unselectedSource],
          diagnostics: [],
          sourcesAttempted: ['open-trivia-db'],
          sourcesUsed: ['open-trivia-db'],
          results: [],
        }),
      },
    });
    const result = await execute(pipeline, 1);
    expect(result.candidateDiagnostics).toHaveLength(2);
    expect(result.candidateDiagnostics[1]).toMatchObject({
      sourceQuestion: unselectedSource.originalQuestion,
      sourceAnswer: unselectedSource.originalCorrectAnswer,
      curatedQuestion: null,
      curatedAnswer: null,
      semanticFingerprint: unselectedSource.fingerprint,
      validationResult: { status: 'NOT_EVALUATED', issueCodes: [] },
      outcome: 'NOT_SELECTED',
      rejectionReason: 'NOT_SELECTED_FOR_REQUEST',
    });
    expect(
      'sourceSummary' in result ? result.sourceSummary : undefined,
    ).toMatchObject({
      requested: 1,
      collected: 2,
      selected: 1,
      approved: 1,
      rejected: 0,
      failed: 0,
      notSelected: 1,
      returned: 1,
    });
  });

  it('does not count oversampled candidates as rejected', async () => {
    const candidates = Array.from({ length: 6 }, (_, index) =>
      normalizer.normalize({
        sourceId: 'open-trivia-db',
        sourceUrl: 'https://opentdb.com/api.php',
        sourceCategory: 'Sports',
        question: `Who won match ${index + 1}?`,
        correctAnswer: `Team ${index + 1}`,
        incorrectAnswers: ['Club A', 'Club B', 'Club C'],
        type: 'multiple',
        difficulty: 'easy',
      }),
    ).filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    );
    const { pipeline } = make({
      router: {
        collect: jest.fn().mockResolvedValue({
          candidates,
          diagnostics: [],
          sourcesAttempted: ['open-trivia-db'],
          sourcesUsed: ['open-trivia-db'],
          results: [],
        }),
      },
      writer: {
        curate: jest.fn().mockImplementation((selected, selectedSlot) => ({
          value: {
            ...arabic,
            question: `من فاز في المباراة رقم ${selectedSlot.slotId.slice(5)}؟`,
            answer: selected.originalCorrectAnswer,
            sourceFingerprint: selected.fingerprint,
          },
          provider: 'test',
          model: 'curator',
        })),
      },
    });
    const result = await execute(pipeline, 2);
    expect(
      'sourceSummary' in result ? result.sourceSummary : undefined,
    ).toMatchObject({
      requested: 2,
      collected: 6,
      selected: 0,
      approved: 0,
      rejected: 0,
      failed: 0,
      notSelected: 6,
      returned: 2,
    });
  });

  it('reaches Gemini when an optional text category has no source adapter', async () => {
    const { pipeline, writer, reviewer } = make({
      router: {
        collect: jest.fn().mockResolvedValue({
          candidates: [],
          diagnostics: [
            { sourceId: 'router', code: 'SOURCE_CATEGORY_UNSUPPORTED' },
          ],
          sourcesAttempted: [],
          sourcesUsed: [],
          results: [],
        }),
      },
    });
    const result = await execute(pipeline);
    expect(writer.generateStandard).toHaveBeenCalledTimes(1);
    expect(reviewer.reviewGenerated).toHaveBeenCalledTimes(1);
    expect(result.drafts).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      status: 'created',
      sourceStatus: 'unavailable_optional',
      blockingIssues: [],
      warnings: ['OPTIONAL_SOURCE_UNAVAILABLE'],
    });
    expect(
      'sourceSummary' in result ? result.sourceSummary : undefined,
    ).toMatchObject({
      failed: 0,
      optionalSourceUnavailable: 1,
      requiredSourceMissing: 0,
    });
  });

  it('marks an optional source as not required when research was not attempted', async () => {
    const { pipeline } = make({
      router: {
        collect: jest.fn().mockResolvedValue({
          candidates: [],
          diagnostics: [],
          sourcesAttempted: [],
          sourcesUsed: [],
          results: [],
        }),
      },
    });
    const result = await execute(pipeline);
    expect(result.results[0]).toMatchObject({
      status: 'created',
      sourceStatus: 'not_required',
      warnings: ['SOURCE_NOT_REQUIRED'],
    });
  });

  it('still rejects invalid optional-source output deterministically', async () => {
    const { pipeline } = make({
      router: {
        collect: jest.fn().mockResolvedValue({
          candidates: [],
          diagnostics: [],
          sourcesAttempted: [],
          sourcesUsed: [],
          results: [],
        }),
      },
      writer: {
        generateStandard: jest.fn().mockResolvedValue({
          value: { ...generated, question: '' },
          provider: 'gemini',
          model: 'gemini-test',
        }),
      },
      repairer: {
        repairGenerated: jest.fn().mockResolvedValue({
          value: { ...generated, question: '' },
        }),
      },
    });
    const result = await execute(pipeline);
    expect(result.drafts).toHaveLength(0);
    expect(result.results[0].blockingIssues).toContain('QUESTION_REQUIRED');
  });

  it('still rejects duplicates generated without an external source', async () => {
    const { pipeline } = make({
      router: {
        collect: jest.fn().mockResolvedValue({
          candidates: [],
          diagnostics: [],
          sourcesAttempted: [],
          sourcesUsed: [],
          results: [],
        }),
      },
    });
    const result = await execute(pipeline, 1, [
      { question: generated.question, correctAnswer: generated.answer },
    ]);
    expect(result.drafts).toHaveLength(0);
    expect(result.results[0].blockingIssues).toContain('DUPLICATE_EXACT');
  });

  it('keeps missing sources fatal for explicitly source-required profiles', async () => {
    const { pipeline, writer } = make({
      router: {
        collect: jest.fn().mockResolvedValue({
          candidates: [],
          diagnostics: [
            { sourceId: 'router', code: 'SOURCE_CATEGORY_UNSUPPORTED' },
          ],
          sourcesAttempted: [],
          sourcesUsed: [],
          results: [],
        }),
      },
    });
    const result = await pipeline.execute({
      count: 1,
      difficulty: 'easy',
      categoryName: 'أغاني الخليج',
      requestedLanguage: 'ar',
      profile: {
        ...categoryProfileRegistry.byId('gulf-music'),
        sourceRequired: true,
      },
      knowledgeFile: '',
      knowledge: '',
      persisted: [],
    });
    expect(writer.generateStandard).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({
      status: 'failed',
      sourceStatus: 'required_missing',
      blockingIssues: ['NO_SOURCE_CANDIDATE'],
    });
    expect(
      'sourceSummary' in result ? result.sourceSummary : undefined,
    ).toMatchObject({
      requiredSourceMissing: 1,
      optionalSourceUnavailable: 0,
    });
  });

  it('returns the original provider failure in slot diagnostics', async () => {
    const providerFailure = Object.assign(
      new Error('Gemini rate limit or quota was exceeded'),
      {
        name: 'LlmClientError',
        code: 'LLM_HTTP_ERROR',
        diagnostics: {
          provider: 'gemini',
          model: 'gemini-test',
          stage: 'request',
          errorType: 'AI_PROVIDER_RATE_LIMITED',
          providerDetails: { status: 429, errorCode: '429' },
        },
      },
    );
    const { pipeline } = make({
      router: {
        collect: jest.fn().mockResolvedValue({
          candidates: [],
          diagnostics: [
            { sourceId: 'router', code: 'SOURCE_CATEGORY_UNSUPPORTED' },
          ],
          sourcesAttempted: [],
          sourcesUsed: [],
          results: [],
        }),
      },
      writer: {
        generateStandard: jest.fn().mockRejectedValue(providerFailure),
      },
    });
    const result = await execute(pipeline);
    expect(result.results[0]).toMatchObject({
      status: 'failed',
      blockingIssues: ['AI_PROVIDER_RATE_LIMITED'],
      diagnostics: [
        { code: 'OPTIONAL_SOURCE_UNAVAILABLE' },
        {
          code: 'AI_PROVIDER_RATE_LIMITED',
          stage: 'request',
          message: 'Gemini rate limit or quota was exceeded',
          details: {
            errorType: 'LlmClientError',
            provider: 'gemini',
            model: 'gemini-test',
            providerDetails: { status: 429, errorCode: '429' },
          },
        },
      ],
    });
    expect(result.results[0].trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'writer', event: 'entered' }),
        expect.objectContaining({ stage: 'gemini', event: 'request_started' }),
        expect.objectContaining({
          stage: 'slot',
          event: 'final_result',
          details: expect.objectContaining({
            status: 'failed',
            error: expect.objectContaining({
              code: 'AI_PROVIDER_RATE_LIMITED',
            }),
          }),
        }),
      ]),
    );
  });

  it('falls back to the Gemini writer when optional source curation fails', async () => {
    const curatorFailure = Object.assign(new Error('Gemini quota exceeded'), {
      name: 'LlmClientError',
      code: 'LLM_HTTP_ERROR',
      diagnostics: {
        provider: 'gemini',
        model: 'gemini-test',
        stage: 'request',
        errorType: 'AI_PROVIDER_RATE_LIMITED',
      },
    });
    const { pipeline, writer } = make({
      writer: {
        curate: jest.fn().mockRejectedValue(curatorFailure),
      },
    });
    const result = await execute(pipeline);
    expect(writer.generateStandard).toHaveBeenCalledTimes(1);
    expect(result.drafts).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      status: 'created',
      sourceStatus: 'optional_curator_unavailable',
    });
    expect(result.candidateDiagnostics[0]).toMatchObject({
      outcome: 'FAILED',
      curator: {
        finalStatus: 'failed',
        errorCode: 'AI_PROVIDER_RATE_LIMITED',
        provider: 'gemini',
        model: 'gemini-test',
      },
    });
    expect(
      'sourceSummary' in result ? result.sourceSummary : undefined,
    ).toMatchObject({
      curatorFailed: 1,
      sourceFallbackUsed: 1,
      generationFailed: 0,
      returned: 1,
    });
  });

  it('does not fall back when a source-required profile curator fails', async () => {
    const { pipeline, writer } = make({
      writer: {
        curate: jest.fn().mockRejectedValue(new Error('curator crashed')),
      },
    });
    const result = await pipeline.execute({
      count: 1,
      difficulty: 'easy',
      categoryName: 'أغاني الخليج',
      requestedLanguage: 'ar',
      profile: {
        ...categoryProfileRegistry.byId('gulf-music'),
        sourceRequired: true,
      },
      knowledgeFile: '',
      knowledge: '',
      persisted: [],
    });
    expect(writer.generateStandard).not.toHaveBeenCalled();
    expect(result.results[0].status).toBe('failed');
    expect(result.candidateDiagnostics[0]).toMatchObject({
      outcome: 'FAILED',
      curator: { finalStatus: 'failed' },
    });
  });
});
