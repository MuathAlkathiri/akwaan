import {
  LA_TAHRIQHA_GAMEPLAY_PLUGIN,
  LA_TAHRIQHA_MODE_KEY,
  LaTahriqhaDishResult,
  LaTahriqhaRuntimeDish,
  laTahriqhaDishAction,
} from './la-tahriqha-gameplay.plugin';
import {
  GameplayCommandPayload,
  GameplayModeState,
  GameplayPluginContext,
} from './gameplay-mode.plugin';
import {
  assignNextTeamAction,
  buildTeamRotations,
  createTeamActionAssignmentState,
  EligibleParticipant,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
} from './team-action-assignment';
import { LA_TAHRIQHA_DEFAULT_DISH_SECONDS } from '../../world-content/domain/world-content.constants';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const TEAMS = [TEAM_A, TEAM_B];

const dish = (index: number): LaTahriqhaRuntimeDish => ({
  id: `item-${index}`,
  dishName: `طبق ${index}`,
  media: null,
  // Deliberately interleaved, the way the launcher's shuffle leaves them, so a
  // test that passes cannot be relying on "the first five are correct".
  ingredients: [
    { localId: `d${index}-c1`, label: 'مكوّن أ', correct: true },
    { localId: `d${index}-x1`, label: 'محتمل أ', correct: false },
    { localId: `d${index}-c2`, label: 'مكوّن ب', correct: true },
    { localId: `d${index}-c3`, label: 'مكوّن ج', correct: true },
    { localId: `d${index}-x2`, label: 'محتمل ب', correct: false },
    { localId: `d${index}-c4`, label: 'مكوّن د', correct: true },
    { localId: `d${index}-x3`, label: 'محتمل ج', correct: false },
    { localId: `d${index}-c5`, label: 'مكوّن هـ', correct: true },
  ],
  timerSeconds: LA_TAHRIQHA_DEFAULT_DISH_SECONDS,
});

const players = (perTeam: number): EligibleParticipant[] =>
  TEAMS.flatMap((teamId) =>
    Array.from({ length: perTeam }, (_, index) => ({
      participantId: `${teamId}-p${index + 1}`,
      teamId,
      connected: true,
    })),
  );

function launchState(participants: EligibleParticipant[]): GameplayModeState {
  let assignments = createTeamActionAssignmentState(
    buildTeamRotations({
      teams: TEAMS,
      participants,
      randomIndex: () => 0,
    }),
  );
  for (const teamId of TEAMS) {
    assignments = assignNextTeamAction(assignments, {
      teamId,
      action: laTahriqhaDishAction(teamId),
      participants,
    }).state;
  }
  return LA_TAHRIQHA_GAMEPLAY_PLUGIN.validateRuntimeState({
    dishesJson: JSON.stringify([dish(1), dish(2), dish(3)]),
    teamIdsJson: JSON.stringify(TEAMS),
    currentDishIndex: 0,
    phase: 'preparing',
    deadlineAt: null,
    selectionsJson: JSON.stringify({ [TEAM_A]: [], [TEAM_B]: [] }),
    lockedJson: JSON.stringify({ [TEAM_A]: false, [TEAM_B]: false }),
    resultsJson: '[]',
    teamActionJson: serializeTeamActionAssignments(assignments),
  });
}

const START = new Date('2026-09-17T18:00:00.000Z');

function activate(state: GameplayModeState, now = START): GameplayModeState {
  const result = LA_TAHRIQHA_GAMEPLAY_PLUGIN.activatePresentation!(
    state,
    now,
    {} as GameplayPluginContext,
  );
  return (
    'runtimeState' in result ? result.runtimeState : result
  ) as GameplayModeState;
}

function context(
  participants: EligibleParticipant[],
  submitter?: string,
  now: Date = START,
): GameplayPluginContext {
  return {
    sessionId: 'session',
    runtimeId: 'runtime',
    eligibleParticipants: participants,
    ...(submitter ? { submitterParticipantId: submitter } : {}),
    now,
  };
}

