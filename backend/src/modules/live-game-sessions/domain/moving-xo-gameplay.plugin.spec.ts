import { GameplayModeState } from './gameplay-mode.plugin';
import {
  MOVING_XO_DECISIVE_AFTER_MOVES,
  createMovingXoBoard,
} from './moving-xo-board';
import {
  MOVING_XO_COMMANDS,
  MOVING_XO_GAMEPLAY_PLUGIN as PLUGIN,
  MOVING_XO_PLACEMENT_SECONDS,
  MOVING_XO_QUESTION_SECONDS,
  movingXoResult,
} from './moving-xo-gameplay.plugin';

const X = 'team-x';
const O = 'team-o';
const NOW = new Date('2026-10-06T12:00:00.000Z');

const QUESTION = {
  contentItemId: 'item-1',
  scopeId: 'scope-1',
  answerMode: 'match' as const,
  prompt: { text: 'من هذا؟' },
  acceptedAnswers: ['جورج قرداحي'],
};

function runtime(over: Record<string, unknown> = {}): GameplayModeState {
  return {
    phase: 'answering',
    activeTeamId: X,
    teamIds: [X, O],
    board: createMovingXoBoard([X, O]),
    successfulMoveCount: 0,
    decisivePhase: false,
    pendingMove: false,
    question: QUESTION,
    presentedContentItemIds: [QUESTION.contentItemId],
    deadlineAt: new Date(NOW.getTime() + 15_000).toISOString(),
    winningTeamId: null,
    outcome: null,
    ...over,
  } as unknown as GameplayModeState;
}

function run(
  type: string,
  payload: Record<string, unknown>,
  state: GameplayModeState,
  context: Record<string, unknown> = {},
) {
  return PLUGIN.handleCommand(
    {
      sessionId: 's',
      runtimeId: 'r',
      activeTeamId: X,
      now: NOW,
      ...context,
    } as never,
    {
      type,
      payload: payload as never,
      runtimeState: state,
      roundState: {} as GameplayModeState,
    },
  );
}

const state = (result: { runtimeState: GameplayModeState }) =>
  result.runtimeState as unknown as Record<string, unknown>;

describe('Moving XO plugin — initial state', () => {
  it('starts with the canonical Match turn owner, not a coin flip', () => {
    const created = PLUGIN.createInitialRuntimeState({
      sessionId: 's',
      runtimeId: 'r',
      activeTeamId: O,
      initialState: { teamIds: [X, O] } as unknown as GameplayModeState,
    } as never) as unknown as Record<string, unknown>;
    expect(created.activeTeamId).toBe(O);
    // No deck: the challenge opens owing its first puzzle rather than holding one.
    expect(created.phase).toBe('question-pending');
    expect(created.question).toBeNull();
    expect(created.presentedContentItemIds).toEqual([]);
    expect(created.successfulMoveCount).toBe(0);
    expect(created.decisivePhase).toBe(false);
    expect(created.pendingMove).toBe(false);
  });

  it('rejects a runtime that owes a move outside placement', () => {
    expect(() =>
      PLUGIN.validateRuntimeState(
        runtime({ pendingMove: true, phase: 'answering' }),
      ),
    ).toThrow(/earned move/);
  });

  it('rejects a malformed board or team set', () => {
    expect(() =>
      PLUGIN.validateRuntimeState(runtime({ teamIds: [X] })),
    ).toThrow();
    expect(() =>
      PLUGIN.validateRuntimeState(
        runtime({ board: { cells: [], markOrder: {} } }),
      ),
    ).toThrow(/nine-cell/);
  });
});

