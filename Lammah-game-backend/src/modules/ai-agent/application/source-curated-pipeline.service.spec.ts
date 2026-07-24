import type { ConfigService } from '@nestjs/config';
import { AiGenerationPipelineService } from './ai-generation-pipeline.service';
import { GenerationPlannerService } from './generation-planner.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { LanguageValidatorService } from './language-validator.service';
import { SourceQuestionNormalizerService } from './source-question-normalizer.service';
import { SourceCuratedQuestionValidatorService } from './source-curated-question-validator.service';
import { categoryProfileRegistry } from './category-generation-profile.registry';

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
  const make = (overrides: Record<string, unknown> = {}) => {
    const writer = {
      curate: jest.fn().mockResolvedValue({
        value: arabic,
        provider: 'test',
        model: 'curator',
      }),
    };
    const repairer = {
      repairCuration: jest.fn().mockResolvedValue({ value: arabic }),
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
        {} as never,
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
    expect(result.drafts).toHaveLength(0);
    expect(result.results[0].languageIssueCodes).toContain(
      'OUTPUT_LANGUAGE_MISMATCH',
    );
  });
  it('returns partial results without inventing missing slots', async () => {
    const { pipeline } = make();
    const result = await execute(pipeline, 2);
    expect(result.slots).toHaveLength(2);
    expect(result.drafts).toHaveLength(1);
    expect(result.results[1]).toMatchObject({
      status: 'failed',
      blockingIssues: ['NO_SOURCE_CANDIDATE'],
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
    expect(result.drafts).toHaveLength(0);
    expect(result.results[0].blockingIssues).toEqual([
      'SOURCE_STRUCTURE_UNUSABLE',
    ]);
  });

  it('keeps existing duplicate detection', async () => {
    const { pipeline } = make();
    const result = await execute(pipeline, 1, [
      { question: arabic.question, correctAnswer: arabic.answer },
    ]);
    expect(result.drafts).toHaveLength(0);
    expect(result.results[0].blockingIssues).toContain('DUPLICATE_EXACT');
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
    ).toEqual({
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
    ).toEqual({
      requested: 2,
      collected: 6,
      selected: 2,
      approved: 2,
      rejected: 0,
      failed: 0,
      notSelected: 4,
      returned: 2,
    });
  });
});
