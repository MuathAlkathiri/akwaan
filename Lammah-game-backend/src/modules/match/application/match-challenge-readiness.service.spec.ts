import { MatchChallengeReadinessRequirement } from '../domain/match-challenge-readiness';
import {
  MatchChallengeReadinessService,
  ReadinessSessionView,
} from './match-challenge-readiness.service';
import { DistributedInformationChallengeLauncher } from './distributed-information-challenge.launcher';
import { RyoChallengeLauncher } from './ryo-challenge.launcher';
import { Top10PoisonDeckChallengeLauncher } from './top10-poison-deck-challenge.launcher';

const TEAM_A = { id: 'team-a', name: 'البنفسجي', active: true };
const TEAM_B = { id: 'team-b', name: 'الأخضر', active: true };

const service = new MatchChallengeReadinessService();

/**
 * The requirements the *real* launchers declare.
 *
 * Read off real instances rather than restated here, so this suite tests the
 * shipped contract: if a mechanic changes what it needs, these tests change with
 * it instead of quietly passing against a copy. The constructors only store their
 * dependencies, so none are needed to read a declared constant.
 */
const construct = <T>(Launcher: new (...args: never[]) => T): T =>
  new Launcher(...([undefined, undefined, undefined] as never[]));

const distributed = construct(DistributedInformationChallengeLauncher)
  .launchRequirements.readiness as MatchChallengeReadinessRequirement;
const ryo = construct(RyoChallengeLauncher).launchRequirements
  .readiness as MatchChallengeReadinessRequirement;
const top10 = construct(Top10PoisonDeckChallengeLauncher).launchRequirements
  .readiness as MatchChallengeReadinessRequirement;

const player = (
  id: string,
  teamId: string | undefined,
  overrides: Partial<ReadinessSessionView['participants'][number]> = {},
) => ({
  id,
  displayName: id,
  role: 'team-player',
  ...(teamId ? { teamId } : {}),
  connected: true,
  ...overrides,
});

/** A session with the given number of connected phones on each team. */
const session = (
  perTeam: { a: number; b: number },
  extra: ReadinessSessionView['participants'] = [],
): ReadinessSessionView => ({
  teams: [TEAM_A, TEAM_B],
  participants: [
    // Every session carries its host as a controller; it is never a player.
    {
      id: 'host',
      displayName: 'المتحكّم',
      role: 'controller',
      connected: true,
    },
    ...Array.from({ length: perTeam.a }, (_, index) =>
      player(`a${index}`, TEAM_A.id),
    ),
    ...Array.from({ length: perTeam.b }, (_, index) =>
      player(`b${index}`, TEAM_B.id),
    ),
    ...extra,
  ],
});

const evaluate = (
  view: ReadinessSessionView,
  requirement: MatchChallengeReadinessRequirement,
) => service.evaluate({ session: view, requirement });

