import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OtpPurpose = 'login';

/**
 * One issued OTP. Never the code itself — only a hash of it.
 *
 * This lives in its own collection rather than on `User` for three reasons: a
 * challenge exists before any user does, its lifetime is minutes rather than
 * the account's, and expiry can then be handed to Mongo's TTL monitor instead
 * of a sweeper we would have to write and watch.
 */
@Schema({ collection: 'otp_challenges', timestamps: true })
export class OtpChallengeDocument extends Document {
  @Prop({ required: true, index: true })
  normalizedIdentifier: string;

  @Prop({ required: true, enum: ['email', 'phone'] })
  identifierType: 'email' | 'phone';

  @Prop({ required: true, enum: ['login'], default: 'login' })
  purpose: OtpPurpose;

  /** HMAC-SHA256 of the code. The plaintext never reaches this database. */
  @Prop({ required: true })
  codeHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true, default: 0 })
  attempts: number;

  @Prop({ required: true })
  maxAttempts: number;

  /** Set once, by the single verification that wins the race. */
  @Prop({ type: Date, default: null })
  consumedAt: Date | null;

  /**
   * Superseded rather than deleted. Issuing a new code invalidates the old one,
   * and keeping the row until its TTL expires means a user who reads the older
   * message gets "this code expired" instead of a silent failure.
   */
  @Prop({ type: Date, default: null })
  invalidatedAt: Date | null;

  @Prop({ required: true })
  issuedAt: Date;

  /** How many times a code has been issued for this identifier in a row. */
  @Prop({ required: true, default: 1 })
  issuanceCount: number;

  @Prop({ type: String, default: null })
  requestIp: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export const OtpChallengeSchema =
  SchemaFactory.createForClass(OtpChallengeDocument);

// The active-challenge lookup: newest first, for one identifier and purpose.
OtpChallengeSchema.index({
  normalizedIdentifier: 1,
  purpose: 1,
  createdAt: -1,
});

/**
 * TTL cleanup, deliberately delayed past `expiresAt`.
 *
 * A challenge is unusable the moment it expires — the code checks that, not the
 * presence of the row. The grace period keeps the record around long enough to
 * answer "why did my code stop working", and to keep resend-cooldown and
 * issuance-count history meaningful, without anyone having to prune it.
 */
OtpChallengeSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 60 * 60, name: 'otp_challenge_ttl' },
);
