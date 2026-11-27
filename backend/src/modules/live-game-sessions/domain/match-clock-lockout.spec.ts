import {
  BOMB_TEAM_CLOCK_MS,
  CORE_TIMED_TURNS_MODE,
} from './live-game-mode.registry';
import { LiveGameSession } from './live-game-session';

/**
 * The lockout a Unified Match used to reach, and must not reach again.
 *
 * A Match plays twelve challenges on one session whose teams were handed a
 * single budget when the room opened. القنبلة overwrote that budget with its own
 * 30 seconds, أفضل 5 burned it a card at a time, and the result screen kept it
 * running — so a mid-match launch met a spent clock and was refused with
 * `TEAM_NOT_ELIGIBLE`, with no way back. Time now measures; it does not refuse.
 */
describe('a spent team clock never locks a Match out', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const later = (ms: number) => new Date(now.getTime() + ms);

  function started() {
    const session = LiveGameSession.create({
      id: 'session-id',
      controllerActorId: 'actor-1',
      controllerDisplayName: 'Host',
      teamNames: ['One', 'Two'],
      reconnectTokenHash: 'hash',
      rules: CORE_TIMED_TURNS_MODE,
      now,
    });
    session.markReady(now);
    session.start(now);
    return session;
  }

  it('starts a turn for a team whose budget is already gone', () => {
    const session = started();
    const [first] = session.serialize().teams;
    // The whole match-long budget, burned by earlier challenges.
    session.startTurn(first.id, 'earlier-challenge', now);
    const spent = later(CORE_TIMED_TURNS_MODE.initialTeamDurationMs + 10_000);
    session.releaseChallengeTurn('challenge-ended', spent);
    expect(session.serialize().teams[0].clock.consumedMs).toBe(
      CORE_TIMED_TURNS_MODE.initialTeamDurationMs,
    );

    session.startTurn(first.id, 'top5-launch', spent);

    expect(session.serialize().activeTeamId).toBe(first.id);
  });

  it('hands the turn on when both clocks are gone', () => {
    const session = started();
    const [first, second] = session.serialize().teams;
    const spent = later(CORE_TIMED_TURNS_MODE.initialTeamDurationMs + 1_000);
    session.startTurn(first.id, 'earlier-challenge', now);
    session.switchTurn(second.id, 'top5-next-card', spent);
    const drained = later(
      CORE_TIMED_TURNS_MODE.initialTeamDurationMs * 2 + 2_000,
    );

    // أفضل 5 switches after every card; the tenth card must not be the one that
    // breaks the challenge.
    session.switchTurn(undefined, 'top5-next-card', drained);

    expect(session.serialize().activeTeamId).toBe(first.id);
  });

  it('gives the next challenge a fresh budget after القنبلة spent its own', () => {
    const session = started();
    const [first] = session.serialize().teams;
    session.allocateChallengeTeamClocks(BOMB_TEAM_CLOCK_MS, now);
    session.startTurn(first.id, 'bomb-start', now);
    // The round runs out, and the result screen stays up past it.
    const afterBomb = later(BOMB_TEAM_CLOCK_MS + 20_000);
    session.releaseChallengeTurn('challenge-completed', afterBomb);

    session.allocateChallengeTeamClocks(600_000, afterBomb);
    session.startTurn(first.id, 'next-challenge', afterBomb);

    const state = session.serialize();
    expect(state.activeTeamId).toBe(first.id);
    expect(state.teams.every((team) => team.clock.consumedMs === 0)).toBe(true);
  });
});
