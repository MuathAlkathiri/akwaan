import {
  COMBO_GAMEPLAY_PLUGIN,
  COMBO_QUESTION_SECONDS,
  ComboPlannedQuestion,
  ComboRunResult,
  comboActiveTeamId,
  comboResult,
} from './combo-gameplay.plugin';
import { GameplayModeState } from './gameplay-mode.plugin';

/**
 * "الكومبو" — the decision, not the trivia.
 *
 * The mechanic only works if stopping and continuing are both genuinely
 * attractive, so these tests are written around the balance: what it is worth,
 * when it can be secured, and every way it can be lost. The opponent's
 * كسر الكومبو is covered twice over — once for what it does, and once for what
 * the target is allowed to know about it.
 */

const NOW = new Date('2026-08-18T00:00:00.000Z');
const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

const question = (run: number, stage: 1 | 2 | 3 | 4): ComboPlannedQuestion => ({
  contentItemId: `item-${run}-${stage}`,
  scopeId: `scope-${stage}`,
  stage,
  prompt: { ar: `سؤال ${stage}` },
  acceptedAnswers: [`answer-${run}-${stage}`],
});

const plan = () => [
  [1, 2, 3, 4].map((stage) => question(0, stage as 1 | 2 | 3 | 4)),
  [1, 2, 3, 4].map((stage) => question(1, stage as 1 | 2 | 3 | 4)),
];

function runtime(
  overrides: Partial<GameplayModeState> = {},
): GameplayModeState {
  return COMBO_GAMEPLAY_PLUGIN.validateRuntimeState({
    teamIdsJson: JSON.stringify([TEAM_A, TEAM_B]),
    questionPlanJson: JSON.stringify(plan()),
    runResultsJson: JSON.stringify([]),
    chargesJson: JSON.stringify({
      [TEAM_A]: 'available',
      [TEAM_B]: 'available',
    }),
    runIndex: 0,
    questionIndex: 0,
    unbankedPoints: 0,
    phase: 'question',
    forcedQuestion: false,
    armedBreakByTeamId: null,
    deadlineAt: new Date(
      NOW.getTime() + COMBO_QUESTION_SECONDS * 1000,
    ).toISOString(),
    ...overrides,
  });
}

const participants = [
  { participantId: 'p-a', teamId: TEAM_A, connected: true },
  { participantId: 'p-b', teamId: TEAM_B, connected: true },
];

function send(
  state: GameplayModeState,
  type: string,
  options: {
    answer?: string;
    submitterParticipantId?: string;
    now?: Date;
  } = {},
) {
  return COMBO_GAMEPLAY_PLUGIN.handleCommand(
    {
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      now: options.now ?? NOW,
      submitterParticipantId: options.submitterParticipantId ?? 'p-a',
      eligibleParticipants: participants,
    } as never,
    {
      type,
      payload: options.answer === undefined ? {} : { answer: options.answer },
      runtimeState: state,
      roundState: { runIndex: 0, questionIndex: 0, phase: state.phase },
    },
  );
}

/** Answer the question at the current index correctly. */
const correct = (state: GameplayModeState, now = NOW) =>
  send(state, 'submit-combo-answer', {
    answer: `answer-${state.runIndex}-${
      (state.questionPlanJson &&
        JSON.parse(String(state.questionPlanJson))[Number(state.runIndex)][
          Number(state.questionIndex)
        ].stage) as number
    }`,
    now,
  }).runtimeState;

const wrong = (state: GameplayModeState, now = NOW) =>
  send(state, 'submit-combo-answer', { answer: 'nope', now }).runtimeState;

const resultsOf = (state: GameplayModeState): ComboRunResult[] =>
  JSON.parse(String(state.runResultsJson)) as ComboRunResult[];

