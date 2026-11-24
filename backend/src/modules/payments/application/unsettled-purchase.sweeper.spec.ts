import { UnsettledPurchaseSweeper } from './unsettled-purchase.sweeper';
import { FulfilPurchase, FulfilmentOutcome } from './fulfil-purchase.use-case';
import { PaymentProvider } from '../domain/payment-provider';
import {
  PurchaseIntent,
  PurchaseIntentRepository,
} from '../persistence/purchase-intent.repository';

/**
 * The player nobody would otherwise notice.
 *
 * Both of the other routes to fulfilment need someone to turn up — the
 * provider with a delivery, or the player with a return. This is what covers
 * the player who paid and closed the tab, and the delivery the provider
 * retried and then gave up on.
 */
const intentFor = (over: Partial<PurchaseIntent> = {}): PurchaseIntent => ({
  providerPaymentId: 'pay_1',
  provider: 'moyasar',
  accountId: 'acc-1',
  packId: 'six',
  amountHalalas: 6000,
  ...over,
});

const granted: FulfilmentOutcome = {
  granted: true,
  tokens: 5,
  accountId: 'acc-1',
};
const notPaid: FulfilmentOutcome = { granted: false, reason: 'not-paid' };

const sweeper = (
  candidates: PurchaseIntent[],
  fromRecord: jest.Mock = jest.fn().mockResolvedValue(granted),
) => {
  const findUnfulfilled = jest.fn().mockResolvedValue(candidates);
  const instance = new UnsettledPurchaseSweeper(
    { key: 'moyasar' } as unknown as PaymentProvider,
    { findUnfulfilled } as unknown as PurchaseIntentRepository,
    { fromRecord } as unknown as FulfilPurchase,
  );
  return { instance, findUnfulfilled, fromRecord };
};

describe('sweeping charges nobody settled', () => {
  it('settles every charge it finds', async () => {
    const { instance, fromRecord } = sweeper([
      intentFor(),
      intentFor({ providerPaymentId: 'pay_2' }),
    ]);
    await expect(instance.sweep()).resolves.toEqual({
      checked: 2,
      granted: 2,
    });
    expect(fromRecord).toHaveBeenCalledTimes(2);
  });

  it('grants nothing for a charge that was never paid', async () => {
    const { instance } = sweeper(
      [intentFor()],
      jest.fn().mockResolvedValue(notPaid),
    );
    await expect(instance.sweep()).resolves.toEqual({
      checked: 1,
      granted: 0,
    });
  });

  it('carries on when one charge cannot be answered', async () => {
    // A provider that 404s on an old invoice must not strand the rest.
    const fromRecord = jest
      .fn()
      .mockRejectedValueOnce(new Error('provider said no'))
      .mockResolvedValue(granted);
    const { instance } = sweeper(
      [intentFor(), intentFor({ providerPaymentId: 'pay_2' })],
      fromRecord,
    );
    await expect(instance.sweep()).resolves.toEqual({
      checked: 2,
      granted: 1,
    });
  });

  it('leaves a charge opened moments ago alone', async () => {
    // The webhook is still in flight, and the player may still be typing.
    const { instance, findUnfulfilled } = sweeper([]);
    await instance.sweep();
    const { startedBefore } = findUnfulfilled.mock.calls[0][0] as {
      startedBefore: Date;
    };
    expect(startedBefore.getTime()).toBeLessThan(Date.now());
  });

  it('stops looking at charges old enough to be abandoned', async () => {
    // Without a floor, every abandoned checkout would be re-queried for ever.
    const { instance, findUnfulfilled } = sweeper([]);
    await instance.sweep();
    const { startedAfter, startedBefore, limit } = findUnfulfilled.mock
      .calls[0][0] as {
      startedAfter: Date;
      startedBefore: Date;
      limit: number;
    };
    expect(startedAfter.getTime()).toBeLessThan(startedBefore.getTime());
    expect(limit).toBeGreaterThan(0);
  });

  it('does nothing once the module is shutting down', async () => {
    const { instance, findUnfulfilled } = sweeper([intentFor()]);
    instance.onModuleDestroy();
    await expect(instance.sweep()).resolves.toEqual({
      checked: 0,
      granted: 0,
    });
    expect(findUnfulfilled).not.toHaveBeenCalled();
  });
});
