import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * One spending period — a calendar month, keyed `YYYY-MM`.
 *
 * Three numbers, and the invariant that matters is the relationship between
 * them:
 *
 *     spentMicros + reservedMicros <= capMicros
 *
 * A reservation is money that is *committed but not yet billed*. Checking only
 * `spentMicros` would let a hundred concurrent calls each see room that the
 * others have already taken — the classic lost-update race, except the thing
 * being lost is money.
 */
@Schema({ collection: 'engine_budget', timestamps: true })
export class EngineBudgetDocument {
  /** `YYYY-MM`. */
  @Prop({ type: String, required: true })
  periodKey!: string;

  @Prop({ type: Number, required: true })
  capMicros!: number;

  /** Reconciled, actually-billed money. */
  @Prop({ type: Number, required: true, default: 0 })
  spentMicros!: number;

  /** Committed but not yet reconciled. Released or converted on reconcile. */
  @Prop({ type: Number, required: true, default: 0 })
  reservedMicros!: number;
}

export type EngineBudget = HydratedDocument<EngineBudgetDocument>;
export const EngineBudgetSchema =
  SchemaFactory.createForClass(EngineBudgetDocument);

/** One document per period; the unique index is what makes upsert safe. */
EngineBudgetSchema.index({ periodKey: 1 }, { unique: true });
