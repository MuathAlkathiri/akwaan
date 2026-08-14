import { ConfigService } from '@nestjs/config';
import { OtpCodeService } from '../domain/otp-code';
import type {
  OtpChallenge,
  OtpChallengeRepository,
} from '../domain/otp-challenge.repository';
import type { OtpDeliveryProvider } from '../domain/otp-delivery.provider';
import { OtpConfig } from './otp-config';
import { OtpRateLimiter } from './otp-rate-limiter';
import { RequestOtp } from './request-otp.use-case';
import { VerifyOtp } from './verify-otp.use-case';

/**
 * The OTP lifecycle against an in-memory challenge store that reproduces the
 * two behaviours the real repository is responsible for: issuing invalidates
 * live predecessors, and consumption is a single conditional write.
 */
class MemoryChallengeRepository implements OtpChallengeRepository {
  readonly rows: OtpChallenge[] = [];
  private sequence = 0;

  async issue(input: {
    normalizedIdentifier: string;
    identifierType: 'email' | 'phone';
    codeHash: string;
    expiresAt: Date;
    maxAttempts: number;
    issuedAt: Date;
    issuanceCount: number;
    requestIp: string | null;
  }): Promise<OtpChallenge> {
    for (const row of this.rows) {
      if (
        row.normalizedIdentifier === input.normalizedIdentifier &&
        !row.consumedAt &&
        !row.invalidatedAt
      ) {
        row.invalidatedAt = input.issuedAt;
      }
    }
    this.sequence += 1;
    const challenge: OtpChallenge = {
      id: `challenge-${this.sequence}`,
      normalizedIdentifier: input.normalizedIdentifier,
      identifierType: input.identifierType,
      purpose: 'login',
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      attempts: 0,
      maxAttempts: input.maxAttempts,
      consumedAt: null,
      invalidatedAt: null,
      issuedAt: input.issuedAt,
      issuanceCount: input.issuanceCount,
    };
    this.rows.unshift(challenge);
    return challenge;
  }

  async findLatest(identifier: string) {
    return this.rows.find((r) => r.normalizedIdentifier === identifier) ?? null;
  }

  async findActive(identifier: string) {
    return (
      this.rows.find(
        (r) =>
          r.normalizedIdentifier === identifier &&
          !r.consumedAt &&
          !r.invalidatedAt,
      ) ?? null
    );
  }

  async consume(id: string, consumedAt: Date) {
    const row = this.rows.find((r) => r.id === id);
    // Mirrors `updateOne({_id, consumedAt: null})`: only the first caller wins.
    if (!row || row.consumedAt) return false;
    row.consumedAt = consumedAt;
    return true;
  }

  async recordFailedAttempt(id: string) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return Number.MAX_SAFE_INTEGER;
    row.attempts += 1;
    return row.attempts;
  }
}

class CapturingEmailProvider implements OtpDeliveryProvider {
  readonly channel = 'email' as const;
  readonly sent: Array<{ destination: string; code: string }> = [];
  enabled = true;
  isEnabled() {
    return this.enabled;
  }
  async send(request: { destination: string; code: string }) {
    this.sent.push({ destination: request.destination, code: request.code });
  }
}

class OffSmsProvider implements OtpDeliveryProvider {
  readonly channel = 'phone' as const;
  isEnabled() {
    return false;
  }
  async send() {
    throw new Error('should never be called while disabled');
  }
}

const config = (values: Record<string, string> = {}) =>
  ({ get: (key: string) => values[key] }) as ConfigService;

