import { TokenLedgerService } from './token-ledger.service';
import {
  INSUFFICIENT,
  TokenLedgerRepository,
  TokenMovement,
} from '../persistence/token-ledger.repository';
import { TokenLedgerError } from '../domain/token-ledger';

/** A repository that keeps one account's movements in memory. */
function fakeLedger() {
  const recorded = new Map<string, TokenMovement>();
  let balance = 0;
  const repository = {
    balanceOf: jest.fn(async () => balance),
    findByIdempotencyKey: jest.fn(
      async (_accountId: string, key: string) => recorded.get(key) ?? null,
    ),
    apply: jest.fn(async (entry: TokenMovement['entry']) => {
      if (entry.delta < 0 && balance < -entry.delta) return INSUFFICIENT;
      balance += entry.delta;
      const movement = { entry, balanceAfter: balance };
      recorded.set(entry.idempotencyKey, movement);
      return movement;
    }),
    history: jest.fn(async () => [...recorded.values()]),
  };
  return {
    repository: repository as unknown as TokenLedgerRepository,
    spy: repository,
    credit: (amount: number) => {
      balance += amount;
    },
    get balance() {
      return balance;
    },
  };
}

describe('spending a token on a Match', () => {
  it('charges once, however many times the same Match asks', async () => {
    // A dropped connection, a retried command, a reconciler catching up: the
    // Match is the same Match, so it costs what one Match costs.
    const ledger = fakeLedger();
    ledger.credit(2);
    const service = new TokenLedgerService(ledger.repository);

    const first = await service.spendForMatch({
      accountId: 'account-1',
      matchId: 'match-1',
    });
    const again = await service.spendForMatch({
      accountId: 'account-1',
      matchId: 'match-1',
    });

    expect(first).toEqual({ charged: true, balanceAfter: 1 });
    expect(again).toEqual({ charged: true, balanceAfter: 1 });
    expect(ledger.balance).toBe(1);
    expect(ledger.spy.apply).toHaveBeenCalledTimes(1);
  });

  it('answers that it could not charge, rather than throwing', async () => {
    // An empty balance is an ordinary thing to tell a player, not a failure:
    // the caller shows them the shop, it does not catch an exception.
    const service = new TokenLedgerService(fakeLedger().repository);

    await expect(
      service.spendForMatch({ accountId: 'account-1', matchId: 'match-1' }),
    ).resolves.toEqual({ charged: false });
  });

  it('charges each Match separately', async () => {
    const ledger = fakeLedger();
    ledger.credit(2);
    const service = new TokenLedgerService(ledger.repository);

    await service.spendForMatch({ accountId: 'a', matchId: 'match-1' });
    await service.spendForMatch({ accountId: 'a', matchId: 'match-2' });

    expect(ledger.balance).toBe(0);
  });
});

describe('giving tokens', () => {
  it('grants once under a repeated key', async () => {
    const ledger = fakeLedger();
    const service = new TokenLedgerService(ledger.repository);

    await service.grant({
      accountId: 'a',
      amount: 5,
      reason: 'campaign.launch-month',
      idempotencyKey: 'campaign:a',
    });
    await service.grant({
      accountId: 'a',
      amount: 5,
      reason: 'campaign.launch-month',
      idempotencyKey: 'campaign:a',
    });

    expect(ledger.balance).toBe(5);
  });

  it('treats a key that lost the race as the movement that won it', async () => {
    // Two requests arriving together: the database refuses the second insert,
    // and what it already recorded is the answer — not an error for the caller.
    const ledger = fakeLedger();
    const service = new TokenLedgerService(ledger.repository);
    const winner: TokenMovement = {
      entry: {
        accountId: 'a',
        delta: 5,
        reason: 'purchase',
        idempotencyKey: 'tap:charge-1',
      },
      balanceAfter: 5,
    };
    jest
      .spyOn(ledger.repository, 'findByIdempotencyKey')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    jest
      .spyOn(ledger.repository, 'apply')
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 11000 }));

    await expect(
      service.grant({
        accountId: 'a',
        amount: 5,
        reason: 'purchase',
        idempotencyKey: 'tap:charge-1',
      }),
    ).resolves.toEqual(winner);
  });

  it('refuses a grant whose sign contradicts its reason', async () => {
    const service = new TokenLedgerService(fakeLedger().repository);

    await expect(
      service.grant({
        accountId: 'a',
        amount: -5,
        reason: 'purchase',
        idempotencyKey: 'tap:charge-2',
      }),
    ).rejects.toThrow(TokenLedgerError);
  });
});
