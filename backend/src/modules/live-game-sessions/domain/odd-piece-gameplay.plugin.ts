import {
  GameplayCommandPayload,
  GameplayCommandResult,
  GameplayModePlugin,
  GameplayModeState,
  GameplayPluginContext,
} from './gameplay-mode.plugin';
import { LiveSessionDomainError } from './live-session.errors';

export const ODD_PIECE_MODE_KEY = 'odd-piece';
export const ODD_PIECE_PUZZLE_COUNT = 3;
/** Implementation/playtest value; product may tune it without changing the mechanic. */
export const ODD_PIECE_DEFAULT_OPEN_SECONDS = 30;

export interface OddPiecePiece {
  id: string;
  imageUrl: string;
  altText?: string;
  vehicleIdentity: string;
  vehicleLabel: string;
}
export interface OddPiecePuzzle {
  id: string;
  prompt: string;
  pieces: OddPiecePiece[];
  targetVehicleIdentity: string;
  targetVehicleLabel: string;
  targetReveal: { imageUrl: string; altText?: string };
}
export interface OddPieceResult {
  puzzleIndex: number;
  contentItemId: string;
  winnerTeamId: string | null;
  attempts: Array<{ teamId: string; pieceId: string; correct: boolean }>;
}
export interface OddPieceChallengeResult {
  winnerTeamId: string | null;
  tie: boolean;
  points: Record<string, number>;
}

const parse = <T>(value: unknown, label: string): T => {
  if (typeof value !== 'string')
    throw new LiveSessionDomainError(
      'INVALID_ODD_PIECE_STATE',
      `${label} is missing`,
    );
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new LiveSessionDomainError(
      'INVALID_ODD_PIECE_STATE',
      `${label} is invalid`,
    );
  }
};
const puzzlesOf = (s: GameplayModeState) =>
  parse<OddPiecePuzzle[]>(s.puzzlesJson, 'puzzles');
const teamsOf = (s: GameplayModeState) =>
  parse<string[]>(s.teamIdsJson, 'teams');
const attemptsOf = (s: GameplayModeState) =>
  parse<Array<{ teamId: string; pieceId: string; correct: boolean }>>(
    s.attemptsJson ?? '[]',
    'attempts',
  );
const resultsOf = (s: GameplayModeState) =>
  parse<OddPieceResult[]>(s.resultsJson ?? '[]', 'results');

export function validateOddPiecePuzzle(puzzle: OddPiecePuzzle): OddPiecePuzzle {
  if (
    !puzzle.id ||
    !puzzle.targetVehicleIdentity ||
    !puzzle.targetVehicleLabel ||
    !puzzle.targetReveal?.imageUrl ||
    puzzle.pieces.length !== 4 ||
    new Set(puzzle.pieces.map((p) => p.id)).size !== 4 ||
    puzzle.pieces.some(
      (p) => !p.id || !p.imageUrl || !p.vehicleIdentity || !p.vehicleLabel,
    )
  ) {
    throw new LiveSessionDomainError(
      'ODD_PIECE_CONTENT_INVALID',
      'Odd Piece needs four uniquely identified visual pieces',
    );
  }
  const counts = new Map<string, number>();
  for (const piece of puzzle.pieces)
    counts.set(
      piece.vehicleIdentity,
      (counts.get(piece.vehicleIdentity) ?? 0) + 1,
    );
  if ([...counts.values()].sort().join(',') !== '1,3')
    throw new LiveSessionDomainError(
      'ODD_PIECE_CONTENT_INVALID',
      'Odd Piece requires an exact three-plus-one vehicle split',
    );
  if (counts.get(puzzle.targetVehicleIdentity) !== 3)
    throw new LiveSessionDomainError(
      'ODD_PIECE_CONTENT_INVALID',
      'Odd Piece target identity must own the three matching visuals',
    );
  return puzzle;
}
const oddId = (puzzle: OddPiecePuzzle) => {
  const counts = new Map<string, number>();
  for (const piece of puzzle.pieces)
    counts.set(
      piece.vehicleIdentity,
      (counts.get(piece.vehicleIdentity) ?? 0) + 1,
    );
  return puzzle.pieces.find((piece) => counts.get(piece.vehicleIdentity) === 1)!
    .id;
};
const currentPuzzle = (s: GameplayModeState) =>
  puzzlesOf(s)[Number(s.currentPuzzleIndex)];