describe('الكومبو — the cash out decision', () => {
  it('offers the decision after a correct first question', () => {
    const after = correct(runtime());

    expect(after.phase).toBe('decision');
    expect(after.unbankedPoints).toBe(1);
    // Nothing is banked yet — the point is still at risk.
    expect(resultsOf(after)).toHaveLength(0);
  });

  it('banks the balance and ends the run on تثبيت', () => {
    const after = send(correct(runtime()), 'cash-out-combo').runtimeState;

    const [result] = resultsOf(after);
    expect(result.bankedPoints).toBe(1);
    expect(result.endedBy).toBe('cash-out');
    // Handed over to the other team.
    expect(comboActiveTeamId(after)).toBe(TEAM_B);
  });

  it('keeps the balance unbanked and opens the next question on كمل', () => {
    const after = send(correct(runtime()), 'continue-combo').runtimeState;

    expect(after.phase).toBe('question');
    expect(after.questionIndex).toBe(1);
    expect(after.unbankedPoints).toBe(1);
    expect(resultsOf(after)).toHaveLength(0);
    // A fresh clock, not the remainder of the previous one.
    expect(Date.parse(String(after.deadlineAt))).toBe(
      NOW.getTime() + COMBO_QUESTION_SECONDS * 1000,
    );
  });

  it('refuses to bank when there is no decision open', () => {
    expect(() => send(runtime(), 'cash-out-combo')).toThrow(
      /cannot be banked now/,
    );
  });
});

describe('الكومبو — losing the run', () => {
  it('loses the entire unbanked balance on a wrong answer', () => {
    // Two banked-in-waiting points, then a miss.
    let state = correct(runtime());
    state = send(state, 'continue-combo').runtimeState;
    state = correct(state);
    state = send(state, 'continue-combo').runtimeState;
    expect(state.unbankedPoints).toBe(2);

    const after = wrong(state);

    const [result] = resultsOf(after);
    expect(result.bankedPoints).toBe(0);
    expect(result.endedBy).toBe('combo-break');
  });

  it('treats an expired clock exactly like a wrong answer', () => {
    const state = send(correct(runtime()), 'continue-combo').runtimeState;
    const late = new Date(NOW.getTime() + COMBO_QUESTION_SECONDS * 1000 + 1);

    const after = send(state, 'expire-combo-question', {
      now: late,
    }).runtimeState;

    const [result] = resultsOf(after);
    expect(result.bankedPoints).toBe(0);
    expect(result.endedBy).toBe('timeout');
  });

  it('refuses to expire a clock that has not run out', () => {
    expect(() => send(runtime(), 'expire-combo-question')).toThrow(
      /has not expired/,
    );
  });
});

describe('الكومبو — the final question', () => {
  /** Walk to the last question with everything still at risk. */
  const toFinalQuestion = () => {
    let state = runtime();
    for (let index = 0; index < 3; index += 1) {
      state = correct(state);
      state = send(state, 'continue-combo').runtimeState;
    }
    return state;
  };

  it('banks automatically when the last question is answered', () => {
    const state = toFinalQuestion();
    expect(state.questionIndex).toBe(3);

    const after = correct(state);

    const [result] = resultsOf(after);
    expect(result.bankedPoints).toBe(4);
    expect(result.endedBy).toBe('final-question');
    // No decision is offered — there is nothing left to gamble on.
    expect(after.phase).not.toBe('decision');
  });

  it('loses everything when the last question is missed', () => {
    const after = wrong(toFinalQuestion());

    expect(resultsOf(after)[0].bankedPoints).toBe(0);
  });
});

