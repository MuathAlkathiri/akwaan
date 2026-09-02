import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
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
  MARHALA_DIFFICULTIES,
  MARHALA_FINISH_POSITION,
  MARHALA_MODE_KEY,
  MARHALA_MOVEMENT_RANGES,
  MARHALA_QUESTION_SECONDS,
  MarhalaDifficulty,
  MarhalaRuntimeMedia,
  MarhalaTileKind,
  marhalaMovementRoll,
  marhalaPossibleLandings,
  marhalaRollSeed,
  marhalaTileDestination,
  marhalaTileKind,
} from './marhala-board';

/**
 * "المرحلة" — the Video Games Signature.
 *
 * Two teams race a 16-tile level. Knowledge decides whether a team moves;
 * the **difficulty the team elects before seeing the question** decides how far it
 * could move, and the board decides whether that width is worth the risk. The
 * strategic decision is positional, which is why the phase order matters: a team
 * commits to a difficulty first and is shown a question second, never the reverse.
 *
 * Content is drawn **on demand**. The plugin never holds a deck: it moves to
 * `question-pending` when a difficulty is chosen and waits for the application
 * layer to hand it exactly one unseen item. A mechanic domain owns no repository.
 */

export type MarhalaPhase =
  | 'difficulty-choice'
  | 'question-pending'
  | 'question'
  | 'movement-reveal'
  | 'turn-transition'
  | 'completed';

export const MARHALA_COMMANDS = {
  chooseDifficulty: 'choose-marhala-difficulty',
  openQuestion: 'open-marhala-question',
  submitAnswer: 'submit-marhala-answer',
  expireQuestion: 'expire-marhala-question',
  advanceTurn: 'advance-marhala-turn',
  refreshAvailability: 'refresh-marhala-availability',
  exhausted: 'exhaust-marhala-content',
} as const;

/** One question, as the runtime holds it. Authored answers never leave the state. */
export interface MarhalaRuntimeQuestion {
  contentItemId: string;
  scopeId: string;
  difficulty: MarhalaDifficulty;
  prompt: unknown;
  media?: MarhalaRuntimeMedia;
  acceptedAnswers: string[];
}

/** What one resolved turn did, kept so the board can narrate it. */
export interface MarhalaTurnResult {
  turnNumber: number;
  teamId: string;
  difficulty: MarhalaDifficulty;
  contentItemId: string;
  correct: boolean;
  resolvedBy: 'answer' | 'timeout';
  /** Absent when the answer was wrong: no movement happened at all. */
  movement?: number;
  baseLanding?: number;
  tile?: MarhalaTileKind;
  finalLanding?: number;
  resolvedAt: string;
}

export interface MarhalaResult {
  winnerTeamId: string | null;
  /** Why the race ended: a finish, or no content left to race with. */
  endedBy: 'finish' | 'content-exhausted';
  positions: Record<string, number>;
  turnsPlayed: number;
}

function fail(message: string): never {
  throw new LiveSessionDomainError('INVALID_MARHALA_STATE', message);
}

function reject(code: string, message: string): never {
  throw new LiveSessionDomainError(code, message);
}

function parse<T>(value: unknown, label: string): T {
  if (typeof value !== 'string') return fail(`${label} is missing`);
  try {
    return JSON.parse(value) as T;
  } catch {
    return fail(`${label} is invalid`);
  }
}

function teamsOf(state: GameplayModeState): string[] {
  return parse<string[]>(state.teamIdsJson, 'Marhala teams');
}

function positionsOf(state: GameplayModeState): Record<string, number> {
  return parse<Record<string, number>>(
    state.positionsJson,
    'Marhala positions',
  );
}

function turnsOf(state: GameplayModeState): MarhalaTurnResult[] {
  return typeof state.turnsJson === 'string'
    ? parse<MarhalaTurnResult[]>(state.turnsJson, 'Marhala turns')
    : [];
}

function questionOf(
  state: GameplayModeState,
): MarhalaRuntimeQuestion | undefined {
  return typeof state.questionJson === 'string' && state.questionJson
    ? parse<MarhalaRuntimeQuestion>(state.questionJson, 'Marhala question')
    : undefined;
}

