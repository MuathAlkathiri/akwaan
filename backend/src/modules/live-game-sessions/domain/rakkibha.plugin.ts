import {
  GameplayCommandPayload,
  GameplayCommandResult,
  GameplayModePlugin,
  GameplayModeState,
} from './gameplay-mode.plugin';
import { InteractionActorProjection } from './gameplay-interaction.plugin';
import { LiveSessionDomainError } from './live-session.errors';

export const RAKKIBHA_MODE_KEY = 'rakkibha';
export const RAKKIBHA_LOCK_MS = 5_000;
export const RAKKIBHA_PUZZLE_COUNT = 3;

export interface RakkibhaMedia {
  type: 'image' | 'audio' | 'video';
  url: string;
  altText?: string;
}
export interface RakkibhaReferenceView {
  content?: string;
  media: RakkibhaMedia;
}
export interface RakkibhaCandidate {
  localId: string;
  canonicalIdentity: string;
  content?: string;
  media: RakkibhaMedia;
}
export interface RakkibhaCandidateView {
  id: string;
  content?: string;
  candidates: RakkibhaCandidate[];
}
export interface RakkibhaPuzzle {
  contentItemId: string;
  instruction: string;
  reference: RakkibhaReferenceView;
  candidateViews: RakkibhaCandidateView[];
  correctCanonicalIdentity: string;
}
export interface RakkibhaParticipantAssignment {
  participantId: string;
  hasReference: boolean;
  candidateViewId?: string;
}
export interface RakkibhaTeamPlan {
  teamId: string;
  participantIds: string[];
  order: number[];
  assignments: RakkibhaParticipantAssignment[][];
}
export interface RakkibhaTeamProgress {
  teamId: string;
  solved: number;
  wrongAttempts: number;
  lastProgressAt: number;
  lockUntil: number;
}
export interface RakkibhaResult {
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
    fail('INVALID_RAKKIBHA_STATE', `${label} is missing`);
  try {
    return JSON.parse(value) as T;
  } catch {
    return fail('INVALID_RAKKIBHA_STATE', `${label} is invalid`);
  }
}
const puzzles = (state: GameplayModeState) =>
  parse<RakkibhaPuzzle[]>(state.puzzlesJson, 'puzzles');
const plans = (state: GameplayModeState) =>
  parse<RakkibhaTeamPlan[]>(state.plansJson, 'team plans');
const progressOf = (state: GameplayModeState) =>
  parse<RakkibhaTeamProgress[]>(state.progressJson, 'team progress');
function planFor(state: GameplayModeState, teamId: string): RakkibhaTeamPlan {
  return (
    plans(state).find((plan) => plan.teamId === teamId) ??
    fail('RAKKIBHA_TEAM_UNKNOWN', 'This team is not playing Rakkibha')
  );
}
function progressFor(
  state: GameplayModeState,
  teamId: string,
): RakkibhaTeamProgress {
  return (
    progressOf(state).find((entry) => entry.teamId === teamId) ??
    fail('RAKKIBHA_TEAM_UNKNOWN', 'This team is not playing Rakkibha')
  );
}

