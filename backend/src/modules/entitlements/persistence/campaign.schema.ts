import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * One free Match an account started.
 *
 * `slot` is what makes the weekly limit hold under a double tap: two requests
 * that both read "two used" both try to write slot three, and the unique index
 * lets exactly one of them. The window key also carries the permanent
 * first-Match-is-free rule, under its own name, so that rule needs no second
 * collection.
 */
@Schema({
  collection: 'free_match_claims',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class FreeMatchClaimDocument {
  @Prop({ required: true, index: true })
  accountId!: string;

  @Prop({ required: true })
  windowKey!: string;

  @Prop({ required: true, min: 1 })
  slot!: number;

  @Prop({ required: true, unique: true })
  matchId!: string;
}

export const FreeMatchClaimSchema = SchemaFactory.createForClass(
  FreeMatchClaimDocument,
);
FreeMatchClaimSchema.index(
  { accountId: 1, windowKey: 1, slot: 1 },
  { unique: true },
);

/** The campaign's one adjustable number, kept where an operator can reach it. */
@Schema({
  collection: 'campaign_settings',
  timestamps: true,
  versionKey: false,
})
export class CampaignSettingsDocument {
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop({ required: true, min: 0 })
  weeklyFreeMatches!: number;

  @Prop()
  updatedBy?: string;
}

export const CampaignSettingsSchema = SchemaFactory.createForClass(
  CampaignSettingsDocument,
);

/**
 * A code that gives Matches rather than a discount.
 *
 * Kept apart from discount codes on purpose: a discount changes what a
 * purchase costs, while this adds to a balance with no purchase at all, and
 * the launch month has no purchases to attach it to.
 */
@Schema({ collection: 'gift_codes', timestamps: true, versionKey: false })
export class GiftCodeDocument {
  @Prop({ required: true, unique: true })
  code!: string;

  @Prop({ required: true, min: 1 })
  tokens!: number;

  @Prop({ required: true, min: 1 })
  maxRedemptions!: number;

  @Prop({ required: true, default: 0, min: 0 })
  redemptionCount!: number;

  @Prop({ required: true, default: true })
  active!: boolean;

  @Prop()
  note?: string;
}

export const GiftCodeSchema = SchemaFactory.createForClass(GiftCodeDocument);

/** Who has used which code: one row each, so nobody uses one twice. */
@Schema({
  collection: 'gift_code_redemptions',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class GiftCodeRedemptionDocument {
  @Prop({ required: true })
  code!: string;

  @Prop({ required: true })
  accountId!: string;
}

export const GiftCodeRedemptionSchema = SchemaFactory.createForClass(
  GiftCodeRedemptionDocument,
);
GiftCodeRedemptionSchema.index({ code: 1, accountId: 1 }, { unique: true });
