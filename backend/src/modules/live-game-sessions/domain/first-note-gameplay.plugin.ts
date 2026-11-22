import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  FIRST_NOTE_ITEM_COUNT,
  FIRST_NOTE_MAX_BID_SECONDS,
  FIRST_NOTE_MIN_BID_SECONDS,
  FIRST_NOTE_OPENING_MIN_BID_SECONDS,
  FIRST_NOTE_SLUG,
} from '../../world-content/domain/world-content.constants';
import {
  ContentItemMedia,
  LocalizedText,
} from '../../world-content/domain/world-content.types';
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
  assignNextTeamActionOrHold,
  assignmentFor,
  clearTeamAction,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
  teamActionClock,
  teamActionStandInWindow,
} from './team-action-assignment';

export const FIRST_NOTE_MODE_KEY = FIRST_NOTE_SLUG;
export { FIRST_NOTE_ITEM_COUNT };
export type FirstNotePhase =
  'preparing' | 'auction' | 'answering' | 'steal' | 'resolved' | 'completed';

export interface FirstNoteRuntimeSong {
  contentItemId: string;
  title: string;
  acceptedAnswers: string[];
  contextualClue: LocalizedText;
  clueLabel?: LocalizedText | null;
  audio: ContentItemMedia;
}

export interface FirstNoteBid {
  teamId: string;
  seconds: number;
  at: string;
}

export interface FirstNoteSongResult {
  answers: Record<string, string | null>;
  songIndex: number;
  contentItemId: string;
  title: string;
  finalBidSeconds: number;
  auctionTeamId: string;
  winnerTeamId: string | null;
  stolen: boolean;
  points: Record<string, number>;
  resolvedAt: string;
}

const fail = (code: string, message: string): never => {
  throw new LiveSessionDomainError(code, message);
};
const parse = <T>(value: unknown, label: string): T => {
  if (typeof value !== 'string')
    return fail('INVALID_FIRST_NOTE_STATE', `${label} is missing`);
  try {
    return JSON.parse(value) as T;
  } catch {
    return fail('INVALID_FIRST_NOTE_STATE', `${label} is invalid`);
  }
};
const songsOf = (s: GameplayModeState) =>
  parse<FirstNoteRuntimeSong[]>(s.songsJson, 'songs');
const teamsOf = (s: GameplayModeState) =>
  parse<string[]>(s.teamIdsJson, 'teams');
const bidsOf = (s: GameplayModeState) =>
  parse<FirstNoteBid[]>(s.bidHistoryJson ?? '[]', 'bids');
const resultsOf = (s: GameplayModeState) =>
  parse<FirstNoteSongResult[]>(s.resultsJson ?? '[]', 'results');
const songOf = (s: GameplayModeState) => songsOf(s)[Number(s.currentSongIndex)];

/**
 * What a bid is worth: one point for every second given up.
 *
 * The old three bands meant three real bids — 3, 7 and 15 — because dropping
 * from 7 to 4 cost three seconds and earned nothing, so nobody did it.
 * Fourteen legal bids, three of them meaningful. A point a second makes every
 * step count, and the auction balances itself: the price of a second is flat
 * while the chance of recognising the song falls away sharply as the clip
 * shortens, so the best bid sits somewhere in the middle rather than at the
 * floor.
 */
export const firstNoteReward = (seconds: number) =>
  FIRST_NOTE_MAX_BID_SECONDS + 1 - seconds;

/**
 * The seconds a team is owed when it steals: the last bid it made itself.
 *
 * Both halves of the steal — how long it hears and what it earns — come from
 * the stealing team's own bid, so each side is judged by the duration it
 * asked for. Undercutting a team that bid five seconds and then failing hands
 * them their five seconds and the points that bid was worth: exactly what
 * they would have won, so denying them gains nothing. And deliberately losing
 * an auction returns no more than that bid was worth while giving up first
 * answer, so it is never the better play either.
 *
 * A team that never bid has asked for nothing, and falls back to the ceiling.
 */
