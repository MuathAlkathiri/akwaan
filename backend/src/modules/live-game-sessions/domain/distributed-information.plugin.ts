import {
  GameplayCommandPayload,
  GameplayCommandResult,
  GameplayModePlugin,
  GameplayModeState,
} from './gameplay-mode.plugin';
import { InteractionActorProjection } from './gameplay-interaction.plugin';
import { LiveSessionDomainError } from './live-session.errors';

export const DISTRIBUTED_INFORMATION_MODE_KEY = 'distributed-information';
export const DISTRIBUTED_INFORMATION_LOCK_MS = 5_000;
export const DISTRIBUTED_INFORMATION_PUZZLE_COUNT = 3;

/** How a team's answer is checked. Mirrors the ContentItem answer contract. */
export type DistributedAnswerMode = 'closest' | 'match' | 'multiple_choice';

export interface DistributedPuzzle {
  contentItemId: string;
  publicPrompt: string;
  /** Private text, keyed by segment id. Never projected wholesale. */
  segments: Record<string, string>;
  answer: {
    mode: DistributedAnswerMode;
    correctValue?: number;
    acceptedAnswers?: string[];
    correctOptionId?: string;
    options?: Array<{ id: string; label: string }>;
    tolerance?: number;
  };
}

/** One participant's private holding for one puzzle. */
export interface DistributedAssignment {
  participantId: string;
  segmentIds: string[];
}

export interface DistributedTeamPlan {
  teamId: string;
  participantIds: string[];
  /** This team's own randomized puzzle order, as indexes into the puzzle list. */
  order: number[];
  /** Who answers the puzzle at each position of this team's order. */
  answererIds: string[];
  /** Segment holdings per position of this team's order. */
  assignments: DistributedAssignment[][];
}

export interface DistributedTeamProgress {
  teamId: string;
  solved: number;
  wrongAttempts: number;
  /** Epoch ms when this team last solved a puzzle; 0 before the first solve. */
  lastProgressAt: number;
  /** Epoch ms until which this team's input is locked. */
  lockUntil: number;
}

export interface DistributedResult {
  winnerTeamId: string | null;
  tie: boolean;
  reason: 'first_finished' | 'timeout_progress' | 'timeout_time' | 'tie';
  solved: Record<string, number>;
  wrongAttempts: Record<string, number>;
  elapsedMsAtLastProgress: Record<string, number>;
}

function fail(code: string, message: string): never {
  throw new LiveSessionDomainError(code, message);
}

function parse<T>(value: unknown, label: string): T {
  if (typeof value !== 'string')
    fail('INVALID_DISTRIBUTED_STATE', `${label} is missing`);
  try {
    return JSON.parse(value) as T;
  } catch {
    return fail('INVALID_DISTRIBUTED_STATE', `${label} is invalid`);
  }
}

function puzzles(state: GameplayModeState): DistributedPuzzle[] {
  return parse<DistributedPuzzle[]>(state.puzzlesJson, 'puzzles');
}

function plans(state: GameplayModeState): DistributedTeamPlan[] {
  return parse<DistributedTeamPlan[]>(state.plansJson, 'team plans');
}

function progressOf(state: GameplayModeState): DistributedTeamProgress[] {
  return parse<DistributedTeamProgress[]>(state.progressJson, 'team progress');
}

function planFor(
  state: GameplayModeState,
  teamId: string,
): DistributedTeamPlan {
  return (
    plans(state).find((plan) => plan.teamId === teamId) ??
    fail('DISTRIBUTED_TEAM_UNKNOWN', 'This team is not playing this challenge')
  );
}

function progressFor(
  state: GameplayModeState,
  teamId: string,
): DistributedTeamProgress {
  return (
    progressOf(state).find((entry) => entry.teamId === teamId) ??
    fail('DISTRIBUTED_TEAM_UNKNOWN', 'This team is not playing this challenge')
  );
}

