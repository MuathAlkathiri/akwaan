import {
  GameplayCommandPayload,
  GameplayModePlugin,
  GameplayModeState,
} from './gameplay-mode.plugin';
import { GameplayPromptState } from './gameplay-interaction';
import { InteractionActorProjection } from './gameplay-interaction.plugin';
import { LiveSessionDomainError } from './live-session.errors';

export const RYO_MODE_KEY = 'read-your-opponent';
export const RYO_TIMER_SECONDS = 25;

export function ryoAnsweringTeam(
  teamIds: string[],
  startingTeamId: string,
  itemIndex: number,
): string {
  return teamIds[(teamIds.indexOf(startingTeamId) + itemIndex) % 2];
}

function parse<T>(value: unknown, label: string): T {
  if (typeof value !== 'string')
    throw new LiveSessionDomainError(
      'INVALID_RYO_STATE',
      `${label} is missing`,
    );
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new LiveSessionDomainError(
      'INVALID_RYO_STATE',
      `${label} is invalid`,
    );
  }
}

export function advanceRyoChallengeState(
  state: GameplayModeState,
  scoreEvent: Record<string, unknown>,
  result: GameplayModeState,
): GameplayModeState {
  const events = parse<Record<string, unknown>[]>(
    state.scoreEventsJson ?? '[]',
    'score events',
  );
  const results = parse<GameplayModeState[]>(
    state.resultsJson ?? '[]',
    'results',
  );
  events.push(scoreEvent);
  results.push({ ...result, scoreEventJson: JSON.stringify(scoreEvent) });
  const currentItemIndex = Number(state.currentItemIndex ?? 0) + 1;
  return validateRuntime({
    ...state,
    currentItemIndex,
    scoreEventsJson: JSON.stringify(events),
    resultsJson: JSON.stringify(results),
    phase: currentItemIndex === 3 ? 'completed' : 'between_items',
  });
}

function validateRuntime(state: GameplayModeState): GameplayModeState {
  const items = parse<unknown[]>(state.itemsJson, 'items');
  const teams = parse<string[]>(state.teamIdsJson, 'teams');
  if (
    items.length !== 3 ||
    teams.length !== 2 ||
    new Set(teams).size !== 2 ||
    typeof state.startingTeamId !== 'string'
  ) {
    throw new LiveSessionDomainError(
      'INVALID_RYO_STATE',
      'RYO requires exactly three items and two distinct teams',
    );
  }
  return {
    ...state,
    itemsJson: JSON.stringify(items),
    teamIdsJson: JSON.stringify(teams),
  };
}

function validateRound(state: GameplayModeState): GameplayModeState {
  if (
    !['collecting', 'resolved', 'completed'].includes(String(state.phase)) ||
    typeof state.itemIndex !== 'number' ||
    typeof state.answeringTeamId !== 'string' ||
    typeof state.opposingTeamId !== 'string'
  ) {
    throw new LiveSessionDomainError(
      'INVALID_RYO_STATE',
      'RYO round ownership is incomplete',
    );
  }
  return state;
}

function submission(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (
    payload.kind === 'decision' &&
    (payload.decision === 'steal' || payload.decision === 'trust')
  )
    return { kind: 'decision', decision: payload.decision };
  if (
    payload.kind === 'answer' &&
    payload.mode === 'multiple_choice' &&
    typeof payload.optionId === 'string' &&
    payload.optionId
  )
    return {
      kind: 'answer',
      mode: 'multiple_choice',
      optionId: payload.optionId,
    };
  if (
    payload.kind === 'answer' &&
    payload.mode === 'closest' &&
    typeof payload.value === 'number' &&
    Number.isFinite(payload.value)
  )
    return { kind: 'answer', mode: 'closest', value: payload.value };
  throw new LiveSessionDomainError(
    'INVALID_RYO_SUBMISSION',
    'Choose a valid answer or opponent decision',
  );
}

function actorSubmission(
  payload: GameplayCommandPayload,
  actor: InteractionActorProjection,
  prompt: GameplayPromptState,
) {
  const valid = submission(payload);
  const answering = prompt.internalPayload.answeringTeamId;
  const opposing = prompt.internalPayload.opposingTeamId;
  if (
    (valid.kind === 'answer' && actor.teamId !== answering) ||
    (valid.kind === 'decision' && actor.teamId !== opposing)
  ) {
    throw new LiveSessionDomainError(
      'RYO_WRONG_SIDE',
      'This action is not available to your team',
    );
  }
  return valid;
}

