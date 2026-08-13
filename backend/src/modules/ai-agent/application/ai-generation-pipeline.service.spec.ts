import { AiGenerationPipelineService } from './ai-generation-pipeline.service';
import { GenerationPlannerService } from './generation-planner.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { categoryProfileRegistry } from './category-generation-profile.registry';
import type { ResearchAgentService } from './research-agent.service';
import type { QuestionWriterAgentService } from './question-writer-agent.service';
import type { QuestionReviewAgentService } from './question-review-agent.service';
import type { QuestionRepairAgentService } from './question-repair-agent.service';
import type { DeterministicQuestionValidatorService } from './deterministic-question-validator.service';
import type { ConfigService } from '@nestjs/config';
import { LanguageValidatorService } from './language-validator.service';

describe('AiGenerationPipelineService', () => {
  it('keeps a successful slot when another slot fails', async () => {
    const research = {
      research: jest.fn(async ({ slot }: { slot: { slotId: string } }) => {
        if (slot.slotId === 'slot-2') throw new Error('SEARCH_UNAVAILABLE');
        return {
          fact: {
            id: 'f1',
            fact: 'الرياض عاصمة السعودية',
            canonicalAnswer: 'الرياض',
            acceptedAnswerHints: [],
            entities: ['الرياض'],
            topic: 'عواصم',
            source: {
              title: 'facts.md',
              url: 'knowledge://facts.md',
              excerpt: 'الرياض عاصمة السعودية',
            },
            confidence: 1,
          },
          provider: 'lmstudio',
          model: 'test-model',
        };
      }),
    } as unknown as ResearchAgentService;
    const candidate = {
      question: 'وش عاصمة السعودية؟',
      answer: 'الرياض',
      acceptedAnswers: [],
      wrongAnswers: ['جدة', 'الدمام', 'مكة'],
      difficulty: 'easy' as const,
      gameMode: 'trivia' as const,
      type: 'text' as const,
      explanation: 'الرياض هي العاصمة.',
      assetRequest: null,
    };
    const pipeline = new AiGenerationPipelineService(
      { get: () => 2 } as unknown as ConfigService,
      new GenerationPlannerService(),
      research,
      {
        write: jest.fn(async () => ({
          value: candidate,
          provider: 'lmstudio',
          model: 'writer',
        })),
      } as unknown as QuestionWriterAgentService,
      {
        review: jest.fn(async () => ({
          value: { verdict: 'approved', score: 9, issues: [] },
          provider: 'lmstudio',
          model: 'reviewer',
        })),
      } as unknown as QuestionReviewAgentService,
      { repair: jest.fn() } as unknown as QuestionRepairAgentService,
      {
        validate: jest.fn(() => []),
      } as unknown as DeterministicQuestionValidatorService,
      new LanguageValidatorService(),
      new DuplicateDetectionService(),
    );
    const result = await pipeline.execute({
      count: 2,
      difficulty: 'easy',
      categoryName: 'عام',
      profile: categoryProfileRegistry.byId('general-text-trivia'),
      knowledgeFile: 'facts.md',
      knowledge: 'الرياض عاصمة السعودية',
      persisted: [],
    });
    expect(result.drafts).toHaveLength(1);
    expect(result.results.map((slot) => slot.status)).toEqual([
      'created',
      'failed',
    ]);
    expect(result.drafts[0].aiMetadata).toMatchObject({
      pipelineVersion: '3.0',
      finalStage: 'approved',
      blockingIssues: [],
      canonicalFinalDecision: 'created',
    });
    expect(result.drafts[0]).toMatchObject({ qualityScore: 9, issues: [] });
  });

  it('splits a large request into logical batches of six', async () => {
    const pipeline = new AiGenerationPipelineService(
      {
        get: (key: string) => (key === 'AI_GENERATION_BATCH_SIZE' ? 6 : 1),
      } as unknown as ConfigService,
      new GenerationPlannerService(),
      {
        research: jest.fn(async () => {
          throw new Error('expected');
        }),
      } as unknown as ResearchAgentService,
      {} as QuestionWriterAgentService,
      {} as QuestionReviewAgentService,
      {} as QuestionRepairAgentService,
      {} as DeterministicQuestionValidatorService,
      new LanguageValidatorService(),
      new DuplicateDetectionService(),
    );
    const result = await pipeline.execute({
      count: 20,
      difficulty: 'easy',
      categoryName: 'عام',
      profile: categoryProfileRegistry.byId('general-text-trivia'),
      knowledgeFile: 'facts.md',
      knowledge: 'fact',
      persisted: [],
    });
    expect(result.batches.map((batch) => batch.length)).toEqual([6, 6, 6, 2]);
  });

  it('cannot approve a reviewer score below the canonical threshold', async () => {
    const pipeline = new AiGenerationPipelineService(
      { get: () => 1 } as unknown as ConfigService,
      new GenerationPlannerService(),
      {
        research: jest.fn(async () => ({
          fact: {
            id: 'f1',
            fact: 'fact',
            canonicalAnswer: 'answer',
            acceptedAnswerHints: [],
            entities: ['answer'],
            source: { title: 'source', url: 'https://source', excerpt: 'fact' },
            confidence: 1,
          },
          provider: 'wikipedia',
          model: 'typed-provider',
        })),
      } as unknown as ResearchAgentService,
      {
        write: jest.fn(async () => ({
          value: {
            question: 'ما هي الإجابة الصحيحة هنا؟',
            answer: 'answer',
            acceptedAnswers: [],
            wrongAnswers: [],
            difficulty: 'easy',
            gameMode: 'trivia',
            type: 'text',
            explanation: 'هذا شرح عربي واضح.',
            assetRequest: null,
            knowledgeFactIds: ['f1'],
            sourceIds: ['https://source'],
          },
        })),
      } as unknown as QuestionWriterAgentService,
      {
        review: jest.fn(async () => ({
          value: { verdict: 'approved', score: 6, issues: [] },
        })),
      } as unknown as QuestionReviewAgentService,
      { repair: jest.fn() } as unknown as QuestionRepairAgentService,
      {
        validate: jest.fn(() => []),
      } as unknown as DeterministicQuestionValidatorService,
      new LanguageValidatorService(),
      new DuplicateDetectionService(),
    );
    const result = await pipeline.execute({
      count: 1,
      difficulty: 'easy',
      categoryName: 'عام',
      profile: categoryProfileRegistry.byId('general-text-trivia'),
      knowledgeFile: 'facts.md',
      knowledge: 'fact',
      persisted: [],
    });
    expect(result.drafts).toHaveLength(0);
    expect(result.results[0]).toMatchObject({
      status: 'rejected',
      reviewerScore: 6,
      blockingIssues: ['QUALITY_SCORE_BELOW_THRESHOLD'],
    });
  });

  it('repairs the live English output once and preserves canonical provenance', async () => {
    const sourceIds = ['wikipedia:en:2150841'];
    const english = {
      question:
        'Who is the Argentine professional footballer who captains Argentina?',
      answer: 'Lionel Messi',
      acceptedAnswers: ['Lionel Messi'],
      wrongAnswers: ['Neymar', 'Kylian Mbappe', 'Harry Kane'],
      difficulty: 'medium' as const,
      gameMode: 'trivia' as const,
      type: 'text' as const,
      explanation: 'Lionel Messi captains Argentina.',
      assetRequest: null,
      knowledgeFactIds: ['f1'],
      sourceIds,
    };
    const repaired = {
      ...english,
      question: 'من هو اللاعب الأرجنتيني الذي يقود منتخب بلاده؟',
      acceptedAnswers: ['ليونيل ميسي'],
      wrongAnswers: ['نيمار', 'كيليان مبابي', 'هاري كين'],
      explanation: 'ليونيل ميسي هو قائد منتخب الأرجنتين.',
    };
    const repair = jest.fn(async () => ({ value: repaired }));
    const pipeline = new AiGenerationPipelineService(
      { get: () => 1 } as unknown as ConfigService,
      new GenerationPlannerService(),
      {
        research: jest.fn(async () => ({
          fact: {
            id: 'f1',
            fact: 'Messi captains Argentina',
            canonicalAnswer: 'Lionel Messi',
            acceptedAnswerHints: ['ليونيل ميسي'],
            entities: ['Lionel Messi'],
            source: {
              title: 'Lionel Messi',
              url: 'https://source',
              excerpt: 'fact',
            },
            sources: [
              {
                sourceId: sourceIds[0],
                title: 'Lionel Messi',
                url: 'https://source',
                excerpt: 'fact',
              },
            ],
            confidence: 1,
          },
          provider: 'wikipedia',
          model: 'typed',
        })),
      } as unknown as ResearchAgentService,
      {
        write: jest.fn(async () => ({
          value: english,
          provider: 'lmstudio',
          model: 'writer',
        })),
      } as unknown as QuestionWriterAgentService,
      {
        review: jest.fn(async () => ({
          value: { verdict: 'approved', score: 9, issues: [] },
        })),
      } as unknown as QuestionReviewAgentService,
      { repair } as unknown as QuestionRepairAgentService,
      {
        validate: jest.fn(() => []),
      } as unknown as DeterministicQuestionValidatorService,
      new LanguageValidatorService(),
      new DuplicateDetectionService(),
    );
    const result = await pipeline.execute({
      count: 1,
      requestedLanguage: 'ar',
      categoryName: 'كرة قدم عالمية',
      profile: categoryProfileRegistry.byId('football'),
      knowledgeFile: 'sports/world-cup.md',
      knowledge: 'fact',
      persisted: [],
    });
    expect(repair).toHaveBeenCalledTimes(1);
    expect(result.drafts[0]).toMatchObject({
      answer: 'Lionel Messi',
      knowledgeFactIds: ['f1'],
      sourceIds,
      aiMetadata: {
        languageRepairAttempted: true,
        languageRepairSucceeded: true,
        languageIssueCodes: [],
        detectedLanguage: 'ar',
      },
    });
  });

  it('cannot approve a draft while language blocking issues remain', async () => {
    const english = {
      question: 'Who captains the Argentina national team?',
      answer: 'Lionel Messi',
      acceptedAnswers: ['Lionel Messi'],
      wrongAnswers: ['Neymar', 'Harry Kane', 'Kylian Mbappe'],
      difficulty: 'easy' as const,
      gameMode: 'trivia' as const,
      type: 'text' as const,
      explanation: 'Lionel Messi captains Argentina.',
      assetRequest: null,
      knowledgeFactIds: ['f1'],
      sourceIds: ['s1'],
    };
    const pipeline = new AiGenerationPipelineService(
      { get: () => 1 } as unknown as ConfigService,
      new GenerationPlannerService(),
      {
        research: jest.fn(async () => ({
          fact: {
            id: 'f1',
            fact: 'Messi captains Argentina',
            canonicalAnswer: 'Lionel Messi',
            acceptedAnswerHints: [],
            entities: ['Lionel Messi'],
            source: { title: 'Messi', url: 'https://s', excerpt: 'fact' },
            sources: [
              {
                sourceId: 's1',
                title: 'Messi',
                url: 'https://s',
                excerpt: 'fact',
              },
            ],
            confidence: 1,
          },
          provider: 'wikipedia',
          model: 'typed',
        })),
      } as unknown as ResearchAgentService,
      {
        write: jest.fn(async () => ({
          value: english,
          provider: 'lmstudio',
          model: 'writer',
        })),
      } as unknown as QuestionWriterAgentService,
      {
        review: jest.fn(async () => ({
          value: { verdict: 'approved', score: 10, issues: [] },
        })),
      } as unknown as QuestionReviewAgentService,
      {
        repair: jest.fn(async () => ({ value: english })),
      } as unknown as QuestionRepairAgentService,
      {
        validate: jest.fn(() => []),
      } as unknown as DeterministicQuestionValidatorService,
      new LanguageValidatorService(),
      new DuplicateDetectionService(),
    );
    const result = await pipeline.execute({
      count: 1,
      requestedLanguage: 'ar',
      categoryName: 'كرة قدم عالمية',
      profile: categoryProfileRegistry.byId('football'),
      knowledgeFile: 'sports/world-cup.md',
      knowledge: 'fact',
      persisted: [],
    });
    expect(result.drafts).toHaveLength(0);
    expect(result.results[0]).toMatchObject({
      status: 'rejected',
      languageRepairAttempted: true,
      languageRepairSucceeded: false,
      blockingIssues: expect.arrayContaining(['OUTPUT_LANGUAGE_MISMATCH']),
    });
  });
});
