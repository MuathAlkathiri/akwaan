import {
  COMBO_ANSWER_ACTION,
  COMBO_GAMEPLAY_PLUGIN,
  COMBO_QUESTION_SECONDS,
  ComboPlannedQuestion,
  comboActiveTeamId,
} from './combo-gameplay.plugin';
import { GameplayModeState } from './gameplay-mode.plugin';
import {
  assignNextTeamActionOrHold,
  buildTeamRotations,
  createTeamActionAssignmentState,
  parseTeamActionAssignments,
  reassignUnavailableActions,
  serializeTeamActionAssignments,
} from './team-action-assignment';

/**
 * الكومبو under the global captain (approved 2026-11-15).
 *
 * One phone holds each question — the lobby captain while connected,
 * otherwise the full roster in turn, once per question — and that same phone
 * owns the تثبيت / كمل decision after it; the rotation moves only when the next
 * question opens. كسر الكومبو stays open to any connected opponent. Stages,
 * scoring and push-your-luck are untouched.
 */
const NOW = new Date('2026-08-18T00:00:00.000Z');
const A = 'team-a';
const B = 'team-b';
const ROSTER = [
  { participantId: 'a1', teamId: A, connected: true },
  { participantId: 'a2', teamId: A, connected: true },
  { participantId: 'a3', teamId: A, connected: true },
  { participantId: 'b1', teamId: B, connected: true },
  { participantId: 'b2', teamId: B, connected: true },
];
const question = (run: number, stage: 1 | 2 | 3 | 4): ComboPlannedQuestion => ({
  contentItemId: `item-${run}-${stage}`,
  scopeId: `scope-${stage}`,
  stage,
  prompt: { ar: `سؤال ${stage}` },
  acceptedAnswers: [`answer-${run}-${stage}`],
});

function runtime(captains: Record<string, string> = {}): GameplayModeState {
  const opened = assignNextTeamActionOrHold(
    createTeamActionAssignmentState(
      buildTeamRotations({
        teams: [A, B],
        participants: ROSTER,
        randomIndex: () => 0,
        captains,
      }),
    ),
    { teamId: A, action: COMBO_ANSWER_ACTION, participants: ROSTER },
  );
  return COMBO_GAMEPLAY_PLUGIN.validateRuntimeState({
    teamIdsJson: JSON.stringify([A, B]),
    questionPlanJson: JSON.stringify(
      [0, 1].map((run) =>
        [1, 2, 3, 4].map((stage) => question(run, stage as 1 | 2 | 3 | 4)),
      ),
    ),
    runResultsJson: '[]',
    chargesJson: JSON.stringify({ [A]: 'available', [B]: 'available' }),
    runIndex: 0,
    questionIndex: 0,
    unbankedPoints: 0,
    phase: 'question',
    forcedQuestion: false,
    armedBreakByTeamId: null,
    deadlineAt: new Date(
      NOW.getTime() + COMBO_QUESTION_SECONDS * 1000,
    ).toISOString(),
    teamActionJson: serializeTeamActionAssignments(opened.state),
  });
}

const send = (
  state: GameplayModeState,
  type: string,
  submitter: string,
  payload: Record<string, unknown> = {},
  roster = ROSTER,
  now = NOW,
) =>
  COMBO_GAMEPLAY_PLUGIN.handleCommand(
    {
      sessionId: 's',
      runtimeId: 'r',
      now,
      submitterParticipantId: submitter,
      eligibleParticipants: roster,
    } as never,
    {
      type,
      payload: payload as never,
      runtimeState: state,
      roundState: {
        runIndex: state.runIndex,
        questionIndex: state.questionIndex,
        phase: state.phase,
      },
    },
  ).runtimeState;

const holder = (state: GameplayModeState) =>
  parseTeamActionAssignments(state.teamActionJson).assignments.find(
    (assignment) => assignment.action === COMBO_ANSWER_ACTION,
  );
