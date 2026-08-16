import {
  TOP5_ENTRY_COUNT,
  TOP5_RANKED_COUNT,
  TOP5_RANKS,
  TOP5_SLUG,
  TOP5_TRAP_COUNT,
  TOP5_VARIANT,
} from '../../world-content/domain/world-content.constants';
import {
  GameplayCommandPayload,
  GameplayCommandResult,
  GameplayModePlugin,
  GameplayModeState,
  GameplayPluginContext,
} from './gameplay-mode.plugin';
import { LiveSessionDomainError } from './live-session.errors';
import {
  assertTeamActionAuthorized,
  assignNextTeamAction,
  assignmentFor,
  clearTeamAction,
  parseTeamActionAssignments,
  projectTeamActionAssignment,
  serializeTeamActionAssignments,
  TeamActionAssignment,
} from './team-action-assignment';

/**
 * أفضل 5 — "keep it or slip it to your opponent".
 *
 * Ten cards, five of which are the real Top 5 and five of which are traps, are
 * handed to the teams one at a time in a server-shuffled order. The team whose
 * turn it is either keeps the card or gives it away; either way the card ends up
 * owned by exactly one team. Only the five real entries score, so the two teams'
 * counts always sum to five and the challenge can never tie.
 *
 * Exactly one participant per team is authoritative for the decision — the rest
 * of the team argues, one of them presses. That authority is the shared
 * `team-action-assignment` concept, not something this mechanic invented.
 */

export const TOP5_MODE_KEY = TOP5_SLUG;
export const TOP5_DECISION_ACTION = 'top5.decision';

export type Top5Action = 'keep' | 'give';

export interface Top5RuntimeEntry {
  id: string;
  label: string;
  shortLabel?: string;
  media?: Record<string, unknown>;
  /** 1..5 for a real Top 5 entry, `null` for a trap. Never projected early. */
  rank: number | null;
}

export interface Top5Ownership {
  turn: number;
  entryId: string;
  actingTeamId: string;
  ownerTeamId: string;
  action: Top5Action;
  /** The one participant the server had authorised for that decision. */
  decidedByParticipantId: string | null;
  resolutionReason: 'submitted' | 'host-skipped';
  decidedAt: string;
}

export interface Top5Result {
  entries: Array<{ id: string; label: string; rank: number | null }>;
  ownership: Top5Ownership[];
  /** Real Top 5 entries owned, per team. Always sums to five. */
  top5Counts: Record<string, number>;
  trapCounts: Record<string, number>;
  /** The single server-owned ownership reveal order. Ten ids, each once. */
  revealOrder: string[];
  winnerTeamId: string;
}

function fail(message: string): never {
  throw new LiveSessionDomainError('INVALID_TOP5_STATE', message);
}

function parseJson<T>(value: unknown, label: string): T {
  if (typeof value !== 'string') fail(`${label} is missing`);
  try {
    return JSON.parse(value) as T;
  } catch {
    return fail(`${label} is invalid`);
  }
}

function entriesOf(state: GameplayModeState): Top5RuntimeEntry[] {
  return parseJson<Top5RuntimeEntry[]>(state.entriesJson, 'entries');
}

function entryMap(state: GameplayModeState): Map<string, Top5RuntimeEntry> {
  return new Map(entriesOf(state).map((entry) => [entry.id, entry]));
}

/**
 * The invariants the mechanic refuses to run without.
 *
 * Re-checked on every mutation and on every restore, so a hand-edited document
 * or a half-written migration is rejected at the door instead of producing a
 * challenge that cannot be scored.
 */
