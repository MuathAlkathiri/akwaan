import { randomUUID } from 'crypto';
import { GameplayModePlugin, GameplayModeState } from './gameplay-mode.plugin';
import {
  LiveSessionDomainError,
  StaleGameplayRuntimeRevisionError,
} from './live-session.errors';
import {
  GameplayInteraction,
  GameplayInteractionState,
  GameplayOutcomeState,
  GameplayPromptState,
  GameplaySubmissionState,
} from './gameplay-interaction';

export type GameplayRuntimeStatus =
  | 'initialized'
  | 'awaiting-round'
  | 'round-active'
  | 'round-paused'
  | 'between-rounds'
  | 'completed'
  | 'cancelled';
export type GameplayRoundStatus =
  'pending' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface GameplayRuntimeEventState {
  id: string;
  sequence: number;
  type: string;
  roundId?: string;
  actorId?: string;
  timestamp: Date;
  payload: GameplayModeState;
  runtimeRevision: number;
  sessionRevision?: number;
}

export interface GameplayRoundState {
  id: string;
  runtimeId: string;
  sequence: number;
  status: GameplayRoundStatus;
  createdAt: Date;
  startedAt?: Date;
  pausedAt?: Date;
  resumedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  activeTeamId?: string;
  activeParticipantId?: string;
  modeStateSchemaVersion: number;
  modeState: GameplayModeState;
  result?: GameplayModeState;
  completionReason?: string;
  transitionRevision: number;
  interaction?: GameplayInteractionState;
}

export interface CompletedGameplayRoundSummary {
  id: string;
  sequence: number;
  completedAt: Date;
  completionReason: string;
}

export interface GameplayTransitionState {
  revision: number;
  type: string;
  roundId?: string;
  actorId?: string;
  timestamp: Date;
}

export interface GameplayRuntimeState {
  id: string;
  sessionId: string;
  modeKey: string;
  modeVersion: number;
  stateSchemaVersion: number;
  status: GameplayRuntimeStatus;
  revision: number;
  runtimeState: GameplayModeState;
  activeRound?: GameplayRoundState;
  completedRounds: CompletedGameplayRoundSummary[];
  processedCommandIds: string[];
  transitions: GameplayTransitionState[];
  events: GameplayRuntimeEventState[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  expiresAt: Date;
}

const MAX_COMMANDS = 100;
const MAX_TRANSITIONS = 100;
const MAX_EVENTS = 100;
const MAX_COMPLETED_ROUNDS = 50;

export class GameplayRuntime {
  private constructor(
    private readonly state: GameplayRuntimeState,
    private readonly plugin: GameplayModePlugin,
  ) {}

  static create(input: {
    id?: string;
    sessionId: string;
    plugin: GameplayModePlugin;
    commandId: string;
    actorId: string;
    now: Date;
    expiresAt: Date;
    initialState?: GameplayModeState;
  }): GameplayRuntime {
    const id = input.id ?? randomUUID();
    const context = {
      sessionId: input.sessionId,
      runtimeId: id,
      initialState: input.initialState,
    };
    const runtime = new GameplayRuntime(
      {
        id,
        sessionId: input.sessionId,
        modeKey: input.plugin.key,
        modeVersion: input.plugin.version,
        stateSchemaVersion: input.plugin.stateSchemaVersion,
        status: 'initialized',
        revision: 0,
        runtimeState: input.plugin.validateRuntimeState(
          input.plugin.createInitialRuntimeState(context),
        ),
        completedRounds: [],
        processedCommandIds: [],
        transitions: [],
        events: [],
        createdAt: input.now,
        expiresAt: input.expiresAt,
      },
      input.plugin,
    );
    runtime.commit(
      'runtime-created',
      input.commandId,
      input.actorId,
      input.now,
    );
    return runtime;
  }

