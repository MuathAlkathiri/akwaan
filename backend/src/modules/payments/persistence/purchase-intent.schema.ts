import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * What we started a charge for, written before the player ever sees the
 * provider's page.
 *
 * It exists so the webhook never has to be believed about anything but the
 * money. The delivery says "invoice X was paid"; this row says who X was for
 * and which pack they chose, in our own database, written by us. Carrying that
 * in the provider's metadata instead would mean a POST from the open internet
 * gets to name the pack it should be granted — and the cheapest charge would
 * buy the largest pack.
 *
 * Kept after fulfilment rather than deleted: when a player disputes a charge,
 * the row and the ledger entry together are the whole story.
 */
@Schema({ collection: 'purchase_intents', timestamps: true, versionKey: false })
export class PurchaseIntentDocument {
  /** The provider's own id for the charge. One intent per charge. */
  @Prop({ required: true, unique: true, index: true })
  providerPaymentId!: string;

  /** Which gateway issued it, so a later switch cannot confuse two ids. */
  @Prop({ required: true })
  provider!: string;

  @Prop({ required: true, index: true })
  accountId!: string;

  /** The catalogue id. The pack's own price is still what gets checked. */
  @Prop({ required: true })
  packId!: string;

  /** What we asked the provider to charge, in halalas. */
  @Prop({ required: true, min: 1 })
  amountHalalas!: number;

  /** Set once the webhook has been honoured, so a human can see what landed. */
  @Prop()
  fulfilledAt?: Date;
}

export type PurchaseIntentHydrated = HydratedDocument<PurchaseIntentDocument>;

export const PurchaseIntentSchema = SchemaFactory.createForClass(
  PurchaseIntentDocument,
);
