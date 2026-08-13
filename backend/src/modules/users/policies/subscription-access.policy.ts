import { Injectable } from '@nestjs/common';
import { SubscriptionStatus, UserRole } from '../schemas/user.schema';

export interface SubscriptionAccessSubject {
  role?: UserRole;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt?: Date;
}

@Injectable()
export class SubscriptionAccessPolicy {
  hasActiveSubscription(user: SubscriptionAccessSubject, now = new Date()) {
    if (user.role === UserRole.ADMIN) return true;
    return (
      user.subscriptionStatus === SubscriptionStatus.ACTIVE &&
      (!user.subscriptionExpiresAt || user.subscriptionExpiresAt > now)
    );
  }
}
