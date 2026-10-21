export const FACT_EVIDENCE_RETRIEVER = Symbol('FACT_EVIDENCE_RETRIEVER');

export const FACT_EVIDENCE_STATES = [
  'SUPPORTED',
  'CONTRADICTED',
  'UNSUPPORTED',
  'UNRESOLVED',
] as const;
export type FactEvidenceState = (typeof FACT_EVIDENCE_STATES)[number];

export interface RetrievedFactEvidence {
  sourceId: string;
  sourceName: string;
  url: string;
  excerpt: string;
  retrievedAt: string;
  /** Assigned by the retrieval adapter after inspecting the actual source. */
  relation: 'supports' | 'contradicts' | 'mentions';
}

/**
 * Adapter boundary for the existing research/cache stack.
 * Implementations may use KnowledgeAcquisitionCoordinatorService/Wigolo, but
 * must return retrieved source text, never model-invented citations.
 */
export interface FactEvidenceRetriever {
  retrieve(input: {
    claim: string;
    attempt: number;
    maxResults: number;
  }): Promise<RetrievedFactEvidence[]>;
}

export interface ClaimVerificationResult {
  claim: string;
  state: FactEvidenceState;
  evidence: RetrievedFactEvidence[];
  attempts: number;
  reason: string;
}

export interface FactVerificationResult {
  state: FactEvidenceState;
  claims: ClaimVerificationResult[];
  automaticAdvance: boolean;
}
