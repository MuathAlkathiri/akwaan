import {
  pointWithinNormalizedPolygon,
  validateHotspotTolerance,
  validateNormalizedPolygon,
} from '../../world-content/domain/odd-piece-hotspot.geometry';
import { OddPieceHotspotImage } from '../../world-content/domain/world-content.types';
import {
  GameplayCommandPayload,
  GameplayCommandResult,
  GameplayModePlugin,
  GameplayModeState,
  GameplayPluginContext,
} from './gameplay-mode.plugin';
import { LiveSessionDomainError } from './live-session.errors';

export const ODD_PIECE_HOTSPOT_MODE_KEY = 'odd-piece';
export const ODD_PIECE_HOTSPOT_VERSION = 2;
export const ODD_PIECE_HOTSPOT_DEFAULT_DISCUSSION_SECONDS = 30;
export const ODD_PIECE_HOTSPOT_DEFAULT_ANSWER_SECONDS = 5;

export interface OddPieceHotspotPuzzle {
  id: string;
  prompt: string;
  difficulty: 'easy' | 'medium' | 'hard';
  modifiedImage: OddPieceHotspotImage;
  originalImage: OddPieceHotspotImage;
  targetVehicleIdentity: string;
  targetVehicleLabel: string;
  intruderVehicleIdentity: string;
  intruderVehicleLabel: string;
  intruderPartIdentity: string;
  intruderPartLabel: string;
  hotspot: { polygon: Array<{ x: number; y: number }>; tolerance: number };
}

export interface OddPieceHotspotAttempt {
  teamId: string;
  correct: boolean;
  outcome: 'correct' | 'wrong' | 'timeout';
}

export interface OddPieceHotspotResult {
  puzzleIndex: number;
  contentItemId: string;
  winnerTeamId: string | null;
  attempts: OddPieceHotspotAttempt[];
}

export interface OddPieceHotspotChallengeResult {
  winnerTeamId: string | null;
  tie: boolean;
  points: Record<string, number>;
}

const parse = <T>(value: unknown, label: string): T => {
  if (typeof value !== 'string')
    throw new LiveSessionDomainError(
      'INVALID_ODD_PIECE_V2_STATE',
      `${label} is missing`,
    );
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new LiveSessionDomainError(
      'INVALID_ODD_PIECE_V2_STATE',
      `${label} is invalid`,
    );
  }
};

const puzzlesOf = (state: GameplayModeState) =>
  parse<OddPieceHotspotPuzzle[]>(state.puzzlesJson, 'puzzles');
const teamsOf = (state: GameplayModeState) =>
  parse<string[]>(state.teamIdsJson, 'teams');
const attemptsOf = (state: GameplayModeState) =>
  parse<OddPieceHotspotAttempt[]>(state.attemptsJson ?? '[]', 'attempts');
const resultsOf = (state: GameplayModeState) =>
  parse<OddPieceHotspotResult[]>(state.resultsJson ?? '[]', 'results');

function validateImage(image: OddPieceHotspotImage, label: string): void {
  if (
    !image?.media ||
    image.media.type !== 'image' ||
    image.media.assets?.length !== 1 ||
    typeof image.media.assets[0]?.url !== 'string' ||
    !image.media.assets[0].url.trim()
  )
    throw new LiveSessionDomainError(
      'ODD_PIECE_CONTENT_INVALID',
      `${label} must contain one image asset`,
    );
  if (
    !Number.isInteger(image.width) ||
    image.width <= 0 ||
    !Number.isInteger(image.height) ||
    image.height <= 0
  )
    throw new LiveSessionDomainError(
      'ODD_PIECE_CONTENT_INVALID',
      `${label} dimensions are invalid`,
    );
  if (!['landscape', 'portrait', 'square'].includes(image.orientation))
    throw new LiveSessionDomainError(
      'ODD_PIECE_CONTENT_INVALID',
      `${label} orientation is invalid`,
    );
  const expectedOrientation =
    image.width === image.height
      ? 'square'
      : image.width > image.height
        ? 'landscape'
        : 'portrait';
  if (image.orientation !== expectedOrientation)
    throw new LiveSessionDomainError(
      'ODD_PIECE_CONTENT_INVALID',
      `${label} orientation does not match dimensions`,
    );
  if (
    !image.provenance?.assetOrigin ||
    typeof image.provenance.sourceUrl !== 'string' ||
    !image.provenance.sourceUrl.trim()
  )
    throw new LiveSessionDomainError(
      'ODD_PIECE_CONTENT_INVALID',
      `${label} provenance is missing`,
    );
}