/**
 * The puzzle a team is on right now, or undefined once it has solved all three.
 */
export function currentPuzzleIndex(
  state: GameplayModeState,
  teamId: string,
): number | undefined {
  const plan = planFor(state, teamId);
  const progress = progressFor(state, teamId);
  if (progress.solved >= plan.order.length) return undefined;
  return plan.order[progress.solved];
}

function validateRuntime(state: GameplayModeState): GameplayModeState {
  const items = puzzles(state);
  const teamPlans = plans(state);
  const teamProgress = progressOf(state);
  if (items.length !== DISTRIBUTED_INFORMATION_PUZZLE_COUNT) {
    fail(
      'INVALID_DISTRIBUTED_STATE',
      `A distributed-information challenge plays exactly ${DISTRIBUTED_INFORMATION_PUZZLE_COUNT} items`,
    );
  }
  if (teamPlans.length !== 2 || teamProgress.length !== 2) {
    fail(
      'INVALID_DISTRIBUTED_STATE',
      'The race is played by exactly two teams',
    );
  }
  for (const plan of teamPlans) {
    if (
      plan.order.length !== items.length ||
      new Set(plan.order).size !== items.length ||
      plan.answererIds.length !== items.length ||
      plan.assignments.length !== items.length
    ) {
      fail(
        'INVALID_DISTRIBUTED_STATE',
        'Every team needs one order, one answerer, and one distribution per puzzle',
      );
    }
    if (plan.participantIds.length < 2 || plan.participantIds.length > 3) {
      fail(
        'DISTRIBUTED_TEAM_SIZE_UNSUPPORTED',
        'Each team needs two or three connected players',
      );
    }
  }
  if (typeof state.deadlineAt !== 'string' || !state.deadlineAt) {
    fail(
      'INVALID_DISTRIBUTED_STATE',
      'The race needs an authoritative deadline',
    );
  }
  if (!['active', 'completed'].includes(String(state.phase))) {
    fail(
      'INVALID_DISTRIBUTED_STATE',
      'Unsupported distributed-information phase',
    );
  }
  return {
    ...state,
    puzzlesJson: JSON.stringify(items),
    plansJson: JSON.stringify(teamPlans),
    progressJson: JSON.stringify(teamProgress),
  };
}

function validateRound(state: GameplayModeState): GameplayModeState {
  if (!['active', 'completed'].includes(String(state.phase))) {
    fail(
      'INVALID_DISTRIBUTED_STATE',
      'Unsupported distributed-information phase',
    );
  }
  return state;
}

function submissionPayload(
  payload: GameplayCommandPayload,
): GameplayCommandPayload {
  const allowed = ['answer', 'contentItemId'];
  if (
    Object.keys(payload).some((key) => !allowed.includes(key)) ||
    typeof payload.contentItemId !== 'string' ||
    !payload.contentItemId ||
    (typeof payload.answer !== 'string' && typeof payload.answer !== 'number')
  ) {
    fail(
      'INVALID_DISTRIBUTED_SUBMISSION',
      'Send the puzzle you are answering and your answer',
    );
  }
  return { answer: payload.answer, contentItemId: payload.contentItemId };
}

function noPayload(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (Object.keys(payload).length) {
    fail(
      'INVALID_DISTRIBUTED_COMMAND',
      'This command does not accept a payload',
    );
  }
  return {};
}

/** Normalization matches the shared answer rules: trim, fold case, collapse gaps. */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isCorrectAnswer(
  puzzle: DistributedPuzzle,
  answer: string | number,
): boolean {
  const { answer: contract } = puzzle;
  if (contract.mode === 'closest') {
    const numeric = typeof answer === 'number' ? answer : Number(answer);
    if (!Number.isFinite(numeric) || contract.correctValue === undefined) {
      return false;
    }
    return (
      Math.abs(numeric - contract.correctValue) <= (contract.tolerance ?? 0)
    );
  }
  if (contract.mode === 'multiple_choice') {
    return String(answer) === contract.correctOptionId;
  }
  return (contract.acceptedAnswers ?? []).some(
    (accepted) => normalize(accepted) === normalize(String(answer)),
  );
}