describe('الكومبو — two runs, then the challenge', () => {
  it('hands the run to the other team and then completes', () => {
    const first = send(correct(runtime()), 'cash-out-combo').runtimeState;
    expect(first.phase).toBe('run-complete');
    expect(comboActiveTeamId(first)).toBe(TEAM_B);

    const opened = send(first, 'advance-combo-run').runtimeState;
    const second = send(correct(opened), 'cash-out-combo').runtimeState;

    expect(second.phase).toBe('completed');
    expect(resultsOf(second)).toHaveLength(2);
  });

  it('names the team that banked more as the winner, without scoring it', () => {
    // A banks 2, B banks 1.
    let state = correct(runtime());
    state = send(state, 'continue-combo').runtimeState;
    state = correct(state);
    state = send(state, 'cash-out-combo').runtimeState;
    state = send(state, 'advance-combo-run').runtimeState;
    state = send(correct(state), 'cash-out-combo').runtimeState;

    const result = comboResult(state)!;
    expect(result.points).toEqual({ [TEAM_A]: 2, [TEAM_B]: 1 });
    expect(result.winnerTeamId).toBe(TEAM_A);
    expect(result.tie).toBe(false);
  });

  it('reports a draw as a tie rather than inventing a tie-breaker', () => {
    const first = send(correct(runtime()), 'cash-out-combo').runtimeState;
    const opened = send(first, 'advance-combo-run').runtimeState;
    const second = send(correct(opened), 'cash-out-combo').runtimeState;

    const result = comboResult(second)!;
    expect(result.points).toEqual({ [TEAM_A]: 1, [TEAM_B]: 1 });
    expect(result.winnerTeamId).toBeNull();
    expect(result.tie).toBe(true);
  });
});

