import type {
  AssetRequest,
  GameMode,
  QuestionAssetType,
} from '../contracts/asset-provider.interface';
import type { SourceQuestionCandidate } from '../domain/question-source.types';

export type PipelineDifficulty = 'easy' | 'medium' | 'hard';
export type GenerationDiagnostic = {
  code: string;
  stage: string;
  message?: string;
};
export type GenerationPlanSlot = {
  slotId: string;
  difficulty: PipelineDifficulty;
  gameMode: GameMode;
  topicIntent?: string;
  entityCandidate?: string;
  candidateAliases?: string[];
  candidateSource?: 'knowledge-pack-seed' | string;
  candidateAliasUsed?: string;
  requestedAssetType?: QuestionAssetType;
  sourceCandidate?: SourceQuestionCandidate;
};
export type CuratedQuestionCandidate = PipelineQuestionCandidate & {
  curationStatus?: 'APPROVE' | 'REJECT';
  sameMeaning?: boolean;
  curationConfidence?: number;
  translationNotes?: string;
  sourceFingerprint?: string;
};
export type CurationReviewResult = QuestionReviewResult & {
  sameQuestionMeaning: boolean;
  sameCorrectAnswer: boolean;
  noNewFacts: boolean;
  optionsFaithful: boolean;
};
export type FactCandidate = {
  id: string;
  fact: string;
  canonicalAnswer: string;
  acceptedAnswerHints: string[];
  entities: string[];
  topic?: string;
  source: { title: string; url: string; excerpt: string };
  sources?: Array<{
    sourceId: string;
    title: string;
    url: string;
    excerpt: string;
  }>;
  confidence: number;
};
export type PipelineQuestionCandidate = {
  question: string;
  answer: string;
  acceptedAnswers: string[];
  wrongAnswers: string[];
  difficulty: PipelineDifficulty;
  gameMode: GameMode;
  type: QuestionAssetType;
  explanation: string;
  assetRequest: AssetRequest | null;
  knowledgeFactIds?: string[];
  sourceIds?: string[];
  qualityScore?: number;
  issues?: string[];
};
export type QuestionReviewResult = {
  verdict: 'approved' | 'repairable' | 'rejected';
  score: number;
  issues: Array<{ code: string; message: string }>;
};
export type PipelineSlotResult = {
  slotId: string;
  status: 'created' | 'rejected' | 'failed';
  draft?: PipelineQuestionCandidate & { aiMetadata: Record<string, unknown> };
  diagnostics: GenerationDiagnostic[];
  topicIntent?: string;
  entityCandidate?: string;
  candidateSource?: string;
  providersAttempted?: string[];
  providersUsed?: string[];
  acceptedEvidenceCount?: number;
  blockingIssues?: string[];
  warnings?: string[];
  reviewerScore?: number;
  repairAttempts?: number;
  canonicalFinalDecision?: 'created' | 'rejected' | 'failed';
  totalTimingMs?: number;
  requestedLanguage?: 'ar';
  detectedLanguage?: 'ar' | 'en' | 'mixed' | 'unknown';
  arabicCharacterRatio?: number;
  foreignCharacterRatio?: number;
  allowedProperNameRatio?: number;
  languageRepairAttempted?: boolean;
  languageRepairSucceeded?: boolean;
  languageIssueCodes?: string[];
};

export type SourceCandidatePipelineDiagnostic = {
  sourceId: string;
  sourceQuestionId: string;
  sourceQuestion: string;
  sourceAnswer: string;
  curatedQuestion: string | null;
  curatedAnswer: string | null;
  semanticFingerprint: string;
  duplicateScore: number;
  validationResult: {
    status: 'PASS' | 'FAIL' | 'NOT_EVALUATED';
    issueCodes: string[];
  };
  outcome: 'CREATED' | 'REJECTED' | 'FAILED' | 'NOT_SELECTED';
  rejectionReason: string | null;
};