/** Which difficulties the server currently has unseen content for. */
function availabilityOf(state: GameplayModeState): MarhalaDifficulty[] {
  if (typeof state.availableDifficultiesJson !== 'string') {
    // Nothing said yet means nothing is ruled out; the draw is the authority and
    // will refuse a difficulty it cannot satisfy.
    return [...MARHALA_DIFFICULTIES];
  }
  const parsed = parse<string[]>(
    state.availableDifficultiesJson,
    'Marhala availability',
  );
  return MARHALA_DIFFICULTIES.filter((difficulty) =>
    parsed.includes(difficulty),
  );
}

export function marhalaActiveTeamId(state: GameplayModeState): string {
  const teams = teamsOf(state);
  const index = Number(state.activeTeamIndex);
  if (!Number.isInteger(index) || index < 0 || index >= teams.length) {
    fail('Marhala has no active team');
  }
  return teams[index];
}

function validateRuntime(state: GameplayModeState): GameplayModeState {
  const teams = teamsOf(state);
  const positions = positionsOf(state);
  if (teams.length !== 2 || new Set(teams).size !== 2) {
    fail('Marhala is played by exactly two distinct teams');
  }
  if (!MARHALA_PHASES.includes(String(state.phase) as MarhalaPhase)) {
    fail(`Unknown Marhala phase "${String(state.phase)}"`);
  }
  for (const teamId of teams) {
    const position = positions[teamId];
    if (
      !Number.isInteger(position) ||
      position < 1 ||
      position > MARHALA_FINISH_POSITION
    ) {
      fail(`Team ${teamId} has no valid board position`);
    }
  }
  const index = Number(state.activeTeamIndex);
  if (!Number.isInteger(index) || index < 0 || index >= teams.length) {
    fail('Marhala has no active team');
  }
  return {
    ...state,
    teamIdsJson: JSON.stringify(teams),
    positionsJson: JSON.stringify(positions),
    turnsJson: JSON.stringify(turnsOf(state)),
  };
}

const MARHALA_PHASES: MarhalaPhase[] = [
  'difficulty-choice',
  'question-pending',
  'question',
  'movement-reveal',
  'turn-transition',
  'completed',
];

function validateRound(state: GameplayModeState): GameplayModeState {
  if (!MARHALA_PHASES.includes(String(state.phase) as MarhalaPhase)) {
    fail('Marhala round carries no valid phase');
  }
  return state;
}

/** The turn number a roll and a result belong to, 1-based. */
function turnNumberOf(state: GameplayModeState): number {
  return turnsOf(state).length + 1;
}

function deadlineFor(now: Date): string {
  return new Date(
    now.getTime() + MARHALA_QUESTION_SECONDS * 1000,
  ).toISOString();
}

/**
 * End the race.
 *
 * `finish` is a real win. `content-exhausted` is not: nobody reached the finish,
 * so there is no winner to invent, and the Match is told why through the result
 * rather than being handed a fabricated victory.
 */
function complete(
  state: GameplayModeState,
  input: { endedBy: MarhalaResult['endedBy']; winnerTeamId: string | null },
): GameplayModeState {
  const positions = positionsOf(state);
  const result: MarhalaResult = {
    winnerTeamId: input.winnerTeamId,
    endedBy: input.endedBy,
    positions,
    turnsPlayed: turnsOf(state).length,
  };
  return validateRuntime({
    ...state,
    phase: 'completed',
    questionJson: null,
    deadlineAt: null,
    selectedDifficulty: null,
    resultJson: JSON.stringify(result),
  });
}

/** Move to the other team and reopen the difficulty decision. */
function passTurn(state: GameplayModeState): GameplayModeState {
  const teams = teamsOf(state);
  return validateRuntime({
    ...state,
    phase: 'difficulty-choice',
    activeTeamIndex: (Number(state.activeTeamIndex) + 1) % teams.length,
    questionJson: null,
    selectedDifficulty: null,
    deadlineAt: null,
    lastTurnJson: state.lastTurnJson ?? null,
  });
}