const rightAnswer = (state: GameplayModeState) =>
  `answer-${state.runIndex}-${Number(state.questionIndex) + 1}`;
const answer = (state: GameplayModeState, who: string, right = true) =>
  send(state, 'submit-combo-answer', who, {
    answer: right ? rightAnswer(state) : 'خطأ',
  });

describe('الكومبو — the question holder', () => {
  it('lets only the holder answer; a teammate is refused', () => {
    const state = runtime();
    expect(holder(state)).toMatchObject({ teamId: A, participantId: 'a1' });
    expect(() => answer(state, 'a2')).toThrow(
      expect.objectContaining({ code: 'TEAM_ACTION_WRONG_PARTICIPANT' }),
    );
    expect(answer(state, 'a1').phase).toBe('decision');
  });

  it('keeps the decision with whoever answered — no rotation in between', () => {
    const decided = answer(runtime(), 'a1');
    expect(holder(decided)).toMatchObject({ participantId: 'a1' });
    for (const command of ['cash-out-combo', 'continue-combo']) {
      expect(() => send(decided, command, 'a2')).toThrow(
        expect.objectContaining({ code: 'TEAM_ACTION_WRONG_PARTICIPANT' }),
      );
    }
    const banked = send(decided, 'cash-out-combo', 'a1');
    expect(banked.phase).toBe('run-complete');
  });

  it('rotates once per question over the whole roster, only when the next question opens', () => {
    let state = runtime();
    const holders: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const who = holder(state)!.participantId;
      holders.push(who);
      state = answer(state, who);
      if (state.phase === 'decision')
        state = send(state, 'continue-combo', who);
    }
    expect(holders).toEqual(['a1', 'a2', 'a3', 'a1']);
    // Q4 banks automatically; scoring is unchanged (four correct answers).
    expect(state.phase).toBe('run-complete');
    expect(JSON.parse(String(state.runResultsJson))[0]).toMatchObject({
      bankedPoints: 4,
      endedBy: 'final-question',
    });
    // Between Runs nobody holds a question.
    expect(holder(state)).toBeUndefined();
  });

  it('gives the captain every question of the team’s Run', () => {
    let state = runtime({ [A]: 'a3' });
    for (let index = 0; index < 3; index += 1) {
      expect(holder(state)!.participantId).toBe('a3');
      state = answer(state, 'a3');
      state = send(state, 'continue-combo', 'a3');
    }
    expect(holder(state)!.participantId).toBe('a3');
  });

  it('opens the next Run for the other team, rotating independently', () => {
    const lost = answer(runtime(), 'a1', false);
    expect(lost.phase).toBe('run-complete');
    const next = send(lost, 'advance-combo-run', 'a1');
    expect(comboActiveTeamId(next)).toBe(B);
    expect(holder(next)).toMatchObject({ teamId: B, participantId: 'b1' });
  });

  it('reassigns the decision if its holder disconnects, without changing the rules', () => {
    const decided = answer(runtime(), 'a1');
    const away = ROSTER.map((p) =>
      p.participantId === 'a1' ? { ...p, connected: false } : p,
    );
    const moved = reassignUnavailableActions(
      parseTeamActionAssignments(decided.teamActionJson),
      away,
    );
    const handed = moved.state.assignments.find(
      (a) => a.action === COMBO_ANSWER_ACTION,
    )!;
    expect(handed.participantId).toBe('a2');
    const state = {
      ...decided,
      teamActionJson: serializeTeamActionAssignments(moved.state),
    };
    // The stand-in decides; the reconnected phone's old sequence is refused.
    expect(() =>
      send(state, 'cash-out-combo', 'a1', {
        assignmentSequence: holder(decided)!.sequence,
      }),
    ).toThrow();
    expect(
      send(
        state,
        'cash-out-combo',
        'a2',
        { assignmentSequence: handed.sequence },
        away,
      ).phase,
    ).toBe('run-complete');
  });

  it('refuses a stale assignment sequence', () => {
    const state = runtime();
    expect(() =>
      send(state, 'submit-combo-answer', 'a1', {
        answer: rightAnswer(state),
        assignmentSequence: holder(state)!.sequence - 1,
      }),
    ).toThrow(
      expect.objectContaining({ code: 'TEAM_ACTION_STALE_ASSIGNMENT' }),
    );
  });

  it('keeps كسر الكومبو open to any connected opponent, and secret', () => {
    const state = runtime({ [B]: 'b1' });
    // Not the captain, not a holder: still allowed.
    const armed = send(state, 'arm-combo-break', 'b2');
    expect(armed.armedBreakByTeamId).toBe(B);
    // The target team and the room learn nothing until the reveal.
    const shared = COMBO_GAMEPLAY_PLUGIN.projectRuntimeState(armed);
    expect(JSON.stringify(shared)).not.toContain('comboBreakRevealed');
    const target = COMBO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(armed, {
      controller: false,
      participantId: 'a1',
      teamId: A,
    });
    expect(target.ownComboBreakArmed).toBeUndefined();
    // One charge.
    expect(() => send(armed, 'arm-combo-break', 'b1')).toThrow();
  });

  it('keeps the forced continuation and its holder after a reveal', () => {
    const armed = send(runtime(), 'arm-combo-break', 'b2');
    const revealed = answer(armed, 'a1');
    expect(revealed.phase).toBe('break-reveal');
    expect(() => send(revealed, 'cash-out-combo', 'a1')).toThrow();
    const forced = send(revealed, 'continue-combo', 'a1');
    expect(forced.forcedQuestion).toBe(true);
    // The forced question opens a new question, so the rotation moves.
    expect(holder(forced)!.participantId).toBe('a2');
  });

  it('shows whose phone it is, and only the holder that it is theirs', () => {
    const state = runtime({ [A]: 'a2' });
    expect(
      COMBO_GAMEPLAY_PLUGIN.projectRuntimeState(state).assignedParticipantId,
    ).toBe('a2');
    const as = (participantId: string, teamId: string) =>
      COMBO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(state, {
        controller: false,
        participantId,
        teamId,
      });
    expect(as('a2', A)).toMatchObject({
      isAssignedActor: true,
      ownAssignmentSequence: holder(state)!.sequence,
    });
    expect(as('a1', A).isAssignedActor).toBe(false);
    expect(as('b1', B)).toMatchObject({
      isAssignedActor: false,
      canArmComboBreak: true,
    });
  });

  it('accepts the holder’s sequence through every command’s own payload validation', () => {
    // Found on the real stack: Cash Out / Continue validated "no payload", so a
    // phone sending its assignment was refused on every decision.
    for (const type of ['cash-out-combo', 'continue-combo']) {
      const validate = COMBO_GAMEPLAY_PLUGIN.command(type)!.validatePayload;
      expect(validate({ assignmentSequence: 4 })).toEqual({
        assignmentSequence: 4,
      });
      expect(validate({})).toEqual({});
      expect(() => validate({ assignmentSequence: 'x' })).toThrow();
      expect(() => validate({ other: 1 })).toThrow();
    }
    expect(
      COMBO_GAMEPLAY_PLUGIN.command('submit-combo-answer')!.validatePayload({
        answer: 'x',
        assignmentSequence: 4,
      }),
    ).toMatchObject({ assignmentSequence: 4 });
    // The break belongs to no assignment and still takes nothing.
    expect(() =>
      COMBO_GAMEPLAY_PLUGIN.command('arm-combo-break')!.validatePayload({
        assignmentSequence: 4,
      }),
    ).toThrow();
  });

  it('keeps the team-wide rule for a Run started before assignment', () => {
    const legacy = { ...runtime() };
    delete legacy.teamActionJson;
    expect(answer(legacy, 'a2').phase).toBe('decision');
    expect(
      COMBO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(legacy, {
        controller: false,
        participantId: 'a3',
        teamId: A,
      }).isAssignedActor,
    ).toBe(true);
  });
});
