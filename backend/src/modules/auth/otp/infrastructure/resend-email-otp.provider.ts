import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OtpDeliveryError,
  type OtpDeliveryProvider,
  type OtpDeliveryRequest,
} from '../domain/otp-delivery.provider';
import {
  otpEmailHtml,
  otpEmailSubject,
  otpEmailText,
} from './otp-email.template';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Email delivery over Resend's HTTP API.
 *
 * Called with `fetch` rather than their SDK so the dependency footprint stays
 * at zero and swapping to SES or SMTP later means writing one sibling class,
 * not unpicking an SDK from the application layer.
 */
@Injectable()
export class ResendEmailOtpProvider implements OtpDeliveryProvider {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(ResendEmailOtpProvider.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return Boolean(this.apiKey() && this.from());
  }

  async send(request: OtpDeliveryRequest): Promise<void> {
    const apiKey = this.apiKey();
    const from = this.from();
    if (!apiKey || !from) {
      throw new OtpDeliveryError(
        'EMAIL_OTP_NOT_CONFIGURED',
        'RESEND_API_KEY and OTP_MAIL_FROM are required to send OTP email',
        'خدمة البريد غير متاحة حاليًا. حاول لاحقًا.',
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [request.destination],
          subject: otpEmailSubject(),
          html: otpEmailHtml(request.code, request.expiresInSeconds),
          text: otpEmailText(request.code, request.expiresInSeconds),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // The body can echo the request, and the request contains the code.
        // Only the status is safe to record.
        this.logger.error(
          `Resend rejected an OTP email with status ${response.status}`,
        );
        throw new OtpDeliveryError(
          'OTP_DELIVERY_FAILED',
          `Resend responded ${response.status}`,
          'تعذّر إرسال الرمز. حاول مرة أخرى.',
        );
      }
    } catch (error) {
      if (error instanceof OtpDeliveryError) throw error;
      this.logger.error(
        `OTP email delivery failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw new OtpDeliveryError(
        'OTP_DELIVERY_FAILED',
        'Email delivery failed',
        'تعذّر إرسال الرمز. حاول مرة أخرى.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private apiKey(): string | undefined {
    return this.config.get<string>('RESEND_API_KEY')?.trim() || undefined;
  }

  /** e.g. `أكوان <no-reply@your-domain.com>`. No default: sending from an
   * unverified domain bounces, so this must be a deliberate configuration. */
  private from(): string | undefined {
    return this.config.get<string>('OTP_MAIL_FROM')?.trim() || undefined;
  }
}