function validatePuzzle(puzzle: RakkibhaPuzzle): void {
  if (
    !puzzle.contentItemId ||
    !puzzle.instruction ||
    !puzzle.reference?.media?.url
  ) {
    fail(
      'INVALID_RAKKIBHA_STATE',
      'Every puzzle needs an instruction and reference media',
    );
  }
  if (puzzle.candidateViews.length < 2)
    fail(
      'INVALID_RAKKIBHA_STATE',
      'Every puzzle needs at least two candidate views',
    );
  if (
    new Set(puzzle.candidateViews.map((view) => view.id)).size !==
    puzzle.candidateViews.length
  ) {
    fail('INVALID_RAKKIBHA_STATE', 'Candidate view ids must be unique');
  }
  let trueCandidates = 0;
  for (const view of puzzle.candidateViews) {
    if (view.candidates.length < 2 || view.candidates.length > 3)
      fail(
        'INVALID_RAKKIBHA_STATE',
        'Each candidate view needs two or three candidates',
      );
    if (
      new Set(view.candidates.map((candidate) => candidate.localId)).size !==
      view.candidates.length
    ) {
      fail(
        'INVALID_RAKKIBHA_STATE',
        'Local candidate ids must be unique within a view',
      );
    }
    for (const candidate of view.candidates) {
      if (
        !candidate.localId ||
        !candidate.canonicalIdentity ||
        !candidate.media?.url
      )
        fail(
          'INVALID_RAKKIBHA_STATE',
          'Every candidate needs a local id, identity, and media',
        );
      if (candidate.canonicalIdentity === puzzle.correctCanonicalIdentity)
        trueCandidates += 1;
    }
  }
  if (!puzzle.correctCanonicalIdentity || trueCandidates !== 1)
    fail(
      'INVALID_RAKKIBHA_STATE',
      'Exactly one candidate must match the canonical identity',
    );
}

function validateAssignments(
  puzzleIndex: number,
  plan: RakkibhaTeamPlan,
  puzzle: RakkibhaPuzzle,
): void {
  const assignments = plan.assignments[puzzleIndex] ?? [];
  if (
    assignments.length !== plan.participantIds.length ||
    new Set(assignments.map((entry) => entry.participantId)).size !==
      assignments.length
  ) {
    fail(
      'INVALID_RAKKIBHA_STATE',
      'Every participant needs one assignment per puzzle',
    );
  }
  if (
    new Set(assignments.map((entry) => entry.participantId)).size !==
      new Set(plan.participantIds).size ||
    assignments.some(
      (entry) => !plan.participantIds.includes(entry.participantId),
    )
  ) {
    fail('INVALID_RAKKIBHA_STATE', 'Assignments must belong to the team plan');
  }
  if (assignments.filter((entry) => entry.hasReference).length !== 1)
    fail(
      'INVALID_RAKKIBHA_STATE',
      'Every puzzle needs exactly one reference holder',
    );
  const candidateAssignments = assignments.filter(
    (entry) => !entry.hasReference,
  );
  if (
    candidateAssignments.length !== plan.participantIds.length - 1 ||
    candidateAssignments.some((entry) => !entry.candidateViewId)
  ) {
    fail(
      'INVALID_RAKKIBHA_STATE',
      'Every non-reference participant needs a candidate view',
    );
  }
  if (assignments.some((entry) => entry.hasReference && entry.candidateViewId))
    fail(
      'INVALID_RAKKIBHA_STATE',
      'The reference holder cannot receive candidates',
    );
  const assignedViews = candidateAssignments.map((entry) =>
    puzzle.candidateViews.find((view) => view.id === entry.candidateViewId),
  );
  if (assignedViews.some((view) => !view))
    fail('INVALID_RAKKIBHA_STATE', 'Assigned candidate view is missing');
  const trueViews = assignedViews.filter((view) =>
    view!.candidates.some(
      (candidate) =>
        candidate.canonicalIdentity === puzzle.correctCanonicalIdentity,
    ),
  );
  if (trueViews.length !== 1)
    fail(
      'INVALID_RAKKIBHA_STATE',
      'Exactly one assigned candidate holder needs the true piece',
    );
  if (
    plan.participantIds.length === 3 &&
    assignedViews.some((view) =>
      view!.candidates.every(
        (candidate) =>
          candidate.canonicalIdentity === puzzle.correctCanonicalIdentity,
      ),
    )
  ) {
    fail(
      'INVALID_RAKKIBHA_STATE',
      'A candidate view cannot contain only the answer',
    );
  }
}
export function currentRakkibhaPuzzleIndex(
  state: GameplayModeState,
  teamId: string,
): number | undefined {
  const plan = planFor(state, teamId);
  const progress = progressFor(state, teamId);
  return progress.solved < plan.order.length
    ? plan.order[progress.solved]
    : undefined;
}

