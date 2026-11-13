import { CORE_TIMED_TURNS_MODE } from './live-game-mode.registry';
import { LiveGameSession } from './live-game-session';

/**
 * Rooms nobody came to.
 *
 * A host opens a Match, the gathering does not happen, and the room sits there
 * holding a live join code until the 24-hour cap. Two things were wrong with
 * that: the cap is a day, which is far longer than a room nobody joined is
 * worth keeping, and the join path never consulted expiry at all — it read the
 * status and said yes, then the enrolment itself refused once the phone had
 * already asked for a name.
 */
describe('a waiting room nobody joined', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const later = (ms: number) => new Date(now.getTime() + ms);
  const HOUR = 60 * 60 * 1000;
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

  const join = (session: LiveGameSession, at: Date) =>
    session.enrollParticipant({
      displayName: 'ريم',
      teamId: session.serialize().teams[0].id,
      role: 'team-player',
      joinRequestId: `join-${(joins += 1)}`,
      now: at,
    });

  it('takes players while it is fresh', () => {
    expect(create().acceptsNewParticipants(later(HOUR))).toBe(true);
  });

  it('stops taking players once it has been left alone too long', () => {
    const session = create();
    expect(session.acceptsNewParticipants(later(7 * HOUR))).toBe(false);
  });

  it('keeps the room alive once somebody is actually in it', () => {
    // Somebody came, so this is a room in use and the ordinary cap governs it.
    const session = create();
    join(session, later(HOUR));
    expect(session.acceptsNewParticipants(later(7 * HOUR))).toBe(true);
  });

  it('still closes a used room at the session cap', () => {
    const session = create();
    join(session, later(HOUR));
    expect(session.acceptsNewParticipants(later(25 * HOUR))).toBe(false);
  });

  it('refuses a scan after the cap even though the status still reads waiting', () => {
    // The defect this closes: the status is whatever it was when the session
    // was last touched, and nothing touches an abandoned one.
    const session = create();
    join(session, later(HOUR));
    expect(session.serialize().status).toBe('waiting');
    expect(session.acceptsNewParticipants(later(25 * HOUR))).toBe(false);
  });

  it('does not count a player who was removed as somebody being there', () => {
    const session = create();
    const participant = join(session, later(HOUR));
    session.removeParticipant(participant.id, later(2 * HOUR));
    expect(session.acceptsNewParticipants(later(7 * HOUR))).toBe(false);
  });

  it('never reopens a session that has finished', () => {
    const session = create();
    session.begin(now);
    session.finish('completed', undefined, undefined, later(HOUR));
    expect(session.acceptsNewParticipants(later(2 * HOUR))).toBe(false);
  });
});