describe('كسر الكومبو — the opponent ability', () => {
  const arm = (state: GameplayModeState) =>
    send(state, 'arm-combo-break', { submitterParticipantId: 'p-b' })
      .runtimeState;

  it('can only be armed by the team that is not playing', () => {
    expect(() =>
      send(runtime(), 'arm-combo-break', { submitterParticipantId: 'p-a' }),
    ).toThrow(/against the other team/);
  });

  it('spends the charge and can only be used once per challenge', () => {
    const armed = arm(runtime());
    expect(JSON.parse(String(armed.chargesJson))[TEAM_B]).toBe('spent');

    // Survive the armed question, take the forced one, then open a fresh
    // question so the charge check is the rule actually being exercised.
    let state = correct(armed);
    state = send(state, 'continue-combo').runtimeState;
    state = correct(state);
    expect(state.phase).toBe('decision');
    state = send(state, 'continue-combo').runtimeState;
    expect(state.phase).toBe('question');

    expect(() =>
      send(state, 'arm-combo-break', { submitterParticipantId: 'p-b' }),
    ).toThrow(/already been used/);
  });

  it('cannot be armed against the final question', () => {
    let state = runtime();
    for (let index = 0; index < 3; index += 1) {
      state = correct(state);
      state = send(state, 'continue-combo').runtimeState;
    }
    expect(state.questionIndex).toBe(3);

    // Nothing left to force, so there is nothing to arm.
    expect(() =>
      send(state, 'arm-combo-break', { submitterParticipantId: 'p-b' }),
    ).toThrow(/final question/);
  });

  it('cannot be armed outside a live question', () => {
    const atDecision = correct(runtime());

    expect(() =>
      send(atDecision, 'arm-combo-break', { submitterParticipantId: 'p-b' }),
    ).toThrow(/needs a live question/);
  });

  it('behaves as an ordinary break when the armed question is missed', () => {
    const after = wrong(arm(runtime()));

    const [result] = resultsOf(after);
    expect(result.bankedPoints).toBe(0);
    expect(result.endedBy).toBe('combo-break');
    // The charge stays spent — it was consumed by the attempt.
    expect(JSON.parse(String(after.chargesJson))[TEAM_B]).toBe('spent');
  });

  it('reveals itself and removes the right to stop when survived', () => {
    const after = correct(arm(runtime()));

    expect(after.phase).toBe('break-reveal');
    expect(after.unbankedPoints).toBe(1);
    // تثبيت is refused at this point; that is the entire ability.
    expect(() => send(after, 'cash-out-combo')).toThrow(/cannot be banked now/);
  });

  it('forces the next question with a completely fresh clock', () => {
    const revealed = correct(arm(runtime()));
    const later = new Date(NOW.getTime() + 10_000);

    const forced = send(revealed, 'continue-combo', {
      now: later,
    }).runtimeState;

    expect(forced.phase).toBe('question');
    expect(forced.forcedQuestion).toBe(true);
    expect(Date.parse(String(forced.deadlineAt))).toBe(
      later.getTime() + COMBO_QUESTION_SECONDS * 1000,
    );
  });

  it('loses the whole balance when the forced question is missed', () => {
    // Bank two at risk first, so the loss is unambiguous.
    let state = correct(runtime());
    state = send(state, 'continue-combo').runtimeState;
    state = arm(state);
    state = correct(state);
    state = send(state, 'continue-combo').runtimeState;
    // Two ordinary points so far — the survival bonus is paid by the forced
    // question, not by the question the charge was armed against.
    expect(state.unbankedPoints).toBe(2);

    const after = wrong(state);

    expect(resultsOf(after)[0].bankedPoints).toBe(0);
    expect(resultsOf(after)[0].brokenByTeamId).toBe(TEAM_B);
  });

  it('loses the whole balance when the forced question times out', () => {
    let state = arm(runtime());
    state = correct(state);
    state = send(state, 'continue-combo').runtimeState;
    const late = new Date(NOW.getTime() + COMBO_QUESTION_SECONDS * 1000 + 1);

    const after = send(state, 'expire-combo-question', {
      now: late,
    }).runtimeState;

    expect(resultsOf(after)[0].bankedPoints).toBe(0);
    expect(resultsOf(after)[0].endedBy).toBe('timeout');
  });

  it('pays a survived forced question +2 in total, never +3', () => {
    let state = arm(runtime());
    state = correct(state);
    expect(state.unbankedPoints).toBe(1); // the armed question itself

    state = send(state, 'continue-combo').runtimeState;
    state = correct(state);

    // +1 for the answer and +1 for surviving. Not +1 and +2.
    expect(state.unbankedPoints).toBe(3);
    expect(state.phase).toBe('decision');
  });

  it('CANONICAL — armed before Q3, survives, forced Q4 pays exactly 2', () => {
    // Q1, Q2 banked at risk.
    let state = correct(runtime());
    state = send(state, 'continue-combo').runtimeState;
    state = correct(state);
    state = send(state, 'continue-combo').runtimeState;
    expect(state.questionIndex).toBe(2);
    const beforeQ3 = Number(state.unbankedPoints);
    expect(beforeQ3).toBe(2);

    // Opponent arms against Q3, team survives it.
    state = send(state, 'arm-combo-break', {
      submitterParticipantId: 'p-b',
    }).runtimeState;
    state = correct(state);
    expect(state.phase).toBe('break-reveal');
    expect(Number(state.unbankedPoints)).toBe(beforeQ3 + 1);

    // Forced into Q4 and answers it.
    state = send(state, 'continue-combo').runtimeState;
    expect(state.forcedQuestion).toBe(true);
    const beforeQ4 = Number(state.unbankedPoints);
    state = correct(state);

    // Forced Q4 contributed exactly 2 — the answer plus survival.
    const [result] = resultsOf(state);
    expect(result.bankedPoints - beforeQ4).toBe(2);
    expect(result.bankedPoints).toBe(5);
    // And it banked automatically rather than offering a decision.
    expect(result.endedBy).toBe('final-question');
  });

  it('CANONICAL FAILURE — armed before Q3, survives, forced Q4 times out', () => {
    let state = correct(runtime());
    state = send(state, 'continue-combo').runtimeState;
    state = correct(state);
    state = send(state, 'continue-combo').runtimeState;
    state = send(state, 'arm-combo-break', {
      submitterParticipantId: 'p-b',
    }).runtimeState;
    state = correct(state);
    state = send(state, 'continue-combo').runtimeState;
    const late = new Date(NOW.getTime() + COMBO_QUESTION_SECONDS * 1000 + 1);

    const after = send(state, 'expire-combo-question', {
      now: late,
    }).runtimeState;

    // Everything, including the points earned before the reveal.
    expect(resultsOf(after)[0].bankedPoints).toBe(0);
  });
});

