import {
  C4_GUARDED_V1,
  EXACT_ANSWER_MATCH,
  matchAcceptedAnswer,
  type AnswerGuard,
  type AnswerMatchPolicy,
} from '../../../common/utils/answer-matching.util';
import { isTolerantAnswerMatchingEnabled } from '../../../common/utils/answer-matching-activation';
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
import {
  assertTeamActionAuthorized,
  assignmentFor,
  assignNextTeamActionOrHold,
  clearTeamAction,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
  teamActionStandInWindow,
  teamActionClock,
} from './team-action-assignment';

/**
 * The one team action a Marhala turn has: whoever holds it elects the
 * difficulty *and* answers the question it draws. Held by the team's lobby
 * captain while connected, otherwise rotated over the team's whole roster,
 * once per team turn. Movement, scoring, the deadline and the difficulty rules
 * are untouched — this only decides *which* teammate's phone carries the turn.
 */
export const MARHALA_TURN_ACTION = 'marhala.turn';

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
  /**
   * The collision guard built when the question was drawn, only while typo
   * tolerance is switched on. Private like the answers: never projected.
   */
  answerGuard?: AnswerGuard;
}

/**
 * How this question is judged. Exact unless the server has switched tolerance
 * on for المرحلة *and* the question carries a guard — and even then the matcher
 * itself refuses a guard that is not current for these answers.
 */
function answerMatchPolicy(
  question: MarhalaRuntimeQuestion,
): AnswerMatchPolicy {
  if (!isTolerantAnswerMatchingEnabled(MARHALA_MODE_KEY)) {
    return EXACT_ANSWER_MATCH;
  }
  return {
    kind: 'guarded-tolerant',
    config: C4_GUARDED_V1,
    ...(question.answerGuard ? { guard: question.answerGuard } : {}),
  };
}

/** What one resolved turn did, kept so the board can narrate it. */
export interface MarhalaTurnResult {
  turnNumber: number;
  teamId: string;
  difficulty: MarhalaDifficulty;
  contentItemId: string;
  correct: boolean;
  resolvedBy: 'answer' | 'timeout';
  /** What the team sent. `null` when the clock ran out with nothing submitted. */
  submittedAnswer?: string | null;
  /** The canonical answer, written only onto a turn that has already resolved. */
  correctAnswer?: string;
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
 * Only the teammate holding the turn may act on it.
 *
 * Runs after the team check, so the other team still hears "not your turn".
 * A runtime started before turns were assigned has no `teamActionJson` and
 * keeps the team-wide rule it was started with. A stale `assignmentSequence` —
 * a phone that held the turn before a disconnect handed it on — is refused.
 */
function assertSubmitterHoldsTurn(
  state: GameplayModeState,
  context: GameplayPluginContext,
  payload: GameplayCommandPayload,
): void {
  if (typeof state.teamActionJson !== 'string') return;
  assertTeamActionAuthorized(parseTeamActionAssignments(state.teamActionJson), {
    ...teamActionStandInWindow(context),
    action: MARHALA_TURN_ACTION,
    teamId: marhalaActiveTeamId(state),
    participantId: context.submitterParticipantId,
    ...(typeof payload.assignmentSequence === 'number'
      ? { sequence: payload.assignmentSequence }
      : {}),
  });
}

/**
 * Keep the turn's holder in step with the turn.
 *
 * Every reducer passes through here, so no resolution path can move the turn
 * to the other team without also handing that team's phone the turn: when the
 * active team changes the next holder is assigned (captain first, then the
 * rotation, held for an absent player if the whole team is away), and when the
 * race completes the action closes.
 */
function syncTurnAssignment(
  before: GameplayModeState,
  after: GameplayModeState,
  context: GameplayPluginContext,
): GameplayModeState {
  if (typeof after.teamActionJson !== 'string') return after;
  const assignments = parseTeamActionAssignments(after.teamActionJson);
  if (after.phase === 'completed') {
    return {
      ...after,
      teamActionJson: serializeTeamActionAssignments(
        clearTeamAction(assignments, MARHALA_TURN_ACTION),
      ),
    };
  }
  const teamId = marhalaActiveTeamId(after);
  if (
    teamId === marhalaActiveTeamId(before) &&
    assignmentFor(assignments, MARHALA_TURN_ACTION)?.teamId === teamId
  ) {
    return after;
  }
  return {
    ...after,
    teamActionJson: serializeTeamActionAssignments(
      assignNextTeamActionOrHold(assignments, {
        teamId,
        action: MARHALA_TURN_ACTION,
        participants: context.eligibleParticipants ?? [],
        now: teamActionClock(context),
      }).state,
    ),
  };
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
  input: { runtimeId: string; now: Date; submittedAnswer: string },
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
      submittedAnswer: input.submittedAnswer,
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
    submittedAnswer: input.submittedAnswer,
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
  input: {
    resolvedBy: 'answer' | 'timeout';
    now: Date;
    submittedAnswer?: string | null;
  },
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
    submittedAnswer: input.submittedAnswer ?? null,
    resolvedAt: input.now.toISOString(),
  });
  return passTurn(recorded);
}

