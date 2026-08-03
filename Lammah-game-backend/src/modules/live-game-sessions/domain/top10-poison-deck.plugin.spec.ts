import {
  TOP10_POISON_DECK_PLUGIN,
  Top10Assignment,
  Top10Result,
} from './top10-poison-deck.plugin';
import { GameplayRuntime, GameplayRuntimeState } from './gameplay-runtime';

function fixture() {
  const candidates = Array.from({ length: 14 }, (_, index) => ({
    id: `card-${index + 1}`,
    label: `Card ${index + 1}`,
  }));
  const rankedAnswer = Array.from({ length: 10 }, (_, index) => ({
    candidateId: `card-${index + 1}`,
    rank: index + 1,
  }));
  return {
    variant: 'poison-deck',
    contentItemId: 'item-1',
    title: 'Top 10',
    instruction: 'Keep or poison',
    rankingBasis: 'Objective ranking',
    sourceLabel: 'Source',
    asOfDate: '2026-01-01',
    candidatesJson: JSON.stringify(candidates),
    deckJson: JSON.stringify(candidates.map((candidate) => candidate.id)),
    rankedAnswerJson: JSON.stringify(rankedAnswer),
    decoyCandidateIdsJson: JSON.stringify([
      'card-11',
      'card-12',
      'card-13',
      'card-14',
    ]),
    revealOrderJson: JSON.stringify([
      ...[...rankedAnswer].reverse().map((answer) => answer.candidateId),
      'card-11',
      'card-12',
      'card-13',
      'card-14',
    ]),
    teamIdsJson: JSON.stringify(['team-a', 'team-b']),
    assignmentsJson: '[]',
    startingTeamId: 'team-a',
    phase: 'assigning',
    revealIndex: 0,
  };
}

