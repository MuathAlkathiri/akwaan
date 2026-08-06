import { Injectable } from '@nestjs/common';
import { MatchChallengeReadinessRequirement } from '../domain/match-challenge-readiness';

/** What the preflight needs to know about one team's phones. */
export interface MatchTeamReadiness {
  teamId: string;
  teamName: string;
  connectedCount: number;
  minimum: number;
  maximum?: number;
  ready: boolean;
  participants: Array<{
    participantId: string;
    displayName: string;
    connected: boolean;
  }>;
}

export interface MatchChallengeReadiness {
  requirement: MatchChallengeReadinessRequirement;
  teams: MatchTeamReadiness[];
  allTeamsReady: boolean;
  /** Machine-readable, one per unmet condition. */
  blockingReasons: MatchReadinessBlocker[];
}

export type MatchReadinessBlockerCode =
  | 'TEAM_NEEDS_MORE_PLAYERS'
  | 'TEAM_HAS_TOO_MANY_PLAYERS'
  | 'MATCH_REQUIRES_TWO_TEAMS';

export interface MatchReadinessBlocker {
  code: MatchReadinessBlockerCode;
  teamId?: string;
  teamName?: string;
  /** How many are connected now, and the bound that was missed. */
  connectedCount?: number;
  required?: number;
}

/** Just enough of a live session to count its phones. */
export interface ReadinessSessionView {
  teams: Array<{ id: string; name: string; active: boolean }>;
  participants: Array<{
    id: string;
    displayName: string;
    role: string;
    teamId?: string;
    connected: boolean;
    removedAt?: Date;
  }>;
}

/**
 * Whether the phones a mechanic needs are actually in the room.
 *
 * The requirement comes from the mechanic's launcher; this only counts against it.
 * A controller is never a player, a removed participant is not in the room, and a
 * phone that joined but is not connected does not count when the mechanic says
 * presence matters — which is exactly what the runtimes themselves check, so a
 * preflight that says ready cannot be contradicted a moment later by startup.
 */
@Injectable()
export class MatchChallengeReadinessService {
  evaluate(input: {
    session: ReadinessSessionView;
    requirement: MatchChallengeReadinessRequirement;
  }): MatchChallengeReadiness {
    const { requirement } = input;
    const activeTeams = input.session.teams.filter((team) => team.active);
    const blockingReasons: MatchReadinessBlocker[] = [];
    if (requirement.requiresBothTeams && activeTeams.length !== 2) {
      blockingReasons.push({ code: 'MATCH_REQUIRES_TWO_TEAMS' });
    }

    const teams = activeTeams.map((team) => {
      const players = input.session.participants.filter(
        (participant) =>
          // A controller is present in every session and is never a player.
          participant.role === 'team-player' &&
          !participant.removedAt &&
          (requirement.requiresTeamAssignment
            ? participant.teamId === team.id
            : true),
      );
      const counted = requirement.requiresConnectedPresence
        ? players.filter((participant) => participant.connected)
        : players;
      const connectedCount = counted.length;
      const belowMinimum = connectedCount < requirement.minParticipantsPerTeam;
      const aboveMaximum =
        requirement.maxParticipantsPerTeam !== undefined &&
        connectedCount > requirement.maxParticipantsPerTeam;
      if (belowMinimum) {
        blockingReasons.push({
          code: 'TEAM_NEEDS_MORE_PLAYERS',
          teamId: team.id,
          teamName: team.name,
          connectedCount,
          required: requirement.minParticipantsPerTeam,
        });
      }
      if (aboveMaximum) {
        blockingReasons.push({
          code: 'TEAM_HAS_TOO_MANY_PLAYERS',
          teamId: team.id,
          teamName: team.name,
          connectedCount,
          required: requirement.maxParticipantsPerTeam,
        });
      }
      return {
        teamId: team.id,
        teamName: team.name,
        connectedCount,
        minimum: requirement.minParticipantsPerTeam,
        ...(requirement.maxParticipantsPerTeam !== undefined
          ? { maximum: requirement.maxParticipantsPerTeam }
          : {}),
        ready: !belowMinimum && !aboveMaximum,
        participants: players.map((participant) => ({
          participantId: participant.id,
          displayName: participant.displayName,
          connected: participant.connected,
        })),
      };
    });

    return {
      requirement,
      teams,
      allTeamsReady: blockingReasons.length === 0 && teams.length > 0,
      blockingReasons,
    };
  }
}
