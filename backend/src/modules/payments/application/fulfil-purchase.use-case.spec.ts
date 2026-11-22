import { FulfilPurchase } from './fulfil-purchase.use-case';
import { PAYMENT_ERRORS, PaymentError } from '../domain/payment.errors';
import { TOKEN_PACKS, tokenPackById } from '../domain/token-pack';
import { PaymentProvider, VerifiedPayment } from '../domain/payment-provider';
import { TokenLedgerService } from '../../entitlements/application/token-ledger.service';
import {
  PurchaseIntent,
  PurchaseIntentRepository,
} from '../persistence/purchase-intent.repository';

/**
 * The line between a paid charge and a granted Match.
 *
 * Everything here is about refusing to move a balance on anything but the
 * provider's own word. The webhook body is a POST from the open internet; the
 * pack's listed price is the only authority on what a pack costs.
 */
const FIVE = tokenPackById('five')!;

const payment = (over: Partial<VerifiedPayment> = {}): VerifiedPayment => ({
  providerPaymentId: 'pay_123',
  status: 'paid',
  amountHalalas: FIVE.priceHalalas,
  metadata: {},
  ...over,
});

/** What we wrote before the player ever saw the payment page. */
const intentFor = (over: Partial<PurchaseIntent> = {}): PurchaseIntent => ({
  providerPaymentId: 'pay_123',
  provider: 'moyasar',
  accountId: 'acc-1',
  packId: FIVE.id,
  amountHalalas: FIVE.priceHalalas,
  ...over,
});

/**
 * `null` means "we never started this charge".
 *
 * Deliberately not `undefined`: passing `undefined` to a parameter with a
 * default silently selects the default, so the no-intent case would have been
 * tested against an intent that exists.
 */
const deliver = (
  verified: VerifiedPayment,
  intent: PurchaseIntent | null = intentFor(),
) => {
  const grant = jest.fn().mockResolvedValue({});
  const markFulfilled = jest.fn().mockResolvedValue(undefined);
  const provider: PaymentProvider = {
    key: 'moyasar',
    start: jest.fn(),
    verifyWebhook: jest.fn().mockResolvedValue(verified),
  };
  const useCase = new FulfilPurchase(
    provider,
    { grant } as unknown as TokenLedgerService,
    {
      findByProviderPaymentId: jest.fn().mockResolvedValue(intent ?? undefined),
      markFulfilled,
      record: jest.fn(),
    } as unknown as PurchaseIntentRepository,
  );
  return {
    grant,
    markFulfilled,
    run: () => useCase.fromWebhook({ rawBody: '{}', headers: {} }),
  };
};

describe('turning a paid charge into tokens', () => {
  it('grants exactly what the pack says, not what the charge claims', async () => {
    const { run, grant } = deliver(payment());
    await expect(run()).resolves.toEqual({
      granted: true,
      tokens: FIVE.tokens,
      accountId: 'acc-1',
    });
    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        amount: FIVE.tokens,
        reason: 'purchase',
      }),
    );
  });

  it('keys the movement on the provider payment, so a repeat delivery adds nothing', async () => {
    // Every provider redelivers a webhook sooner or later.
    const { run, grant } = deliver(payment());
    await run();
    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'moyasar:pay_123' }),
    );
  });

  it('refuses a charge that paid less than the pack costs', async () => {
    // The attack this exists for: start the cheapest charge, hand back a body
    // naming the largest pack.
    const { run, grant } = deliver(
      payment({ amountHalalas: tokenPackById('single')!.priceHalalas }),
    );
    await expect(run()).rejects.toBeInstanceOf(PaymentError);
    expect(grant).not.toHaveBeenCalled();
  });

  it('refuses a charge that paid more, rather than quietly keeping it', async () => {
    const { run, grant } = deliver({
      ...payment(),
      amountHalalas: FIVE.priceHalalas + 1,
    });
    await expect(run()).rejects.toBeInstanceOf(PaymentError);
    expect(grant).not.toHaveBeenCalled();
  });

  it('refuses a pack that is no longer in the catalogue', async () => {
    const { run, grant } = deliver(payment(), intentFor({ packId: 'fifty' }));
    await expect(run()).rejects.toBeInstanceOf(PaymentError);
    expect(grant).not.toHaveBeenCalled();
  });

  it('refuses a paid charge that this system never started', async () => {
    // Money moved for something nobody here asked for. A person has to look:
    // granting on a guess is worse than leaving it visible.
    const { run, grant } = deliver(payment(), null);
    await expect(run()).rejects.toBeInstanceOf(PaymentError);
    expect(grant).not.toHaveBeenCalled();
  });

  it('uses our own record, not the account the delivery claims', async () => {
    // The whole reason the intent exists: a forged body naming another account
    // and a larger pack must change neither.
    const { run, grant } = deliver(
      payment({ metadata: { accountId: 'someone-else', packId: 'fifteen' } }),
    );
    await run();
    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acc-1', amount: FIVE.tokens }),
    );
  });

  it('marks the intent fulfilled, so a person can see what landed', async () => {
    const { run, markFulfilled } = deliver(payment());
    await run();
    expect(markFulfilled).toHaveBeenCalledWith(
      'moyasar',
      'pay_123',
      expect.any(Date),
    );
  });

  it.each(['pending', 'failed'] as const)(
    'lets a %s charge pass without touching the ledger',
    async (status) => {
      // Providers send these as a matter of course; answering with an error
      // only earns a retry storm.
      const { run, grant } = deliver(payment({ status }));
      await expect(run()).resolves.toEqual({
        granted: false,
        reason: 'not-paid',
      });
      expect(grant).not.toHaveBeenCalled();
    },
  );

  it('never reaches the ledger when the delivery cannot be authenticated', async () => {
    const grant = jest.fn();
    const provider: PaymentProvider = {
      key: 'moyasar',
      start: jest.fn(),
      verifyWebhook: jest
        .fn()
        .mockRejectedValue(new PaymentError('X', 'unverified')),
    };
    const useCase = new FulfilPurchase(
      provider,
      { grant } as unknown as TokenLedgerService,
      {
        findByProviderPaymentId: jest.fn(),
        markFulfilled: jest.fn(),
        record: jest.fn(),
      } as unknown as PurchaseIntentRepository,
    );
    await expect(
      useCase.fromWebhook({ rawBody: '{}', headers: {} }),
    ).rejects.toBeInstanceOf(PaymentError);
    expect(grant).not.toHaveBeenCalled();
  });
});