export function firstNoteStealSeconds(
  state: GameplayModeState,
  stealingTeamId: string,
): number {
  const own = bidsOf(state).filter((bid) => bid.teamId === stealingTeamId);
  return own.length
    ? Number(own[own.length - 1].seconds)
    : FIRST_NOTE_MAX_BID_SECONDS;
}

export function validateFirstNoteSong(
  song: FirstNoteRuntimeSong,
): FirstNoteRuntimeSong {
  if (
    !song.contentItemId ||
    !song.title?.trim() ||
    !song.acceptedAnswers?.length ||
    song.acceptedAnswers.some((a) => !normalizeAnswer(a)) ||
    !song.contextualClue?.ar?.trim() ||
    song.audio?.type !== 'audio' ||
    song.audio.assets?.length !== 1 ||
    !song.audio.assets[0]?.url?.trim()
  )
    fail(
      'FIRST_NOTE_CONTENT_INVALID',
      'First Note needs a clue, title, accepted answers, and one audio asset',
    );
  return song;
}

function validate(state: GameplayModeState): GameplayModeState {
  const songs = songsOf(state);
  const teams = teamsOf(state);
  const phases: FirstNotePhase[] = [
    'preparing',
    'auction',
    'answering',
    'steal',
    'resolved',
    'completed',
  ];
  if (
    songs.length !== FIRST_NOTE_ITEM_COUNT ||
    new Set(songs.map((s) => s.contentItemId)).size !== FIRST_NOTE_ITEM_COUNT ||
    teams.length !== 2 ||
    new Set(teams).size !== 2 ||
    !phases.includes(String(state.phase) as FirstNotePhase) ||
    !Number.isInteger(state.currentSongIndex) ||
    Number(state.currentSongIndex) < 0 ||
    Number(state.currentSongIndex) >= FIRST_NOTE_ITEM_COUNT ||
    !Number.isFinite(Number(state.answerWindowSeconds)) ||
    Number(state.answerWindowSeconds) <= 0
  )
    fail('INVALID_FIRST_NOTE_STATE', 'First Note runtime shape is invalid');
  songs.forEach(validateFirstNoteSong);
  bidsOf(state);
  resultsOf(state);
  return state;
}

const answerDeadline = (state: GameplayModeState, now: Date) =>
  new Date(
    now.getTime() + Number(state.answerWindowSeconds) * 1000,
  ).toISOString();

const actorTeam = (context: GameplayPluginContext, teams: string[]) => {
  const participant = context.eligibleParticipants?.find(
    (p) => p.participantId === context.submitterParticipantId,
  );
  if (!participant?.teamId || !teams.includes(participant.teamId))
    return fail(
      'FIRST_NOTE_FORBIDDEN',
      'Only an eligible competing player may act',
    );
  return participant.teamId;
};
const noPayload = (p: GameplayCommandPayload) =>
  Object.keys(p).length
    ? fail('INVALID_FIRST_NOTE_COMMAND', 'This command accepts no payload')
    : {};
const bidPayload = (p: GameplayCommandPayload) => {
  if (Object.keys(p).length !== 1 || !Number.isInteger(p.seconds))
    return fail(
      'FIRST_NOTE_BID_INVALID',
      'Bid must be an integer number of seconds',
    );
  return { seconds: Number(p.seconds) };
};
const answerPayload = (p: GameplayCommandPayload) => {
  if (
    Object.keys(p).length !== 1 ||
    typeof p.answer !== 'string' ||
    !p.answer.trim()
  )
    return fail('FIRST_NOTE_ANSWER_INVALID', 'Submit one non-empty song title');
  return { answer: p.answer.trim() };
};
/**
 * One authoritative phone per team moment in «من أول نغمة».
 *
 * The auction is not a race — the teams alternate, and the mechanic already
 * knows whose turn it is. What it did not know was *who on that team*, so any
 * of four phones could fire a bid and the room argued about which one counted.
 * The captain decides the bid and gives the answer; the rotation supplies a
 * stand-in only when there is no captain or the captain is away.
 */
export const FIRST_NOTE_TURN_ACTION = 'first-note.turn';

/**
 * The team that owes an action right now, or nothing between songs.
 *
 * Bidding and answering are the same kind of moment — one team, one decision —
 * so they share one action rather than two that would have to be kept in step.
 */
