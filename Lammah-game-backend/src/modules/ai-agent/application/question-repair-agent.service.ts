import { Injectable } from '@nestjs/common';
import { LlmClientService } from '../infrastructure/ai/llm-client.service';
import type {
  FactCandidate,
  PipelineQuestionCandidate,
  CuratedQuestionCandidate,
} from './ai-generation-pipeline.types';
import type { SourceQuestionCandidate } from '../domain/question-source.types';

@Injectable()
export class QuestionRepairAgentService {
  constructor(private readonly llm: LlmClientService) {}
  async repairCuration(
    source: SourceQuestionCandidate,
    candidate: CuratedQuestionCandidate,
    issueCodes: string[],
    requestedLanguage: 'ar' = 'ar',
  ) {
    const result = await this.llm.generateStructured<CuratedQuestionCandidate>({
      purpose: 'question-repair',
      systemPrompt: `Repair only the listed language, semantic-fidelity, clarity, option-formatting, or proper-name-rendering defects in ${requestedLanguage}. Translate the immutable source question faithfully and preserve its exact interrogative target: who/what/which event/when/where/why must not change. The immutable correct answer must directly answer the repaired question. Preserve the source question's exact meaning, correct-answer identity, option identities, difficulty, source ID, and fingerprint. Remove unsupported claims rather than replacing them with model knowledge. Do not research or add facts. If the source cannot be repaired faithfully, return curationStatus REJECT.`,
      userPrompt: JSON.stringify({
        immutableSourceQuestion: source,
        candidate,
        issueCodes,
      }),
      schema: {
        ...candidate,
        sourceFingerprint: source.fingerprint,
        sourceIds: [source.sourceId],
        knowledgeFactIds: [],
      },
      temperature: 0.1,
    });
    return {
      ...result,
      value: {
        ...result.value,
        answer: source.originalCorrectAnswer,
        difficulty: candidate.difficulty,
        gameMode: 'trivia' as const,
        type: 'text' as const,
        assetRequest: null,
        knowledgeFactIds: [],
        sourceIds: [source.sourceId],
        sourceFingerprint: source.fingerprint,
      },
    };
  }
  async repair(
    fact: FactCandidate,
    candidate: PipelineQuestionCandidate,
    issueCodes: string[],
    options?: { requestedLanguage?: 'ar'; languageOnly?: boolean },
  ) {
    const result = await this.llm.generateStructured<PipelineQuestionCandidate>(
      {
        purpose: 'question-repair',
        systemPrompt: options?.languageOnly
          ? `Translate or rewrite only the user-facing fields into ${options.requestedLanguage ?? 'ar'}. Preserve official proper names when appropriate. The source, canonical answer meaning, fact IDs, and source IDs are immutable. Do not research or add facts.`
          : 'Repair only the listed issues. Source and canonical answer are immutable. Do not add facts.',
        userPrompt: JSON.stringify({
          immutableFact: fact,
          candidate,
          issueCodes,
          requestedLanguage: options?.requestedLanguage,
        }),
        schema: { ...candidate, answer: fact.canonicalAnswer },
        temperature: 0.2,
      },
    );
    return {
      ...result,
      value: {
        ...result.value,
        answer: fact.canonicalAnswer,
        knowledgeFactIds: candidate.knowledgeFactIds ?? [fact.id],
        sourceIds:
          candidate.sourceIds ??
          (fact.sources?.length
            ? fact.sources.map((source) => source.sourceId)
            : [fact.source.url]),
      },
    };
  }
  private norm(value: string) {
    return (
      value?.toLowerCase().replace(/[^\u0600-\u06ffA-Za-z0-9]+/g, '') ?? ''
    );
  }
}
