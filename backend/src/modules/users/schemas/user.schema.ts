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

  @Prop({ required: true, select: false })
  password: string;

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
