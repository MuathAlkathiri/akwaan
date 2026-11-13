import {
  MatchChallengeReadinessService,
  type ReadinessSessionView,
} from './match-challenge-readiness.service';
import { EVERY_TEAM_NEEDS_A_PLAYER } from './match-snapshot.composer';

/**
 * The floor under every challenge, phones or not.
 *
 * A mechanic that wants no phones used to be launchable the moment it was
 * prepared, so a Match started from the waiting room with one side empty would
 * run a challenge that side could never answer. Starting the session is
 * deliberately not blocked — the QR stays up for latecomers — so the block has
 * to live here, at the challenge.
 *
 * It counts joined players, not connected ones: a phone that locked its screen
 * has not left the room, and a mechanic that needs no phones has no reason to
 * care either way.
 */
const TEAM_A = { id: 'team-blue', name: 'الأزرق', active: true };
const TEAM_B = { id: 'team-red', name: 'الأحمر', active: true };

const player = (
  id: string,
  teamId?: string,
  overrides: Partial<ReadinessSessionView['participants'][number]> = {},
) => ({
  id,
  displayName: id,
  role: 'team-player',
  ...(teamId ? { teamId } : {}),
  connected: true,
  ...overrides,
});

const session = (
  participants: ReadinessSessionView['participants'],
): ReadinessSessionView => ({
  teams: [TEAM_A, TEAM_B],
  participants: [
    { id: 'host', displayName: 'المضيف', role: 'controller', connected: true },
    ...participants,
  ],
});

describe('the floor every challenge stands on', () => {
  const service = new MatchChallengeReadinessService();
  const evaluate = (view: ReadinessSessionView) =>
    service.evaluate({ session: view, requirement: EVERY_TEAM_NEEDS_A_PLAYER });

  it('blocks a side with nobody on it, and names it', () => {
    const readiness = evaluate(session([player('r', TEAM_A.id)]));
    expect(readiness.allTeamsReady).toBe(false);
    expect(readiness.blockingReasons).toContainEqual(
      expect.objectContaining({
        code: 'TEAM_NEEDS_MORE_PLAYERS',
        teamName: 'الأحمر',
        connectedCount: 0,
        required: 1,
      }),
    );
  });

  it('blocks an empty room', () => {
    expect(evaluate(session([])).allTeamsReady).toBe(false);
  });

  it('passes once each side has one', () => {
    const readiness = evaluate(
      session([player('r', TEAM_A.id), player('s', TEAM_B.id)]),
    );
    expect(readiness.allTeamsReady).toBe(true);
    expect(readiness.blockingReasons).toEqual([]);
  });

  it('does not count the host as a player', () => {
    // The controller sits on no team; counting them would let a host of one
    // launch a two-team challenge.
    expect(evaluate(session([player('r', TEAM_A.id)])).allTeamsReady).toBe(
      false,
    );
  });

  it('does not count somebody who never picked a side', () => {
    expect(
      evaluate(session([player('r', TEAM_A.id), player('f')])).allTeamsReady,
    ).toBe(false);
  });

  it('counts a player whose phone went to sleep', () => {
    // No phones are needed, so presence is not the question — being on the
    // team is. Dropping them would block a challenge that could be played.
    const readiness = evaluate(
      session([
        player('r', TEAM_A.id),
        player('s', TEAM_B.id, { connected: false }),
      ]),
    );
    expect(readiness.allTeamsReady).toBe(true);
  });

  it('does not count somebody who was removed', () => {
    const readiness = evaluate(
      session([
        player('r', TEAM_A.id),
        player('s', TEAM_B.id, { removedAt: new Date() }),
      ]),
    );
    expect(readiness.allTeamsReady).toBe(false);
  });
});