/**
 * The timeout ladder, in the locked order: more puzzles solved wins; on equal
 * counts the team that reached that count sooner wins; otherwise it is a tie.
 */
export function resolveByDeadline(
  state: GameplayModeState,
  startedAtMs: number,
): DistributedResult {
  const [first, second] = progressOf(state);
  const elapsed = (entry: DistributedTeamProgress) =>
    entry.lastProgressAt
      ? entry.lastProgressAt - startedAtMs
      : Number.MAX_SAFE_INTEGER;
  const base = {
    solved: {
      [first.teamId]: first.solved,
      [second.teamId]: second.solved,
    },
    wrongAttempts: {
      [first.teamId]: first.wrongAttempts,
      [second.teamId]: second.wrongAttempts,
    },
    elapsedMsAtLastProgress: {
      [first.teamId]: elapsed(first),
      [second.teamId]: elapsed(second),
    },
  };
  if (first.solved !== second.solved) {
    return {
      ...base,
      winnerTeamId: first.solved > second.solved ? first.teamId : second.teamId,
      tie: false,
      reason: 'timeout_progress',
    };
  }
  if (elapsed(first) !== elapsed(second)) {
    return {
      ...base,
      winnerTeamId:
        elapsed(first) < elapsed(second) ? first.teamId : second.teamId,
      tie: false,
      reason: 'timeout_time',
    };
  }
  return { ...base, winnerTeamId: null, tie: true, reason: 'tie' };
}

function completed(
  state: GameplayModeState,
  result: DistributedResult,
): GameplayModeState {
  return validateRuntime({
    ...state,
    phase: 'completed',
    resultJson: JSON.stringify(result),
  });
}

