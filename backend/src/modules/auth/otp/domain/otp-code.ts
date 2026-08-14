import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';

export const OTP_CODE_LENGTH = 6;

/**
 * Generates and verifies the codes. The plaintext exists in memory only long
 * enough to be delivered; what persists is an HMAC of it.
 */
@Injectable()
export class OtpCodeService {
  constructor(private readonly config: ConfigService) {}

  /**
   * `randomInt` is CSPRNG-backed and rejection-samples internally, so every
   * code from 000000 to 999999 is equally likely — `Math.random()` would be
   * both predictable and biased.
   */
  generate(): string {
    return String(randomInt(0, 1_000_000)).padStart(OTP_CODE_LENGTH, '0');
  }

  /**
   * Keyed HMAC rather than a bare hash. A six-digit space is a million
   * possibilities, which is a rainbow table anyone can build in seconds, so
   * only the pepper makes a leaked `codeHash` useless on its own.
   */
  hash(code: string, normalizedIdentifier: string): string {
    return createHmac('sha256', this.pepper())
      .update(`${normalizedIdentifier}:${code}`)
      .digest('hex');
  }

  /** Constant-time, so a wrong guess cannot be narrowed down by timing. */
  matches(
    code: string,
    normalizedIdentifier: string,
    expectedHash: string,
  ): boolean {
    const actual = Buffer.from(this.hash(code, normalizedIdentifier), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }

  /**
   * Falls back to JWT_SECRET, which is already required at boot and already
   * secret, so a deployment cannot silently end up with an unkeyed hash.
   */
  private pepper(): string {
    const configured = this.config.get<string>('OTP_HASH_PEPPER')?.trim();
    if (configured) return configured;
    const jwtSecret = this.config.get<string>('JWT_SECRET')?.trim();
    if (jwtSecret) return jwtSecret;
    throw new Error('OTP_HASH_PEPPER or JWT_SECRET is required to hash OTPs');
  }
}
