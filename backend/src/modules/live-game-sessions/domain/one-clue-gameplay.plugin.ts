import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  ONE_CLUE_ITEM_COUNT,
  ONE_CLUE_SLUG,
  ONE_CLUE_STAGE_SECONDS,
  ONE_CLUE_VALUES,
} from '../../world-content/domain/world-content.constants';
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

export const ONE_CLUE_MODE_KEY = ONE_CLUE_SLUG;
export { ONE_CLUE_ITEM_COUNT, ONE_CLUE_STAGE_SECONDS, ONE_CLUE_VALUES };
export const oneClueAnswerAction = (teamId: string) =>
  `one-clue.answer.${teamId}`;

export interface OneClueRuntimeItem {
  id: string;
  prompt: unknown;
  media?: unknown;
  clues: Array<{ order: number; value: number; text: unknown }>;
  acceptedAnswers: string[];
}

interface LockedAnswer {
  answer: string;
  participantId: string;
}

export interface OneClueItemResult {
  itemIndex: number;
  contentItemId: string;
  prompt: unknown;
  correctAnswer: string;
  clueNumber: number;
  clueValue: number;
  answers: Record<string, string | null>;
  statuses: Record<string, 'correct' | 'wrong' | 'no-answer'>;
  points: Record<string, number>;
  winnerTeamIds: string[];
  resolvedAt: string;
}

function fail(message: string): never {
  throw new LiveSessionDomainError('INVALID_ONE_CLUE_STATE', message);
}

function parse<T>(value: unknown, label: string): T {
  if (typeof value !== 'string') return fail(`${label} is missing`);
  try {
    return JSON.parse(value) as T;
  } catch {
    return fail(`${label} is invalid`);
  }
}

const itemsOf = (state: GameplayModeState) =>
  parse<OneClueRuntimeItem[]>(state.itemsJson, 'items');
const teamsOf = (state: GameplayModeState) =>
  parse<string[]>(state.teamIdsJson, 'teams');
const submissionsOf = (state: GameplayModeState) =>
  parse<Record<string, LockedAnswer>>(
    state.submissionsJson ?? '{}',
    'submissions',
  );
const lockedAnswersOf = (state: GameplayModeState) =>
  parse<Record<string, LockedAnswer>>(
    state.lockedAnswersJson ?? '{}',
    'locked answers',
  );
const eliminatedOf = (state: GameplayModeState) =>
  parse<string[]>(state.eliminatedTeamIdsJson ?? '[]', 'eliminated teams');
const resultsOf = (state: GameplayModeState) =>
  parse<OneClueItemResult[]>(state.resultsJson ?? '[]', 'results');

export function validateOneClueItem(item: OneClueRuntimeItem): void {
  if (
    item.clues.length !== ONE_CLUE_VALUES.length ||
    item.clues.some(
      (clue, index) =>
        clue.order !== index + 1 ||
        clue.value !== ONE_CLUE_VALUES[index] ||
        !clue.text ||
        (typeof clue.text === 'string' && !clue.text.trim()),
    ) ||
    !item.acceptedAnswers.length ||
    item.acceptedAnswers.some((answer) => !normalizeAnswer(answer))
  ) {
    throw new LiveSessionDomainError(
      'ONE_CLUE_CONTENT_INVALID',
      'One Clue needs five ordered clues valued 5 to 1 and accepted answers',
    );
  }
}

