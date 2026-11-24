import { Reflector } from '@nestjs/core';
import { TokensController } from './tokens.controller';
import { TokenLedgerService } from '../application/token-ledger.service';
import { UserRole } from '../../users/schemas/user.schema';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';

const operator = { id: 'operator-1' } as never;

function controllerWith(overrides: Partial<TokenLedgerService> = {}) {
  const tokens = {
    balanceOf: jest.fn(async () => 4),
    history: jest.fn(async () => []),
    grant: jest.fn(async () => ({
      entry: {
        accountId: 'account-1',
        delta: 3,
        reason: 'admin.grant' as const,
        idempotencyKey: 'k',
      },
      balanceAfter: 7,
    })),
    ...overrides,
  } as unknown as TokenLedgerService;
  const campaign = {
    allowanceFor: jest.fn(async () => undefined),
    status: jest.fn(() => ({ open: false })),
  };
  return {
    controller: new TokensController(
      tokens,
      campaign as never,
      {} as never,
      {} as never,
    ),
    tokens,
  };
}

describe('who may reach a balance', () => {
  const reflector = new Reflector();
  const rolesOn = (method: keyof TokensController) =>
    reflector.get<UserRole[]>(ROLES_KEY, TokensController.prototype[method]);

  it.each([
    'accountLedger',
    'grant',
    'lookup',
    'campaignSettings',
    'setCampaign',
    'giftCodes',
    'createGiftCode',
    'setGiftCodeActive',
  ] as const)('lets only an administrator call %s', (method) => {
    expect(rolesOn(method)).toEqual([UserRole.ADMIN]);
  });

  it.each(['myBalance', 'myHistory', 'redeem'] as const)(
    'lets any signed-in account call %s about itself',
    (method) => {
      expect(rolesOn(method)).toBeUndefined();
    },
  );

  it('reads the signed-in account from the token, never from the request body', async () => {
    // The route takes no account id: an account can ask about itself and
    // about nothing else, whatever it sends.
    const { controller, tokens } = controllerWith();

    await controller.myBalance({ id: 'account-9' } as never);

    expect(tokens.balanceOf).toHaveBeenCalledWith('account-9');
  });
});

describe('granting by hand', () => {
  it('records who gave it and why, beside the amount', async () => {
    // A hand-written grant is the one movement with no system behind it to
    // ask afterwards, so the operator and their words are the record.
    const { controller, tokens } = controllerWith();

    await controller.grant(
      'account-1',
      { amount: 3, note: 'عوّضناه عن ماتش انقطع فيه الإنترنت' },
      operator,
    );

    expect(tokens.grant).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-1',
        amount: 3,
        reason: 'admin.grant',
        reference: 'operator-1: عوّضناه عن ماتش انقطع فيه الإنترنت',
      }),
    );
  });

  it('honours an operator-supplied key, so a retried request grants once', async () => {
    const { controller, tokens } = controllerWith();

    await controller.grant(
      'account-1',
      { amount: 3, note: 'تذكرة دعم', idempotencyKey: 'support-ticket-4417' },
      operator,
    );

    expect(tokens.grant).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'support-ticket-4417' }),
    );
  });
});
