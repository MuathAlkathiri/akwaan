import {
  GameplayCommandPayload,
  GameplayCommandResult,
  GameplayModePlugin,
  GameplayModeState,
  GameplayPluginContext,
} from './gameplay-mode.plugin';
import { InteractionActorProjection } from './gameplay-interaction.plugin';
import { LiveSessionDomainError } from './live-session.errors';
import {
  assertTeamActionAuthorized,
  assignNextTeamAction,
  assignmentFor,
  clearTeamAction,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
  TeamActionAssignmentState,
} from './team-action-assignment';

export const CLOSEST_MODE_KEY = 'closest';
export const CLOSEST_TIMER_SECONDS = 45;
export const CLOSEST_ITEM_COUNT = 3;
export const closestAnswerAction = (teamId: string) =>
  `closest.answer.${teamId}`;

export interface ClosestRuntimeItem {
  id: string;
  prompt: unknown;
  media?: unknown;
  correctValue: number;
}

export interface ClosestItemResult {
  itemIndex: number;
  contentItemId: string;
  prompt: unknown;
  correctValue: number;
  answers: Record<string, number | null>;
  distances: Record<string, number | null>;
  assignedParticipantIds: Record<string, string>;
  winnerTeamId: string | null;
  tie: boolean;
  resolutionReason: 'both-submitted' | 'deadline';
  resolvedAt: string;
}

function fail(message: string): never {
  throw new LiveSessionDomainError('INVALID_CLOSEST_STATE', message);
}

function parse<T>(value: unknown, label: string): T {
  if (typeof value !== 'string') return fail(`${label} is missing`);
  try {
    return JSON.parse(value) as T;
  } catch {
    return fail(`${label} is invalid`);
  }
}

function itemsOf(state: GameplayModeState): ClosestRuntimeItem[] {
  return parse<ClosestRuntimeItem[]>(state.itemsJson, 'items');
}

function teamsOf(state: GameplayModeState): string[] {
  return parse<string[]>(state.teamIdsJson, 'teams');
}

function resultsOf(state: GameplayModeState): ClosestItemResult[] {
  return parse<ClosestItemResult[]>(state.resultsJson ?? '[]', 'results');
}

function answersOf(state: GameplayModeState): Record<string, number> {
  return parse<Record<string, number>>(state.answersJson ?? '{}', 'answers');
}

function submittedByOf(state: GameplayModeState): Record<string, string> {
  return parse<Record<string, string>>(
    state.submittedByJson ?? '{}',
    'submitted answerers',
  );
}

function validateRuntime(state: GameplayModeState): GameplayModeState {
  const items = itemsOf(state);
  const teams = teamsOf(state);
  const results = resultsOf(state);
  if (
    items.length !== CLOSEST_ITEM_COUNT ||
    new Set(items.map((item) => item.id)).size !== CLOSEST_ITEM_COUNT ||
    items.some((item) => !Number.isFinite(item.correctValue)) ||
    teams.length !== 2 ||
    new Set(teams).size !== 2 ||
    results.length > CLOSEST_ITEM_COUNT ||
    !['collecting', 'revealed', 'completed'].includes(String(state.phase)) ||
    !Number.isInteger(state.currentItemIndex) ||
    Number(state.currentItemIndex) < 0 ||
    Number(state.currentItemIndex) >= CLOSEST_ITEM_COUNT
  ) {
    return fail('Closest requires three finite numeric items and two teams');
  }
  parseTeamActionAssignments(state.teamActionJson);
  const answers = answersOf(state);
  if (Object.values(answers).some((value) => !Number.isFinite(value))) {
    return fail('Closest answers must be finite numbers');
  }
  return {
    ...state,
    itemsJson: JSON.stringify(items),
    teamIdsJson: JSON.stringify(teams),
    resultsJson: JSON.stringify(results),
    answersJson: JSON.stringify(answers),
  };
}

function validateRound(state: GameplayModeState): GameplayModeState {
  if (
    !['collecting', 'revealed', 'completed'].includes(String(state.phase)) ||
    !Number.isInteger(state.itemIndex)
  ) {
    return fail('Closest round progress is incomplete');
  }
  return state;
}

