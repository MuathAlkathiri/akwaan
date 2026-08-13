import { LiveSessionDomainError } from './live-session.errors';

/**
 * One authoritative participant per team action.
 *
 * Some mechanics are played by a *team* — the whole team may argue about the
 * card, but exactly one person presses the button. This module owns that idea
 * for every mechanic that opts into it, so no mechanic invents its own notion of
 * "whose turn it is", and no client ever decides who is allowed to act.
 *
 * Deliberately *not* forced on every mechanic (roadmap 0.1 / 0.3): a mechanic
 * built on distributed information, simultaneous voting, or per-participant
 * submission has different semantics and must keep them. A mechanic opts in by
 * building rotations at start and calling {@link assignNextTeamAction} whenever
 * its team owes an authoritative action.
 *
 * Everything here is pure. Randomness enters exactly once, at construction, as
 * an injected index — so a rotation is reproducible in a test and is persisted
 * rather than re-rolled on every read.
 */

/** One team's stable participant order and where its next action lands. */
export interface TeamRotation {
  teamId: string;
  /**
   * The team's participants in the order they will act. Fixed for the whole
   * challenge: a participant who disconnects and returns keeps their place
   * rather than being shuffled to the end.
   */
  order: string[];
  /** Index into `order` of the participant who takes the team's *next* action. */
  cursor: number;
}

/** Who is authoritative for one team action, right now. */
export interface TeamActionAssignment {
  teamId: string;
  participantId: string;
  /** The mechanic-defined role, e.g. `top5.decision` or `ryo.answer`. */
  action: string;
  /**
   * Monotonic within a challenge. A command that names an older sequence is
   * acting on an assignment the server has already moved past, and is refused
   * rather than silently applied to whatever is current.
   */
  sequence: number;
}

/** A participant the assignment layer is allowed to hand an action to. */
export interface EligibleParticipant {
  participantId: string;
  teamId?: string;
  connected: boolean;
}

export interface TeamActionAssignmentState {
  rotations: TeamRotation[];
  /** Every currently open assignment, keyed by action. At most one per action. */
  assignments: TeamActionAssignment[];
  nextSequence: number;
}

export const TEAM_ACTION_ASSIGNMENT_ERRORS = {
  NO_ELIGIBLE_PARTICIPANT: 'TEAM_ACTION_NO_ELIGIBLE_PARTICIPANT',
  NOT_ASSIGNED: 'TEAM_ACTION_NOT_ASSIGNED',
  WRONG_TEAM: 'TEAM_ACTION_WRONG_TEAM',
  WRONG_PARTICIPANT: 'TEAM_ACTION_WRONG_PARTICIPANT',
  STALE_ASSIGNMENT: 'TEAM_ACTION_STALE_ASSIGNMENT',
} as const;

/** Only a connected team-player of a known team may ever hold an action. */
export function eligibleFor(
  teamId: string,
  participants: readonly EligibleParticipant[],
): string[] {
  return participants
    .filter(
      (participant) =>
        participant.teamId === teamId &&
        participant.connected &&
        Boolean(participant.participantId),
    )
    .map((participant) => participant.participantId);
}

/**
 * Builds each team's rotation once, at challenge start.
 *
 * `randomIndex` is injected rather than called for: the starting position is
 * randomised exactly once here and then persisted, so a refresh, a reconnect, or
 * a replayed read all see the same rotation. A team of one naturally receives
 * every action.
 */
export function buildTeamRotations(input: {
  teams: readonly string[];
  participants: readonly EligibleParticipant[];
  randomIndex: (exclusiveMax: number) => number;
}): TeamRotation[] {
  return input.teams.map((teamId) => {
    const order = eligibleFor(teamId, input.participants);
    if (!order.length) {
      throw new LiveSessionDomainError(
        TEAM_ACTION_ASSIGNMENT_ERRORS.NO_ELIGIBLE_PARTICIPANT,
        `Team ${teamId} has no connected player to act for it`,
      );
    }
    return { teamId, order, cursor: input.randomIndex(order.length) };
  });
}

export function createTeamActionAssignmentState(
  rotations: TeamRotation[],
): TeamActionAssignmentState {
  return { rotations, assignments: [], nextSequence: 1 };
}