function submit(
  context: Parameters<GameplayModePlugin['handleCommand']>[0],
  command: Parameters<GameplayModePlugin['handleCommand']>[1],
): GameplayCommandResult {
  const runtime = validateRuntime(command.runtimeState);
  const now =
    context.now ?? fail('INVALID_DISTRIBUTED_STATE', 'Server time is missing');
  if (runtime.phase === 'completed') {
    fail('MODE_COMMAND_UNAVAILABLE', 'This challenge is already finished');
  }
  const participantId =
    context.submitterParticipantId ??
    fail('DISTRIBUTED_SUBMITTER_UNKNOWN', 'The submitting player is unknown');
  const teamPlans = plans(runtime);
  const plan =
    teamPlans.find((candidate) =>
      candidate.participantIds.includes(participantId),
    ) ?? fail('DISTRIBUTED_TEAM_UNKNOWN', 'You are not playing this challenge');
  const progress = progressFor(runtime, plan.teamId);

  if (progress.solved >= plan.order.length) {
    fail('MODE_COMMAND_UNAVAILABLE', 'Your team already finished');
  }
  if (new Date(String(runtime.deadlineAt)).getTime() <= now.getTime()) {
    fail('DISTRIBUTED_DEADLINE_PASSED', 'The race is over');
  }
  if (progress.lockUntil > now.getTime()) {
    fail('DISTRIBUTED_TEAM_LOCKED', 'Your team is locked for a few seconds');
  }
  if (plan.answererIds[progress.solved] !== participantId) {
    fail(
      'DISTRIBUTED_NOT_ANSWERER',
      'Another teammate is answering this puzzle',
    );
  }

  const items = puzzles(runtime);
  const puzzle = items[plan.order[progress.solved]];
  // A submission aimed at a puzzle the team has already left is stale, not wrong.
  if (puzzle.contentItemId !== command.payload.contentItemId) {
    fail(
      'DISTRIBUTED_STALE_PUZZLE',
      'Your team already moved to another puzzle',
    );
  }

  const correct = isCorrectAnswer(
    puzzle,
    command.payload.answer as string | number,
  );
  const nextProgress = progressOf(runtime).map((entry) =>
    entry.teamId !== plan.teamId
      ? entry
      : correct
        ? {
            ...entry,
            solved: entry.solved + 1,
            lastProgressAt: now.getTime(),
            lockUntil: 0,
          }
        : {
            ...entry,
            wrongAttempts: entry.wrongAttempts + 1,
            // The race clock keeps running through the lock.
            lockUntil: now.getTime() + DISTRIBUTED_INFORMATION_LOCK_MS,
          },
  );
  const advanced = { ...runtime, progressJson: JSON.stringify(nextProgress) };
  const teamSolved =
    nextProgress.find((entry) => entry.teamId === plan.teamId)?.solved ?? 0;
  const finished = correct && teamSolved >= plan.order.length;

  const runtimeState = finished
    ? completed(advanced, {
        winnerTeamId: plan.teamId,
        tie: false,
        reason: 'first_finished',
        solved: Object.fromEntries(
          nextProgress.map((entry) => [entry.teamId, entry.solved]),
        ),
        wrongAttempts: Object.fromEntries(
          nextProgress.map((entry) => [entry.teamId, entry.wrongAttempts]),
        ),
        elapsedMsAtLastProgress: Object.fromEntries(
          nextProgress.map((entry) => [
            entry.teamId,
            entry.lastProgressAt
              ? entry.lastProgressAt - Number(runtime.startedAtMs)
              : Number.MAX_SAFE_INTEGER,
          ]),
        ),
      })
    : validateRuntime(advanced);

  return {
    runtimeState,
    roundState: validateRound({
      ...command.roundState,
      phase: finished ? 'completed' : 'active',
    }),
    eventType: correct
      ? finished
        ? 'distributed-race-won'
        : 'distributed-puzzle-solved'
      : 'distributed-answer-rejected',
    eventPayload: {
      teamId: plan.teamId,
      solved: teamSolved,
      correct,
    },
    effects: [
      {
        type: 'emit-runtime-event',
        eventType: finished
          ? 'distributed-completed'
          : 'distributed-progressed',
      },
    ],
  };
}

/** Deadline resolution. Idempotent: a finished race stays as it resolved. */
function expire(
  context: Parameters<GameplayModePlugin['handleCommand']>[0],
  command: Parameters<GameplayModePlugin['handleCommand']>[1],
): GameplayCommandResult {
  const runtime = validateRuntime(command.runtimeState);
  const now =
    context.now ?? fail('INVALID_DISTRIBUTED_STATE', 'Server time is missing');
  if (runtime.phase === 'completed') {
    return {
      runtimeState: runtime,
      roundState: validateRound({ ...command.roundState, phase: 'completed' }),
      eventType: 'distributed-race-already-resolved',
      eventPayload: {},
      effects: [],
    };
  }
  if (new Date(String(runtime.deadlineAt)).getTime() > now.getTime()) {
    fail('DISTRIBUTED_DEADLINE_NOT_REACHED', 'The race is still running');
  }
  const result = resolveByDeadline(runtime, Number(runtime.startedAtMs));
  return {
    runtimeState: completed(runtime, result),
    roundState: validateRound({ ...command.roundState, phase: 'completed' }),
    eventType: 'distributed-race-timed-out',
    eventPayload: { reason: result.reason },
    effects: [
      { type: 'emit-runtime-event', eventType: 'distributed-completed' },
    ],
  };
}