  static restore(
    state: GameplayRuntimeState,
    plugin: GameplayModePlugin,
  ): GameplayRuntime {
    if (
      state.modeKey !== plugin.key ||
      state.modeVersion !== plugin.version ||
      state.stateSchemaVersion !== plugin.stateSchemaVersion
    ) {
      throw new LiveSessionDomainError(
        'GAMEPLAY_MODE_VERSION_MISMATCH',
        'Persisted gameplay state does not match the registered plugin',
      );
    }
    return new GameplayRuntime(
      {
        ...state,
        runtimeState: plugin.validateRuntimeState(state.runtimeState),
        createdAt: new Date(state.createdAt),
        startedAt: state.startedAt ? new Date(state.startedAt) : undefined,
        completedAt: state.completedAt
          ? new Date(state.completedAt)
          : undefined,
        cancelledAt: state.cancelledAt
          ? new Date(state.cancelledAt)
          : undefined,
        expiresAt: new Date(state.expiresAt),
        activeRound: state.activeRound
          ? GameplayRuntime.restoreRound(state.activeRound, plugin)
          : undefined,
        completedRounds: state.completedRounds.map((round) => ({
          ...round,
          completedAt: new Date(round.completedAt),
        })),
        transitions: state.transitions.map((transition) => ({
          ...transition,
          timestamp: new Date(transition.timestamp),
        })),
        events: state.events.map((event) => ({
          ...event,
          timestamp: new Date(event.timestamp),
        })),
      },
      plugin,
    );
  }

  get id() {
    return this.state.id;
  }
  get sessionId() {
    return this.state.sessionId;
  }
  get revision() {
    return this.state.revision;
  }
  get modeKey() {
    return this.state.modeKey;
  }
  get modeVersion() {
    return this.state.modeVersion;
  }

  isDuplicate(commandId: string): boolean {
    return this.state.processedCommandIds.includes(commandId);
  }

  assertRevision(expected: number): void {
    if (expected !== this.state.revision) {
      throw new StaleGameplayRuntimeRevisionError(
        expected,
        this.state.revision,
      );
    }
  }

  start(commandId: string, actorId: string, now: Date): void {
    this.assertStatus(['initialized']);
    this.state.status = 'awaiting-round';
    this.state.startedAt = now;
    this.commit('runtime-started', commandId, actorId, now);
  }

  createRound(
    input: {
      commandId: string;
      actorId: string;
      activeTeamId?: string;
      activeParticipantId?: string;
    },
    now: Date,
  ): GameplayRoundState {
    this.assertStatus(['awaiting-round', 'between-rounds']);
    if (this.state.activeRound) {
      throw new LiveSessionDomainError(
        'ACTIVE_ROUND_EXISTS',
        'Complete or cancel the active round first',
      );
    }
    const id = randomUUID();
    const round: GameplayRoundState = {
      id,
      runtimeId: this.id,
      sequence: this.state.completedRounds.length + 1,
      status: 'pending',
      createdAt: now,
      activeTeamId: input.activeTeamId,
      activeParticipantId: input.activeParticipantId,
      modeStateSchemaVersion: this.plugin.stateSchemaVersion,
      modeState: this.plugin.validateRoundState(
        this.plugin.createInitialRoundState({
          sessionId: this.sessionId,
          runtimeId: this.id,
          roundId: id,
          activeTeamId: input.activeTeamId,
          activeParticipantId: input.activeParticipantId,
          runtimeState: this.state.runtimeState,
        }),
      ),
      transitionRevision: this.revision + 1,
    };
    this.state.activeRound = round;
    this.commit('round-created', input.commandId, input.actorId, now, id);
    return round;
  }

  startRound(
    roundId: string,
    commandId: string,
    actorId: string,
    now: Date,
  ): void {
    const round = this.requireRound(roundId, ['pending']);
    round.status = 'active';
    round.startedAt = now;
    this.state.status = 'round-active';
    this.commit('round-started', commandId, actorId, now, roundId);
  }

  pauseRound(
    roundId: string,
    commandId: string,
    actorId: string,
    now: Date,
  ): void {
    const round = this.requireRound(roundId, ['active']);
    round.status = 'paused';
    round.pausedAt = now;
    this.state.status = 'round-paused';
    this.commit('round-paused', commandId, actorId, now, roundId);
  }

  resumeRound(
    roundId: string,
    commandId: string,
    actorId: string,
    now: Date,
  ): void {
    const round = this.requireRound(roundId, ['paused']);
    round.status = 'active';
    round.resumedAt = now;
    this.state.status = 'round-active';
    this.commit('round-resumed', commandId, actorId, now, roundId);
  }

