import { LiveSessionDomainError } from './live-session.errors';
import {
  canSeeVisibility,
  GameplayInteractionPlugin,
} from './gameplay-interaction.plugin';

export type GameplayStateValue = string | number | boolean | null;
export type GameplayModeState = Record<string, GameplayStateValue>;
export type GameplayCommandPayload = Record<string, GameplayStateValue>;

export type GameplayAuthorizationRequirement =
  | 'controller'
  | 'connected-player'
  | 'active-team-player'
  | 'controller-or-active-team-player'
  | 'controller-or-active-participant'
  | 'active-participant'
  | 'observer-safe'
  | 'internal';

export type GameplaySessionEffect =
  | { type: 'start-team-turn'; teamId: string; reason: string }
  | { type: 'pause-active-turn' }
  | { type: 'resume-active-turn' }
  | { type: 'switch-active-team'; teamId: string; reason: string }
  | { type: 'stop-active-turn'; reason: string }
  | { type: 'finish-live-session'; reason: string }
  | { type: 'adjust-active-team-time'; deltaMs: number }
  | { type: 'emit-runtime-event'; eventType: string };

export interface GameplayPluginContext {
  sessionId: string;
  runtimeId: string;
  roundId?: string;
  activeTeamId?: string;
  activeParticipantId?: string;
  initialState?: GameplayModeState;
  runtimeState?: GameplayModeState;
}

export interface GameplayCommandDefinition {
  type: string;
  authorization: GameplayAuthorizationRequirement;
  allowedRoundStatuses: Array<'active' | 'paused'>;
  validatePayload(payload: GameplayCommandPayload): GameplayCommandPayload;
}

export interface GameplayCommandResult {
  runtimeState: GameplayModeState;
  roundState: GameplayModeState;
  eventType: string;
  eventPayload: GameplayModeState;
  effects: GameplaySessionEffect[];
}

export interface GameplayModePlugin {
  readonly key: string;
  readonly version: number;
  readonly stateSchemaVersion: number;
  createInitialRuntimeState(context: GameplayPluginContext): GameplayModeState;
  createInitialRoundState(context: GameplayPluginContext): GameplayModeState;
  validateRuntimeState(state: GameplayModeState): GameplayModeState;
  validateRoundState(state: GameplayModeState): GameplayModeState;
  command(type: string): GameplayCommandDefinition | undefined;
  handleCommand(
    context: GameplayPluginContext,
    command: {
      type: string;
      payload: GameplayCommandPayload;
      runtimeState: GameplayModeState;
      roundState: GameplayModeState;
    },
  ): GameplayCommandResult;
  projectRuntimeState(state: GameplayModeState): GameplayModeState;
  projectRoundState(state: GameplayModeState): GameplayModeState;
  readonly interaction?: GameplayInteractionPlugin;
}

const phases = ['waiting', 'presenting', 'resolving', 'completed'] as const;
type ReferencePhase = (typeof phases)[number];

function validatePhaseState(state: GameplayModeState): GameplayModeState {
  if (
    Object.keys(state).length !== 1 ||
    typeof state.phase !== 'string' ||
    !phases.includes(state.phase as ReferencePhase)
  ) {
    throw new LiveSessionDomainError(
      'INVALID_MODE_STATE',
      'Reference mode state must contain one supported phase',
    );
  }
  return { phase: state.phase };
}

