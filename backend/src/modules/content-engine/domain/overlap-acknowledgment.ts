import { createHash } from 'crypto';
import { candidateIdentityMetadata } from './candidate-identity-metadata';
import {
  compareContentIdentities,
  extractContentIdentity,
} from './content-identity.policy';
import { ContentIdentityComparison } from './content-identity.types';

/**
 * Overlap acknowledgment contract (R4-A).
 *
 * A POTENTIAL_OVERLAP finding is acknowledgeable only through a deterministic,
 * server-computed fingerprint. The fingerprint binds three things, so any change
 * to any of them yields a different fingerprint and a stale acknowledgment:
 *  - the finding code and the comparison reason,
 *  - the candidate's content version (hash of its identity-bearing content),
 *  - the referenced record (kind, stable id, and its content version).
 *
 * The server never trusts a submitted fingerprint: it recomputes the fresh
 * evidence and only accepts exact matches.
 */
export const OVERLAP_FINGERPRINT_VERSION = 'ovl1';
export const OVERLAP_FINGERPRINT_PATTERN = /^ovl1:[0-9a-f]{64}$/;

export type OverlapReferenceKind =
  | 'CANONICAL_READY'
  | 'CANONICAL_DRAFT'
  | 'APPROVED_CANDIDATE'
  | 'BATCH_CANDIDATE';

export interface OverlapReference {
  kind: OverlapReferenceKind;
  /** ContentItem `_id` for canonical items, `candidateId` for candidates. */
  id: string;
  contentHash: string;
}

export interface OverlapEvidence {
  code: string;
  fingerprint: string;
  candidateContentHash: string;
  reasonCode: string | null;
  reference: OverlapReference;
}

/** A proven duplicate is never acknowledgeable. */
export const PROVEN_HISTORICAL_DUPLICATE_PATTERN =
  /^(DUPLICATE_HISTORICAL_|DUPLICATE_APPROVED_CANDIDATE)/;

export function isOverlapCode(code: string): boolean {
  return code.startsWith('POTENTIAL_OVERLAP_');
}

const CONTENT_FIELDS = [
  'prompt',
  'answerPayload',
  'mechanicPayload',
  'media',
  'revealMedia',
] as const;

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  const withJson = value as { toJSON?: () => unknown };
  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof withJson.toJSON === 'function'
  ) {
    return canonicalize(withJson.toJSON());
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => [key, canonicalize(entry)]);
    return Object.fromEntries(entries);
  }
  return value;
}

function sha256(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

/**
 * Content version of a candidate or ContentItem: only identity-bearing content,
 * never target, status, or review fields, so the same content hashes the same at
 * generation, edit, re-screen, approval, and DRAFT creation.
 */
export function contentVersionHash(
  draft: Record<string, unknown>,
  identityMetadata: Record<string, unknown>,
): string {
  const content: Record<string, unknown> = {};
  for (const field of CONTENT_FIELDS) content[field] = draft[field] ?? null;
  content.metadata = identityMetadata;
  return sha256(content);
}

export function overlapFingerprint(input: {
  code: string;
  candidateContentHash: string;
  reasonCode: string | null;
  reference: OverlapReference;
}): string {
  return `${OVERLAP_FINGERPRINT_VERSION}:${sha256({
    v: OVERLAP_FINGERPRINT_VERSION,
    code: input.code,
    candidateContentHash: input.candidateContentHash,
    reasonCode: input.reasonCode,
    referenceKind: input.reference.kind,
    referenceId: input.reference.id,
    referenceContentHash: input.reference.contentHash,
  })}`;
}

export function buildOverlapEvidence(input: {
  code: string;
  candidateContentHash: string;
  reasonCode: string | null;
  reference: OverlapReference;
}): OverlapEvidence {
  return {
    code: input.code,
    candidateContentHash: input.candidateContentHash,
    reasonCode: input.reasonCode,
    reference: { ...input.reference },
    fingerprint: overlapFingerprint(input),
  };
}

/** Same identity input the deterministic screen builds for a draft. */
export function identityOf(
  draft: Record<string, unknown>,
  identityMetadata: Record<string, unknown>,
  scopeKey?: string,
  worldKey?: string,
) {
  return extractContentIdentity({
    scopeKey,
    worldKey,
    prompt: draft.prompt as any,
    answerPayload: (draft.answerPayload ?? {}) as any,
    mechanicPayload: draft.mechanicPayload as any,
    media: draft.media as any,
    revealMedia: draft.revealMedia as any,
    metadata: identityMetadata as any,
  });
}

/**
 * Recomputes one in-batch comparison against the referenced sibling's current
 * content. Identity conflicts propagate: an unverifiable comparison never
 * resolves an overlap.
 */
export function compareBatchCandidates(input: {
  candidateDraft: Record<string, unknown>;
  candidateAuthoring?: Record<string, unknown> | null;
  referenceId: string;
  referenceDraft: Record<string, unknown>;
  referenceAuthoring?: Record<string, unknown> | null;
  scopeKey?: string;
  worldKey?: string;
}): {
  comparison: ContentIdentityComparison;
  evidence: OverlapEvidence;
} {
  const candidateMetadata = candidateIdentityMetadata(
    input.candidateDraft,
    input.candidateAuthoring,
  );
  const referenceMetadata = candidateIdentityMetadata(
    input.referenceDraft,
    input.referenceAuthoring,
  );
  const comparison = compareContentIdentities(
    identityOf(
      input.candidateDraft,
      candidateMetadata,
      input.scopeKey,
      input.worldKey,
    ),
    identityOf(
      input.referenceDraft,
      referenceMetadata,
      input.scopeKey,
      input.worldKey,
    ),
  );
  const evidence = buildOverlapEvidence({
    code: 'POTENTIAL_OVERLAP_IN_BATCH',
    candidateContentHash: contentVersionHash(
      input.candidateDraft,
      candidateMetadata,
    ),
    reasonCode: comparison.reasonCode ?? null,
    reference: {
      kind: 'BATCH_CANDIDATE',
      id: input.referenceId,
      contentHash: contentVersionHash(input.referenceDraft, referenceMetadata),
    },
  });
  return { comparison, evidence };
}

/** Client-facing summary of evidence awaiting acknowledgment. */
export function describeOverlapEvidence(evidence: OverlapEvidence) {
  return {
    fingerprint: evidence.fingerprint,
    code: evidence.code,
    reasonCode: evidence.reasonCode,
    reference: { ...evidence.reference },
  };
}
