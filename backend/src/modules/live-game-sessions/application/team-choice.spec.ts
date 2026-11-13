import { ChooseOwnTeam } from './live-participant.use-cases';
import { ResolveJoinCode } from './live-session-join-access.use-cases';
import { LiveGameSessionSnapshotMapper } from './live-game-session.snapshot';
import { LiveGameSession } from '../domain/live-game-session';
import { CORE_TIMED_TURNS_MODE } from '../domain/live-game-mode.registry';
import { LiveSessionJoinAccess } from '../domain/live-session-join-access';
import { PLAYER_AVATAR_KEYS } from '../domain/player-avatars';

/**
 * Sorting people into the two teams.
 *
 * The room works because people sort themselves out: the phone shows which side
 * is smaller and the player taps one. So the choice has to belong to the player,
 * the counts have to be honest, and a character already taken has to be visibly
 * unavailable rather than refused after the tap.
 */
describe('choosing a team', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  function room() {
    const session = LiveGameSession.create({
      id: 'session-1',
      controllerActorId: 'host',
      controllerDisplayName: 'المضيف',
      teamNames: ['الأزرق', 'الأحمر'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now,
    });
    const access = LiveSessionJoinAccess.create({
      sessionId: 'session-1',
      publicCode: 'YQ6WBTN',
      assignmentPolicy: 'explicit',
      createdByActorId: 'host',
      now,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
    });
    return { session, access };
  }

  const deps = (session: LiveGameSession, access: LiveSessionJoinAccess) => ({
    sessions: {
      findById: jest.fn(async () => session),
      save: jest.fn(async () => undefined),
    },
    clock: { now: () => now },
    snapshots: new LiveGameSessionSnapshotMapper(),
    publisher: { publish: jest.fn() },
    accesses: {
      findByCode: jest.fn(async () => access),
      findCurrentBySessionId: jest.fn(async () => access),
    },
  });

  const chooser = (session: LiveGameSession, access: LiveSessionJoinAccess) => {
    const d = deps(session, access);
    return {
      use: new ChooseOwnTeam(
        d.sessions as never,
        d.clock as never,
        d.snapshots,
        d.publisher as never,
        d.accesses as never,
      ),
      ...d,
    };
  };

  const enrol = (session: LiveGameSession, index: number, teamId?: string) =>
    session.enrollParticipant({
      id: `player-${index}`,
      displayName: `لاعب ${index}`,
      role: 'team-player',
      teamId,
      joinRequestId: `join-${index}`,
      now,
    });

  const participantActor = (participantId: string) =>
    ({
      kind: 'participant' as const,
      sessionId: 'session-1',
      participantId,
      credentialVersion: 1,
    }) as never;

  describe('the player', () => {
    it('moves themselves without the host', () => {
      const { session, access } = room();
      const [blue, red] = session.serialize().teams;
      enrol(session, 0, blue.id);
      const { use, sessions } = chooser(session, access);

      return use
        .execute({
          actor: participantActor('player-0'),
          teamId: red.id,
          expectedRevision: session.revision,
          commandId: 'cmd-1',
        })
        .then(() => {
          const moved = session
            .serialize()
            .participants.find((p) => p.id === 'player-0');
          expect(moved?.teamId).toBe(red.id);
          expect(sessions.save).toHaveBeenCalledTimes(1);
        });
    });

    it('cannot move anybody else, host included', () => {
      const { session, access } = room();
      const [, red] = session.serialize().teams;
      const { use } = chooser(session, access);
      return expect(
        use.execute({
          actor: { kind: 'user', actorId: 'host' } as never,
          teamId: red.id,
          expectedRevision: session.revision,
          commandId: 'cmd-1',
        }),
      ).rejects.toMatchObject({ code: 'SESSION_FORBIDDEN' });
    });

    it('cannot change sides once the match is running', () => {
      // The window belongs to the domain, not to this use case: switching teams
      // mid-match would be a way to join the winning side.
      const { session, access } = room();
      const [blue, red] = session.serialize().teams;
      for (const [index, team] of session.serialize().teams.entries()) {
        enrol(session, index, team.id);
        session.setParticipantReady(`player-${index}`, true, now);
      }
      enrol(session, 9, blue.id);
      session.setParticipantReady('player-9', true, now);
      session.markReady(now);
      session.start(now);
      const { use } = chooser(session, access);
      return expect(
        use.execute({
          actor: participantActor('player-0'),
          teamId: red.id,
          expectedRevision: session.revision,
          commandId: 'cmd-1',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_SESSION_TRANSITION' });
    });

    it('is refused a team that is already full', () => {
      const { session } = room();
      const capped = LiveSessionJoinAccess.create({
        sessionId: 'session-1',
        publicCode: 'YQ6WBTN',
        assignmentPolicy: 'explicit',
        teamCapacity: 1,
        createdByActorId: 'host',
        now,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
      });
      const [blue, red] = session.serialize().teams;
      enrol(session, 0, blue.id);
      enrol(session, 1, red.id);
      const { use } = chooser(session, capped);
      return expect(
        use.execute({
          actor: participantActor('player-0'),
          teamId: red.id,
          expectedRevision: session.revision,
          commandId: 'cmd-1',
        }),
      ).rejects.toMatchObject({ code: 'TEAM_FULL' });
    });

    it('is idempotent on a retried tap', () => {
      const { session, access } = room();
      const [blue, red] = session.serialize().teams;
      enrol(session, 0, blue.id);
      const { use, sessions } = chooser(session, access);
      const once = () =>
        use.execute({
          actor: participantActor('player-0'),
          teamId: red.id,
          expectedRevision: session.revision,
          commandId: 'cmd-1',
        });
      return once()
        .then(once)
        .then(() => {
          // A phone on a flaky connection retries; the second tap must not be a
          // second move, and must not fail either.
          expect(sessions.save).toHaveBeenCalledTimes(1);
        });
    });
  });

  describe('what the phone is told', () => {
    const resolver = (
      session: LiveGameSession,
      access: LiveSessionJoinAccess,
    ) =>
      new ResolveJoinCode(
        { findByCode: jest.fn(async () => access) } as never,
        { findById: jest.fn(async () => session) } as never,
        { now: () => now } as never,
      );

    it('counts each team, so the smaller side can be suggested', () => {
      const { session, access } = room();
      const [blue, red] = session.serialize().teams;
      enrol(session, 0, blue.id);
      enrol(session, 1, blue.id);
      enrol(session, 2, red.id);
      return resolver(session, access)
        .execute('yq6wbtn')
        .then((view) => {
          const counts = Object.fromEntries(
            view.teams.map((team) => [team.name, team.playerCount]),
          );
          expect(counts).toEqual({ الأزرق: 2, الأحمر: 1 });
        });
    });

    it('does not count a player who left', () => {
      const { session, access } = room();
      const [blue] = session.serialize().teams;
      enrol(session, 0, blue.id);
      enrol(session, 1, blue.id);
      session.removeParticipant('player-1', now);
      return resolver(session, access)
        .execute('YQ6WBTN')
        .then((view) => {
          expect(view.teams[0].playerCount).toBe(1);
        });
    });

    it('names the characters already taken, and nothing about who has them', () => {
      const { session, access } = room();
      const [blue] = session.serialize().teams;
      enrol(session, 0, blue.id);
      enrol(session, 1, blue.id);
      return resolver(session, access)
        .execute('YQ6WBTN')
        .then((view) => {
          expect(view.takenAvatarKeys).toEqual([
            PLAYER_AVATAR_KEYS[0],
            PLAYER_AVATAR_KEYS[1],
          ]);
          // The code is the key to the room, so counts are fair game — names are
          // not. Nothing here identifies a player.
          expect(JSON.stringify(view)).not.toContain('لاعب');
        });
    });

    it('frees a departed player’s character in what it reports', () => {
      const { session, access } = room();
      enrol(session, 0);
      session.removeParticipant('player-0', now);
      return resolver(session, access)
        .execute('YQ6WBTN')
        .then((view) => {
          expect(view.takenAvatarKeys).toEqual([]);
        });
    });
  });

  it('lets a player land on their side as they join, not after', () => {
    // The phone sends the team with the name, so joining and choosing are one
    // tap. This is the behaviour that makes the room fill without the host.
    const { session } = room();
    const [, red] = session.serialize().teams;
    expect(enrol(session, 0, red.id).teamId).toBe(red.id);
  });
});
