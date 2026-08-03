import {
  GameplayCommandPayload,
  GameplayCommandResult,
  GameplayModePlugin,
  GameplayModeState,
} from './gameplay-mode.plugin';
import { LiveSessionDomainError } from './live-session.errors';

export const TOP10_MODE_KEY = 'top-10';
export const TOP10_POISON_DECK_VARIANT = 'poison-deck';
export const TOP10_TURN_SECONDS = 6;

export interface Top10RuntimeCandidate {
  id: string;
  label: string;
  shortLabel?: string;
  media?: Record<string, unknown>;
}

export interface Top10RankedAnswer {
  candidateId: string;
  rank: number;
}

export interface Top10Assignment {
  turn: number;
  candidateId: string;
  actingTeamId: string;
  recipientTeamId: string;
  action: 'keep' | 'poison';
  timedOut: boolean;
  resolutionReason: 'submitted' | 'timeout';
  assignedAt: string;
}

export interface Top10TeamMetrics {
  successfulPoison: number;
  giftedValidCard: number;
  selfKeptDecoy: number;
  selfKeptValid: number;
}

export interface Top10Result {
  internalScores: Record<string, number>;
  validCards: Record<string, number>;
  decoys: Record<string, number>;
  metrics: Record<string, Top10TeamMetrics>;
  winnerTeamId?: string;
}

function fail(message: string): never {
  throw new LiveSessionDomainError('INVALID_TOP10_STATE', message);
}

function parseJson<T>(value: unknown, label: string): T {
  if (typeof value !== 'string') fail(`${label} is missing`);
  try {
    return JSON.parse(value) as T;
  } catch {
    return fail(`${label} is invalid`);
  }
}

function emptyMetrics(): Top10TeamMetrics {
  return {
    successfulPoison: 0,
    giftedValidCard: 0,
    selfKeptDecoy: 0,
    selfKeptValid: 0,
  };
}

function candidateMap(
  state: GameplayModeState,
): Map<string, Top10RuntimeCandidate> {
  return new Map(
    parseJson<Top10RuntimeCandidate[]>(state.candidatesJson, 'candidates').map(
      (candidate) => [candidate.id, candidate],
    ),
  );
}

function validateRuntime(state: GameplayModeState): GameplayModeState {
  const candidates = parseJson<Top10RuntimeCandidate[]>(
    state.candidatesJson,
    'candidates',
  );
  const deck = parseJson<string[]>(state.deckJson, 'deck');
  const ranked = parseJson<Top10RankedAnswer[]>(
    state.rankedAnswerJson,
    'ranked answer',
  );
  const decoys = parseJson<string[]>(state.decoyCandidateIdsJson, 'decoys');
  const teams = parseJson<string[]>(state.teamIdsJson, 'teams');
  const assignments = parseJson<Top10Assignment[]>(
    state.assignmentsJson ?? '[]',
    'assignments',
  );
  if (
    state.variant !== TOP10_POISON_DECK_VARIANT ||
    candidates.length !== 14 ||
    deck.length !== 14 ||
    ranked.length !== 10 ||
    decoys.length !== 4 ||
    teams.length !== 2 ||
    new Set(teams).size !== 2
  ) {
    return fail(
      'Poison deck requires 14 cards, 10 ranked answers, 4 decoys, and 2 teams',
    );
  }
  const ids = candidates.map((candidate) => candidate.id);
  if (
    ids.some((id) => !id) ||
    new Set(ids).size !== 14 ||
    new Set(deck).size !== 14 ||
    deck.some((id) => !ids.includes(id)) ||
    assignments.length > 14
  ) {
    return fail('Poison deck candidates or assignments are inconsistent');
  }
  return {
    ...state,
    candidatesJson: JSON.stringify(candidates),
    deckJson: JSON.stringify(deck),
    rankedAnswerJson: JSON.stringify(ranked),
    decoyCandidateIdsJson: JSON.stringify(decoys),
    teamIdsJson: JSON.stringify(teams),
    assignmentsJson: JSON.stringify(assignments),
  };
}

