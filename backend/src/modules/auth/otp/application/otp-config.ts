import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Every tunable in one place, with the beta defaults baked in so a deployment
 * that sets none of them still behaves correctly.
 */
@Injectable()
export class OtpConfig {
  constructor(private readonly config: ConfigService) {}

  get expiresInSeconds(): number {
    return this.positive('OTP_EXPIRES_SECONDS', 300);
  }

  get resendCooldownSeconds(): number {
    return this.positive('OTP_RESEND_COOLDOWN_SECONDS', 60);
  }

  get maxAttempts(): number {
    return this.positive('OTP_MAX_ATTEMPTS', 5);
  }

  /** Requests per identifier per hour, above the per-minute cooldown. */
  get maxRequestsPerIdentifierPerHour(): number {
    return this.positive('OTP_MAX_REQUESTS_PER_IDENTIFIER_HOURLY', 10);
  }

  /** Requests per client IP per hour, so one host cannot farm identifiers. */
  get maxRequestsPerIpPerHour(): number {
    return this.positive('OTP_MAX_REQUESTS_PER_IP_HOURLY', 30);
  }

  get smsEnabled(): boolean {
    return this.config.get<string>('SMS_OTP_ENABLED')?.trim() === 'true';
  }

  private positive(key: string, fallback: number): number {
    const raw = this.config.get<string>(key);
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
