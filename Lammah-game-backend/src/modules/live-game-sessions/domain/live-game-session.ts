import { randomUUID } from 'crypto';
import { LiveGameModeRules } from './live-game-mode.registry';
import {
  LiveSessionDomainError,
  StaleLiveSessionRevisionError,
} from './live-session.errors';
import { TeamClock, TeamClockState } from './team-clock';

export type LiveSessionStatus =
  | 'waiting'
  | 'ready'
  | 'active'
  | 'paused'
  | 'finished'
  | 'cancelled'
  | 'expired';

export interface LiveSessionTeamState {
  id: string;
  name: string;
  active: boolean;
  clock: TeamClockState;
}

export interface LiveSessionParticipantState {
  id: string;
  actorId?: string;
  displayName: string;
  normalizedDisplayName: string;
  role: 'controller' | 'team-player' | 'observer';
  teamId?: string;
  reconnectTokenHash?: string;
  ready: boolean;
  joinedAt: Date;
  connected: boolean;
  connectedDeviceCount: number;
  lastSeenAt: Date;
  credentialVersion: number;
  removedAt?: Date;
  joinRequestId?: string;
  device?: {
    label?: string;
    platform?: string;
  };
}

export interface LiveSessionTurnState {
  sequence: number;
  teamId: string;
  startedAt: Date;
  endedAt?: Date;
  transitionReason: string;
}

export interface LiveSessionResultState {
  reason: string;
  winnerTeamId?: string;
  finishedAt: Date;
  metadata?: Record<string, string | number | boolean>;
}

export interface LiveGameSessionState {
  id: string;
  parentGameId?: string;
  parentGameQuestionId?: string;
  modeKey: string;
  modeVersion: number;
  status: LiveSessionStatus;
  controllerActorId: string;
  teams: LiveSessionTeamState[];
  participants: LiveSessionParticipantState[];
  activeTeamId?: string;
  currentRound: number;
  currentTurn?: LiveSessionTurnState;
  turnHistory: LiveSessionTurnState[];
  processedCommandIds: string[];
  createdAt: Date;
  startedAt?: Date;
  countdownEndsAt?: Date;
  lastTransitionAt: Date;
  expiresAt: Date;
  revision: number;
  result?: LiveSessionResultState;
}

const terminalStatuses: LiveSessionStatus[] = [
  'finished',
  'cancelled',
  'expired',
];
const MAX_TURN_HISTORY = 100;
const MAX_COMMAND_HISTORY = 100;

export class LiveGameSession {
  private constructor(
    private readonly state: LiveGameSessionState,
    private readonly rules: LiveGameModeRules,
  ) {}

  static create(input: {
    id?: string;
    parentGameId?: string;
    parentGameQuestionId?: string;
    controllerActorId: string;
    controllerDisplayName: string;
    teamNames: string[];
    reconnectTokenHash: string;
    rules: LiveGameModeRules;
    now: Date;
  }): LiveGameSession {
    if (
      input.teamNames.length < input.rules.minimumTeamCount ||
      input.teamNames.length > input.rules.maximumTeamCount
    ) {
      throw new LiveSessionDomainError(
        'INVALID_TEAM_COUNT',
        `Mode requires ${input.rules.minimumTeamCount}-${input.rules.maximumTeamCount} teams`,
      );
    }
    const names = input.teamNames.map((name) => name.trim());
    if (names.some((name) => name.length === 0)) {
      throw new LiveSessionDomainError(
        'INVALID_TEAM_NAME',
        'Team names cannot be empty',
      );
    }
    const id = input.id ?? randomUUID();
    return new LiveGameSession(
      {
        id,
        parentGameId: input.parentGameId,
        parentGameQuestionId: input.parentGameQuestionId,
        modeKey: input.rules.key,
        modeVersion: input.rules.version,
        status: 'waiting',
        controllerActorId: input.controllerActorId,
        teams: names.map((name) => ({
          id: randomUUID(),
          name,
          active: true,
          clock: TeamClock.create(
            input.rules.initialTeamDurationMs,
          ).serialize(),
        })),
        participants: [
          {
            id: randomUUID(),
            actorId: input.controllerActorId,
            displayName: input.controllerDisplayName,
            normalizedDisplayName: input.controllerDisplayName
              .trim()
              .toLocaleLowerCase(),
            role: 'controller',
            reconnectTokenHash: input.reconnectTokenHash,
            ready: true,
            joinedAt: input.now,
            connected: false,
            connectedDeviceCount: 0,
            lastSeenAt: input.now,
            credentialVersion: 1,
          },
        ],
        currentRound: 1,
        turnHistory: [],
        processedCommandIds: [],
        createdAt: input.now,
        lastTransitionAt: input.now,
        expiresAt: new Date(input.now.getTime() + input.rules.expirationMs),
        revision: 0,
      },
      input.rules,
    );
  }

