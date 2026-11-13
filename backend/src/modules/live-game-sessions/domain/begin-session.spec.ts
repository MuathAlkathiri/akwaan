import { CORE_TIMED_TURNS_MODE } from './live-game-mode.registry';
import { LiveGameSession } from './live-game-session';
import { LiveSessionDomainError } from './live-session.errors';

/**
 * Starting a session from the waiting room.
 *
 * The room replaced team creation, and with it the step where every player
 * pressed «جاهز»: a host gathers whoever is there and says go. `markReady`
 * refuses that — it wants a ready player on each side — so the room would have
 * been stuck the moment the first player joined. `begin` is the one the room
 * uses, and what it must not do is lose the guards that are still real.
 */
describe('LiveGameSession.begin', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  let joins = 0;
  const join = (
    session: LiveGameSession,
    displayName: string,
    teamId: string,
  ) =>
    session.enrollParticipant({
      displayName,
      teamId,
      role: 'team-player',
      joinRequestId: `join-${(joins += 1)}`,
      now,
    });

  const create = (teamNames = ['الأزرق', 'الأحمر']) =>
    LiveGameSession.create({
      id: 'session-id',
      controllerActorId: 'actor-1',
      controllerDisplayName: 'Host',
      teamNames,
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now,
    });

  it('starts a session nobody has joined', () => {
    const session = create();
    session.begin(now);
    expect(session.serialize().status).toBe('active');
    expect(session.serialize().startedAt).toEqual(now);
  });

  it('starts with one side empty, which is the whole point', () => {
    const session = create();
    const [blue] = session.serialize().teams;
    join(session, 'ريم', blue.id);
    // markReady is what blocked this: a side with nobody on it has no ready
    // player, so the host could only cancel.
    expect(() => session.markReady(now)).toThrow(LiveSessionDomainError);
    session.begin(now);
    expect(session.serialize().status).toBe('active');
  });

  it('starts without anybody having pressed ready', () => {
    const session = create();
    const [blue, red] = session.serialize().teams;
    join(session, 'ريم', blue.id);
    join(session, 'سعد', red.id);
    expect(() => session.markReady(now)).toThrow(LiveSessionDomainError);
    session.begin(now);
    expect(session.serialize().status).toBe('active');
  });

  it('cannot be reached with fewer than two sides at all', () => {
    // `begin` carries the two-sides guard that `markReady` carries, but neither
    // can fire today: the count is settled at creation and no code deactivates a
    // team afterwards. So this holds the invariant where it is actually enforced,
    // rather than claiming cover for a branch nothing can enter.
    expect(() => create(['الأزرق'])).toThrow(LiveSessionDomainError);
  });

  it('works from ready too, so a half-pressed old flow is not a dead end', () => {
    const session = create();
    session.markReady(now);
    session.begin(now);
    expect(session.serialize().status).toBe('active');
  });

  it('refuses once the session is already running or over', () => {
    const session = create();
    session.begin(now);
    expect(() => session.begin(now)).toThrow(LiveSessionDomainError);
    session.finish('completed', undefined, undefined, now);
    expect(() => session.begin(now)).toThrow(LiveSessionDomainError);
  });

  it('clears a countdown left behind by the old flow', () => {
    const session = create();
    session.beginCountdown(now, 5_000);
    session.begin(now);
    expect(session.serialize().countdownEndsAt).toBeUndefined();
    expect(session.serialize().status).toBe('active');
  });
});
