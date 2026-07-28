import { CORE_ROUND_RUNTIME_PLUGIN } from '../domain/gameplay-mode.plugin';
import { GameplayRuntime } from '../domain/gameplay-runtime';
import { CORE_TIMED_TURNS_MODE } from '../domain/live-game-mode.registry';
import { LiveGameSession } from '../domain/live-game-session';
import { GameplayAuthorization } from './gameplay-authorization';

describe('GameplayAuthorization', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('uses server-owned membership for host, active-team, and observer policy', () => {
    const session = LiveGameSession.create({
      id: 'session-1',
      controllerActorId: 'host-1',
      controllerDisplayName: 'Host',
      teamNames: ['One', 'Two'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now,
    });
    const [teamOne, teamTwo] = session.serialize().teams;
    session.enrollParticipant({
      id: 'player-1',
      displayName: 'One',
      teamId: teamOne.id,
      role: 'team-player',
      joinRequestId: 'join-1',
      now,
    });
    session.enrollParticipant({
      id: 'player-2',
      displayName: 'Two',
      teamId: teamTwo.id,
      role: 'team-player',
      joinRequestId: 'join-2',
      now,
    });
    const state = session.serialize();
    state.participants.find((item) => item.id === 'player-1')!.connected = true;
    state.participants.find((item) => item.id === 'player-2')!.connected = true;
    const runtime = GameplayRuntime.create({
      id: 'runtime-1',
      sessionId: session.id,
      plugin: CORE_ROUND_RUNTIME_PLUGIN,
      commandId: 'create',
      actorId: 'host-1',
      now,
      expiresAt: state.expiresAt,
    });
    runtime.start('start', 'host-1', now);
    runtime.createRound(
      {
        commandId: 'round',
        actorId: 'host-1',
        activeTeamId: teamOne.id,
      },
      now,
    );
    const authorization = new GameplayAuthorization();
    expect(
      authorization.can(
        'controller',
        { kind: 'user', actorId: 'host-1' },
        state,
        runtime.serialize(),
      ),
    ).toBe(true);
    const actor = (participantId: string) =>
      ({
        kind: 'participant',
        actorId: participantId,
        participantId,
        sessionId: session.id,
        role: 'team-player',
        credentialVersion: 1,
      }) as const;
    expect(
      authorization.can(
        'active-team-player',
        actor('player-1'),
        state,
        runtime.serialize(),
      ),
    ).toBe(true);
    expect(
      authorization.can(
        'active-team-player',
        actor('player-2'),
        state,
        runtime.serialize(),
      ),
    ).toBe(false);
  });
});