describe('Moving XO plugin — answering', () => {
  it('a correct answer opens placement and earns exactly one move', () => {
    const next = state(
      run(MOVING_XO_COMMANDS.answer, { answer: 'جورج قرداحي' }, runtime()),
    );
    expect(next.phase).toBe('placement');
    expect(next.pendingMove).toBe(true);
    expect(next.activeTeamId).toBe(X);
    expect(next.successfulMoveCount).toBe(0); // not until the placement commits
    expect(next.deadlineAt).toBe(
      new Date(
        NOW.getTime() + MOVING_XO_PLACEMENT_SECONDS * 1000,
      ).toISOString(),
    );
  });

  it('normalizes through the canonical matcher rather than a local variant', () => {
    // Hamza folding is the shared normalizer's job; the plugin must inherit it.
    const next = state(
      run(
        MOVING_XO_COMMANDS.answer,
        { answer: 'جورج قرداحى' },
        runtime({
          question: { ...QUESTION, acceptedAnswers: ['جورج قرداحي'] },
        }),
      ),
    );
    expect(next.phase).toBe('placement');
  });

  it('a wrong answer earns nothing and passes the turn', () => {
    const result = run(MOVING_XO_COMMANDS.answer, { answer: 'خطأ' }, runtime());
    const next = state(result);
    expect(next.pendingMove).toBe(false);
    expect(next.activeTeamId).toBe(O);
    // The turn owes a fresh puzzle; no clock may run until one exists.
    expect(next.phase).toBe('question-pending');
    expect(next.question).toBeNull();
    expect(next.deadlineAt).toBeNull();
    expect(next.successfulMoveCount).toBe(0);
    expect(result.effects).toContainEqual({
      type: 'switch-active-team',
      teamId: O,
      reason: 'moving-xo-wrong-answer',
    });
    // The checkpoint belongs to the puzzle, so it opens with the puzzle.
    expect(result.prepareNextPresentation).toBeUndefined();
  });

  it('refuses an answer while a placement is owed', () => {
    expect(() =>
      run(
        MOVING_XO_COMMANDS.answer,
        { answer: 'جورج قرداحي' },
        runtime({ phase: 'placement', pendingMove: true }),
      ),
    ).toThrow(/No puzzle is open/);
  });

  it('refuses the opponent', () => {
    expect(() =>
      run(MOVING_XO_COMMANDS.answer, { answer: 'جورج قرداحي' }, runtime(), {
        activeTeamId: O,
      }),
    ).toThrow(/active team/);
  });
});

describe('Moving XO plugin — placement authority', () => {
  const placing = runtime({ phase: 'placement', pendingMove: true });

  it('commits a legal placement, counts it, and passes the turn', () => {
    const result = run(MOVING_XO_COMMANDS.place, { cell: 4 }, placing);
    const next = state(result);
    expect((next.board as { cells: unknown[] }).cells[4]).toBe(X);
    expect(next.successfulMoveCount).toBe(1);
    expect(next.pendingMove).toBe(false);
    expect(next.activeTeamId).toBe(O);
    expect(next.phase).toBe('question-pending');
    expect(result.prepareNextPresentation).toBeUndefined();
  });

  it('refuses a placement with no earned move', () => {
    expect(() => run(MOVING_XO_COMMANDS.place, { cell: 4 }, runtime())).toThrow(
      /earned move/,
    );
  });

  it('refuses a second placement once the move is spent', () => {
    const after = run(
      MOVING_XO_COMMANDS.place,
      { cell: 4 },
      placing,
    ).runtimeState;
    // Two independent guards now refuse it, and both matter. A replay from the
    // original team is refused because the turn has moved on...
    expect(() => run(MOVING_XO_COMMANDS.place, { cell: 0 }, after)).toThrow(
      /active team/,
    );
    // ...and even addressed as the team that now holds the turn, there is no
    // earned move to spend, so a duplicate can never place twice.
    expect(() =>
      run(MOVING_XO_COMMANDS.place, { cell: 0 }, after, { activeTeamId: O }),
    ).toThrow(/earned move/);
  });

  it('refuses the opponent placing', () => {
    expect(() =>
      run(MOVING_XO_COMMANDS.place, { cell: 4 }, placing, { activeTeamId: O }),
    ).toThrow(/active team/);
  });

  it.each([
    [
      'an occupied opponent cell',
      { cells: [O, null, null, null, null, null, null, null, null] },
    ],
  ])('refuses %s', (_label, boardOver) => {
    const board = { ...createMovingXoBoard([X, O]), ...boardOver };
    expect(() =>
      run(
        MOVING_XO_COMMANDS.place,
        { cell: 0 },
        runtime({
          ...({ phase: 'placement', pendingMove: true } as object),
          board,
        }),
      ),
    ).toThrow(/Illegal placement/);
  });

  it('refuses an out-of-range cell', () => {
    expect(() => run(MOVING_XO_COMMANDS.place, { cell: 99 }, placing)).toThrow(
      /Illegal placement/,
    );
  });

  it('resolves two teammates racing to different cells to exactly one move', () => {
    // Both teammates read the same revision and both are authorised. The
    // runtime's CAS admits one; the loser is replayed against the committed
    // state, where the earned move is already spent and the turn has passed.
    const first = run(
      MOVING_XO_COMMANDS.place,
      { cell: 0 },
      placing,
    ).runtimeState;
    expect(() => run(MOVING_XO_COMMANDS.place, { cell: 8 }, first)).toThrow();
    const cells = (first as unknown as { board: { cells: unknown[] } }).board
      .cells;
    expect(cells.filter((owner) => owner === X)).toHaveLength(1);
    expect(cells[8]).toBeNull();
  });
});

