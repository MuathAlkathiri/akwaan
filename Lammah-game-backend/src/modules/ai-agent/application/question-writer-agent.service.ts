import { Injectable } from '@nestjs/common';
import { LlmClientService } from '../infrastructure/ai/llm-client.service';
import type {
  FactCandidate,
  GenerationPlanSlot,
  PipelineQuestionCandidate,
} from './ai-generation-pipeline.types';
import type { SourceQuestionCandidate } from '../domain/question-source.types';
import type { CategoryGenerationProfile } from './category-generation-profile.registry';

@Injectable()
export class QuestionWriterAgentService {
  constructor(private readonly llm: LlmClientService) {}
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