/**
 * Write a resolved turn.
 *
 * The canonical answer is attached here rather than at each call site: a turn
 * only ever exists because the question is over, so this is the first moment the
 * answer is safe to keep — and the single funnel means no future resolution path
 * can record a turn that quietly omits it.
 */
function recordTurn(
  state: GameplayModeState,
  turn: MarhalaTurnResult,
): GameplayModeState {
  const question = questionOf(state);
  const resolved: MarhalaTurnResult = {
    ...turn,
    submittedAnswer: turn.submittedAnswer ?? null,
    ...(question?.acceptedAnswers?.[0]
      ? { correctAnswer: question.acceptedAnswers[0] }
      : {}),
  };
  return {
    ...state,
    turnsJson: JSON.stringify([...turnsOf(state), resolved]),
    lastTurnJson: JSON.stringify(resolved),
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
    runtimeState: syncTurnAssignment(state, next, context),
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
    assertSubmitterHoldsTurn(state, context, command.payload);
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
    // Only the server's own draw may open a question. The command is authorised
    // for the session controller — which the host's user also is — so the
    // provenance, not the actor, is what keeps a host from supplying a question
    // with answers, and a collision guard, of its own choosing.
    if (context.serverOwnedCommand !== true) {
      reject(
        'MARHALA_QUESTION_NOT_SERVER_OWNED',
        'An المرحلة question can only be opened by the server',
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
    assertSubmitterHoldsTurn(state, context, command.payload);
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
    // The shared matcher, over the canonical normalizer Bomb and Combo grade
    // through, so two spellings of one Arabic answer are one answer everywhere.
    // Exact unless tolerance is switched on and the question's guard is current.
    const correct = matchAcceptedAnswer(
      answer,
      question.acceptedAnswers,
      answerMatchPolicy(question),
    ).matched;
    const next = correct
      ? resolveCorrect(state, {
          runtimeId: context.runtimeId,
          now,
          submittedAnswer: answer,
        })
      : resolveFailure(state, {
          resolvedBy: 'answer',
          now,
          submittedAnswer: answer,
        });
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
    // The persisted deadline has to have passed. The scheduler only fires once
    // it has, but the command is authorised for the session controller — the
    // host's user too — and a host must not be able to end the other team's
    // question early. The same proof Moving XO's expiries already require.
    if (
      typeof state.deadlineAt !== 'string' ||
      now.getTime() < Date.parse(state.deadlineAt)
    ) {
      reject(
        'MARHALA_DEADLINE_NOT_REACHED',
        'The question cannot expire before its deadline',
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

  // Availability and depletion are what the server's catalog says, not what a
  // request says: a host could otherwise withdraw the bands the other team
  // wanted, or end a race it was losing with no winner at all.
  if (
    (command.type === MARHALA_COMMANDS.refreshAvailability ||
      command.type === MARHALA_COMMANDS.exhausted) &&
    context.serverOwnedCommand !== true
  ) {
    reject(
      'MARHALA_COMMAND_NOT_SERVER_OWNED',
      'Only the server can change what المرحلة can still serve',
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

  // Who carries the turn. Public: the room should see whose phone it is on.
  const turn =
    typeof valid.teamActionJson === 'string'
      ? assignmentFor(
          parseTeamActionAssignments(valid.teamActionJson),
          MARHALA_TURN_ACTION,
        )
      : undefined;
  const assigned = turn && turn.teamId === activeTeamId ? turn : undefined;
  const withHolder: GameplayModeState = assigned
    ? { ...shared, assignedParticipantId: assigned.participantId }
    : shared;

  if (!actor) return withHolder;
  const isActiveTeam = actor.teamId != null && actor.teamId === activeTeamId;
  return {
    ...withHolder,
    actorTeamId: actor.teamId ?? null,
    isActiveTeam,
    // A runtime without assignment keeps the old team-wide rule: anyone on the
    // active team may act, so every one of them "holds" the turn.
    isAssignedActor: assigned
      ? assigned.participantId === actor.participantId
      : isActiveTeam,
    ...(assigned && assigned.participantId === actor.participantId
      ? { ownAssignmentSequence: assigned.sequence }
      : {}),
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
  currentContentItemId: (runtimeState, roundState) => {
    try {
      if (typeof runtimeState.questionJson !== 'string') return undefined;
      const question = JSON.parse(runtimeState.questionJson);
      const id = question?.contentItemId;
      return typeof id === 'string' && id ? id : undefined;
    } catch {
      return undefined;
    }
  },
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
