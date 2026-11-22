import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_PROVIDER, PaymentProvider } from '../domain/payment-provider';
import { PAYMENT_ERRORS, PaymentError } from '../domain/payment.errors';
import { TOKEN_PACKS, tokenPackById } from '../domain/token-pack';
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
    private readonly config: ConfigService,
  ) {}

  catalogue() {
    return TOKEN_PACKS;
  }

  async execute(input: {
    accountId: string;
    packId: string;
  }): Promise<{ redirectUrl: string }> {
    const pack = tokenPackById(input.packId);
    if (!pack) {
      throw new PaymentError(
        PAYMENT_ERRORS.UNKNOWN_PACK,
        `No such pack: ${input.packId}`,
      );
    }

    const siteUrl =
      this.config.get<string>('PUBLIC_SITE_URL') ?? 'https://playakwaan.com';

    const started = await this.provider.start({
      reference: `${input.accountId}:${pack.id}`,
      amountHalalas: pack.priceHalalas,
      metadata: { accountId: input.accountId, packId: pack.id },
      description: `أكوان — ${pack.label}`,
      callbackUrl: `${siteUrl}/matches`,
    });

    await this.intents.record({
      providerPaymentId: started.providerPaymentId,
      provider: this.provider.key,
      accountId: input.accountId,
      packId: pack.id,
      amountHalalas: pack.priceHalalas,
    });

    return { redirectUrl: started.redirectUrl };
  }
}