describe('Moving XO plugin — deadlines', () => {
  it('declares one owner, armed only in the answering phase', () => {
    expect(PLUGIN.deadline).toMatchObject({
      source: 'runtime-state',
      commandType: MOVING_XO_COMMANDS.expireQuestion,
      activePhases: ['answering'],
      // The first puzzle is drawn inside the launch, before any surface has
      // acknowledged anything, so the one-time activation has to hold its clock.
      requiresPresentationActivation: true,
    });
    // `question-pending` is listed nowhere, so a turn waiting for content runs
    // no clock at all.
    expect(PLUGIN.deadline).not.toMatchObject({
      activePhases: expect.arrayContaining(['question-pending']),
    });
  });

  it('re-anchors the question window on presentation activation', () => {
    const activated = PLUGIN.activatePresentation?.(
      runtime({ deadlineAt: null }),
      NOW,
      { sessionId: 's', runtimeId: 'r' } as never,
    ) as unknown as Record<string, unknown>;
    expect(activated.deadlineAt).toBe(
      new Date(NOW.getTime() + MOVING_XO_QUESTION_SECONDS * 1000).toISOString(),
    );
  });

  it('a question timeout behaves exactly like a wrong answer', () => {
    const expired = runtime({
      deadlineAt: new Date(NOW.getTime() - 1).toISOString(),
    });
    const next = state(run(MOVING_XO_COMMANDS.expireQuestion, {}, expired));
    expect(next.activeTeamId).toBe(O);
    expect(next.pendingMove).toBe(false);
    expect(next.successfulMoveCount).toBe(0);
    expect(next.phase).toBe('question-pending');
  });

  it('a placement timeout forfeits the move and mutates no cell', () => {
    const expired = runtime({
      phase: 'placement',
      pendingMove: true,
      deadlineAt: new Date(NOW.getTime() - 1).toISOString(),
    });
    const next = state(run(MOVING_XO_COMMANDS.expirePlacement, {}, expired));
    expect(next.pendingMove).toBe(false);
    expect(next.successfulMoveCount).toBe(0);
    expect(
      (next.board as { cells: unknown[] }).cells.every((c) => c === null),
    ).toBe(true);
    expect(next.activeTeamId).toBe(O);
  });

  it('refuses an early forfeit even from the controller', () => {
    expect(() => run(MOVING_XO_COMMANDS.expireQuestion, {}, runtime())).toThrow(
      /has not elapsed/,
    );
  });
});

