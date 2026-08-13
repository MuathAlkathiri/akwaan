import {
  assertTeamActionAuthorized,
  assignNextTeamAction,
  assignmentFor,
  buildTeamRotations,
  createTeamActionAssignmentState,
  EligibleParticipant,
  parseTeamActionAssignments,
  reassignUnavailableActions,
  serializeTeamActionAssignments,
} from './team-action-assignment';

/**
 * One authoritative participant per team action.
 *
 * These tests pin the two things the frontend must never be allowed to decide:
 * who holds the action, and whether a given phone may take it.
 */
describe('team action assignment', () => {
  const ACTION = 'top5.decision';
  const player = (
    participantId: string,
    teamId: string,
    connected = true,
  ): EligibleParticipant => ({ participantId, teamId, connected });

  const roster = (...players: EligibleParticipant[]): EligibleParticipant[] =>
    players;

  /** Rotations with a pinned starting cursor, so a test can be read. */
  const state = (
    participants: EligibleParticipant[],
    teams = ['team-a', 'team-b'],
    startAt = 0,
  ) =>
    createTeamActionAssignmentState(
      buildTeamRotations({
        teams,
        participants,
        randomIndex: () => startAt,
      }),
    );

  it('gives a one-player team every action', () => {
    const participants = roster(player('a1', 'team-a'), player('b1', 'team-b'));
    let working = state(participants);
    for (let turn = 0; turn < 4; turn += 1) {
      const result = assignNextTeamAction(working, {
        teamId: 'team-a',
        action: ACTION,
        participants,
      });
      working = result.state;
      expect(result.assignment.participantId).toBe('a1');
    }
  });

  it('alternates a two-player team and cycles a three-player team', () => {
    const participants = roster(
      player('a1', 'team-a'),
      player('a2', 'team-a'),
      player('b1', 'team-b'),
      player('b2', 'team-b'),
      player('b3', 'team-b'),
    );
    let working = state(participants);
    const picked: string[] = [];
    for (const teamId of [
      'team-a',
      'team-b',
      'team-a',
      'team-b',
      'team-a',
      'team-b',
    ]) {
      const result = assignNextTeamAction(working, {
        teamId,
        action: `${teamId}:${ACTION}`,
        participants,
      });
      working = result.state;
      picked.push(result.assignment.participantId);
    }
    expect(picked).toEqual(['a1', 'b1', 'a2', 'b2', 'a1', 'b3']);
  });

  it('randomises the starting position once and then persists it', () => {
    const participants = roster(
      player('a1', 'team-a'),
      player('a2', 'team-a'),
      player('b1', 'team-b'),
    );
    // A different roll starts the team somewhere else in the same fixed order.
    const first = assignNextTeamAction(state(participants, undefined, 1), {
      teamId: 'team-a',
      action: ACTION,
      participants,
    });
    expect(first.assignment.participantId).toBe('a2');

    // Round-tripping through storage is what a refresh does, and it changes
    // nothing: the order and the cursor are data, not a re-roll.
    const restored = parseTeamActionAssignments(
      serializeTeamActionAssignments(first.state),
    );
    expect(restored).toEqual(first.state);
    expect(assignmentFor(restored, ACTION)?.participantId).toBe('a2');
    const next = assignNextTeamAction(restored, {
      teamId: 'team-a',
      action: ACTION,
      participants,
    });
    expect(next.assignment.participantId).toBe('a1');
  });

  describe('authorisation', () => {
    const participants = roster(
      player('a1', 'team-a'),
      player('a2', 'team-a'),
      player('b1', 'team-b'),
    );
    const opened = assignNextTeamAction(state(participants), {
      teamId: 'team-a',
      action: ACTION,
      participants,
    });

    it('accepts only the assigned participant', () => {
      expect(
        assertTeamActionAuthorized(opened.state, {
          action: ACTION,
          teamId: 'team-a',
          participantId: 'a1',
          sequence: opened.assignment.sequence,
        }).participantId,
      ).toBe('a1');
    });

    it('refuses a teammate on the correct team', () => {
      expect(() =>
        assertTeamActionAuthorized(opened.state, {
          action: ACTION,
          teamId: 'team-a',
          participantId: 'a2',
        }),
      ).toThrow('assigned player');
    });

    it('refuses the opposing team', () => {
      expect(() =>
        assertTeamActionAuthorized(opened.state, {
          action: ACTION,
          teamId: 'team-b',
          participantId: 'b1',
        }),
      ).toThrow('other team');
    });

    it('refuses a decision taken against a superseded assignment', () => {
      // The phone submitted with the sequence it last saw; the server has since
      // moved on. Accepting it would apply an old intent to a new card.
      expect(() =>
        assertTeamActionAuthorized(opened.state, {
          action: ACTION,
          teamId: 'team-a',
          participantId: 'a1',
          sequence: opened.assignment.sequence - 1,
        }),
      ).toThrow('moved past');
    });

    it('refuses an anonymous caller and an action nobody holds', () => {
      expect(() =>
        assertTeamActionAuthorized(opened.state, { action: ACTION }),
      ).toThrow('assigned player');
      expect(() =>
        assertTeamActionAuthorized(opened.state, {
          action: 'ryo.answer',
          participantId: 'a1',
        }),
      ).toThrow('No team action');
    });
  });

  describe('disconnect and reconnect', () => {
    const connected = roster(
      player('a1', 'team-a'),
      player('a2', 'team-a'),
      player('b1', 'team-b'),
    );

    it('hands the action to the next eligible player and invalidates the old one', () => {
      const opened = assignNextTeamAction(state(connected), {
        teamId: 'team-a',
        action: ACTION,
        participants: connected,
      });
      const afterDrop = reassignUnavailableActions(
        opened.state,
        roster(
          player('a1', 'team-a', false),
          player('a2', 'team-a'),
          player('b1', 'team-b'),
        ),
      );
      expect(afterDrop.changed).toHaveLength(1);
      expect(afterDrop.changed[0].participantId).toBe('a2');
      // A fresh sequence, so a command the departed phone had already composed
      // arrives stale rather than being applied.
      expect(afterDrop.changed[0].sequence).toBeGreaterThan(
        opened.assignment.sequence,
      );
      expect(() =>
        assertTeamActionAuthorized(afterDrop.state, {
          action: ACTION,
          teamId: 'team-a',
          participantId: 'a1',
        }),
      ).toThrow('assigned player');
    });

    it('keeps a returning player in the rotation without interrupting the current holder', () => {
      const opened = assignNextTeamAction(state(connected), {
        teamId: 'team-a',
        action: ACTION,
        participants: connected,
      });
      const afterDrop = reassignUnavailableActions(
        opened.state,
        roster(player('a1', 'team-a', false), player('a2', 'team-a')),
      );
      // a1 reconnects. The open action stays with a2 — nothing is interrupted…
      const afterReturn = reassignUnavailableActions(
        afterDrop.state,
        connected,
      );
      expect(afterReturn.changed).toEqual([]);
      expect(assignmentFor(afterReturn.state, ACTION)?.participantId).toBe(
        'a2',
      );
      // …and a1 is still in the order, so they simply come round again.
      const next = assignNextTeamAction(afterReturn.state, {
        teamId: 'team-a',
        action: ACTION,
        participants: connected,
      });
      expect(next.assignment.participantId).toBe('a1');
      expect(
        next.state.rotations.find((rotation) => rotation.teamId === 'team-a')
          ?.order,
      ).toEqual(['a1', 'a2']);
    });

    it('leaves an action alone when the whole team is gone', () => {
      const opened = assignNextTeamAction(state(connected), {
        teamId: 'team-a',
        action: ACTION,
        participants: connected,
      });
      const stranded = reassignUnavailableActions(
        opened.state,
        roster(
          player('a1', 'team-a', false),
          player('a2', 'team-a', false),
          player('b1', 'team-b'),
        ),
      );
      // There is nobody to hand it to; inventing a holder would be worse than
      // waiting for someone to come back.
      expect(stranded.changed).toEqual([]);
      expect(assignmentFor(stranded.state, ACTION)?.participantId).toBe('a1');
    });
  });

  it('refuses to build a rotation for a team with nobody connected', () => {
    expect(() =>
      buildTeamRotations({
        teams: ['team-a', 'team-b'],
        participants: roster(player('a1', 'team-a')),
        randomIndex: () => 0,
      }),
    ).toThrow('no connected player');
  });
});
