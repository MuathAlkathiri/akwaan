import {
  GameplayCommandPayload,
  GameplayModePlugin,
  GameplayModeState,
} from './gameplay-mode.plugin';
import { GameplayPromptState } from './gameplay-interaction';
import { InteractionActorProjection } from './gameplay-interaction.plugin';
import { LiveSessionDomainError } from './live-session.errors';
import {
  assignNextTeamAction,
  assignmentFor,
  EligibleParticipant,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
  TeamActionAssignmentState,
} from './team-action-assignment';

export const RYO_MODE_KEY = 'read-your-opponent';
export const RYO_TIMER_SECONDS = 25;

/**
 * The two authoritative team actions one RYO item opens, simultaneously.
 *
 * Both are live at once and neither can see the other — that blind simultaneity
 * is the mechanic. What changed is only *who* on each team may act: one named
 * answerer and one named decision-maker, instead of whoever's phone was fastest.
 */
export const RYO_ANSWER_ACTION = 'ryo.answer';
export const RYO_DECISION_ACTION = 'ryo.decision';

/**
 * Opens the next item's two actions and advances both teams' rotations.
 *
 * Every team acts exactly once per item, so both rotations move on every item:
 * with two players per team that produces A1/B1, then A2/B2, then A1/B1 again.
 */
export function openRyoItemAssignments(input: {
  state: TeamActionAssignmentState;
  answeringTeamId: string;
  opposingTeamId: string;
  participants: readonly EligibleParticipant[];
}): {
  state: TeamActionAssignmentState;
  answererParticipantId: string;
  deciderParticipantId: string;
} {
  const answer = assignNextTeamAction(input.state, {
    teamId: input.answeringTeamId,
    action: RYO_ANSWER_ACTION,
    participants: input.participants,
  });
  const decision = assignNextTeamAction(answer.state, {
    teamId: input.opposingTeamId,
    action: RYO_DECISION_ACTION,
    participants: input.participants,
  });
  return {
    state: decision.state,
    answererParticipantId: answer.assignment.participantId,
    deciderParticipantId: decision.assignment.participantId,
  };
}

export function ryoAssignments(
  state: GameplayModeState,
): TeamActionAssignmentState {
  return parseTeamActionAssignments(state.teamActionJson);
}

export function withRyoAssignments(
  state: GameplayModeState,
  assignments: TeamActionAssignmentState,
): GameplayModeState {
  return {
    ...state,
    teamActionJson: serializeTeamActionAssignments(assignments),
  };
}

export function ryoAssignedParticipants(state: GameplayModeState): {
  answererParticipantId: string;
  deciderParticipantId: string;
} {
  const assignments = ryoAssignments(state);
  return {
    answererParticipantId:
      assignmentFor(assignments, RYO_ANSWER_ACTION)?.participantId ?? '',
    deciderParticipantId:
      assignmentFor(assignments, RYO_DECISION_ACTION)?.participantId ?? '',
  };
}

export function ryoAnsweringTeam(
  teamIds: string[],
  startingTeamId: string,
  itemIndex: number,
): string {
  return teamIds[(teamIds.indexOf(startingTeamId) + itemIndex) % 2];
}

/**
 * The authored text of a chosen option, not its id.
 *
 * Falls back to the id only when the option can no longer be found — a recap
 * that says something odd is still better than one that says nothing at all.
 */
