import { CORE_TIMED_TURNS_MODE } from './live-game-mode.registry';
import { LiveGameSession } from './live-game-session';
import { LiveSessionDomainError } from './live-session.errors';

describe('LiveGameSession', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  function create() {
    return LiveGameSession.create({
      id: 'session-id',
      controllerActorId: 'actor-1',
      controllerDisplayName: 'Host',
      teamNames: ['One', 'Two', 'Three'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now,
    });
  }

  it('enforces lifecycle transitions', () => {
    const session = create();
    expect(() => session.start(now)).toThrow(LiveSessionDomainError);
    session.markReady(now);
    session.start(now);
    session.pause(new Date(now.getTime() + 1_000));
    session.resume(new Date(now.getTime() + 2_000));
    session.finish('completed', undefined, undefined, now);
    expect(session.serialize().status).toBe('finished');
    expect(() => session.start(now)).toThrow(LiveSessionDomainError);
  });

  it('runs only the active clock and preserves clocks when switching', () => {
    const session = create();
    session.markReady(now);
    session.start(now);
    const [first, second] = session.serialize().teams;
    session.startTurn(first.id, 'initial', now);
    session.switchTurn(second.id, 'manual', new Date(now.getTime() + 5_000));
    const state = session.serialize();
    expect(state.activeTeamId).toBe(second.id);
    expect(state.teams[0].clock.running).toBe(false);
    expect(state.teams[0].clock.consumedMs).toBe(5_000);
    expect(state.teams[1].clock.running).toBe(true);
    expect(state.turnHistory).toHaveLength(2);
  });

  it('rejects unknown teams and stale revisions', () => {
    const session = create();
    expect(() => session.assertRevision(1)).toThrow(
      expect.objectContaining({ code: 'STALE_REVISION' }),
    );
    session.markReady(now);
    session.start(now);
    expect(() => session.startTurn('browser-supplied-id', 'bad', now)).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_TEAM' }),
    );
  });

  it('recognizes completed command ids for retry idempotency', () => {
    const session = create();
    session.completeCommand('command-1', now);
    expect(session.isDuplicate('command-1')).toBe(true);
    expect(session.revision).toBe(1);
  });

  it('requires a ready enrolled player for every active team', () => {
    const session = create();
    for (const [index, team] of session.serialize().teams.entries()) {
      session.enrollParticipant({
        id: `player-${index}`,
        displayName: `Player ${index}`,
        teamId: team.id,
        role: 'team-player',
        joinRequestId: `join-${index}`,
        now,
      });
    }
    session.setParticipantReady('player-0', true, now);
    session.setParticipantReady('player-1', true, now);
    expect(() => session.markReady(now)).toThrow(
      expect.objectContaining({ code: 'SESSION_NOT_READY' }),
    );
    session.setParticipantReady('player-2', true, now);
    expect(() => session.markReady(now)).not.toThrow();
  });

  it('keeps enrollment idempotent and revokes removed participants', () => {
    const session = create();
    const teamId = session.serialize().teams[0].id;
    const first = session.enrollParticipant({
      id: 'player-1',
      displayName: ' Player ',
      teamId,
      role: 'team-player',
      joinRequestId: 'join-1',
      now,
    });
    const retried = session.enrollParticipant({
      displayName: 'Ignored',
      role: 'team-player',
      joinRequestId: 'join-1',
      now,
    });
    expect(retried.id).toBe(first.id);
    expect(() =>
      session.enrollParticipant({
        displayName: 'player',
        role: 'team-player',
        joinRequestId: 'join-2',
        now,
      }),
    ).toThrow(expect.objectContaining({ code: 'DISPLAY_NAME_TAKEN' }));
    session.removeParticipant('player-1', now);
    expect(session.participantById('player-1')).toMatchObject({
      removedAt: now,
      credentialVersion: 2,
      ready: false,
    });
    expect(() => session.setParticipantReady('player-1', true, now)).toThrow(
      expect.objectContaining({ code: 'PARTICIPANT_REMOVED' }),
    );
  });
});