describe('كسر الكومبو — secrecy', () => {
  const actor = (teamId: string | undefined, controller = false) => ({
    controller,
    participantId: teamId === TEAM_A ? 'p-a' : 'p-b',
    teamId,
  });

  /** State with Team B's charge armed against Team A's live first question. */
  const armed = () =>
    send(runtime(), 'arm-combo-break', { submitterParticipantId: 'p-b' })
      .runtimeState;

  it('holds the armed charge server-side', () => {
    const state = armed();

    expect(state.armedBreakByTeamId).toBe(TEAM_B);
  });

  it('tells the arming team, privately, that its charge is live', () => {
    const projected = COMBO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
      armed(),
      actor(TEAM_B) as never,
    );

    expect(projected.ownComboBreakArmed).toBe(true);
  });

  it('never hints to the target that a charge is armed', () => {
    const projected = COMBO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
      armed(),
      actor(TEAM_A) as never,
    );

    // Omitted, not falsified — there is no key at all for a client to notice.
    expect('ownComboBreakArmed' in projected).toBe(false);
    expect('armedBreakByTeamId' in projected).toBe(false);
    expect('comboBreakRevealedByTeamId' in projected).toBe(false);
    expect(JSON.stringify(projected)).not.toContain('armed');
  });

  it('keeps the secret out of the shared screen projection', () => {
    const shared = COMBO_GAMEPLAY_PLUGIN.projectRuntimeState(armed());

    expect('armedBreakByTeamId' in shared).toBe(false);
    expect('ownComboBreakArmed' in shared).toBe(false);
    expect('comboBreakRevealedByTeamId' in shared).toBe(false);
    expect(JSON.stringify(shared)).not.toContain('armed');
  });

  it('keeps the secret from the controller before the reveal', () => {
    const projected = COMBO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
      armed(),
      actor(undefined, true) as never,
    );

    expect('ownComboBreakArmed' in projected).toBe(false);
    expect(JSON.stringify(projected)).not.toContain('armed');
  });

  it('reveals to everyone only once the target survives the question', () => {
    const revealed = correct(armed());
    expect(revealed.phase).toBe('break-reveal');

    for (const viewer of [actor(TEAM_A), actor(TEAM_B)]) {
      const projected = COMBO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
        revealed,
        viewer as never,
      );
      expect(projected.comboBreakRevealedByTeamId).toBe(TEAM_B);
    }
    expect(
      COMBO_GAMEPLAY_PLUGIN.projectRuntimeState(revealed)
        .comboBreakRevealedByTeamId,
    ).toBe(TEAM_B);
  });

  it('never projects the authored answers to anyone', () => {
    const state = runtime();
    const views = [
      COMBO_GAMEPLAY_PLUGIN.projectRuntimeState(state),
      COMBO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
        state,
        actor(TEAM_A) as never,
      ),
      COMBO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
        state,
        actor(undefined, true) as never,
      ),
    ];

    for (const view of views) {
      expect(JSON.stringify(view)).not.toContain('answer-0-1');
      expect('acceptedAnswers' in view).toBe(false);
      expect('questionPlanJson' in view).toBe(false);
    }
  });

  it('offers the ability only to the team that may actually use it', () => {
    const state = runtime();

    // The idle team may arm; the playing team may not.
    expect(
      COMBO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
        state,
        actor(TEAM_B) as never,
      ).canArmComboBreak,
    ).toBe(true);
    expect(
      COMBO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
        state,
        actor(TEAM_A) as never,
      ).canArmComboBreak,
    ).toBe(false);

    // And not once it has been spent.
    expect(
      COMBO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
        armed(),
        actor(TEAM_B) as never,
      ).canArmComboBreak,
    ).toBe(false);
  });
});

