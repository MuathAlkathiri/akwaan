import { GameplayModeState } from './gameplay-mode.plugin';
import { LiveSessionDomainError } from './live-session.errors';
import { EligibleParticipant } from './team-action-assignment';

/**
 * Who holds each team's bomb first, decided before the first picture.
 *
 * **Corrected 2026-11-15 (PO).** Both teams having a holder makes the setup
 * READY; it does not start anything. The host presses Start Challenge, and only
 * then — once the existing Fair-Start requirements are met — does the first
 * picture appear and the clock run. And the choice is the team's **initial**
 * holder only: the first time the bomb reaches that team it goes to them;
 * every handoff after that follows Bomb's existing ownership rules.
 *
 *
 * The approved rule: a team's lobby captain does **not** automatically become
 * the bomb holder — the captain *chooses* the team's holder (themselves
 * included) before the challenge starts. A team with no captain gets its holder
 * automatically from the canonical full-roster rotation. Until both teams have
 * one, the challenge's one-time presentation activation is held, so neither
 * team clock can start while a captain is still choosing.
 *
 * After activation nothing here changes Bomb: the clocks, the handoff between
 * teams, the skip penalty and the disconnect guarantees are the existing ones.
 * There is no voting, no re-selection and no rotation on any handoff.
 */
export interface BombHolderSetupTeam {
  teamId: string;
  /** The lobby captain, locked at Match start; null when the team has none. */
  captainParticipantId: string | null;
  holderParticipantId: string | null;
  /** True when the rotation chose, because the team had no captain. */
  autoAssigned: boolean;
  /**
   * Set once the bomb has reached this team for the first time — the only
   * moment the initial holder is owed it. Absent until then.
   */
  initialTurnTaken?: boolean;
}

export interface BombHolderSetup {
  teams: BombHolderSetupTeam[];
  /** When the host pressed Start Challenge; absent while in setup. */
  startedAt?: string;
}

export const BOMB_CHOOSE_HOLDER_COMMAND = 'choose-bomb-holder';
export const BOMB_START_COMMAND = 'start-bomb-challenge';

