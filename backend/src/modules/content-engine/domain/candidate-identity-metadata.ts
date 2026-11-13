export class CandidateIdentityConflictError extends Error {
  constructor(readonly field: string) {
    super(`Conflicting candidate identity metadata: ${field}`);
    this.name = 'CandidateIdentityConflictError';
  }
}

/** Persistable identity takes precedence; older candidates may carry it in authoring. */
export function candidateIdentityMetadata(
  draft: Record<string, unknown>,
  authoring?: Record<string, unknown> | null,
): Record<string, unknown> {
  const metadata = (
    draft.metadata && typeof draft.metadata === 'object' ? draft.metadata : {}
  ) as Record<string, unknown>;
  const result = { ...metadata };
  for (const key of ['familyKey', 'subject', 'entityId', 'tags', 'source']) {
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