function firstNoteActingTeamId(state: GameplayModeState): string | undefined {
  const phase = String(state.phase);
  if (phase === 'auction')
    return typeof state.biddingTeamId === 'string'
      ? state.biddingTeamId
      : undefined;
  if (phase === 'answering' || phase === 'steal')
    return typeof state.answerOwnerTeamId === 'string'
      ? state.answerOwnerTeamId
      : undefined;
  return undefined;
}

/**
 * Refuses a phone that is not holding its team's turn.
 *
 * A runtime started before turns were assigned carries no `teamActionJson` and
 * keeps the old team-wide rule, so a Match already in progress is not broken by
 * this landing.
 */
function assertHoldsFirstNoteTurn(
  context: GameplayPluginContext,
  state: GameplayModeState,
): void {
  if (typeof state.teamActionJson !== 'string') return;
  const assignments = parseTeamActionAssignments(state.teamActionJson);
  // Not opened yet — a phase this mechanic entered outside the reducer, such as
  // Fair-Start activation. Refusing here would freeze the challenge on its very
  // first command; the sync opens the action on the way out instead.
  if (!assignmentFor(assignments, FIRST_NOTE_TURN_ACTION)) return;
  assertTeamActionAuthorized(assignments, {
    ...teamActionStandInWindow(context),
    action: FIRST_NOTE_TURN_ACTION,
    teamId: firstNoteActingTeamId(state),
    participantId: context.submitterParticipantId,
  });
}

/** Moves the turn with the mechanic, and closes it when nobody owes one. */
function syncFirstNoteTurn(
  before: GameplayModeState,
  after: GameplayModeState,
  context: GameplayPluginContext,
): GameplayModeState {
  if (typeof after.teamActionJson !== 'string') return after;
  const assignments = parseTeamActionAssignments(after.teamActionJson);
  const teamId = firstNoteActingTeamId(after);
  if (!teamId) {
    return {
      ...after,
      teamActionJson: serializeTeamActionAssignments(
        clearTeamAction(assignments, FIRST_NOTE_TURN_ACTION),
      ),
    };
  }
  // Unchanged turn, already held by that team: leave the holder alone rather
  // than re-opening the action under them mid-decision.
  if (
    teamId === firstNoteActingTeamId(before) &&
    assignmentFor(assignments, FIRST_NOTE_TURN_ACTION)?.teamId === teamId
  ) {
    return after;
  }
  return {
    ...after,
    teamActionJson: serializeTeamActionAssignments(
      assignNextTeamActionOrHold(assignments, {
        teamId,
        action: FIRST_NOTE_TURN_ACTION,
        participants: context.eligibleParticipants ?? [],
        now: teamActionClock(context),
      }).state,
    ),
  };
}

const commandResult = (
  runtimeState: GameplayModeState,
  eventType: string,
  prepareNextPresentation = false,
): GameplayCommandResult => ({
  runtimeState: validate(runtimeState),
  roundState: {
    phase: runtimeState.phase,
    songIndex: runtimeState.currentSongIndex,
  },
  eventType,
  eventPayload: {},
  effects: [],
  prepareNextPresentation,
});

function totals(state: GameplayModeState) {
  const teams = teamsOf(state);
  const points = Object.fromEntries(teams.map((t) => [t, 0]));
  for (const result of resultsOf(state))
    for (const team of teams) points[team] += result.points[team] ?? 0;
  const [a, b] = teams;
  const tie = points[a] === points[b];
  return {
    winnerTeamId: tie ? null : points[a] > points[b] ? a : b,
    tie,
    points,
  };
}

