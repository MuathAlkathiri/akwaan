import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * What one account can spend right now.
 *
 * This looks like a cached sum of `token_ledger_entries`, and it is not kept
 * for speed. Summing the ledger cannot stop a double spend: two Matches
 * started in the same instant both read a balance of 1, both find it enough,
 * and both insert their own entry — and because they are different documents,
 * nothing collides, not even inside a transaction. The account plays two
 * Matches for one token.
 *
 * A single document per account fixes that, because the check and the decrement
 * become one conditional update: `{ balance: { $gte: cost } }` with
 * `$inc: { balance: -cost }`. Whichever Match arrives second finds no document
 * matching the condition and is refused. The ledger entry is written in the
 * same transaction, so the record and the figure cannot disagree.
 */
@Schema({ collection: 'token_balances', timestamps: true, versionKey: false })
export class TokenBalanceDocument {
  @Prop({ required: true, unique: true })
  accountId!: string;

  /** Never negative: every decrement is guarded by the balance it needs. */
  @Prop({ required: true, default: 0, min: 0 })
  balance!: number;
}

export type TokenBalanceHydrated = HydratedDocument<TokenBalanceDocument>;

export const TokenBalanceSchema =
  SchemaFactory.createForClass(TokenBalanceDocument);
