import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_PROVIDER, PaymentProvider } from '../domain/payment-provider';
import { PAYMENT_ERRORS, PaymentError } from '../domain/payment.errors';
import { Quote, quoteWithCode } from '../domain/discount-code';
import { TOKEN_PACKS, tokenPackById } from '../domain/token-pack';
import { DiscountCodeRepository } from '../persistence/discount-code.repository';
import { PurchaseIntentRepository } from '../persistence/purchase-intent.repository';

/**
 * Opens a charge for a pack and records what it is for.
 *
 * The intent is written BEFORE the player is sent to pay. Writing it after
 * would leave a window in which a fast webhook arrives for a charge this
 * system cannot yet explain — and the fulfilment refuses those, correctly, so
 * the player would have paid and received nothing.
 */
@Injectable()
export class StartPurchase {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly intents: PurchaseIntentRepository,
    private readonly codes: DiscountCodeRepository,
    private readonly config: ConfigService,
  ) {}

  catalogue() {
    return TOKEN_PACKS;
  }

  /**
   * What a pack would cost, with a code applied if one holds up.
   *
   * The shop asks this before it charges anything, so the player sees the
   * price their code produces and agrees to that number rather than to a
   * surprise on the provider's page. A code that does not apply comes back
   * named, with the list price beside it — the shop can then say why, in
   * Arabic, without a second request.
   */
  async quote(input: { packId: string; code?: string }): Promise<Quote> {
    const pack = tokenPackById(input.packId);
    if (!pack) {
      throw new PaymentError(
        PAYMENT_ERRORS.UNKNOWN_PACK,
        `No such pack: ${input.packId}`,
      );
    }

    const trimmed = input.code?.trim();
    if (!trimmed) {
      return quoteWithCode(pack, undefined, new Date());
    }

    const found = await this.codes.findByCode(trimmed);
    if (!found) {
      return {
        ...quoteWithCode(pack, undefined, new Date()),
        refused: 'unknown',
      };
    }

    return quoteWithCode(pack, found, new Date());
  }

  async execute(input: {
    accountId: string;
    packId: string;
    code?: string;
  }): Promise<{ redirectUrl: string }> {
    const pack = tokenPackById(input.packId);
    if (!pack) {
      throw new PaymentError(
        PAYMENT_ERRORS.UNKNOWN_PACK,
        `No such pack: ${input.packId}`,
      );
    }

    // Priced here, server side, from the catalogue and the stored code. The
    // body says which pack and which code; it never says what either is worth.
    const quote = await this.quote({ packId: pack.id, code: input.code });

    // A code that was offered and did not apply stops the purchase rather than
    // quietly charging the list price. Someone who typed a code is buying at
    // the price the code promised, and taking the full amount because the code
    // turned out to be expired is how a chargeback starts.
    if (quote.refused) {
      throw new PaymentError(
        PAYMENT_ERRORS.CODE_REFUSED,
        `Code refused (${quote.refused}) for pack ${pack.id}`,
      );
    }

    const siteUrl =
      this.config.get<string>('PUBLIC_SITE_URL') ?? 'https://playakwaan.com';

    const started = await this.provider.start({
      reference: `${input.accountId}:${pack.id}`,
      amountHalalas: quote.totalHalalas,
      metadata: {
        accountId: input.accountId,
        packId: pack.id,
        ...(quote.code ? { discountCode: quote.code } : {}),
      },
      description: `أكوان — ${pack.label}`,
      callbackUrl: `${siteUrl}/matches`,
    });

    await this.intents.record({
      providerPaymentId: started.providerPaymentId,
      provider: this.provider.key,
      accountId: input.accountId,
      packId: pack.id,
      // What we actually asked for, discount included. The fulfilment checks
      // the captured amount against this, so a discounted charge verifies on
      // the same rule as a full-price one.
      amountHalalas: quote.totalHalalas,
      listPriceHalalas: pack.priceHalalas,
      discountCode: quote.code,
    });

    return { redirectUrl: started.redirectUrl };
  }
}