function validateRuntime(state: GameplayModeState): GameplayModeState {
  const items = puzzles(state);
  const teamPlans = plans(state);
  const teamProgress = progressOf(state);
  if (items.length !== RAKKIBHA_PUZZLE_COUNT)
    fail(
      'INVALID_RAKKIBHA_STATE',
      `Rakkibha plays exactly ${RAKKIBHA_PUZZLE_COUNT} items`,
    );
  if (teamPlans.length !== 2 || teamProgress.length !== 2)
    fail('INVALID_RAKKIBHA_STATE', 'Rakkibha is played by exactly two teams');
  items.forEach(validatePuzzle);
  for (const plan of teamPlans) {
    if (
      plan.order.length !== items.length ||
      new Set(plan.order).size !== items.length ||
      plan.assignments.length !== items.length
    ) {
      fail(
        'INVALID_RAKKIBHA_STATE',
        'Every team needs one persisted assignment per puzzle',
      );
    }
    if (
      plan.participantIds.length < 2 ||
      plan.participantIds.length > 3 ||
      new Set(plan.participantIds).size !== plan.participantIds.length
    )
      fail(
        'RAKKIBHA_TEAM_SIZE_UNSUPPORTED',
        'Each team needs two or three connected players',
      );
    plan.order.forEach((puzzleIndex, position) =>
      validateAssignments(position, plan, items[puzzleIndex]),
    );
  }
  if (typeof state.deadlineAt !== 'string' || !state.deadlineAt)
    fail('INVALID_RAKKIBHA_STATE', 'Rakkibha needs an authoritative deadline');
  if (!['active', 'completed'].includes(String(state.phase)))
    fail('INVALID_RAKKIBHA_STATE', 'Unsupported Rakkibha phase');
  return {
    ...state,
    puzzlesJson: JSON.stringify(items),
    plansJson: JSON.stringify(teamPlans),
    progressJson: JSON.stringify(teamProgress),
  };
}
function validateRound(state: GameplayModeState): GameplayModeState {
  if (!['active', 'completed'].includes(String(state.phase)))
    fail('INVALID_RAKKIBHA_STATE', 'Unsupported Rakkibha phase');
  return state;
}
function submissionPayload(
  payload: GameplayCommandPayload,
): GameplayCommandPayload {
  const allowed = ['contentItemId', 'localCandidateId'];
  if (
    Object.keys(payload).some((key) => !allowed.includes(key)) ||
    typeof payload.contentItemId !== 'string' ||
    !payload.contentItemId ||
    typeof payload.localCandidateId !== 'string' ||
    !payload.localCandidateId
  ) {
    fail(
      'INVALID_RAKKIBHA_SUBMISSION',
      'Send the current puzzle and one of your local candidates',
    );
  }
  return {
    contentItemId: payload.contentItemId,
    localCandidateId: payload.localCandidateId,
  };
}
function noPayload(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (Object.keys(payload).length)
    fail('INVALID_RAKKIBHA_COMMAND', 'This command does not accept a payload');
  return {};
}