  static restore(
    state: LiveGameSessionState,
    rules: LiveGameModeRules,
  ): LiveGameSession {
    return new LiveGameSession(
      {
        ...state,
        createdAt: new Date(state.createdAt),
        startedAt: state.startedAt ? new Date(state.startedAt) : undefined,
        countdownEndsAt: state.countdownEndsAt
          ? new Date(state.countdownEndsAt)
          : undefined,
        lastTransitionAt: new Date(state.lastTransitionAt),
        expiresAt: new Date(state.expiresAt),
        teams: state.teams.map((team) => ({
          ...team,
          clock: TeamClock.restore(team.clock).serialize(),
        })),
        participants: state.participants.map((participant) => ({
          ...participant,
          normalizedDisplayName:
            participant.normalizedDisplayName ??
            participant.displayName.trim().toLocaleLowerCase(),
          ready: participant.ready ?? participant.role === 'controller',
          joinedAt: participant.joinedAt
            ? new Date(participant.joinedAt)
            : new Date(state.createdAt),
          lastSeenAt: new Date(participant.lastSeenAt),
          credentialVersion: participant.credentialVersion ?? 1,
          removedAt: participant.removedAt
            ? new Date(participant.removedAt)
            : undefined,
        })),
        currentTurn: state.currentTurn
          ? LiveGameSession.cloneTurn(state.currentTurn)
          : undefined,
        turnHistory: state.turnHistory.map(LiveGameSession.cloneTurn),
        result: state.result
          ? { ...state.result, finishedAt: new Date(state.result.finishedAt) }
          : undefined,
      },
      rules,
    );
  }

  get id(): string {
    return this.state.id;
  }

  get revision(): number {
    return this.state.revision;
  }

  get modeKey(): string {
    return this.state.modeKey;
  }

  get controllerActorId(): string {
    return this.state.controllerActorId;
  }

  isDuplicate(commandId: string): boolean {
    return this.state.processedCommandIds.includes(commandId);
  }

  assertRevision(expectedRevision: number): void {
    if (expectedRevision !== this.state.revision) {
      throw new StaleLiveSessionRevisionError(
        expectedRevision,
        this.state.revision,
      );
    }
  }

  markReady(now: Date): void {
    this.assertStatus(['waiting'], now);
    if (this.state.teams.filter((team) => team.active).length < 2) {
      throw new LiveSessionDomainError(
        'SESSION_NOT_READY',
        'At least two active teams are required',
      );
    }
    const players = this.state.participants.filter(
      (participant) =>
        participant.role === 'team-player' && !participant.removedAt,
    );
    if (
      players.length > 0 &&
      this.state.teams
        .filter((team) => team.active)
        .some(
          (team) =>
            players.filter(
              (participant) =>
                participant.teamId === team.id && participant.ready,
            ).length < this.rules.readyPlayersRequiredPerTeam,
        )
    ) {
      throw new LiveSessionDomainError(
        'SESSION_NOT_READY',
        'Every active team requires a ready participant',
      );
    }
    this.transitionTo('ready', now);
  }

  beginCountdown(now: Date, durationMs: number): void {
    this.markReady(now);
    this.state.countdownEndsAt = new Date(now.getTime() + durationMs);
  }

  cancelCountdown(now: Date): void {
    this.assertStatus(['ready'], now);
    this.state.countdownEndsAt = undefined;
    this.transitionTo('waiting', now);
  }

  /**
   * The statuses a session accepts new participants in.
   *
   * A unified Match starts its session before anybody is in the room — phones are
   * invited later, at the preflight of the first challenge that needs them — so an
   * `active` session must stay joinable. Bomb mode is unchanged: it hands out its
   * private roles at the start and cannot absorb a latecomer.
   *
   * This is the single expression of the rule; join access and code resolution ask
   * it rather than restating a status list.
   */
  static joinableStatuses(modeKey: string): LiveSessionStatus[] {
    return modeKey === 'bomb' ? ['waiting'] : ['waiting', 'ready', 'active'];
  }

  /** Whether this session would accept a new participant right now. */
  acceptsNewParticipants(): boolean {
    return LiveGameSession.joinableStatuses(this.state.modeKey).includes(
      this.state.status,
    );
  }

