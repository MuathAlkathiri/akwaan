import { Injectable } from '@nestjs/common';
import { LlmClientService } from '../infrastructure/ai/llm-client.service';
import type {
  FactCandidate,
  PipelineQuestionCandidate,
  QuestionReviewResult,
  CuratedQuestionCandidate,
  CurationReviewResult,
} from './ai-generation-pipeline.types';
import type { SourceQuestionCandidate } from '../domain/question-source.types';

@Injectable()
export class QuestionReviewAgentService {
  constructor(private readonly llm: LlmClientService) {}

  async reviewGenerated(
    context: { categoryName: string; difficulty: string },
    candidate: PipelineQuestionCandidate,
    requestedLanguage: 'ar' = 'ar',
  ) {
    const result = await this.llm.generateStructured<QuestionReviewResult>({
      purpose: 'question-review',
      systemPrompt:
        'Independently review an unsourced standard trivia draft. Use your own knowledge to reject a factually incorrect, genuinely unverifiable, time-sensitive, vague, subjective, ambiguous, duplicate-looking, answer-leaking, or unfair question. Confirm the answer directly answers the question and difficulty is appropriate. External research is optional for this text-only slot: do not penalize or lower the score merely because the candidate has no citation or source metadata. A well-established fact you can confidently verify from your own knowledge is verifiable and, when otherwise sound, should be approved with a score of at least 7. Mark fixable wording or language defects repairable. Do not approve merely because the writer supplied an explanation.',
      userPrompt: JSON.stringify({
        ...context,
        candidate,
        requestedLanguage,
      }),
      schema: {
        verdict: ['approved', 'repairable', 'rejected'],
        score: 'number 0-10',
        issues: [{ code: 'string', message: 'string' }],
      },
      temperature: 0.1,
    });
    const verdict = String(result.value.verdict).toLowerCase();
    return {
      ...result,
      value: {
        verdict: ['approved', 'repairable', 'rejected'].includes(verdict)
          ? (verdict as QuestionReviewResult['verdict'])
          : ('rejected' as const),
        score: Math.max(0, Math.min(10, Number(result.value.score) || 0)),
        issues: Array.isArray(result.value.issues) ? result.value.issues : [],
      },
    };
  }
  async reviewCuration(
    source: SourceQuestionCandidate,
    candidate: CuratedQuestionCandidate,
    requestedLanguage: 'ar' = 'ar',
  ) {
    const result = await this.llm.generateStructured<CurationReviewResult>({
      purpose: 'question-review',
      systemPrompt: `Independently compare the curated question to the immutable source across languages. Approve only if the interrogative target (who/what/which event/when/where/why), question meaning, correct-answer identity, all option identities, and factual scope are preserved and no new facts appear. The immutable answer must directly answer the curated question. A faithful translation, transliteration, or unchanged official proper name is the same answer identity and must not be marked as an answer mismatch merely because scripts differ. Requested locale: ${requestedLanguage}.`,
      userPrompt: JSON.stringify({
        immutableSourceQuestion: source,
        candidate,
      }),
      schema: {
        verdict: ['approved', 'repairable', 'rejected'],
        score: 'number 0-10',
        issues: [{ code: 'string', message: 'string' }],
        sameQuestionMeaning: 'boolean',
        sameCorrectAnswer: 'boolean',
        noNewFacts: 'boolean',
        optionsFaithful: 'boolean',
      },
      temperature: 0.1,
    });
    const value = result.value;
    const fidelity =
      value.sameQuestionMeaning === true &&
      value.sameCorrectAnswer === true &&
      value.noNewFacts === true &&
      value.optionsFaithful === true;
    return {
      ...result,
      value: {
        ...value,
        verdict:
          fidelity && value.verdict === 'approved'
            ? ('approved' as const)
            : value.verdict === 'repairable'
              ? ('repairable' as const)
              : ('rejected' as const),
        score: Math.max(0, Math.min(10, Number(value.score) || 0)),
        issues: Array.isArray(value.issues) ? value.issues : [],
      },
    };
  }
  async review(
    fact: FactCandidate,
    candidate: PipelineQuestionCandidate,
    requestedLanguage: 'ar' = 'ar',
  ) {
    const result = await this.llm.generateStructured<QuestionReviewResult>({
      purpose: 'question-review',
      systemPrompt: `Independently review the question against the supplied source. The requested locale is ${requestedLanguage}; a faithful Arabic translation or paraphrase of the English source is valid. Compare meaning across languages, not literal wording. Do not trust the writer. Reject unsupported facts, wrong canonical answers, leakage, ambiguity, or poor game suitability.`,
      userPrompt: JSON.stringify({ fact, candidate, requestedLanguage }),
      schema: {
        verdict: ['approved', 'repairable', 'rejected'],
        score: 'number 0-10',
        issues: [{ code: 'string', message: 'string' }],
      },
      temperature: 0.1,
    });
    const verdict = String(result.value.verdict).toLowerCase();
    return {
      ...result,
      value: {
        verdict: ['approved', 'repairable', 'rejected'].includes(verdict)
          ? (verdict as QuestionReviewResult['verdict'])
          : 'rejected',
        score: Math.max(0, Math.min(10, Number(result.value.score) || 0)),
        issues: Array.isArray(result.value.issues)
          ? result.value.issues.filter(
              (issue) => issue && typeof issue.code === 'string',
            )
          : [],
      },
    };
  }
}