describe('the catalogue', () => {
  it('prices every pack in whole halalas', () => {
    for (const pack of TOKEN_PACKS) {
      expect(Number.isInteger(pack.priceHalalas)).toBe(true);
      expect(pack.priceHalalas).toBeGreaterThan(0);
      expect(Number.isInteger(pack.tokens)).toBe(true);
    }
  });

  it('never prices a bigger pack worse per Match than a smaller one', () => {
    // The packs exist to raise the average order and carry the margin; one
    // that costs more per Match than the single would be a pricing mistake
    // nobody would notice until a player did the arithmetic.
    const perMatch = [...TOKEN_PACKS]
      .sort((a, b) => a.tokens - b.tokens)
      .map((pack) => pack.priceHalalas / pack.tokens);
    for (let i = 1; i < perMatch.length; i += 1) {
      expect(perMatch[i]).toBeLessThanOrEqual(perMatch[i - 1]);
    }
  });

  it('keeps ids unique, since the ledger records them', () => {
    expect(new Set(TOKEN_PACKS.map((p) => p.id)).size).toBe(TOKEN_PACKS.length);
  });
});

describe('a delivery that is about the endpoint, not about money', () => {
  /**
   * Moyasar posts a short code to the webhook URL and asks for it back in the
   * dashboard. It names no invoice, so before this was understood the delivery
   * was refused as malformed and the webhook could never be verified at all.
   */
  const withNotice = (
    notice: { event: string; detail?: string } | undefined,
  ) => {
    const grant = jest.fn().mockResolvedValue({});
    const verifyWebhook = jest.fn();
    const provider: PaymentProvider = {
      key: 'moyasar',
      start: jest.fn(),
      verifyWebhook,
      readEndpointNotice: jest.fn().mockReturnValue(notice),
    };
    const useCase = new FulfilPurchase(
      provider,
      { grant } as unknown as TokenLedgerService,
      {
        findByProviderPaymentId: jest.fn(),
        markFulfilled: jest.fn(),
        record: jest.fn(),
      } as unknown as PurchaseIntentRepository,
    );
    return {
      grant,
      verifyWebhook,
      run: () => useCase.fromWebhook({ rawBody: '{}', headers: {} }),
    };
  };

  it('answers it without reading any payment', async () => {
    const { run, verifyWebhook, grant } = withNotice({
      event: 'webhook_verification',
      detail: '123456',
    });
    await expect(run()).resolves.toEqual({ granted: false, reason: 'notice' });
    // The point: it never looks for a payment that was never named.
    expect(verifyWebhook).not.toHaveBeenCalled();
    expect(grant).not.toHaveBeenCalled();
  });

  it('still fulfils an ordinary payment when the provider reports no notice', async () => {
    const { run, verifyWebhook } = withNotice(undefined);
    verifyWebhook.mockRejectedValue(
      new PaymentError(
        PAYMENT_ERRORS.WEBHOOK_UNVERIFIED,
        'reached the payment path',
      ),
    );
    await expect(run()).rejects.toBeInstanceOf(PaymentError);
    expect(verifyWebhook).toHaveBeenCalled();
  });
});
