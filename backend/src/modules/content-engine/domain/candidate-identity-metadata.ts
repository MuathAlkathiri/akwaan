export class CandidateIdentityConflictError extends Error {
  constructor(readonly field: string) {
    super(`Conflicting candidate identity metadata: ${field}`);
    this.name = 'CandidateIdentityConflictError';
  }
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolves the effective canonical familyKey for a candidate without mutating
 * `authoring.assignedSlot.familyKey`:
 * 1. Explicit draft/authoring identity conflict check (`draft.metadata.familyKey` vs `authoring.familyKey`).
 * 2. Approved family reassignment (`reassignedFamilyKey` / `effectiveFamilyKey` in `reviewDecision` or `authoring.familyCompliance`).
 * 3. Explicit `draft.metadata.familyKey` or legacy `authoring.familyKey`.
 * 4. Slot directive `authoring.assignedSlot.familyKey`, provided `authoring.familyCompliance` is not an unresolved structural/heuristic mismatch.
 */
export function resolveEffectiveCandidateFamilyKey(
  draft: Record<string, unknown>,
  authoring?: Record<string, unknown> | null,
  reviewDecision?: Record<string, unknown> | null,
): string | undefined {
  const metadata = (
    draft.metadata && typeof draft.metadata === 'object' ? draft.metadata : {}
  ) as Record<string, unknown>;

  const draftFamilyKey = normalizeOptionalString(metadata.familyKey);
  const authoringFamilyKey = normalizeOptionalString(authoring?.familyKey);

  if (
    draftFamilyKey !== undefined &&
    authoringFamilyKey !== undefined &&
    draftFamilyKey !== authoringFamilyKey
  ) {
    throw new CandidateIdentityConflictError('familyKey');
  }

  const compliance = (
    authoring?.familyCompliance &&
    typeof authoring.familyCompliance === 'object'
      ? authoring.familyCompliance
      : undefined
  ) as
    | {
        isCompliant?: boolean;
        verificationMethod?: string;
        resolvedByReviewerId?: string;
        reassignedFamilyKey?: unknown;
        effectiveFamilyKey?: unknown;
      }
    | undefined;

  const resolution = (
    reviewDecision?.familyComplianceResolution &&
    typeof reviewDecision.familyComplianceResolution === 'object'
      ? reviewDecision.familyComplianceResolution
      : undefined
  ) as
    | {
        resolvedByReviewer?: boolean;
        reassignedFamilyKey?: unknown;
        effectiveFamilyKey?: unknown;
      }
    | undefined;

  const reassignedFamilyKey =
    normalizeOptionalString(resolution?.reassignedFamilyKey) ??
    normalizeOptionalString(resolution?.effectiveFamilyKey) ??
    normalizeOptionalString(compliance?.reassignedFamilyKey) ??
    normalizeOptionalString(compliance?.effectiveFamilyKey);

  if (
    draftFamilyKey !== undefined &&
    reassignedFamilyKey !== undefined &&
    draftFamilyKey !== reassignedFamilyKey
  ) {
    throw new CandidateIdentityConflictError('familyKey');
  }

  if (reassignedFamilyKey !== undefined) {
    return reassignedFamilyKey;
  }

  const isResolved = Boolean(
    compliance?.isCompliant === true ||
    compliance?.resolvedByReviewerId ||
    resolution?.resolvedByReviewer,
  );
  const isUnresolvedMismatch = Boolean(
    compliance &&
    compliance.isCompliant === false &&
    compliance.verificationMethod !== 'manual_review' &&
    !isResolved,
  );

  if (draftFamilyKey !== undefined) {
    return draftFamilyKey;
  }
  if (authoringFamilyKey !== undefined) {
    return authoringFamilyKey;
  }

  if (isUnresolvedMismatch) {
    return undefined;
  }

  const assignedSlot = (
    authoring?.assignedSlot && typeof authoring.assignedSlot === 'object'
      ? authoring.assignedSlot
      : undefined
  ) as { familyKey?: unknown } | undefined;

  return normalizeOptionalString(assignedSlot?.familyKey);
}

/** Persistable identity takes precedence; older candidates may carry it in authoring. */
export function candidateIdentityMetadata(
  draft: Record<string, unknown>,
  authoring?: Record<string, unknown> | null,
  reviewDecision?: Record<string, unknown> | null,
): Record<string, unknown> {
  const metadata = (
    draft.metadata && typeof draft.metadata === 'object' ? draft.metadata : {}
  ) as Record<string, unknown>;
  const result = { ...metadata };
  for (const key of ['familyKey', 'subject', 'entityId', 'tags', 'source']) {
    if (key === 'familyKey') {
      const effectiveFamilyKey = resolveEffectiveCandidateFamilyKey(
        draft,
        authoring,
        reviewDecision,
      );
      if (effectiveFamilyKey !== undefined) {
        result.familyKey = effectiveFamilyKey;
      } else {
        delete result.familyKey;
      }
      continue;
    }
    const normalize = (value: unknown) =>
      typeof value === 'string' && key !== 'tags' ? value.trim() : value;
    const draftValue = normalize(result[key]);
    const authoringValue = normalize(authoring?.[key]);
    if (
      draftValue != null &&
      authoringValue != null &&
      JSON.stringify(draftValue) !== JSON.stringify(authoringValue)
    ) {
      throw new CandidateIdentityConflictError(key);
    }
    if (draftValue !== undefined) result[key] = draftValue;
    else if (authoringValue !== undefined) result[key] = authoringValue;
  }
  return result;
}