/**
 * Only the team on the clock may act on its own turn.
 *
 * `connected-player` gets a *participant* past the session layer; it deliberately
 * says nothing about whose turn it is, because which participant may act is the
 * mechanic's own rule. In المرحلة the whole decision belongs to the team standing
 * on the tile — electing a band for the opponent, or answering in their place,
 * would hand their turn to the other side.
 *
 * The team is resolved from the authenticated submitter the session layer supplies
 * against the live roster, never from anything the client asserts about itself, and
 * compared with the mechanic's own active team rather than the round's — Marhala
 * alternates turns in its own state, and the round-level team does not follow it.
 */
function assertSubmitterIsActiveTeam(
  state: GameplayModeState,
  context: GameplayPluginContext,
  action: string,
): void {
  const submitterTeamId = (context.eligibleParticipants ?? []).find(
    (candidate: { participantId: string; teamId?: string }) =>
      candidate.participantId === context.submitterParticipantId,
  )?.teamId;
  // Refused rather than waved through when the submitter cannot be placed on a
  // team at all: an unidentifiable actor is not evidence of permission.
  if (!submitterTeamId || submitterTeamId !== marhalaActiveTeamId(state)) {
    reject(
      'MARHALA_NOT_YOUR_TURN',
      `Only the team whose turn it is may ${action}`,
    );
  }
}

/**
 * Resolve a correct answer into movement.
 *
 * Order is load-bearing: the base landing is checked against the finish *before*
 * any tile is consulted, so passing 16 wins outright and a boost or trap on the
 * way is irrelevant. A landed tile then resolves exactly once — the board
 * configuration guarantees its destination is safe, so no chain is possible.
 */
function resolveCorrect(
  state: GameplayModeState,
  input: { runtimeId: string; now: Date },
): GameplayModeState {
  const question = questionOf(state);
  if (!question) fail('Marhala has no question to resolve');
  const teamId = marhalaActiveTeamId(state);
  const positions = positionsOf(state);
  const from = positions[teamId];
  const turnNumber = turnNumberOf(state);
  const difficulty = question.difficulty;

  const movement = marhalaMovementRoll(
    marhalaRollSeed({
      runtimeId: input.runtimeId,
      turnNumber,
      teamId,
      difficulty,
    }),
    difficulty,
  );
  const baseLanding = from + movement;

  // Reaching or passing the finish wins before any tile is looked at.
  if (baseLanding >= MARHALA_FINISH_POSITION) {
    const finished = recordTurn(state, {
      turnNumber,
      teamId,
      difficulty,
      contentItemId: question.contentItemId,
      correct: true,
      resolvedBy: 'answer',
      movement,
      baseLanding: MARHALA_FINISH_POSITION,
      tile: 'finish',
      finalLanding: MARHALA_FINISH_POSITION,
      resolvedAt: input.now.toISOString(),
    });
    return complete(
      {
        ...finished,
        positionsJson: JSON.stringify({
          ...positions,
          [teamId]: MARHALA_FINISH_POSITION,
        }),
      },
      { endedBy: 'finish', winnerTeamId: teamId },
    );
  }

  const tile = marhalaTileKind(baseLanding);
  const finalLanding = marhalaTileDestination(baseLanding);
  const moved = recordTurn(state, {
    turnNumber,
    teamId,
    difficulty,
    contentItemId: question.contentItemId,
    correct: true,
    resolvedBy: 'answer',
    movement,
    baseLanding,
    tile,
    finalLanding,
    resolvedAt: input.now.toISOString(),
  });
  const advanced = {
    ...moved,
    positionsJson: JSON.stringify({ ...positions, [teamId]: finalLanding }),
  };

  // A boost may itself carry a team to the finish.
  if (finalLanding >= MARHALA_FINISH_POSITION) {
    return complete(advanced, { endedBy: 'finish', winnerTeamId: teamId });
  }
  return passTurn(advanced);
}

/** A wrong answer or an expired clock: the question is spent, nothing moves. */
function resolveFailure(
  state: GameplayModeState,
  input: { resolvedBy: 'answer' | 'timeout'; now: Date },
): GameplayModeState {
  const question = questionOf(state);
  if (!question) fail('Marhala has no question to resolve');
  const recorded = recordTurn(state, {
    turnNumber: turnNumberOf(state),
    teamId: marhalaActiveTeamId(state),
    difficulty: question.difficulty,
    contentItemId: question.contentItemId,
    correct: false,
    resolvedBy: input.resolvedBy,
    resolvedAt: input.now.toISOString(),
  });
  return passTurn(recorded);
}

