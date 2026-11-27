import {
  BOMB_TEAM_CLOCK_MS,
  CORE_TIMED_TURNS_MODE,
} from '../../live-game-sessions/domain/live-game-mode.registry';
import { LiveGameSession } from '../../live-game-sessions/domain/live-game-session';
import { LiveGameSessionRepository } from '../../live-game-sessions/domain/live-game-session.repository';
import {
  MATCH_CHALLENGE_TEAM_CLOCK_MS,
  allocateSessionClocksForLaunch,
} from './session-clock-allocation';
import { releaseSessionTurnForBoardReturn } from './session-turn-release';

/**
 * A whole evening on one session.
 *
 * The lockout this guards against never showed in a single challenge — it took
 * a Match long enough for one budget to drain across several. So this plays the
 * shapes a real board produces, back to back and with the untidy endings a real
 * room produces, and asserts the one property that matters at every launch:
 * the clocks a challenge starts on are its own.
 */
describe('team clocks across a full Match', () => {
  const start = new Date('2026-01-01T18:00:00.000Z');
  let clock = start.getTime();
  const now = () => new Date(clock);
  const pass = (ms: number) => {
    clock += ms;
  };

  function room() {
    const session = LiveGameSession.create({
      id: 'session-id',
      controllerActorId: 'actor-1',
      controllerDisplayName: 'Host',
      teamNames: ['One', 'Two'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now: now(),
    });
    session.markReady(now());
    session.start(now());
    const sessions = {
      create: jest.fn(),
      findById: jest.fn().mockResolvedValue(session),
      findOwnedSessionRefs: jest.fn(),
      findSessionIdsInBombCountdown: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as LiveGameSessionRepository;
    return { session, sessions };
  }

  const launch = (sessions: LiveGameSessionRepository) =>
    allocateSessionClocksForLaunch({
      sessions,
      sessionId: 'session-id',
      now: now(),
    });
  const finish = (sessions: LiveGameSessionRepository) =>
    releaseSessionTurnForBoardReturn({
      sessions,
      sessionId: 'session-id',
      reason: 'challenge-completed',
      now: now(),
    });

  const fresh = (session: LiveGameSession, allocatedMs: number) => {
    const state = session.serialize();
    expect(state.activeTeamId).toBeUndefined();
    for (const team of state.teams) {
      expect(team.clock).toMatchObject({
        allocatedMs,
        consumedMs: 0,
        running: false,
      });
    }
  };

  beforeEach(() => {
    clock = start.getTime();
  });

  it('starts every one of twelve challenges on its own clocks', async () => {
    const { session, sessions } = room();
    const [one, two] = session.serialize().teams;

    for (let position = 0; position < 12; position += 1) {
      await launch(sessions);
      fresh(session, MATCH_CHALLENGE_TEAM_CLOCK_MS);

      if (position % 3 === 0) {
        // القنبلة: its own 30 seconds, burned to the last one.
        session.allocateChallengeTeamClocks(BOMB_TEAM_CLOCK_MS, now());
        fresh(session, BOMB_TEAM_CLOCK_MS);
        session.startTurn(one.id, 'bomb-start', now());
        pass(12_000);
        session.switchTurn(undefined, 'bomb-answer-correct', now());
        pass(BOMB_TEAM_CLOCK_MS + 5_000);
      } else if (position % 3 === 1) {
        // أفضل 5: ten cards, a switch after each, players who think out loud.
        session.startTurn(two.id, 'top5-start', now());
        for (let card = 0; card < 10; card += 1) {
          pass(45_000);
          session.switchTurn(undefined, 'top5-next-card', now());
        }
      } else {
        // مين أقرب / اقرأ خصمك: never take a session turn at all.
        pass(90_000);
      }

      await finish(sessions);
      // The result screen, the board, the scope picker, the explainer.
      pass(4 * 60_000);
    }
  });

  it('survives a challenge that never handed its turn back', async () => {
    const { session, sessions } = room();
    const [one] = session.serialize().teams;

    await launch(sessions);
    session.allocateChallengeTeamClocks(BOMB_TEAM_CLOCK_MS, now());
    session.startTurn(one.id, 'bomb-start', now());
    // The runtime is abandoned mid-turn: no completion, no board return, and
    // the room comes back twenty minutes later.
    pass(20 * 60_000);

    await launch(sessions);

    fresh(session, MATCH_CHALLENGE_TEAM_CLOCK_MS);
    session.startTurn(one.id, 'top5-start', now());
    expect(session.serialize().activeTeamId).toBe(one.id);
  });

  it('gives a second القنبلة the same thirty seconds as the first', async () => {
    const { session, sessions } = room();
    const [one, two] = session.serialize().teams;

    for (let round = 0; round < 3; round += 1) {
      await launch(sessions);
      session.allocateChallengeTeamClocks(BOMB_TEAM_CLOCK_MS, now());
      session.startTurn(round % 2 ? two.id : one.id, 'bomb-start', now());
      pass(BOMB_TEAM_CLOCK_MS + 1_000);
      await finish(sessions);
      pass(10 * 60_000);
    }

    await launch(sessions);
    session.allocateChallengeTeamClocks(BOMB_TEAM_CLOCK_MS, now());
    fresh(session, BOMB_TEAM_CLOCK_MS);
  });
});
