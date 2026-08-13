import type { PipelineDifficulty } from '../application/ai-generation-pipeline.types';

export type QuestionSourceContext = {
  categoryId?: string;
  catalogName?: string;
  categoryName: string;
  locale: 'ar';
};

export type QuestionSourceRequest = QuestionSourceContext & {
  amount: number;
  difficulty?: PipelineDifficulty;
  sourceIds?: string[];
};

export type SourceQuestionCandidate = {
  sourceId: string;
  sourceQuestionId: string;
  sourceUrl: string;
  sourceLicense?: string;
  fetchedAt: string;
  sourceCategory: string;
  originalQuestion: string;
  originalCorrectAnswer: string;
  originalIncorrectAnswers: string[];
  originalType: 'multiple' | 'boolean';
  originalDifficulty: PipelineDifficulty;
  normalizedQuestion: string;
  normalizedCorrectAnswer: string;
  normalizedIncorrectAnswers: string[];
  fingerprint: string;
};

export type QuestionSourceDiagnostic = {
  code: string;
  sourceId: string;
  message?: string;
};

export type QuestionSourceResult = {
  sourceId: string;
  candidates: SourceQuestionCandidate[];
  diagnostics: QuestionSourceDiagnostic[];
  requestedCount: number;
  receivedCount: number;
  durationMs: number;
};

export interface QuestionSourceAdapter {
  readonly sourceId: string;
  supports(context: QuestionSourceContext): boolean;
  fetch(request: QuestionSourceRequest): Promise<QuestionSourceResult>;
}

export const QUESTION_SOURCE_ADAPTERS = Symbol('QUESTION_SOURCE_ADAPTERS');
