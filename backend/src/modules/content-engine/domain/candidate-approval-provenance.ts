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

/** R4-C: audit event recording an automated, verified approval carry-forward. */
export const APPROVAL_CARRIED_FORWARD_EVENT = 'approval_carried_forward';

/**
 * R4-C: whether the trusted human approval still covers review revision
 * `revision`. It does at the decision's own revision. It also does at any later
 * revision reached only through a contiguous chain of carry-forward events, one
 * per revision. Each event must name the transition (from r-1 to r) and the
 * exact original human decision (revision and reviewer). Any other event in
 * that range, a gap, or a mismatch fails closed. The human decision is never
 * rewritten, so a carry-forward can never pose as a new human approval.
 */
export function isApprovalValidAtRevision(
  candidate: Partial<EngineCandidateDocument>,
  revision: unknown,
): boolean {
  if (!hasTrustedCandidateApproval(candidate)) return false;
  const decision = candidate.reviewDecision as {
    revision: number;
    reviewerId: string;
    reviewerEmail: string;
  };
  if (typeof revision !== 'number' || !Number.isInteger(revision)) return false;
  if (revision < decision.revision) return false;
  if (revision === decision.revision) return true;
  const events = candidate.reviewEvents ?? [];
  for (let r = decision.revision + 1; r <= revision; r += 1) {
    const atRevision = events.filter((event) => event.revision === r);
    if (atRevision.length !== 1) return false;
    const [event] = atRevision;
    const details = (event.details ?? {}) as {
      fromRevision?: unknown;
      toRevision?: unknown;
      originalApproval?: {
        revision?: unknown;
        reviewerId?: unknown;
        reviewerEmail?: unknown;
      };
    };
    if (
      event.action !== APPROVAL_CARRIED_FORWARD_EVENT ||
      details.fromRevision !== r - 1 ||
      details.toRevision !== r ||
      details.originalApproval?.revision !== decision.revision ||
      details.originalApproval?.reviewerId !== decision.reviewerId ||
      details.originalApproval?.reviewerEmail !== decision.reviewerEmail
    ) {
      return false;
    }
  }
  return true;
}