function resolve(
  state: GameplayModeState,
  now: Date,
  winnerTeamId: string | null,
  stolen: boolean,
  reward: number,
) {
  const teams = teamsOf(state);
  const song = songOf(state);
  const points = Object.fromEntries(
    teams.map((t) => [t, t === winnerTeamId ? reward : 0]),
  );
  const result: FirstNoteSongResult = {
    answers: Object.fromEntries(
      teams.map((team) => [
        team,
        parse<Record<string, string>>(
          state.revealAnswersJson ?? '{}',
          'answers',
        )[team] ?? null,
      ]),
    ),
    songIndex: Number(state.currentSongIndex),
    contentItemId: song.contentItemId,
    title: song.title,
    finalBidSeconds: Number(state.currentBidSeconds),
    auctionTeamId: String(state.answerOwnerTeamId),
    winnerTeamId,
    stolen,
    points,
    resolvedAt: now.toISOString(),
  };
  return commandResult(
    {
      ...state,
      phase: 'resolved',
      deadlineAt: null,
      resultsJson: JSON.stringify([...resultsOf(state), result]),
    },
    'first-note-song-resolved',
  );
}

const safeAudio = (media: ContentItemMedia) => ({
  type: media.type,
  assets: media.assets.map((a) => ({
    url: a.url,
    ...(a.altText ? { altText: a.altText } : {}),
  })),
});
function publicState(
  state: GameplayModeState,
  actor?: InteractionActorProjection,
): GameplayModeState {
  const valid = validate(state);
  const phase = String(valid.phase);
  const song = songOf(valid);
  const teams = teamsOf(valid);
  const resolved = phase === 'resolved' || phase === 'completed';
  const latest = resultsOf(valid).at(-1);
  const shared: GameplayModeState = {
    phase: valid.phase,
    currentSongIndex: valid.currentSongIndex,
    songCount: FIRST_NOTE_ITEM_COUNT,
    contextualClueJson: JSON.stringify(song.contextualClue),
    clueLabelJson: JSON.stringify(song.clueLabel ?? null),
    currentBidSeconds: valid.currentBidSeconds ?? null,
    currentBidTeamId: valid.currentBidTeamId ?? null,
    biddingTeamId: valid.biddingTeamId ?? null,
    answerOwnerTeamId: valid.answerOwnerTeamId ?? null,
    finalBidSeconds: valid.finalBidSeconds ?? null,
    // What the clip is during a steal: the stealing team's own last bid, so
    // the room plays the duration that team asked for rather than the one its
    // opponent forced on it. Null outside the steal, where `finalBidSeconds`
    // is the authority.
    stealSeconds:
      phase === 'steal' && valid.answerOwnerTeamId
        ? firstNoteStealSeconds(valid, String(valid.answerOwnerTeamId))
        : null,
    bidHistoryJson: valid.bidHistoryJson ?? '[]',
    deadlineAt: valid.deadlineAt ?? null,
    ...(phase === 'auction' || phase === 'answering' || phase === 'steal'
      ? { audioJson: JSON.stringify(safeAudio(song.audio)) }
      : {}),
    ...(resolved && latest ? { revealJson: JSON.stringify(latest) } : {}),
    ...(phase === 'completed' && valid.resultJson
      ? { resultJson: valid.resultJson }
      : {}),
  };
  if (!actor?.teamId) return shared;
  const teamId = actor.teamId;
  const phoneSafe = { ...shared };
  delete phoneSafe.audioJson;
  return {
    ...phoneSafe,
    actorTeamId: teamId,
    canBid: phase === 'auction' && valid.biddingTeamId === teamId,
    canPass:
      phase === 'auction' &&
      valid.biddingTeamId === teamId &&
      valid.currentBidTeamId &&
      valid.currentBidTeamId !== teamId,
    canAnswer:
      (phase === 'answering' || phase === 'steal') &&
      valid.answerOwnerTeamId === teamId,
    otherTeamId: teams.find((t) => t !== teamId) ?? null,
  };
}

/**
 * The mechanic itself. Wrapped rather than inlined so that the turn assignment
 * is synced on EVERY path out of it — a transition that forgot to move the turn
 * would leave the next team unable to act at all.
 */