function validateRuntime(state: GameplayModeState): GameplayModeState {
  const entries = entriesOf(state);
  const deck = parseJson<string[]>(state.deckJson, 'deck');
  const revealOrder = parseJson<string[]>(
    state.revealOrderJson,
    'reveal order',
  );
  const teams = parseJson<string[]>(state.teamIdsJson, 'teams');
  const ownership = parseJson<Top5Ownership[]>(
    state.ownershipJson ?? '[]',
    'ownership',
  );
  const ids = entries.map((entry) => entry.id);
  const ranked = entries.filter((entry) => entry.rank !== null);
  const ranks = ranked.map((entry) => Number(entry.rank)).sort((a, b) => a - b);
  if (
    state.variant !== TOP5_VARIANT ||
    entries.length !== TOP5_ENTRY_COUNT ||
    ranked.length !== TOP5_RANKED_COUNT ||
    entries.length - ranked.length !== TOP5_TRAP_COUNT ||
    ranks.join(',') !== TOP5_RANKS.join(',')
  ) {
    return fail(
      `Top 5 requires exactly ${TOP5_ENTRY_COUNT} entries: ${TOP5_RANKED_COUNT} ranked ${TOP5_RANKS.join('..')} and ${TOP5_TRAP_COUNT} traps`,
    );
  }
  if (
    ids.some((id) => !id) ||
    new Set(ids).size !== TOP5_ENTRY_COUNT ||
    new Set(entries.map((entry) => entry.label)).size !== TOP5_ENTRY_COUNT
  ) {
    return fail('Top 5 entry ids and labels must be unique');
  }
  if (
    deck.length !== TOP5_ENTRY_COUNT ||
    new Set(deck).size !== TOP5_ENTRY_COUNT ||
    deck.some((id) => !ids.includes(id))
  ) {
    return fail('The Top 5 deck must contain every entry exactly once');
  }
  if (
    revealOrder.length !== TOP5_ENTRY_COUNT ||
    new Set(revealOrder).size !== TOP5_ENTRY_COUNT ||
    revealOrder.some((id) => !ids.includes(id))
  ) {
    return fail('The reveal order must contain every entry exactly once');
  }
  if (teams.length !== 2 || new Set(teams).size !== 2) {
    return fail('Top 5 is played by exactly two distinct teams');
  }
  if (
    ownership.length > TOP5_ENTRY_COUNT ||
    new Set(ownership.map((record) => record.entryId)).size !== ownership.length
  ) {
    return fail('Every Top 5 entry can be owned by exactly one team, once');
  }
  // Throws if the assignment state is unreadable, which is exactly what should
  // happen: without it nobody is authorised and the mechanic cannot proceed.
  parseTeamActionAssignments(state.teamActionJson);
  return {
    ...state,
    entriesJson: JSON.stringify(entries),
    deckJson: JSON.stringify(deck),
    revealOrderJson: JSON.stringify(revealOrder),
    teamIdsJson: JSON.stringify(teams),
    ownershipJson: JSON.stringify(ownership),
  };
}

function validateRound(state: GameplayModeState): GameplayModeState {
  if (
    !['deciding', 'completed'].includes(String(state.phase)) ||
    typeof state.turnIndex !== 'number'
  ) {
    return fail('Top 5 round progress is incomplete');
  }
  return state;
}

function decisionPayload(
  payload: GameplayCommandPayload,
): GameplayCommandPayload {
  const allowed = ['action', 'assignmentSequence'];
  if (
    Object.keys(payload).some((key) => !allowed.includes(key)) ||
    !['keep', 'give'].includes(String(payload.action)) ||
    (payload.assignmentSequence !== undefined &&
      typeof payload.assignmentSequence !== 'number')
  ) {
    throw new LiveSessionDomainError(
      'INVALID_TOP5_DECISION',
      'Choose keep or give',
    );
  }
  return {
    action: String(payload.action),
    ...(payload.assignmentSequence !== undefined
      ? { assignmentSequence: payload.assignmentSequence }
      : {}),
  };
}

function noPayload(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (Object.keys(payload).length) {
    throw new LiveSessionDomainError(
      'INVALID_TOP5_COMMAND',
      'This command does not accept a payload',
    );
  }
  return {};
}

/**
 * The whole scoring model: one point per real Top 5 entry owned, traps worth
 * nothing. Five scoring entries split between two teams cannot tie, which is why
 * a winner is always returned rather than optionally.
 */
export function top5Result(state: GameplayModeState): Top5Result {
  const valid = validateRuntime(state);
  const teams = parseJson<string[]>(valid.teamIdsJson, 'teams');
  const entries = entriesOf(valid);
  const ownership = parseJson<Top5Ownership[]>(
    valid.ownershipJson,
    'ownership',
  );
  if (ownership.length !== TOP5_ENTRY_COUNT) {
    return fail('Every Top 5 entry must be owned before the result is read');
  }
  const rankById = new Map(entries.map((entry) => [entry.id, entry.rank]));
  const top5Counts = Object.fromEntries(teams.map((teamId) => [teamId, 0]));
  const trapCounts = Object.fromEntries(teams.map((teamId) => [teamId, 0]));
  for (const record of ownership) {
    if (rankById.get(record.entryId) === null) {
      trapCounts[record.ownerTeamId] += 1;
    } else {
      top5Counts[record.ownerTeamId] += 1;
    }
  }
  const [teamA, teamB] = teams;
  if (top5Counts[teamA] === top5Counts[teamB]) {
    return fail('Five Top 5 entries cannot split evenly between two teams');
  }
  return {
    entries: entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      rank: entry.rank,
    })),
    ownership,
    top5Counts,
    trapCounts,
    revealOrder: parseJson<string[]>(valid.revealOrderJson, 'reveal order'),
    winnerTeamId: top5Counts[teamA] > top5Counts[teamB] ? teamA : teamB,
  };
}

