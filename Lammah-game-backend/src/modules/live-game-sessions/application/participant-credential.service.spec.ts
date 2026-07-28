import { CORE_TIMED_TURNS_MODE } from '../domain/live-game-mode.registry';
import { LiveGameSession } from '../domain/live-game-session';
import { ParticipantCredentialService } from './participant-credential.service';

describe('ParticipantCredentialService', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  function setup() {
    const session = LiveGameSession.create({
      id: 'session-1',
      controllerActorId: 'host-1',
      controllerDisplayName: 'Host',
      teamNames: ['One', 'Two'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now,
    });
    const teamId = session.serialize().teams[0].id;
    session.enrollParticipant({
      id: 'player-1',
      displayName: 'Player',
      teamId,
      role: 'team-player',
      joinRequestId: 'join-1',
      now,
    });
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('participant-token'),
      verifyAsync: jest.fn(),
    };
    const repository = {
      findById: jest.fn().mockResolvedValue(session),
    };
    return {
      session,
      jwt,
      service: new ParticipantCredentialService(
        jwt as never,
        repository as never,
      ),
    };
  }

  it('issues a credential explicitly typed and scoped to one participant', async () => {
    const { service, jwt } = setup();
    await expect(
      service.issue({
        sessionId: 'session-1',
        participantId: 'player-1',
        role: 'team-player',
        credentialVersion: 1,
      }),
    ).resolves.toMatchObject({ credential: 'participant-token' });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenKind: 'live-participant',
        sub: 'player-1',
        sessionId: 'session-1',
      }),
      { expiresIn: 86_400 },
    );
  });

  it('rejects normal user JWTs and revoked credential versions', async () => {
    const { service, jwt, session } = setup();
    jwt.verifyAsync.mockResolvedValue({
      tokenKind: 'user',
      sub: 'player-1',
      sessionId: 'session-1',
      participantId: 'player-1',
      role: 'team-player',
      credentialVersion: 1,
    });
    await expect(service.authenticate('user-token')).rejects.toMatchObject({
      code: 'SESSION_FORBIDDEN',
    });

    session.revokeParticipantCredential('player-1', now);
    jwt.verifyAsync.mockResolvedValue({
      tokenKind: 'live-participant',
      sub: 'player-1',
      sessionId: 'session-1',
      participantId: 'player-1',
      role: 'team-player',
      credentialVersion: 1,
    });
    await expect(service.authenticate('old-token')).rejects.toMatchObject({
      code: 'SESSION_FORBIDDEN',
    });
  });
});