function reduceFirstNote(
  context: GameplayPluginContext,
  command: {
    type: string;
    payload: GameplayCommandPayload;
    runtimeState: GameplayModeState;
    roundState: GameplayModeState;
  },
): GameplayCommandResult {
  const state = validate(command.runtimeState);
  const teams = teamsOf(state);
  const now =
    context.now ?? fail('INVALID_FIRST_NOTE_STATE', 'Server time missing');
  const phase = String(state.phase);
  if (command.type === 'submit-first-note-bid') {
    const team = actorTeam(context, teams);
    const seconds = Number(command.payload.seconds);
    if (phase !== 'auction' || state.biddingTeamId !== team)
      return fail('FIRST_NOTE_BID_TURN', 'It is not this team’s bidding turn');
    // The team's turn is already established; this settles which phone.
    assertHoldsFirstNoteTurn(context, state);
    const opening = state.currentBidSeconds == null;
    const ceiling = opening
      ? FIRST_NOTE_MAX_BID_SECONDS + 1
      : Number(state.currentBidSeconds);
    const floor = opening
      ? FIRST_NOTE_OPENING_MIN_BID_SECONDS
      : FIRST_NOTE_MIN_BID_SECONDS;
    if (
      !Number.isInteger(seconds) ||
      seconds < floor ||
      seconds > FIRST_NOTE_MAX_BID_SECONDS ||
      seconds >= ceiling
    )
      return fail(
        'FIRST_NOTE_BID_INVALID',
        opening
          ? `An opening bid must be an integer from ${FIRST_NOTE_OPENING_MIN_BID_SECONDS}–${FIRST_NOTE_MAX_BID_SECONDS}`
          : 'Bid must be an integer from 1–15 and strictly lower than the current bid',
      );
    const other = teams.find((t) => t !== team)!;
    return commandResult(
      {
        ...state,
        currentBidSeconds: seconds,
        currentBidTeamId: team,
        biddingTeamId: other,
        bidHistoryJson: JSON.stringify([
          ...bidsOf(state),
          { teamId: team, seconds, at: now.toISOString() },
        ]),
      },
      'first-note-bid-accepted',
    );
  }
  if (command.type === 'pass-first-note-bid') {
    const team = actorTeam(context, teams);
    if (
      phase !== 'auction' ||
      state.biddingTeamId !== team ||
      !state.currentBidTeamId ||
      state.currentBidTeamId === team
    )
      return fail(
        'FIRST_NOTE_PASS_INVALID',
        'A team may pass only on its turn after the opponent holds a valid bid',
      );
    assertHoldsFirstNoteTurn(context, state);
    return commandResult(
      {
        ...state,
        phase: 'answering',
        answerOwnerTeamId: state.currentBidTeamId,
        finalBidSeconds: state.currentBidSeconds,
        deadlineAt: answerDeadline(state, now),
      },
      'first-note-auction-resolved',
    );
  }
  if (command.type === 'submit-first-note-answer') {
    const team = actorTeam(context, teams);
    if (
      (phase !== 'answering' && phase !== 'steal') ||
      state.answerOwnerTeamId !== team
    )
      return fail(
        'FIRST_NOTE_ANSWER_FORBIDDEN',
        'Only the answer owner may submit',
      );
    // The captain bid for this answer, so the captain gives it.
    assertHoldsFirstNoteTurn(context, state);
    const correct = songOf(state).acceptedAnswers.some(
      (a) =>
        normalizeAnswer(a) === normalizeAnswer(String(command.payload.answer)),
    );
    state.revealAnswersJson = JSON.stringify({
      ...parse<Record<string, string>>(
        state.revealAnswersJson ?? '{}',
        'answers',
      ),
      [team]: String(command.payload.answer),
    });
    if (correct)
      return resolve(
        state,
        now,
        team,
        phase === 'steal',
        phase === 'steal'
          ? firstNoteReward(firstNoteStealSeconds(state, team))
          : firstNoteReward(Number(state.finalBidSeconds)),
      );
    if (phase === 'answering') {
      const opponent = teams.find((t) => t !== team)!;
      return commandResult(
        {
          ...state,
          phase: 'steal',
          answerOwnerTeamId: opponent,
          deadlineAt: answerDeadline(state, now),
        },
        'first-note-steal-opened',
      );
    }
    return resolve(state, now, null, true, 0);
  }
  if (command.type === 'expire-first-note-answer') {
    if (
      (phase !== 'answering' && phase !== 'steal') ||
      typeof state.deadlineAt !== 'string' ||
      now.getTime() < Date.parse(state.deadlineAt)
    )
      return fail(
        'FIRST_NOTE_NOT_EXPIRED',
        'First Note answer window has not expired',
      );
    if (phase === 'answering') {
      const opponent = teams.find((t) => t !== state.answerOwnerTeamId)!;
      return commandResult(
        {
          ...state,
          phase: 'steal',
          answerOwnerTeamId: opponent,
          deadlineAt: answerDeadline(state, now),
        },
        'first-note-steal-opened',
      );
    }
    return resolve(state, now, null, true, 0);
  }
  if (command.type === 'advance-first-note') {
    if (phase !== 'resolved')
      return fail('FIRST_NOTE_NOT_RESOLVED', 'Resolve this song first');
    const next = Number(state.currentSongIndex) + 1;
    if (next >= FIRST_NOTE_ITEM_COUNT)
      return commandResult(
        {
          ...state,
          phase: 'completed',
          deadlineAt: null,
          resultJson: JSON.stringify(totals(state)),
        },
        'first-note-completed',
      );
    const opener = teams[next % teams.length];
    return commandResult(
      {
        ...state,
        phase: 'preparing',
        currentSongIndex: next,
        revealAnswersJson: '{}',
        currentBidSeconds: null,
        currentBidTeamId: null,
        biddingTeamId: opener,
        answerOwnerTeamId: null,
        finalBidSeconds: null,
        bidHistoryJson: '[]',
        deadlineAt: null,
      },
      'first-note-song-prepared',
      true,
    );
  }
  return fail('FIRST_NOTE_COMMAND_UNKNOWN', 'Unsupported First Note command');
}