function currentCard(
  state: GameplayModeState,
  turnIndex: number,
): string | null {
  const deck = parseJson<string[]>(state.deckJson, 'deck');
  if (turnIndex >= deck.length) return null;
  const entry = entryMap(state).get(deck[turnIndex]);
  if (!entry) return null;
  // The rank is the answer. It is deliberately absent from the card the players
  // are looking at, and stays absent until the challenge resolves.
  return JSON.stringify({
    id: entry.id,
    label: entry.label,
    ...(entry.shortLabel ? { shortLabel: entry.shortLabel } : {}),
    ...(entry.media ? { media: entry.media } : {}),
  });
}

/** One card decided, ownership recorded, and the next team's player assigned. */
function decide(
  context: GameplayPluginContext,
  command: {
    type: string;
    payload: GameplayCommandPayload;
    runtimeState: GameplayModeState;
    roundState: GameplayModeState;
  },
): GameplayCommandResult {
  const runtime = validateRuntime(command.runtimeState);
  const round = validateRound(command.roundState);
  if (round.phase !== 'deciding') {
    throw new LiveSessionDomainError(
      'MODE_COMMAND_UNAVAILABLE',
      'Every card has already been decided',
    );
  }
  const teams = parseJson<string[]>(runtime.teamIdsJson, 'teams');
  const deck = parseJson<string[]>(runtime.deckJson, 'deck');
  const ownership = parseJson<Top5Ownership[]>(
    runtime.ownershipJson,
    'ownership',
  );
  let assignments = parseTeamActionAssignments(runtime.teamActionJson);
  const hostSkipped = command.type === 'skip-card';
  const open = assignmentFor(assignments, TOP5_DECISION_ACTION);
  if (!open) {
    throw new LiveSessionDomainError(
      'MODE_COMMAND_UNAVAILABLE',
      'No Top 5 decision is open',
    );
  }
  // The host's escape hatch bypasses the participant check and nothing else: it
  // is still the assigned team's card, and it is still recorded as a decision
  // that team's players did not make.
  if (!hostSkipped) {
    assertTeamActionAuthorized(assignments, {
      action: TOP5_DECISION_ACTION,
      participantId: context.submitterParticipantId,
      ...(typeof command.payload.assignmentSequence === 'number'
        ? { sequence: command.payload.assignmentSequence }
        : {}),
    });
  }
  const actingTeamId = open.teamId;
  const action = (hostSkipped ? 'keep' : String(command.payload.action)) as
    'keep' | 'give';
  const opponentTeamId =
    teams.find((teamId) => teamId !== actingTeamId) ??
    fail('Opponent is missing');
  const turnIndex = Number(round.turnIndex);
  ownership.push({
    turn: turnIndex + 1,
    entryId: deck[turnIndex],
    actingTeamId,
    ownerTeamId: action === 'keep' ? actingTeamId : opponentTeamId,
    action,
    decidedByParticipantId: hostSkipped ? null : open.participantId,
    resolutionReason: hostSkipped ? 'host-skipped' : 'submitted',
    decidedAt: (
      context.now ?? fail('Server command time is missing')
    ).toISOString(),
  });

  const nextTurn = turnIndex + 1;
  const terminal = nextTurn === deck.length;
  let nextAssignment: TeamActionAssignment | undefined;
  if (terminal) {
    assignments = clearTeamAction(assignments, TOP5_DECISION_ACTION);
  } else {
    const advanced = assignNextTeamAction(assignments, {
      teamId: opponentTeamId,
      action: TOP5_DECISION_ACTION,
      participants: context.eligibleParticipants ?? [],
    });
    assignments = advanced.state;
    nextAssignment = advanced.assignment;
  }

  const nextRuntime: GameplayModeState = {
    ...runtime,
    ownershipJson: JSON.stringify(ownership),
    teamActionJson: serializeTeamActionAssignments(assignments),
    phase: terminal ? 'completed' : 'deciding',
  };
  const withResult = terminal
    ? { ...nextRuntime, resultJson: JSON.stringify(top5Result(nextRuntime)) }
    : nextRuntime;

  return {
    runtimeState: validateRuntime(withResult),
    roundState: validateRound({
      ...round,
      phase: terminal ? 'completed' : 'deciding',
      turnIndex: nextTurn,
      currentCardJson: terminal ? null : currentCard(runtime, nextTurn),
      ...projectTeamActionAssignment(nextAssignment),
    }),
    eventType: 'top5-card-decided',
    eventPayload: {
      turnIndex,
      action,
      ownerTeamId: action === 'keep' ? actingTeamId : opponentTeamId,
    },
    effects: terminal
      ? [{ type: 'emit-runtime-event', eventType: 'top5-completed' }]
      : [
          {
            type: 'switch-active-team',
            teamId: opponentTeamId,
            reason: 'top5-next-card',
          },
        ],
    ...(nextAssignment
      ? {
          assignment: {
            teamId: nextAssignment.teamId,
            participantId: nextAssignment.participantId,
          },
        }
      : {}),
  };
}

