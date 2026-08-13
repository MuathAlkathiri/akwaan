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
        config as never,
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

  it('does not overwrite or re-hash an existing seeded administrator', async () => {
    const { service, users, passwords, config } = setup();
    const configValues: Record<string, string> = {
      ADMIN_EMAIL: user.email,
      ADMIN_PASSWORD: 'configured',
    };
    config.get.mockImplementation((key: string) => configValues[key]);
    await service.onModuleInit();
    expect(users.create).not.toHaveBeenCalled();
    expect(passwords.hash).not.toHaveBeenCalled();
  });
});
