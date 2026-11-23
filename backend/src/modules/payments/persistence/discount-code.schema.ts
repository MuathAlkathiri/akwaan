import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * A discount code, as stored.
 *
 * The code itself is the key players type, so it is unique and always held in
 * the one normalised spelling — upper case, trimmed. Storing it as typed would
 * mean `akwaan20` and `AKWAAN20` are two different codes, and the second one
 * somebody creates would silently be a different offer.
 *
 * `redeemedCount` counts paid purchases, not checkouts. Counting checkouts
 * would let a hundred people open the payment page, close it, and burn a
 * creator's whole allocation without a riyal changing hands.
 */
@Schema({ collection: 'discount_codes', timestamps: true, versionKey: false })
export class DiscountCodeDocument {
  @Prop({
    required: true,
    unique: true,
    index: true,
    uppercase: true,
    trim: true,
  })
  code!: string;

  /** Whole percent off. Exactly one of this and `amountOffHalalas` is set. */
  @Prop({ min: 1, max: 100 })
  percentOff?: number;

  /** Halalas off. Exactly one of this and `percentOff` is set. */
  @Prop({ min: 1 })
  amountOffHalalas?: number;

  /** Catalogue ids this code is limited to. Empty means every pack. */
  @Prop({ type: [String], default: [] })
  packIds!: string[];

  /** Null means unlimited. */
  @Prop({ type: Number, default: null })
  maxRedemptions!: number | null;

  @Prop({ required: true, default: 0, min: 0 })
  redeemedCount!: number;

  @Prop()
  expiresAt?: Date;

  @Prop({ required: true, default: true })
  active!: boolean;

  /** Who made it, so a code nobody remembers creating has an owner. */
  @Prop()
  createdBy?: string;

  /** Free text for whoever reads the list in a year. */
  @Prop()
  note?: string;
}

export type DiscountCodeHydrated = HydratedDocument<DiscountCodeDocument>;

export const DiscountCodeSchema =
  SchemaFactory.createForClass(DiscountCodeDocument);
