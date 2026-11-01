import type { LibrarySourceWarning } from './library-row';

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

/**
 * Evidence from an approved library row rather than a search. Shaped as
 * retrieved evidence so everything that lists evidence keeps working.
 */
export interface StructuredSeedEvidence extends RetrievedFactEvidence {
  method: 'structured-seed';
  additionalSourceUrls?: string[];
  verifiedOn: string;
  revalidateAfter: string | null;
  sourceWarning: LibrarySourceWarning | null;
}

export const SEED_NOT_COVERED_REASONS = [
  'ANSWER_CHANGED',
  'WINDOW_CHANGED',
  'EVIDENCE_EXPIRED',
] as const;
export type SeedNotCoveredReason = (typeof SEED_NOT_COVERED_REASONS)[number];

export type StructuredSeedBinding =
  | {
      covered: true;
      libraryId: string;
      verifiedAnswer: string;
      /** When this evidence goes stale. Null for a row that does not. */
      revalidateAfter: string | null;
      evidence: StructuredSeedEvidence;
    }
  | {
      covered: false;
      reason: SeedNotCoveredReason;
      libraryId: string | null;
    };

export interface ClaimVerificationResult {
  claim: string;
  state: FactEvidenceState;
  evidence: Array<RetrievedFactEvidence | StructuredSeedEvidence>;
  attempts: number;
  reason: string;
}

export interface FactVerificationResult {
  state: FactEvidenceState;
  claims: ClaimVerificationResult[];
  automaticAdvance: boolean;
  /** Present on library-anchored candidates, covered or not. */
  seedBinding?: StructuredSeedBinding;
}
