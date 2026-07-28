import {
  GameplayOutcomeState,
  GameplayPromptState,
  GameplaySubmissionState,
  InteractionVisibility,
} from './gameplay-interaction';
import {
  GameplayAuthorizationRequirement,
  GameplayCommandPayload,
  GameplayModeState,
  GameplayPluginContext,
  GameplaySessionEffect,
} from './gameplay-mode.plugin';

export interface InteractionActorProjection {
  controller: boolean;
  participantId?: string;
  teamId?: string;
  activeTeamId?: string;
}

export interface GameplayInteractionPlugin {
  readonly submissionAuthorization: GameplayAuthorizationRequirement;
  readonly submissionPolicy: 'one-per-participant' | 'multiple';
  preparePrompt(
    context: GameplayPluginContext,
    input: GameplayCommandPayload,
    now: Date,
  ): Omit<GameplayPromptState, 'id' | 'preparedAt'>;
  validatePrompt(prompt: GameplayPromptState): GameplayPromptState;
  validateSubmission(payload: GameplayCommandPayload): GameplayCommandPayload;
  projectPrompt(
    prompt: GameplayPromptState,
    actor: InteractionActorProjection,
  ): GameplayModeState | undefined;
  projectSubmission(
    submission: GameplaySubmissionState,
    actor: InteractionActorProjection,
  ): GameplayModeState | undefined;
  createOutcome(
    submissions: GameplaySubmissionState[],
    now: Date,
  ): { outcome: GameplayOutcomeState; effects: GameplaySessionEffect[] };
  validateOutcome(outcome: GameplayOutcomeState): GameplayOutcomeState;
  projectOutcome(
    outcome: GameplayOutcomeState,
    actor: InteractionActorProjection,
  ): GameplayModeState | undefined;
}

export function canSeeVisibility(
  visibility: InteractionVisibility,
  actor: InteractionActorProjection,
  owner: { participantId?: string; teamId?: string },
  status: string,
): boolean {
  if (actor.controller) return true;
  if (visibility === 'public') return true;
  if (visibility === 'host-only') return false;
  if (visibility === 'active-team') {
    return Boolean(actor.teamId && actor.teamId === actor.activeTeamId);
  }
  if (visibility === 'submitting-participant') {
    return actor.participantId === owner.participantId;
  }
  if (visibility === 'after-close') {
    return ['closed', 'adjudicating', 'resolved', 'expired'].includes(status);
  }
  return status === 'resolved';
}
