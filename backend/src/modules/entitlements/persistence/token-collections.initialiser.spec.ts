import { TokenCollectionsInitialiser } from './token-collections.initialiser';

const modelThat = (behaviour: () => Promise<unknown>, name: string) =>
  ({
    collection: { name },
    createCollection: jest.fn(behaviour),
  }) as never;

describe('making the token collections exist before the first Match', () => {
  it('creates both, since a transaction cannot', async () => {
    const entries = modelThat(async () => undefined, 'token_ledger_entries');
    const balances = modelThat(async () => undefined, 'token_balances');

    await new TokenCollectionsInitialiser(entries, balances).onModuleInit();

    expect((entries as never as { createCollection: jest.Mock }).createCollection).toHaveBeenCalled();
    expect((balances as never as { createCollection: jest.Mock }).createCollection).toHaveBeenCalled();
  });

  it('is quiet when they are already there, which is every start but the first', async () => {
    const existing = () =>
      Promise.reject(Object.assign(new Error('exists'), { codeName: 'NamespaceExists' }));
    const warn = jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn');

    await new TokenCollectionsInitialiser(
      modelThat(existing, 'token_ledger_entries'),
      modelThat(existing, 'token_balances'),
    ).onModuleInit();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('still boots when the database refuses, rather than taking the server down', async () => {
    // A restricted user can refuse this while the collections exist anyway.
    // Spending would fail loudly if they did not; a server that will not start
    // helps nobody.
    const refused = () => Promise.reject(new Error('not authorized'));

    await expect(
      new TokenCollectionsInitialiser(
        modelThat(refused, 'token_ledger_entries'),
        modelThat(refused, 'token_balances'),
      ).onModuleInit(),
    ).resolves.toBeUndefined();
  });
});
