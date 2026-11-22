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
  retargetRotationCaptain,
  serializeTeamActionAssignments,
  TEAM_ACTION_ABSENT_GRACE_MS,
  TEAM_ACTION_STALE_GRACE_MS,
  teamActionGraceElapsed,
} from './team-action-assignment';

/**
 * One authoritative participant per team action.
 *
 * These tests pin the two things the frontend must never be allowed to decide:
 * who holds the action, and whether a given phone may take it.
 */
describe('team action assignment', () => {
  const ACTION = 'top5.decision';
  /**
   * A pinned clock. Every action in these tests therefore opens at `NOW`, so
   * passing `NOW` again as the caller's clock means zero elapsed time: the
   * stand-in grace never applies here and the strict holder-only rule is what
   * is under test. The grace itself has its own describe block below.
   */
  const NOW = new Date('2026-01-01T00:00:00.000Z');
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
        now: NOW,
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
        now: NOW,
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
      now: NOW,
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
      now: NOW,
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
      now: NOW,
    });

    it('accepts only the assigned participant', () => {
      expect(
        assertTeamActionAuthorized(opened.state, {
          action: ACTION,
          teamId: 'team-a',
          participantId: 'a1',
          sequence: opened.assignment.sequence,
          participants: [],
          now: NOW,
        }).participantId,
      ).toBe('a1');
    });

    it('refuses a teammate on the correct team', () => {
      expect(() =>
        assertTeamActionAuthorized(opened.state, {
          action: ACTION,
          teamId: 'team-a',
          participantId: 'a2',
          participants: [],
          now: NOW,
        }),
      ).toThrow('assigned player');
    });

    it('refuses the opposing team', () => {
      expect(() =>
        assertTeamActionAuthorized(opened.state, {
          action: ACTION,
          teamId: 'team-b',
          participantId: 'b1',
          participants: [],
          now: NOW,
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
          participants: [],
          now: NOW,
        }),
      ).toThrow('moved past');
    });

    it('refuses an anonymous caller and an action nobody holds', () => {
      expect(() =>
        assertTeamActionAuthorized(opened.state, {
          action: ACTION,
          participants: [],
          now: NOW,
        }),
      ).toThrow('assigned player');
      expect(() =>
        assertTeamActionAuthorized(opened.state, {
          action: 'ryo.answer',
          participantId: 'a1',
          participants: [],
          now: NOW,
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
        now: NOW,
      });
      const afterDrop = reassignUnavailableActions(
        opened.state,
        roster(
          player('a1', 'team-a', false),
          player('a2', 'team-a'),
          player('b1', 'team-b'),
        ),
        NOW,
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
          participants: [],
          now: NOW,
        }),
      ).toThrow('assigned player');
    });

    it('keeps a returning player in the rotation without interrupting the current holder', () => {
      const opened = assignNextTeamAction(state(connected), {
        teamId: 'team-a',
        action: ACTION,
        participants: connected,
        now: NOW,
      });
      const afterDrop = reassignUnavailableActions(
        opened.state,
        roster(player('a1', 'team-a', false), player('a2', 'team-a')),
        NOW,
      );
      // a1 reconnects. The open action stays with a2 — nothing is interrupted…
      const afterReturn = reassignUnavailableActions(
        afterDrop.state,
        connected,
        NOW,
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
        now: NOW,
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
        now: NOW,
      });
      const stranded = reassignUnavailableActions(
        opened.state,
        roster(
          player('a1', 'team-a', false),
          player('a2', 'team-a', false),
          player('b1', 'team-b'),
        ),
        NOW,
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
        now: NOW,
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
        now: NOW,
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
          now: NOW,
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
          now: NOW,
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
          now: NOW,
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
          now: NOW,
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
          now: NOW,
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
        now: NOW,
      });
      expect(back.assignment.participantId).toBe('a2');
    });

    it('does not take back an action a stand-in already holds', () => {
      let working = withCaptain();
      working = assignNextTeamAction(working, {
        teamId: 'team-a',
        action: ACTION,
        participants: team,
        now: NOW,
      }).state;
      const away = team.map((p) =>
        p.participantId === 'a2' ? { ...p, connected: false } : p,
      );
      const moved = reassignUnavailableActions(working, away, NOW);
      const standIn = assignmentFor(moved.state, ACTION);
      expect(standIn?.participantId).toBe('a1');
      // The captain reconnects: the open action stays with the stand-in.
      const again = reassignUnavailableActions(moved.state, team, NOW);
      expect(assignmentFor(again.state, ACTION)).toEqual(standIn);
      // The captain's stale sequence is refused.
      const captainSequence = assignmentFor(working, ACTION)!.sequence;
      expect(() =>
        assertTeamActionAuthorized(again.state, {
          teamId: 'team-a',
          action: ACTION,
          participantId: 'a2',
          sequence: captainSequence,
          participants: [],
          now: NOW,
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
          now: NOW,
        }).assignment.participantId,
      ).toBe('a1');
      const rotating = state(allAway, ['team-a', 'team-b'], 1);
      expect(
        assignNextTeamActionOrHold(rotating, {
          teamId: 'team-a',
          action: ACTION,
          participants: allAway,
          now: NOW,
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
        now: NOW,
      });
      expect(held.assignment.participantId).toBe('a1');
      const a2Back = allAway.map((p) =>
        p.participantId === 'a2' ? { ...p, connected: true } : p,
      );
      const moved = reassignUnavailableActions(held.state, a2Back, NOW);
      const now = assignmentFor(moved.state, ACTION)!;
      expect(now.participantId).toBe('a2');
      expect(now.sequence).toBeGreaterThan(held.assignment.sequence);
    });
  });

  /**
   * The grace that keeps a team from being stuck behind a phone that is gone.
   *
   * A real match froze on 2026-11-21: the captain had left the room, the
   * server still reported her connected, and her team could not act at all.
   * Two windows answer that, and the difference between them is the point —
   * a holder known to be gone is replaced quickly, while a holder who merely
   * has not acted yet keeps the floor long enough to actually think.
   */
  describe('stand-in grace', () => {
    const team = roster(
      player('a1', 'team-a'),
      player('a2', 'team-a'),
      player('b1', 'team-b'),
    );
    const at = (ms: number) => new Date(NOW.getTime() + ms);
    /** Opens the action on a1, the first of team-a's rotation. */
    const opened = () =>
      assignNextTeamAction(state(team), {
        teamId: 'team-a',
        action: ACTION,
        participants: team,
        now: NOW,
      });
    const gone = team.map((p) =>
      p.participantId === 'a1' ? { ...p, connected: false } : p,
    );
    const authorise = (
      result: ReturnType<typeof opened>,
      participantId: string,
      participants: EligibleParticipant[],
      now: Date,
    ) =>
      assertTeamActionAuthorized(result.state, {
        action: ACTION,
        teamId: 'team-a',
        participantId,
        participants,
        now,
      });

    it('always lets the holder act, however long they took', () => {
      const result = opened();
      expect(result.assignment.participantId).toBe('a1');
      expect(authorise(result, 'a1', team, at(60_000)).participantId).toBe(
        'a1',
      );
    });

    it('refuses a teammate while an absent holder is still inside the grace', () => {
      const result = opened();
      expect(() => authorise(result, 'a2', gone, at(4_999))).toThrow(
        'assigned player',
      );
    });

    it('lets a teammate act once an absent holder has used up the grace', () => {
      const result = opened();
      expect(authorise(result, 'a2', gone, at(5_000)).participantId).toBe('a1');
    });

    it('keeps the floor for a holder who looks connected and is still thinking', () => {
      const result = opened();
      // Ten seconds into a bid or a difficulty choice is thinking, not absence.
      expect(() => authorise(result, 'a2', team, at(10_000))).toThrow(
        'assigned player',
      );
    });

    it('lets a teammate act when a holder who looks connected never acts', () => {
      const result = opened();
      // Presence lied: the phone reports connected and nothing is happening.
      expect(authorise(result, 'a2', team, at(20_000)).participantId).toBe(
        'a1',
      );
    });

    it('never lets the other team act, however long the holder takes', () => {
      const result = opened();
      expect(() =>
        assertTeamActionAuthorized(result.state, {
          action: ACTION,
          teamId: 'team-b',
          participantId: 'b1',
          participants: team,
          now: at(10 * 60_000),
        }),
      ).toThrow('other team');
    });

    it('refuses a teammate who is away themselves', () => {
      const result = opened();
      const bothAway = team.map((p) =>
        p.teamId === 'team-a' ? { ...p, connected: false } : p,
      );
      expect(() => authorise(result, 'a2', bothAway, at(60_000))).toThrow(
        'assigned player',
      );
    });

    it('refuses a stand-in naming a superseded assignment', () => {
      const result = opened();
      expect(() =>
        assertTeamActionAuthorized(result.state, {
          action: ACTION,
          teamId: 'team-a',
          participantId: 'a2',
          sequence: result.assignment.sequence - 1,
          participants: gone,
          now: at(60_000),
        }),
      ).toThrow('moved past');
    });

    describe('the predicate on its own', () => {
      const openedAt = NOW.toISOString();
      it('waits five seconds for a holder known to be gone', () => {
        expect(
          teamActionGraceElapsed({
            openedAt,
            holderConnected: false,
            now: at(TEAM_ACTION_ABSENT_GRACE_MS - 1),
          }),
        ).toBe(false);
        expect(
          teamActionGraceElapsed({
            openedAt,
            holderConnected: false,
            now: at(TEAM_ACTION_ABSENT_GRACE_MS),
          }),
        ).toBe(true);
      });

      it('waits twenty for a holder who still looks connected', () => {
        expect(
          teamActionGraceElapsed({
            openedAt,
            holderConnected: true,
            now: at(TEAM_ACTION_ABSENT_GRACE_MS),
          }),
        ).toBe(false);
        expect(
          teamActionGraceElapsed({
            openedAt,
            holderConnected: true,
            now: at(TEAM_ACTION_STALE_GRACE_MS),
          }),
        ).toBe(true);
      });

      it('never elapses on an unreadable timestamp', () => {
        // A persisted assignment from before this field existed must not hand
        // the action to the first teammate who asks.
        expect(
          teamActionGraceElapsed({
            openedAt: 'not a date',
            holderConnected: false,
            now: at(60 * 60_000),
          }),
        ).toBe(false);
      });
    });
  });

  /**
   * The host moving a team's armband mid-challenge.
   *
   * Naming a captain in the lobby only decides who acts next, which is no use
   * to a team whose captain already left holding the turn. These pin that the
   * override reaches the turn itself, and that it reaches nothing else.
   */
  describe('retargeting the captain mid-challenge', () => {
    const team = roster(
      player('a1', 'team-a'),
      player('a2', 'team-a'),
      player('b1', 'team-b'),
    );
    const opened = () => {
      const first = assignNextTeamAction(state(team), {
        teamId: 'team-a',
        action: ACTION,
        participants: team,
        now: NOW,
      });
      return assignNextTeamAction(first.state, {
        teamId: 'team-b',
        action: 'top5.other',
        participants: team,
        now: NOW,
      });
    };

    it('hands the open action to the new captain', () => {
      const result = retargetRotationCaptain(opened().state, {
        teamId: 'team-a',
        captainId: 'a2',
        participants: team,
        now: NOW,
      });
      expect(assignmentFor(result.state, ACTION)!.participantId).toBe('a2');
      expect(
        result.state.rotations.find((r) => r.teamId === 'team-a')!.captainId,
      ).toBe('a2');
    });

    it('leaves the other team mid-thought', () => {
      const before = opened().state;
      const other = assignmentFor(before, 'top5.other')!;
      const result = retargetRotationCaptain(before, {
        teamId: 'team-a',
        captainId: 'a2',
        participants: team,
        now: NOW,
      });
      expect(assignmentFor(result.state, 'top5.other')).toEqual(other);
      expect(result.changed.every((a) => a.teamId === 'team-a')).toBe(true);
    });

    it('keeps everyone their place in the order', () => {
      const before = opened().state;
      const order = before.rotations.find((r) => r.teamId === 'team-a')!.order;
      const result = retargetRotationCaptain(before, {
        teamId: 'team-a',
        captainId: 'a2',
        participants: team,
        now: NOW,
      });
      expect(
        result.state.rotations.find((r) => r.teamId === 'team-a')!.order,
      ).toEqual(order);
    });

    it('appends a captain who joined after the challenge started', () => {
      const late = [...team, player('a3', 'team-a')];
      const result = retargetRotationCaptain(opened().state, {
        teamId: 'team-a',
        captainId: 'a3',
        participants: late,
        now: NOW,
      });
      const rotation = result.state.rotations.find(
        (r) => r.teamId === 'team-a',
      )!;
      expect(rotation.order[rotation.order.length - 1]).toBe('a3');
      expect(assignmentFor(result.state, ACTION)!.participantId).toBe('a3');
    });

    it('falls back to a teammate when the new captain is away', () => {
      const captainAway = [...team, player('a3', 'team-a', false)];
      const result = retargetRotationCaptain(opened().state, {
        teamId: 'team-a',
        captainId: 'a3',
        participants: captainAway,
        now: NOW,
      });
      // The armband is recorded even though she cannot act yet: when her phone
      // comes back she takes over without the host asking again.
      expect(
        result.state.rotations.find((r) => r.teamId === 'team-a')!.captainId,
      ).toBe('a3');
      expect(['a1', 'a2']).toContain(
        assignmentFor(result.state, ACTION)!.participantId,
      );
    });

    it('clears the armband and goes back to plain rotation', () => {
      const withCaptain = retargetRotationCaptain(opened().state, {
        teamId: 'team-a',
        captainId: 'a2',
        participants: team,
        now: NOW,
      });
      const cleared = retargetRotationCaptain(withCaptain.state, {
        teamId: 'team-a',
        captainId: undefined,
        participants: team,
        now: NOW,
      });
      expect(
        cleared.state.rotations.find((r) => r.teamId === 'team-a')!.captainId,
      ).toBeUndefined();
      expect(assignmentFor(cleared.state, ACTION)).toBeDefined();
    });

    it('does nothing for a mechanic that never opted in', () => {
      const before = opened().state;
      const result = retargetRotationCaptain(before, {
        teamId: 'team-z',
        captainId: 'z1',
        participants: team,
        now: NOW,
      });
      expect(result.state).toBe(before);
      expect(result.changed).toEqual([]);
    });

    it('supersedes the sequence the old holder was given', () => {
      const before = opened();
      const previous = assignmentFor(before.state, ACTION)!;
      const result = retargetRotationCaptain(before.state, {
        teamId: 'team-a',
        captainId: 'a2',
        participants: team,
        now: NOW,
      });
      expect(assignmentFor(result.state, ACTION)!.sequence).toBeGreaterThan(
        previous.sequence,
      );
    });
  });
});
