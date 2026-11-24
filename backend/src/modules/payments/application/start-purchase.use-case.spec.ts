import { ConfigService } from '@nestjs/config';
import { StartPurchase } from './start-purchase.use-case';
import { PAYMENT_ERRORS, PaymentError } from '../domain/payment.errors';
import { DiscountCode } from '../domain/discount-code';
import { PaymentProvider } from '../domain/payment-provider';
import { DiscountCodeRepository } from '../persistence/discount-code.repository';
import {
  PurchaseIntent,
  PurchaseIntentRepository,
} from '../persistence/purchase-intent.repository';
import { tokenPackById } from '../domain/token-pack';

/**
 * Opening a charge, with and without a code.
 *
 * The property under test throughout is that the amount sent to the provider
 * and the amount written to the intent are the same number, and that the
 * number came from the catalogue and the stored code rather than from the
 * request. A body that could influence the price is a body that can buy the
 * fifteen-pack for a riyal.
 */
const FIFTEEN = tokenPackById('twelve')!;

const code = (over: Partial<DiscountCode> = {}): DiscountCode => ({
  code: 'AKWAAN20',
  percentOff: 20,
  packIds: [],
  maxRedemptions: null,
  redeemedCount: 0,
  active: true,
  ...over,
});

function build(stored?: DiscountCode) {
  const recorded: PurchaseIntent[] = [];
  const start = jest.fn().mockResolvedValue({
    providerPaymentId: 'pay_1',
    redirectUrl: 'https://moyasar.test/invoice/pay_1',
  });
  const provider = { key: 'moyasar', start } as unknown as PaymentProvider;

  const useCase = new StartPurchase(
    provider,
    {
      record: jest.fn(async (intent: PurchaseIntent) => {
        recorded.push(intent);
      }),
    } as unknown as PurchaseIntentRepository,
    {
      findByCode: jest.fn().mockResolvedValue(stored),
    } as unknown as DiscountCodeRepository,
    { get: () => 'https://playakwaan.com' } as unknown as ConfigService,
  );

  return { useCase, start, recorded };
}

describe('quoting a pack', () => {
  it('quotes the list price when no code is given', async () => {
    const { useCase } = build();
    const quote = await useCase.quote({ packId: FIFTEEN.id });
    expect(quote.totalHalalas).toBe(FIFTEEN.priceHalalas);
    expect(quote.refused).toBeUndefined();
  });

  it('names a code it has never heard of rather than charging on quietly', async () => {
    const { useCase } = build(undefined);
    const quote = await useCase.quote({ packId: FIFTEEN.id, code: 'NOPE' });
    expect(quote.refused).toBe('unknown');
    expect(quote.totalHalalas).toBe(FIFTEEN.priceHalalas);
  });

  it('applies a code that holds up', async () => {
    const { useCase } = build(code());
    const quote = await useCase.quote({ packId: FIFTEEN.id, code: 'akwaan20' });
    expect(quote.discountHalalas).toBe(FIFTEEN.priceHalalas * 0.2);
    expect(quote.code).toBe('AKWAAN20');
  });

  it('refuses a pack the catalogue does not sell', async () => {
    const { useCase } = build();
    await expect(useCase.quote({ packId: 'ghost' })).rejects.toBeInstanceOf(
      PaymentError,
    );
  });
});

describe('opening a charge', () => {
  it('charges the list price and records it', async () => {
    const { useCase, start, recorded } = build();
    await useCase.execute({ accountId: 'acc-1', packId: FIFTEEN.id });

    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ amountHalalas: FIFTEEN.priceHalalas }),
    );
    expect(recorded[0].amountHalalas).toBe(FIFTEEN.priceHalalas);
    expect(recorded[0].discountCode).toBeUndefined();
  });

  it('charges the discounted amount, and records that same amount', async () => {
    const { useCase, start, recorded } = build(code());
    await useCase.execute({
      accountId: 'acc-1',
      packId: FIFTEEN.id,
      code: 'AKWAAN20',
    });

    const expected = FIFTEEN.priceHalalas * 0.8;
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ amountHalalas: expected }),
    );
    // The two must agree: fulfilment checks the captured amount against the
    // intent, so an intent holding the list price would reject the very
    // charge this call just opened.
    expect(recorded[0].amountHalalas).toBe(expected);
    expect(recorded[0].listPriceHalalas).toBe(FIFTEEN.priceHalalas);
    expect(recorded[0].discountCode).toBe('AKWAAN20');
  });

  it('stops rather than charging full price when the code does not apply', async () => {
    const { useCase, start } = build(code({ active: false }));
    await expect(
      useCase.execute({
        accountId: 'acc-1',
        packId: FIFTEEN.id,
        code: 'AKWAAN20',
      }),
    ).rejects.toMatchObject({ code: PAYMENT_ERRORS.CODE_REFUSED });
    expect(start).not.toHaveBeenCalled();
  });

  it('stops on a code that was used up, rather than silently dropping it', async () => {
    const { useCase, start } = build(
      code({ maxRedemptions: 10, redeemedCount: 10 }),
    );
    await expect(
      useCase.execute({
        accountId: 'acc-1',
        packId: FIFTEEN.id,
        code: 'AKWAAN20',
      }),
    ).rejects.toMatchObject({ code: PAYMENT_ERRORS.CODE_REFUSED });
    expect(start).not.toHaveBeenCalled();
  });

  it('treats a blank code as no code at all', async () => {
    const { useCase, start } = build();
    await useCase.execute({
      accountId: 'acc-1',
      packId: FIFTEEN.id,
      code: '   ',
    });
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ amountHalalas: FIFTEEN.priceHalalas }),
    );
  });
});
