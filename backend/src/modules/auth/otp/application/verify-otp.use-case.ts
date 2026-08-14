import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AuthResponseDto } from '../../dto/auth-response.dto';
import { JwtTokenProvider } from '../../infrastructure/jwt-token.provider';
import { UsersService } from '../../../users/users.service';
import { mapUserResponse } from '../../../users/mappers/user-response.mapper';
import {
  OTP_CHALLENGE_REPOSITORY,
  type OtpChallenge,
  type OtpChallengeRepository,
} from '../domain/otp-challenge.repository';
import { OtpCodeService } from '../domain/otp-code';
import {
  normalizeIdentifier,
  type NormalizedIdentifier,
} from '../domain/otp-identifier';
import { OtpConfig } from './otp-config';
import { OtpRateLimiter } from './otp-rate-limiter';

const MINUTE_MS = 60 * 1000;

export interface VerifyOtpResult extends AuthResponseDto {
  /** True when this verification created the account, so the client can route
   * a first-time user differently from a returning one. */
  isNewUser: boolean;
}

@Injectable()
export class VerifyOtp {
  private readonly logger = new Logger(VerifyOtp.name);

  constructor(
    @Inject(OTP_CHALLENGE_REPOSITORY)
    private readonly challenges: OtpChallengeRepository,
    private readonly codes: OtpCodeService,
    private readonly users: UsersService,
    private readonly tokens: JwtTokenProvider,
    private readonly limiter: OtpRateLimiter,
    private readonly config: OtpConfig,
  ) {}

  async execute(input: {
    identifier: string;
    code: string;
    ip: string | null;
  }): Promise<VerifyOtpResult> {
    const identifier = normalizeIdentifier(input.identifier);

    // Brute-force protection lives here now rather than in a per-challenge
    // attempt counter. Counted before the code is checked, so a script pays
    // for every guess, and a person who mistypes a digit is only ever slowed
    // down — never locked out of a code that is still valid.
    this.enforceVerifyRateLimits(identifier.value, input.ip);

    const challenge = await this.challenges.findActive(identifier.value);

    // No live challenge covers three real cases — never requested, already
    // used, superseded by a newer code — and they are answered identically so
    // a caller cannot probe which one it was.
    if (!challenge) throw this.invalidOrExpired();

    if (challenge.expiresAt.getTime() <= Date.now()) {
      throw this.expired();
    }

    // A wrong code changes nothing. The challenge stays live until it expires,
    // is consumed, or is superseded — so a mistyped digit costs the user a
    // retry, not the code itself.
    if (!this.codes.matches(input.code, identifier.value, challenge.codeHash)) {
      throw this.invalidCode();
    }

    // The single point where a challenge is spent. A conditional update in the
    // database decides the winner, so two correct simultaneous verifications
    // produce one session and one loser — never two consumptions.
    const won = await this.challenges.consume(challenge.id, new Date());
    if (!won) throw this.invalidOrExpired();

    const { user, isNewUser } = await this.resolveUser(identifier, challenge);
    this.limiter.reset(`otp:id:${identifier.value}`);

    this.logger.log({
      event: 'otp_verified',
      channel: identifier.type,
      isNewUser,
      userId: String(user._id),
    });

    return {
      // The existing JWT contract, unchanged: every guard, every existing
      // authenticated flow keeps working without knowing OTP exists.
      accessToken: this.tokens.sign({
        sub: String(user._id),
        email: user.email,
        role: user.role,
      }),
      user: mapUserResponse(user),
      isNewUser,
    };
  }

  /**
   * Find by verified identifier, or register.
   *
   * Lookup is on the canonical value only, which is what stops
   * `05xxxxxxxx` and `+9665xxxxxxxx` from becoming two accounts.
   */
  private async resolveUser(
    identifier: NormalizedIdentifier,
    challenge: OtpChallenge,
  ) {
    void challenge;
    const existing =
      identifier.type === 'email'
        ? await this.users.findByEmail(identifier.value)
        : await this.users.findByPhone(identifier.value);

    if (existing) {
      // Verification is proof of control, so record it even for an account
      // that predates passwordless login.
      const user = await this.users.markIdentifierVerified(
        String(existing._id),
        identifier.type,
      );
      return { user: user ?? existing, isNewUser: false };
    }

    const user = await this.users.createPasswordless({
      type: identifier.type,
      value: identifier.value,
    });
    return { user, isNewUser: true };
  }

  private invalidOrExpired(): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        code: 'OTP_INVALID_OR_EXPIRED',
        message: 'الرمز غير صحيح أو انتهت صلاحيته. اطلب رمزًا جديدًا.',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  private expired(): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        code: 'OTP_EXPIRED',
        message: 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  /** No attempt count is disclosed: there is no finite allowance to report. */
  private invalidCode(): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        code: 'OTP_INVALID',
        message: 'الرمز غير صحيح.',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  private enforceVerifyRateLimits(identifier: string, ip: string | null): void {
    const perIdentifier = this.limiter.check(
      `otp:verify:id:${identifier}`,
      this.config.maxVerifyPerIdentifierPerMinute,
      MINUTE_MS,
    );
    if (!perIdentifier.allowed) {
      throw this.throttled(perIdentifier.retryAfterSeconds);
    }
    this.limiter.record(`otp:verify:id:${identifier}`, MINUTE_MS);

    if (ip) {
      const perIp = this.limiter.check(
        `otp:verify:ip:${ip}`,
        this.config.maxVerifyPerIpPerMinute,
        MINUTE_MS,
      );
      if (!perIp.allowed) throw this.throttled(perIp.retryAfterSeconds);
      this.limiter.record(`otp:verify:ip:${ip}`, MINUTE_MS);
    }
  }

  /**
   * A pause, not a lockout. The code stays valid; only the rate is capped, and
   * the caller is told when to try again.
   */
  private throttled(retryAfterSeconds: number): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'OTP_RATE_LIMITED',
        message: 'محاولات كثيرة. حاول بعد قليل.',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
