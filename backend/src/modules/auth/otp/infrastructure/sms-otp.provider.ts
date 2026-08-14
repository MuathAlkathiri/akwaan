import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OtpDeliveryError,
  type OtpDeliveryProvider,
  type OtpDeliveryRequest,
} from '../domain/otp-delivery.provider';

/**
 * The SMS channel: understood everywhere, delivered nowhere.
 *
 * Phone identifiers are normalized, validated, stored and accepted by the same
 * domain as email — only the last step is missing. Adding a real provider means
 * writing a sibling of this class and setting environment variables; no use
 * case, contract, or screen changes.
 *
 * A future adapter needs exactly this shape:
 *
 *     class UnifonicSmsOtpProvider implements OtpDeliveryProvider {
 *       readonly channel = 'phone';
 *       isEnabled() { return Boolean(this.appSid && this.senderId); }
 *       async send({ destination, code }) { ... }
 *     }
 *
 * `destination` is already canonical E.164, which is what every provider wants.
 */
@Injectable()
export class DisabledSmsOtpProvider implements OtpDeliveryProvider {
  readonly channel = 'phone' as const;
  private readonly logger = new Logger(DisabledSmsOtpProvider.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Off unless explicitly switched on. There is no provider behind the flag
   * yet, so enabling it in production would send nothing while telling users a
   * message was on its way — worse than saying the channel is unavailable.
   */
  isEnabled(): boolean {
    if (this.config.get<string>('SMS_OTP_ENABLED')?.trim() !== 'true') {
      return false;
    }
    // Flag on, no adapter compiled in. Say so loudly rather than pretend.
    this.logger.error(
      'SMS_OTP_ENABLED=true but no SMS provider is integrated; phone OTP stays unavailable',
    );
    return false;
  }

  async send(request: OtpDeliveryRequest): Promise<void> {
    void request;
    throw new OtpDeliveryError(
      'SMS_OTP_NOT_AVAILABLE',
      'SMS OTP delivery is not integrated yet',
      'تسجيل الدخول برقم الجوال غير متاح حاليًا. استخدم البريد الإلكتروني.',
    );
  }
}

/**
 * Test/development only, and structurally unable to run in production.
 *
 * Returning a code from an API is the kind of shortcut that ships by accident,
 * so this refuses to construct when `NODE_ENV=production` — an accidental
 * registration fails at boot instead of quietly exposing codes.
 */
@Injectable()
export class CapturingSmsOtpProvider implements OtpDeliveryProvider {
  readonly channel = 'phone' as const;
  readonly sent: OtpDeliveryRequest[] = [];

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CapturingSmsOtpProvider must never be registered in production',
      );
    }
  }

  isEnabled(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  async send(request: OtpDeliveryRequest): Promise<void> {
    this.sent.push(request);
  }
}
