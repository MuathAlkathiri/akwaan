import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FACT_EVIDENCE_RETRIEVER,
  ClaimVerificationResult,
  FactEvidenceRetriever,
  FactEvidenceState,
  FactVerificationResult,
  RetrievedFactEvidence,
} from '../domain/fact-verification.types';

/** Factual verification is retrieval-backed and independent from quality. */
@Injectable()
export class FactVerificationService {
  constructor(
    private readonly config: ConfigService,
    @Optional()
    @Inject(FACT_EVIDENCE_RETRIEVER)
    private readonly retriever?: FactEvidenceRetriever,
  ) {}

  async verify(claims: string[]): Promise<FactVerificationResult> {
    const normalized = [...new Set(claims.map((claim) => claim.trim()))].filter(
      Boolean,
    );
    if (!normalized.length) {
      return { state: 'UNRESOLVED', claims: [], automaticAdvance: false };
    }
    const results: ClaimVerificationResult[] = [];
    for (const claim of normalized.slice(0, this.maxClaims())) {
      results.push(await this.verifyClaim(claim));
    }
    if (normalized.length > this.maxClaims()) {
      results.push({
        claim: `[${normalized.length - this.maxClaims()} additional claims]`,
        state: 'UNRESOLVED',
        evidence: [],
        attempts: 0,
        reason: 'CLAIM_LIMIT_REACHED',
      });
    }
    const state = this.aggregate(results.map((result) => result.state));
    return {
      state,
      claims: results,
      automaticAdvance: state === 'SUPPORTED',
    };
  }

  private async verifyClaim(claim: string): Promise<ClaimVerificationResult> {
    if (!this.retriever) {
      return {
        claim,
        state: 'UNRESOLVED',
        evidence: [],
        attempts: 0,
        reason: 'EVIDENCE_RETRIEVER_UNAVAILABLE',
      };
    }
    const evidence: RetrievedFactEvidence[] = [];
    let attempts = 0;
    let retrievalFailed = false;
    for (let attempt = 1; attempt <= this.maxAttempts(); attempt += 1) {
      attempts = attempt;
      try {
        const rows = await this.retriever.retrieve({
          claim,
          attempt,
          maxResults: this.maxResults(),
        });
        evidence.push(
          ...rows
            .filter((row) => this.isRetrievedEvidence(row))
            .slice(0, this.maxResults() - evidence.length),
        );
        if (
          evidence.some(
            (row) =>
              row.relation === 'supports' || row.relation === 'contradicts',
          )
        ) {
          break;
        }
      } catch {
        retrievalFailed = true;
      }
    }
    const contradicts = evidence.filter(
      (row) => row.relation === 'contradicts',
    );
    if (contradicts.length) {
      return {
        claim,
        state: 'CONTRADICTED',
        evidence,
        attempts,
        reason: 'RETRIEVED_EVIDENCE_CONTRADICTS_CLAIM',
      };
    }
    const supports = evidence.filter((row) => row.relation === 'supports');
    if (supports.length) {
      return {
        claim,
        state: 'SUPPORTED',
        evidence,
        attempts,
        reason: 'RETRIEVED_EVIDENCE_SUPPORTS_CLAIM',
      };
    }
    if (retrievalFailed && !evidence.length) {
      return {
        claim,
        state: 'UNRESOLVED',
        evidence: [],
        attempts,
        reason: 'RETRIEVAL_FAILED',
      };
    }
    return {
      claim,
      state: 'UNSUPPORTED',
      evidence,
      attempts,
      reason: evidence.length
        ? 'EVIDENCE_ONLY_MENTIONS_CLAIM'
        : 'NO_RETRIEVED_EVIDENCE',
    };
  }

  private isRetrievedEvidence(value: RetrievedFactEvidence): boolean {
    if (
      !value?.sourceId?.trim() ||
      !value.sourceName?.trim() ||
      !value.excerpt?.trim() ||
      !value.retrievedAt?.trim()
    ) {
      return false;
    }
    try {
      const url = new URL(value.url);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }

  private aggregate(states: FactEvidenceState[]): FactEvidenceState {
    if (states.includes('CONTRADICTED')) return 'CONTRADICTED';
    if (states.includes('UNRESOLVED')) return 'UNRESOLVED';
    if (states.includes('UNSUPPORTED')) return 'UNSUPPORTED';
    return 'SUPPORTED';
  }

  private maxAttempts(): number {
    return this.integer('ENGINE_VERIFICATION_MAX_ATTEMPTS', 2, 1, 4);
  }

  private maxResults(): number {
    return this.integer('ENGINE_VERIFICATION_MAX_RESULTS', 5, 1, 10);
  }

  private maxClaims(): number {
    return this.integer('ENGINE_VERIFICATION_MAX_CLAIMS', 8, 1, 20);
  }

  private integer(key: string, fallback: number, min: number, max: number) {
    const parsed = Number(this.config.get<string>(key));
    return Number.isInteger(parsed)
      ? Math.max(min, Math.min(max, parsed))
      : fallback;
  }
}
