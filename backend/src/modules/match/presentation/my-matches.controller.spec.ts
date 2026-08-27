import { MyMatchesController } from './my-matches.controller';
import { ListMyMatches } from '../application/list-my-matches.use-case';

describe('MyMatchesController', () => {
  it('scopes the read to the authenticated account and bounds pagination', async () => {
    const execute = jest.fn().mockResolvedValue({
      active: [],
      completed: [],
      pagination: {
        page: 2,
        limit: 20,
        completedTotal: 0,
        hasMore: false,
      },
    });
    const controller = new MyMatchesController({
      execute,
    } as unknown as ListMyMatches);

    await controller.list({ id: 'account-a' } as never, '2', '999');

    expect(execute).toHaveBeenCalledWith({
      controllerActorId: 'account-a',
      page: 2,
      limit: 20,
    });
  });
});