  enrollParticipant(input: {
    id?: string;
    displayName: string;
    teamId?: string;
    role: 'team-player' | 'observer';
    joinRequestId: string;
    device?: { label?: string; platform?: string };
    now: Date;
  }): LiveSessionParticipantState {
    this.assertStatus(
      LiveGameSession.joinableStatuses(this.state.modeKey),
      input.now,
    );
    const duplicate = this.state.participants.find(
      (participant) =>
        participant.joinRequestId === input.joinRequestId &&
        !participant.removedAt,
    );
    if (duplicate) return duplicate;
    const normalizedDisplayName = input.displayName.trim().toLocaleLowerCase();
    if (
      this.state.participants.some(
        (participant) =>
          !participant.removedAt &&
          participant.normalizedDisplayName === normalizedDisplayName,
      )
    ) {
      throw new LiveSessionDomainError(
        'DISPLAY_NAME_TAKEN',
        'Display name is already in use',
      );
    }
    if (input.teamId) this.requireTeam(input.teamId);
    const participant: LiveSessionParticipantState = {
      id: input.id ?? randomUUID(),
      displayName: input.displayName.trim(),
      normalizedDisplayName,
      role: input.role,
      teamId: input.teamId,
      ready: false,
      joinedAt: input.now,
      connected: false,
      connectedDeviceCount: 0,
      lastSeenAt: input.now,
      credentialVersion: 1,
      joinRequestId: input.joinRequestId,
      device: input.device,
    };
    this.state.participants.push(participant);
    this.state.lastTransitionAt = input.now;
    return participant;
  }

  participantById(participantId: string): LiveSessionParticipantState {
    const participant = this.state.participants.find(
      (candidate) => candidate.id === participantId,
    );
    if (!participant) {
      throw new LiveSessionDomainError(
        'UNKNOWN_PARTICIPANT',
        'Participant does not belong to this session',
      );
    }
    return participant;
  }

  setParticipantReady(participantId: string, ready: boolean, now: Date): void {
    this.assertStatus(
      this.state.modeKey === 'bomb' ? ['waiting'] : ['waiting', 'ready'],
      now,
    );
    const participant = this.activeParticipant(participantId);
    if (participant.role !== 'team-player' || !participant.teamId) {
      throw new LiveSessionDomainError(
        'PARTICIPANT_CANNOT_READY',
        'Only assigned team players can change readiness',
      );
    }
    participant.ready = ready;
    participant.lastSeenAt = now;
    this.state.lastTransitionAt = now;
  }

  assignParticipantTeam(
    participantId: string,
    teamId: string,
    now: Date,
  ): void {
    this.assertStatus(
      this.state.modeKey === 'bomb' ? ['waiting'] : ['waiting', 'ready'],
      now,
    );
    const participant = this.activeParticipant(participantId);
    this.requireTeam(teamId);
    if (participant.role !== 'team-player') {
      throw new LiveSessionDomainError(
        'PARTICIPANT_NOT_TEAM_PLAYER',
        'Only team players may be assigned to teams',
      );
    }
    participant.teamId = teamId;
    participant.ready = false;
    participant.lastSeenAt = now;
    this.state.lastTransitionAt = now;
  }

  removeParticipant(participantId: string, now: Date): void {
    this.assertNotTerminal();
    const participant = this.activeParticipant(participantId);
    if (participant.role === 'controller') {
      throw new LiveSessionDomainError(
        'CONTROLLER_CANNOT_BE_REMOVED',
        'The session controller cannot be removed',
      );
    }
    participant.removedAt = now;
    participant.ready = false;
    participant.connected = false;
    participant.connectedDeviceCount = 0;
    participant.credentialVersion += 1;
    participant.lastSeenAt = now;
    this.state.lastTransitionAt = now;
  }

  revokeParticipantCredential(participantId: string, now: Date): number {
    const participant = this.activeParticipant(participantId);
    participant.credentialVersion += 1;
    participant.connected = false;
    participant.connectedDeviceCount = 0;
    participant.lastSeenAt = now;
    this.state.lastTransitionAt = now;
    return participant.credentialVersion;
  }

  start(now: Date): void {
    this.assertStatus(['ready'], now);
    this.state.startedAt = now;
    this.state.countdownEndsAt = undefined;
    this.transitionTo('active', now);
  }

  pause(now: Date): void {
    this.assertStatus(['active'], now);
    this.stopActiveClock(now);
    this.transitionTo('paused', now);
  }

  resume(now: Date): void {
    this.assertStatus(['paused'], now);
    this.transitionTo('active', now);
    if (this.state.activeTeamId) {
      const clock = this.clockFor(this.state.activeTeamId);
      clock.resume(now);
      this.requireTeam(this.state.activeTeamId).clock = clock.serialize();
    }
  }

