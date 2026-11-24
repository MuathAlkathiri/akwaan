import { Injectable, Logger } from '@nestjs/common';
import { ClientSession } from 'mongoose';
import {
  INSUFFICIENT,
  TokenLedgerRepository,
  TokenMovement,
} from '../persistence/token-ledger.repository';
import {
  MATCH_TOKEN_COST,
  TokenLedgerError,
  TokenLedgerReason,
  assertWritableEntry,
} from '../domain/token-ledger';

/**
 * What the rest of the app asks about tokens.
 *
 * Three things happen here and nowhere else: tokens are given, tokens are
 * spent, and what happened is read back. No caller writes the ledger itself,
 * so the sign rules and the at-most-once rule cannot be bypassed by a new
 * feature that forgot them.
 */
@Injectable()
export class TokenLedgerService {
  private readonly logger = new Logger(TokenLedgerService.name);

  constructor(private readonly ledger: TokenLedgerRepository) {}

  balanceOf(accountId: string): Promise<number> {
    return this.ledger.balanceOf(accountId);
  }

  history(accountId: string, limit = 50): Promise<readonly TokenMovement[]> {
    return this.ledger.history(accountId, Math.min(Math.max(limit, 1), 200));
  }

  /** Gives tokens. Asking twice with the same key gives them once. */
  async grant(input: {
    accountId: string;
    amount: number;
    reason: Extract<
      TokenLedgerReason,
      | 'campaign.launch-month'
      | 'purchase'
      | 'match.refund'
      | 'admin.grant'
      | 'gift-code'
    >;
    reference?: string;
    idempotencyKey: string;
    transaction?: ClientSession;
  }): Promise<TokenMovement> {
    const entry = {
      accountId: input.accountId,
      delta: input.amount,
      reason: input.reason,
      reference: input.reference,
      idempotencyKey: input.idempotencyKey,
    };
    assertWritableEntry(entry);
    return this.applyOnce(entry, input.transaction);
  }

  /**
   * Takes the token a Match costs, or reports that there is none to take.
   *
   * Returns rather than throws when the balance is short, because that is an
   * ordinary answer to give a player — not a failure. A caller that cannot
   * afford it shows the shop; it does not handle an exception.
   *
   * Pass the Match's own transaction: charged and created then happen together,
   * so a Match that fails to persist leaves nobody paying for it.
   */
  async spendForMatch(input: {
    accountId: string;
    matchId: string;
    transaction?: ClientSession;
  }): Promise<{ charged: true; balanceAfter: number } | { charged: false }> {
    const entry = {
      accountId: input.accountId,
      delta: -MATCH_TOKEN_COST,
      reason: 'match.start' as const,
      reference: input.matchId,
      idempotencyKey: `match:${input.matchId}`,
    };
    assertWritableEntry(entry);

    const already = await this.ledger.findByIdempotencyKey(
      entry.accountId,
      entry.idempotencyKey,
    );
    if (already) {
      return { charged: true, balanceAfter: already.balanceAfter };
    }

    const movement = await this.ledger.apply(entry, input.transaction);
    if (movement === INSUFFICIENT) {
      this.logger.log({
        event: 'token_spend_refused',
        accountId: input.accountId,
        matchId: input.matchId,
      });
      return { charged: false };
    }
    return { charged: true, balanceAfter: movement.balanceAfter };
  }

  /**
   * Applies a movement, treating a replay as the movement it already made.
   *
   * The unique index is what decides: a second writer with the same key loses
   * the insert, and is then told what the first one recorded. Checking first
   * would leave a window between the check and the write that a retry can slip
   * through.
   */
  private async applyOnce(
    entry: Parameters<TokenLedgerRepository['apply']>[0],
    transaction?: ClientSession,
  ): Promise<TokenMovement> {
    const already = await this.ledger.findByIdempotencyKey(
      entry.accountId,
      entry.idempotencyKey,
    );
    if (already) return already;
    try {
      const movement = await this.ledger.apply(entry, transaction);
      if (movement === INSUFFICIENT) {
        throw new TokenLedgerError(
          'TOKEN_BALANCE_INSUFFICIENT',
          'The account cannot cover this movement',
        );
      }
      return movement;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const recorded = await this.ledger.findByIdempotencyKey(
        entry.accountId,
        entry.idempotencyKey,
      );
      if (!recorded) throw error;
      return recorded;
    }
  }
}

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 11000;