describe('passwordless OTP flow', () => {
  let challenges: MemoryChallengeRepository;
  let email: CapturingEmailProvider;
  let limiter: OtpRateLimiter;
  let codes: OtpCodeService;
  let request: RequestOtp;
  let verify: VerifyOtp;
  let users: {
    findByEmail: jest.Mock;
    findByPhone: jest.Mock;
    createPasswordless: jest.Mock;
    markIdentifierVerified: jest.Mock;
  };

  const EMAIL = 'player@example.com';

  const lastCode = () => email.sent[email.sent.length - 1].code;

  beforeEach(() => {
    challenges = new MemoryChallengeRepository();
    email = new CapturingEmailProvider();
    limiter = new OtpRateLimiter();
    codes = new OtpCodeService(config({ OTP_HASH_PEPPER: 'test-pepper' }));
    const otpConfig = new OtpConfig(config());
    request = new RequestOtp(
      challenges,
      codes,
      limiter,
      otpConfig,
      email,
      new OffSmsProvider(),
    );
    users = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findByPhone: jest.fn().mockResolvedValue(null),
      createPasswordless: jest.fn().mockImplementation(async () => ({
        _id: 'new-user',
        email: EMAIL,
        role: 'user',
        fullName: 'لاعب أكوان',
      })),
      markIdentifierVerified: jest.fn().mockResolvedValue(null),
    };
    verify = new VerifyOtp(
      challenges,
      codes,
      users as never,
      { sign: () => 'signed.jwt.token' } as never,
      limiter,
    );
  });

  describe('requesting', () => {
    it('creates a challenge and delivers a six-digit code', async () => {
      const result = await request.execute({ identifier: EMAIL, ip: null });

      expect(result).toMatchObject({ status: 'sent', channel: 'email' });
      expect(challenges.rows).toHaveLength(1);
      expect(email.sent[0].code).toMatch(/^\d{6}$/);
    });

    it('never persists the plaintext code', async () => {
      await request.execute({ identifier: EMAIL, ip: null });
      const code = lastCode();
      const persisted = JSON.stringify(challenges.rows);

      expect(persisted).not.toContain(code);
      expect(challenges.rows[0].codeHash).not.toBe(code);
      expect(challenges.rows[0].codeHash).toHaveLength(64);
    });

    it('does not reveal whether the identifier is registered', async () => {
      users.findByEmail.mockResolvedValue({ _id: 'existing' });
      const known = await request.execute({ identifier: EMAIL, ip: null });
      limiter.reset(`otp:id:${EMAIL}`);
      challenges.rows.length = 0;
      users.findByEmail.mockResolvedValue(null);
      const unknown = await request.execute({
        identifier: 'nobody@example.com',
        ip: null,
      });

      expect(known).toEqual(unknown);
    });

    it('enforces the resend cooldown', async () => {
      await request.execute({ identifier: EMAIL, ip: null });

      await expect(
        request.execute({ identifier: EMAIL, ip: null }),
      ).rejects.toMatchObject({
        response: { code: 'OTP_RESEND_COOLDOWN' },
      });
    });

    it('invalidates the previous code when a new one is issued', async () => {
      await request.execute({ identifier: EMAIL, ip: null });
      const first = lastCode();
      // Past the cooldown.
      challenges.rows[0].issuedAt = new Date(Date.now() - 120_000);
      await request.execute({ identifier: EMAIL, ip: null });

      // The superseded row is marked, and only the newest code opens the door.
      expect(challenges.rows[1].invalidatedAt).not.toBeNull();
      await expect(
        verify.execute({ identifier: EMAIL, code: first }),
      ).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
      await expect(
        verify.execute({ identifier: EMAIL, code: lastCode() }),
      ).resolves.toMatchObject({ accessToken: 'signed.jwt.token' });
    });

    it('rate limits an identifier past the hourly ceiling', async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await request.execute({ identifier: EMAIL, ip: '1.2.3.4' });
        challenges.rows[0].issuedAt = new Date(Date.now() - 120_000);
      }
      await expect(
        request.execute({ identifier: EMAIL, ip: '1.2.3.4' }),
      ).rejects.toMatchObject({ response: { code: 'OTP_RATE_LIMITED' } });
    });

    it('returns SMS_OTP_NOT_AVAILABLE for a phone number', async () => {
      await expect(
        request.execute({ identifier: '0512345678', ip: null }),
      ).rejects.toMatchObject({
        response: { code: 'SMS_OTP_NOT_AVAILABLE' },
      });
      // No challenge issued and nothing sent: a disabled channel consumes
      // nothing and promises nothing.
      expect(challenges.rows).toHaveLength(0);
      expect(email.sent).toHaveLength(0);
    });

    it('reports email misconfiguration instead of silently failing', async () => {
      email.enabled = false;
      await expect(
        request.execute({ identifier: EMAIL, ip: null }),
      ).rejects.toMatchObject({
        response: { code: 'EMAIL_OTP_NOT_CONFIGURED' },
      });
    });
  });

  describe('verifying', () => {
    beforeEach(async () => {
      await request.execute({ identifier: EMAIL, ip: null });
    });

    it('accepts the correct code and issues the existing token shape', async () => {
      const result = await verify.execute({
        identifier: EMAIL,
        code: lastCode(),
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toBeDefined();
      expect(result.isNewUser).toBe(true);
    });

    it('increments attempts on a wrong code', async () => {
      await expect(
        verify.execute({ identifier: EMAIL, code: '000000' }),
      ).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });

      expect(challenges.rows[0].attempts).toBe(1);
    });

    it('rejects the sixth attempt', async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await expect(
          verify.execute({ identifier: EMAIL, code: '000000' }),
        ).rejects.toMatchObject({ response: { code: 'OTP_INVALID' } });
      }
      // Fifth wrong guess exhausts the allowance.
      await expect(
        verify.execute({ identifier: EMAIL, code: '000000' }),
      ).rejects.toMatchObject({ response: { code: 'OTP_TOO_MANY_ATTEMPTS' } });
      // Sixth is refused before the code is even compared, so even the correct
      // code cannot rescue an exhausted challenge.
      await expect(
        verify.execute({ identifier: EMAIL, code: lastCode() }),
      ).rejects.toMatchObject({ response: { code: 'OTP_TOO_MANY_ATTEMPTS' } });
    });

    it('rejects an expired code', async () => {
      challenges.rows[0].expiresAt = new Date(Date.now() - 1_000);

      await expect(
        verify.execute({ identifier: EMAIL, code: lastCode() }),
      ).rejects.toMatchObject({ response: { code: 'OTP_EXPIRED' } });
    });

    it('refuses to reuse a consumed code', async () => {
      const code = lastCode();
      await verify.execute({ identifier: EMAIL, code });

      await expect(
        verify.execute({ identifier: EMAIL, code }),
      ).rejects.toMatchObject({
        response: { code: 'OTP_INVALID_OR_EXPIRED' },
      });
    });

    it('lets only one of two concurrent verifications succeed', async () => {
      const code = lastCode();

      const results = await Promise.allSettled([
        verify.execute({ identifier: EMAIL, code }),
        verify.execute({ identifier: EMAIL, code }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(challenges.rows[0].consumedAt).not.toBeNull();
    });

    it('signs in an existing user without creating a duplicate', async () => {
      users.findByEmail.mockResolvedValue({
        _id: 'existing-user',
        email: EMAIL,
        role: 'user',
      });

      const result = await verify.execute({
        identifier: EMAIL,
        code: lastCode(),
      });

      expect(result.isNewUser).toBe(false);
      expect(users.createPasswordless).not.toHaveBeenCalled();
      expect(users.markIdentifierVerified).toHaveBeenCalledWith(
        'existing-user',
        'email',
      );
    });

    it('creates the account on a first successful verification', async () => {
      const result = await verify.execute({
        identifier: EMAIL,
        code: lastCode(),
      });

      expect(users.createPasswordless).toHaveBeenCalledWith({
        type: 'email',
        value: EMAIL,
      });
      expect(result.isNewUser).toBe(true);
    });

    it('matches a differently-cased identifier to the same challenge', async () => {
      await expect(
        verify.execute({ identifier: 'PLAYER@EXAMPLE.COM', code: lastCode() }),
      ).resolves.toMatchObject({ accessToken: 'signed.jwt.token' });
    });
  });

  describe('code service', () => {
    it('generates six digits within range', () => {
      for (let i = 0; i < 200; i += 1) {
        expect(codes.generate()).toMatch(/^\d{6}$/);
      }
    });

    it('binds a hash to its identifier', () => {
      // The same code for a different identifier must not verify.
      const hash = codes.hash('123456', 'a@example.com');
      expect(codes.matches('123456', 'a@example.com', hash)).toBe(true);
      expect(codes.matches('123456', 'b@example.com', hash)).toBe(false);
      expect(codes.matches('654321', 'a@example.com', hash)).toBe(false);
    });
  });
});
