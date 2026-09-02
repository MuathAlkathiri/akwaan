import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  FIRST_NOTE_ITEM_COUNT,
  FIRST_NOTE_MAX_BID_SECONDS,
  FIRST_NOTE_MIN_BID_SECONDS,
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

export const firstNoteReward = (seconds: number) =>
  seconds <= 3 ? 3 : seconds <= 7 ? 2 : 1;

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

export const FIRST_NOTE_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: FIRST_NOTE_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
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
    const state = validate(command.runtimeState);
    const teams = teamsOf(state);
    const now =
      context.now ?? fail('INVALID_FIRST_NOTE_STATE', 'Server time missing');
    const phase = String(state.phase);
    if (command.type === 'submit-first-note-bid') {
      const team = actorTeam(context, teams);
      const seconds = Number(command.payload.seconds);
      if (phase !== 'auction' || state.biddingTeamId !== team)
        return fail(
          'FIRST_NOTE_BID_TURN',
          'It is not this team’s bidding turn',
        );
      const ceiling =
        state.currentBidSeconds == null
          ? FIRST_NOTE_MAX_BID_SECONDS + 1
          : Number(state.currentBidSeconds);
      if (
        !Number.isInteger(seconds) ||
        seconds < FIRST_NOTE_MIN_BID_SECONDS ||
        seconds > FIRST_NOTE_MAX_BID_SECONDS ||
        seconds >= ceiling
      )
        return fail(
          'FIRST_NOTE_BID_INVALID',
          'Bid must be an integer from 1–15 and strictly lower than the current bid',
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
      const correct = songOf(state).acceptedAnswers.some(
        (a) =>
          normalizeAnswer(a) ===
          normalizeAnswer(String(command.payload.answer)),
      );
      if (correct)
        return resolve(
          state,
          now,
          team,
          phase === 'steal',
          phase === 'steal'
            ? 1
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
  },
  projectRuntimeState: (s) => publicState(s),
  projectRuntimeStateForActor: (s, a) => publicState(s, a),
  projectRoundState: (s) => s,
  presentedContentItemIds: ({ runtimeState }) =>
    songsOf(runtimeState)
      .slice(0, Number(runtimeState.currentSongIndex) + 1)
      .map((s) => s.contentItemId),
};