export function validateOddPieceHotspotPuzzle(
  puzzle: OddPieceHotspotPuzzle,
): OddPieceHotspotPuzzle {
  if (
    !puzzle?.id ||
    !puzzle.prompt ||
    !['easy', 'medium', 'hard'].includes(puzzle.difficulty)
  )
    throw new LiveSessionDomainError(
      'ODD_PIECE_CONTENT_INVALID',
      'Odd Piece V2 puzzle metadata is invalid',
    );
  validateImage(puzzle.modifiedImage, 'Modified image');
  validateImage(puzzle.originalImage, 'Original image');
  if (
    puzzle.modifiedImage.width !== puzzle.originalImage.width ||
    puzzle.modifiedImage.height !== puzzle.originalImage.height
  )
    throw new LiveSessionDomainError(
      'ODD_PIECE_CONTENT_INVALID',
      'Odd Piece V2 images must share dimensions',
    );
  if (
    !puzzle.targetVehicleIdentity ||
    !puzzle.targetVehicleLabel ||
    !puzzle.intruderVehicleIdentity ||
    !puzzle.intruderVehicleLabel ||
    puzzle.targetVehicleIdentity === puzzle.intruderVehicleIdentity ||
    !puzzle.intruderPartIdentity ||
    !puzzle.intruderPartLabel
  )
    throw new LiveSessionDomainError(
      'ODD_PIECE_CONTENT_INVALID',
      'Odd Piece V2 identities are invalid',
    );
  if (
    validateNormalizedPolygon(puzzle.hotspot?.polygon).length ||
    validateHotspotTolerance(puzzle.hotspot?.tolerance).length
  )
    throw new LiveSessionDomainError(
      'ODD_PIECE_CONTENT_INVALID',
      'Odd Piece V2 hotspot geometry is invalid',
    );
  return puzzle;
}

function validateState(state: GameplayModeState): GameplayModeState {
  const puzzles = puzzlesOf(state);
  const teams = teamsOf(state);
  const presentationParticipants = parse<string[]>(
    state.requiredPresentationParticipantIdsJson ?? '[]',
    'required presentation participants',
  );
  const presentationTeams = parse<string[]>(
    state.requiredPresentationTeamIdsJson ?? '[]',
    'required presentation teams',
  );
  if (
    puzzles.length !== 3 ||
    new Set(puzzles.map((puzzle) => puzzle.id)).size !== 3 ||
    teams.length !== 2 ||
    new Set(teams).size !== 2 ||
    !Number.isFinite(Number(state.discussionSeconds)) ||
    Number(state.discussionSeconds) <= 0 ||
    !Number.isFinite(Number(state.answerSeconds)) ||
    Number(state.answerSeconds) <= 0 ||
    presentationParticipants.length > 2 ||
    new Set(presentationParticipants).size !==
      presentationParticipants.length ||
    (presentationTeams.length > 0 &&
      (presentationTeams.length !== 2 ||
        new Set(presentationTeams).size !== presentationTeams.length ||
        presentationTeams.some((teamId) => !teams.includes(teamId)))) ||
    !['preparing', 'open', 'answering', 'revealed', 'completed'].includes(
      String(state.phase),
    )
  )
    throw new LiveSessionDomainError(
      'INVALID_ODD_PIECE_V2_STATE',
      'Odd Piece V2 needs three puzzles, two teams and valid timers',
    );
  puzzles.forEach(validateOddPieceHotspotPuzzle);
  return state;
}