function numericPayload(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (
    Object.keys(payload).some(
      (key) => !['value', 'assignmentSequence'].includes(key),
    ) ||
    typeof payload.value !== 'number' ||
    !Number.isFinite(payload.value) ||
    (payload.assignmentSequence !== undefined &&
      typeof payload.assignmentSequence !== 'number')
  ) {
    throw new LiveSessionDomainError(
      'INVALID_CLOSEST_SUBMISSION',
      'Submit one finite numeric estimate',
    );
  }
  return payload;
}

function noPayload(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (Object.keys(payload).length) {
    throw new LiveSessionDomainError(
      'INVALID_CLOSEST_COMMAND',
      'This command does not accept a payload',
    );
  }
  return {};
}

export function gradeClosestItem(input: {
  item: ClosestRuntimeItem;
  teamIds: string[];
  answers: Record<string, number>;
  assignedParticipantIds: Record<string, string>;
  itemIndex: number;
  resolutionReason: 'both-submitted' | 'deadline';
  resolvedAt: string;
}): ClosestItemResult {
  const distances = Object.fromEntries(
    input.teamIds.map((teamId) => [
      teamId,
      input.answers[teamId] === undefined
        ? null
        : Math.abs(input.answers[teamId] - input.item.correctValue),
    ]),
  ) as Record<string, number | null>;
  const [teamA, teamB] = input.teamIds;
  const a = distances[teamA];
  const b = distances[teamB];
  let winnerTeamId: string | null = null;
  if (a !== null && b === null) winnerTeamId = teamA;
  else if (b !== null && a === null) winnerTeamId = teamB;
  else if (a !== null && b !== null && a !== b)
    winnerTeamId = a < b ? teamA : teamB;
  return {
    itemIndex: input.itemIndex,
    contentItemId: input.item.id,
    prompt: input.item.prompt,
    correctValue: input.item.correctValue,
    answers: Object.fromEntries(
      input.teamIds.map((teamId) => [teamId, input.answers[teamId] ?? null]),
    ),
    distances,
    assignedParticipantIds: input.assignedParticipantIds,
    winnerTeamId,
    tie: winnerTeamId === null,
    resolutionReason: input.resolutionReason,
    resolvedAt: input.resolvedAt,
  };
}

function openAssignments(
  state: TeamActionAssignmentState,
  teams: string[],
  context: GameplayPluginContext,
) {
  let next = state;
  const participantIds: Record<string, string> = {};
  for (const teamId of teams) {
    const opened = assignNextTeamAction(next, {
      teamId,
      action: closestAnswerAction(teamId),
      participants: context.eligibleParticipants ?? [],
    });
    next = opened.state;
    participantIds[teamId] = opened.assignment.participantId;
  }
  return { state: next, participantIds };
}

function assignedIds(
  assignments: TeamActionAssignmentState,
  teams: string[],
): Record<string, string> {
  return Object.fromEntries(
    teams.map((teamId) => [
      teamId,
      assignmentFor(assignments, closestAnswerAction(teamId))?.participantId ??
        '',
    ]),
  );
}

function resolve(
  context: GameplayPluginContext,
  runtime: GameplayModeState,
  reason: 'both-submitted' | 'deadline',
): GameplayCommandResult {
  const teams = teamsOf(runtime);
  const assignments = parseTeamActionAssignments(runtime.teamActionJson);
  const submittedBy = submittedByOf(runtime);
  const result = gradeClosestItem({
    item: itemsOf(runtime)[Number(runtime.currentItemIndex)],
    teamIds: teams,
    answers: answersOf(runtime),
    assignedParticipantIds: {
      ...assignedIds(assignments, teams),
      ...submittedBy,
    },
    itemIndex: Number(runtime.currentItemIndex),
    resolutionReason: reason,
    resolvedAt: (context.now ?? fail('Server command time is missing')).toISOString(),
  });
  let cleared = assignments;
  for (const teamId of teams) {
    cleared = clearTeamAction(cleared, closestAnswerAction(teamId));
  }
  const results = [...resultsOf(runtime), result];
  const next = validateRuntime({
    ...runtime,
    phase: 'revealed',
    resultsJson: JSON.stringify(results),
    answersJson: '{}',
    teamActionJson: serializeTeamActionAssignments(cleared),
    deadlineAt: null,
  });
  return {
    runtimeState: next,
    roundState: validateRound({
      phase: 'revealed',
      itemIndex: runtime.currentItemIndex,
    }),
    eventType: 'closest-item-resolved',
    eventPayload: {
      itemIndex: runtime.currentItemIndex,
      winnerTeamId: result.winnerTeamId,
      tie: result.tie,
    },
    effects: [],
  };
}