  startTurn(teamId: string, reason: string, now: Date): void {
    this.assertStatus(['active'], now);
    if (this.state.currentTurn && !this.state.currentTurn.endedAt) {
      throw new LiveSessionDomainError(
        'TURN_ALREADY_ACTIVE',
        'End or switch the active turn before starting another',
      );
    }
    this.activateTeam(teamId, reason, now);
  }

  pauseTurn(now: Date): void {
    this.assertStatus(['active'], now);
    if (!this.state.activeTeamId) {
      throw new LiveSessionDomainError('NO_ACTIVE_TURN', 'No turn is active');
    }
    this.stopActiveClock(now);
  }

  resumeTurn(now: Date): void {
    this.assertStatus(['active'], now);
    const teamId = this.requireActiveTeam();
    const clock = this.clockFor(teamId);
    clock.resume(now);
    this.requireTeam(teamId).clock = clock.serialize();
    this.state.lastTransitionAt = now;
  }

  endTurn(reason: string, now: Date): void {
    this.assertStatus(['active'], now);
    this.requireActiveTeam();
    this.stopActiveClock(now);
    if (this.state.currentTurn) {
      this.state.currentTurn.endedAt = now;
      this.state.currentTurn.transitionReason = reason;
      const historyTurn = this.state.turnHistory.find(
        (turn) => turn.sequence === this.state.currentTurn?.sequence,
      );
      if (historyTurn) {
        historyTurn.endedAt = now;
        historyTurn.transitionReason = reason;
      }
    }
    this.state.activeTeamId = undefined;
    this.state.lastTransitionAt = now;
  }

  switchTurn(teamId: string | undefined, reason: string, now: Date): void {
    this.assertStatus(['active'], now);
    const currentTeamId = this.requireActiveTeam();
    this.endTurn(reason, now);
    const nextTeamId = teamId ?? this.nextEligibleTeamId(currentTeamId, now);
    this.activateTeam(nextTeamId, reason, now);
  }

  adjustActiveTeamTime(deltaMs: number, now: Date): number {
    this.assertStatus(['active'], now);
    const teamId = this.requireActiveTeam();
    const clock = this.clockFor(teamId);
    clock.adjust(deltaMs, now);
    this.requireTeam(teamId).clock = clock.serialize();
    this.state.lastTransitionAt = now;
    return clock.remainingMs(now);
  }

  finish(
    reason: string,
    winnerTeamId: string | undefined,
    metadata: Record<string, string | number | boolean> | undefined,
    now: Date,
  ): void {
    this.assertStatus(['active', 'paused'], now);
    if (winnerTeamId) this.requireTeam(winnerTeamId);
    this.stopActiveClock(now);
    this.state.result = {
      reason,
      winnerTeamId,
      finishedAt: now,
      metadata,
    };
    this.transitionTo('finished', now);
  }

  cancel(now: Date): void {
    this.assertNotTerminal();
    this.stopActiveClock(now);
    this.transitionTo('cancelled', now);
  }

  reconnectParticipant(
    actorId: string,
    reconnectTokenHash: string,
    now: Date,
  ): void {
    const participant = this.participantForActor(actorId);
    participant.reconnectTokenHash = reconnectTokenHash;
    participant.connected = true;
    participant.connectedDeviceCount = Math.max(
      1,
      participant.connectedDeviceCount,
    );
    participant.lastSeenAt = now;
    this.state.lastTransitionAt = now;
  }

  setParticipantConnection(actorId: string, connected: boolean, now: Date) {
    const participant = this.participantForActor(actorId);
    participant.connectedDeviceCount = Math.max(
      0,
      participant.connectedDeviceCount + (connected ? 1 : -1),
    );
    participant.connected = participant.connectedDeviceCount > 0;
    participant.lastSeenAt = now;
  }

  completeCommand(commandId: string, now: Date): void {
    this.state.processedCommandIds.push(commandId);
    this.state.processedCommandIds =
      this.state.processedCommandIds.slice(-MAX_COMMAND_HISTORY);
    this.state.revision += 1;
    this.state.lastTransitionAt = now;
  }

  serialize(): LiveGameSessionState {
    return LiveGameSession.restore(this.state, this.rules).state;
  }