function send(
  state: GameplayModeState,
  type: string,
  participants: EligibleParticipant[],
  submitter?: string,
  payload: GameplayCommandPayload = {},
  now: Date = START,
): GameplayModeState {
  const round = LA_TAHRIQHA_GAMEPLAY_PLUGIN.createInitialRoundState({
    runtimeState: state,
  } as GameplayPluginContext);
  return LA_TAHRIQHA_GAMEPLAY_PLUGIN.handleCommand(
    context(participants, submitter, now),
    { type, payload, runtimeState: state, roundState: round },
  ).runtimeState;
}

const captainOf = (state: GameplayModeState, teamId: string) =>
  parseTeamActionAssignments(state.teamActionJson).assignments.find(
    (assignment) => assignment.action === laTahriqhaDishAction(teamId),
  )?.participantId;

function pick(
  state: GameplayModeState,
  participants: EligibleParticipant[],
  teamId: string,
  ids: string[],
  now: Date = START,
): GameplayModeState {
  let working = state;
  for (const ingredientId of ids) {
    working = send(
      working,
      'select-la-tahriqha-ingredient',
      participants,
      captainOf(working, teamId),
      { ingredientId },
      now,
    );
  }
  return working;
}

const lock = (
  state: GameplayModeState,
  participants: EligibleParticipant[],
  teamId: string,
  now: Date = START,
) =>
  send(
    state,
    'lock-la-tahriqha-dish',
    participants,
    captainOf(state, teamId),
    {},
    now,
  );

const latest = (state: GameplayModeState): LaTahriqhaDishResult => {
  const results = JSON.parse(
    String(state.resultsJson),
  ) as LaTahriqhaDishResult[];
  return results[results.length - 1];
};

const teamResult = (state: GameplayModeState, teamId: string) =>
  latest(state).teams.find((team) => team.teamId === teamId)!;

/**
 * Everything a projection says *apart from* the dish itself.
 *
 * The eight card ids are public from the first second — they are the board — so
 * a naive substring search over the whole payload would always find them. What
 * must never travel is which of those cards the other team picked, and that can
 * only be answered by looking everywhere except the card list.
 */
const beyondTheDish = (projection: GameplayModeState) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(projection).filter(([key]) => key !== 'currentDishJson'),
    ),
  );

describe('لا تحرقها runtime contract', () => {
  it('registers under the canonical runtime key', () => {
    expect(LA_TAHRIQHA_GAMEPLAY_PLUGIN.key).toBe('la-tahriqha');
    expect(LA_TAHRIQHA_MODE_KEY).toBe('la-tahriqha');
  });

  it('launches prepared, with no clock running', () => {
    const state = launchState(players(2));
    expect(state.phase).toBe('preparing');
    expect(state.deadlineAt).toBeNull();
  });

  it('opens the dish and anchors the window at Fair-Start activation', () => {
    const state = activate(launchState(players(2)));
    expect(state.phase).toBe('selecting');
    expect(state.deadlineAt).toBe(
      new Date(
        START.getTime() + LA_TAHRIQHA_DEFAULT_DISH_SECONDS * 1000,
      ).toISOString(),
    );
  });

  it('honours a dish that authored its own window', () => {
    const base = launchState(players(1));
    const dishes = JSON.parse(
      String(base.dishesJson),
    ) as LaTahriqhaRuntimeDish[];
    dishes[0].timerSeconds = 45;
    const state = activate({ ...base, dishesJson: JSON.stringify(dishes) });
    expect(state.deadlineAt).toBe(
      new Date(START.getTime() + 45 * 1000).toISOString(),
    );
  });
});

