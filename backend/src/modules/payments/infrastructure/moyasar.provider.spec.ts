import { ConfigService } from '@nestjs/config';
import { MoyasarProvider } from './moyasar.provider';

/**
 * What this adapter actually puts on the wire.
 *
 * The use-case tests stop at the port, so nothing above here can tell whether
 * a field was sent under the right name. One wasn't: the player's return
 * address went to `callback_url`, which Moyasar documents for invoices as a
 * server-to-server notification that redirects nobody — so a player who paid
 * was left sitting on the payment page, and invoice notifications were aimed
 * at a page of the website.
 */
const provider = () =>
  new MoyasarProvider({
    get: (key: string) =>
      key === 'MOYASAR_SECRET_KEY' ? 'sk_test_x' : undefined,
  } as unknown as ConfigService);

const invoiceRequest = {
  reference: 'acc-1:single',
  amountHalalas: 1500,
  metadata: { accountId: 'acc-1', packId: 'single' },
  description: 'أكوان — مباراة وحدة',
  callbackUrl: 'https://playakwaan.com/matches',
};

describe('opening an invoice', () => {
  let sent: Record<string, unknown>;

  beforeEach(async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'inv_1',
        url: 'https://checkout.moyasar.com/invoices/inv_1?lang=en',
      }),
    }) as unknown as typeof fetch;
    await provider().start(invoiceRequest);
    const call = (global.fetch as jest.Mock).mock.calls[0];
    sent = JSON.parse(call[1].body as string) as Record<string, unknown>;
  });

  it('sends the return address as success_url, the field that redirects', () => {
    expect(sent.success_url).toBe(invoiceRequest.callbackUrl);
  });

  it('never sends callback_url, which would aim notifications at a page', () => {
    // Deliveries come through the verified dashboard webhook, and only there.
    expect(sent).not.toHaveProperty('callback_url');
  });

  it('charges the halalas it was given, untouched', () => {
    expect(sent.amount).toBe(1500);
    expect(sent.currency).toBe('SAR');
  });

  it('returns a payment page in Arabic', async () => {
    const started = await provider().start(invoiceRequest);
    expect(new URL(started.redirectUrl).searchParams.get('lang')).toBe('ar');
  });
});
