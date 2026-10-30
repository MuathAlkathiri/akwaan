import { EngineCandidateDocument } from '../schemas/engine-candidate.schema';

/**
 * Validates trustworthy human approval provenance according to Content Engine Slice 2A rules:
 * 1. reviewStatus must be 'approved'.
 * 2. reviewDecision must explicitly declare decision: 'approved'.
 * 3. reviewDecision must carry reviewerId, reviewerEmail, and numeric revision.
 * 4. A matching 'approved' event must exist in reviewEvents matching actor and revision.
 * Stale approvals (where material edits invalidated prior assessments) or forged statuses fail.
 */
export function hasTrustedCandidateApproval(
  candidate: Partial<EngineCandidateDocument>,
): boolean {
  if (candidate.reviewStatus !== 'approved') return false;
  const decision = candidate.reviewDecision as
    | {
        decision?: string;
        reviewerId?: string;
        reviewerEmail?: string;
        revision?: number;
      }
    | null
    | undefined;
  if (
    decision?.decision !== 'approved' ||
    !decision.reviewerId ||
    !decision.reviewerEmail ||
    typeof decision.revision !== 'number'
  ) {
    return false;
  }
  return Boolean(
    candidate.reviewEvents?.some(
      (event) =>
        event.action === 'approved' &&
        event.actorId === decision.reviewerId &&
        event.actorEmail === decision.reviewerEmail &&
        event.revision === decision.revision,
    ),
  );
}

/**
 * Extracts the decision revision from a candidate's reviewDecision.
 */
export function reviewDecisionRevision(
  candidate: Partial<EngineCandidateDocument>,
): number | null {
  const decision = candidate.reviewDecision as
    { revision?: number } | null | undefined;
  return typeof decision?.revision === 'number' ? decision.revision : null;
}