describe('لا تحرقها dish captaincy', () => {
  it('gives the first dish to the first player in each team’s canonical order', () => {
    const state = launchState(players(3));
    expect(captainOf(state, TEAM_A)).toBe('team-a-p1');
    expect(captainOf(state, TEAM_B)).toBe('team-b-p1');
  });

  it('rotates A → B → C across the three dishes for a team of three', () => {
    const participants = players(3);
    const seen: string[] = [];
    let state = activate(launchState(participants));
    for (let dishIndex = 0; dishIndex < 3; dishIndex += 1) {
      seen.push(captainOf(state, TEAM_A)!);
      const dishes = JSON.parse(
        String(state.dishesJson),
      ) as LaTahriqhaRuntimeDish[];
      const correct = dishes[dishIndex].ingredients
        .filter((ingredient) => ingredient.correct)
        .slice(0, 3)
        .map((ingredient) => ingredient.localId);
      state = pick(state, participants, TEAM_A, correct);
      state = pick(state, participants, TEAM_B, correct);
      state = lock(state, participants, TEAM_A);
      state = lock(state, participants, TEAM_B);
      if (dishIndex < 2) {
        state = activate(
          send(state, 'advance-la-tahriqha', participants, undefined),
        );
      }
    }
    expect(seen).toEqual(['team-a-p1', 'team-a-p2', 'team-a-p3']);
  });

  it('rotates A → B → A for a team of two and stays on A for a team of one', () => {
    const run = (perTeam: number) => {
      const participants = players(perTeam);
      const seen: string[] = [];
      let state = activate(launchState(participants));
      for (let dishIndex = 0; dishIndex < 3; dishIndex += 1) {
        seen.push(captainOf(state, TEAM_A)!);
        const dishes = JSON.parse(
          String(state.dishesJson),
        ) as LaTahriqhaRuntimeDish[];
        const correct = dishes[dishIndex].ingredients
          .filter((ingredient) => ingredient.correct)
          .slice(0, 3)
          .map((ingredient) => ingredient.localId);
        state = pick(state, participants, TEAM_A, correct);
        state = pick(state, participants, TEAM_B, correct);
        state = lock(state, participants, TEAM_A);
        state = lock(state, participants, TEAM_B);
        if (dishIndex < 2) {
          state = activate(
            send(state, 'advance-la-tahriqha', participants, undefined),
          );
        }
      }
      return seen;
    };
    expect(run(2)).toEqual(['team-a-p1', 'team-a-p2', 'team-a-p1']);
    expect(run(1)).toEqual(['team-a-p1', 'team-a-p1', 'team-a-p1']);
  });

  it('does not rotate when the same dish is activated again', () => {
    const participants = players(3);
    const state = activate(launchState(participants));
    const reactivated = activate(
      activate(state, new Date(START.getTime() + 2_000)),
      new Date(START.getTime() + 4_000),
    );
    expect(captainOf(reactivated, TEAM_A)).toBe('team-a-p1');
    expect(captainOf(reactivated, TEAM_B)).toBe('team-b-p1');
    // Re-anchoring the clock is exactly what a repeat activation should do.
    expect(reactivated.deadlineAt).toBe(
      new Date(
        START.getTime() + 4_000 + LA_TAHRIQHA_DEFAULT_DISH_SECONDS * 1000,
      ).toISOString(),
    );
  });

  it('keeps a captain’s selections when the dish is activated again', () => {
    const participants = players(2);
    let state = activate(launchState(participants));
    state = pick(state, participants, TEAM_A, ['d1-c1', 'd1-c2']);
    state = activate(state, new Date(START.getTime() + 5_000));
    expect(
      (JSON.parse(String(state.selectionsJson)) as Record<string, string[]>)[
        TEAM_A
      ],
    ).toEqual(['d1-c1', 'd1-c2']);
  });
});

