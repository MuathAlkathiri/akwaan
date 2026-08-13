import { SubscriptionAccessPolicy } from './subscription-access.policy';
import { SubscriptionStatus, UserRole } from '../schemas/user.schema';

describe('SubscriptionAccessPolicy', () => {
  const policy = new SubscriptionAccessPolicy();
  const now = new Date('2026-07-14T00:00:00Z');

  it('accepts an active subscription without an expiry', () => {
    expect(
      policy.hasActiveSubscription(
        { subscriptionStatus: SubscriptionStatus.ACTIVE },
        now,
      ),
    ).toBe(true);
  });

  it('rejects an expired subscription', () => {
    expect(
      policy.hasActiveSubscription(
        {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionExpiresAt: new Date('2026-07-13T00:00:00Z'),
        },
        now,
      ),
    ).toBe(false);
  });

  it('preserves administrator bypass', () => {
    expect(
      policy.hasActiveSubscription(
        { role: UserRole.ADMIN, subscriptionStatus: SubscriptionStatus.NONE },
        now,
      ),
    ).toBe(true);
  });
});
