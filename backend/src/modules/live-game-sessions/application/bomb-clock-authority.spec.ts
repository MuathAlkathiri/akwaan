import { assertBombClockExpired } from './submit-gameplay-command.use-case';
import { LiveGameSessionState } from '../domain/live-game-session';

/**
 * The server-side authority behind `expire-team`.
 *
 * Bomb's countdown is rendered on every client, and until now a client whose
 * countdown reached zero sent `expire-team` itself. That trigger is gone — the
 * scheduler owns expiry — but the command is still reachable over the socket
 * and over HTTP by any controller or active participant, so the guard has to
 * hold on its own. These pin the two ways it can be asked to lie: a clock that
 * still has time, and a session where no clock is running at all.
 */

const START = Date.parse('2026-08-14T00:00:00.000Z');

function session(
  overrides: {
    activeTeamId?: string;
    running?: boolean;
    startedAt?: Date;
    allocatedMs?: number;
    consumedMs?: number;
  } = {},
): LiveGameSessionState {
  return {
    activeTeamId:
      'activeTeamId' in overrides ? overrides.activeTeamId : 'team-1',
    teams: [
      {
        id: 'team-1',
        name: 'One',
        active: true,
        clock: {
          running: overrides.running ?? true,
          startedAt:
            'startedAt' in overrides ? overrides.startedAt : new Date(START),
          allocatedMs: overrides.allocatedMs ?? 60_000,
          consumedMs: overrides.consumedMs ?? 0,
        },
      },
      {
        id: 'team-2',
        name: 'Two',
        active: true,
        clock: {
          running: false,
          allocatedMs: 60_000,
          consumedMs: 0,
        },
      },
    ],
  } as unknown as LiveGameSessionState;
}

describe('bomb expire-team clock authority', () => {
  it('refuses a clock that still has time, however far in the future the caller claims to be', () => {
    // The client-drift case, and the reason a client countdown can never be an
    // authority: the sender's opinion of "now" is not an input here.
    expect(() =>
      assertBombClockExpired(session(), new Date(START + 59_999)),
    ).toThrow(/BOMB_CLOCK_NOT_EXPIRED|has not expired/);
  });

  it('refuses one millisecond early', () => {
    expect(() =>
      assertBombClockExpired(
        session({ allocatedMs: 30_000 }),
        new Date(START + 29_999),
      ),
    ).toThrow(/has not expired/);
  });

  it('accepts exactly at the deadline', () => {
    expect(() =>
      assertBombClockExpired(
        session({ allocatedMs: 30_000 }),
        new Date(START + 30_000),
      ),
    ).not.toThrow();
  });

  it('accounts for time already consumed by earlier turns', () => {
    const state = session({ allocatedMs: 60_000, consumedMs: 45_000 });
    expect(() =>
      assertBombClockExpired(state, new Date(START + 14_999)),
    ).toThrow(/has not expired/);
    expect(() =>
      assertBombClockExpired(state, new Date(START + 15_000)),
    ).not.toThrow();
  });

  it('refuses when no team holds the turn', () => {
    // Previously accepted: with no active team the remaining time computed as
    // zero and the guard fell open, so an `expire-team` sent after the host
    // ended the turn could decide the challenge whenever the sender liked.
    expect(() =>
      assertBombClockExpired(
        session({ activeTeamId: undefined }),
        new Date(START + 1_000),
      ),
    ).toThrow(/BOMB_NO_ACTIVE_TEAM|No team holds the turn/);
  });

  it('refuses when the active team id matches no team', () => {
    expect(() =>
      assertBombClockExpired(
        session({ activeTeamId: 'team-does-not-exist' }),
        new Date(START + 1_000),
      ),
    ).toThrow(/No team holds the turn/);
  });

  it('still expires a stopped clock that is genuinely spent', () => {
    // Pausing stops the ticking; it does not give the time back. A clock whose
    // whole budget is consumed has passed its deadline either way.
    expect(() =>
      assertBombClockExpired(
        session({ running: false, startedAt: undefined, consumedMs: 60_000 }),
        new Date(START + 1_000),
      ),
    ).not.toThrow();
  });

  it('refuses a stopped clock that still has budget left', () => {
    expect(() =>
      assertBombClockExpired(
        session({ running: false, startedAt: undefined, consumedMs: 10_000 }),
        new Date(START + 10_000_000),
      ),
    ).toThrow(/has not expired/);
  });
});
