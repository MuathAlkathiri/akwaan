import {
  advanceRyoChallengeState,
  RYO_GAMEPLAY_PLUGIN,
  ryoAnsweringTeam,
} from './ryo-gameplay.plugin';

describe('RYO gameplay plugin', () => {
  const interaction = RYO_GAMEPLAY_PLUGIN.interaction!;
  const now = new Date('2026-01-01T00:00:00Z');
  const prompt = interaction.preparePrompt(
    { sessionId: 's', runtimeId: 'r', activeTeamId: 'a' },
    {
      opposingTeamId: 'b',
      itemJson: JSON.stringify({
        id: 'i1',
        prompt: 'سؤال',
        answerMode: 'multiple_choice',
        options: [{ id: 'x', label: 'أ' }],
        correctOptionId: 'x',
      }),
    },
    now,
  );

  it('persists the authoritative A-B-A three-item rotation', () => {
    expect(
      [0, 1, 2].map((index) => ryoAnsweringTeam(['a', 'b'], 'a', index)),
    ).toEqual(['a', 'b', 'a']);
    expect(ryoAnsweringTeam(['a', 'b'], 'b', 0)).toBe('b');
  });

  it('executes and persists a complete three-item headless challenge', () => {
    let state = RYO_GAMEPLAY_PLUGIN.createInitialRuntimeState({
      sessionId: 's',
      runtimeId: 'r',
      initialState: {
        challengeId: 'c',
        worldId: 'w',
        slotKey: 'ryo_1',
        itemsJson: JSON.stringify([{ id: '1' }, { id: '2' }, { id: '3' }]),
        teamIdsJson: JSON.stringify(['a', 'b']),
        startingTeamId: 'a',
        currentItemIndex: 0,
        phase: 'collecting',
        scoreEventsJson: '[]',
        resultsJson: '[]',
      },
    });
    for (const [index, delta] of [1, -1, 1].entries()) {
      state = advanceRyoChallengeState(
        state,
        { id: `e${index}`, teamId: index === 1 ? 'a' : 'b', delta },
        { correct: index !== 1 },
      );
    }
    expect(state).toMatchObject({ currentItemIndex: 3, phase: 'completed' });
    expect(JSON.parse(String(state.scoreEventsJson))).toEqual(
      expect.arrayContaining([expect.objectContaining({ delta: -1 })]),
    );
    expect(JSON.parse(String(state.resultsJson))).toHaveLength(3);
    const restored = RYO_GAMEPLAY_PLUGIN.validateRuntimeState(state);
    expect(restored.scoreEventsJson).toBe(state.scoreEventsJson);
  });

  it('enforces answering and opposing team roles', () => {
    expect(() =>
      interaction.validateSubmissionForActor!(
        { kind: 'decision', decision: 'steal' },
        { controller: false, participantId: 'p', teamId: 'a' },
        { ...prompt, id: 'p', preparedAt: now },
      ),
    ).toThrow('not available');
    expect(
      interaction.validateSubmissionForActor!(
        { kind: 'answer', mode: 'multiple_choice', optionId: 'x' },
        { controller: false, participantId: 'p', teamId: 'a' },
        { ...prompt, id: 'p', preparedAt: now },
      ),
    ).toMatchObject({ kind: 'answer' });
  });

  it('accepts finite closest values and rejects invalid values', () => {
    expect(
      interaction.validateSubmission({
        kind: 'answer',
        mode: 'closest',
        value: 42,
      }),
    ).toMatchObject({ value: 42 });
    expect(() =>
      interaction.validateSubmission({
        kind: 'answer',
        mode: 'closest',
        value: Number.NaN,
      }),
    ).toThrow();
  });

  it('projects only the actor role and never the private correct answer', () => {
    const projected = interaction.projectPrompt(
      { ...prompt, id: 'p', preparedAt: now },
      { controller: false, participantId: 'p1', teamId: 'b' },
    );
    expect(projected?.actorRole).toBe('opposing');
    expect(JSON.stringify(projected)).not.toContain('correctOptionId');
  });

  it('requests automatic resolution only after both blind sides submit', () => {
    const base = {
      id: '1',
      participantId: 'p1',
      type: 'ryo',
      schemaVersion: 1,
      receivedAt: now,
      requestId: 'q',
      status: 'pending-adjudication' as const,
      resultVisibility: 'submitting-participant' as const,
    };
    const answer = {
      ...base,
      payload: { kind: 'answer', mode: 'multiple_choice', optionId: 'x' },
    };
    const decision = {
      ...base,
      id: '2',
      participantId: 'p2',
      payload: { kind: 'decision', decision: 'trust' },
    };
    expect(
      interaction.shouldAutoResolve!([answer], {
        ...prompt,
        id: 'p',
        preparedAt: now,
      }),
    ).toBe(false);
    expect(
      interaction.shouldAutoResolve!([answer, decision], {
        ...prompt,
        id: 'p',
        preparedAt: now,
      }),
    ).toBe(true);
  });

  it('produces deterministic scoring facts for headless resolution', () => {
    const base = {
      id: '1',
      participantId: 'p1',
      type: 'ryo',
      schemaVersion: 1,
      receivedAt: now,
      requestId: 'q',
      status: 'accepted' as const,
      resultVisibility: 'submitting-participant' as const,
    };
    const result = interaction.createOutcome(
      [
        {
          ...base,
          teamId: 'a',
          payload: { kind: 'answer', mode: 'multiple_choice', optionId: 'x' },
        },
        {
          ...base,
          id: '2',
          participantId: 'p2',
          teamId: 'b',
          payload: { kind: 'decision', decision: 'steal' },
        },
      ],
      now,
      { ...prompt, id: 'p', preparedAt: now },
    );
    expect(result.outcome.publicPayload).toMatchObject({
      correct: true,
      decision: 'steal',
    });
    expect(
      JSON.parse(String(result.outcome.privatePayload.scoringInputJson)),
    ).toMatchObject({
      answeringTeamId: 'a',
      opposingTeamId: 'b',
      decision: 'STEAL',
      correct: true,
    });
  });
});