  applyModeState(input: {
    commandId: string;
    actorId: string;
    runtimeState: GameplayModeState;
    roundState: GameplayModeState;
    eventType: string;
    eventPayload: GameplayModeState;
    now: Date;
    sessionRevision: number;
    activeTeamId?: string;
    activeParticipantId?: string;
  }): void {
    const round = this.requireActiveRound();
    this.state.runtimeState = this.plugin.validateRuntimeState(
      input.runtimeState,
    );
    round.modeState = this.plugin.validateRoundState(input.roundState);
    if (input.activeTeamId !== undefined) {
      round.activeTeamId = input.activeTeamId;
      round.activeParticipantId = input.activeParticipantId;
    }
    this.commit(
      input.eventType,
      input.commandId,
      input.actorId,
      input.now,
      round.id,
      input.eventPayload,
      input.sessionRevision,
    );
  }

  prepareInteraction(
    prompt: Omit<GameplayPromptState, 'id' | 'preparedAt'>,
    commandId: string,
    actorId: string,
    now: Date,
  ): GameplayInteractionState {
    const round = this.requireRound(this.requireActiveRound().id, [
      'active',
      'paused',
    ]);
    if (
      round.interaction &&
      !['resolved', 'cancelled', 'expired'].includes(round.interaction.status)
    ) {
      throw new LiveSessionDomainError(
        'ACTIVE_INTERACTION_EXISTS',
        'Resolve or cancel the active interaction first',
      );
    }
    round.interaction = GameplayInteraction.prepare({
      roundId: round.id,
      prompt,
      now,
    }).serialize();
    this.commit('interaction-prepared', commandId, actorId, now, round.id);
    return round.interaction;
  }

  mutateInteraction(
    commandId: string,
    actorId: string,
    now: Date,
    mutate: (interaction: GameplayInteraction, now: Date) => void,
    eventType: string,
    sessionRevision?: number,
  ): GameplayInteractionState {
    const round = this.requireActiveRound();
    if (!round.interaction) {
      throw new LiveSessionDomainError(
        'INTERACTION_NOT_FOUND',
        'No interaction exists for the active round',
      );
    }
    const interaction = GameplayInteraction.restore(round.interaction);
    mutate(interaction, now);
    round.interaction = interaction.serialize();
    this.commit(
      eventType,
      commandId,
      actorId,
      now,
      round.id,
      {},
      sessionRevision,
    );
    return round.interaction;
  }

  submitInteraction(
    input: Omit<GameplaySubmissionState, 'id' | 'receivedAt' | 'status'> & {
      now: Date;
      actorId: string;
    },
  ): GameplaySubmissionState {
    let result: GameplaySubmissionState | undefined;
    this.mutateInteraction(
      input.requestId,
      input.actorId,
      input.now,
      (interaction) => {
        result = interaction.submit(input);
      },
      'submission-received',
    );
    if (!result) {
      throw new LiveSessionDomainError(
        'SUBMISSION_NOT_FOUND',
        'Submission was not created',
      );
    }
    return result;
  }

  resolveInteraction(
    outcome: GameplayOutcomeState,
    requestId: string,
    actorId: string,
    now: Date,
    sessionRevision: number,
  ): void {
    this.mutateInteraction(
      requestId,
      actorId,
      now,
      (interaction) => interaction.resolve(outcome, requestId, now),
      'interaction-resolved',
      sessionRevision,
    );
  }

  completeRound(input: {
    roundId: string;
    commandId: string;
    actorId: string;
    reason: string;
    result?: GameplayModeState;
    now: Date;
  }): void {
    const round = this.requireRound(input.roundId, ['active', 'paused']);
    round.status = 'completed';
    round.completedAt = input.now;
    round.completionReason = input.reason;
    round.result = input.result;
    this.state.completedRounds.push({
      id: round.id,
      sequence: round.sequence,
      completedAt: input.now,
      completionReason: input.reason,
    });
    this.state.completedRounds =
      this.state.completedRounds.slice(-MAX_COMPLETED_ROUNDS);
    this.state.activeRound = undefined;
    this.state.status = 'between-rounds';
    this.commit(
      'round-completed',
      input.commandId,
      input.actorId,
      input.now,
      round.id,
    );
  }

  cancelRound(
    roundId: string,
    commandId: string,
    actorId: string,
    now: Date,
  ): void {
    const round = this.requireRound(roundId, ['pending', 'active', 'paused']);
    round.status = 'cancelled';
    round.cancelledAt = now;
    this.state.activeRound = undefined;
    this.state.status = 'between-rounds';
    this.commit('round-cancelled', commandId, actorId, now, round.id);
  }