function validateRuntime(state: GameplayModeState): GameplayModeState {
  const items = itemsOf(state);
  const teams = teamsOf(state);
  if (
    items.length !== ONE_CLUE_ITEM_COUNT ||
    new Set(items.map((item) => item.id)).size !== ONE_CLUE_ITEM_COUNT ||
    teams.length !== 2 ||
    new Set(teams).size !== 2 ||
    !['collecting', 'revealed', 'completed'].includes(String(state.phase)) ||
    !Number.isInteger(state.currentItemIndex) ||
    !Number.isInteger(state.currentClueIndex) ||
    Number(state.currentItemIndex) < 0 ||
    Number(state.currentItemIndex) >= ONE_CLUE_ITEM_COUNT ||
    Number(state.currentClueIndex) < 0 ||
    Number(state.currentClueIndex) >= ONE_CLUE_VALUES.length
  ) {
    return fail('One Clue runtime shape is invalid');
  }
  items.forEach(validateOneClueItem);
  parseTeamActionAssignments(state.teamActionJson);
  submissionsOf(state);
  lockedAnswersOf(state);
  eliminatedOf(state);
  resultsOf(state);
  return state;
}

function validateRound(state: GameplayModeState): GameplayModeState {
  if (
    !Number.isInteger(state.itemIndex) ||
    !Number.isInteger(state.clueIndex)
  ) {
    return fail('One Clue round progress is incomplete');
  }
  return state;
}

function answerPayload(
  payload: GameplayCommandPayload,
): GameplayCommandPayload {
  if (
    Object.keys(payload).some(
      (key) => !['answer', 'assignmentSequence'].includes(key),
    ) ||
    typeof payload.answer !== 'string' ||
    !payload.answer.trim() ||
    (payload.assignmentSequence !== undefined &&
      typeof payload.assignmentSequence !== 'number')
  ) {
    throw new LiveSessionDomainError(
      'INVALID_ONE_CLUE_SUBMISSION',
      'Lock one non-empty answer',
    );
  }
  return { ...payload, answer: payload.answer.trim() };
}

function noPayload(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (Object.keys(payload).length) {
    throw new LiveSessionDomainError(
      'INVALID_ONE_CLUE_COMMAND',
      'This command does not accept a payload',
    );
  }
  return {};
}

function assignedIds(state: TeamActionAssignmentState, teams: string[]) {
  return Object.fromEntries(
    teams.map((teamId) => [
      teamId,
      assignmentFor(state, oneClueAnswerAction(teamId))?.participantId ?? '',
    ]),
  );
}

function openAssignments(
  state: TeamActionAssignmentState,
  teams: string[],
  context: GameplayPluginContext,
) {
  let next = state;
  for (const teamId of teams) {
    next = assignNextTeamAction(next, {
      teamId,
      action: oneClueAnswerAction(teamId),
      participants: context.eligibleParticipants ?? [],
    }).state;
  }
  return next;
}