export function parseBombHolderSetup(
  state: GameplayModeState,
): BombHolderSetup | undefined {
  if (typeof state.holderSetupJson !== 'string' || !state.holderSetupJson) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(state.holderSetupJson) as BombHolderSetup;
    return Array.isArray(parsed?.teams) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Every team has a holder. A runtime without a setup (legacy) is complete. */
export function isBombHolderSetupComplete(state: GameplayModeState): boolean {
  const setup = parseBombHolderSetup(state);
  return !setup || setup.teams.every((team) => team.holderParticipantId);
}

/** The host has pressed Start. A runtime without a setup (legacy) has. */
export function isBombStarted(state: GameplayModeState): boolean {
  const setup = parseBombHolderSetup(state);
  return !setup || Boolean(setup.startedAt);
}

/**
 * The host's Start Challenge: refused until both teams are READY, and refused
 * a second time. Marks the starting team's initial turn as taken.
 */
export function startBombChallenge(
  state: GameplayModeState,
  input: { startingTeamId?: string; now: Date },
): BombHolderSetup {
  const setup = parseBombHolderSetup(state);
  if (!setup) {
    throw new LiveSessionDomainError(
      'BOMB_START_NOT_AVAILABLE',
      'This Bomb challenge has no setup to start',
    );
  }
  if (setup.startedAt) {
    throw new LiveSessionDomainError(
      'BOMB_ALREADY_STARTED',
      'This Bomb challenge has already been started',
    );
  }
  if (!isBombHolderSetupComplete(state)) {
    throw new LiveSessionDomainError(
      'BOMB_HOLDERS_NOT_READY',
      'Both teams must have a bomb holder before the bomb starts',
    );
  }
  return {
    startedAt: input.now.toISOString(),
    teams: setup.teams.map((team) =>
      team.teamId === input.startingTeamId
        ? { ...team, initialTurnTaken: true }
        : team,
    ),
  };
}

/**
 * Who the bomb goes to when it reaches `teamId` — only on its first arrival,
 * and only if that initial holder is connected. Every later arrival returns
 * undefined, leaving Bomb's existing ownership rule to decide.
 */
export function firstArrivalHolder(
  state: GameplayModeState,
  teamId: string | undefined,
  participants: readonly EligibleParticipant[],
): { setup: BombHolderSetup; participantId?: string } | undefined {
  const setup = parseBombHolderSetup(state);
  const team = setup?.teams.find((entry) => entry.teamId === teamId);
  if (!setup || !team || team.initialTurnTaken) return undefined;
  return {
    setup: {
      ...setup,
      teams: setup.teams.map((entry) =>
        entry.teamId === teamId ? { ...entry, initialTurnTaken: true } : entry,
      ),
    },
    participantId: connectedBombHolder(state, teamId, participants),
  };
}

/**
 * Who may choose for a team right now: the captain while connected; otherwise
 * — the existing fallback pattern — the first connected teammate in roster
 * order. The lobby's captain selection itself never changes.
 */
export function bombHolderChooser(
  team: BombHolderSetupTeam,
  participants: readonly EligibleParticipant[],
): string | undefined {
  const connected = participants.filter(
    (participant) =>
      participant.teamId === team.teamId && participant.connected,
  );
  if (
    team.captainParticipantId &&
    connected.some((p) => p.participantId === team.captainParticipantId)
  ) {
    return team.captainParticipantId;
  }
  return connected[0]?.participantId;
}

/** The team's chosen holder, if they are connected right now. */
export function connectedBombHolder(
  state: GameplayModeState,
  teamId: string | undefined,
  participants: readonly EligibleParticipant[],
): string | undefined {
  const holder = parseBombHolderSetup(state)?.teams.find(
    (team) => team.teamId === teamId,
  )?.holderParticipantId;
  return holder &&
    participants.some(
      (participant) =>
        participant.participantId === holder &&
        participant.teamId === teamId &&
        participant.connected,
    )
    ? holder
    : undefined;
}

/** Apply a chooser's pick, enforcing every rule server-side. */
export function chooseBombHolder(
  state: GameplayModeState,
  input: {
    submitterParticipantId?: string;
    participantId: unknown;
    participants: readonly EligibleParticipant[];
  },
): { setup: BombHolderSetup; team: BombHolderSetupTeam } {
  const setup = parseBombHolderSetup(state);
  // A READY team may still change its mind until the host presses Start.
  if (!setup || setup.startedAt) {
    throw new LiveSessionDomainError(
      'BOMB_HOLDER_SETUP_CLOSED',
      'The bomb has started; its initial holders are fixed',
    );
  }
  const submitterTeamId = input.participants.find(
    (participant) => participant.participantId === input.submitterParticipantId,
  )?.teamId;
  const team = setup.teams.find((entry) => entry.teamId === submitterTeamId);
  if (!team || !input.submitterParticipantId) {
    throw new LiveSessionDomainError(
      'BOMB_NOT_HOLDER_CHOOSER',
      'Only a player of a team in this challenge may choose its holder',
    );
  }
  if (team.autoAssigned) {
    throw new LiveSessionDomainError(
      'BOMB_HOLDER_AUTO_ASSIGNED',
      'This team has no captain; its holder was assigned automatically',
    );
  }
  if (
    bombHolderChooser(team, input.participants) !== input.submitterParticipantId
  ) {
    throw new LiveSessionDomainError(
      'BOMB_NOT_HOLDER_CHOOSER',
      "Only the team's captain chooses its bomb holder",
    );
  }
  const target = String(input.participantId ?? '');
  if (
    !input.participants.some(
      (participant) =>
        participant.participantId === target &&
        participant.teamId === team.teamId &&
        participant.connected,
    )
  ) {
    throw new LiveSessionDomainError(
      'BOMB_HOLDER_NOT_ELIGIBLE',
      'The bomb holder must be a connected player on the same team',
    );
  }
  const chosen = { ...team, holderParticipantId: target };
  return {
    setup: {
      teams: setup.teams.map((entry) =>
        entry.teamId === team.teamId ? chosen : entry,
      ),
    },
    team: chosen,
  };
}