describe('Top 10 poison-deck gameplay plugin', () => {
  const context = { sessionId: 'session-1', runtimeId: 'runtime-1' };

  it('executes fourteen alternating turns and a delayed 10-to-1 reveal', () => {
    let runtime = TOP10_POISON_DECK_PLUGIN.createInitialRuntimeState({
      ...context,
      initialState: fixture(),
    });
    let round = TOP10_POISON_DECK_PLUGIN.createInitialRoundState({
      ...context,
      runtimeState: runtime,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    let activeTeamId = 'team-a';

    for (let turn = 0; turn < 14; turn += 1) {
      const result = TOP10_POISON_DECK_PLUGIN.handleCommand(
        {
          ...context,
          activeTeamId,
          now: new Date(
            `2026-01-01T00:00:${String(turn).padStart(2, '0')}.000Z`,
          ),
        },
        {
          type: 'assign-card',
          payload: { action: turn % 3 === 0 ? 'poison' : 'keep' },
          runtimeState: runtime,
          roundState: round,
        },
      );
      runtime = result.runtimeState;
      round = result.roundState;
      activeTeamId = activeTeamId === 'team-a' ? 'team-b' : 'team-a';
    }

    expect(round).toMatchObject({ phase: 'revealing', turnIndex: 14 });
    const assignments = JSON.parse(
      String(runtime.assignmentsJson),
    ) as Top10Assignment[];
    expect(assignments).toHaveLength(14);
    expect(assignments.map((assignment) => assignment.actingTeamId)).toEqual(
      Array.from({ length: 14 }, (_, index) =>
        index % 2 === 0 ? 'team-a' : 'team-b',
      ),
    );

    for (let index = 0; index < 14; index += 1) {
      const result = TOP10_POISON_DECK_PLUGIN.handleCommand(
        { ...context, activeTeamId: 'team-b' },
        {
          type: 'reveal-next',
          payload: {},
          runtimeState: runtime,
          roundState: round,
        },
      );
      runtime = result.runtimeState;
      round = result.roundState;
    }
    expect(round.phase).toBe('completed');
    expect(JSON.parse(String(runtime.resultJson))).toEqual(
      expect.objectContaining({
        internalScores: expect.objectContaining({
          'team-a': expect.any(Number),
          'team-b': expect.any(Number),
        }),
        metrics: expect.objectContaining({
          'team-a': expect.objectContaining({
            successfulPoison: expect.any(Number),
            giftedValidCard: expect.any(Number),
            selfKeptDecoy: expect.any(Number),
            selfKeptValid: expect.any(Number),
          }),
        }),
      } satisfies Partial<Top10Result>),
    );
    const publicState = TOP10_POISON_DECK_PLUGIN.projectRuntimeState(runtime);
    expect(publicState.rankedAnswerJson).toBeUndefined();
    expect(publicState.decoyCandidateIdsJson).toBeUndefined();
    const revealed = JSON.parse(String(publicState.revealedJson)) as Array<{
      rank: number | null;
    }>;
    expect(revealed.map((value) => value.rank)).toEqual([
      10,
      9,
      8,
      7,
      6,
      5,
      4,
      3,
      2,
      1,
      null,
      null,
      null,
      null,
    ]);
  });

  it('defaults an expired turn to KEEP and persists the new deadline', () => {
    const runtime = TOP10_POISON_DECK_PLUGIN.createInitialRuntimeState({
      ...context,
      initialState: fixture(),
    });
    const round = TOP10_POISON_DECK_PLUGIN.createInitialRoundState({
      ...context,
      runtimeState: runtime,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    const result = TOP10_POISON_DECK_PLUGIN.handleCommand(
      {
        ...context,
        activeTeamId: 'team-a',
        now: new Date('2026-01-01T00:00:06.000Z'),
      },
      {
        type: 'timeout-card',
        payload: {},
        runtimeState: runtime,
        roundState: round,
      },
    );
    expect(JSON.parse(String(result.runtimeState.assignmentsJson))).toEqual([
      expect.objectContaining({
        action: 'keep',
        timedOut: true,
        actingTeamId: 'team-a',
        recipientTeamId: 'team-a',
      }),
    ]);
    expect(result.roundState.deadlineAt).toBe('2026-01-01T00:00:12.000Z');
    expect(
      TOP10_POISON_DECK_PLUGIN.validateRuntimeState(result.runtimeState),
    ).toEqual(result.runtimeState);
  });

  it('restores the exact card, assignment history, active team, and deadline after persistence', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    let aggregate = GameplayRuntime.create({
      id: 'runtime-1',
      sessionId: 'session-1',
      plugin: TOP10_POISON_DECK_PLUGIN,
      commandId: 'create',
      actorId: 'host',
      now,
      expiresAt: new Date('2026-01-02T00:00:00.000Z'),
      initialState: fixture(),
    });
    aggregate.start('start', 'host', now);
    const created = aggregate.createRound(
      { commandId: 'round', actorId: 'host', activeTeamId: 'team-a' },
      now,
    );
    aggregate.startRound(created.id, 'round-start', 'host', now);
    const state = aggregate.serialize();
    const handled = TOP10_POISON_DECK_PLUGIN.handleCommand(
      { ...context, activeTeamId: 'team-a', now },
      {
        type: 'assign-card',
        payload: { action: 'poison' },
        runtimeState: state.runtimeState,
        roundState: state.activeRound!.modeState,
      },
    );
    aggregate.applyModeState({
      commandId: 'assignment',
      actorId: 'player-a',
      ...handled,
      now,
      sessionRevision: 5,
      activeTeamId: 'team-b',
    });

    const stored = JSON.parse(
      JSON.stringify(aggregate.serialize()),
    ) as GameplayRuntimeState;
    aggregate = GameplayRuntime.restore(stored, TOP10_POISON_DECK_PLUGIN);
    const restored = aggregate.serialize();
    expect(restored.activeRound).toMatchObject({
      activeTeamId: 'team-b',
      modeState: {
        turnIndex: 1,
        deadlineAt: '2026-01-01T00:00:06.000Z',
        currentCardJson: JSON.stringify({ id: 'card-2', label: 'Card 2' }),
      },
    });
    expect(JSON.parse(String(restored.runtimeState.assignmentsJson))).toEqual([
      expect.objectContaining({
        candidateId: 'card-1',
        actingTeamId: 'team-a',
        recipientTeamId: 'team-b',
        action: 'poison',
        resolutionReason: 'submitted',
        assignedAt: '2026-01-01T00:00:00.000Z',
      }),
    ]);
  });
});
