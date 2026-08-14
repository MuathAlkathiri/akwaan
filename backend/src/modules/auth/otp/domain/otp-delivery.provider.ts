import type { OtpIdentifierType } from './otp-identifier';

export const EMAIL_OTP_DELIVERY = Symbol('EMAIL_OTP_DELIVERY');
export const SMS_OTP_DELIVERY = Symbol('SMS_OTP_DELIVERY');

export interface OtpDeliveryRequest {
  /** Canonical destination: a lowercased email or an E.164 phone number. */
  destination: string;
  code: string;
  expiresInSeconds: number;
}

/**
 * How a code reaches a person.
 *
 * The application layer talks only to this. Swapping Resend for SES, or adding
 * Unifonic for SMS, is a new class behind this interface plus environment
 * variables — no use case, controller, contract or frontend changes. That is
 * the whole point of it existing before there is a second implementation.
 */
export interface OtpDeliveryProvider {
  readonly channel: OtpIdentifierType;
  /** False when the channel is switched off or unconfigured. */
  isEnabled(): boolean;
  /** @throws OtpDeliveryError when delivery fails or the channel is off. */
  send(request: OtpDeliveryRequest): Promise<void>;
}

export type OtpDeliveryErrorCode =
  'SMS_OTP_NOT_AVAILABLE' | 'EMAIL_OTP_NOT_CONFIGURED' | 'OTP_DELIVERY_FAILED';

export class OtpDeliveryError extends Error {
  constructor(
    readonly code: OtpDeliveryErrorCode,
    message: string,
    readonly arabicMessage: string,
  ) {
    super(message);
    this.name = 'OtpDeliveryError';
  }
}
