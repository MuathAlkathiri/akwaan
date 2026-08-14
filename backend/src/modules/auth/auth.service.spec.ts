import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SubscriptionStatus, UserRole } from '../users/schemas/user.schema';

describe('AuthService', () => {
  const user = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    fullName: 'Admin',
    email: 'admin@example.com',
    password: 'hash',
    role: UserRole.ADMIN,
    freeGamesUsed: 0,
    subscriptionStatus: SubscriptionStatus.NONE,
  };

  function setup(options: { found?: boolean; passwordMatches?: boolean } = {}) {
    const users = {
      findByEmailForAuthentication: jest
        .fn()
        .mockResolvedValue(options.found === false ? null : user),
      create: jest.fn().mockResolvedValue(user),
    };
    const tokens = { sign: jest.fn().mockReturnValue('signed-token') };
    const passwords = {
      compare: jest.fn().mockResolvedValue(options.passwordMatches !== false),
      hash: jest.fn().mockResolvedValue('hash'),
    };
    const config = { get: jest.fn() };
    return {
      service: new AuthService(
        users as never,
        tokens as never,
        passwords as never,
      ),
      users,
      tokens,
      passwords,
      config,
    };
  }

  it('logs in with a safe response and minimal token payload', async () => {
    const { service, tokens } = setup();
    await expect(
      service.login({ email: user.email, password: 'password' }),
    ).resolves.toMatchObject({
      accessToken: 'signed-token',
      user: { id: '507f1f77bcf86cd799439011', email: user.email },
    });
    expect(tokens.sign).toHaveBeenCalledWith({
      sub: '507f1f77bcf86cd799439011',
      email: user.email,
      role: UserRole.ADMIN,
    });
  });

  it.each([{ found: false }, { passwordMatches: false }])(
    'uses the same invalid-credentials error for $found/$passwordMatches',
    async (options) => {
      const { service } = setup(options);
      await expect(
        service.login({ email: user.email, password: 'wrong' }),
      ).rejects.toEqual(new UnauthorizedException('Invalid email or password'));
    },
  );

  it('has no lifecycle hook that could create an account at boot', () => {
    // The service used to seed an administrator from ADMIN_EMAIL /
    // ADMIN_PASSWORD in `onModuleInit`, so every boot could mint a privileged
    // account with a password known to anyone who could read the environment.
    // Admin is now granted by hand in MongoDB and nothing here can grant it.
    const { service } = setup();
    expect(
      (service as unknown as { onModuleInit?: unknown }).onModuleInit,
    ).toBeUndefined();
  });

  it('only ever registers a plain user', async () => {
    const { service, users } = setup();
    await service.register({
      fullName: 'Player',
      email: 'player@example.com',
      password: 'secret',
    } as never);

    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.USER }),
    );
    expect(users.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.ADMIN }),
    );
  });
});