function optionLabel(
  item: { options?: unknown },
  optionId: string,
): string {
  const options = Array.isArray(item.options) ? item.options : [];
  const match = options.find(
    (option): option is { id: string; label?: unknown } =>
      !!option &&
      typeof option === 'object' &&
      String((option as { id?: unknown }).id) === optionId,
  );
  const label = match?.label;
  if (typeof label === 'string' && label.trim()) return label.trim();
  if (label && typeof label === 'object') {
    const authored = label as Record<string, unknown>;
    for (const value of [authored.ar, authored.en, ...Object.values(authored)]) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return optionId;
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
  // Without a readable rotation nobody is authorised, so the runtime is invalid
  // rather than open to whoever submits first.
  parseTeamActionAssignments(state.teamActionJson);
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

/**
 * Both halves of the RYO authority check, in the order that produces the most
 * honest refusal: wrong team first, then right team but not the assigned player.
 * A hidden button is never the security boundary — this is.
 */
function actorSubmission(
  payload: GameplayCommandPayload,
  actor: InteractionActorProjection,
  prompt: GameplayPromptState,
  runtimeState: GameplayModeState,
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
  // From the runtime, not the prompt: a disconnect handoff moves the assignment
  // while the item is still open, and the prompt still names whoever left.
  const current = ryoAssignedParticipants(runtimeState);
  const assigned =
    valid.kind === 'answer'
      ? current.answererParticipantId
      : current.deciderParticipantId;
  if (assigned && actor.participantId !== assigned) {
    throw new LiveSessionDomainError(
      'RYO_NOT_ASSIGNED_PARTICIPANT',
      'Only the assigned player may take this action for the team',
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
      // Who is authoritative right now, from the same state the submission
      // check reads. The prompt carries these too, but a prompt is a snapshot:
      // after a disconnect handoff it still names whoever left, so a phone that
      // trusted it would show its controls to the wrong player.
      ...ryoAssignedParticipants(valid),
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
        typeof input.opposingTeamId !== 'string' ||
        typeof input.answererParticipantId !== 'string' ||
        typeof input.deciderParticipantId !== 'string'
      )
        throw new LiveSessionDomainError(
          'INVALID_RYO_PROMPT',
          'RYO team ownership and participant assignment are missing',
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
          opposingTeamId: input.opposingTeamId,
          // Public, and deliberately so: a teammate has to know who to talk to,
          // and neither id says anything about what the other side chose.
          answererParticipantId: input.answererParticipantId,
          deciderParticipantId: input.deciderParticipantId,
        },
        participantPayload: {},
        hostPayload: {},
        internalPayload: {
          itemJson: JSON.stringify(item),
          answeringTeamId: context.activeTeamId,
          opposingTeamId: input.opposingTeamId,
          answererParticipantId: input.answererParticipantId,
          deciderParticipantId: input.deciderParticipantId,
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
    projectPrompt(prompt, actor, runtimeState) {
      const result = { ...prompt.publicPayload };
      if (actor.teamId === prompt.internalPayload.answeringTeamId)
        result.actorRole = 'answering';
      else if (actor.teamId === prompt.internalPayload.opposingTeamId)
        result.actorRole = 'opposing';
      else result.actorRole = 'spectator';
      // From the runtime when it is available, which is what the submission
      // check reads: after a disconnect handoff the prompt still names whoever
      // left, and a phone trusting it would offer controls to the wrong player.
      const current = runtimeState
        ? ryoAssignedParticipants(runtimeState)
        : {
            answererParticipantId: String(
              prompt.internalPayload.answererParticipantId ?? '',
            ),
            deciderParticipantId: String(
              prompt.internalPayload.deciderParticipantId ?? '',
            ),
          };
      result.answererParticipantId = current.answererParticipantId;
      result.deciderParticipantId = current.deciderParticipantId;
      // A convenience for rendering only. The server refuses an unassigned
      // submission whatever this says.
      result.isAssignedActor =
        actor.participantId === current.answererParticipantId ||
        actor.participantId === current.deciderParticipantId;
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
      // What a recap *shows*. A multiple-choice answer is stored as an option id
      // because that is what grading compares, but "أجاب: option-1" is an
      // internal key read out to a room. The authored label is the answer.
      const selectedAnswerText =
        answerPayload?.mode === 'multiple_choice'
          ? optionLabel(item, String(answerPayload.optionId ?? ''))
          : String(selectedAnswer ?? '');
      const correctAnswerText =
        item.answerMode === 'multiple_choice'
          ? optionLabel(item, String(item.correctOptionId ?? ''))
          : String(correctAnswer ?? '');
      const opponentDecision = decision?.payload.decision ?? 'trust';
      const answererParticipantId = String(
        prompt?.internalPayload.answererParticipantId ?? '',
      );
      const deciderParticipantId = String(
        prompt?.internalPayload.deciderParticipantId ?? '',
      );
      return {
        outcome: {
          type: 'ryo.result',
          schemaVersion: 1,
          publicPayload: {
            selectedAnswer: selectedAnswerText || null,
            correctAnswer: correctAnswerText,
            correct,
            decision: opponentDecision,
            itemIndex: Number(item.itemIndex ?? 0),
            // The prompt is already public on the shared screen; carrying it into
            // the record is what lets a recap be read without the runtime.
            promptText:
              typeof item.prompt === 'object' && item.prompt
                ? String((item.prompt as { ar?: string }).ar ?? '')
                : String(item.prompt ?? ''),
            answeringTeamId: String(
              prompt?.internalPayload.answeringTeamId ?? '',
            ),
            opposingTeamId: String(
              prompt?.internalPayload.opposingTeamId ?? '',
            ),
            answererParticipantId,
            deciderParticipantId,
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
