import type { OtpIdentifierType } from './otp-identifier';

export const OTP_CHALLENGE_REPOSITORY = Symbol('OTP_CHALLENGE_REPOSITORY');

export interface OtpChallenge {
  id: string;
  normalizedIdentifier: string;
  identifierType: OtpIdentifierType;
  purpose: 'login';
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
  issuedAt: Date;
  issuanceCount: number;
}

export interface OtpChallengeRepository {
  /**
   * Supersede every live challenge for this identifier, then insert one.
   *
   * Both halves belong together: a moment where two codes are simultaneously
   * valid is a moment where the older one still opens the account.
   */
  issue(input: {
    normalizedIdentifier: string;
    identifierType: OtpIdentifierType;
    codeHash: string;
    expiresAt: Date;
    maxAttempts: number;
    issuedAt: Date;
    issuanceCount: number;
    requestIp: string | null;
  }): Promise<OtpChallenge>;

  /** The newest challenge for this identifier, spent or not. */
  findLatest(normalizedIdentifier: string): Promise<OtpChallenge | null>;

  /** The newest challenge that is neither consumed nor superseded. */
  findActive(normalizedIdentifier: string): Promise<OtpChallenge | null>;

  /**
   * Consume a challenge exactly once.
   *
   * Returns true only for the caller that actually flipped it from unconsumed
   * to consumed. Two simultaneous verifications of the same correct code must
   * produce exactly one true, so this has to be a single conditional update in
   * the database rather than a read followed by a write.
   */
  consume(id: string, consumedAt: Date): Promise<boolean>;

  /** Records a wrong guess. Returns the attempt count after incrementing. */
  recordFailedAttempt(id: string): Promise<number>;
}