function actorTeam(context: GameplayPluginContext, teams: string[]): string {
  const participant = context.eligibleParticipants?.find(
    (candidate) => candidate.participantId === context.submitterParticipantId,
  );
  if (!participant?.teamId || !teams.includes(participant.teamId))
    throw new LiveSessionDomainError(
      'ODD_PIECE_FORBIDDEN',
      'Only an eligible competing player may act',
    );
  return participant.teamId;
}

function assertAcknowledgedParticipant(
  context: GameplayPluginContext,
  state: GameplayModeState,
): void {
  const hasActivationSnapshot =
    state.presentationReadyParticipantIdsJson !== undefined;
  const required = parse<string[]>(
    hasActivationSnapshot
      ? state.presentationReadyParticipantIdsJson
      : (state.requiredPresentationParticipantIdsJson ?? '[]'),
    'presentation participants',
  );
  if (
    (hasActivationSnapshot && required.length === 0) ||
    !context.submitterParticipantId
  ) {
    throw new LiveSessionDomainError(
      'ODD_PIECE_PRESENTATION_NOT_READY',
      'Only an acknowledged answer surface may submit',
    );
  }
  if (required.includes(context.submitterParticipantId)) return;
  throw new LiveSessionDomainError(
    'ODD_PIECE_PRESENTATION_NOT_READY',
    'Only an acknowledged answer surface may submit',
  );
}

function noPayload(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (Object.keys(payload).length)
    throw new LiveSessionDomainError(
      'INVALID_ODD_PIECE_COMMAND',
      'This command accepts no payload',
    );
  return {};
}

function coordinatePayload(payload: GameplayCommandPayload): {
  x: number;
  y: number;
} {
  if (
    Object.keys(payload).length !== 2 ||
    typeof payload.x !== 'number' ||
    typeof payload.y !== 'number' ||
    !Number.isFinite(payload.x) ||
    !Number.isFinite(payload.y) ||
    payload.x < 0 ||
    payload.x > 1 ||
    payload.y < 0 ||
    payload.y > 1
  )
    throw new LiveSessionDomainError(
      'INVALID_ODD_PIECE_HOTSPOT_SUBMISSION',
      'Submit one normalized x/y coordinate',
    );
  return { x: payload.x, y: payload.y };
}

function deadlineIsPast(state: GameplayModeState, now: Date): boolean {
  return Boolean(
    state.deadlineAt &&
    new Date(String(state.deadlineAt)).getTime() <= now.getTime(),
  );
}

function challengeResult(
  state: GameplayModeState,
): OddPieceHotspotChallengeResult {
  const teams = teamsOf(state);
  const points = Object.fromEntries(teams.map((teamId) => [teamId, 0]));
  resultsOf(state).forEach((entry) => {
    if (entry.winnerTeamId && entry.winnerTeamId in points)
      points[entry.winnerTeamId] += 1;
  });
  const [first, second] = teams;
  const tie = points[first] === points[second];
  return {
    winnerTeamId: tie ? null : points[first] > points[second] ? first : second,
    tie,
    points,
  };
}

function commandResult(
  state: GameplayModeState,
  eventType: string,
  prepareNextPresentation = false,
): GameplayCommandResult {
  return {
    runtimeState: validateState(state),
    roundState: { phase: state.phase, puzzleIndex: state.currentPuzzleIndex },
    eventType,
    eventPayload: {},
    effects: [],
    prepareNextPresentation,
  };
}

function requiredParticipants(state: GameplayModeState) {
  const ids = parse<string[]>(
    state.requiredPresentationParticipantIdsJson ?? '[]',
    'required presentation participants',
  );
  const teamIds = parse<string[]>(
    state.requiredPresentationTeamIdsJson ?? '[]',
    'required presentation teams',
  );
  if (teamIds.length === 2 && ids.length === 0) {
    return [
      { capability: 'shared' as const },
      { capability: 'answering' as const, teamId: teamIds[0] },
      { capability: 'decision' as const, teamId: teamIds[1] },
    ];
  }
  return [
    { capability: 'shared' as const },
    ...(ids[0]
      ? [{ capability: 'answering' as const, participantId: ids[0] }]
      : []),
    ...(ids[1]
      ? [{ capability: 'decision' as const, participantId: ids[1] }]
      : []),
  ];
}