function validateRound(state: GameplayModeState): GameplayModeState {
  if (
    !['assigning', 'revealing', 'completed'].includes(String(state.phase)) ||
    typeof state.turnIndex !== 'number' ||
    typeof state.revealIndex !== 'number'
  ) {
    return fail('Poison deck round progress is incomplete');
  }
  if (state.phase === 'assigning' && typeof state.deadlineAt !== 'string') {
    return fail('The active poison-deck turn requires a deadline');
  }
  return state;
}

function assignmentPayload(
  payload: GameplayCommandPayload,
): GameplayCommandPayload {
  if (
    Object.keys(payload).some((key) => !['action', 'timedOut'].includes(key)) ||
    !['keep', 'poison'].includes(String(payload.action)) ||
    (payload.timedOut !== undefined && typeof payload.timedOut !== 'boolean')
  ) {
    throw new LiveSessionDomainError(
      'INVALID_TOP10_ASSIGNMENT',
      'Choose keep or poison',
    );
  }
  return {
    action: String(payload.action),
    timedOut: payload.timedOut === true,
  };
}

function noPayload(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (Object.keys(payload).length) {
    throw new LiveSessionDomainError(
      'INVALID_TOP10_COMMAND',
      'This command does not accept a payload',
    );
  }
  return {};
}

function resultFor(state: GameplayModeState): Top10Result {
  const teams = parseJson<string[]>(state.teamIdsJson, 'teams');
  const rankedIds = new Set(
    parseJson<Top10RankedAnswer[]>(state.rankedAnswerJson, 'ranked answer').map(
      (answer) => answer.candidateId,
    ),
  );
  const assignments = parseJson<Top10Assignment[]>(
    state.assignmentsJson,
    'assignments',
  );
  const internalScores: Record<string, number> = Object.fromEntries(
    teams.map((teamId) => [teamId, 0]),
  );
  const validCards: Record<string, number> = Object.fromEntries(
    teams.map((teamId) => [teamId, 0]),
  );
  const decoys: Record<string, number> = Object.fromEntries(
    teams.map((teamId) => [teamId, 0]),
  );
  const metrics: Record<string, Top10TeamMetrics> = Object.fromEntries(
    teams.map((teamId) => [teamId, emptyMetrics()]),
  );
  for (const assignment of assignments) {
    const valid = rankedIds.has(assignment.candidateId);
    internalScores[assignment.recipientTeamId] += valid ? 1 : -1;
    if (valid) validCards[assignment.recipientTeamId] += 1;
    else decoys[assignment.recipientTeamId] += 1;
    const actorMetrics = metrics[assignment.actingTeamId];
    if (assignment.action === 'poison') {
      if (!valid) actorMetrics.successfulPoison += 1;
      else actorMetrics.giftedValidCard += 1;
    } else if (valid) actorMetrics.selfKeptValid += 1;
    else actorMetrics.selfKeptDecoy += 1;
  }
  const [teamA, teamB] = teams;
  const winnerTeamId =
    internalScores[teamA] === internalScores[teamB]
      ? undefined
      : internalScores[teamA] > internalScores[teamB]
        ? teamA
        : teamB;
  return {
    internalScores,
    validCards,
    decoys,
    metrics,
    ...(winnerTeamId ? { winnerTeamId } : {}),
  };
}

