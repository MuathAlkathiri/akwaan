import { Injectable } from '@nestjs/common';
import { LlmClientService } from '../infrastructure/ai/llm-client.service';
import type {
  FactCandidate,
  GenerationPlanSlot,
  PipelineQuestionCandidate,
  QuestionReviewResult,
} from './ai-generation-pipeline.types';
import type { SourceQuestionCandidate } from '../domain/question-source.types';
import type { CategoryGenerationProfile } from './category-generation-profile.registry';

export type StandardQuestionGenerationInput = {
  categoryName: string;
  catalogName?: string;
  categoryDescription?: string;
  slot: GenerationPlanSlot;
  profile: CategoryGenerationProfile;
  requestedLanguage?: 'ar';
  excludedQuestions: string[];
  noveltyAttempt: number;
};

export type BatchedStandardQuestion = {
  slotId: string;
  candidate: PipelineQuestionCandidate;
  review: QuestionReviewResult;
};

@Injectable()
export class QuestionWriterAgentService {
  constructor(private readonly llm: LlmClientService) {}

  standardPromptLength(input: StandardQuestionGenerationInput): number {
    const prompts = this.standardPrompts(input);
    return prompts.systemPrompt.length + prompts.userPrompt.length;
  }

  async generateStandard(input: StandardQuestionGenerationInput) {
    const { slot } = input;
    const { systemPrompt, userPrompt } = this.standardPrompts(input);
    const result = await this.llm.generateStructured<PipelineQuestionCandidate>(
      {
        purpose: 'question-writing',
        systemPrompt,
        userPrompt,
        schema: {
          question: 'string',
          answer: 'string',
          acceptedAnswers: ['string'],
          wrongAnswers: ['string'],
          difficulty: slot.difficulty,
          gameMode: 'trivia',
          type: 'text',
          explanation: 'string',
          assetRequest: 'object|null',
          knowledgeFactIds: ['string'],
          sourceIds: ['string'],
        },
        temperature: 0.55,
        repairMalformed: false,
      },
    );
    return {
      ...result,
      promptLength: systemPrompt.length + userPrompt.length,
      value: {
        ...result.value,
        difficulty: slot.difficulty,
        gameMode: 'trivia' as const,
        type: 'text' as const,
        assetRequest: null,
        knowledgeFactIds: [],
        sourceIds: [],
        acceptedAnswers: Array.isArray(result.value.acceptedAnswers)
          ? result.value.acceptedAnswers
          : [],
        wrongAnswers: Array.isArray(result.value.wrongAnswers)
          ? result.value.wrongAnswers
          : [],
      },
    };
  }