export function resolveRakkibhaByDeadline(
  state: GameplayModeState,
  startedAtMs: number,
): RakkibhaResult {
  const [first, second] = progressOf(state);
  const elapsed = (entry: RakkibhaTeamProgress) =>
    entry.lastProgressAt
      ? entry.lastProgressAt - startedAtMs
      : Number.MAX_SAFE_INTEGER;
  const base = {
    solved: { [first.teamId]: first.solved, [second.teamId]: second.solved },
    wrongAttempts: {
      [first.teamId]: first.wrongAttempts,
      [second.teamId]: second.wrongAttempts,
    },
    elapsedMsAtLastProgress: {
      [first.teamId]: elapsed(first),
      [second.teamId]: elapsed(second),
    },
  };
  if (first.solved !== second.solved)
    return {
      ...base,
      winnerTeamId: first.solved > second.solved ? first.teamId : second.teamId,
      tie: false,
      reason: 'timeout_progress',
    };
  if (elapsed(first) !== elapsed(second))
    return {
      ...base,
      winnerTeamId:
        elapsed(first) < elapsed(second) ? first.teamId : second.teamId,
      tie: false,
      reason: 'timeout_time',
    };
  return { ...base, winnerTeamId: null, tie: true, reason: 'tie' };
}
function completed(
  state: GameplayModeState,
  result: RakkibhaResult,
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
    context.now ?? fail('INVALID_RAKKIBHA_STATE', 'Server time is missing');
  if (runtime.phase === 'completed')
    fail('MODE_COMMAND_UNAVAILABLE', 'This challenge is already finished');
  const participantId =
    context.submitterParticipantId ??
    fail('RAKKIBHA_SUBMITTER_UNKNOWN', 'The submitting player is unknown');
  const plan =
    plans(runtime).find((candidate) =>
      candidate.participantIds.includes(participantId),
    ) ?? fail('RAKKIBHA_TEAM_UNKNOWN', 'You are not playing Rakkibha');
  const progress = progressFor(runtime, plan.teamId);
  if (progress.solved >= plan.order.length)
    fail('MODE_COMMAND_UNAVAILABLE', 'Your team already finished');
  if (new Date(String(runtime.deadlineAt)).getTime() <= now.getTime())
    fail('RAKKIBHA_DEADLINE_PASSED', 'The race is over');
  if (progress.lockUntil > now.getTime())
    fail('RAKKIBHA_TEAM_LOCKED', 'Your team is locked for a few seconds');
  const puzzle = puzzles(runtime)[plan.order[progress.solved]];
  if (puzzle.contentItemId !== command.payload.contentItemId)
    fail('RAKKIBHA_STALE_PUZZLE', 'Your team already moved to another puzzle');
  const assignment = plan.assignments[progress.solved].find(
    (candidate) => candidate.participantId === participantId,
  );
  if (!assignment?.candidateViewId)
    fail(
      'RAKKIBHA_REFERENCE_CANNOT_SUBMIT',
      'The reference holder has no candidates to submit',
    );
  const candidateView =
    puzzle.candidateViews.find(
      (view) => view.id === assignment.candidateViewId,
    ) ?? fail('INVALID_RAKKIBHA_STATE', 'Assigned candidate view is missing');
  const candidate = candidateView.candidates.find(
    (option) => option.localId === command.payload.localCandidateId,
  );
  if (!candidate)
    fail(
      'RAKKIBHA_CANDIDATE_NOT_ASSIGNED',
      'That candidate is not in your private view',
    );
  const correct =
    candidate.canonicalIdentity === puzzle.correctCanonicalIdentity;
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
            lockUntil: now.getTime() + RAKKIBHA_LOCK_MS,
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
        ? 'rakkibha-race-won'
        : 'rakkibha-puzzle-solved'
      : 'rakkibha-candidate-rejected',
    eventPayload: { teamId: plan.teamId, solved: teamSolved, correct },
    effects: [
      {
        type: 'emit-runtime-event',
        eventType: finished ? 'rakkibha-completed' : 'rakkibha-progressed',
      },
    ],
  };
}
function expire(
  context: Parameters<GameplayModePlugin['handleCommand']>[0],
  command: Parameters<GameplayModePlugin['handleCommand']>[1],
): GameplayCommandResult {
  const runtime = validateRuntime(command.runtimeState);
  const now =
    context.now ?? fail('INVALID_RAKKIBHA_STATE', 'Server time is missing');
  if (runtime.phase === 'completed')
    return {
      runtimeState: runtime,
      roundState: validateRound({ ...command.roundState, phase: 'completed' }),
      eventType: 'rakkibha-race-already-resolved',
      eventPayload: {},
      effects: [],
    };
  if (new Date(String(runtime.deadlineAt)).getTime() > now.getTime())
    fail('RAKKIBHA_DEADLINE_NOT_REACHED', 'The race is still running');
  const result = resolveRakkibhaByDeadline(
    runtime,
    Number(runtime.startedAtMs),
  );
  return {
    runtimeState: completed(runtime, result),
    roundState: validateRound({ ...command.roundState, phase: 'completed' }),
    eventType: 'rakkibha-race-timed-out',
    eventPayload: { reason: result.reason },
    effects: [{ type: 'emit-runtime-event', eventType: 'rakkibha-completed' }],
  };
}