function rotationOf(
  state: TeamActionAssignmentState,
  teamId: string,
): TeamRotation {
  const rotation = state.rotations.find(
    (candidate) => candidate.teamId === teamId,
  );
  if (!rotation) {
    throw new LiveSessionDomainError(
      TEAM_ACTION_ASSIGNMENT_ERRORS.WRONG_TEAM,
      `No participant rotation exists for team ${teamId}`,
    );
  }
  return rotation;
}

/**
 * The next eligible participant for a team, starting at its cursor.
 *
 * Walks the rotation rather than filtering it, so a disconnected player is
 * skipped without being removed: when they come back they are still in the
 * order, in their original position, and simply become eligible again on a
 * future turn.
 */
function nextEligible(
  rotation: TeamRotation,
  eligible: readonly string[],
): { participantId: string; cursor: number } {
  for (let step = 0; step < rotation.order.length; step += 1) {
    const cursor = (rotation.cursor + step) % rotation.order.length;
    const participantId = rotation.order[cursor];
    if (eligible.includes(participantId)) return { participantId, cursor };
  }
  // Someone joined this team after the challenge started and is the only one
  // left connected. Appending is the only way the team can keep playing, and it
  // preserves everyone else's position.
  const latecomer = eligible.find((id) => !rotation.order.includes(id));
  if (latecomer) {
    rotation.order = [...rotation.order, latecomer];
    return { participantId: latecomer, cursor: rotation.order.length - 1 };
  }
  throw new LiveSessionDomainError(
    TEAM_ACTION_ASSIGNMENT_ERRORS.NO_ELIGIBLE_PARTICIPANT,
    `Team ${rotation.teamId} has no connected player to act for it`,
  );
}

/**
 * Opens the next authoritative action for one team.
 *
 * Advances that team's cursor past the participant it just picked, so the
 * team's *next* action goes to the next person: A1 → A2 → A1 → A2 for a pair,
 * and the single member of a one-player team every time.
 */
export function assignNextTeamAction(
  state: TeamActionAssignmentState,
  input: {
    teamId: string;
    action: string;
    participants: readonly EligibleParticipant[];
  },
): { state: TeamActionAssignmentState; assignment: TeamActionAssignment } {
  const rotations = state.rotations.map((rotation) => ({
    ...rotation,
    order: [...rotation.order],
  }));
  const working: TeamActionAssignmentState = { ...state, rotations };
  const rotation = rotationOf(working, input.teamId);
  const eligible = eligibleFor(input.teamId, input.participants);
  const picked = nextEligible(rotation, eligible);
  rotation.cursor = (picked.cursor + 1) % rotation.order.length;
  const assignment: TeamActionAssignment = {
    teamId: input.teamId,
    participantId: picked.participantId,
    action: input.action,
    sequence: working.nextSequence,
  };
  return {
    state: {
      rotations,
      assignments: [
        ...working.assignments.filter(
          (candidate) => candidate.action !== input.action,
        ),
        assignment,
      ],
      nextSequence: working.nextSequence + 1,
    },
    assignment,
  };
}

/** Closes an open action without touching the rotation. */
export function clearTeamAction(
  state: TeamActionAssignmentState,
  action: string,
): TeamActionAssignmentState {
  return {
    ...state,
    assignments: state.assignments.filter(
      (candidate) => candidate.action !== action,
    ),
  };
}

export function assignmentFor(
  state: TeamActionAssignmentState,
  action: string,
): TeamActionAssignment | undefined {
  return state.assignments.find((candidate) => candidate.action === action);
}

/**
 * Re-points every open assignment whose holder is no longer eligible.
 *
 * One disconnected player must never freeze the game: the action moves to the
 * next eligible member of the same team's rotation, gets a fresh sequence — so
 * a command the old holder already sent is stale rather than accepted — and the
 * new assignment is persisted like any other.
 */
