import { GiftCodeService, GIFT_CODE_ERRORS } from './gift-code.service';
import { TokenLedgerService } from './token-ledger.service';
import { fakeCampaignRepository } from './campaign.fake';

function gifts() {
  const store = fakeCampaignRepository();
  const balances = new Map<string, number>();
  const grant = jest.fn(
    async (input: { accountId: string; amount: number }) => {
      const next = (balances.get(input.accountId) ?? 0) + input.amount;
      balances.set(input.accountId, next);
      return { balanceAfter: next };
    },
  );
  const service = new GiftCodeService(store.repository, {
    grant,
  } as unknown as TokenLedgerService);
  return { service, grant, ...store };
}

/** The refusal's own code, so a reworded sentence cannot break these. */
async function refusedWith(attempt: Promise<unknown>, code: string) {
  await expect(
    attempt.then(
      () => 'accepted',
      (error: { getResponse: () => { code: string } }) =>
        error.getResponse().code,
    ),
  ).resolves.toBe(code);
}

/** The feedback code: 50 uses, two Matches, once per account. */
describe('a gift code', () => {
  it('adds its Matches and says how many', async () => {
    const { service, grant } = gifts();
    await service.create({ code: 'feedback', tokens: 2, maxRedemptions: 50 });

    await expect(service.redeem('acc-1', ' Feedback ')).resolves.toEqual({
      tokens: 2,
      balance: 2,
    });
    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        amount: 2,
        reason: 'gift-code',
        reference: 'FEEDBACK',
        idempotencyKey: 'gift:FEEDBACK:acc-1',
      }),
    );
  });

  it('works once per account', async () => {
    const { service, grant } = gifts();
    await service.create({ code: 'FEEDBACK', tokens: 2, maxRedemptions: 50 });
    await service.redeem('acc-1', 'FEEDBACK');

    await refusedWith(
      service.redeem('acc-1', 'FEEDBACK'),
      GIFT_CODE_ERRORS.ALREADY_USED,
    );
    expect(grant).toHaveBeenCalledTimes(1);
  });

  it('says it has run out, and leaves the late account free to use another', async () => {
    const { service, codes } = gifts();
    await service.create({ code: 'TWO', tokens: 2, maxRedemptions: 2 });
    await service.redeem('acc-1', 'TWO');
    await service.redeem('acc-2', 'TWO');

    await refusedWith(service.redeem('acc-3', 'TWO'), GIFT_CODE_ERRORS.USED_UP);
    expect(codes.get('TWO')?.redemptionCount).toBe(2);
    // Raising the cap later lets that same account in: being turned away
    // must not have marked the code as used by them.
    codes.get('TWO')!.maxRedemptions = 3;
    await expect(service.redeem('acc-3', 'TWO')).resolves.toMatchObject({
      tokens: 2,
    });
  });

  it('treats a paused or unknown code the same way: not valid', async () => {
    const { service } = gifts();
    await service.create({ code: 'PAUSED', tokens: 2, maxRedemptions: 5 });
    await service.setActive('paused', false);

    for (const code of ['PAUSED', 'NOPE']) {
      await refusedWith(
        service.redeem('acc-1', code),
        GIFT_CODE_ERRORS.UNKNOWN,
      );
    }
  });

  it('refuses a second code with the same name', async () => {
    const { service } = gifts();
    await service.create({ code: 'SAME', tokens: 1, maxRedemptions: 1 });
    await refusedWith(
      service.create({ code: 'same', tokens: 1, maxRedemptions: 1 }),
      GIFT_CODE_ERRORS.TAKEN,
    );
  });
});
