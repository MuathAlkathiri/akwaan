import { CORE_TIMED_TURNS_MODE } from '../../live-game-sessions/domain/live-game-mode.registry';
import { LiveGameSession } from '../../live-game-sessions/domain/live-game-session';
import { LiveGameSessionRepository } from '../../live-game-sessions/domain/live-game-session.repository';
import {
  MATCH_CHALLENGE_TEAM_CLOCK_MS,
  allocateSessionClocksForLaunch,
} from './session-clock-allocation';

describe('allocateSessionClocksForLaunch', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  function session(): LiveGameSession {
    const created = LiveGameSession.create({
      id: 'session-id',
      controllerActorId: 'actor-1',
      controllerDisplayName: 'Host',
      teamNames: ['One', 'Two'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now,
    });
    created.markReady(now);
    created.start(now);
    return created;
  }

  function repository(stored: LiveGameSession | null): {
    sessions: LiveGameSessionRepository;
    saved: () => number;
  } {
    let saves = 0;
    return {
      sessions: {
        create: jest.fn(),
        findById: jest.fn().mockResolvedValue(stored),
        findOwnedSessionRefs: jest.fn(),
        findSessionIdsInBombCountdown: jest.fn(),
        save: jest.fn().mockImplementation(() => {
          saves += 1;
          return Promise.resolve();
        }),
      },
      saved: () => saves,
    };
  }

  it('releases a turn the previous challenge left open, then reallocates', async () => {
    const live = session();
    const [first] = live.serialize().teams;
    live.startTurn(first.id, 'previous-challenge', now);
    const { sessions, saved } = repository(live);
    const launchAt = new Date(now.getTime() + 150_000);

    await expect(
      allocateSessionClocksForLaunch({
        sessions,
        sessionId: 'session-id',
        now: launchAt,
      }),
    ).resolves.toBe(true);

    const state = live.serialize();
    expect(state.activeTeamId).toBeUndefined();
    expect(state.teams.every((team) => team.clock.consumedMs === 0)).toBe(true);
    expect(
      state.teams.every(
        (team) => team.clock.allocatedMs === MATCH_CHALLENGE_TEAM_CLOCK_MS,
      ),
    ).toBe(true);
    expect(saved()).toBe(1);
  });

  it('leaves a session that is not playing alone', async () => {
    const waiting = LiveGameSession.create({
      id: 'session-id',
      controllerActorId: 'actor-1',
      controllerDisplayName: 'Host',
      teamNames: ['One', 'Two'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now,
    });
    const { sessions, saved } = repository(waiting);

    await expect(
      allocateSessionClocksForLaunch({
        sessions,
        sessionId: 'session-id',
        now,
      }),
    ).resolves.toBe(false);
    expect(saved()).toBe(0);
  });

  it('reports a missing session instead of failing the launch', async () => {
    const { sessions } = repository(null);

    await expect(
      allocateSessionClocksForLaunch({
        sessions,
        sessionId: 'missing',
        now,
      }),
    ).resolves.toBe(false);
  });
});
