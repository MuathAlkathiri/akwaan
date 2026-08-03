import { StartTop10PoisonDeck } from './start-top10-poison-deck.use-case';

describe('StartTop10PoisonDeck development launcher', () => {
  it('guards and launches one ready canonical item through the normal runtime lifecycle', async () => {
    const teamIds = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ];
    const session = {
      id: 'session-1',
      controllerActorId: 'host-1',
      revision: 7,
      serialize: () => ({
        status: 'active',
        activeTeamId: undefined,
        teams: teamIds.map((id) => ({ id, active: true })),
      }),
    };
    const launchedSession = { ...session, revision: 8 };
    const sessions = {
      findById: jest
        .fn()
        .mockResolvedValueOnce(session)
        .mockResolvedValue(launchedSession),
    };
    const runtime = {
      revision: 3,
      serialize: () => ({ activeRound: { id: 'round-1' } }),
    };
    const runtimes = { findBySessionId: jest.fn().mockResolvedValue(runtime) };
    const candidates = Array.from({ length: 14 }, (_, index) => ({
      id: `card-${index + 1}`,
      label: `Card ${index + 1}`,
    }));
    const item = {
      _id: '00000000-0000-4000-8000-000000000010',
      worldId: '00000000-0000-4000-8000-000000000020',
      status: 'ready',
      answerPayload: { mode: 'top_10' },
      compatibleChallengeTypeIds: ['00000000-0000-4000-8000-000000000030'],
      mechanicPayload: {
        variant: 'poison-deck',
        title: 'Top 10',
        instruction: 'Keep or poison',
        rankingBasis: 'Official rank',
        sourceLabel: 'Official source',
        candidates,
        rankedAnswer: candidates.slice(0, 10).map((candidate, index) => ({
          candidateId: candidate.id,
          rank: index + 1,
        })),
        decoyCandidateIds: candidates
          .slice(10)
          .map((candidate) => candidate.id),
      },
    };
    const configuration = {
      _id: '00000000-0000-4000-8000-000000000040',
      worldId: item.worldId,
      challengeTypeId: item.compatibleChallengeTypeIds[0],
      isEnabled: true,
    };
    const mechanic = {
      _id: item.compatibleChallengeTypeIds[0],
      slug: 'top-10',
    };
    const createRuntime = { execute: jest.fn().mockResolvedValue(undefined) };
    const startRuntime = { execute: jest.fn().mockResolvedValue(undefined) };
    const createRound = { execute: jest.fn().mockResolvedValue(undefined) };
    const startRound = { execute: jest.fn().mockResolvedValue(undefined) };
    const getRuntime = {
      execute: jest.fn().mockResolvedValue({ launched: true }),
    };
    const deadlines = { schedule: jest.fn().mockResolvedValue(undefined) };
    const startTeamTurn = { execute: jest.fn().mockResolvedValue(undefined) };
    const switchActiveTeam = {
      execute: jest.fn().mockResolvedValue(undefined),
    };

    const useCase = new StartTop10PoisonDeck(
      sessions as unknown as ConstructorParameters<
        typeof StartTop10PoisonDeck
      >[0],
      runtimes as unknown as ConstructorParameters<
        typeof StartTop10PoisonDeck
      >[1],
      {
        findById: jest.fn().mockResolvedValue(item),
      } as unknown as ConstructorParameters<typeof StartTop10PoisonDeck>[2],
      {
        findById: jest.fn().mockResolvedValue(mechanic),
      } as unknown as ConstructorParameters<typeof StartTop10PoisonDeck>[3],
      {
        findById: jest.fn().mockResolvedValue(configuration),
      } as unknown as ConstructorParameters<typeof StartTop10PoisonDeck>[4],
      createRuntime as unknown as ConstructorParameters<
        typeof StartTop10PoisonDeck
      >[5],
      startRuntime as unknown as ConstructorParameters<
        typeof StartTop10PoisonDeck
      >[6],
      createRound as unknown as ConstructorParameters<
        typeof StartTop10PoisonDeck
      >[7],
      startRound as unknown as ConstructorParameters<
        typeof StartTop10PoisonDeck
      >[8],
      getRuntime as unknown as ConstructorParameters<
        typeof StartTop10PoisonDeck
      >[9],
      deadlines as unknown as ConstructorParameters<
        typeof StartTop10PoisonDeck
      >[10],
      startTeamTurn as unknown as ConstructorParameters<
        typeof StartTop10PoisonDeck
      >[11],
      switchActiveTeam as unknown as ConstructorParameters<
        typeof StartTop10PoisonDeck
      >[12],
    );

    await expect(
      useCase.execute({
        sessionId: session.id,
        actorId: 'host-1',
        worldId: item.worldId,
        boardConfigurationId: configuration._id,
        contentItemId: item._id,
        startingTeamId: teamIds[1],
      }),
    ).resolves.toEqual({ launched: true });
    expect(startTeamTurn.execute).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: teamIds[1], expectedRevision: 7 }),
    );
    expect(createRuntime.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        modeKey: 'top-10',
        expectedSessionRevision: 8,
        initialState: expect.objectContaining({
          variant: 'poison-deck',
          worldId: item.worldId,
          boardConfigurationId: configuration._id,
          teamIdsJson: JSON.stringify(teamIds),
        }),
      }),
    );
    const initialState = createRuntime.execute.mock.calls[0][0]
      .initialState as {
      deckJson: string;
    };
    expect(JSON.parse(initialState.deckJson)).toHaveLength(14);
    expect(startRuntime.execute).toHaveBeenCalled();
    expect(createRound.execute).toHaveBeenCalled();
    expect(startRound.execute).toHaveBeenCalled();
    expect(deadlines.schedule).toHaveBeenCalledWith(session.id);
  });
});
