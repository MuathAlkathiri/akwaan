/**
 * A token is one Match. Nothing else in the product is counted or sold.
 *
 * What an account holds is never stored as a number someone edited. It is the
 * sum of entries that each say why it moved, and no entry is ever rewritten or
 * removed. When a player disputes what they were charged — and in the first
 * weeks somebody will — the answer is readable rather than reconstructed.
 */

/**
 * Why a balance moved. The set is closed: a reason that is not here is a
 * movement nobody designed, and the ledger refuses it rather than recording
 * something no report can explain.
 */
export const TOKEN_LEDGER_REASONS = [
  /** The launch-month campaign, granted once per account. */
  'campaign.launch-month',
  /** Bought, through the payment provider. Carries the provider's own id. */
  'purchase',
  /** Spent starting a Match. The only reason that ever takes tokens away. */
  'match.start',
  /** Given back, because a Match that was charged for never happened. */
  'match.refund',
  /** An operator put it there by hand, for a player who was owed it. */
  'admin.grant',
] as const;

export type TokenLedgerReason = (typeof TOKEN_LEDGER_REASONS)[number];

/** The reasons that may take tokens away. Everything else must add them. */
const DEBIT_REASONS: ReadonlySet<TokenLedgerReason> = new Set(['match.start']);

export interface TokenLedgerEntry {
  accountId: string;
  /** Positive adds, negative takes away. Never zero. */
  delta: number;
  reason: TokenLedgerReason;
  /**
   * What this entry is about: a Match, a payment, an operator's note. Free text
   * because its shape differs per reason, and nothing branches on it.
   */
  reference?: string;
  /**
   * Makes a movement happen at most once, however many times it is asked for.
   *
   * A retried request, a webhook delivered twice, a command replayed after a
   * dropped connection: all arrive with the key of the thing they are about
   * (`match:<id>`, `tap:<charge id>`), so the second one changes nothing instead
   * of charging or granting again.
   */
  idempotencyKey: string;
}

export class TokenLedgerError extends Error {
  constructor(
    readonly code:
      | 'TOKEN_DELTA_INVALID'
      | 'TOKEN_REASON_SIGN_MISMATCH'
      | 'TOKEN_BALANCE_INSUFFICIENT',
    message: string,
  ) {
    super(message);
    this.name = 'TokenLedgerError';
  }
}

/**
 * Checks an entry before anything is written.
 *
 * The sign is checked against the reason, not just against zero: a `purchase`
 * of −5 or a `match.start` of +1 is a bug on the caller's side that would read,
 * afterwards, as a correct ledger saying something false.
 */
export function assertWritableEntry(
  entry: Pick<TokenLedgerEntry, 'delta' | 'reason'>,
): void {
  if (!Number.isInteger(entry.delta) || entry.delta === 0) {
    throw new TokenLedgerError(
      'TOKEN_DELTA_INVALID',
      `A ledger entry moves a whole number of tokens, never ${entry.delta}`,
    );
  }
  const shouldDebit = DEBIT_REASONS.has(entry.reason);
  if (shouldDebit !== entry.delta < 0) {
    throw new TokenLedgerError(
      'TOKEN_REASON_SIGN_MISMATCH',
      `${entry.reason} ${shouldDebit ? 'takes tokens away' : 'adds tokens'}, so a delta of ${entry.delta} cannot be what was meant`,
    );
  }
}

/** What one Match costs. Here because the ledger is what charges it. */
export const MATCH_TOKEN_COST = 1;
