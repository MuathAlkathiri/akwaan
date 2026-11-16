import {
  assertTeamActionAuthorized,
  assignNextTeamAction,
  assignNextTeamActionOrHold,
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

  it('refuses to build a rotation for a team with no players at all', () => {
    expect(() =>
      buildTeamRotations({
        teams: ['team-a', 'team-b'],
        participants: roster(player('a1', 'team-a')),
        randomIndex: () => 0,
      }),
    ).toThrow('no player');
  });

  describe('full-roster rotation (§16.10)', () => {
    it('keeps a player who was offline at launch in the order', () => {
      const rotations = buildTeamRotations({
        teams: ['team-a', 'team-b'],
        participants: roster(
          player('a1', 'team-a'),
          player('a2', 'team-a', false),
          player('b1', 'team-b', false),
        ),
        randomIndex: () => 0,
      });
      expect(rotations[0].order).toEqual(['a1', 'a2']);
      // A team wholly offline at launch still gets a rotation.
      expect(rotations[1].order).toEqual(['b1']);
    });

    it('gives the late phone its turn once it connects', () => {
      const atLaunch = roster(
        player('a1', 'team-a'),
        player('a2', 'team-a', false),
        player('b1', 'team-b'),
      );
      let working = state(atLaunch);
      const first = assignNextTeamAction(working, {
        teamId: 'team-a',
        action: ACTION,
        participants: atLaunch,
      });
      expect(first.assignment.participantId).toBe('a1');
      working = first.state;
      const connected = roster(
        player('a1', 'team-a'),
        player('a2', 'team-a'),
        player('b1', 'team-b'),
      );
      const second = assignNextTeamAction(working, {
        teamId: 'team-a',
        action: ACTION,
        participants: connected,
      });
      expect(second.assignment.participantId).toBe('a2');
    });

    it('skips an offline player and rotates over everyone after reconnect', () => {
      const offline = roster(
        player('a1', 'team-a'),
        player('a2', 'team-a', false),
        player('a3', 'team-a'),
        player('b1', 'team-b'),
      );
      let working = state(offline);
      const picks: string[] = [];
      for (let turn = 0; turn < 2; turn += 1) {
        const result = assignNextTeamAction(working, {
          teamId: 'team-a',
          action: ACTION,
          participants: offline,
        });
        working = result.state;
        picks.push(result.assignment.participantId);
      }
      const online = offline.map((p) => ({ ...p, connected: true }));
      for (let turn = 0; turn < 3; turn += 1) {
        const result = assignNextTeamAction(working, {
          teamId: 'team-a',
          action: ACTION,
          participants: online,
        });
        working = result.state;
        picks.push(result.assignment.participantId);
      }
      expect(picks).toEqual(['a1', 'a3', 'a1', 'a2', 'a3']);
    });
  });

  describe('lobby captain', () => {
    const team = roster(
      player('a1', 'team-a'),
      player('a2', 'team-a'),
      player('a3', 'team-a'),
      player('b1', 'team-b'),
    );
    const withCaptain = (captain = 'a2') =>
      createTeamActionAssignmentState(
        buildTeamRotations({
          teams: ['team-a', 'team-b'],
          participants: team,
          randomIndex: () => 0,
          captains: { 'team-a': captain },
        }),
      );

    it('keeps the captain through a persisted round trip', () => {
      let working = withCaptain();
      for (let turn = 0; turn < 3; turn += 1) {
        working = parseTeamActionAssignments(
          serializeTeamActionAssignments(working),
        );
        const result = assignNextTeamAction(working, {
          teamId: 'team-a',
          action: ACTION,
          participants: team,
        });
        working = result.state;
        expect(result.assignment.participantId).toBe('a2');
      }
      expect(
        parseTeamActionAssignments(serializeTeamActionAssignments(working))
          .rotations[0].captainId,
      ).toBe('a2');
    });

    it('records a captain only when the captain is on that team', () => {
      const rotations = buildTeamRotations({
        teams: ['team-a', 'team-b'],
        participants: team,
        randomIndex: () => 0,
        captains: { 'team-a': 'a2', 'team-b': 'a1' },
      });
      expect(rotations[0].captainId).toBe('a2');
      expect(rotations[1].captainId).toBeUndefined();
    });

    it('gives the captain every action while connected', () => {
      let working = withCaptain();
      for (let turn = 0; turn < 4; turn += 1) {
        const result = assignNextTeamAction(working, {
          teamId: 'team-a',
          action: ACTION,
          participants: team,
        });
        working = result.state;
        expect(result.assignment.participantId).toBe('a2');
      }
    });

    it('rotates stand-ins fairly while the captain is away', () => {
      const away = team.map((p) =>
        p.participantId === 'a2' ? { ...p, connected: false } : p,
      );
      let working = withCaptain();
      const picks: string[] = [];
      for (let turn = 0; turn < 3; turn += 1) {
        const result = assignNextTeamAction(working, {
          teamId: 'team-a',
          action: ACTION,
          participants: away,
        });
        working = result.state;
        picks.push(result.assignment.participantId);
      }
      expect(picks).toEqual(['a1', 'a3', 'a1']);
      // Back again: the next action is the captain's.
      const back = assignNextTeamAction(working, {
        teamId: 'team-a',
        action: ACTION,
        participants: team,
      });
      expect(back.assignment.participantId).toBe('a2');
    });

    it('does not take back an action a stand-in already holds', () => {
      let working = withCaptain();
      working = assignNextTeamAction(working, {
        teamId: 'team-a',
        action: ACTION,
        participants: team,
      }).state;
      const away = team.map((p) =>
        p.participantId === 'a2' ? { ...p, connected: false } : p,
      );
      const moved = reassignUnavailableActions(working, away);
      const standIn = assignmentFor(moved.state, ACTION);
      expect(standIn?.participantId).toBe('a1');
      // The captain reconnects: the open action stays with the stand-in.
      const again = reassignUnavailableActions(moved.state, team);
      expect(assignmentFor(again.state, ACTION)).toEqual(standIn);
      // The captain's stale sequence is refused.
      const captainSequence = assignmentFor(working, ACTION)!.sequence;
      expect(() =>
        assertTeamActionAuthorized(again.state, {
          teamId: 'team-a',
          action: ACTION,
          participantId: 'a2',
          sequence: captainSequence,
        }),
      ).toThrow();
    });
  });

  describe('opening an action with the whole team away', () => {
    it('holds it with the captain, then the next in rotation', () => {
      const allAway = roster(
        player('a1', 'team-a', false),
        player('a2', 'team-a', false),
        player('b1', 'team-b'),
      );
      const captained = createTeamActionAssignmentState(
        buildTeamRotations({
          teams: ['team-a', 'team-b'],
          participants: allAway,
          randomIndex: () => 1,
          captains: { 'team-a': 'a1' },
        }),
      );
      expect(
        assignNextTeamActionOrHold(captained, {
          teamId: 'team-a',
          action: ACTION,
          participants: allAway,
        }).assignment.participantId,
      ).toBe('a1');
      const rotating = state(allAway, ['team-a', 'team-b'], 1);
      expect(
        assignNextTeamActionOrHold(rotating, {
          teamId: 'team-a',
          action: ACTION,
          participants: allAway,
        }).assignment.participantId,
      ).toBe('a2');
    });

    it('lets the first teammate back receive the held action', () => {
      const allAway = roster(
        player('a1', 'team-a', false),
        player('a2', 'team-a', false),
        player('b1', 'team-b'),
      );
      const held = assignNextTeamActionOrHold(state(allAway), {
        teamId: 'team-a',
        action: ACTION,
        participants: allAway,
      });
      expect(held.assignment.participantId).toBe('a1');
      const a2Back = allAway.map((p) =>
        p.participantId === 'a2' ? { ...p, connected: true } : p,
      );
      const moved = reassignUnavailableActions(held.state, a2Back);
      const now = assignmentFor(moved.state, ACTION)!;
      expect(now.participantId).toBe('a2');
      expect(now.sequence).toBeGreaterThan(held.assignment.sequence);
    });
  });
});
