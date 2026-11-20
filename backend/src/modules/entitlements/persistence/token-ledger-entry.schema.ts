import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { TOKEN_LEDGER_REASONS, TokenLedgerReason } from '../domain/token-ledger';

/**
 * One movement of one account's tokens. Written once, never changed.
 *
 * This is the record, not the number the game reads. A balance cannot be
 * computed from here at the moment of spending without letting two Matches
 * started at once both pass the same check, so the live figure lives in
 * `token_balances` and moves atomically; the two are written in one
 * transaction. See TokenBalanceDocument for why that split is not duplication.
 */
@Schema({
  collection: 'token_ledger_entries',
  timestamps: true,
  versionKey: false,
})
export class TokenLedgerEntryDocument {
  @Prop({ required: true, index: true })
  accountId!: string;

  /** Positive adds, negative takes away; never zero (see assertWritableEntry). */
  @Prop({ required: true })
  delta!: number;

  @Prop({ required: true, enum: TOKEN_LEDGER_REASONS })
  reason!: TokenLedgerReason;

  /** The Match, payment or note this is about. Nothing branches on it. */
  @Prop()
  reference?: string;

  /**
   * What makes a movement happen at most once. Unique per account below, so a
   * replayed request is rejected by the database rather than by a check that
   * another request could have raced.
   */
  @Prop({ required: true })
  idempotencyKey!: string;

  /**
   * The balance this entry produced.
   *
   * Stored so a reader can see the running total without summing everything
   * before it, and so a mismatch between the ledger and `token_balances` is
   * visible at the entry that caused it rather than only in the final figure.
   */
  @Prop({ required: true })
  balanceAfter!: number;
}

export type TokenLedgerEntryHydrated =
  HydratedDocument<TokenLedgerEntryDocument>;

export const TokenLedgerEntrySchema = SchemaFactory.createForClass(
  TokenLedgerEntryDocument,
);

// One movement per key per account: the second attempt fails here, in the
// database, rather than in application code two requests could pass at once.
TokenLedgerEntrySchema.index(
  { accountId: 1, idempotencyKey: 1 },
  { unique: true },
);

// Newest first, for the history a player or an operator reads.
TokenLedgerEntrySchema.index({ accountId: 1, createdAt: -1 });
