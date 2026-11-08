import {
  APPROVAL_CARRIED_FORWARD_EVENT,
  hasTrustedCandidateApproval,
  isApprovalValidAtRevision,
} from './candidate-approval-provenance';

const reviewer = { id: 'rev-1', email: 'reviewer@example.test' };
const event = (
  action: string,
  revision: number,
  details: object | null = null,
) => ({
  action,
  actorId: reviewer.id,
  actorEmail: reviewer.email,
  occurredAt: new Date(),
  revision,
  reasonCode: null,
  explanation: null,
  details,
});
const carried = (from: number, overrides: object = {}) =>
  event(APPROVAL_CARRIED_FORWARD_EVENT, from + 1, {
    fromRevision: from,
    toRevision: from + 1,
    originalApproval: {
      revision: 2,
      reviewerId: reviewer.id,
      reviewerEmail: reviewer.email,
    },
    ...overrides,
  });
const candidate = (reviewRevision: number, extraEvents: object[] = []) =>
  ({
    reviewStatus: 'approved',
    reviewRevision,
    reviewDecision: {
      decision: 'approved',
      reviewerId: reviewer.id,
      reviewerEmail: reviewer.email,
      revision: 2,
    },
    reviewEvents: [event('assessed', 1), event('approved', 2), ...extraEvents],
  }) as never;

describe('isApprovalValidAtRevision (R4-C)', () => {
  it('accepts the human decision at its own revision', () => {
    expect(isApprovalValidAtRevision(candidate(2), 2)).toBe(true);
  });

  it('accepts a contiguous carry-forward chain bound to the original decision', () => {
    const c = candidate(4, [carried(2), carried(3)]);
    expect(isApprovalValidAtRevision(c, 3)).toBe(true);
    expect(isApprovalValidAtRevision(c, 4)).toBe(true);
  });

  it('does not count a carry-forward as a human approval', () => {
    const c = candidate(3, [carried(2)]);
    expect(hasTrustedCandidateApproval(c)).toBe(true);
    expect(
      (c as { reviewEvents: { action: string }[] }).reviewEvents.filter(
        (e) => e.action === 'approved',
      ),
    ).toHaveLength(1);
  });

  it.each([
    ['a gap in the chain', candidate(4, [carried(3)]), 4],
    [
      'a non-carry-forward event in range',
      candidate(3, [event('edited', 3)]),
      3,
    ],
    [
      'two events at one revision',
      candidate(3, [carried(2), event('edited', 3)]),
      3,
    ],
    [
      'a different original reviewer',
      candidate(3, [
        carried(2, {
          originalApproval: {
            revision: 2,
            reviewerId: 'x',
            reviewerEmail: reviewer.email,
          },
        }),
      ]),
      3,
    ],
    [
      'a different original decision revision',
      candidate(3, [
        carried(2, {
          originalApproval: {
            revision: 1,
            reviewerId: reviewer.id,
            reviewerEmail: reviewer.email,
          },
        }),
      ]),
      3,
    ],
    [
      'a mislabelled transition',
      candidate(3, [carried(2, { fromRevision: 1 })]),
      3,
    ],
    ['a revision before the decision', candidate(2), 1],
    ['a non-integer revision', candidate(2), '2'],
  ])('fails closed on %s', (_label, c, revision) => {
    expect(isApprovalValidAtRevision(c, revision)).toBe(false);
  });

  it('fails closed when the human approval itself is untrusted', () => {
    const c = {
      ...(candidate(3, [carried(2)]) as object),
      reviewEvents: [carried(2)],
    } as never;
    expect(isApprovalValidAtRevision(c, 3)).toBe(false);
  });
});
