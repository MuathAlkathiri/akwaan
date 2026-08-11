import { ChallengeTypeMatchUsageGuard } from './challenge-type-match-usage.guard';

describe('ChallengeTypeMatchUsageGuard', () => {
  it('counts only active dependencies in the blocking guard', async () => {
    const exec = jest.fn().mockResolvedValue(2);
    const countDocuments = jest.fn().mockReturnValue({ exec });
    const registry = { register: jest.fn() };
    const guard = new ChallengeTypeMatchUsageGuard(
      { countDocuments } as never,
      registry as never,
    );
    guard.onModuleInit();
    await expect(
      guard.countReferences('challengeType', 'type-1', { slug: 'closest' }),
    ).resolves.toBe(2);
    expect(registry.register).toHaveBeenCalledWith(guard);
    expect(registry.register).toHaveBeenCalledTimes(3);
    expect(countDocuments).toHaveBeenCalledWith({
      status: 'active',
      $or: expect.arrayContaining([
        { 'challengeResults.challengeTypeId': 'type-1' },
        { 'challengeResults.challengeKey': 'closest' },
        { 'configuredBoardPositions.challengeTypeId': 'type-1' },
      ]),
    });
  });

  it('does not treat non-Match reference kinds as gameplay usage', async () => {
    const guard = new ChallengeTypeMatchUsageGuard(
      {} as never,
      {
        register: jest.fn(),
      } as never,
    );
    await expect(guard.countReferences('scope', 'scope-1')).resolves.toBe(0);
  });
});