  async generateStandardBatch(input: {
    categoryName: string;
    catalogName?: string;
    categoryDescription?: string;
    slots: GenerationPlanSlot[];
    profile: CategoryGenerationProfile;
    requestedLanguage?: 'ar';
    excludedQuestions: string[];
  }) {
    const systemPrompt =
      'Generate the requested batch of factual, objective, text-only standard trivia questions for an Arabic party game. Return exactly one item for every supplied slotId and no additional items. Questions must be diverse and must not duplicate each other or any excluded question. Answers must be specific and directly answer their questions. Do not invent citations. Avoid ambiguity, opinions, time-sensitive claims, answer leakage, and multiple-choice wording. For each item, critically review the draft for factual correctness, clarity, fairness, answer fit, difficulty, language, and duplication. Use verdict approved only when it is ready for deterministic application validation; use repairable or rejected otherwise. Return Arabic user-facing text and only the schema.';
    const userPrompt = JSON.stringify({
      categoryName: input.categoryName,
      catalogName: input.catalogName,
      categoryDescription: input.categoryDescription,
      categoryObjective: input.profile.objective,
      categoryGuidance: input.profile.promptFragments?.guidance,
      requestedLanguage: input.requestedLanguage ?? 'ar',
      generationSettings: {
        gameMode: 'trivia',
        questionType: 'text',
      },
      slots: input.slots.map((slot) => ({
        slotId: slot.slotId,
        difficulty: slot.difficulty,
        diversitySeed: slot.slotId,
      })),
      excludedQuestions: input.excludedQuestions.slice(-100),
    });
    const result = await this.llm.generateStructured<{
      items: BatchedStandardQuestion[];
    }>({
      purpose: 'question-writing',
      systemPrompt,
      userPrompt,
      schema: {
        items: input.slots.map((slot) => ({
          slotId: slot.slotId,
          candidate: {
            question: 'string',
            answer: 'string',
            acceptedAnswers: ['string'],
            wrongAnswers: ['string'],
            difficulty: slot.difficulty,
            gameMode: 'trivia',
            type: 'text',
            explanation: 'string',
            assetRequest: null,
            knowledgeFactIds: [],
            sourceIds: [],
          },
          review: {
            verdict: ['approved', 'repairable', 'rejected'],
            score: 'number 0-10',
            issues: [{ code: 'string', message: 'string' }],
          },
        })),
      },
      temperature: 0.5,
      maxTokens: Math.min(32_768, Math.max(4_096, input.slots.length * 1_200)),
      repairMalformed: false,
    });
    const items = Array.isArray(result.value?.items) ? result.value.items : [];
    const bySlot = new Map(items.map((item) => [item.slotId, item]));
    const normalized = input.slots.map((slot) => {
      const item = bySlot.get(slot.slotId);
      if (!item?.candidate)
        throw new Error(`BATCH_OUTPUT_MISSING_SLOT: ${slot.slotId}`);
      const verdict = String(item.review?.verdict ?? '').toLowerCase();
      return {
        slotId: slot.slotId,
        candidate: {
          ...item.candidate,
          difficulty: slot.difficulty,
          gameMode: 'trivia' as const,
          type: 'text' as const,
          assetRequest: null,
          knowledgeFactIds: [],
          sourceIds: [],
          acceptedAnswers: Array.isArray(item.candidate.acceptedAnswers)
            ? item.candidate.acceptedAnswers
            : [],
          wrongAnswers: Array.isArray(item.candidate.wrongAnswers)
            ? item.candidate.wrongAnswers
            : [],
        },
        review: {
          verdict: ['approved', 'repairable', 'rejected'].includes(verdict)
            ? (verdict as QuestionReviewResult['verdict'])
            : ('rejected' as const),
          score: Math.max(0, Math.min(10, Number(item.review?.score) || 0)),
          issues: Array.isArray(item.review?.issues) ? item.review.issues : [],
        },
      };
    });
    return {
      ...result,
      value: normalized,
      promptLength: systemPrompt.length + userPrompt.length,
      requestCount: 1,
    };
  }

