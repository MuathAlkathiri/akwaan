import type {
  GameMode,
  QuestionAssetType,
} from '../contracts/asset-provider.interface';
import type { PipelineDifficulty } from '../application/ai-generation-pipeline.types';

export type KnowledgePolicy = 'required' | 'preferred' | 'optional';
export type FreshnessPolicy = 'static' | 'seasonal' | 'live';
export type VerificationPolicy = 'required' | 'preferred' | 'local-allowed';

export type KnowledgePack = {
  id: string;
  version: number;
  categoryKeys: string[];
  topicIntents: string[];
  sourceStrategies: Array<'local' | 'web'>;
  sourcePreferenceByIntent: Record<string, 'structured' | 'narrative' | 'both'>;
  queryTemplates: string[];
  knowledgePolicy: KnowledgePolicy;
  freshnessPolicy: FreshnessPolicy;
  verificationPolicy: VerificationPolicy;
  difficultyMix: Record<PipelineDifficulty, number>;
  allowedGameModes: GameMode[];
  supportedAssetTypes: QuestionAssetType[];
  diversity: { maxSameAnswer: number; maxSameTopic: number };
  localKnowledgeFiles?: string[];
  candidatesByIntent?: Record<
    string,
    Array<{
      entity: string;
      aliases: string[];
      difficulties?: PipelineDifficulty[];
    }>
  >;
  songExtension?: { catalogRequired: true; audioRequired: true };
};

export type EvidenceRecord = {
  sourceId: string;
  provider: string;
  title: string;
  url: string;
  excerpt: string;
  retrievedAt: string;
  publishedAt?: string;
  trustScore: number;
  sourceType?: 'local' | 'encyclopedia' | 'structured-data' | 'web';
  language?: string;
  independenceGroup?: string;
  propertyId?: string;
};

export type KnowledgeUnit = {
  id: string;
  cacheKey: string;
  packId: string;
  topicIntent: string;
  fact: string;
  canonicalAnswer: string;
  acceptedAnswers: string[];
  entities: string[];
  evidence: EvidenceRecord[];
  confidence: number;
  status: 'verified' | 'conflicted' | 'rejected';
  factHash: string;
  expiresAt: Date;
};

export type ResearchRequest = {
  cacheKey: string;
  pack: KnowledgePack;
  topicIntent: string;
  categoryName: string;
  query: string;
  locale?: string;
  entityHint?: string;
  candidateSource?: string;
  entityType?: string;
  localSource?: { title: string; content: string; preferredExcerpt?: string };
};

export type ResearchProviderResult = {
  provider: string;
  facts: Array<{
    fact: string;
    canonicalAnswer: string;
    acceptedAnswers?: string[];
    entities?: string[];
    evidence: EvidenceRecord;
    confidence: number;
  }>;
  warnings?: string[];
  timingMs?: number;
  diagnostics?: {
    query: string;
    language?: string;
    fallbackLanguageUsed?: boolean;
    resolvedEntityIds?: string[];
    acceptedFacts: number;
    rejectedFacts: number;
  };
};

export type ResearchProviderFailureCode =
  | 'PROVIDER_DISABLED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_RESPONSE_TOO_LARGE'
  | 'PROVIDER_RESPONSE_INVALID'
  | 'ENTITY_NOT_FOUND'
  | 'ENTITY_AMBIGUOUS'
  | 'ENTITY_MATCH_WEAK';

export class ResearchProviderError extends Error {
  constructor(
    readonly code: ResearchProviderFailureCode,
    message: string = code,
  ) {
    super(message);
  }
}

export interface KnowledgeResearchProvider {
  readonly id: string;
  supports(request: ResearchRequest): boolean;
  research(request: ResearchRequest): Promise<ResearchProviderResult>;
}

export const KNOWLEDGE_RESEARCH_PROVIDERS = Symbol(
  'KNOWLEDGE_RESEARCH_PROVIDERS',
);
