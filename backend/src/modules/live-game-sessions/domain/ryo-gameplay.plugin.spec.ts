import type { GameplaySubmissionState } from './gameplay-interaction';
import type { GameplayCommandPayload } from './gameplay-mode.plugin';
import {
  advanceRyoChallengeState,
  RYO_GAMEPLAY_PLUGIN,
  ryoAnsweringTeam,
} from './ryo-gameplay.plugin';

describe('RYO gameplay plugin', () => {
  const interaction = RYO_GAMEPLAY_PLUGIN.interaction!;
  // One authoritative answerer (`p`, team a) and one authoritative Trust/Steal
  // decider (`q`, team b) — the state the runtime persists.
  const assignmentState = JSON.stringify({
    rotations: [
      { teamId: 'a', order: ['p'], cursor: 0 },
      { teamId: 'b', order: ['q'], cursor: 0 },
    ],
    assignments: [
      { teamId: 'a', participantId: 'p', action: 'ryo.answer', sequence: 1 },
      { teamId: 'b', participantId: 'q', action: 'ryo.decision', sequence: 2 },
    ],
    nextSequence: 3,
  });
  const runtimeState = { teamActionJson: assignmentState };
  const now = new Date('2026-01-01T00:00:00Z');
  const prompt = interaction.preparePrompt(
    { sessionId: 's', runtimeId: 'r', activeTeamId: 'a' },
    {
      opposingTeamId: 'b',
      answererParticipantId: 'p',
      deciderParticipantId: 'q',
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

  it('records the answer a room can read, not the option id it graded', () => {
    // Grading compares option ids, so that is what a submission carries. A recap
    // that reads "أجاب: option-1" at a room is the internal key leaking out; the
    // authored label is the answer as far as anyone playing is concerned.
    const localised = interaction.preparePrompt(
      { sessionId: 's', runtimeId: 'r', activeTeamId: 'a' },
      {
        opposingTeamId: 'b',
        answererParticipantId: 'p',
        deciderParticipantId: 'q',
        itemJson: JSON.stringify({
          id: 'i1',
          prompt: { ar: 'من هو الهداف؟' },
          answerMode: 'multiple_choice',
          options: [
            { id: 'option-1', label: { ar: 'كريستيانو رونالدو' } },
            { id: 'option-2', label: { ar: 'ميسي' } },
          ],
          correctOptionId: 'option-1',
        }),
      },
      now,
    );
    const base = {
      id: '1',
      participantId: 'p',
      type: 'ryo',
      schemaVersion: 1,
      receivedAt: now,
      requestId: 'q',
      status: 'accepted' as const,
      resultVisibility: 'submitting-participant' as const,
      promptId: 'p',
      submittedAt: now,
    };
    const answered = interaction.createOutcome(
      [
        {
          ...base,
          teamId: 'a',
          payload: {
            kind: 'answer',
            mode: 'multiple_choice',
            optionId: 'option-2',
          },
        },
        {
          ...base,
          id: '2',
          participantId: 'q',
          teamId: 'b',
          payload: { kind: 'decision', decision: 'trust' },
        },
      ],
      now,
      { ...localised, id: 'p', preparedAt: now },
    );

    const payload = answered.outcome.publicPayload as Record<string, unknown>;
    expect(payload.selectedAnswer).toBe('ميسي');
    expect(payload.correctAnswer).toBe('كريستيانو رونالدو');
    expect(payload.correct).toBe(false);
    // The graded ids are untouched: only what is shown was resolved.
    const scoring = JSON.parse(
      String(
        (answered.outcome.privatePayload as Record<string, unknown>)
          .scoringInputJson,
      ),
    ) as Record<string, unknown>;
    expect(scoring.selectedAnswer).toBe('option-2');
    expect(scoring.correctAnswer).toBe('option-1');
  });

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
        slotKey: 'slot_2',
        itemsJson: JSON.stringify([{ id: '1' }, { id: '2' }, { id: '3' }]),
        teamIdsJson: JSON.stringify(['a', 'b']),
        startingTeamId: 'a',
        currentItemIndex: 0,
        phase: 'collecting',
        scoreEventsJson: '[]',
        resultsJson: '[]',
        teamActionJson: assignmentState,
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
        runtimeState,
      ),
    ).toThrow('not available');
    expect(
      interaction.validateSubmissionForActor!(
        { kind: 'answer', mode: 'multiple_choice', optionId: 'x' },
        { controller: false, participantId: 'p', teamId: 'a' },
        { ...prompt, id: 'p', preparedAt: now },
        runtimeState,
      ),
    ).toMatchObject({ kind: 'answer' });
  });

  it('refuses a teammate of the assigned player on the correct team', () => {
    // Right team, right kind of submission, wrong person. The blind
    // simultaneous design is untouched; only the actor is now named.
    expect(() =>
      interaction.validateSubmissionForActor!(
        { kind: 'answer', mode: 'multiple_choice', optionId: 'x' },
        { controller: false, participantId: 'p2', teamId: 'a' },
        { ...prompt, id: 'p', preparedAt: now },
        runtimeState,
      ),
    ).toThrow('assigned player');
    expect(() =>
      interaction.validateSubmissionForActor!(
        { kind: 'decision', decision: 'trust' },
        { controller: false, participantId: 'q2', teamId: 'b' },
        { ...prompt, id: 'p', preparedAt: now },
        runtimeState,
      ),
    ).toThrow('assigned player');
    expect(
      interaction.validateSubmissionForActor!(
        { kind: 'decision', decision: 'trust' },
        { controller: false, participantId: 'q', teamId: 'b' },
        { ...prompt, id: 'p', preparedAt: now },
        runtimeState,
      ),
    ).toMatchObject({ kind: 'decision' });
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

  /**
   * The blind window's privacy contract.
   *
   * A public projection may say that a side has locked in, because both roles are
   * already on the screen and watching the opponent commit is the mechanic. It may
   * never carry, or allow anyone to infer, *what* was chosen — Steal versus Trust, an
   * option id, or an estimate — before the simultaneous reveal.
   */
  const submissionOf = (
    payload: GameplayCommandPayload,
    overrides: Partial<GameplaySubmissionState> = {},
  ): GameplaySubmissionState => ({
    id: '1',
    participantId: 'q',
    type: 'ryo',
    schemaVersion: 1,
    receivedAt: now,
    requestId: 'r',
    status: 'pending-adjudication' as const,
    resultVisibility: 'submitting-participant' as const,
    payload,
    ...overrides,
  });

  /** Every actor who can read a snapshot: both sides, and the shared screen. */
  const ACTORS = [
    { controller: false, participantId: 'q', teamId: 'b' },
    { controller: false, participantId: 'p', teamId: 'a' },
    { controller: true, participantId: 'host', teamId: undefined },
  ];

  it('publishes that a side locked in, for every submission shape, without publishing the choice', () => {
    // The three payload shapes `validateSubmission` can store, and the secret inside
    // each of them. Nothing but existence and kind may cross to any actor — not even
    // to the submission's own author.
    const cases: Array<{
      payload: GameplayCommandPayload;
      kind: string;
      secrets: string[];
    }> = [
      {
        payload: { kind: 'decision', decision: 'steal' },
        kind: 'decision',
        secrets: ['steal'],
      },
      {
        payload: { kind: 'decision', decision: 'trust' },
        kind: 'decision',
        secrets: ['trust'],
      },
      {
        payload: {
          kind: 'answer',
          mode: 'multiple_choice',
          optionId: 'option-2',
        },
        kind: 'answer',
        secrets: ['option-2', 'multiple_choice'],
      },
      {
        payload: { kind: 'answer', mode: 'closest', value: 1998 },
        kind: 'answer',
        secrets: ['1998', 'closest'],
      },
    ];

    for (const { payload, kind, secrets } of cases) {
      for (const actor of ACTORS) {
        const projected = interaction.projectSubmission(
          submissionOf(payload),
          actor,
        );
        // Exactly two fields. An added field is a leak until proven otherwise, so the
        // assertion is equality rather than a subset match.
        expect(projected).toEqual({ status: 'pending-adjudication', kind });
        const wire = JSON.stringify(projected);
        for (const secret of secrets) {
          expect(wire).not.toContain(secret);
        }
      }
    }
  });

  it('never lets the status encode correctness before the reveal', () => {
    // `accepted` is passed unconditionally by the auto-close path, for both sides at
    // once, and only after both have submitted — so it marks "counted", never "right".
    // A status that tracked correctness would leak the outcome one tick early.
    for (const actor of ACTORS) {
      const pending = interaction.projectSubmission(
        submissionOf({
          kind: 'answer',
          mode: 'multiple_choice',
          optionId: 'x',
        }),
        actor,
      );
      const accepted = interaction.projectSubmission(
        submissionOf(
          { kind: 'answer', mode: 'multiple_choice', optionId: 'x' },
          { status: 'accepted' },
        ),
        actor,
      );
      expect(pending).toEqual({
        status: 'pending-adjudication',
        kind: 'answer',
      });
      expect(accepted).toEqual({ status: 'accepted', kind: 'answer' });
    }
  });

  it('drops a withdrawn submission instead of publishing that a side changed its mind', () => {
    // Hesitation is a tell, and this game is built on reading tells. A withdrawn
    // submission is not a lock, so it leaves the projection entirely rather than
    // appearing with a `withdrawn` status for the opponent to read.
    for (const status of ['withdrawn', 'superseded'] as const) {
      for (const actor of ACTORS) {
        expect(
          interaction.projectSubmission(
            submissionOf({ kind: 'decision', decision: 'trust' }, { status }),
            actor,
          ),
        ).toBeUndefined();
      }
    }
  });

  it('keeps one live entry per side, so the entry count cannot be read as indecision', () => {
    // With `one-per-participant`, a resubmission requires withdrawing first — and the
    // withdrawn one is no longer projected. So a side is either absent or present
    // once, and the array length carries nothing.
    const projected = [
      submissionOf(
        { kind: 'answer', mode: 'closest', value: 1 },
        { status: 'withdrawn' },
      ),
      submissionOf({ kind: 'answer', mode: 'closest', value: 2 }, { id: '2' }),
    ]
      .map((submission) => interaction.projectSubmission(submission, ACTORS[1]))
      .filter(Boolean);
    expect(projected).toEqual([
      { status: 'pending-adjudication', kind: 'answer' },
    ]);
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
