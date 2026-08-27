import { MongooseLiveGameSessionRepository } from './mongoose-live-game-session.repository';

describe('MongooseLiveGameSessionRepository owner read', () => {
  it('filters by persisted controllerActorId and projects no private state', async () => {
    const exec = jest.fn().mockResolvedValue([
      {
        sessionId: 'session-a',
        status: 'active',
        expiresAt: new Date('2026-08-27T00:00:00.000Z'),
      },
    ]);
    const lean = jest.fn(() => ({ exec }));
    const find = jest.fn(() => ({ lean }));
    const repository = new MongooseLiveGameSessionRepository(
      { find } as never,
      {} as never,
      {} as never,
    );

    const result = await repository.findOwnedSessionRefs('account-a');

    expect(find).toHaveBeenCalledWith(
      { controllerActorId: 'account-a' },
      { sessionId: 1, status: 1, expiresAt: 1 },
    );
    expect(result).toEqual([
      {
        sessionId: 'session-a',
        status: 'active',
        expiresAt: new Date('2026-08-27T00:00:00.000Z'),
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('state');
    expect(JSON.stringify(result)).not.toContain('reconnectToken');
  });
});
