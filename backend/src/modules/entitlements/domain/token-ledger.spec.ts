import {
  MATCH_TOKEN_COST,
  TokenLedgerError,
  assertWritableEntry,
} from './token-ledger';

describe('what a ledger entry is allowed to say', () => {
  it('refuses a movement of nothing', () => {
    expect(() =>
      assertWritableEntry({ delta: 0, reason: 'admin.grant' }),
    ).toThrow(TokenLedgerError);
  });

  it('refuses a fraction of a token, since a token is one Match', () => {
    expect(() =>
      assertWritableEntry({ delta: 0.5, reason: 'purchase' }),
    ).toThrow(TokenLedgerError);
  });

  it.each([
    ['purchase', -5],
    ['campaign.launch-month', -1],
    ['admin.grant', -1],
    ['match.refund', -1],
  ] as const)('refuses %s that takes tokens away', (reason, delta) => {
    // A correct ledger that says something false is worse than a refused write:
    // the balance would be right and every report of why would be wrong.
    expect(() => assertWritableEntry({ delta, reason })).toThrow(
      /adds tokens/,
    );
  });

  it('refuses a match start that adds tokens', () => {
    expect(() =>
      assertWritableEntry({ delta: 1, reason: 'match.start' }),
    ).toThrow(/takes tokens away/);
  });

  it.each([
    ['purchase', 5],
    ['campaign.launch-month', 5],
    ['admin.grant', 1],
    ['match.refund', 1],
    ['match.start', -1],
  ] as const)('allows %s with the sign it means', (reason, delta) => {
    expect(() => assertWritableEntry({ delta, reason })).not.toThrow();
  });

  it('charges one token for a Match', () => {
    expect(MATCH_TOKEN_COST).toBe(1);
  });
});