const submitterTeam = (context: GameplayPluginContext, teams: string[]) => {
  const participant = context.eligibleParticipants?.find(
    (p) => p.participantId === context.submitterParticipantId,
  );
  const teamId = participant?.teamId;
  if (!participant || !teamId || !teams.includes(teamId))
    throw new LiveSessionDomainError(
      'ODD_PIECE_FORBIDDEN',
      'Only an eligible competing player may act',
    );
  return teamId;
};
const validatePayload = (payload: GameplayCommandPayload) => {
  if (
    Object.keys(payload).length !== 1 ||
    typeof payload.pieceId !== 'string' ||
    !payload.pieceId
  )
    throw new LiveSessionDomainError(
      'INVALID_ODD_PIECE_SUBMISSION',
      'Submit one visible piece id',
    );
  return payload;
};
const noPayload = (payload: GameplayCommandPayload) => {
  if (Object.keys(payload).length)
    throw new LiveSessionDomainError(
      'INVALID_ODD_PIECE_COMMAND',
      'This command accepts no payload',
    );
  return {};
};
const validate = (state: GameplayModeState) => {
  const puzzles = puzzlesOf(state);
  const teams = teamsOf(state);
  if (
    puzzles.length !== 3 ||
    new Set(puzzles.map((p) => p.id)).size !== 3 ||
    teams.length !== 2 ||
    new Set(teams).size !== 2 ||
    !Number.isFinite(Number(state.openSeconds)) ||
    Number(state.openSeconds) <= 0 ||
    !['preparing', 'open', 'selecting', 'revealed', 'completed'].includes(
      String(state.phase),
    )
  )
    throw new LiveSessionDomainError(
      'INVALID_ODD_PIECE_STATE',
      'Odd Piece needs three puzzles and two teams',
    );
  puzzles.forEach(validateOddPiecePuzzle);
  return state;
};
const challengeResult = (state: GameplayModeState): OddPieceChallengeResult => {
  const teams = teamsOf(state);
  const points = Object.fromEntries(teams.map((teamId) => [teamId, 0]));
  for (const entry of resultsOf(state)) {
    if (entry.winnerTeamId && entry.winnerTeamId in points)
      points[entry.winnerTeamId] += 1;
  }
  const [first, second] = teams;
  const tie = points[first] === points[second];
  return {
    winnerTeamId: tie ? null : points[first] > points[second] ? first : second,
    tie,
    points,
  };
};
const result = (
  runtimeState: GameplayModeState,
  eventType: string,
  effects: GameplayCommandResult['effects'] = [],
  prepareNextPresentation = false,
): GameplayCommandResult => ({
  runtimeState: validate(runtimeState),
  roundState: {
    phase: runtimeState.phase,
    puzzleIndex: runtimeState.currentPuzzleIndex,
  },
  eventType,
  eventPayload: {},
  effects,
  prepareNextPresentation,
});