describe('لا تحرقها captain authority', () => {
  const participants = players(2);

  it('refuses a teammate of the captain by name', () => {
    const state = activate(launchState(participants));
    expect(() =>
      send(state, 'select-la-tahriqha-ingredient', participants, 'team-a-p2', {
        ingredientId: 'd1-c1',
      }),
    ).toThrow('قائد الطبق');
  });

  it('refuses a player from the other team', () => {
    const state = activate(launchState(participants));
    expect(() =>
      send(state, 'select-la-tahriqha-ingredient', participants, 'team-b-p1', {
        ingredientId: 'd1-c1',
      }),
    ).not.toThrow();
    // …and that player may only ever move their own team's dish.
    const moved = send(
      state,
      'select-la-tahriqha-ingredient',
      participants,
      'team-b-p1',
      { ingredientId: 'd1-c1' },
    );
    const selections = JSON.parse(String(moved.selectionsJson)) as Record<
      string,
      string[]
    >;
    expect(selections[TEAM_B]).toEqual(['d1-c1']);
    expect(selections[TEAM_A]).toEqual([]);
  });

  it('refuses a command carrying a stale assignment sequence', () => {
    const state = activate(launchState(participants));
    expect(() =>
      send(state, 'select-la-tahriqha-ingredient', participants, 'team-a-p1', {
        ingredientId: 'd1-c1',
        assignmentSequence: 99,
      }),
    ).toThrow('moved past');
  });

  it('refuses an ingredient that is not on this dish', () => {
    const state = activate(launchState(participants));
    expect(() =>
      send(state, 'select-la-tahriqha-ingredient', participants, 'team-a-p1', {
        ingredientId: 'd2-c1',
      }),
    ).toThrow('not on this dish');
  });

  it('refuses a sixth ingredient rather than silently dropping one', () => {
    const participantsOfOne = players(1);
    const state = pick(
      activate(launchState(participantsOfOne)),
      participantsOfOne,
      TEAM_A,
      ['d1-c1', 'd1-c2', 'd1-c3', 'd1-c4', 'd1-c5'],
    );
    expect(() =>
      send(
        state,
        'select-la-tahriqha-ingredient',
        participantsOfOne,
        'team-a-p1',
        { ingredientId: 'd1-x1' },
      ),
    ).toThrow('Five ingredients');
  });

  it('lets the captain take a card back before committing', () => {
    let state = activate(launchState(participants));
    state = pick(state, participants, TEAM_A, ['d1-c1', 'd1-x1']);
    state = send(
      state,
      'deselect-la-tahriqha-ingredient',
      participants,
      'team-a-p1',
      { ingredientId: 'd1-x1' },
    );
    expect(
      (JSON.parse(String(state.selectionsJson)) as Record<string, string[]>)[
        TEAM_A
      ],
    ).toEqual(['d1-c1']);
  });

  it('refuses a commit below three ingredients', () => {
    const state = pick(
      activate(launchState(participants)),
      participants,
      TEAM_A,
      ['d1-c1', 'd1-c2'],
    );
    expect(() => lock(state, participants, TEAM_A)).toThrow('at least three');
  });

  it('refuses any change once a team has committed', () => {
    const participantsOfOne = players(1);
    let state = pick(
      activate(launchState(participantsOfOne)),
      participantsOfOne,
      TEAM_A,
      ['d1-c1', 'd1-c2', 'd1-c3'],
    );
    state = lock(state, participantsOfOne, TEAM_A);
    expect(() =>
      send(
        state,
        'select-la-tahriqha-ingredient',
        participantsOfOne,
        'team-a-p1',
        { ingredientId: 'd1-c4' },
      ),
    ).toThrow('already committed');
  });
});