function resolveStage(
  context: GameplayPluginContext,
  runtime: GameplayModeState,
): GameplayCommandResult {
  const now = context.now ?? fail('Server command time is missing');
  const teams = teamsOf(runtime);
  const item = itemsOf(runtime)[Number(runtime.currentItemIndex)];
  const clueIndex = Number(runtime.currentClueIndex);
  const submissions = submissionsOf(runtime);
  const lockedAnswers = lockedAnswersOf(runtime);
  const eliminated = new Set(eliminatedOf(runtime));
  const correctTeams = teams.filter((teamId) => {
    const submission = submissions[teamId];
    return (
      submission &&
      item.acceptedAnswers.some(
        (accepted) =>
          normalizeAnswer(accepted) === normalizeAnswer(submission.answer),
      )
    );
  });
  const wrongTeams = teams.filter(
    (teamId) => submissions[teamId] && !correctTeams.includes(teamId),
  );
  wrongTeams.forEach((teamId) => eliminated.add(teamId));
  const activeTeams = teams.filter((teamId) => !eliminated.has(teamId));
  const endsItem =
    correctTeams.length > 0 ||
    activeTeams.length === 0 ||
    clueIndex === ONE_CLUE_VALUES.length - 1;
  let assignments = parseTeamActionAssignments(runtime.teamActionJson);
  for (const teamId of wrongTeams) {
    assignments = clearTeamAction(assignments, oneClueAnswerAction(teamId));
  }
  if (!endsItem) {
    const nextClue = clueIndex + 1;
    return {
      runtimeState: validateRuntime({
        ...runtime,
        currentClueIndex: nextClue,
        submissionsJson: '{}',
        eliminatedTeamIdsJson: JSON.stringify([...eliminated]),
        teamActionJson: serializeTeamActionAssignments(assignments),
        deadlineAt: new Date(
          now.getTime() + ONE_CLUE_STAGE_SECONDS * 1000,
        ).toISOString(),
      }),
      roundState: validateRound({
        phase: 'collecting',
        itemIndex: runtime.currentItemIndex,
        clueIndex: nextClue,
      }),
      eventType: 'one-clue-stage-advanced',
      eventPayload: { clueNumber: nextClue + 1 },
      effects: [],
    };
  }
  for (const teamId of teams) {
    assignments = clearTeamAction(assignments, oneClueAnswerAction(teamId));
  }
  const result: OneClueItemResult = {
    itemIndex: Number(runtime.currentItemIndex),
    contentItemId: item.id,
    prompt: item.prompt,
    correctAnswer: item.acceptedAnswers[0],
    clueNumber: clueIndex + 1,
    clueValue: ONE_CLUE_VALUES[clueIndex],
    answers: Object.fromEntries(
      teams.map((teamId) => [teamId, lockedAnswers[teamId]?.answer ?? null]),
    ),
    statuses: Object.fromEntries(
      teams.map((teamId) => [
        teamId,
        correctTeams.includes(teamId)
          ? 'correct'
          : wrongTeams.includes(teamId) || eliminated.has(teamId)
            ? 'wrong'
            : 'no-answer',
      ]),
    ),
    points: Object.fromEntries(
      teams.map((teamId) => [
        teamId,
        correctTeams.includes(teamId) ? ONE_CLUE_VALUES[clueIndex] : 0,
      ]),
    ),
    winnerTeamIds: correctTeams,
    resolvedAt: now.toISOString(),
  };
  return {
    runtimeState: validateRuntime({
      ...runtime,
      phase: 'revealed',
      resultsJson: JSON.stringify([...resultsOf(runtime), result]),
      submissionsJson: '{}',
      eliminatedTeamIdsJson: JSON.stringify([...eliminated]),
      teamActionJson: serializeTeamActionAssignments(assignments),
      deadlineAt: null,
    }),
    roundState: validateRound({
      phase: 'revealed',
      itemIndex: runtime.currentItemIndex,
      clueIndex,
    }),
    eventType: 'one-clue-item-resolved',
    eventPayload: { itemIndex: runtime.currentItemIndex },
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
  if (command.type === 'submit-one-clue-answer') {
    if (runtime.phase !== 'collecting') {
      throw new LiveSessionDomainError(
        'MODE_COMMAND_UNAVAILABLE',
        'This clue is not accepting answers',
      );
    }
    const participantId = context.submitterParticipantId;
    const assignments = parseTeamActionAssignments(runtime.teamActionJson);
    const teamId = teamsOf(runtime).find(
      (id) =>
        assignmentFor(assignments, oneClueAnswerAction(id))?.participantId ===
        participantId,
    );
    if (!teamId || !participantId) {
      throw new LiveSessionDomainError(
        'ONE_CLUE_NOT_ASSIGNED_PARTICIPANT',
        'Only the assigned answerer may lock the team answer',
      );
    }
    assertTeamActionAuthorized(assignments, {
      action: oneClueAnswerAction(teamId),
      participantId,
      ...(typeof command.payload.assignmentSequence === 'number'
        ? { sequence: command.payload.assignmentSequence }
        : {}),
    });
    const submissions = submissionsOf(runtime);
    if (submissions[teamId]) {
      throw new LiveSessionDomainError(
        'ONE_CLUE_TEAM_ALREADY_SUBMITTED',
        'This team already locked an answer for this item',
      );
    }
    submissions[teamId] = {
      answer: String(command.payload.answer),
      participantId,
    };
    const lockedAnswers = lockedAnswersOf(runtime);
    lockedAnswers[teamId] = submissions[teamId];
    return {
      runtimeState: validateRuntime({
        ...runtime,
        submissionsJson: JSON.stringify(submissions),
        lockedAnswersJson: JSON.stringify(lockedAnswers),
      }),
      roundState: command.roundState,
      eventType: 'one-clue-answer-locked',
      eventPayload: { teamId },
      effects: [],
    };
  }
  if (command.type === 'expire-one-clue-stage') {
    if (
      runtime.phase !== 'collecting' ||
      typeof runtime.deadlineAt !== 'string' ||
      (context.now ?? fail('Server command time is missing')).getTime() <
        Date.parse(runtime.deadlineAt)
    ) {
      throw new LiveSessionDomainError(
        'MODE_COMMAND_UNAVAILABLE',
        'The clue deadline has not elapsed',
      );
    }
    return resolveStage(context, runtime);
  }
  if (runtime.phase !== 'revealed') {
    throw new LiveSessionDomainError(
      'MODE_COMMAND_UNAVAILABLE',
      'Resolve the item before continuing',
    );
  }
  const current = Number(runtime.currentItemIndex);
  if (current === ONE_CLUE_ITEM_COUNT - 1) {
    return {
      runtimeState: validateRuntime({ ...runtime, phase: 'completed' }),
      roundState: validateRound({
        phase: 'completed',
        itemIndex: current,
        clueIndex: runtime.currentClueIndex,
      }),
      eventType: 'one-clue-challenge-completed',
      eventPayload: { itemCount: ONE_CLUE_ITEM_COUNT },
      effects: [
        { type: 'emit-runtime-event', eventType: 'one-clue-completed' },
      ],
    };
  }
  const nextIndex = current + 1;
  const assignments = openAssignments(
    parseTeamActionAssignments(runtime.teamActionJson),
    teamsOf(runtime),
    context,
  );
  const now = context.now ?? fail('Server command time is missing');
  return {
    runtimeState: validateRuntime({
      ...runtime,
      currentItemIndex: nextIndex,
      currentClueIndex: 0,
      phase: 'collecting',
      submissionsJson: '{}',
      lockedAnswersJson: '{}',
      eliminatedTeamIdsJson: '[]',
      teamActionJson: serializeTeamActionAssignments(assignments),
      deadlineAt: new Date(
        now.getTime() + ONE_CLUE_STAGE_SECONDS * 1000,
      ).toISOString(),
    }),
    roundState: validateRound({
      phase: 'collecting',
      itemIndex: nextIndex,
      clueIndex: 0,
    }),
    eventType: 'one-clue-item-advanced',
    eventPayload: { itemIndex: nextIndex },
    effects: [],
  };
}

function publicState(
  state: GameplayModeState,
  actor?: InteractionActorProjection,
): GameplayModeState {
  const valid = validateRuntime(state);
  const item = itemsOf(valid)[Number(valid.currentItemIndex)];
  const teams = teamsOf(valid);
  const clueIndex = Number(valid.currentClueIndex);
  const submissions = submissionsOf(valid);
  const assignments = parseTeamActionAssignments(valid.teamActionJson);
  const revealed = valid.phase !== 'collecting';
  const latest = resultsOf(valid).at(-1);
  return {
    phase: valid.phase,
    currentItemIndex: valid.currentItemIndex,
    currentClueIndex: clueIndex,
    itemCount: ONE_CLUE_ITEM_COUNT,
    currentItemJson: JSON.stringify({
      id: item.id,
      prompt: item.prompt,
      media: item.media ?? null,
      clues: item.clues.slice(0, clueIndex + 1),
    }),
    currentClueValue: ONE_CLUE_VALUES[clueIndex],
    deadlineAt: valid.deadlineAt ?? null,
    teamIdsJson: JSON.stringify(teams),
    submissionStatusJson: JSON.stringify(
      Object.fromEntries(
        teams.map((teamId) => [teamId, Boolean(submissions[teamId])]),
      ),
    ),
    eliminatedTeamIdsJson: JSON.stringify(eliminatedOf(valid)),
    assignedParticipantIdsJson: JSON.stringify(assignedIds(assignments, teams)),
    ...(actor
      ? {
          actorTeamId: actor.teamId ?? null,
          isAssignedActor: teams.some(
            (teamId) =>
              assignmentFor(assignments, oneClueAnswerAction(teamId))
                ?.participantId === actor.participantId,
          ),
          ownAnswerLocked: actor.teamId
            ? Boolean(submissions[actor.teamId])
            : false,
          ownAssignmentSequence: actor.teamId
            ? assignmentFor(assignments, oneClueAnswerAction(actor.teamId))
                ?.sequence
            : undefined,
        }
      : {}),
    ...(revealed && latest
      ? { revealedResultJson: JSON.stringify(latest) }
      : {}),
    resultsJson: JSON.stringify(
      resultsOf(valid).map((result) =>
        revealed || result.itemIndex < Number(valid.currentItemIndex)
          ? result
          : { itemIndex: result.itemIndex },
      ),
    ),
  };
}

export const ONE_CLUE_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: ONE_CLUE_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  deadline: {
    source: 'runtime-state',
    commandType: 'expire-one-clue-stage',
    activePhases: ['collecting'],
    // Fair-start: the first stage's clock is armed only once a presentation
    // surface is ready (see `activatePresentation`), so a slow client cold-start
    // never eats into the configured stage window.
    requiresPresentationActivation: true,
  },
  // Re-anchor the first stage's deadline to activation time. One Clue launches in
  // the `collecting` phase, so activation re-stamps that clock from `now`; the
  // configured window is unchanged — only its origin moves from launch to
  // activation. Later stages already re-anchor when they open.
  activatePresentation: (state, now) =>
    String((state as { phase?: unknown }).phase) === 'collecting'
      ? {
          ...state,
          deadlineAt: new Date(
            now.getTime() + ONE_CLUE_STAGE_SECONDS * 1000,
          ).toISOString(),
        }
      : state,
  createInitialRuntimeState: (context) =>
    validateRuntime(context.initialState ?? {}),
  createInitialRoundState(context) {
    const runtime = validateRuntime(context.runtimeState ?? {});
    return validateRound({
      phase: runtime.phase,
      itemIndex: runtime.currentItemIndex,
      clueIndex: runtime.currentClueIndex,
    });
  },
  validateRuntimeState: validateRuntime,
  validateRoundState: validateRound,
  command(type) {
    if (type === 'submit-one-clue-answer') {
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: answerPayload,
      };
    }
    if (type === 'advance-one-clue-item') {
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    if (type === 'expire-one-clue-stage') {
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    return undefined;
  },
  handleCommand: handle,
  /**
   * Items up to and including the one on screen.
   *
   * `currentItemIndex` always names the item being played — advancing moves to
   * the next and presents it immediately — so a challenge abandoned at item 1
   * leaves items 2 and 3 unspent even though all three were drawn at launch.
   */
  presentedContentItemIds({ runtimeState }) {
    if (typeof runtimeState.itemsJson !== 'string') return [];
    let items: Array<{ contentItemId?: unknown }> = [];
    try {
      const parsed: unknown = JSON.parse(runtimeState.itemsJson);
      if (!Array.isArray(parsed)) return [];
      items = parsed as Array<{ contentItemId?: unknown }>;
    } catch {
      return [];
    }
    const index = Number(runtimeState.currentItemIndex);
    if (!Number.isInteger(index) || index < 0) return [];
    return items
      .slice(0, Math.min(index + 1, items.length))
      .map((item) => String(item?.contentItemId ?? ''))
      .filter(Boolean);
  },
  projectRuntimeState: (state) => publicState(state),
  projectRuntimeStateForActor: (state, actor) => publicState(state, actor),
  projectRoundState: validateRound,
};