const projectOddPieceRuntimeState = (state: GameplayModeState) => {
  const puzzle = currentPuzzle(state);
  const revealed = state.phase === 'revealed' || state.phase === 'completed';
  const oddPiece = puzzle.pieces.find((piece) => piece.id === oddId(puzzle));
  return {
    phase: state.phase,
    currentPuzzleIndex: state.currentPuzzleIndex,
    puzzleCount: 3,
    prompt: puzzle.prompt,
    piecesJson: JSON.stringify(
      puzzle.pieces.map(({ id, imageUrl, altText }) => ({
        id,
        imageUrl,
        ...(altText ? { altText } : {}),
      })),
    ),
    answerOwnerTeamId: state.answerOwnerTeamId ?? null,
    failedTeamIdsJson: state.failedTeamIdsJson ?? '[]',
    resultsJson: revealed ? (state.resultsJson ?? '[]') : '[]',
    deadlineAt: state.deadlineAt ?? null,
    ...(state.phase === 'completed' && state.resultJson
      ? { resultJson: state.resultJson }
      : {}),
    ...(revealed
      ? {
          revealJson: JSON.stringify({
            oddPieceId: oddId(puzzle),
            targetVehicleLabel: puzzle.targetVehicleLabel,
            intruderVehicleLabel: oddPiece?.vehicleLabel ?? '',
            targetReveal: puzzle.targetReveal,
          }),
        }
      : {}),
  };
};

