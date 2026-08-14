import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  OTP_CHALLENGE_REPOSITORY,
  type OtpChallengeRepository,
} from '../domain/otp-challenge.repository';
import { OtpCodeService } from '../domain/otp-code';
import {
  EMAIL_OTP_DELIVERY,
  OtpDeliveryError,
  SMS_OTP_DELIVERY,
  type OtpDeliveryProvider,
} from '../domain/otp-delivery.provider';
import {
  normalizeIdentifier,
  type NormalizedIdentifier,
} from '../domain/otp-identifier';
import { OtpConfig } from './otp-config';
import { OtpRateLimiter } from './otp-rate-limiter';

export interface RequestOtpResult {
  /** Always the same shape, whether or not the identifier has an account. */
  status: 'sent';
  channel: 'email' | 'phone';
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
}

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class RequestOtp {
  private readonly logger = new Logger(RequestOtp.name);

  constructor(
    @Inject(OTP_CHALLENGE_REPOSITORY)
    private readonly challenges: OtpChallengeRepository,
    private readonly codes: OtpCodeService,
    private readonly limiter: OtpRateLimiter,
    private readonly config: OtpConfig,
    @Inject(EMAIL_OTP_DELIVERY)
    private readonly email: OtpDeliveryProvider,
    @Inject(SMS_OTP_DELIVERY)
    private readonly sms: OtpDeliveryProvider,
  ) {}

  async execute(input: {
    identifier: string;
    ip: string | null;
  }): Promise<RequestOtpResult> {
    const identifier = normalizeIdentifier(input.identifier);

    // Channel availability comes before anything else. A phone request must
    // fail with a typed, honest error rather than consuming quota or, worse,
    // reporting that a message is on its way.
    const provider = this.providerFor(identifier);
    if (!provider.isEnabled()) {
      throw this.unavailable(identifier);
    }

    this.enforceRateLimits(identifier, input.ip);

    const now = new Date();
    const previous = await this.challenges.findLatest(identifier.value);
    const cooldownRemaining = this.cooldownRemaining(previous?.issuedAt, now);
    if (cooldownRemaining > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'OTP_RESEND_COOLDOWN',
          message: 'انتظر قليلًا قبل طلب رمز جديد.',
          retryAfterSeconds: cooldownRemaining,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.codes.generate();
    const expiresAt = new Date(
      now.getTime() + this.config.expiresInSeconds * 1000,
    );
    // Issuing invalidates any live predecessor inside the repository, so there
    // is never a window with two usable codes for one identifier.
    await this.challenges.issue({
      normalizedIdentifier: identifier.value,
      identifierType: identifier.type,
      codeHash: this.codes.hash(code, identifier.value),
      expiresAt,
      issuedAt: now,
      issuanceCount: (previous?.issuanceCount ?? 0) + 1,
      requestIp: input.ip,
    });

    this.recordRateLimits(identifier, input.ip);

    try {
      await provider.send({
        destination: identifier.value,
        code,
        expiresInSeconds: this.config.expiresInSeconds,
      });
    } catch (error) {
      if (error instanceof OtpDeliveryError) {
        throw new HttpException(
          {
            statusCode: HttpStatus.SERVICE_UNAVAILABLE,
            code: error.code,
            message: error.arabicMessage,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw error;
    }

    // Identifier type and outcome only. The code itself is never logged.
    this.logger.log({
      event: 'otp_requested',
      channel: identifier.type,
      identifierHint: identifier.value.slice(0, 2),
    });

    return {
      status: 'sent',
      channel: identifier.type,
      expiresInSeconds: this.config.expiresInSeconds,
      resendAvailableInSeconds: this.config.resendCooldownSeconds,
    };
  }

  private providerFor(identifier: NormalizedIdentifier): OtpDeliveryProvider {
    return identifier.type === 'email' ? this.email : this.sms;
  }

  private unavailable(identifier: NormalizedIdentifier): HttpException {
    if (identifier.type === 'phone') {
      return new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'SMS_OTP_NOT_AVAILABLE',
          message:
            'تسجيل الدخول برقم الجوال غير متاح حاليًا. استخدم البريد الإلكتروني.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'EMAIL_OTP_NOT_CONFIGURED',
        message: 'خدمة البريد غير متاحة حاليًا. حاول لاحقًا.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  private cooldownRemaining(issuedAt: Date | undefined, now: Date): number {
    if (!issuedAt) return 0;
    const elapsed = (now.getTime() - issuedAt.getTime()) / 1000;
    return Math.max(0, Math.ceil(this.config.resendCooldownSeconds - elapsed));
  }

  private enforceRateLimits(
    identifier: NormalizedIdentifier,
    ip: string | null,
  ): void {
    const perIdentifier = this.limiter.check(
      `otp:id:${identifier.value}`,
      this.config.maxRequestsPerIdentifierPerHour,
      HOUR_MS,
    );
    if (!perIdentifier.allowed)
      throw this.tooMany(perIdentifier.retryAfterSeconds);

    if (ip) {
      const perIp = this.limiter.check(
        `otp:ip:${ip}`,
        this.config.maxRequestsPerIpPerHour,
        HOUR_MS,
      );
      if (!perIp.allowed) throw this.tooMany(perIp.retryAfterSeconds);
    }
  }

  private recordRateLimits(
    identifier: NormalizedIdentifier,
    ip: string | null,
  ): void {
    this.limiter.record(`otp:id:${identifier.value}`, HOUR_MS);
    if (ip) this.limiter.record(`otp:ip:${ip}`, HOUR_MS);
  }

  private tooMany(retryAfterSeconds: number): HttpException {
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