function assign(
  context: Parameters<GameplayModePlugin['handleCommand']>[0],
  command: Parameters<GameplayModePlugin['handleCommand']>[1],
): GameplayCommandResult {
  const runtime = validateRuntime(command.runtimeState);
  const round = validateRound(command.roundState);
  if (round.phase !== 'assigning') {
    throw new LiveSessionDomainError(
      'MODE_COMMAND_UNAVAILABLE',
      'All cards are already assigned',
    );
  }
  const teams = parseJson<string[]>(runtime.teamIdsJson, 'teams');
  const deck = parseJson<string[]>(runtime.deckJson, 'deck');
  const assignments = parseJson<Top10Assignment[]>(
    runtime.assignmentsJson,
    'assignments',
  );
  const candidates = candidateMap(runtime);
  const actingTeamId = context.activeTeamId;
  if (!actingTeamId || !teams.includes(actingTeamId))
    return fail('Active team is missing');
  const action = String(command.payload.action) as 'keep' | 'poison';
  const recipientTeamId =
    action === 'keep'
      ? actingTeamId
      : (teams.find((teamId) => teamId !== actingTeamId) ??
        fail('Opponent is missing'));
  const turnIndex = Number(round.turnIndex);
  assignments.push({
    turn: turnIndex + 1,
    candidateId: deck[turnIndex],
    actingTeamId,
    recipientTeamId,
    action,
    timedOut: command.payload.timedOut === true,
    resolutionReason:
      command.payload.timedOut === true ? 'timeout' : 'submitted',
    assignedAt: (
      context.now ?? fail('Server command time is missing')
    ).toISOString(),
  });
  const nextTurn = turnIndex + 1;
  const terminal = nextTurn === deck.length;
  const nextTeamId = teams.find((teamId) => teamId !== actingTeamId)!;
  return {
    runtimeState: validateRuntime({
      ...runtime,
      assignmentsJson: JSON.stringify(assignments),
      phase: terminal ? 'revealing' : 'assigning',
    }),
    roundState: validateRound({
      ...round,
      phase: terminal ? 'revealing' : 'assigning',
      turnIndex: nextTurn,
      revealIndex: 0,
      deadlineAt: terminal
        ? null
        : new Date(
            (context.now ?? fail('Server command time is missing')).getTime() +
              TOP10_TURN_SECONDS * 1000,
          ).toISOString(),
      currentCardJson: terminal
        ? null
        : JSON.stringify(candidates.get(deck[nextTurn])),
    }),
    eventType:
      command.payload.timedOut === true
        ? 'top10-turn-timed-out'
        : 'top10-card-assigned',
    eventPayload: { turnIndex, action, recipientTeamId },
    effects: terminal
      ? [{ type: 'emit-runtime-event', eventType: 'top10-reveal-ready' }]
      : [
          {
            type: 'switch-active-team',
            teamId: nextTeamId,
            reason: 'top10-next-turn',
          },
        ],
  };
}

function reveal(
  command: Parameters<GameplayModePlugin['handleCommand']>[1],
): GameplayCommandResult {
  const runtime = validateRuntime(command.runtimeState);
  const round = validateRound(command.roundState);
  if (round.phase !== 'revealing') {
    throw new LiveSessionDomainError(
      'MODE_COMMAND_UNAVAILABLE',
      'Reveal is not available',
    );
  }
  const revealOrder = parseJson<string[]>(
    runtime.revealOrderJson,
    'reveal order',
  );
  const next = Number(round.revealIndex) + 1;
  const terminal = next === revealOrder.length;
  const result = terminal ? resultFor(runtime) : undefined;
  return {
    runtimeState: validateRuntime({
      ...runtime,
      phase: terminal ? 'completed' : 'revealing',
      revealIndex: next,
      ...(result ? { resultJson: JSON.stringify(result) } : {}),
    }),
    roundState: validateRound({
      ...round,
      phase: terminal ? 'completed' : 'revealing',
      revealIndex: next,
      deadlineAt: null,
    }),
    eventType: terminal ? 'top10-reveal-completed' : 'top10-card-revealed',
    eventPayload: { revealIndex: next, candidateId: revealOrder[next - 1] },
    effects: [
      {
        type: 'emit-runtime-event',
        eventType: terminal ? 'top10-completed' : 'top10-reveal-advanced',
      },
    ],
  };
}