  private standardPrompts(input: StandardQuestionGenerationInput) {
    return {
      systemPrompt:
        'Generate one factual, objective, text-only standard trivia question for an Arabic party game. Use established general knowledge. The answer must be specific and directly answer the question. Do not invent citations or claim an external source. Avoid ambiguity, opinions, time-sensitive claims, answer leakage, multiple-choice wording, and every excluded or near-duplicate question. The explanation must briefly state the supporting fact. Return Arabic user-facing text and only the schema.',
      userPrompt: JSON.stringify({
        categoryName: input.categoryName,
        catalogName: input.catalogName,
        categoryDescription: input.categoryDescription,
        categoryObjective: input.profile.objective,
        categoryGuidance: input.profile.promptFragments?.guidance,
        difficulty: input.slot.difficulty,
        gameMode: 'trivia',
        questionType: 'text',
        excludedQuestions: input.excludedQuestions.slice(-100),
        diversitySeed: `${input.slot.slotId}-${input.noveltyAttempt}`,
        requestedLanguage: input.requestedLanguage ?? 'ar',
      }),
    };
  }
  async curate(
    source: SourceQuestionCandidate,
    slot: GenerationPlanSlot,
    requestedLanguage: 'ar' = 'ar',
  ) {
    const result = await this.llm.generateStructured<{
      status: 'ACCEPT' | 'REJECT';
      question: string;
      answer: string;
      reason: string | null;
    }>({
      purpose: 'question-writing',
      systemPrompt: `Translate the supplied source question into natural Arabic and lightly rephrase it only when needed to make it standalone. Do not verify the fact using model knowledge. Do not invent context, change the factual claim, or replace the question. Preserve the source answer; translate it only when appropriate. Proper names may remain in their common English form when Arabic transliteration is uncertain. For boolean questions, translate True to "صح" and False to "خطأ", and phrase a declarative statement naturally as "صح أم خطأ: ...". Return REJECT only when the source cannot work without visual context or missing multiple-choice options, never because you doubt the source fact. Requested language: ${requestedLanguage}.`,
      userPrompt: JSON.stringify({
        sourceQuestion: source.originalQuestion,
        sourceAnswer: source.originalCorrectAnswer,
        sourceType: source.originalType,
        sourceCategory: source.sourceCategory,
        requestedLanguage,
      }),
      schema: {
        status: ['ACCEPT', 'REJECT'],
        question: 'string',
        answer: 'string',
        reason: 'string|null',
      },
      temperature: 0.1,
      repairMalformed: false,
    });
    const status =
      String(result.value.status).toUpperCase() === 'ACCEPT'
        ? 'ACCEPT'
        : 'REJECT';
    const booleanAnswer =
      source.originalType === 'boolean'
        ? source.normalizedCorrectAnswer === 'true'
          ? 'صح'
          : source.normalizedCorrectAnswer === 'false'
            ? 'خطأ'
            : ''
        : null;
    const rawQuestion = String(result.value.question ?? '').trim();
    const question =
      source.originalType === 'boolean' &&
      rawQuestion &&
      !/^صح\s+أم\s+خطأ\s*[:：-]?/u.test(rawQuestion)
        ? `صح أم خطأ: ${rawQuestion}`
        : rawQuestion;
    const answer = booleanAnswer ?? String(result.value.answer ?? '').trim();
    return {
      ...result,
      value: {
        curationStatus: status === 'ACCEPT' ? 'APPROVE' : 'REJECT',
        sameMeaning: status === 'ACCEPT',
        translationNotes:
          typeof result.value.reason === 'string' ? result.value.reason : '',
        question,
        answer,
        acceptedAnswers:
          source.originalCorrectAnswer !== answer
            ? [source.originalCorrectAnswer]
            : [],
        wrongAnswers: source.originalIncorrectAnswers,
        difficulty: slot.difficulty,
        gameMode: 'trivia' as const,
        type: 'text' as const,
        explanation: 'تمت ترجمة السؤال من المصدر مع الحفاظ على إجابته.',
        assetRequest: null,
        knowledgeFactIds: [],
        sourceIds: [source.sourceId],
        sourceFingerprint: source.fingerprint,
      },
    };
  }
  async write(
    fact: FactCandidate,
    slot: GenerationPlanSlot,
    profile: CategoryGenerationProfile,
    requestedLanguage: 'ar' = 'ar',
  ) {
    const result = await this.llm.generateStructured<PipelineQuestionCandidate>(
      {
        purpose: 'question-writing',
        systemPrompt: `Write one natural party-game question using only the immutable fact. Requested locale: ${requestedLanguage}. Every user-facing field (question, answer aliases, wrong answers, explanation) must be predominantly Arabic; retain official proper names and unavoidable acronyms where appropriate. The question must be worded so its exact answer is the supplied canonical answer. For a person or entity biography, ask which person or entity is described by the sourced facts; never pivot to asking for a date, nationality, club, location, count, or other property whose answer would differ from the canonical answer. Keep the canonical answer unchanged. Do not research. When the slot requests image, audio, or video, assetRequest is mandatory and must include type, assetType, entity, franchise or gameTitle when known, searchContext, and duration for audio/video. Use assetRequest=null only for text, emoji, quote, or timeline slots.`,
        userPrompt: JSON.stringify({
          fact,
          slot,
          writerInstructions: profile.promptFragments?.guidance,
          requestedLanguage,
        }),
        schema: {
          question: 'string',
          answer: fact.canonicalAnswer,
          acceptedAnswers: ['string'],
          wrongAnswers: ['string'],
          difficulty: slot.difficulty,
          gameMode: slot.gameMode,
          type: slot.requestedAssetType,
          explanation: 'string',
          assetRequest: 'object|null',
          knowledgeFactIds: [fact.id],
          sourceIds: (fact.sources ?? []).map((source) => source.sourceId),
        },
        temperature: 0.4,
      },
    );
    return {
      ...result,
      value: {
        ...result.value,
        answer: fact.canonicalAnswer,
        acceptedAnswers: Array.isArray(result.value.acceptedAnswers)
          ? result.value.acceptedAnswers
          : fact.acceptedAnswerHints,
        wrongAnswers: Array.isArray(result.value.wrongAnswers)
          ? result.value.wrongAnswers
          : [],
        difficulty: slot.difficulty,
        gameMode: slot.gameMode,
        type: slot.requestedAssetType ?? 'text',
        explanation: result.value.explanation ?? '',
        assetRequest: result.value.assetRequest ?? null,
        knowledgeFactIds: [fact.id],
        sourceIds: fact.sources?.length
          ? fact.sources.map((source) => source.sourceId)
          : [fact.source.url],
      },
    };
  }
  private norm(value: string) {
    return (
      value?.toLowerCase().replace(/[^\u0600-\u06ffA-Za-z0-9]+/g, '') ?? ''
    );
  }
}
