import { Inject, Injectable, Logger } from '@nestjs/common';
import { TokenLedgerService } from '../../entitlements/application/token-ledger.service';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
  VerifiedPayment,
} from '../domain/payment-provider';
import { PAYMENT_ERRORS, PaymentError } from '../domain/payment.errors';
import { tokenPackById } from '../domain/token-pack';
import {
  PurchaseIntent,
  PurchaseIntentRepository,
} from '../persistence/purchase-intent.repository';
import { DiscountCodeRepository } from '../persistence/discount-code.repository';

/** What the webhook did, for the log and for the provider's response. */
export type FulfilmentOutcome =
  | { granted: true; tokens: number; accountId: string }
  | { granted: false; reason: 'not-paid' | 'notice' | 'unknown' };

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
    private readonly codes: DiscountCodeRepository,
  ) {}

  async fromWebhook(input: {
    rawBody: string;
    headers: Record<string, string | undefined>;
  }): Promise<FulfilmentOutcome> {
    // Some deliveries are about the endpoint rather than about money — the
    // provider checking that this URL is really ours. Those are read first,
    // because they name no payment and would otherwise look malformed.
    const notice = this.provider.readEndpointNotice?.(input);
    if (notice) {
      this.logger.log({
        event: 'provider_notice',
        provider: this.provider.key,
        notice: notice.event,
        detail: notice.detail,
      });
      return { granted: false, reason: 'notice' };
    }

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

    return this.settle(payment, intent);
  }

  /**
   * Settles a charge the player came back with, rather than one a webhook
   * announced.
   *
   * A delivery can be lost for good. The provider retries and then gives up,
   * and what is left is a player who paid and received nothing, with no one
   * watching. The provider sends the player back carrying the charge's id, so
   * their return is a second chance to notice — and the payment is still read
   * from the provider, never from the query string that brought them.
   *
   * Scoped to the asker's own purchases. Otherwise a signed-in player could
   * walk charge ids and learn which ones exist.
   */
  async fromReturn(input: {
    providerPaymentId: string;
    accountId: string;
  }): Promise<FulfilmentOutcome> {
    const intent = await this.intents.findByProviderPaymentId(
      this.provider.key,
      input.providerPaymentId,
    );
    if (!intent || intent.accountId !== input.accountId) {
      return { granted: false, reason: 'unknown' };
    }

    return this.fromRecord(intent);
  }

  /**
   * Re-checks a charge from our own record of it, with nobody asking.
   *
   * The two routes above both depend on someone turning up — the provider
   * with a delivery, or the player with a return. A player who paid and then
   * closed the tab is neither, and the sweeper behind this is the only thing
   * that would ever notice them.
   */
  async fromRecord(intent: PurchaseIntent): Promise<FulfilmentOutcome> {
    const payment = await this.provider.readPayment(intent.providerPaymentId);
    if (payment.status !== 'paid') {
      return { granted: false, reason: 'not-paid' };
    }

    return this.settle(payment, intent);
  }

  /**
   * The grant itself, for a payment the provider has reported as paid and an
   * intent we wrote before the player ever saw the payment page.
   *
   * Shared by every route in, so a second way to settle a charge cannot be
   * added without the price check or the idempotency key.
   */
  private async settle(
    payment: VerifiedPayment,
    intent: PurchaseIntent,
  ): Promise<FulfilmentOutcome> {
    const pack = tokenPackById(intent.packId);
    if (!pack) {
      // A pack retired since the charge began. The money is real, so this is
      // for a person rather than a default.
      throw new PaymentError(
        PAYMENT_ERRORS.UNKNOWN_PACK,
        `A paid charge names a pack that is no longer in the catalogue: ${intent.packId}`,
      );
    }

    // Checked against our own record of what we asked for, not against the
    // catalogue. The two are the same for a full-price sale and differ by the
    // discount for a coded one, and the intent is written by this system
    // before the player ever reaches the provider — so it is still a number
    // nobody outside could choose.
    if (payment.amountHalalas !== intent.amountHalalas) {
      throw new PaymentError(
        PAYMENT_ERRORS.AMOUNT_MISMATCH,
        `Charge ${payment.providerPaymentId} captured ${payment.amountHalalas} halalas for an intent opened at ${intent.amountHalalas}`,
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

    // Counted here and nowhere else: a redemption is a sale, not a visit to
    // the payment page. The grant above is idempotent on the charge id, and
    // `markFulfilled` runs before this, so a webhook delivered twice cannot
    // reach this line twice for the same charge.
    if (intent.discountCode && !intent.fulfilledAt) {
      await this.codes.countRedemption(intent.discountCode);
    }

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