  private activateTeam(teamId: string, reason: string, now: Date): void {
    const team = this.requireTeam(teamId);
    const clock = TeamClock.restore(team.clock);
    if (!team.active || clock.isExpired(now)) {
      throw new LiveSessionDomainError(
        'TEAM_NOT_ELIGIBLE',
        'The selected team cannot receive a turn',
      );
    }
    if (
      this.rules.onlyOneClockRuns &&
      this.state.teams.some(
        (candidate) =>
          candidate.id !== teamId && candidate.clock.running === true,
      )
    ) {
      throw new LiveSessionDomainError(
        'MULTIPLE_RUNNING_CLOCKS',
        'Only the active team clock may run',
      );
    }
    clock.start(now);
    team.clock = clock.serialize();
    const turn: LiveSessionTurnState = {
      sequence: (this.state.currentTurn?.sequence ?? 0) + 1,
      teamId,
      startedAt: now,
      transitionReason: reason,
    };
    this.state.activeTeamId = teamId;
    this.state.currentTurn = turn;
    this.state.turnHistory.push(turn);
    this.state.turnHistory = this.state.turnHistory.slice(-MAX_TURN_HISTORY);
    this.state.lastTransitionAt = now;
  }

  private nextEligibleTeamId(currentId: string, now: Date): string {
    const currentIndex = this.state.teams.findIndex(
      (team) => team.id === currentId,
    );
    for (let offset = 1; offset <= this.state.teams.length; offset += 1) {
      const team =
        this.state.teams[(currentIndex + offset) % this.state.teams.length];
      if (
        team.active &&
        !TeamClock.restore(team.clock).isExpired(now) &&
        team.id !== currentId
      ) {
        return team.id;
      }
    }
    throw new LiveSessionDomainError(
      'NO_ELIGIBLE_TEAM',
      'No other team is eligible for the next turn',
    );
  }

  private stopActiveClock(now: Date): void {
    if (!this.state.activeTeamId) return;
    const clock = this.clockFor(this.state.activeTeamId);
    clock.stop(now);
    this.requireTeam(this.state.activeTeamId).clock = clock.serialize();
  }

  private clockFor(teamId: string): TeamClock {
    return TeamClock.restore(this.requireTeam(teamId).clock);
  }

  private requireTeam(teamId: string): LiveSessionTeamState {
    const team = this.state.teams.find((candidate) => candidate.id === teamId);
    if (!team) {
      throw new LiveSessionDomainError(
        'UNKNOWN_TEAM',
        'The selected team does not belong to this session',
      );
    }
    return team;
  }

  private requireActiveTeam(): string {
    if (!this.state.activeTeamId) {
      throw new LiveSessionDomainError('NO_ACTIVE_TURN', 'No turn is active');
    }
    return this.state.activeTeamId;
  }

  private participantForActor(actorId: string): LiveSessionParticipantState {
    const participant = this.state.participants.find(
      (candidate) => candidate.actorId === actorId,
    );
    if (!participant) {
      throw new LiveSessionDomainError(
        'UNKNOWN_PARTICIPANT',
        'Actor is not a session participant',
      );
    }
    return participant;
  }

  private activeParticipant(
    participantId: string,
  ): LiveSessionParticipantState {
    const participant = this.participantById(participantId);
    if (participant.removedAt) {
      throw new LiveSessionDomainError(
        'PARTICIPANT_REMOVED',
        'Participant has been removed',
      );
    }
    return participant;
  }

  private assertStatus(allowed: LiveSessionStatus[], now: Date): void {
    this.assertNotExpired(now);
    if (!allowed.includes(this.state.status)) {
      throw new LiveSessionDomainError(
        'INVALID_SESSION_TRANSITION',
        `Cannot perform this action while session is ${this.state.status}`,
      );
    }
  }

  private assertNotTerminal(): void {
    if (terminalStatuses.includes(this.state.status)) {
      throw new LiveSessionDomainError(
        'SESSION_IMMUTABLE',
        `Session is ${this.state.status} and cannot be changed`,
      );
    }
  }

  private assertNotExpired(now: Date): void {
    if (
      !terminalStatuses.includes(this.state.status) &&
      now.getTime() >= this.state.expiresAt.getTime()
    ) {
      this.state.status = 'expired';
      throw new LiveSessionDomainError(
        'SESSION_EXPIRED',
        'Live session has expired',
      );
    }
  }

  private transitionTo(status: LiveSessionStatus, now: Date): void {
    this.state.status = status;
    this.state.lastTransitionAt = now;
  }

  private static cloneTurn(turn: LiveSessionTurnState): LiveSessionTurnState {
    return {
      ...turn,
      startedAt: new Date(turn.startedAt),
      endedAt: turn.endedAt ? new Date(turn.endedAt) : undefined,
    };
  }
}