export const ODD_PIECE_HOTSPOT_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: ODD_PIECE_HOTSPOT_MODE_KEY,
  version: ODD_PIECE_HOTSPOT_VERSION,
  stateSchemaVersion: 2,
  deadline: {
    source: 'runtime-state',
    commandType: 'expire-odd-piece-hotspot-discussion',
    commandTypeByPhase: { answering: 'expire-odd-piece-hotspot-answer' },
    activePhases: ['open', 'answering'],
    requiresPresentationActivation: true,
  },
  requiredPresentationSurfaces: ({ runtimeState }) =>
    requiredParticipants(runtimeState),
  createInitialRuntimeState: (context) =>
    validateState(context.initialState ?? {}),
  createInitialRoundState: (context) => ({
    phase: context.initialState?.phase ?? 'preparing',
    puzzleIndex: context.initialState?.currentPuzzleIndex ?? 0,
  }),
  validateRuntimeState: validateState,
  validateRoundState: (state) => state,
  command: (type) => {
    if (
      type === 'claim-odd-piece-hotspot' ||
      type === 'advance-odd-piece-hotspot' ||
      type === 'expire-odd-piece-hotspot-discussion' ||
      type === 'expire-odd-piece-hotspot-answer'
    )
      return {
        type,
        authorization: type.startsWith('expire-')
          ? 'internal'
          : type === 'advance-odd-piece-hotspot'
            ? 'controller'
            : 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    if (type === 'submit-odd-piece-hotspot')
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: coordinatePayload,
      };
    return undefined;
  },
  activatePresentation: (state, now, context) =>
    validateState({
      ...state,
      phase: 'open',
      deadlineAt: new Date(
        now.getTime() + Number(state.discussionSeconds) * 1000,
      ).toISOString(),
      answerOwnerTeamId: null,
      presentationReadyParticipantIdsJson: JSON.stringify(
        context.presentationReadyParticipantIds ?? [],
      ),
    }),
  handleCommand: (context, command) => {
    const state = validateState(command.runtimeState);
    const teams = teamsOf(state);
    const now = context.now ?? new Date();
    const current = puzzlesOf(state)[Number(state.currentPuzzleIndex)];
    const attempts = attemptsOf(state);
    const attemptedTeams = new Set(attempts.map((attempt) => attempt.teamId));
    if (command.type === 'claim-odd-piece-hotspot') {
      assertAcknowledgedParticipant(context, state);
      const teamId = actorTeam(context, teams);
      if (state.phase !== 'open' || deadlineIsPast(state, now))
        throw new LiveSessionDomainError(
          'ODD_PIECE_DISCUSSION_CLOSED',
          'The discussion window is closed',
        );
      if (attemptedTeams.has(teamId))
        throw new LiveSessionDomainError(
          'ODD_PIECE_ATTEMPT_USED',
          'This team already used its attempt',
        );
      return commandResult(
        {
          ...state,
          phase: 'answering',
          answerOwnerTeamId: teamId,
          deadlineAt: new Date(
            now.getTime() + Number(state.answerSeconds) * 1000,
          ).toISOString(),
        },
        'odd-piece-hotspot-claimed',
      );
    }
    if (command.type === 'submit-odd-piece-hotspot') {
      assertAcknowledgedParticipant(context, state);
      const teamId = actorTeam(context, teams);
      if (state.phase !== 'answering' || state.answerOwnerTeamId !== teamId)
        throw new LiveSessionDomainError(
          'ODD_PIECE_ANSWER_FORBIDDEN',
          'Only the answer-owning team may submit',
        );
      if (deadlineIsPast(state, now))
        throw new LiveSessionDomainError(
          'ODD_PIECE_ANSWER_CLOSED',
          'The answer window is closed',
        );
      if (attemptedTeams.has(teamId))
        throw new LiveSessionDomainError(
          'ODD_PIECE_ATTEMPT_USED',
          'This team already used its attempt',
        );
      const point = coordinatePayload(command.payload);
      const correct = pointWithinNormalizedPolygon(
        point,
        current.hotspot.polygon,
        current.hotspot.tolerance,
      );
      const nextAttempts = [
        ...attempts,
        {
          teamId,
          correct,
          outcome: correct ? 'correct' : 'wrong',
        } as OddPieceHotspotAttempt,
      ];
      if (correct || nextAttempts.length >= 2) {
        const itemResult: OddPieceHotspotResult = {
          puzzleIndex: Number(state.currentPuzzleIndex),
          contentItemId: current.id,
          winnerTeamId: correct ? teamId : null,
          attempts: nextAttempts,
        };
        return commandResult(
          {
            ...state,
            phase: 'revealed',
            attemptsJson: JSON.stringify(nextAttempts),
            resultsJson: JSON.stringify([...resultsOf(state), itemResult]),
            answerOwnerTeamId: null,
            deadlineAt: null,
          },
          'odd-piece-hotspot-resolved',
        );
      }
      const opponent = teams.find((candidate) => candidate !== teamId)!;
      return commandResult(
        {
          ...state,
          phase: 'answering',
          attemptsJson: JSON.stringify(nextAttempts),
          answerOwnerTeamId: opponent,
          deadlineAt: new Date(
            now.getTime() + Number(state.answerSeconds) * 1000,
          ).toISOString(),
        },
        'odd-piece-hotspot-opponent-opened',
      );
    }
    if (command.type === 'expire-odd-piece-hotspot-discussion') {
      if (state.phase !== 'open' || !deadlineIsPast(state, now))
        throw new LiveSessionDomainError(
          'ODD_PIECE_DISCUSSION_NOT_EXPIRED',
          'The discussion window has not expired',
        );
      const itemResult: OddPieceHotspotResult = {
        puzzleIndex: Number(state.currentPuzzleIndex),
        contentItemId: current.id,
        winnerTeamId: null,
        attempts,
      };
      return commandResult(
        {
          ...state,
          phase: 'revealed',
          resultsJson: JSON.stringify([...resultsOf(state), itemResult]),
          deadlineAt: null,
        },
        'odd-piece-hotspot-discussion-expired',
      );
    }
    if (command.type === 'expire-odd-piece-hotspot-answer') {
      if (
        state.phase !== 'answering' ||
        !deadlineIsPast(state, now) ||
        !state.answerOwnerTeamId
      )
        throw new LiveSessionDomainError(
          'ODD_PIECE_ANSWER_NOT_EXPIRED',
          'The answer window has not expired',
        );
      const nextAttempts = [
        ...attempts,
        {
          teamId: String(state.answerOwnerTeamId),
          correct: false,
          outcome: 'timeout' as const,
        },
      ];
      if (nextAttempts.length >= 2) {
        const itemResult: OddPieceHotspotResult = {
          puzzleIndex: Number(state.currentPuzzleIndex),
          contentItemId: current.id,
          winnerTeamId: null,
          attempts: nextAttempts,
        };
        return commandResult(
          {
            ...state,
            phase: 'revealed',
            attemptsJson: JSON.stringify(nextAttempts),
            resultsJson: JSON.stringify([...resultsOf(state), itemResult]),
            answerOwnerTeamId: null,
            deadlineAt: null,
          },
          'odd-piece-hotspot-answer-expired',
        );
      }
      const opponent = teams.find(
        (candidate) => candidate !== state.answerOwnerTeamId,
      )!;
      return commandResult(
        {
          ...state,
          phase: 'answering',
          attemptsJson: JSON.stringify(nextAttempts),
          answerOwnerTeamId: opponent,
          deadlineAt: new Date(
            now.getTime() + Number(state.answerSeconds) * 1000,
          ).toISOString(),
        },
        'odd-piece-hotspot-opponent-opened',
      );
    }
    if (command.type === 'advance-odd-piece-hotspot') {
      if (state.phase !== 'revealed')
        throw new LiveSessionDomainError(
          'ODD_PIECE_NOT_REVEALED',
          'Resolve this puzzle first',
        );
      const nextIndex = Number(state.currentPuzzleIndex) + 1;
      if (nextIndex >= 3)
        return commandResult(
          {
            ...state,
            phase: 'completed',
            deadlineAt: null,
            resultJson: JSON.stringify(challengeResult(state)),
          },
          'odd-piece-hotspot-completed',
        );
      return commandResult(
        {
          ...state,
          phase: 'preparing',
          currentPuzzleIndex: nextIndex,
          attemptsJson: '[]',
          answerOwnerTeamId: null,
          deadlineAt: null,
        },
        'odd-piece-hotspot-puzzle-prepared',
        true,
      );
    }
    throw new LiveSessionDomainError(
      'ODD_PIECE_COMMAND_UNKNOWN',
      'Unsupported Odd Piece V2 command',
    );
  },
  projectRuntimeState: projectHotspotRuntimeState,
  projectRuntimeStateForActor: (state, actor) => {
    const projected = projectHotspotRuntimeState(state);
    const teamId = actor.teamId;
    if (!teamId) return projected;
    const attempted = new Set(
      attemptsOf(state).map((attempt) => attempt.teamId),
    );
    return {
      ...projected,
      actorTeamId: teamId,
      canClaim: state.phase === 'open' && !attempted.has(teamId),
      canSelect:
        state.phase === 'answering' &&
        state.answerOwnerTeamId === teamId &&
        !attempted.has(teamId),
      attemptUsed: attempted.has(teamId),
    };
  },
  projectRoundState: (state) => state,
  presentedContentItemIds: ({ runtimeState }) =>
    puzzlesOf(runtimeState)
      .slice(0, Number(runtimeState.currentPuzzleIndex) + 1)
      .map((puzzle) => puzzle.id),
};

