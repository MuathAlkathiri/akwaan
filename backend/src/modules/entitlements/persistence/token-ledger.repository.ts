import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { TokenLedgerEntryDocument } from './token-ledger-entry.schema';
import { TokenBalanceDocument } from './token-balance.schema';
import { TokenLedgerEntry } from '../domain/token-ledger';

/** A movement that was refused because the account could not afford it. */
export const INSUFFICIENT = Symbol('insufficient');

export interface TokenMovement {
  entry: TokenLedgerEntry;
  balanceAfter: number;
}

/**
 * The tokens' only data access.
 *
 * Every method is scoped by `accountId`, so no query reads across accounts.
 */
@Injectable()
export class TokenLedgerRepository {
  constructor(
    @InjectModel(TokenLedgerEntryDocument.name)
    private readonly entries: Model<TokenLedgerEntryDocument>,
    @InjectModel(TokenBalanceDocument.name)
    private readonly balances: Model<TokenBalanceDocument>,
  ) {}

  async balanceOf(accountId: string): Promise<number> {
    const found = await this.balances.findOne({ accountId }).lean();
    return found?.balance ?? 0;
  }

  /**
   * Moves the balance and records why, or reports that it could not.
   *
   * A credit upserts, so an account that has never held a token needs no
   * document created ahead of time. A debit updates only while the balance
   * still covers it, which is what makes two concurrent Matches resolve to one
   * spend: the condition is evaluated by the database at the moment of the
   * write, not read beforehand by the caller.
   *
   * Both writes take the caller's transaction when there is one, so a Match
   * that fails to persist cannot leave a charge behind.
   */
  async apply(
    entry: TokenLedgerEntry,
    transaction?: ClientSession,
  ): Promise<TokenMovement | typeof INSUFFICIENT> {
    const session = transaction ?? undefined;
    const moved = entry.delta > 0
      ? await this.balances.findOneAndUpdate(
          { accountId: entry.accountId },
          { $inc: { balance: entry.delta } },
          { upsert: true, new: true, session },
        )
      : await this.balances.findOneAndUpdate(
          { accountId: entry.accountId, balance: { $gte: -entry.delta } },
          { $inc: { balance: entry.delta } },
          { new: true, session },
        );
    if (!moved) return INSUFFICIENT;

    await this.entries.create(
      [
        {
          accountId: entry.accountId,
          delta: entry.delta,
          reason: entry.reason,
          reference: entry.reference,
          idempotencyKey: entry.idempotencyKey,
          balanceAfter: moved.balance,
        },
      ],
      { session },
    );
    return { entry, balanceAfter: moved.balance };
  }

  /** The movement already recorded under this key, if there is one. */
  async findByIdempotencyKey(
    accountId: string,
    idempotencyKey: string,
  ): Promise<TokenMovement | null> {
    const found = await this.entries
      .findOne({ accountId, idempotencyKey })
      .lean();
    if (!found) return null;
    return {
      entry: {
        accountId: found.accountId,
        delta: found.delta,
        reason: found.reason,
        reference: found.reference,
        idempotencyKey: found.idempotencyKey,
      },
      balanceAfter: found.balanceAfter,
    };
  }

  /** An account's movements, newest first. */
  async history(
    accountId: string,
    limit: number,
  ): Promise<readonly TokenMovement[]> {
    const found = await this.entries
      .find({ accountId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return found.map((document) => ({
      entry: {
        accountId: document.accountId,
        delta: document.delta,
        reason: document.reason,
        reference: document.reference,
        idempotencyKey: document.idempotencyKey,
      },
      balanceAfter: document.balanceAfter,
    }));
  }
}
