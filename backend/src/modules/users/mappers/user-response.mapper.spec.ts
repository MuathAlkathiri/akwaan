import { mapUserResponse } from './user-response.mapper';
import { SubscriptionStatus, UserRole } from '../schemas/user.schema';

describe('mapUserResponse', () => {
  it('normalizes IDs and excludes password and mongoose metadata', () => {
    const mapped = mapUserResponse({
      _id: { toString: () => 'user-id' },
      fullName: 'User',
      email: 'user@example.com',
      password: 'secret-hash',
      role: UserRole.USER,
      freeGamesUsed: 0,
      subscriptionStatus: SubscriptionStatus.NONE,
      __v: 1,
    } as never);
    expect(mapped).toMatchObject({ id: 'user-id', _id: 'user-id' });
    expect(mapped).not.toHaveProperty('password');
    expect(mapped).not.toHaveProperty('__v');
  });
});
