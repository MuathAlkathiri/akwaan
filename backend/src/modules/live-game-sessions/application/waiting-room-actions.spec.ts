import { LiveGameSessionSnapshotMapper } from './live-game-session.snapshot';
import { CORE_TIMED_TURNS_MODE } from '../domain/live-game-mode.registry';
import { LiveGameSession } from '../domain/live-game-session';

/**
 * What the host is offered while the room fills up.
 *
 * The waiting room's start button reads this list, so what it contains decides
 * whether the room can start at all. `ready` used to be the only thing here, and
 * it vanished the moment a side had nobody ready — which is every room before
 * the first challenge, now that no player presses ready.
 */
describe('the host actions in a waiting session', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const mapper = new LiveGameSessionSnapshotMapper();
  let joins = 0;

  const create = () =>
    LiveGameSession.create({
      id: 'session-id',
      controllerActorId: 'actor-1',
      controllerDisplayName: 'Host',
      teamNames: ['الأزرق', 'الأحمر'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now,
    });

  const actionsFor = (session: LiveGameSession) =>
    mapper.toSnapshot(session, 'actor-1', now).availableActions;

  it('offers begin in an empty room', () => {
    expect(actionsFor(create())).toContain('begin');
  });

  it('still offers begin once a side has somebody and the other has nobody', () => {
    const session = create();
    const [blue] = session.serialize().teams;
    session.enrollParticipant({
      displayName: 'ريم',
      teamId: blue.id,
      role: 'team-player',
      joinRequestId: `join-${(joins += 1)}`,
      now,
    });
    const actions = actionsFor(session);
    // This is the case that used to leave the host with nothing but cancel.
    expect(actions).toContain('begin');
    expect(actions).not.toContain('ready');
    expect(actions).not.toEqual(['cancel']);
  });

  it('keeps ready for the flows that still use it', () => {
    expect(actionsFor(create())).toContain('ready');
  });

  it('offers nothing to start with once the session is running', () => {
    const session = create();
    session.begin(now);
    expect(actionsFor(session)).not.toContain('begin');
  });

  it('gives a player no way to start the session', () => {
    const session = create();
    const [blue] = session.serialize().teams;
    const participant = session.enrollParticipant({
      displayName: 'ريم',
      teamId: blue.id,
      role: 'team-player',
      joinRequestId: `join-${(joins += 1)}`,
      now,
    });
    const actions = mapper.toSnapshot(
      session,
      participant.id,
      now,
    ).availableActions;
    // The participant branch really was taken: an empty list would pass the
    // negative assertion on its own and prove nothing.
    expect(actions).toContain('participant-ready');
    expect(actions).not.toContain('begin');
  });
});