export const ODD_PIECE_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: ODD_PIECE_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  deadline: {
    source: 'runtime-state',
    commandType: 'expire-odd-piece',
    activePhases: ['open'],
    requiresPresentationActivation: true,
  },
  // Only the shared board renders the four presentation-bearing images. Phones
  // receive numbered controls, so an idle handset must not stall the room.
  requiredPresentationSurfaces: () => [{ capability: 'shared' }],
  createInitialRuntimeState: (c) => validate(c.initialState ?? {}),
  createInitialRoundState: (c) => ({
    phase: c.initialState?.phase ?? 'preparing',
    puzzleIndex: c.initialState?.currentPuzzleIndex ?? 0,
  }),
  validateRuntimeState: validate,
  validateRoundState: (s) => s,
  command: (type) => {
    if (type === 'claim-odd-piece')
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    if (type === 'submit-odd-piece')
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload,
      };
    if (type === 'advance-odd-piece')
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    if (type === 'expire-odd-piece')
      return {
        type,
        authorization: 'internal',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    return undefined;
  },
  activatePresentation: (state, now) =>
    validate({
      ...state,
      phase: 'open',
      deadlineAt: new Date(
        now.getTime() + Number(state.openSeconds) * 1000,
      ).toISOString(),
      answerOwnerTeamId: null,
    }),
  handleCommand: (context, command) => {
    const state = validate(command.runtimeState);
    const teams = teamsOf(state);
    if (command.type === 'claim-odd-piece') {
      const teamId = submitterTeam(context, teams);
      if (state.phase !== 'open')
        throw new LiveSessionDomainError(
          'ODD_PIECE_CLAIM_CLOSED',
          'The claim race is closed',
        );
      const failed = new Set(
        parse<string[]>(state.failedTeamIdsJson ?? '[]', 'failed teams'),
      );
      if (failed.has(teamId))
        throw new LiveSessionDomainError(
          'ODD_PIECE_ATTEMPT_USED',
          'This team already used its attempt',
        );
      return result(
        {
          ...state,
          phase: 'selecting',
          answerOwnerTeamId: teamId,
          deadlineAt: null,
        },
        'odd-piece-claimed',
      );
    }
    if (command.type === 'submit-odd-piece') {
      const teamId = submitterTeam(context, teams);
      if (state.phase !== 'selecting' || state.answerOwnerTeamId !== teamId)
        throw new LiveSessionDomainError(
          'ODD_PIECE_SELECTION_FORBIDDEN',
          'Only the answer-owning team may select',
        );
      const puzzle = currentPuzzle(state);
      const pieceId = String(command.payload.pieceId);
      if (!puzzle.pieces.some((p) => p.id === pieceId))
        throw new LiveSessionDomainError(
          'ODD_PIECE_UNKNOWN_PIECE',
          'That piece is not in this puzzle',
        );
      const correct = pieceId === oddId(puzzle);
      const attempts = [...attemptsOf(state), { teamId, pieceId, correct }];
      if (correct || attempts.length === 2) {
        const itemResult: OddPieceResult = {
          puzzleIndex: Number(state.currentPuzzleIndex),
          contentItemId: puzzle.id,
          winnerTeamId: correct ? teamId : null,
          attempts,
        };
        const results = [...resultsOf(state), itemResult];
        return result(
          {
            ...state,
            phase: 'revealed',
            attemptsJson: JSON.stringify(attempts),
            resultsJson: JSON.stringify(results),
            answerOwnerTeamId: null,
            deadlineAt: null,
          },
          'odd-piece-resolved',
        );
      }
      const failed = [
        ...new Set([
          ...parse<string[]>(state.failedTeamIdsJson ?? '[]', 'failed teams'),
          teamId,
        ]),
      ];
      return result(
        {
          ...state,
          phase: 'selecting',
          attemptsJson: JSON.stringify(attempts),
          failedTeamIdsJson: JSON.stringify(failed),
          // The second chance is a direct handoff, not another claim race.
          answerOwnerTeamId: teams.find((candidate) => candidate !== teamId)!,
          deadlineAt: null,
        },
        'odd-piece-opponent-opened',
      );
    }
    if (command.type === 'advance-odd-piece') {
      if (state.phase !== 'revealed')
        throw new LiveSessionDomainError(
          'ODD_PIECE_NOT_REVEALED',
          'Resolve this puzzle first',
        );
      const next = Number(state.currentPuzzleIndex) + 1;
      if (next >= 3)
        return result(
          {
            ...state,
            phase: 'completed',
            deadlineAt: null,
            resultJson: JSON.stringify(challengeResult(state)),
          },
          'odd-piece-completed',
        );
      return result(
        {
          ...state,
          phase: 'preparing',
          currentPuzzleIndex: next,
          attemptsJson: '[]',
          failedTeamIdsJson: '[]',
          answerOwnerTeamId: null,
          deadlineAt: null,
        },
        'odd-piece-puzzle-prepared',
        [],
        true,
      );
    }
    if (command.type === 'expire-odd-piece') {
      if (state.phase !== 'open')
        throw new LiveSessionDomainError(
          'ODD_PIECE_NOT_EXPIRED',
          'The puzzle is not open',
        );
      const itemResult: OddPieceResult = {
        puzzleIndex: Number(state.currentPuzzleIndex),
        contentItemId: currentPuzzle(state).id,
        winnerTeamId: null,
        attempts: attemptsOf(state),
      };
      return result(
        {
          ...state,
          phase: 'revealed',
          resultsJson: JSON.stringify([...resultsOf(state), itemResult]),
          deadlineAt: null,
        },
        'odd-piece-expired',
      );
    }
    throw new LiveSessionDomainError(
      'ODD_PIECE_COMMAND_UNKNOWN',
      'Unsupported Odd Piece command',
    );
  },
  projectRuntimeState: projectOddPieceRuntimeState,
  projectRuntimeStateForActor: (state, actor) => {
    const teamId = actor.teamId;
    const projected = projectOddPieceRuntimeState(state);
    const failed = new Set(
      parse<string[]>(state.failedTeamIdsJson ?? '[]', 'failed teams'),
    );
    return {
      ...projected,
      ...(teamId
        ? {
            // Phones are numbered input surfaces, not presentation-bearing media
            // surfaces. Keep stable grading-safe ids but leave all image loading
            // to the shared/controller board that participates in Fair-Start.
            piecesJson: JSON.stringify(
              currentPuzzle(state).pieces.map(({ id }) => ({ id })),
            ),
            actorTeamId: teamId,
            canClaim: state.phase === 'open' && !failed.has(teamId),
            canSelect:
              state.phase === 'selecting' && state.answerOwnerTeamId === teamId,
            attemptUsed: failed.has(teamId),
          }
        : {}),
    };
  },
  projectRoundState: (s) => s,
  presentedContentItemIds: ({ runtimeState }) =>
    puzzlesOf(runtimeState)
      .slice(0, Number(runtimeState.currentPuzzleIndex) + 1)
      .map((p) => p.id),
};