export const CORE_ROUND_RUNTIME_PLUGIN: GameplayModePlugin = {
  key: 'core-round-runtime',
  version: 1,
  stateSchemaVersion: 1,
  createInitialRuntimeState: () => ({ phase: 'waiting' }),
  createInitialRoundState: () => ({ phase: 'waiting' }),
  validateRuntimeState: validatePhaseState,
  validateRoundState: validatePhaseState,
  command: (type) =>
    type === 'advance-phase'
      ? {
          type,
          authorization: 'controller-or-active-team-player',
          allowedRoundStatuses: ['active'],
          validatePayload(payload) {
            if (Object.keys(payload).length > 0) {
              throw new LiveSessionDomainError(
                'INVALID_GAMEPLAY_COMMAND',
                'advance-phase does not accept a payload',
              );
            }
            return {};
          },
        }
      : undefined,
  handleCommand(context, command) {
    const state = validatePhaseState(command.roundState);
    const index = phases.indexOf(state.phase as ReferencePhase);
    if (index < 0 || index >= phases.length - 1) {
      throw new LiveSessionDomainError(
        'MODE_COMMAND_UNAVAILABLE',
        'The neutral phase cannot advance further',
      );
    }
    const phase = phases[index + 1];
    return {
      runtimeState: validatePhaseState({ phase }),
      roundState: validatePhaseState({ phase }),
      eventType: 'round-state-changed',
      eventPayload: { phase },
      effects: [
        { type: 'emit-runtime-event', eventType: 'neutral-phase-advanced' },
      ],
    };
  },
  projectRuntimeState: validatePhaseState,
  projectRoundState: validatePhaseState,
  interaction: {
    submissionAuthorization: 'active-team-player',
    submissionPolicy: 'one-per-participant',
    preparePrompt(context, input, now) {
      if (
        Object.keys(input).some((key) => !['deadlineMs'].includes(key)) ||
        (input.deadlineMs !== undefined &&
          (typeof input.deadlineMs !== 'number' ||
            input.deadlineMs < 1_000 ||
            input.deadlineMs > 3_600_000))
      ) {
        throw new LiveSessionDomainError(
          'INVALID_INTERACTION_PROMPT',
          'Neutral prompt accepts only a deadline between 1 second and 1 hour',
        );
      }
      return {
        type: 'development-signal',
        schemaVersion: 1,
        publicPayload: { message: 'Send a signal' },
        participantPayload: { message: 'Send a signal' },
        hostPayload: { message: 'Send a signal', development: true },
        internalPayload: { internalPolicy: 'neutral-signal' },
        visibility: 'public',
        metadata: { development: true },
        visibleFrom: now,
        deadlineAt:
          typeof input.deadlineMs === 'number'
            ? new Date(now.getTime() + input.deadlineMs)
            : undefined,
      };
    },
    validatePrompt(prompt) {
      if (
        prompt.type !== 'development-signal' ||
        prompt.schemaVersion !== 1 ||
        prompt.publicPayload.message !== 'Send a signal'
      ) {
        throw new LiveSessionDomainError(
          'INVALID_INTERACTION_PROMPT',
          'Neutral prompt is invalid',
        );
      }
      return prompt;
    },
    validateSubmission(payload) {
      if (Object.keys(payload).length !== 1 || payload.signal !== 'ready') {
        throw new LiveSessionDomainError(
          'INVALID_INTERACTION_SUBMISSION',
          'Neutral submission must contain signal ready',
        );
      }
      return { signal: 'ready' };
    },
    projectPrompt(prompt, actor) {
      if (!canSeeVisibility(prompt.visibility, actor, {}, 'open')) {
        return undefined;
      }
      if (actor.controller) return prompt.hostPayload;
      if (actor.participantId) return prompt.participantPayload;
      return prompt.publicPayload;
    },
    projectSubmission(submission, actor) {
      if (
        !canSeeVisibility(
          submission.resultVisibility,
          actor,
          submission,
          submission.status,
        )
      ) {
        return undefined;
      }
      return {
        signal: submission.payload.signal ?? null,
        status: submission.status,
      };
    },
    createOutcome(submissions) {
      const selected = submissions
        .filter((submission) => submission.status === 'accepted')
        .map((submission) => submission.id);
      return {
        outcome: {
          type: 'development-signal-result',
          schemaVersion: 1,
          publicPayload: { state: 'resolved' },
          teamPayload: { state: 'resolved' },
          participantPayload: { state: 'resolved' },
          hostPayload: { state: 'resolved', selectedCount: selected.length },
          privatePayload: { processed: true },
          completionReason: 'host-resolved',
          selectedSubmissionIds: selected,
        },
        effects: [
          {
            type: 'switch-active-team',
            teamId: '',
            reason: 'neutral-interaction-resolved',
          },
        ],
      };
    },
    validateOutcome(outcome) {
      if (
        outcome.type !== 'development-signal-result' ||
        outcome.schemaVersion !== 1 ||
        outcome.publicPayload.state !== 'resolved'
      ) {
        throw new LiveSessionDomainError(
          'INVALID_INTERACTION_OUTCOME',
          'Neutral outcome is invalid',
        );
      }
      return outcome;
    },
    projectOutcome(outcome, actor) {
      if (actor.controller) return outcome.hostPayload;
      if (actor.participantId) return outcome.participantPayload;
      return outcome.publicPayload;
    },
  },
};
