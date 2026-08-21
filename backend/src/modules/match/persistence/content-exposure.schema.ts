import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * One account's history of having been shown one ContentItem in one mechanic.
 *
 * The ledger is deliberately keyed on the **triple**
 * `(ownerAccountId, challengeTypeKey, contentItemId)`. A question burned in
 * القنبلة is still unseen in اقرأ خصمك, because seeing a fact presented one way
 * does not spend it in every other. Burning the item globally would throw away
 * most of the catalog's value.
 *
 * Owner is the **account that owns the Match** — never a phone participant, a
 * team, or a device. Two different groups playing on the same account share this
 * history; the same group on a different account does not.
 *
 * `state` is what keeps *selected* separate from *seen*:
 *
 * - `reserved` — a Match has drawn this item but no player has been shown it.
 *   It blocks a second concurrent Match from drawing the same item, and it is
 *   released, or expires, if the challenge never reaches the item.
 * - `exposed` — a player was authoritatively shown it. Permanent.
 */
export type ContentExposureState = 'reserved' | 'exposed';

@Schema({
  collection: 'content_exposures',
  timestamps: true,
  versionKey: false,
})
export class ContentExposureDocument {
  /** The Match owner's account id, from the live session's controller. */
  @Prop({ required: true })
  ownerAccountId!: string;

  /**
   * The mechanic's canonical slug — `bomb`, `combo`, `read-your-opponent`.
   *
   * The slug rather than the ChallengeType's ObjectId on purpose: it is the
   * runtime key the plugins and launchers already dispatch on, it is available at
   * both the selection and the presentation boundary without an extra read, and it
   * is stable across environments where the ObjectId is not.
   */
  @Prop({ required: true })
  challengeTypeKey!: string;

  @Prop({ required: true })
  contentItemId!: string;

  @Prop({ required: true, enum: ['reserved', 'exposed'], default: 'reserved' })
  state!: ContentExposureState;

  /** The Match that drew it, kept so its own reservations can be released. */
  @Prop({ required: true })
  matchId!: string;

  /** When a player was actually shown it. Absent while merely reserved. */
  @Prop({ type: Date, default: null })
  exposedAt!: Date | null;

  /**
   * When a `reserved` row stops blocking other Matches.
   *
   * A safety net, not the primary release path: an abandoned challenge is
   * released explicitly. This covers a process that died mid-challenge, so a
   * crash cannot permanently withhold content from the account. Null once
   * exposed, because exposure never expires.
   */
  @Prop({ type: Date, default: null })
  reservationExpiresAt!: Date | null;
}

export type ContentExposure = HydratedDocument<ContentExposureDocument>;

export const ContentExposureSchema = SchemaFactory.createForClass(
  ContentExposureDocument,
);

/**
 * The one index the ledger is designed around.
 *
 * Unique, so a duplicate write is a no-op rather than a second row — which is
 * what makes recording idempotent under reconnects and retries, and what makes a
 * reservation an atomic claim between concurrent Matches.
 *
 * Its prefix `(ownerAccountId, challengeTypeKey)` is also exactly the selection
 * query: "of these candidate ids, which has this account already seen in this
 * mechanic". So the read is an indexed `$in` over the *candidate* set — bounded
 * by the occurrence's Scopes — rather than loading the account's whole history or
 * building an unbounded `$nin`.
 */
ContentExposureSchema.index(
  { ownerAccountId: 1, challengeTypeKey: 1, contentItemId: 1 },
  { unique: true },
);

/** Releasing an abandoned challenge's reservations in one statement. */
ContentExposureSchema.index({ matchId: 1, state: 1 });

/**
 * Expiry for reservations only.
 *
 * Mongo's TTL monitor deletes a document when its indexed date passes, and
 * `exposedAt`-bearing rows carry `null` here, which TTL skips — so an exposure is
 * never reaped.
 */
ContentExposureSchema.index(
  { reservationExpiresAt: 1 },
  { expireAfterSeconds: 0 },
);
