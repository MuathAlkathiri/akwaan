import {
  ONE_CLUE_GAMEPLAY_PLUGIN,
  oneClueAnswerAction,
  validateOneClueItem,
} from './one-clue-gameplay.plugin';
import { GameplayModeState } from './gameplay-mode.plugin';
import {
  assignNextTeamAction,
  createTeamActionAssignmentState,
  serializeTeamActionAssignments,
} from './team-action-assignment';

const clues = [5, 4, 3, 2, 1].map((value, index) => ({
  order: index + 1,
  value,
  text: { ar: `دليل ${index + 1}` },
}));
const item = {
  id: 'item-1',
  prompt: { ar: 'من هو؟' },
  clues,
  acceptedAnswers: ['كريستيانو رونالدو', 'رونالدو'],
};

function initial() {
  const participants = [
    { participantId: 'a1', teamId: 'a', connected: true },
    { participantId: 'b1', teamId: 'b', connected: true },
  ];
  let assignments = createTeamActionAssignmentState([
    { teamId: 'a', order: ['a1'], cursor: 0 },
    { teamId: 'b', order: ['b1'], cursor: 0 },
  ]);
  for (const teamId of ['a', 'b']) {
    assignments = assignNextTeamAction(assignments, {
      teamId,
      action: oneClueAnswerAction(teamId),
      participants,
    }).state;
  }
  return {
    itemsJson: JSON.stringify([
      item,
      { ...item, id: 'item-2' },
      { ...item, id: 'item-3' },
    ]),
    teamIdsJson: '["a","b"]',
    currentItemIndex: 0,
    currentClueIndex: 0,
    phase: 'collecting',
    submissionsJson: '{}',
    lockedAnswersJson: '{}',
    eliminatedTeamIdsJson: '[]',
    resultsJson: '[]',
    teamActionJson: serializeTeamActionAssignments(assignments),
    deadlineAt: '2026-01-01T00:00:07.000Z',
  };
}

function submit(
  state: GameplayModeState,
  participantId: string,
  answer: string,
) {
  return ONE_CLUE_GAMEPLAY_PLUGIN.handleCommand!(
    {
      now: new Date('2026-01-01T00:00:05.000Z'),
      submitterParticipantId: participantId,
    } as never,
    {
      type: 'submit-one-clue-answer',
      payload: { answer },
      runtimeState: state,
      roundState: { phase: 'collecting', itemIndex: 0, clueIndex: 0 },
    },
  ).runtimeState;
}

function expire(state: GameplayModeState) {
  return ONE_CLUE_GAMEPLAY_PLUGIN.handleCommand!(
    { now: new Date('2026-01-01T00:00:08.000Z') } as never,
    {
      type: 'expire-one-clue-stage',
      payload: {},
      runtimeState: state,
      roundState: { phase: 'collecting', itemIndex: 0, clueIndex: 0 },
    },
  ).runtimeState;
}

describe('One Clue gameplay', () => {
  it('rejects malformed clue geometry and missing truth', () => {
    expect(() =>
      validateOneClueItem({ ...item, clues: clues.slice(0, 4) }),
    ).toThrow('five ordered clues');
    expect(() => validateOneClueItem({ ...item, acceptedAnswers: [] })).toThrow(
      'accepted answers',
    );
  });

  it('evaluates both same-stage answers together and awards the clue value', () => {
    let state = submit(initial(), 'a1', ' رونالدو ');
    expect(state.phase).toBe('collecting');
    state = submit(state, 'b1', 'إجابة خاطئة');
    const resolved = expire(state);
    const [result] = JSON.parse(String(resolved.resultsJson));
    expect(result.points).toEqual({ a: 5, b: 0 });
    expect(result.statuses).toEqual({ a: 'correct', b: 'wrong' });
    expect(resolved.phase).toBe('revealed');
  });

  it('eliminates a wrong team from only the item and advances the opponent', () => {
    const advanced = expire(submit(initial(), 'a1', 'خطأ'));
    expect(advanced.phase).toBe('collecting');
    expect(advanced.currentClueIndex).toBe(1);
    expect(JSON.parse(String(advanced.eliminatedTeamIdsJson))).toEqual(['a']);
  });

  it('never projects accepted answers, future clues, or opponent answer text', () => {
    const state = submit(initial(), 'a1', 'رونالدو');
    const projected = ONE_CLUE_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
      state,
      { kind: 'participant', participantId: 'b1', teamId: 'b' } as never,
    );
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('acceptedAnswers');
    expect(serialized).not.toContain('رونالدو');
    expect(serialized).not.toContain('دليل 2');
    expect(JSON.parse(String(projected.submissionStatusJson))).toEqual({
      a: true,
      b: false,
    });
  });
});