describe('Moving XO plugin — terminal outcomes', () => {
  function boardWith(
    cells: (string | null)[],
    order: Record<string, number[]>,
  ) {
    return { cells, markOrder: order };
  }

  it('completes on a win and names the team', () => {
    const almost = runtime({
      phase: 'placement',
      pendingMove: true,
      board: boardWith([X, X, null, null, null, null, null, null, null], {
        [X]: [0, 1],
        [O]: [],
      }),
      successfulMoveCount: 4,
    });
    const next = state(run(MOVING_XO_COMMANDS.place, { cell: 2 }, almost));
    expect(next.phase).toBe('completed');
    expect(next.outcome).toBe('win');
    expect(next.winningTeamId).toBe(X);
    expect(next.deadlineAt).toBeNull();
  });

  it('enters الحسم after a non-winning move #12', () => {
    const next = state(
      run(
        MOVING_XO_COMMANDS.place,
        { cell: 4 },
        runtime({
          phase: 'placement',
          pendingMove: true,
          successfulMoveCount: MOVING_XO_DECISIVE_AFTER_MOVES - 1,
        }),
      ),
    );
    expect(next.successfulMoveCount).toBe(MOVING_XO_DECISIVE_AFTER_MOVES);
    expect(next.decisivePhase).toBe(true);
    expect(next.phase).toBe('question-pending');
  });

  it('a winning move #12 wins and never enters الحسم', () => {
    const next = state(
      run(
        MOVING_XO_COMMANDS.place,
        { cell: 2 },
        runtime({
          phase: 'placement',
          pendingMove: true,
          successfulMoveCount: MOVING_XO_DECISIVE_AFTER_MOVES - 1,
          board: boardWith([X, X, null, null, null, null, null, null, null], {
            [X]: [0, 1],
            [O]: [],
          }),
        }),
      ),
    );
    expect(next.outcome).toBe('win');
    expect(next.decisivePhase).toBe(false);
  });

  it('draws when الحسم fills the board with no winner', () => {
    // X: 0,1,5,6,7 · O: 2,3,4,8 — cell 7 is the last empty square.
    const next = state(
      run(
        MOVING_XO_COMMANDS.place,
        { cell: 7 },
        runtime({
          phase: 'placement',
          pendingMove: true,
          decisivePhase: true,
          successfulMoveCount: 18,
          board: boardWith([X, X, O, O, O, X, X, null, O], {
            [X]: [0, 1, 5, 6],
            [O]: [2, 3, 4, 8],
          }),
        }),
      ),
    );
    expect(next.phase).toBe('completed');
    expect(next.outcome).toBe('draw');
    expect(next.winningTeamId).toBeNull();
  });

  it('refuses any action after completion', () => {
    const done = runtime({ phase: 'completed', outcome: 'draw' });
    expect(() => run(MOVING_XO_COMMANDS.answer, { answer: 'x' }, done)).toThrow(
      /has ended/,
    );
    expect(() => run(MOVING_XO_COMMANDS.place, { cell: 0 }, done)).toThrow(
      /has ended/,
    );
  });
});

describe('Moving XO plugin — projection and privacy', () => {
  // A placement never holds a puzzle: the answer is already given, so the item
  // and its answer leave committed state at the correct answer.
  const placing = runtime({
    phase: 'placement',
    pendingMove: true,
    question: null,
  });

  it('never projects accepted answers in the public view', () => {
    const projected = JSON.stringify(PLUGIN.projectRuntimeState(runtime()));
    expect(projected).not.toContain('acceptedAnswers');
    expect(projected).not.toContain('جورج قرداحي');
  });

  it('never projects accepted answers to any actor', () => {
    for (const teamId of [X, O, undefined]) {
      const projected = JSON.stringify(
        PLUGIN.projectRuntimeStateForActor?.(runtime(), {
          teamId,
        } as never),
      );
      expect(projected).not.toContain('acceptedAnswers');
      expect(projected).not.toContain('جورج قرداحي');
    }
  });

  it('never projects the right option id of a multiple-choice puzzle', () => {
    const mc = runtime({
      question: {
        contentItemId: 'item-mc',
        scopeId: 'scope-1',
        answerMode: 'multiple_choice',
        prompt: { text: 'أي شكل؟' },
        options: [{ id: 'A' }, { id: 'B' }],
        correctOptionId: 'B',
      },
    });
    const projected = PLUGIN.projectRuntimeState(mc) as unknown as {
      question: Record<string, unknown>;
    };
    // The choices are public; which one is right is not.
    expect(projected.question.options).toEqual([{ id: 'A' }, { id: 'B' }]);
    expect(JSON.stringify(projected)).not.toContain('correctOptionId');
  });

  it('gives the active team its placement affordances', () => {
    const projected = PLUGIN.projectRuntimeStateForActor?.(placing, {
      teamId: X,
    } as never) as unknown as Record<string, unknown>;
    expect(projected.legalCells).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(projected).toHaveProperty('expiringCell');
  });

  it('gives the opponent no placement affordances', () => {
    const projected = PLUGIN.projectRuntimeStateForActor?.(placing, {
      teamId: O,
    } as never) as unknown as Record<string, unknown>;
    expect(projected.legalCells).toBeUndefined();
    expect(projected.expiringCell).toBeUndefined();
  });

  it('publishes what a surface must render and nothing more', () => {
    const projected = PLUGIN.projectRuntimeState(runtime()) as unknown as {
      question: Record<string, unknown>;
    };
    expect(projected.question).toEqual({
      contentItemId: 'item-1',
      scopeId: 'scope-1',
      answerMode: 'match',
      prompt: { text: 'من هذا؟' },
      media: null,
    });
  });

  it('publishes no puzzle at all while a placement is owed', () => {
    const projected = PLUGIN.projectRuntimeState(placing) as unknown as Record<
      string,
      unknown
    >;
    expect(projected.question).toBeNull();
    expect(projected.questionsPresented).toBe(1);
  });

  it('still rejects an illegal placement a client was told was illegal', () => {
    // Legality is the reducer's, not the projection's: a client ignoring
    // `legalCells` is refused anyway.
    const board = {
      cells: [O, null, null, null, null, null, null, null, null],
      markOrder: { [X]: [], [O]: [0] },
    };
    const withOpponentMark = runtime({
      phase: 'placement',
      pendingMove: true,
      board,
    });
    const projected = PLUGIN.projectRuntimeStateForActor?.(withOpponentMark, {
      teamId: X,
    } as never) as unknown as { legalCells: number[] };
    expect(projected.legalCells).not.toContain(0);
    expect(() =>
      run(MOVING_XO_COMMANDS.place, { cell: 0 }, withOpponentMark),
    ).toThrow(/Illegal placement/);
  });
});