describe('لا تحرقها dish resolution', () => {
  const participants = players(1);

  it('resolves as soon as both captains commit, paying 3 against 4', () => {
    let state = activate(launchState(participants));
    state = pick(state, participants, TEAM_A, ['d1-c1', 'd1-c2', 'd1-c3']);
    state = pick(state, participants, TEAM_B, [
      'd1-c1',
      'd1-c2',
      'd1-c3',
      'd1-c4',
    ]);
    state = lock(state, participants, TEAM_A);
    state = lock(state, participants, TEAM_B);
    expect(state.phase).toBe('revealed');
    expect(latest(state).resolutionReason).toBe('both-locked');
    expect(teamResult(state, TEAM_A).points).toBe(3);
    expect(teamResult(state, TEAM_B).points).toBe(4);
    expect(latest(state).totalsAfter).toEqual({ [TEAM_A]: 3, [TEAM_B]: 4 });
  });

  it('burns a dish for one wrong card and pays seven for the exact recipe', () => {
    let state = activate(launchState(participants));
    state = pick(state, participants, TEAM_A, [
      'd1-c1',
      'd1-c2',
      'd1-c3',
      'd1-c4',
      'd1-x1',
    ]);
    state = pick(state, participants, TEAM_B, [
      'd1-c1',
      'd1-c2',
      'd1-c3',
      'd1-c4',
      'd1-c5',
    ]);
    state = lock(state, participants, TEAM_A);
    state = lock(state, participants, TEAM_B);
    const burned = teamResult(state, TEAM_A);
    expect(burned.burned).toBe(true);
    expect(burned.points).toBe(0);
    expect(burned.wrongIds).toEqual(['d1-x1']);
    expect(burned.correctIds).toHaveLength(4);
    const perfect = teamResult(state, TEAM_B);
    expect(perfect.perfect).toBe(true);
    expect(perfect.points).toBe(7);
  });

  it('auto-locks a valid set at the deadline and scores a short set zero', () => {
    let state = activate(launchState(participants));
    state = pick(state, participants, TEAM_A, ['d1-c1', 'd1-c2', 'd1-c3']);
    state = pick(state, participants, TEAM_B, ['d1-c1', 'd1-c2']);
    const expired = new Date(
      START.getTime() + LA_TAHRIQHA_DEFAULT_DISH_SECONDS * 1000 + 1,
    );
    state = send(
      state,
      'expire-la-tahriqha-dish',
      participants,
      undefined,
      {},
      expired,
    );
    expect(state.phase).toBe('revealed');
    expect(latest(state).resolutionReason).toBe('deadline');
    const auto = teamResult(state, TEAM_A);
    expect(auto.lockReason).toBe('deadline');
    expect(auto.points).toBe(3);
    // The exact set the captain had, never topped up to five.
    expect(auto.selected).toEqual(['d1-c1', 'd1-c2', 'd1-c3']);
    const short = teamResult(state, TEAM_B);
    expect(short.understaffed).toBe(true);
    expect(short.points).toBe(0);
    expect(short.lockReason).toBe('none');
    expect(short.selected).toEqual(['d1-c1', 'd1-c2']);
  });

  /**
   * The scheduler is the only caller this command has, and it runs under the
   * session controller's identity — `GameplayAuthorization.can` refuses
   * `internal` for every actor, so declaring it that way makes an unattended
   * dish hang forever. This is the regression lock on exactly that defect.
   */
  it('declares an expiry authorization the server scheduler can actually satisfy', () => {
    const definition = LA_TAHRIQHA_GAMEPLAY_PLUGIN.command(
      'expire-la-tahriqha-dish',
    )!;
    expect(definition.authorization).toBe('controller');
    expect(definition.authorization).not.toBe('internal');
    expect(LA_TAHRIQHA_GAMEPLAY_PLUGIN.deadline).toMatchObject({
      source: 'runtime-state',
      commandType: 'expire-la-tahriqha-dish',
      activePhases: ['selecting'],
      requiresPresentationActivation: true,
    });
  });

  it('refuses a second expiry once the dish has already resolved', () => {
    const expired = new Date(
      START.getTime() + LA_TAHRIQHA_DEFAULT_DISH_SECONDS * 1000 + 1,
    );
    let state = pick(
      activate(launchState(participants)),
      participants,
      TEAM_A,
      ['d1-c1', 'd1-c2', 'd1-c3'],
    );
    state = send(
      state,
      'expire-la-tahriqha-dish',
      participants,
      undefined,
      {},
      expired,
    );
    expect(latest(state).teams.length).toBe(2);
    // A stale timer that fires again must not grade the dish a second time.
    expect(() =>
      send(
        state,
        'expire-la-tahriqha-dish',
        participants,
        undefined,
        {},
        expired,
      ),
    ).toThrow('not open for choosing');
    expect((JSON.parse(String(state.resultsJson)) as unknown[]).length).toBe(1);
  });

  it('refuses a commit that arrives after the clock already resolved the dish', () => {
    const expired = new Date(
      START.getTime() + LA_TAHRIQHA_DEFAULT_DISH_SECONDS * 1000 + 1,
    );
    let state = pick(
      activate(launchState(participants)),
      participants,
      TEAM_A,
      ['d1-c1', 'd1-c2', 'd1-c3'],
    );
    const captain = captainOf(state, TEAM_A);
    state = send(
      state,
      'expire-la-tahriqha-dish',
      participants,
      undefined,
      {},
      expired,
    );
    // The captain's tap lost the race with the deadline. It is refused rather
    // than applied to a dish the server has already graded.
    expect(() =>
      send(state, 'lock-la-tahriqha-dish', participants, captain, {}, expired),
    ).toThrow('not open for choosing');
    expect(() =>
      send(
        state,
        'select-la-tahriqha-ingredient',
        participants,
        captain,
        { ingredientId: 'd1-c4' },
        expired,
      ),
    ).toThrow('not open for choosing');
    expect(teamResult(state, TEAM_A).selected).toEqual([
      'd1-c1',
      'd1-c2',
      'd1-c3',
    ]);
  });

  it('refuses to expire a dish whose window has not elapsed', () => {
    const state = activate(launchState(participants));
    expect(() =>
      send(
        state,
        'expire-la-tahriqha-dish',
        participants,
        undefined,
        {},
        new Date(START.getTime() + 1_000),
      ),
    ).toThrow('has not elapsed');
  });

  it('records who captained the dish in its result', () => {
    let state = activate(launchState(players(2)));
    const participantsOfTwo = players(2);
    state = pick(state, participantsOfTwo, TEAM_A, ['d1-c1', 'd1-c2', 'd1-c3']);
    state = pick(state, participantsOfTwo, TEAM_B, ['d1-c1', 'd1-c2', 'd1-c3']);
    state = lock(state, participantsOfTwo, TEAM_A);
    state = lock(state, participantsOfTwo, TEAM_B);
    expect(teamResult(state, TEAM_A).captainParticipantId).toBe('team-a-p1');
  });
});

