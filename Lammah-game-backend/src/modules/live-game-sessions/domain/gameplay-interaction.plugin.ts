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
  /**
   * The actor-aware submission check.
   *
   * Gets the live runtime state as well as the prompt, because the prompt is a
   * snapshot taken when the item opened while the runtime is what the server has
   * since decided — a mechanic whose authorised participant can be reassigned
   * mid-item (a disconnect handoff) must read the runtime, not the prompt.
   */
  validateSubmissionForActor?(
    payload: GameplayCommandPayload,
    actor: InteractionActorProjection,
    prompt: GameplayPromptState,
    runtimeState: GameplayModeState,
  ): GameplayCommandPayload;
  shouldAutoResolve?(
    submissions: GameplaySubmissionState[],
    prompt: GameplayPromptState,
  ): boolean;
  /**
   * The prompt as this actor may see it.
   *
   * Gets the live runtime state for the same reason `validateSubmissionForActor`
   * does: the prompt is a snapshot from when the item opened, so anything the
   * server can reassign mid-item — such as which participant is authoritative —
   * must be read from the runtime or the projection will disagree with the
   * authorisation check.
   */
  projectPrompt(
    prompt: GameplayPromptState,
    actor: InteractionActorProjection,
    runtimeState?: GameplayModeState,
  ): GameplayModeState | undefined;
  projectSubmission(
    submission: GameplaySubmissionState,
    actor: InteractionActorProjection,
  ): GameplayModeState | undefined;
  createOutcome(
    submissions: GameplaySubmissionState[],
    now: Date,
    prompt?: GameplayPromptState,
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