describe('MatchChallengeReadinessService', () => {
  describe('ركّبها — the two-or-three range from its own launcher', () => {
    it('states the range the runtime enforces', () => {
      expect(distributed).toEqual({
        minParticipantsPerTeam: 2,
        maxParticipantsPerTeam: 3,
        requiresBothTeams: true,
        requiresTeamAssignment: true,
        requiresConnectedPresence: true,
      });
    });

    it('accepts two connected players per team', () => {
      const readiness = evaluate(session({ a: 2, b: 2 }), distributed);
      expect(readiness.allTeamsReady).toBe(true);
      expect(readiness.blockingReasons).toEqual([]);
      expect(readiness.teams.map((team) => team.connectedCount)).toEqual([
        2, 2,
      ]);
    });

    it('accepts three connected players per team', () => {
      expect(evaluate(session({ a: 3, b: 3 }), distributed).allTeamsReady).toBe(
        true,
      );
    });

    it('accepts a mixed two and three', () => {
      expect(evaluate(session({ a: 2, b: 3 }), distributed).allTeamsReady).toBe(
        true,
      );
    });

    it('rejects a team with one player, naming that team', () => {
      const readiness = evaluate(session({ a: 1, b: 2 }), distributed);
      expect(readiness.allTeamsReady).toBe(false);
      expect(readiness.blockingReasons).toEqual([
        {
          code: 'TEAM_NEEDS_MORE_PLAYERS',
          teamId: TEAM_A.id,
          teamName: TEAM_A.name,
          connectedCount: 1,
          required: 2,
        },
      ]);
      expect(readiness.teams[0].ready).toBe(false);
      // The other team is still reported as ready.
      expect(readiness.teams[1].ready).toBe(true);
    });

    it('rejects a team with four players', () => {
      const readiness = evaluate(session({ a: 4, b: 2 }), distributed);
      expect(readiness.allTeamsReady).toBe(false);
      expect(readiness.blockingReasons).toEqual([
        {
          code: 'TEAM_HAS_TOO_MANY_PLAYERS',
          teamId: TEAM_A.id,
          teamName: TEAM_A.name,
          connectedCount: 4,
          required: 3,
        },
      ]);
    });

    it('requires both teams, not just one', () => {
      expect(evaluate(session({ a: 2, b: 0 }), distributed).allTeamsReady).toBe(
        false,
      );
    });

    it('does not count a disconnected phone', () => {
      const view = session({ a: 1, b: 2 }, [
        player('a-away', TEAM_A.id, { connected: false }),
      ]);
      const readiness = evaluate(view, distributed);
      expect(readiness.teams[0].connectedCount).toBe(1);
      expect(readiness.allTeamsReady).toBe(false);
      // The phone is still listed, so the host can see who dropped.
      expect(
        readiness.teams[0].participants.find(
          (participant) => participant.participantId === 'a-away',
        ),
      ).toMatchObject({ connected: false });
    });

    it('does not count a removed phone', () => {
      const view = session({ a: 2, b: 2 }, [
        player('a-gone', TEAM_A.id, { removedAt: new Date() }),
      ]);
      expect(evaluate(view, distributed).teams[0].connectedCount).toBe(2);
    });

    it('does not count the controller as a player', () => {
      const readiness = evaluate(session({ a: 2, b: 2 }), distributed);
      expect(readiness.teams.flatMap((team) => team.participants)).toHaveLength(
        4,
      );
      expect(
        readiness.teams
          .flatMap((team) => team.participants)
          .some((participant) => participant.participantId === 'host'),
      ).toBe(false);
    });

    it('does not count a phone with no team', () => {
      const view = session({ a: 2, b: 2 }, [player('drifter', undefined)]);
      expect(
        evaluate(view, distributed).teams.map((team) => team.connectedCount),
      ).toEqual([2, 2]);
    });
  });

  /**
   * RYO and Top 10 resolve from one phone per team, so they must not inherit
   * ركّبها's two-or-three range.
   */
  describe('RYO and Top 10 — one phone per team, no upper bound', () => {
    it.each([
      ['RYO', ryo],
      ['Top 10', top10],
    ])('%s declares its own contract', (_name, requirement) => {
      expect(requirement).toEqual({
        minParticipantsPerTeam: 1,
        requiresBothTeams: true,
        requiresTeamAssignment: true,
        requiresConnectedPresence: true,
      });
      expect(requirement.maxParticipantsPerTeam).toBeUndefined();
    });

    it.each([
      ['RYO', ryo],
      ['Top 10', top10],
    ])('%s is ready with one phone per team', (_name, requirement) => {
      expect(evaluate(session({ a: 1, b: 1 }), requirement).allTeamsReady).toBe(
        true,
      );
    });

    it.each([
      ['RYO', ryo],
      ['Top 10', top10],
    ])('%s accepts more phones than ركّبها would', (_name, requirement) => {
      // Four per team is too many for ركّبها and fine here.
      expect(evaluate(session({ a: 4, b: 4 }), requirement).allTeamsReady).toBe(
        true,
      );
      expect(evaluate(session({ a: 4, b: 4 }), distributed).allTeamsReady).toBe(
        false,
      );
    });

    it.each([
      ['RYO', ryo],
      ['Top 10', top10],
    ])('%s still needs a phone on each team', (_name, requirement) => {
      expect(evaluate(session({ a: 2, b: 0 }), requirement).allTeamsReady).toBe(
        false,
      );
    });
  });

  it('refuses a session that does not have two teams', () => {
    const readiness = evaluate(
      { teams: [TEAM_A], participants: [player('a0', TEAM_A.id)] },
      ryo,
    );
    expect(readiness.allTeamsReady).toBe(false);
    expect(readiness.blockingReasons).toEqual([
      { code: 'MATCH_REQUIRES_TWO_TEAMS' },
    ]);
  });

  it('reports the bounds it measured against', () => {
    const readiness = evaluate(session({ a: 2, b: 2 }), distributed);
    expect(readiness.teams[0]).toMatchObject({
      teamId: TEAM_A.id,
      teamName: TEAM_A.name,
      minimum: 2,
      maximum: 3,
    });
    expect(readiness.teams[0].participants).toEqual([
      { participantId: 'a0', displayName: 'a0', connected: true },
      { participantId: 'a1', displayName: 'a1', connected: true },
    ]);
  });
});
