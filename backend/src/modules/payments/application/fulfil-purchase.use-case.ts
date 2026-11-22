import { Inject, Injectable, Logger } from '@nestjs/common';
import { TokenLedgerService } from '../../entitlements/application/token-ledger.service';
import { PAYMENT_PROVIDER, PaymentProvider } from '../domain/payment-provider';
import { PAYMENT_ERRORS, PaymentError } from '../domain/payment.errors';
import { tokenPackById } from '../domain/token-pack';
import { PurchaseIntentRepository } from '../persistence/purchase-intent.repository';

/** What the webhook did, for the log and for the provider's response. */
export type FulfilmentOutcome =
  | { granted: true; tokens: number; accountId: string }
  | { granted: false; reason: 'not-paid' };

/**
 * Turns a paid charge into tokens, exactly once.
 *
 * Nothing the delivery claims about itself is used to decide what to grant.
 * Three independent things have to agree first:
 *
 * 1. The delivery is authentic — the adapter verifies it against the provider
 *    and reads the payment back from the provider's own API. An unauthenticated
 *    POST never reaches the ledger.
 * 2. We started this charge. The account and the pack come from the intent we
 *    wrote before the player ever saw the payment page, not from the webhook.
 *    A charge nobody here started is not fulfilled at all.
 * 3. The captured amount equals the pack's listed price. Otherwise the cheapest
 *    charge in the catalogue could be redirected into the largest pack.
 *
 * The movement is keyed on the provider's own payment id, so a webhook
 * delivered twice — which every provider does eventually — adds nothing the
 * second time.
 *
 * A payment that is not `paid` is not an error. Providers send `pending` and
 * `failed` as a matter of course, and answering them with a 500 only earns a
 * retry storm.
 */
@Injectable()
export class FulfilPurchase {
  private readonly logger = new Logger(FulfilPurchase.name);

  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly tokens: TokenLedgerService,
    private readonly intents: PurchaseIntentRepository,
  ) {}

  async fromWebhook(input: {
    rawBody: string;
    headers: Record<string, string | undefined>;
  }): Promise<FulfilmentOutcome> {
    const payment = await this.provider.verifyWebhook(input);

    if (payment.status !== 'paid') {
      this.logger.log({
        event: 'purchase_webhook_ignored',
        providerPaymentId: payment.providerPaymentId,
        status: payment.status,
      });
      return { granted: false, reason: 'not-paid' };
    }

    const intent = await this.intents.findByProviderPaymentId(
      this.provider.key,
      payment.providerPaymentId,
    );
    if (!intent) {
      // Money moved for something this system never started. A person has to
      // look: granting on a guess is worse than leaving it visible.
      throw new PaymentError(
        PAYMENT_ERRORS.UNKNOWN_PACK,
        `A paid charge arrived that no purchase here started: ${payment.providerPaymentId}`,
      );
    }

    const pack = tokenPackById(intent.packId);
    if (!pack) {
      // A pack retired since the charge began. The money is real, so this is
      // for a person rather than a default.
      throw new PaymentError(
        PAYMENT_ERRORS.UNKNOWN_PACK,
        `A paid charge names a pack that is no longer in the catalogue: ${intent.packId}`,
      );
    }

    if (payment.amountHalalas !== pack.priceHalalas) {
      throw new PaymentError(
        PAYMENT_ERRORS.AMOUNT_MISMATCH,
        `Charge ${payment.providerPaymentId} captured ${payment.amountHalalas} halalas for a pack priced at ${pack.priceHalalas}`,
      );
    }

    const key = `${this.provider.key}:${payment.providerPaymentId}`;
    await this.tokens.grant({
      accountId: intent.accountId,
      amount: pack.tokens,
      reason: 'purchase',
      reference: key,
      idempotencyKey: key,
    });
    await this.intents.markFulfilled(
      this.provider.key,
      payment.providerPaymentId,
      new Date(),
    );

    this.logger.log({
      event: 'purchase_fulfilled',
      accountId: intent.accountId,
      packId: pack.id,
      tokens: pack.tokens,
      reference: key,
    });
    return { granted: true, tokens: pack.tokens, accountId: intent.accountId };
  }
}
