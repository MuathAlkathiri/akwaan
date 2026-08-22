/**
 * The canonical participant predicate shared by Match preflight and mechanics.
 *
 * Presence is authoritative socket state merged by the session repository.
 * `ready` is deliberately opt-in: an active Unified Match admits phones during
 * preflight, after the lobby-only ready mutation has closed. Legacy Bomb startup
 * still opts into ready because its countdown is explicitly readiness-driven.
 */
export interface TeamParticipantEligibilityCandidate {
  id: string;
  role: string;
  teamId?: string;
  ready?: boolean;
  connected: boolean;
  removedAt?: Date;
}

export interface TeamParticipantEligibility {
  teamId: string;
  requiresConnectedPresence: boolean;
  requiresReady?: boolean;
}

export function isEligibleTeamParticipant(
  participant: TeamParticipantEligibilityCandidate,
  requirement: TeamParticipantEligibility,
): boolean {
  return (
    participant.role === 'team-player' &&
    participant.teamId === requirement.teamId &&
    !participant.removedAt &&
    (!requirement.requiresConnectedPresence || participant.connected) &&
    (!requirement.requiresReady || participant.ready === true)
  );
}

export function findEligibleTeamParticipant<
  T extends TeamParticipantEligibilityCandidate,
>(
  participants: readonly T[],
  requirement: TeamParticipantEligibility,
): T | undefined {
  return participants.find((participant) =>
    isEligibleTeamParticipant(participant, requirement),
  );
}