describe('Moving XO plugin — answer modes', () => {
  const mcQuestion = {
    contentItemId: 'item-mc',
    scopeId: 'scope-1',
    answerMode: 'multiple_choice' as const,
    prompt: { text: 'أي شكل؟' },
    options: [{ id: 'A' }, { id: 'B' }],
    correctOptionId: 'B',
  };

  it('accepts a correct multiple_choice option by id', () => {
    const next = state(
      run(
        MOVING_XO_COMMANDS.answer,
        { optionId: 'B' },
        runtime({ question: mcQuestion }),
      ),
    );
    expect(next.phase).toBe('placement');
    expect(next.pendingMove).toBe(true);
  });

  it('treats a wrong option as a wrong answer', () => {
    const next = state(
      run(
        MOVING_XO_COMMANDS.answer,
        { optionId: 'A' },
        runtime({ question: mcQuestion }),
      ),
    );
    expect(next.phase).toBe('question-pending');
    expect(next.activeTeamId).toBe(O);
    expect(next.pendingMove).toBe(false);
  });

  it('does not accept a blank or missing option', () => {
    for (const payload of [{}, { optionId: '' }]) {
      const next = state(
        run(
          MOVING_XO_COMMANDS.answer,
          payload,
          runtime({ question: mcQuestion }),
        ),
      );
      expect(next.pendingMove).toBe(false);
    }
  });

  it('refuses an item whose answer mode is outside V1', () => {
    // `closest` cannot be selected — it is absent from the compatibility map —
    // but the reducer refuses rather than guesses if one ever arrives.
    expect(() =>
      run(
        MOVING_XO_COMMANDS.answer,
        { answer: '5' },
        runtime({
          question: {
            contentItemId: 'item-1',
            scopeId: 's',
            answerMode: 'closest',
            prompt: {},
            acceptedAnswers: [],
          },
        }),
      ),
    ).toThrow(/match and multiple_choice only/);
  });
});

describe('Moving XO plugin — both windows are server-owned', () => {
  it('declares the placement window as well as the question window', () => {
    expect(PLUGIN.deadline).toMatchObject({
      source: 'runtime-state',
      commandType: MOVING_XO_COMMANDS.expireQuestion,
      activePhases: ['answering'],
      commandTypeByPhase: { placement: MOVING_XO_COMMANDS.expirePlacement },
    });
  });

  it('can answer both declared expiry commands', () => {
    expect(PLUGIN.command(MOVING_XO_COMMANDS.expireQuestion)).toBeDefined();
    expect(PLUGIN.command(MOVING_XO_COMMANDS.expirePlacement)).toBeDefined();
  });

  it('arms the placement clock from the correct-answer commit, not a new checkpoint', () => {
    const answered = run(
      MOVING_XO_COMMANDS.answer,
      { answer: 'جورج قرداحي' },
      runtime(),
    ).runtimeState as unknown as Record<string, unknown>;
    expect(answered.phase).toBe('placement');
    expect(answered.deadlineAt).toBe(
      new Date(
        NOW.getTime() + MOVING_XO_PLACEMENT_SECONDS * 1000,
      ).toISOString(),
    );
    // No fresh Fair-Start checkpoint: the presentation is already activated.
    expect(
      run(MOVING_XO_COMMANDS.answer, { answer: 'جورج قرداحي' }, runtime())
        .prepareNextPresentation,
    ).toBeUndefined();
  });
});