describe('لا تحرقها challenge convergence', () => {
  const participants = players(1);

  function playThree(
    picks: Array<Record<string, string[]>>,
  ): GameplayModeState {
    let state = activate(launchState(participants));
    picks.forEach((round, index) => {
      state = pick(state, participants, TEAM_A, round[TEAM_A]);
      state = pick(state, participants, TEAM_B, round[TEAM_B]);
      state = lock(state, participants, TEAM_A);
      state = lock(state, participants, TEAM_B);
      state = send(state, 'advance-la-tahriqha', participants, undefined);
      if (index < picks.length - 1) state = activate(state);
    });
    return state;
  }

  const three = (dishIndex: number) => [
    `d${dishIndex}-c1`,
    `d${dishIndex}-c2`,
    `d${dishIndex}-c3`,
  ];
  const five = (dishIndex: number) => [
    ...three(dishIndex),
    `d${dishIndex}-c4`,
    `d${dishIndex}-c5`,
  ];

  it('prepares the next dish without a clock and asks for a fresh Fair-Start', () => {
    let state = activate(launchState(participants));
    state = pick(state, participants, TEAM_A, three(1));
    state = pick(state, participants, TEAM_B, three(1));
    state = lock(state, participants, TEAM_A);
    const locked = lock(state, participants, TEAM_B);
    const round = LA_TAHRIQHA_GAMEPLAY_PLUGIN.createInitialRoundState({
      runtimeState: locked,
    } as GameplayPluginContext);
    const advanced = LA_TAHRIQHA_GAMEPLAY_PLUGIN.handleCommand(
      context(participants, undefined),
      {
        type: 'advance-la-tahriqha',
        payload: {},
        runtimeState: locked,
        roundState: round,
      },
    );
    expect(advanced.prepareNextPresentation).toBe(true);
    expect(advanced.runtimeState.phase).toBe('preparing');
    expect(advanced.runtimeState.deadlineAt).toBeNull();
    expect(advanced.runtimeState.currentDishIndex).toBe(1);
    expect(JSON.parse(String(advanced.runtimeState.selectionsJson))).toEqual({
      [TEAM_A]: [],
      [TEAM_B]: [],
    });
  });

  it('sums three dishes into one Signature verdict', () => {
    const state = playThree([
      { [TEAM_A]: three(1), [TEAM_B]: five(1) },
      { [TEAM_A]: five(2), [TEAM_B]: three(2) },
      { [TEAM_A]: five(3), [TEAM_B]: three(3) },
    ]);
    expect(state.phase).toBe('completed');
    // 3 + 7 + 7 against 7 + 3 + 3: the Signature's own arithmetic, and the only
    // number the Match is ever handed from this mechanic.
    expect(JSON.parse(String(state.resultJson))).toEqual({
      winnerTeamId: TEAM_A,
      tie: false,
      totals: { [TEAM_A]: 17, [TEAM_B]: 13 },
    });
  });

  it('reports an equal total as a real tie rather than playing a fourth dish', () => {
    const state = playThree([
      { [TEAM_A]: three(1), [TEAM_B]: three(1) },
      { [TEAM_A]: five(2), [TEAM_B]: five(2) },
      { [TEAM_A]: three(3), [TEAM_B]: three(3) },
    ]);
    expect(JSON.parse(String(state.resultJson))).toEqual({
      winnerTeamId: null,
      tie: true,
      totals: { [TEAM_A]: 13, [TEAM_B]: 13 },
    });
  });

  it('refuses to advance before the dish has been revealed', () => {
    const state = activate(launchState(participants));
    expect(() =>
      send(state, 'advance-la-tahriqha', participants, undefined),
    ).toThrow('before moving on');
  });
});

