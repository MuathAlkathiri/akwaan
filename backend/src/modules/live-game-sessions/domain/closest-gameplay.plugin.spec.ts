import {
  CLOSEST_GAMEPLAY_PLUGIN,
  closestAnswerAction,
  gradeClosestItem,
} from './closest-gameplay.plugin';
import {
  assignmentFor,
  assignNextTeamAction,
  createTeamActionAssignmentState,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
} from './team-action-assignment';

const item = { id: 'item-1', prompt: 'كم؟', correctValue: 20 };

describe('Closest gameplay', () => {
  it.each([
    [19, 22, 'a', false],
    [19, 21, null, true],
    [20, 20, null, true],
    [18, 18, null, true],
    [-21.5, -18.25, 'b', false],
  ])(
    'grades %s against %s by absolute distance only',
    (answerA, answerB, winner, tie) => {
      const result = gradeClosestItem({
        item,
        teamIds: ['a', 'b'],
        answers: { a: answerA, b: answerB },
        assignedParticipantIds: { a: 'a1', b: 'b1' },
        itemIndex: 0,
        resolutionReason: 'both-submitted',
        resolvedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(result.winnerTeamId).toBe(winner);
      expect(result.tie).toBe(tie);
    },
  );

  it('rejects malformed, NaN, and infinite estimates', () => {
    const validate = CLOSEST_GAMEPLAY_PLUGIN.command('submit-estimate')!
      .validatePayload;
    for (const value of ['20', Number.NaN, Infinity, -Infinity]) {
      expect(() => validate({ value } as never)).toThrow(
        'finite numeric estimate',
      );
    }
  });

  it('keeps truth and the opposing value out of pre-resolution projections', () => {
    let assignments = createTeamActionAssignmentState([
      { teamId: 'a', order: ['a1'], cursor: 0 },
      { teamId: 'b', order: ['b1'], cursor: 0 },
    ]);
    for (const [teamId, participantId] of [
      ['a', 'a1'],
      ['b', 'b1'],
    ] as const) {
      assignments = assignNextTeamAction(assignments, {
        teamId,
        action: closestAnswerAction(teamId),
        participants: [{ participantId, teamId, connected: true }],
      }).state;
    }
    const state = {
      itemsJson: JSON.stringify([item, { ...item, id: 'item-2' }, { ...item, id: 'item-3' }]),
      teamIdsJson: '["a","b"]',
      currentItemIndex: 0,
      phase: 'collecting',
      answersJson: '{"a":19}',
      resultsJson: '[]',
      teamActionJson: serializeTeamActionAssignments(assignments),
      deadlineAt: '2026-01-01T00:00:45.000Z',
    };
    const projected = CLOSEST_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
      state,
      { kind: 'participant', participantId: 'b1', teamId: 'b' } as never,
    );
    expect(JSON.stringify(projected)).not.toContain('correctValue');
    expect(projected.ownSubmittedValue).toBeUndefined();
    expect(JSON.stringify(projected)).not.toContain(':19');
    expect(JSON.parse(String(projected.submissionStatusJson))).toEqual({
      a: true,
      b: false,
    });
  });

  it('closes a submitted team action without losing its answerer from the result', () => {
    let assignments = createTeamActionAssignmentState([
      { teamId: 'a', order: ['a1', 'a2'], cursor: 0 },
      { teamId: 'b', order: ['b1', 'b2'], cursor: 0 },
    ]);
    for (const [teamId, participantId] of [
      ['a', 'a1'],
      ['b', 'b1'],
    ] as const) {
      assignments = assignNextTeamAction(assignments, {
        teamId,
        action: closestAnswerAction(teamId),
        participants: [
          { participantId, teamId, connected: true },
          { participantId: `${teamId}2`, teamId, connected: true },
        ],
      }).state;
    }
    const base = {
      itemsJson: JSON.stringify([
        item,
        { ...item, id: 'item-2' },
        { ...item, id: 'item-3' },
      ]),
      teamIdsJson: '["a","b"]',
      currentItemIndex: 0,
      phase: 'collecting',
      answersJson: '{}',
      resultsJson: '[]',
      teamActionJson: serializeTeamActionAssignments(assignments),
      deadlineAt: '2026-01-01T00:00:45.000Z',
    };
    const first = CLOSEST_GAMEPLAY_PLUGIN.handleCommand!({
      now: new Date('2026-01-01T00:00:10.000Z'),
      submitterParticipantId: 'a1',
    } as never, {
      type: 'submit-estimate',
      payload: { value: 19 },
      runtimeState: base,
      roundState: { phase: 'collecting', itemIndex: 0 },
    });
    const afterFirst = first.runtimeState;
    expect(
      assignmentFor(
        parseTeamActionAssignments(afterFirst.teamActionJson),
        closestAnswerAction('a'),
      ),
    ).toBeUndefined();

    const second = CLOSEST_GAMEPLAY_PLUGIN.handleCommand!({
      now: new Date('2026-01-01T00:00:20.000Z'),
      submitterParticipantId: 'b1',
    } as never, {
      type: 'submit-estimate',
      payload: { value: 22 },
      runtimeState: afterFirst,
      roundState: { phase: 'collecting', itemIndex: 0 },
    });
    expect(JSON.parse(String(second.runtimeState.resultsJson))[0]).toMatchObject({
      assignedParticipantIds: { a: 'a1', b: 'b1' },
    });
  });
});