describe('Moving XO plugin — the on-demand content obligation', () => {
  const pending = runtime({
    phase: 'question-pending',
    question: null,
    deadlineAt: null,
    presentedContentItemIds: [],
  });

  const supplied = {
    contentItemId: 'item-2',
    scopeId: 'scope-1',
    answerMode: 'match',
    prompt: { text: 'كم مثلثًا؟' },
    acceptedAnswers: ['٧'],
  };

  const open = (state: GameplayModeState, question: unknown = supplied) =>
    run(
      MOVING_XO_COMMANDS.openQuestion,
      { questionJson: JSON.stringify(question) },
      state,
    );

  it('says in committed state that a puzzle is owed', () => {
    // The obligation is the phase itself, not an in-memory callback: a restarted
    // process reading this state can tell that a draw is outstanding.
    expect(PLUGIN.validateRuntimeState(pending)).toBeDefined();
    const projected = PLUGIN.projectRuntimeState(pending) as unknown as Record<
      string,
      unknown
    >;
    expect(projected.phase).toBe('question-pending');
    expect(projected.question).toBeNull();
    expect(projected.deadlineAt).toBeNull();
  });

  it('opens the supplied puzzle and records it as presented', () => {
    const result = open(pending);
    const next = state(result);
    expect(next.phase).toBe('answering');
    expect(next.presentedContentItemIds).toEqual(['item-2']);
    // The clock is not started at commit — Fair-Start anchors it at activation.
    expect(next.deadlineAt).toBeNull();
    expect(result.prepareNextPresentation).toBe(true);
  });

  it('anchors the fifteen seconds at activation, not at supply', () => {
    const opened = state(open(pending)) as unknown as GameplayModeState;
    const later = new Date(NOW.getTime() + 9_000);
    const activated = PLUGIN.activatePresentation?.(opened, later, {
      sessionId: 's',
      runtimeId: 'r',
      presentationKind: 'recurring',
    } as never) as unknown as Record<string, unknown>;
    expect(activated.deadlineAt).toBe(
      new Date(
        later.getTime() + MOVING_XO_QUESTION_SECONDS * 1000,
      ).toISOString(),
    );
  });

  it('never repeats an item this challenge already presented', () => {
    expect(() =>
      open(
        runtime({
          phase: 'question-pending',
          question: null,
          deadlineAt: null,
        }),
        {
          ...supplied,
          contentItemId: 'item-1',
        },
      ),
    ).toThrow(/already presented/);
  });

  it('refuses a supplied item outside the V1 answer contract', () => {
    expect(() => open(pending, { ...supplied, answerMode: 'closest' })).toThrow(
      /match and multiple_choice only/,
    );
  });

  it('refuses a puzzle that was never requested', () => {
    expect(() => open(runtime())).toThrow(/No Moving XO puzzle was requested/);
  });

  it('refuses a missing or unparseable puzzle', () => {
    expect(() => run(MOVING_XO_COMMANDS.openQuestion, {}, pending)).toThrow(
      /No Moving XO puzzle was supplied/,
    );
    expect(() =>
      run(MOVING_XO_COMMANDS.openQuestion, { questionJson: '{' }, pending),
    ).toThrow(/invalid/);
  });

  it('holds no clock while the puzzle is owed, in either declared window', () => {
    const declaration = PLUGIN.deadline as {
      activePhases: readonly string[];
      commandTypeByPhase?: Record<string, string>;
    };
    expect(declaration.activePhases).not.toContain('question-pending');
    expect(declaration.commandTypeByPhase).not.toHaveProperty(
      'question-pending',
    );
  });

  it('refuses an answer while the puzzle is still being presented', () => {
    // Fair-Start: the surfaces have not acknowledged, so no clock has started and
    // nothing is answerable yet.
    expect(() =>
      run(MOVING_XO_COMMANDS.answer, { answer: 'جورج قرداحي' }, runtime(), {
        awaitingPresentationActivation: true,
      }),
    ).toThrow(/not playable until presentation activation/);
  });

  it('reports the cumulative presented set, so a missed write self-heals', () => {
    const played = runtime({ presentedContentItemIds: ['a', 'b', 'c'] });
    expect(
      PLUGIN.presentedContentItemIds?.({
        runtimeState: played,
        roundState: {} as GameplayModeState,
        orderedContentItemIds: [],
      }),
    ).toEqual(['a', 'b', 'c']);
  });
});