function publicRuntime(state: GameplayModeState): GameplayModeState {
  const valid = validateRuntime(state);
  return {
    variant: 'visual-assembly',
    phase: valid.phase ?? 'active',
    puzzleCount: RAKKIBHA_PUZZLE_COUNT,
    deadlineAt: valid.deadlineAt,
    progressJson: JSON.stringify(
      progressOf(valid).map((entry) => ({
        teamId: entry.teamId,
        solved: entry.solved,
        wrongAttempts: entry.wrongAttempts,
        locked: entry.lockUntil > 0 ? entry.lockUntil : 0,
      })),
    ),
    ...(valid.resultJson ? { resultJson: valid.resultJson } : {}),
  };
}
function actorRuntime(
  state: GameplayModeState,
  actor: InteractionActorProjection,
): GameplayModeState {
  const shared = publicRuntime(state);
  const valid = validateRuntime(state);
  if (!actor.participantId) return shared;
  const plan = plans(valid).find((candidate) =>
    candidate.participantIds.includes(actor.participantId as string),
  );
  if (!plan) return shared;
  const progress = progressFor(valid, plan.teamId);
  const position = progress.solved;
  if (position >= plan.order.length)
    return { ...shared, myTeamId: plan.teamId, myTeamFinished: true };
  const puzzle = puzzles(valid)[plan.order[position]];
  const assignment = plan.assignments[position].find(
    (entry) => entry.participantId === actor.participantId,
  );
  const candidateView = assignment?.candidateViewId
    ? puzzle.candidateViews.find(
        (view) => view.id === assignment.candidateViewId,
      )
    : undefined;
  return {
    ...shared,
    myTeamId: plan.teamId,
    myTeamFinished: false,
    contentItemId: puzzle.contentItemId,
    instruction: puzzle.instruction,
    puzzlePosition: position + 1,
    mySolved: progress.solved,
    myLockUntil: progress.lockUntil,
    hasReference: assignment?.hasReference === true,
    ...(assignment?.hasReference
      ? { myReferenceJson: JSON.stringify(puzzle.reference) }
      : {}),
    ...(candidateView
      ? {
          myCandidatesJson: JSON.stringify({
            id: candidateView.id,
            content: candidateView.content,
            candidates: candidateView.candidates.map(
              ({ localId, content, media }) => ({ localId, content, media }),
            ),
          }),
        }
      : {}),
  };
}

export const RAKKIBHA_PLUGIN: GameplayModePlugin = {
  key: RAKKIBHA_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
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
    if (type === 'submit-candidate')
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: submissionPayload,
      };
    if (type === 'expire-race')
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    return undefined;
  },
  handleCommand(context, command) {
    return command.type === 'expire-race'
      ? expire(context, command)
      : submit(context, command);
  },
  presentedContentItemIds({ runtimeState }) {
    try {
      const items = puzzles(runtimeState);
      const reached = new Set<string>();
      for (const plan of plans(runtimeState)) {
        const progress = progressOf(runtimeState).find(
          (entry) => entry.teamId === plan.teamId,
        );
        const seen = Math.min((progress?.solved ?? 0) + 1, plan.order.length);
        for (const position of plan.order.slice(0, seen))
          if (items[position]?.contentItemId)
            reached.add(items[position].contentItemId);
      }
      return [...reached];
    } catch {
      return [];
    }
  },
  projectRuntimeState: publicRuntime,
  projectRuntimeStateForActor: actorRuntime,
  projectRoundState: (state) => ({ phase: validateRound(state).phase }),
};
export function rakkibhaResult(
  state: GameplayModeState,
): RakkibhaResult | undefined {
  const valid = validateRuntime(state);
  return valid.resultJson
    ? (JSON.parse(String(valid.resultJson)) as RakkibhaResult)
    : undefined;
}