export const FIRST_NOTE_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: FIRST_NOTE_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  currentContentItemId: (runtimeState, roundState) => {
    try {
      if (typeof runtimeState.songsJson !== 'string') return undefined;
      const items = JSON.parse(runtimeState.songsJson);
      if (runtimeState.currentSongIndex == null) return undefined;
      const index = Number(runtimeState.currentSongIndex);
      if (!Array.isArray(items) || !Number.isInteger(index) || index < 0)
        return undefined;
      const id = items[index]?.contentItemId;
      return typeof id === 'string' && id ? id : undefined;
    } catch {
      return undefined;
    }
  },
  deadline: {
    source: 'runtime-state',
    commandType: 'expire-first-note-answer',
    activePhases: ['answering', 'steal'],
    requiresPresentationActivation: true,
  },
  requiredPresentationSurfaces: () => [{ capability: 'shared' }],
  createInitialRuntimeState: (c) => validate(c.initialState ?? {}),
  createInitialRoundState: (c) => ({
    phase: c.initialState?.phase ?? 'preparing',
    songIndex: c.initialState?.currentSongIndex ?? 0,
  }),
  validateRuntimeState: validate,
  validateRoundState: (s) => s,
  command: (type) => {
    if (type === 'submit-first-note-bid')
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: bidPayload,
      };
    if (type === 'pass-first-note-bid')
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    if (type === 'submit-first-note-answer')
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: answerPayload,
      };
    if (type === 'advance-first-note')
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    if (type === 'expire-first-note-answer')
      return {
        type,
        authorization: 'internal',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    return undefined;
  },
  activatePresentation: (state) =>
    String(state.phase) === 'preparing'
      ? validate({ ...state, phase: 'auction' })
      : state,
  handleCommand: (context, command) => {
    const result = reduceFirstNote(context, command);
    return {
      ...result,
      runtimeState: syncFirstNoteTurn(
        command.runtimeState,
        result.runtimeState,
        context,
      ),
    };
  },
  projectRuntimeState: (s) => publicState(s),
  projectRuntimeStateForActor: (s, a) => publicState(s, a),
  projectRoundState: (s) => s,
  presentedContentItemIds: ({ runtimeState }) =>
    songsOf(runtimeState)
      .slice(0, Number(runtimeState.currentSongIndex) + 1)
      .map((s) => s.contentItemId),
};