describe('Moving XO plugin — content depletion', () => {
  it('ends with no winner when nothing eligible remains', () => {
    const pending = runtime({
      phase: 'question-pending',
      question: null,
      deadlineAt: null,
      successfulMoveCount: 3,
    });
    const next = state(run(MOVING_XO_COMMANDS.exhausted, {}, pending));
    expect(next.phase).toBe('completed');
    expect(next.outcome).toBe('content-exhausted');
    // No winner is invented for whoever happened to be holding the turn.
    expect(next.winningTeamId).toBeNull();
    expect(next.deadlineAt).toBeNull();
  });

  it('reports depletion as a distinct machine-readable terminal', () => {
    const done = state(
      run(
        MOVING_XO_COMMANDS.exhausted,
        {},
        runtime({
          phase: 'question-pending',
          question: null,
          deadlineAt: null,
        }),
      ),
    ) as unknown as GameplayModeState;
    expect(movingXoResult(done)).toEqual({
      winnerTeamId: null,
      endedBy: 'content-exhausted',
      successfulMoveCount: 0,
      questionsPresented: 1,
      decisivePhase: false,
    });
  });

  it('has no result at all while the challenge is still running', () => {
    expect(movingXoResult(runtime())).toBeUndefined();
  });

  it('cannot deplete a challenge that already ended', () => {
    expect(() =>
      run(
        MOVING_XO_COMMANDS.exhausted,
        {},
        runtime({ phase: 'completed', outcome: 'draw', question: null }),
      ),
    ).toThrow(/has ended/);
  });

  it('reports a win and a draw through the same result contract', () => {
    const won = runtime({
      phase: 'completed',
      question: null,
      outcome: 'win',
      winningTeamId: X,
      successfulMoveCount: 5,
    }) as unknown as GameplayModeState;
    expect(movingXoResult(won)).toMatchObject({
      winnerTeamId: X,
      endedBy: 'win',
    });
    const drawn = runtime({
      phase: 'completed',
      question: null,
      outcome: 'draw',
      decisivePhase: true,
    }) as unknown as GameplayModeState;
    expect(movingXoResult(drawn)).toMatchObject({
      winnerTeamId: null,
      endedBy: 'draw',
      decisivePhase: true,
    });
  });
});

describe('Moving XO plugin — server-owned commands', () => {
  it('lets no player supply content or declare depletion', () => {
    for (const type of [
      MOVING_XO_COMMANDS.openQuestion,
      MOVING_XO_COMMANDS.exhausted,
      MOVING_XO_COMMANDS.expireQuestion,
      MOVING_XO_COMMANDS.expirePlacement,
    ]) {
      expect(PLUGIN.command(type)?.authorization).toBe('controller');
    }
  });

  it('lets any player on the active team answer and place', () => {
    for (const type of [MOVING_XO_COMMANDS.answer, MOVING_XO_COMMANDS.place]) {
      expect(PLUGIN.command(type)?.authorization).toBe('active-team-player');
    }
  });

  it('asks for a shared surface only while a puzzle is being answered', () => {
    const surfaces = (phase: string) =>
      PLUGIN.requiredPresentationSurfaces?.({
        runtimeState: runtime({
          phase,
          question: phase === 'answering' ? QUESTION : null,
        }),
        roundState: {} as GameplayModeState,
      });
    expect(surfaces('answering')).toEqual([{ capability: 'shared' }]);
    expect(surfaces('question-pending')).toBeUndefined();
    expect(surfaces('placement')).toBeUndefined();
  });
});