/**
 * What every client may see while the challenge is running.
 *
 * Ranks, the deck order beyond the current card, and the reveal order are all
 * absent by construction — not hidden by the UI. They appear only inside
 * `resultJson`, which only exists once the tenth card has been decided.
 */
function publicRuntime(state: GameplayModeState): GameplayModeState {
  const valid = validateRuntime(state);
  const entries = entryMap(valid);
  const ownership = parseJson<Top5Ownership[]>(
    valid.ownershipJson,
    'ownership',
  );
  return {
    variant: TOP5_VARIANT,
    title: valid.title ?? '',
    instruction: valid.instruction ?? '',
    rankingBasis: valid.rankingBasis ?? '',
    sourceLabel: valid.sourceLabel ?? '',
    asOfDate: valid.asOfDate ?? null,
    phase: valid.phase ?? 'deciding',
    entryCount: TOP5_ENTRY_COUNT,
    ownershipJson: JSON.stringify(
      ownership.map((record) => ({
        turn: record.turn,
        entryId: record.entryId,
        label: entries.get(record.entryId)?.label ?? '',
        actingTeamId: record.actingTeamId,
        ownerTeamId: record.ownerTeamId,
        action: record.action,
        resolutionReason: record.resolutionReason,
      })),
    ),
    ...(valid.phase === 'completed' && valid.resultJson
      ? { resultJson: valid.resultJson }
      : {}),
    ...(valid.scoreEventJson ? { scoreEventJson: valid.scoreEventJson } : {}),
  };
}

function publicRound(state: GameplayModeState): GameplayModeState {
  const valid = validateRound(state);
  return {
    phase: valid.phase,
    turnIndex: valid.turnIndex,
    cardNumber: Number(valid.turnIndex) + 1,
    cardCount: TOP5_ENTRY_COUNT,
    currentCardJson: valid.currentCardJson ?? null,
    // Public on purpose: teammates must be able to name who decides, and the
    // opposing team must be able to see that it is waiting.
    activeTeamId: valid.activeTeamId ?? null,
    activeParticipantId: valid.activeParticipantId ?? null,
    assignmentSequence: valid.assignmentSequence ?? null,
  };
}

export const TOP5_KEEP_OR_GIVE_PLUGIN: GameplayModePlugin = {
  key: TOP5_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  // No `deadline` declaration on purpose: a Top 5 card waits for the player it
  // was handed to, and a player who leaves is handed off rather than timed out.
  createInitialRuntimeState: (context) =>
    validateRuntime(context.initialState ?? {}),
  createInitialRoundState(context) {
    const runtime = validateRuntime(context.runtimeState ?? {});
    const assignments = parseTeamActionAssignments(runtime.teamActionJson);
    return validateRound({
      phase: 'deciding',
      turnIndex: 0,
      currentCardJson: currentCard(runtime, 0),
      ...projectTeamActionAssignment(
        assignmentFor(assignments, TOP5_DECISION_ACTION),
      ),
    });
  },
  validateRuntimeState: validateRuntime,
  validateRoundState: validateRound,
  command(type) {
    if (type === 'decide-card') {
      return {
        type,
        // Not `active-team-player`: a teammate of the decision-maker is on the
        // right team and still may not press the button.
        authorization: 'active-participant',
        allowedRoundStatuses: ['active'],
        validatePayload: decisionPayload,
      };
    }
    if (type === 'skip-card') {
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    return undefined;
  },
  handleCommand: decide,
  projectRuntimeState: publicRuntime,
  projectRoundState: publicRound,
};