describe('الكومبو — duplicate delivery', () => {
  /**
   * The session layer already refuses a replayed command id, so these prove the
   * reducer is not a second place that could double-apply if it ever saw one.
   */
  it('cannot score the same answer twice', () => {
    const state = runtime();
    const first = correct(state);

    // The same command against the state it already produced is not a question.
    expect(() => correct(first)).toThrow(/No Combo question is open/);
    expect(first.unbankedPoints).toBe(1);
  });

  it('cannot bank the same run twice', () => {
    const banked = send(correct(runtime()), 'cash-out-combo').runtimeState;

    expect(() => send(banked, 'cash-out-combo')).toThrow(
      /cannot be banked now/,
    );
    expect(resultsOf(banked)).toHaveLength(1);
  });

  it('cannot arm the same charge twice', () => {
    const armed = send(runtime(), 'arm-combo-break', {
      submitterParticipantId: 'p-b',
    }).runtimeState;

    expect(() =>
      send(armed, 'arm-combo-break', { submitterParticipantId: 'p-b' }),
    ).toThrow(/already/);
  });

  it('cannot continue twice from one decision', () => {
    const opened = send(correct(runtime()), 'continue-combo').runtimeState;

    expect(() => send(opened, 'continue-combo')).toThrow(
      /no question to continue to/,
    );
  });
});

describe('الكومبو — the hand-over cannot strand the challenge', () => {
  /**
   * `run-complete` is the one phase a host would normally leave by hand. If it
   * were only leavable by hand, a controller who dropped there would freeze the
   * challenge for everyone — so the phase carries a server deadline like any
   * other, and these prove it.
   */
  const atHandover = () =>
    send(correct(runtime()), 'cash-out-combo').runtimeState;

  it('arms a clock on the hand-over recap', () => {
    const handover = atHandover();

    expect(handover.phase).toBe('run-complete');
    expect(typeof handover.deadlineAt).toBe('string');
    expect(Date.parse(String(handover.deadlineAt))).toBeGreaterThan(
      NOW.getTime(),
    );
  });

  it('declares the recap phase to the deadline system', () => {
    // Batch 1's guarantee: authoritative state carrying a deadline is armed.
    // The reducer only arms phases the mechanic names, so this must include it.
    const declaration = COMBO_GAMEPLAY_PLUGIN.deadline;
    expect(declaration?.source).toBe('runtime-state');
    const phases =
      declaration?.source === 'runtime-state' ? declaration.activePhases : [];
    expect(phases).toContain('run-complete');
    expect(phases).toContain('question');
  });

  it('opens the next run from the server when the host never returns', () => {
    const handover = atHandover();
    const late = new Date(Date.parse(String(handover.deadlineAt)) + 1);

    const opened = send(handover, 'expire-combo-question', {
      now: late,
    }).runtimeState;

    expect(opened.phase).toBe('question');
    expect(comboActiveTeamId(opened)).toBe(TEAM_B);
    expect(opened.questionIndex).toBe(0);
    // A full clock for the incoming team, not the remainder of the recap.
    expect(Date.parse(String(opened.deadlineAt))).toBe(
      late.getTime() + COMBO_QUESTION_SECONDS * 1000,
    );
  });

  it('still lets the host advance the recap deliberately', () => {
    const opened = send(atHandover(), 'advance-combo-run').runtimeState;

    expect(opened.phase).toBe('question');
    expect(comboActiveTeamId(opened)).toBe(TEAM_B);
  });

  it('refuses to advance the recap before its clock elapses', () => {
    expect(() => send(atHandover(), 'expire-combo-question')).toThrow(
      /has not expired/,
    );
  });

  it('cannot advance the same recap twice', () => {
    const opened = send(atHandover(), 'advance-combo-run').runtimeState;

    expect(() => send(opened, 'advance-combo-run')).toThrow(
      /No finished Combo run is waiting/,
    );
  });

  it('leaves no clock armed once the challenge is over', () => {
    const first = send(atHandover(), 'advance-combo-run').runtimeState;
    const done = send(correct(first), 'cash-out-combo').runtimeState;

    expect(done.phase).toBe('completed');
    expect(done.deadlineAt).toBeNull();
  });
});
