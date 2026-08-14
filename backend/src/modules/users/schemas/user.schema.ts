import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export enum SubscriptionStatus {
  NONE = 'none',
  ACTIVE = 'active',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  /**
   * Canonical E.164, e.g. `+9665xxxxxxxx`.
   *
   * `sparse` matters: without it every password-era user would collide on
   * `null` under the unique index. Optional and independent of `email` so one
   * account can hold both identifiers later without a second account type.
   */
  @Prop({
    type: String,
    required: false,
    unique: true,
    sparse: true,
    trim: true,
    default: undefined,
  })
  phone?: string;

  /** When control of the identifier was last proven by a verified OTP. */
  @Prop({ type: Date, required: false })
  emailVerifiedAt?: Date;

  @Prop({ type: Date, required: false })
  phoneVerifiedAt?: Date;

  /**
   * Optional since passwordless login.
   *
   * Existing users keep their hash and can still sign in with it; accounts
   * created by OTP simply have none. Making this required again would lock out
   * every passwordless account.
   */
  @Prop({ required: false, select: false })
  password?: string;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Prop({ type: Number, default: 0 })
  freeGamesUsed: number;

  @Prop({
    type: String,
    enum: SubscriptionStatus,
    default: SubscriptionStatus.NONE,
  })
  subscriptionStatus: SubscriptionStatus;

  @Prop()
  subscriptionExpiresAt?: Date;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