  complete(commandId: string, actorId: string, now: Date, force = false): void {
    this.assertStatus(['awaiting-round', 'between-rounds']);
    if (this.state.activeRound && !force) {
      throw new LiveSessionDomainError(
        'ACTIVE_ROUND_UNRESOLVED',
        'Complete or cancel the active round first',
      );
    }
    this.state.activeRound = undefined;
    this.state.status = 'completed';
    this.state.completedAt = now;
    this.commit('runtime-completed', commandId, actorId, now);
  }

  cancel(commandId: string, actorId: string, now: Date): void {
    if (['completed', 'cancelled'].includes(this.state.status)) {
      throw new LiveSessionDomainError(
        'GAMEPLAY_RUNTIME_IMMUTABLE',
        'Terminal gameplay runtime cannot be changed',
      );
    }
    this.state.activeRound = undefined;
    this.state.status = 'cancelled';
    this.state.cancelledAt = now;
    this.commit('runtime-cancelled', commandId, actorId, now);
  }

  serialize(): GameplayRuntimeState {
    return GameplayRuntime.restore(this.state, this.plugin).state;
  }

  private commit(
    type: string,
    commandId: string,
    actorId: string,
    now: Date,
    roundId?: string,
    payload: GameplayModeState = {},
    sessionRevision?: number,
  ): void {
    this.state.revision += 1;
    this.state.processedCommandIds.push(commandId);
    this.state.processedCommandIds =
      this.state.processedCommandIds.slice(-MAX_COMMANDS);
    this.state.transitions.push({
      revision: this.state.revision,
      type,
      roundId,
      actorId,
      timestamp: now,
    });
    this.state.transitions = this.state.transitions.slice(-MAX_TRANSITIONS);
    this.state.events.push({
      id: randomUUID(),
      sequence: this.state.events.length + 1,
      type,
      roundId,
      actorId,
      timestamp: now,
      payload,
      runtimeRevision: this.state.revision,
      sessionRevision,
    });
    this.state.events = this.state.events.slice(-MAX_EVENTS);
    if (this.state.activeRound) {
      this.state.activeRound.transitionRevision = this.state.revision;
    }
  }

  private assertStatus(allowed: GameplayRuntimeStatus[]): void {
    if (!allowed.includes(this.state.status)) {
      throw new LiveSessionDomainError(
        'INVALID_GAMEPLAY_RUNTIME_TRANSITION',
        `Cannot perform this action while runtime is ${this.state.status}`,
      );
    }
  }

  private requireActiveRound(): GameplayRoundState {
    if (!this.state.activeRound) {
      throw new LiveSessionDomainError(
        'GAMEPLAY_ROUND_NOT_FOUND',
        'No gameplay round is active',
      );
    }
    return this.state.activeRound;
  }

  private requireRound(
    roundId: string,
    statuses: GameplayRoundStatus[],
  ): GameplayRoundState {
    const round = this.requireActiveRound();
    if (round.id !== roundId) {
      throw new LiveSessionDomainError(
        'GAMEPLAY_ROUND_NOT_FOUND',
        'Gameplay round does not belong to this runtime',
      );
    }
    if (!statuses.includes(round.status)) {
      throw new LiveSessionDomainError(
        'INVALID_GAMEPLAY_ROUND_TRANSITION',
        `Cannot perform this action while round is ${round.status}`,
      );
    }
    return round;
  }

  private static restoreRound(
    round: GameplayRoundState,
    plugin: GameplayModePlugin,
  ): GameplayRoundState {
    if (round.modeStateSchemaVersion !== plugin.stateSchemaVersion) {
      throw new LiveSessionDomainError(
        'GAMEPLAY_MODE_VERSION_MISMATCH',
        'Round state schema is not supported',
      );
    }
    return {
      ...round,
      modeState: plugin.validateRoundState(round.modeState),
      interaction: round.interaction
        ? GameplayInteraction.restore(round.interaction).serialize()
        : undefined,
      createdAt: new Date(round.createdAt),
      startedAt: round.startedAt ? new Date(round.startedAt) : undefined,
      pausedAt: round.pausedAt ? new Date(round.pausedAt) : undefined,
      resumedAt: round.resumedAt ? new Date(round.resumedAt) : undefined,
      completedAt: round.completedAt ? new Date(round.completedAt) : undefined,
      cancelledAt: round.cancelledAt ? new Date(round.cancelledAt) : undefined,
    };
  }
}