/** Everyone may see the race, but nobody's private segments. */
function publicRuntime(state: GameplayModeState): GameplayModeState {
  const valid = validateRuntime(state);
  const teamProgress = progressOf(valid);
  return {
    variant: 'three-segment-race',
    phase: valid.phase ?? 'active',
    puzzleCount: DISTRIBUTED_INFORMATION_PUZZLE_COUNT,
    deadlineAt: valid.deadlineAt,
    progressJson: JSON.stringify(
      teamProgress.map((entry) => ({
        teamId: entry.teamId,
        solved: entry.solved,
        wrongAttempts: entry.wrongAttempts,
        locked: entry.lockUntil > 0 ? entry.lockUntil : 0,
      })),
    ),
    ...(valid.resultJson ? { resultJson: valid.resultJson } : {}),
  };
}

/**
 * One participant's own view: the public prompt, the segments they hold, whether
 * they are the answerer, and their team's progress. A teammate's segments, the
 * opponent's plan, and every answer stay out of it.
 */
function actorRuntime(
  state: GameplayModeState,
  actor: InteractionActorProjection,
): GameplayModeState {
  const shared = publicRuntime(state);
  const valid = validateRuntime(state);
  if (!actor.participantId) return shared;
  const teamPlans = plans(valid);
  const plan = teamPlans.find((candidate) =>
    candidate.participantIds.includes(actor.participantId as string),
  );
  if (!plan) return shared;
  const progress = progressFor(valid, plan.teamId);
  const position = progress.solved;
  if (position >= plan.order.length) {
    return { ...shared, myTeamId: plan.teamId, myTeamFinished: true };
  }
  const puzzle = puzzles(valid)[plan.order[position]];
  const mine =
    plan.assignments[position].find(
      (assignment) => assignment.participantId === actor.participantId,
    )?.segmentIds ?? [];
  return {
    ...shared,
    myTeamId: plan.teamId,
    myTeamFinished: false,
    contentItemId: puzzle.contentItemId,
    publicPrompt: puzzle.publicPrompt,
    puzzlePosition: position + 1,
    mySolved: progress.solved,
    myLockUntil: progress.lockUntil,
    isAnswerer: plan.answererIds[position] === actor.participantId,
    answerMode: puzzle.answer.mode,
    // Options are part of the public prompt for a multiple choice; the correct
    // option id never leaves the server.
    optionsJson: puzzle.answer.options
      ? JSON.stringify(puzzle.answer.options)
      : null,
    mySegmentsJson: JSON.stringify(
      mine.map((segmentId) => ({
        id: segmentId,
        content: puzzle.segments[segmentId] ?? '',
      })),
    ),
  };
}

function publicRound(state: GameplayModeState): GameplayModeState {
  const valid = validateRound(state);
  return { phase: valid.phase };
}

export const DISTRIBUTED_INFORMATION_PLUGIN: GameplayModePlugin = {
  key: DISTRIBUTED_INFORMATION_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  // "ركّبها" keeps `deadlineAt` populated after the race ends — its own state
  // validation requires the field — so the live phase has to be named or a
  // finished race would re-arm itself.
  deadline: {
    source: 'runtime-state',
    commandType: 'expire-race',
    activePhases: ['active'],
  },
  createInitialRuntimeState: (context) =>
    validateRuntime(context.initialState ?? {}),
  createInitialRoundState: () => validateRound({ phase: 'active' }),
  validateRuntimeState: validateRuntime,
  validateRoundState: validateRound,
  command(type) {
    if (type === 'submit-answer') {
      return {
        type,
        // The plugin itself enforces answerer identity; the session only has to
        // know the submitter is a connected player of a playing team.
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: submissionPayload,
      };
    }
    if (type === 'expire-race') {
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    return undefined;
  },
  handleCommand(context, command) {
    if (command.type === 'expire-race') return expire(context, command);
    return submit(context, command);
  },
  projectRuntimeState: publicRuntime,
  projectRuntimeStateForActor: actorRuntime,
  projectRoundState: publicRound,
};

export function distributedResult(
  state: GameplayModeState,
): DistributedResult | undefined {
  const valid = validateRuntime(state);
  return valid.resultJson
    ? (JSON.parse(String(valid.resultJson)) as DistributedResult)
    : undefined;
}