function projectHotspotRuntimeState(
  state: GameplayModeState,
): GameplayModeState {
  const puzzle = puzzlesOf(state)[Number(state.currentPuzzleIndex)];
  const revealed = state.phase === 'revealed' || state.phase === 'completed';
  const modifiedImage = {
    width: puzzle.modifiedImage.width,
    height: puzzle.modifiedImage.height,
    orientation: puzzle.modifiedImage.orientation,
    media: {
      type: puzzle.modifiedImage.media.type,
      assets: [{ url: puzzle.modifiedImage.media.assets[0].url }],
    },
  };
  const base: GameplayModeState = {
    phase: state.phase,
    currentPuzzleIndex: state.currentPuzzleIndex,
    puzzleCount: 3,
    prompt: puzzle.prompt,
    modifiedImageJson: JSON.stringify(modifiedImage),
    answerOwnerTeamId: state.answerOwnerTeamId ?? null,
    attemptsJson: revealed ? (state.attemptsJson ?? '[]') : '[]',
    resultsJson: revealed ? (state.resultsJson ?? '[]') : '[]',
    deadlineAt: state.deadlineAt ?? null,
  };
  if (revealed) {
    base.revealJson = JSON.stringify({
      originalImage: puzzle.originalImage,
      targetVehicleIdentity: puzzle.targetVehicleIdentity,
      targetVehicleLabel: puzzle.targetVehicleLabel,
      intruderVehicleIdentity: puzzle.intruderVehicleIdentity,
      intruderVehicleLabel: puzzle.intruderVehicleLabel,
      intruderPartIdentity: puzzle.intruderPartIdentity,
      intruderPartLabel: puzzle.intruderPartLabel,
      hotspot: puzzle.hotspot,
    });
  }
  if (state.phase === 'completed' && state.resultJson)
    base.resultJson = state.resultJson;
  return base;
}