function handle(
  context: GameplayPluginContext,
  command: {
    type: string;
    payload: GameplayCommandPayload;
    runtimeState: GameplayModeState;
    roundState: GameplayModeState;
  },
): GameplayCommandResult {
  const runtime = validateRuntime(command.runtimeState);
  validateRound(command.roundState);
  if (command.type === 'submit-estimate') {
    if (runtime.phase !== 'collecting') {
      throw new LiveSessionDomainError(
        'MODE_COMMAND_UNAVAILABLE',
        'This Closest item is not accepting answers',
      );
    }
    const participantId = context.submitterParticipantId;
    if (!participantId) {
      throw new LiveSessionDomainError(
        'CLOSEST_NOT_ASSIGNED_PARTICIPANT',
        'Only the assigned answerer may submit for their team',
      );
    }
    const assignments = parseTeamActionAssignments(runtime.teamActionJson);
    const teamId = teamsOf(runtime).find(
      (id) =>
        assignmentFor(assignments, closestAnswerAction(id))?.participantId ===
        participantId,
    );
    if (!teamId) {
      throw new LiveSessionDomainError(
        'CLOSEST_NOT_ASSIGNED_PARTICIPANT',
        'Only the assigned answerer may submit for their team',
      );
    }
    assertTeamActionAuthorized(assignments, {
      action: closestAnswerAction(teamId),
      participantId,
      ...(typeof command.payload.assignmentSequence === 'number'
        ? { sequence: command.payload.assignmentSequence }
        : {}),
    });
    const answers = answersOf(runtime);
    if (answers[teamId] !== undefined) {
      throw new LiveSessionDomainError(
        'CLOSEST_TEAM_ALREADY_SUBMITTED',
        'This team already submitted an estimate',
      );
    }
    answers[teamId] = Number(command.payload.value);
    const submittedBy = submittedByOf(runtime);
    submittedBy[teamId] = participantId;
    const remainingAssignments = clearTeamAction(
      assignments,
      closestAnswerAction(teamId),
    );
    const submitted = validateRuntime({
      ...runtime,
      answersJson: JSON.stringify(answers),
      submittedByJson: JSON.stringify(submittedBy),
      teamActionJson: serializeTeamActionAssignments(remainingAssignments),
    });
    if (Object.keys(answers).length === 2) {
      return resolve(context, submitted, 'both-submitted');
    }
    return {
      runtimeState: submitted,
      roundState: command.roundState,
      eventType: 'closest-estimate-submitted',
      eventPayload: { teamId },
      effects: [],
    };
  }
  if (command.type === 'expire-closest-item') {
    if (
      runtime.phase !== 'collecting' ||
      typeof runtime.deadlineAt !== 'string' ||
      (context.now ?? fail('Server command time is missing')).getTime() <
        Date.parse(runtime.deadlineAt)
    ) {
      throw new LiveSessionDomainError(
        'MODE_COMMAND_UNAVAILABLE',
        'Closest deadline has not elapsed',
      );
    }
    return resolve(context, runtime, 'deadline');
  }
  if (runtime.phase !== 'revealed') {
    throw new LiveSessionDomainError(
      'MODE_COMMAND_UNAVAILABLE',
      'Resolve the current item before continuing',
    );
  }
  const current = Number(runtime.currentItemIndex);
  if (current === CLOSEST_ITEM_COUNT - 1) {
    const completed = validateRuntime({ ...runtime, phase: 'completed' });
    return {
      runtimeState: completed,
      roundState: validateRound({ phase: 'completed', itemIndex: current }),
      eventType: 'closest-challenge-completed',
      eventPayload: { itemCount: CLOSEST_ITEM_COUNT },
      effects: [{ type: 'emit-runtime-event', eventType: 'closest-completed' }],
    };
  }
  const opened = openAssignments(
    parseTeamActionAssignments(runtime.teamActionJson),
    teamsOf(runtime),
    context,
  );
  const nextIndex = current + 1;
  const next = validateRuntime({
    ...runtime,
    currentItemIndex: nextIndex,
    phase: 'collecting',
    answersJson: '{}',
    submittedByJson: '{}',
    teamActionJson: serializeTeamActionAssignments(opened.state),
    deadlineAt: new Date(
      (context.now ?? fail('Server command time is missing')).getTime() +
        CLOSEST_TIMER_SECONDS * 1000,
    ).toISOString(),
  });
  return {
    runtimeState: next,
    roundState: validateRound({ phase: 'collecting', itemIndex: nextIndex }),
    eventType: 'closest-item-advanced',
    eventPayload: { itemIndex: nextIndex },
    effects: [],
  };
}