export function reassignUnavailableActions(
  state: TeamActionAssignmentState,
  participants: readonly EligibleParticipant[],
): { state: TeamActionAssignmentState; changed: TeamActionAssignment[] } {
  let working = state;
  const changed: TeamActionAssignment[] = [];
  for (const assignment of state.assignments) {
    const eligible = eligibleFor(assignment.teamId, participants);
    if (eligible.includes(assignment.participantId)) continue;
    if (!eligible.length) continue;
    const result = assignNextTeamAction(working, {
      teamId: assignment.teamId,
      action: assignment.action,
      participants,
    });
    working = result.state;
    changed.push(result.assignment);
  }
  return { state: working, changed };
}

/**
 * The authorisation gate, server side and mandatory.
 *
 * A command is accepted only from the exact participant the server assigned, on
 * the exact team it assigned, against the exact sequence it published. Wrong
 * team, right team but wrong participant, a stale sequence, and an action with
 * no open assignment are four distinct, deterministic refusals.
 */
export function assertTeamActionAuthorized(
  state: TeamActionAssignmentState,
  input: {
    action: string;
    teamId?: string;
    participantId?: string;
    sequence?: number;
  },
): TeamActionAssignment {
  const assignment = assignmentFor(state, input.action);
  if (!assignment) {
    throw new LiveSessionDomainError(
      TEAM_ACTION_ASSIGNMENT_ERRORS.NOT_ASSIGNED,
      'No team action of this kind is open',
    );
  }
  if (!input.participantId) {
    throw new LiveSessionDomainError(
      TEAM_ACTION_ASSIGNMENT_ERRORS.WRONG_PARTICIPANT,
      'Only the assigned player may take this action',
    );
  }
  if (input.teamId && input.teamId !== assignment.teamId) {
    throw new LiveSessionDomainError(
      TEAM_ACTION_ASSIGNMENT_ERRORS.WRONG_TEAM,
      'This action belongs to the other team',
    );
  }
  if (input.participantId !== assignment.participantId) {
    throw new LiveSessionDomainError(
      TEAM_ACTION_ASSIGNMENT_ERRORS.WRONG_PARTICIPANT,
      'Only the assigned player may take this action',
    );
  }
  if (input.sequence !== undefined && input.sequence !== assignment.sequence) {
    throw new LiveSessionDomainError(
      TEAM_ACTION_ASSIGNMENT_ERRORS.STALE_ASSIGNMENT,
      'This decision was made against an assignment the server has moved past',
    );
  }
  return assignment;
}

/** JSON, because runtime state is a flat map of primitives. */
export function serializeTeamActionAssignments(
  state: TeamActionAssignmentState,
): string {
  return JSON.stringify(state);
}

export function parseTeamActionAssignments(
  value: unknown,
): TeamActionAssignmentState {
  if (typeof value !== 'string' || !value) {
    throw new LiveSessionDomainError(
      'INVALID_TEAM_ACTION_STATE',
      'Team action assignment state is missing',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new LiveSessionDomainError(
      'INVALID_TEAM_ACTION_STATE',
      'Team action assignment state is invalid',
    );
  }
  const candidate = parsed as Partial<TeamActionAssignmentState>;
  if (
    !Array.isArray(candidate.rotations) ||
    !Array.isArray(candidate.assignments) ||
    typeof candidate.nextSequence !== 'number'
  ) {
    throw new LiveSessionDomainError(
      'INVALID_TEAM_ACTION_STATE',
      'Team action assignment state is incomplete',
    );
  }
  return {
    rotations: candidate.rotations.map((rotation) => ({
      teamId: String(rotation.teamId),
      order: [...rotation.order],
      cursor: Number(rotation.cursor),
    })),
    assignments: candidate.assignments.map((assignment) => ({ ...assignment })),
    nextSequence: candidate.nextSequence,
  };
}

/**
 * What every client may know about who is acting.
 *
 * Public on purpose: naming the decision-maker is the point — their teammates
 * need to know who to argue with, and the opposing team needs to know it is
 * waiting. Nothing secret travels with it.
 */
export function projectTeamActionAssignment(
  assignment: TeamActionAssignment | undefined,
): Record<string, string | number | null> {
  return {
    activeTeamId: assignment?.teamId ?? null,
    activeParticipantId: assignment?.participantId ?? null,
    assignmentAction: assignment?.action ?? null,
    assignmentSequence: assignment?.sequence ?? null,
  };
}
