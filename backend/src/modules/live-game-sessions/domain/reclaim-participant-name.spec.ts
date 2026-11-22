import { CORE_TIMED_TURNS_MODE } from './live-game-mode.registry';
import { LiveGameSession } from './live-game-session';
import {
  PARTICIPANT_ABSENCE_MS,
  participantIsAbsent,
} from './participant-presence';

/**
 * Getting back into your own match.
 *
 * A player closed their browser tab mid-match. The credential lived in
 * `sessionStorage`, which the browser empties on close, so the phone could not
 * reconnect and fell back to joining by name — where the roster still held the
 * name and refused it. The player was locked out of a session they were still
 * part of, and because one of them was a captain, the match itself stopped.
 *
 * Typing the name again is a claim of identity, not a request for a new seat.
 * It is honoured only while the name's holder is absent.
 */
describe('reclaiming your own name', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const later = (ms: number) => new Date(now.getTime() + ms);
  let joins = 0;

  const seatedSession = () => {
    const session = LiveGameSession.create({
      id: 'session-id',
      controllerActorId: 'actor-1',
      controllerDisplayName: 'Host',
      teamNames: ['الأزرق', 'الأحمر'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now,
    });
    const participant = session.enrollParticipant({
      displayName: 'حنني',
      teamId: session.serialize().teams[0].id,
      role: 'team-player',
      joinRequestId: `join-${(joins += 1)}`,
      now,
    });
    return { session, participant };
  };

  /** What the repository does after restoring: merge observed presence. */
  const observe = (
    session: LiveGameSession,
    id: string,
    presence: { connected: boolean; lastSeenAt: Date },
  ) => session.applyPresence(new Map([[id, { ...presence, connectedDeviceCount: presence.connected ? 1 : 0 }]]));

  const reclaim = (session: LiveGameSession, at: Date) =>
    session.reclaimParticipantByName({
      displayName: 'حنني',
      joinRequestId: `rejoin-${(joins += 1)}`,
      now: at,
    });

  it('gives the absent player the same seat, not a new one', () => {
    const { session, participant } = seatedSession();
    const team = participant.teamId;
    observe(session, participant.id, { connected: false, lastSeenAt: now });

    const back = reclaim(session, later(PARTICIPANT_ABSENCE_MS + 1000));

    expect(back?.id).toBe(participant.id);
    expect(back?.teamId).toBe(team);
    // The host is a participant too, so count the players: the point is that
    // the reclaim seated nobody new.
    expect(
      session
        .serialize()
        .participants.filter(
          (entry) => entry.role === 'team-player' && !entry.removedAt,
        ),
    ).toHaveLength(1);
  });

  it('retires the lost credential so it cannot contend for the seat', () => {
    const { session, participant } = seatedSession();
    const before = participant.credentialVersion;
    observe(session, participant.id, { connected: false, lastSeenAt: now });

    const back = reclaim(session, later(PARTICIPANT_ABSENCE_MS + 1000));

    expect(back?.credentialVersion).toBe(before + 1);
  });

  it('refuses while the name is genuinely in use', () => {
    const { session, participant } = seatedSession();
    observe(session, participant.id, {
      connected: true,
      lastSeenAt: later(PARTICIPANT_ABSENCE_MS * 4),
    });

    expect(reclaim(session, later(PARTICIPANT_ABSENCE_MS * 4))).toBeUndefined();
  });

  it('refuses during a brief drop, so a blip cannot strand the player', () => {
    const { session, participant } = seatedSession();
    observe(session, participant.id, { connected: false, lastSeenAt: now });

    expect(reclaim(session, later(2_000))).toBeUndefined();
  });

  it('leaves an unknown name alone', () => {
    const { session } = seatedSession();

    expect(
      session.reclaimParticipantByName({
        displayName: 'ريم',
        joinRequestId: 'rejoin-unknown',
        now: later(PARTICIPANT_ABSENCE_MS + 1000),
      }),
    ).toBeUndefined();
  });
});

describe('deciding that somebody is gone', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('keeps a connected player present however long the silence', () => {
    expect(
      participantIsAbsent(
        { connected: true, lastSeenAt: ago(PARTICIPANT_ABSENCE_MS * 10) },
        now,
      ),
    ).toBe(false);
  });

  it('waits out a short disconnect', () => {
    expect(
      participantIsAbsent({ connected: false, lastSeenAt: ago(5_000) }, now),
    ).toBe(false);
  });

  it('calls a long silence absence', () => {
    expect(
      participantIsAbsent(
        { connected: false, lastSeenAt: ago(PARTICIPANT_ABSENCE_MS + 1) },
        now,
      ),
    ).toBe(true);
  });
});
