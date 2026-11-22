import { createHash, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentProvider,
  PaymentRequest,
  PaymentStatus,
  ProviderNotice,
  StartedPayment,
  VerifiedPayment,
} from '../domain/payment-provider';
import { PAYMENT_ERRORS, PaymentError } from '../domain/payment.errors';

const API = 'https://api.moyasar.com/v1';

/**
 * Compares two secrets without leaking their contents through how long it
 * takes.
 *
 * `===` on a secret returns as soon as two bytes differ, so the time taken
 * reports how much of a guess was right, one byte at a time. Hashing first
 * makes both sides the same length, which also keeps the comparison from
 * leaking the secret's length.
 */
function secretsMatch(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

/** The parts of a Moyasar delivery this adapter reads. */
interface MoyasarDelivery {
  type?: string;
  secret_token?: string;
  data?: {
    id?: string;
    invoice_id?: string;
    verification_code?: string | number;
  };
}

/** Moyasar's own vocabulary, narrowed to what the shop acts on. */
function statusOf(raw: unknown): PaymentStatus {
  const value = String(raw);
  if (value === 'paid') return 'paid';
  // `payment_faild` is not a typo here: Moyasar documents both spellings.
  if (['failed', 'faild', 'canceled', 'expired', 'voided'].includes(value))
    return 'failed';
  return 'pending';
}

/**
 * مُيسّر, through its hosted invoice page.
 *
 * The invoice flow is used rather than card tokenisation because it keeps card
 * details off this product entirely: the player pays on Moyasar's own page and
 * this service never sees, holds or transmits a card number.
 */
@Injectable()
export class MoyasarProvider implements PaymentProvider {
  readonly key = 'moyasar';
  private readonly logger = new Logger(MoyasarProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get secretKey(): string {
    const key = this.config.get<string>('MOYASAR_SECRET_KEY');
    if (!key)
      throw new PaymentError(
        PAYMENT_ERRORS.PROVIDER_UNAVAILABLE,
        'MOYASAR_SECRET_KEY is not configured',
      );
    return key;
  }

  /** Basic auth with the secret key as the username and no password. */
  private get authorization(): string {
    return `Basic ${Buffer.from(`${this.secretKey}:`).toString('base64')}`;
  }

  async start(request: PaymentRequest): Promise<StartedPayment> {
    const response = await fetch(`${API}/invoices`, {
      method: 'POST',
      headers: {
        Authorization: this.authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Halalas, as the catalogue stores them. Moyasar's own minimum is 100.
        amount: request.amountHalalas,
        currency: 'SAR',
        description: request.description,
        callback_url: request.callbackUrl,
        metadata: request.metadata,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      this.logger.error({
        event: 'moyasar_invoice_failed',
        status: response.status,
        body: body.slice(0, 500),
      });
      throw new PaymentError(
        PAYMENT_ERRORS.PROVIDER_UNAVAILABLE,
        `Moyasar refused the invoice (${response.status})`,
      );
    }
    const invoice = (await response.json()) as { id?: string; url?: string };
    if (!invoice.id || !invoice.url) {
      throw new PaymentError(
        PAYMENT_ERRORS.PROVIDER_UNAVAILABLE,
        'Moyasar returned an invoice without an id or a payment page',
      );
    }
    return { providerPaymentId: invoice.id, redirectUrl: invoice.url };
  }

  /**
   * Establishes what Moyasar says, in two steps.
   *
   * Moyasar puts the endpoint's `secret_token` inside the JSON body rather than
   * in a signature header, so step one is a constant-time comparison against
   * the configured secret. That alone would still trust a body, so step two
   * reads the invoice back from the API and answers from THAT — a replayed or
   * edited delivery then changes nothing, because the amount and status come
   * from Moyasar rather than from the request.
   */
  async verifyWebhook(input: {
    rawBody: string;
    headers: Record<string, string | undefined>;
  }): Promise<VerifiedPayment> {
    const body = this.authenticate(input.rawBody);

    const invoiceId = body.data?.invoice_id ?? body.data?.id;
    if (!invoiceId) {
      throw new PaymentError(
        PAYMENT_ERRORS.WEBHOOK_UNVERIFIED,
        'Webhook names no invoice',
      );
    }

    const invoice = await this.readInvoice(invoiceId);
    return {
      providerPaymentId: invoiceId,
      status: statusOf(invoice.status),
      amountHalalas: Number(invoice.amount),
      // Read back from Moyasar rather than from the delivery, and still not
      // what decides the grant: the purchase intent is.
      metadata: (invoice.metadata ?? {}) as VerifiedPayment['metadata'],
    };
  }

  /**
   * Moyasar proves an endpoint belongs to whoever configured it by posting a
   * short code here and asking for it back in the dashboard. It names no
   * invoice, so without this it would reach `verifyWebhook` and be refused as
   * malformed — leaving a webhook that can never be verified. The code is
   * logged because the dashboard asks for what OUR server received, and the
   * log is where a person reads that.
   */
  readEndpointNotice(input: {
    rawBody: string;
    headers: Record<string, string | undefined>;
  }): ProviderNotice | undefined {
    const body = this.authenticate(input.rawBody);
    const code = body.data?.verification_code;
    if (code === undefined || code === null || code === '') return undefined;
    return { event: body.type ?? 'webhook_verification', detail: String(code) };
  }

  /**
   * Establishes that a delivery really came from Moyasar, and hands back what
   * it said. Shared by every reader of a delivery so that none of them can be
   * written without the secret check.
   */
  private authenticate(rawBody: string): MoyasarDelivery {
    const expected = this.config.get<string>('MOYASAR_WEBHOOK_SECRET');
    if (!expected)
      throw new PaymentError(
        PAYMENT_ERRORS.PROVIDER_UNAVAILABLE,
        'MOYASAR_WEBHOOK_SECRET is not configured',
      );

    let body: MoyasarDelivery;
    try {
      body = JSON.parse(rawBody) as MoyasarDelivery;
    } catch {
      throw new PaymentError(
        PAYMENT_ERRORS.WEBHOOK_UNVERIFIED,
        'Webhook body is not JSON',
      );
    }

    if (!body.secret_token || !secretsMatch(body.secret_token, expected)) {
      throw new PaymentError(
        PAYMENT_ERRORS.WEBHOOK_UNVERIFIED,
        'Webhook secret does not match',
      );
    }
    return body;
  }

  private async readInvoice(id: string): Promise<{
    status?: unknown;
    amount?: unknown;
    metadata?: unknown;
  }> {
    const response = await fetch(`${API}/invoices/${id}`, {
      headers: { Authorization: this.authorization },
    });
    if (!response.ok) {
      throw new PaymentError(
        PAYMENT_ERRORS.PROVIDER_UNAVAILABLE,
        `Moyasar would not confirm invoice ${id} (${response.status})`,
      );
    }
    return (await response.json()) as Record<string, unknown>;
  }
}