describe('لا تحرقها projection', () => {
  const participants = players(2);
  const project = (state: GameplayModeState, actor?: unknown) =>
    actor
      ? LA_TAHRIQHA_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
          state,
          actor as never,
        )
      : LA_TAHRIQHA_GAMEPLAY_PLUGIN.projectRuntimeState(state);

  it('never projects which ingredients are correct while the dish is live', () => {
    const state = activate(launchState(participants));
    const shared = project(state);
    expect(JSON.stringify(shared)).not.toContain('correct');
    const cards = (
      JSON.parse(String(shared.currentDishJson)) as {
        ingredients: Array<Record<string, unknown>>;
      }
    ).ingredients;
    expect(cards).toHaveLength(8);
    for (const card of cards) {
      expect(Object.keys(card).sort()).toEqual(['label', 'localId']);
    }
  });

  it('shows the opponent that a team is still choosing, and nothing else', () => {
    let state = activate(launchState(participants));
    state = pick(state, participants, TEAM_A, ['d1-c1', 'd1-c2', 'd1-c3']);
    const opponent = project(state, {
      controller: false,
      participantId: 'team-b-p1',
      teamId: TEAM_B,
    });
    const status = JSON.parse(String(opponent.teamStatusJson)) as Record<
      string,
      { locked: boolean; committedCount: number | null }
    >;
    expect(status[TEAM_A]).toEqual({ locked: false, committedCount: null });
    expect(JSON.parse(String(opponent.ownSelectedJson))).toEqual([]);
    for (const chosen of ['d1-c1', 'd1-c2', 'd1-c3']) {
      expect(beyondTheDish(opponent)).not.toContain(chosen);
    }
  });

  it('releases the committed count — and only the count — once a team commits', () => {
    let state = activate(launchState(participants));
    state = pick(state, participants, TEAM_A, [
      'd1-c1',
      'd1-c2',
      'd1-c3',
      'd1-c4',
    ]);
    state = lock(state, participants, TEAM_A);
    const opponent = project(state, {
      controller: false,
      participantId: 'team-b-p1',
      teamId: TEAM_B,
    });
    const status = JSON.parse(String(opponent.teamStatusJson)) as Record<
      string,
      { locked: boolean; committedCount: number | null }
    >;
    expect(status[TEAM_A]).toEqual({ locked: true, committedCount: 4 });
    for (const chosen of ['d1-c1', 'd1-c2', 'd1-c3', 'd1-c4']) {
      expect(beyondTheDish(opponent)).not.toContain(chosen);
    }
  });

  it('shows a teammate their own captain’s live selections', () => {
    let state = activate(launchState(participants));
    state = pick(state, participants, TEAM_A, ['d1-c1', 'd1-c2']);
    const teammate = project(state, {
      controller: false,
      participantId: 'team-a-p2',
      teamId: TEAM_A,
    });
    expect(JSON.parse(String(teammate.ownSelectedJson))).toEqual([
      'd1-c1',
      'd1-c2',
    ]);
    expect(teammate.isDishCaptain).toBe(false);
    const captain = project(state, {
      controller: false,
      participantId: 'team-a-p1',
      teamId: TEAM_A,
    });
    expect(captain.isDishCaptain).toBe(true);
  });

  it('names both dish captains publicly', () => {
    const shared = project(activate(launchState(participants)));
    expect(JSON.parse(String(shared.captainParticipantIdsJson))).toEqual({
      [TEAM_A]: 'team-a-p1',
      [TEAM_B]: 'team-b-p1',
    });
  });

  it('releases the whole proof at the reveal', () => {
    const participantsOfOne = players(1);
    let state = activate(launchState(participantsOfOne));
    state = pick(state, participantsOfOne, TEAM_A, [
      'd1-c1',
      'd1-c2',
      'd1-c3',
      'd1-x1',
    ]);
    state = pick(state, participantsOfOne, TEAM_B, [
      'd1-c1',
      'd1-c2',
      'd1-c3',
      'd1-c4',
      'd1-c5',
    ]);
    state = lock(state, participantsOfOne, TEAM_A);
    state = lock(state, participantsOfOne, TEAM_B);
    const reveal = JSON.parse(
      String(project(state).revealJson),
    ) as LaTahriqhaDishResult;
    expect(reveal.correctIngredientIds.sort()).toEqual([
      'd1-c1',
      'd1-c2',
      'd1-c3',
      'd1-c4',
      'd1-c5',
    ]);
    expect(
      reveal.teams.find((team) => team.teamId === TEAM_A)!.wrongIds,
    ).toEqual(['d1-x1']);
    expect(reveal.teams.find((team) => team.teamId === TEAM_B)!.perfect).toBe(
      true,
    );
    expect(reveal.totalsAfter).toEqual({ [TEAM_A]: 0, [TEAM_B]: 7 });
  });
});

describe('لا تحرقها content spend', () => {
  const participants = players(1);

  it('spends only the dishes that were actually put on screen', () => {
    const spent = (state: GameplayModeState) =>
      LA_TAHRIQHA_GAMEPLAY_PLUGIN.presentedContentItemIds!({
        runtimeState: state,
        roundState: {},
        orderedContentItemIds: ['item-1', 'item-2', 'item-3'],
      });
    const prepared = launchState(participants);
    expect(spent(prepared)).toEqual([]);
    let state = activate(prepared);
    expect(spent(state)).toEqual(['item-1']);
    state = pick(state, participants, TEAM_A, ['d1-c1', 'd1-c2', 'd1-c3']);
    state = pick(state, participants, TEAM_B, ['d1-c1', 'd1-c2', 'd1-c3']);
    state = lock(state, participants, TEAM_A);
    state = lock(state, participants, TEAM_B);
    // Revealed: dish one is spent and dish two has not been shown.
    expect(spent(state)).toEqual(['item-1']);
    state = send(state, 'advance-la-tahriqha', participants, undefined);
    expect(spent(state)).toEqual(['item-1']);
    expect(spent(activate(state))).toEqual(['item-1', 'item-2']);
  });
});