function publicState(
  state: GameplayModeState,
  actor?: InteractionActorProjection,
): GameplayModeState {
  const valid = validateRuntime(state);
  const teams = teamsOf(valid);
  const item = itemsOf(valid)[Number(valid.currentItemIndex)];
  const answers = answersOf(valid);
  const assignments = parseTeamActionAssignments(valid.teamActionJson);
  const latest = resultsOf(valid).at(-1);
  const revealed = valid.phase !== 'collecting';
  const ownTeam = actor?.teamId;
  const visibleOwnAnswer =
    ownTeam && answers[ownTeam] !== undefined ? answers[ownTeam] : undefined;
  return {
    phase: valid.phase,
    currentItemIndex: valid.currentItemIndex,
    itemCount: CLOSEST_ITEM_COUNT,
    currentItemJson: JSON.stringify({
      id: item.id,
      prompt: item.prompt,
      media: item.media ?? null,
    }),
    deadlineAt: valid.deadlineAt ?? null,
    teamIdsJson: JSON.stringify(teams),
    submissionStatusJson: JSON.stringify(
      Object.fromEntries(teams.map((teamId) => [teamId, answers[teamId] !== undefined])),
    ),
    assignedParticipantIdsJson: JSON.stringify(assignedIds(assignments, teams)),
    ...(visibleOwnAnswer !== undefined
      ? { ownSubmittedValue: visibleOwnAnswer }
      : {}),
    ...(actor
      ? {
          actorTeamId: actor.teamId ?? null,
          isAssignedActor: teams.some(
            (teamId) =>
              assignmentFor(assignments, closestAnswerAction(teamId))
                ?.participantId === actor.participantId,
          ),
        }
      : {}),
    ...(revealed && latest ? { revealedResultJson: JSON.stringify(latest) } : {}),
    resultsJson: JSON.stringify(
      resultsOf(valid).map((result) =>
        revealed || result.itemIndex < Number(valid.currentItemIndex)
          ? result
          : { itemIndex: result.itemIndex },
      ),
    ),
  };
}

export const CLOSEST_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: CLOSEST_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  createInitialRuntimeState: (context) => validateRuntime(context.initialState ?? {}),
  createInitialRoundState(context) {
    const runtime = validateRuntime(context.runtimeState ?? {});
    return validateRound({
      phase: runtime.phase,
      itemIndex: runtime.currentItemIndex,
    });
  },
  validateRuntimeState: validateRuntime,
  validateRoundState: validateRound,
  command(type) {
    if (type === 'submit-estimate') {
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: numericPayload,
      };
    }
    if (type === 'advance-closest-item') {
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    if (type === 'expire-closest-item') {
      return {
        type,
        // Invoked by the server scheduler under the controller identity. The
        // reducer still proves the persisted deadline elapsed, so a host cannot
        // force an early forfeit.
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    return undefined;
  },
  handleCommand: handle,
  projectRuntimeState: (state) => publicState(state),
  projectRuntimeStateForActor: (state, actor) => publicState(state, actor),
  projectRoundState: validateRound,
};