export const RYO_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: RYO_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  createInitialRuntimeState: (context) =>
    validateRuntime(context.initialState ?? {}),
  createInitialRoundState(context) {
    const runtime = validateRuntime(context.runtimeState ?? {});
    const teams = parse<string[]>(runtime.teamIdsJson, 'teams');
    const itemIndex = Number(runtime.currentItemIndex ?? 0);
    const starting = String(runtime.startingTeamId);
    const answeringTeamId = ryoAnsweringTeam(teams, starting, itemIndex);
    return validateRound({
      phase: 'collecting',
      itemIndex,
      answeringTeamId,
      opposingTeamId: teams.find((id) => id !== answeringTeamId) ?? '',
    });
  },
  validateRuntimeState: validateRuntime,
  validateRoundState: validateRound,
  command: () => undefined,
  handleCommand() {
    throw new LiveSessionDomainError(
      'MODE_COMMAND_UNAVAILABLE',
      'RYO uses blind interaction submissions',
    );
  },
  projectRuntimeState(state) {
    const valid = validateRuntime(state);
    return {
      challengeId: valid.challengeId,
      worldId: valid.worldId,
      slotKey: valid.slotKey,
      currentItemIndex: valid.currentItemIndex ?? 0,
      startingTeamId: valid.startingTeamId,
      phase: valid.phase ?? 'intro',
      scoreEventsJson: valid.scoreEventsJson ?? '[]',
      resultsJson: valid.resultsJson ?? '[]',
    };
  },
  projectRoundState: validateRound,
  interaction: {
    submissionAuthorization: 'connected-player',
    submissionPolicy: 'one-per-participant',
    preparePrompt(context, input, now) {
      const item = parse<Record<string, unknown>>(input.itemJson, 'item');
      if (
        typeof context.activeTeamId !== 'string' ||
        typeof input.opposingTeamId !== 'string'
      )
        throw new LiveSessionDomainError(
          'INVALID_RYO_PROMPT',
          'RYO team ownership is missing',
        );
      return {
        type: 'ryo.item',
        schemaVersion: 1,
        publicPayload: {
          itemJson: JSON.stringify({
            id: item.id,
            prompt: item.prompt,
            media: item.media ?? null,
            answerMode: item.answerMode,
            options: item.options ?? null,
          }),
          answeringTeamId: context.activeTeamId,
        },
        participantPayload: {},
        hostPayload: {},
        internalPayload: {
          itemJson: JSON.stringify(item),
          answeringTeamId: context.activeTeamId,
          opposingTeamId: input.opposingTeamId,
        },
        visibility: 'public',
        metadata: {},
        visibleFrom: now,
        deadlineAt: new Date(now.getTime() + RYO_TIMER_SECONDS * 1000),
      };
    },
    validatePrompt: (prompt) => prompt,
    validateSubmission: submission,
    validateSubmissionForActor: actorSubmission,
    shouldAutoResolve(submissions) {
      const accepted = submissions.filter(
        (s) => s.status === 'pending-adjudication',
      );
      return (
        accepted.some((s) => s.payload.kind === 'answer') &&
        accepted.some((s) => s.payload.kind === 'decision')
      );
    },
    projectPrompt(prompt, actor) {
      const result = { ...prompt.publicPayload };
      if (actor.teamId === prompt.internalPayload.answeringTeamId)
        result.actorRole = 'answering';
      else if (actor.teamId === prompt.internalPayload.opposingTeamId)
        result.actorRole = 'opposing';
      else result.actorRole = 'spectator';
      return result;
    },
    projectSubmission(value, actor) {
      return actor.participantId === value.participantId
        ? { status: value.status, kind: value.payload.kind }
        : undefined;
    },
    createOutcome(submissions, _now, prompt) {
      const answer = submissions.find((s) => s.payload.kind === 'answer');
      const decision = submissions.find((s) => s.payload.kind === 'decision');
      const item = parse<Record<string, unknown>>(
        prompt?.internalPayload.itemJson,
        'item',
      );
      const answerPayload = answer?.payload;
      const correct =
        answerPayload?.mode === 'multiple_choice'
          ? answerPayload.optionId === item.correctOptionId
          : answerPayload?.mode === 'closest' &&
              typeof answerPayload.value === 'number' &&
              typeof item.correctValue === 'number'
            ? Math.abs(answerPayload.value - item.correctValue) <=
              Number(item.acceptedTolerance ?? 0)
            : false;
      const selectedAnswer =
        answerPayload?.mode === 'multiple_choice'
          ? answerPayload.optionId
          : answerPayload?.mode === 'closest'
            ? answerPayload.value
            : null;
      const correctAnswer =
        item.answerMode === 'multiple_choice'
          ? item.correctOptionId
          : item.correctValue;
      const opponentDecision = decision?.payload.decision ?? 'trust';
      return {
        outcome: {
          type: 'ryo.result',
          schemaVersion: 1,
          publicPayload: {
            selectedAnswer: selectedAnswer ?? null,
            correctAnswer: String(correctAnswer ?? ''),
            correct,
            decision: opponentDecision,
          },
          teamPayload: {},
          participantPayload: {},
          hostPayload: {},
          privatePayload: {
            scoringInputJson: JSON.stringify({
              answeringTeamId: prompt?.internalPayload.answeringTeamId,
              opposingTeamId: prompt?.internalPayload.opposingTeamId,
              contentItemId: item.id,
              itemIndex: item.itemIndex,
              selectedAnswer,
              correctAnswer,
              decision: String(opponentDecision).toUpperCase(),
              correct,
            }),
          },
          completionReason: 'automatic',
          selectedSubmissionIds: submissions.map((s) => s.id),
        },
        effects: [],
      };
    },
    validateOutcome: (outcome) => outcome,
    projectOutcome: (outcome) => outcome.publicPayload,
  },
};