function recordTurn(
  state: GameplayModeState,
  turn: MarhalaTurnResult,
): GameplayModeState {
  return {
    ...state,
    turnsJson: JSON.stringify([...turnsOf(state), turn]),
    lastTurnJson: JSON.stringify(turn),
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
  const now = context.now ?? new Date();
  const state = validateRuntime(command.runtimeState);
  const phase = String(state.phase) as MarhalaPhase;

  const settle = (
    next: GameplayModeState,
    eventType: string,
    eventPayload: GameplayModeState,
    options?: { prepareNextPresentation?: boolean },
  ): GameplayCommandResult => ({
    runtimeState: next,
    roundState: validateRound({ phase: next.phase }),
    eventType,
    eventPayload,
    effects: [],
    ...options,
  });

  if (phase === 'completed') {
    reject('MARHALA_ALREADY_COMPLETED', 'This المرحلة race has already ended');
  }

  if (command.type === MARHALA_COMMANDS.chooseDifficulty) {
    assertSubmitterIsActiveTeam(state, context, 'elect a difficulty');
    if (phase !== 'difficulty-choice') {
      reject(
        'MARHALA_DIFFICULTY_NOT_OPEN',
        'A difficulty can only be chosen before the question is drawn',
      );
    }
    const difficulty = String(command.payload.difficulty ?? '');
    if (!(MARHALA_DIFFICULTIES as readonly string[]).includes(difficulty)) {
      reject('MARHALA_DIFFICULTY_INVALID', 'Unknown المرحلة difficulty');
    }
    // Availability is the server's, computed from what unseen content exists. A
    // team may not elect a difficulty the catalog cannot answer.
    if (!availabilityOf(state).includes(difficulty as MarhalaDifficulty)) {
      reject(
        'MARHALA_DIFFICULTY_UNAVAILABLE',
        'No unseen content remains for that difficulty',
      );
    }
    // No question yet: the application layer draws exactly one and opens it.
    return settle(
      validateRuntime({
        ...state,
        phase: 'question-pending',
        selectedDifficulty: difficulty,
        deadlineAt: null,
      }),
      'marhala-difficulty-chosen',
      { teamId: marhalaActiveTeamId(state), difficulty },
    );
  }

  if (command.type === MARHALA_COMMANDS.openQuestion) {
    if (phase !== 'question-pending') {
      reject(
        'MARHALA_QUESTION_NOT_PENDING',
        'No المرحلة question was requested',
      );
    }
    const question = command.payload.questionJson;
    if (typeof question !== 'string' || !question) {
      reject('MARHALA_QUESTION_MISSING', 'No المرحلة question was supplied');
    }
    const parsed = parse<MarhalaRuntimeQuestion>(question, 'Marhala question');
    if (parsed.difficulty !== state.selectedDifficulty) {
      // Never answer a Hard request with an easier question.
      reject(
        'MARHALA_QUESTION_DIFFICULTY_MISMATCH',
        'The supplied question does not match the chosen difficulty',
      );
    }
    return settle(
      validateRuntime({
        ...state,
        phase: 'question',
        questionJson: question,
        deadlineAt: null,
      }),
      'marhala-question-opened',
      {
        teamId: marhalaActiveTeamId(state),
        difficulty: parsed.difficulty,
        contentItemId: parsed.contentItemId,
      },
      { prepareNextPresentation: true },
    );
  }

  if (command.type === MARHALA_COMMANDS.submitAnswer) {
    assertSubmitterIsActiveTeam(state, context, 'answer this question');
    if (phase !== 'question') {
      reject('MARHALA_NO_OPEN_QUESTION', 'No المرحلة question is open');
    }
    if (context.awaitingPresentationActivation) {
      reject(
        'MARHALA_PRESENTATION_NOT_ACTIVE',
        'The question is not playable until presentation activation',
      );
    }
    const question = questionOf(state);
    if (!question) {
      reject('MARHALA_NO_OPEN_QUESTION', 'No المرحلة question is open');
    }
    const answer = String(command.payload.answer ?? '');
    // The canonical normalizer, the same one Bomb and Combo grade through, so two
    // spellings of one Arabic answer are one answer everywhere.
    const correct = question.acceptedAnswers
      .map(normalizeAnswer)
      .includes(normalizeAnswer(answer));
    const next = correct
      ? resolveCorrect(state, { runtimeId: context.runtimeId, now })
      : resolveFailure(state, { resolvedBy: 'answer', now });
    return settle(
      next,
      correct ? 'marhala-answer-correct' : 'marhala-answer-incorrect',
      { correct, teamId: marhalaActiveTeamId(state) },
    );
  }

  if (command.type === MARHALA_COMMANDS.expireQuestion) {
    if (phase !== 'question') {
      reject('MARHALA_NO_OPEN_QUESTION', 'No المرحلة question is open');
    }
    if (context.awaitingPresentationActivation) {
      reject(
        'MARHALA_PRESENTATION_NOT_ACTIVE',
        'The question cannot expire until presentation activation',
      );
    }
    // A timeout costs exactly what a wrong answer costs: the question is spent,
    // nothing moves, the turn passes.
    return settle(
      resolveFailure(state, { resolvedBy: 'timeout', now }),
      'marhala-question-expired',
      { teamId: marhalaActiveTeamId(state) },
    );
  }

  if (command.type === MARHALA_COMMANDS.refreshAvailability) {
    const raw = command.payload.availableDifficultiesJson;
    if (typeof raw !== 'string') {
      reject(
        'MARHALA_AVAILABILITY_MISSING',
        'No المرحلة availability was supplied',
      );
    }
    const available = MARHALA_DIFFICULTIES.filter((difficulty) =>
      parse<string[]>(raw, 'Marhala availability').includes(difficulty),
    );
    if (phase !== 'difficulty-choice' && phase !== 'question-pending') {
      reject(
        'MARHALA_AVAILABILITY_NOT_OPEN',
        'Availability can only change while a team is choosing',
      );
    }
    // From `question-pending` this withdraws a choice the catalog turned out not
    // to be able to serve — a concurrent Match took the last item. The team is
    // returned to the decision rather than handed an easier question, and rather
    // than being punished for a choice that was legal when they made it.
    return settle(
      validateRuntime({
        ...state,
        availableDifficultiesJson: JSON.stringify(available),
        ...(phase === 'question-pending'
          ? {
              phase: 'difficulty-choice',
              selectedDifficulty: null,
              deadlineAt: null,
            }
          : {}),
      }),
      'marhala-availability-refreshed',
      {
        available: JSON.stringify(available),
        withdrew: phase === 'question-pending',
      },
    );
  }

  if (command.type === MARHALA_COMMANDS.exhausted) {
    // Nobody reached the finish and no difficulty can be served. Ending with no
    // winner is the honest outcome; inventing one would award a race nobody won.
    return settle(
      complete(state, { endedBy: 'content-exhausted', winnerTeamId: null }),
      'marhala-content-exhausted',
      { turnsPlayed: turnsOf(state).length },
    );
  }

  reject(
    'MARHALA_UNKNOWN_COMMAND',
    `Unknown المرحلة command "${command.type}"`,
  );
}

/**
 * What everyone may see.
 *
 * The board is public: positions, whose turn it is, which difficulties are legal,
 * the prompt once it is open, and what the last turn did. The authored answers are
 * never projected to anyone.
 */
function publicState(
  state: GameplayModeState,
  actor?: InteractionActorProjection,
): GameplayModeState {
  const valid = validateRuntime(state);
  const teams = teamsOf(valid);
  const activeTeamId = marhalaActiveTeamId(valid);
  const question = questionOf(valid);
  const difficulty = valid.selectedDifficulty;

  const shared: GameplayModeState = {
    phase: valid.phase,
    activeTeamId,
    teamIdsJson: JSON.stringify(teams),
    positionsJson: valid.positionsJson,
    turnNumber: turnsOf(valid).length + 1,
    availableDifficultiesJson: JSON.stringify(availabilityOf(valid)),
    movementRangesJson: JSON.stringify(MARHALA_MOVEMENT_RANGES),
    ...(difficulty ? { selectedDifficulty: difficulty } : {}),
    // The landings the chosen difficulty could produce, so the board can show the
    // risk before the roll — never which value will actually come up.
    ...(difficulty
      ? {
          possibleLandingsJson: JSON.stringify(
            marhalaPossibleLandings(
              positionsOf(valid)[activeTeamId],
              difficulty as MarhalaDifficulty,
            ),
          ),
        }
      : {}),
    ...(valid.deadlineAt ? { deadlineAt: valid.deadlineAt } : {}),
    ...(valid.lastTurnJson ? { lastTurnJson: valid.lastTurnJson } : {}),
    ...(valid.resultJson ? { resultJson: valid.resultJson } : {}),
    // The prompt and media, never the accepted answers or private authoring metadata.
    ...(question
      ? {
          questionPrompt: JSON.stringify(question.prompt),
          questionScopeId: question.scopeId,
          questionContentItemId: question.contentItemId,
          ...(question.media && question.media.type !== 'none'
            ? {
                questionMediaJson: JSON.stringify({
                  type: question.media.type,
                  url: question.media.url,
                  ...(question.media.altText
                    ? { altText: question.media.altText }
                    : {}),
                }),
              }
            : {}),
        }
      : {}),
  };

  if (!actor) return shared;
  return {
    ...shared,
    actorTeamId: actor.teamId ?? null,
    isActiveTeam: actor.teamId != null && actor.teamId === activeTeamId,
  };
}

/** The result the launcher reports to the Match, when the race produced one. */
export function marhalaResult(
  state: GameplayModeState,
): MarhalaResult | undefined {
  return typeof state.resultJson === 'string' && state.resultJson
    ? (JSON.parse(state.resultJson) as MarhalaResult)
    : undefined;
}

export const MARHALA_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: MARHALA_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  /**
   * The clock belongs to the question, not to the session, and it is the same for
   * every difficulty — the risk a team elects is the movement range, never the time.
   */
  deadline: {
    source: 'runtime-state',
    commandType: MARHALA_COMMANDS.expireQuestion,
    activePhases: ['question'],
  },
  createInitialRuntimeState: (context) =>
    validateRuntime(context.initialState ?? {}),
  createInitialRoundState: (context) =>
    validateRound({
      phase: String(
        validateRuntime(context.runtimeState ?? {}).phase,
      ) as MarhalaPhase,
    }),
  validateRuntimeState: validateRuntime,
  validateRoundState: validateRound,
  command(type) {
    if (
      type === MARHALA_COMMANDS.chooseDifficulty ||
      type === MARHALA_COMMANDS.submitAnswer
    ) {
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: (payload) => payload,
      };
    }
    if (
      type === MARHALA_COMMANDS.openQuestion ||
      type === MARHALA_COMMANDS.expireQuestion ||
      type === MARHALA_COMMANDS.refreshAvailability ||
      type === MARHALA_COMMANDS.exhausted
    ) {
      // Server-owned: content arrives from the application layer, and expiry and
      // exhaustion are the server's conclusions rather than a player's action.
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: (payload) => payload,
      };
    }
    return undefined;
  },
  handleCommand: handle,
  requiredPresentationSurfaces: ({ runtimeState }) =>
    runtimeState.phase === 'question' ? [{ capability: 'shared' }] : undefined,
  activatePresentation: (state, now) => {
    if (state.phase !== 'question' || state.deadlineAt) return state;
    return validateRuntime({ ...state, deadlineAt: deadlineFor(now) });
  },
  /**
   * Only the questions actually put in front of a team.
   *
   * Marhala draws one at a time, so this is naturally incremental: every recorded
   * turn was a presented question, plus the one currently open. Nothing is ever
   * planned ahead, so nothing unseen can be burned.
   */
  presentedContentItemIds({ runtimeState }) {
    try {
      const presented = turnsOf(runtimeState).map((turn) => turn.contentItemId);
      const open = questionOf(runtimeState);
      if (open) presented.push(open.contentItemId);
      return [...new Set(presented.filter(Boolean))];
    } catch {
      return [];
    }
  },
  projectRuntimeState: (state) => publicState(state),
  projectRuntimeStateForActor: (state, actor) => publicState(state, actor),
  projectRoundState: validateRound,
};