function publicRuntime(state: GameplayModeState): GameplayModeState {
  const valid = validateRuntime(state);
  const candidates = candidateMap(valid);
  const deck = parseJson<string[]>(valid.deckJson, 'deck');
  const assignments = parseJson<Top10Assignment[]>(
    valid.assignmentsJson,
    'assignments',
  );
  const revealOrder = parseJson<string[]>(
    valid.revealOrderJson,
    'reveal order',
  );
  const assignmentByCandidate = new Map(
    assignments.map((assignment) => [assignment.candidateId, assignment]),
  );
  const revealIndex = Number(valid.revealIndex ?? 0);
  return {
    variant: TOP10_POISON_DECK_VARIANT,
    title: valid.title ?? '',
    instruction: valid.instruction ?? '',
    rankingBasis: valid.rankingBasis ?? '',
    sourceLabel: valid.sourceLabel ?? '',
    asOfDate: valid.asOfDate ?? null,
    phase: valid.phase ?? 'assigning',
    cardCount: deck.length,
    assignmentsJson: JSON.stringify(
      assignments.map((assignment) => ({
        ...assignment,
        label: candidates.get(assignment.candidateId)?.label ?? '',
      })),
    ),
    revealedJson: JSON.stringify(
      revealOrder.slice(0, revealIndex).map((candidateId, index) => ({
        ...assignmentByCandidate.get(candidateId),
        candidateId,
        label: candidates.get(candidateId)?.label ?? '',
        rank: index < 10 ? 10 - index : null,
        decoy: index >= 10,
      })),
    ),
    ...(valid.resultJson ? { resultJson: valid.resultJson } : {}),
    ...(valid.scoreEventJson ? { scoreEventJson: valid.scoreEventJson } : {}),
  };
}

function publicRound(state: GameplayModeState): GameplayModeState {
  const valid = validateRound(state);
  return {
    phase: valid.phase,
    turnIndex: valid.turnIndex,
    revealIndex: valid.revealIndex,
    deadlineAt: valid.deadlineAt,
    currentCardJson: valid.currentCardJson ?? null,
  };
}

export const TOP10_POISON_DECK_PLUGIN: GameplayModePlugin = {
  key: TOP10_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  createInitialRuntimeState: (context) =>
    validateRuntime(context.initialState ?? {}),
  createInitialRoundState(context) {
    const runtime = validateRuntime(context.runtimeState ?? {});
    const deck = parseJson<string[]>(runtime.deckJson, 'deck');
    const candidates = candidateMap(runtime);
    return validateRound({
      phase: 'assigning',
      turnIndex: 0,
      revealIndex: 0,
      deadlineAt: new Date(
        (context.now ?? fail('Server round time is missing')).getTime() +
          TOP10_TURN_SECONDS * 1000,
      ).toISOString(),
      currentCardJson: JSON.stringify(candidates.get(deck[0])),
    });
  },
  validateRuntimeState: validateRuntime,
  validateRoundState: validateRound,
  command(type) {
    if (type === 'assign-card') {
      return {
        type,
        authorization: 'active-team-player',
        allowedRoundStatuses: ['active'],
        validatePayload: assignmentPayload,
      };
    }
    if (type === 'timeout-card') {
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    if (type === 'reveal-next') {
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
    if (command.type === 'reveal-next') return reveal(command);
    return assign(context, {
      ...command,
      payload:
        command.type === 'timeout-card'
          ? { action: 'keep', timedOut: true }
          : command.payload,
    });
  },
  projectRuntimeState: publicRuntime,
  projectRoundState(state) {
    const runtimeCard = state.currentCardJson;
    return publicRound({ ...state, currentCardJson: runtimeCard });
  },
};

export function top10Result(state: GameplayModeState): Top10Result {
  return resultFor(validateRuntime(state));
}
