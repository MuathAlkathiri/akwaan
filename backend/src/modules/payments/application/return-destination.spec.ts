import { ConfigService } from '@nestjs/config';
import { StartPurchase } from './start-purchase.use-case';
import { PaymentProvider } from '../domain/payment-provider';
import { DiscountCodeRepository } from '../persistence/discount-code.repository';
import { PurchaseIntentRepository } from '../persistence/purchase-intent.repository';

/**
 * Where a paying player is sent back to.
 *
 * This exists because the return path was dead for a day and nothing noticed:
 * the gateway sent players to a page that had no settlement code on it, so the
 * second of the three ways a purchase can land never ran. Production hid it —
 * the webhook settled everything — and it only surfaced the first time a
 * charge completed somewhere with no webhook configured.
 *
 * The property is narrow and worth keeping: the page named here must be the
 * page that reads the charge id and calls settle.
 */
describe('the page the gateway returns a player to', () => {
  const start = jest.fn().mockResolvedValue({
    providerPaymentId: 'pay_1',
    redirectUrl: 'https://moyasar.test/x',
  });

  const open = async () => {
    const useCase = new StartPurchase(
      { key: 'moyasar', start } as unknown as PaymentProvider,
      { record: jest.fn() } as unknown as PurchaseIntentRepository,
      { findByCode: jest.fn() } as unknown as DiscountCodeRepository,
      { get: () => 'https://playakwaan.com' } as unknown as ConfigService,
    );
    await useCase.execute({ accountId: 'acc-1', packId: 'five' });
    return start.mock.calls.at(-1)![0] as { callbackUrl: string };
  };

  it('is the shop, which is where the settlement code lives', async () => {
    const { callbackUrl } = await open();
    expect(callbackUrl).toBe('https://playakwaan.com/shop');
  });

  it('is not the Matches list, which cannot settle anything', async () => {
    const { callbackUrl } = await open();
    expect(callbackUrl).not.toContain('/matches');
  });
});
