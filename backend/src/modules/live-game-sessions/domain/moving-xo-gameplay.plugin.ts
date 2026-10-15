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
  MOVING_XO_CELL_COUNT,
  MOVING_XO_MODE_KEY,
  MovingXoBoard,
  applyPlacement,
  createMovingXoBoard,
  expiringCellFor,
  legalTargetsFor,
  placementIssue,
  resolveAfterMove,
} from './moving-xo-board';

/**
 * "Moving XO" — the Puzzles Signature runtime.
 *
 * The board rules live in `moving-xo-board.ts`; this owns the runtime: whose
 * turn it is, which puzzle is on screen, whether a move has been earned but not
 * yet spent, and what each actor is allowed to see. Product contract: §23.11.
 *
 * **There is no deck.** §23.11 fixes no question count: the challenge consumes as
 * many eligible items as the game actually requires, one at a time. So the
 * mechanic holds exactly one current question and, between turns, an explicit
 * `question-pending` phase that says in committed state that the server owes this
 * challenge a fresh puzzle. That phase is the whole content contract — a durable
 * obligation the application layer discharges, in the same shape "المرحلة"
 * already uses. A mechanic domain owns no repository and never prefetches.
 *
 * Four phases carry the loop. `question-pending` owes a puzzle and runs no clock;
 * `answering` is the 15-second question window, anchored at presentation
 * activation rather than at commit so a slow surface never burns a team's time;
 * `placement` is the 10-second window in which the active team spends exactly one
 * earned move; `completed` is terminal.
 *
 * The runtime is integrated with its shared-screen and phone surfaces and the
 * canonical Puzzles Scope taxonomy. Deployment and Production provisioning
 * remain separate operational milestones.
 */

export const MOVING_XO_QUESTION_SECONDS = 15;
export const MOVING_XO_PLACEMENT_SECONDS = 10;

export const MOVING_XO_COMMANDS = {
  answer: 'submit-moving-xo-answer',
  place: 'place-moving-xo-mark',
  expireQuestion: 'expire-moving-xo-question',
  expirePlacement: 'expire-moving-xo-placement',
  /** Server-owned: the application layer hands over the puzzle it drew. */
  openQuestion: 'open-moving-xo-question',
  /** Server-owned: nothing eligible remains, so the challenge ends honestly. */
  exhausted: 'exhaust-moving-xo-content',
} as const;

export type MovingXoPhase =
  'question-pending' | 'answering' | 'placement' | 'completed';

/** The answer modes §23.11 admits in V1. `closest` is excluded by construction. */
export const MOVING_XO_ANSWER_MODES = ['match', 'multiple_choice'] as const;
export type MovingXoAnswerMode = (typeof MOVING_XO_ANSWER_MODES)[number];

/**
 * The item the active team is answering.
 *
 * Carries what a surface must render — prompt, media, the choice list — and the
 * answer truth, which never leaves the server: `acceptedAnswers` and
 * `correctOptionId` are absent from every projection.
 */
export interface MovingXoQuestion {
  contentItemId: string;
  scopeId: string;
  answerMode: MovingXoAnswerMode;
  prompt: unknown;
  media?: unknown;
  /** `multiple_choice` only. Choice ids and labels, never which one is right. */
  options?: ReadonlyArray<Record<string, unknown>>;
  /** `match` items. Never projected. */
  acceptedAnswers?: string[];
  /** `multiple_choice` items. Never projected. */
  correctOptionId?: string;
}

/**
 * Why a Moving XO challenge ended.
 *
 * `content-exhausted` is deliberately its own terminal and deliberately has no
 * winner: the account has seen every eligible Puzzles item this occurrence can
 * offer, which is not a victory for anybody. The runtime stays machine-readable
 * and carries no presentation copy; the approved Arabic message is owned once
 * by the frontend presentation layer and reused on screen, phone and recap.
 */
export type MovingXoOutcome = 'win' | 'draw' | 'content-exhausted';

export interface MovingXoResult {
  winnerTeamId: string | null;
  endedBy: MovingXoOutcome;
  successfulMoveCount: number;
  questionsPresented: number;
  decisivePhase: boolean;
}

interface MovingXoRuntime {
  phase: MovingXoPhase;
  activeTeamId: string;
  teamIds: string[];
  board: MovingXoBoard;
  successfulMoveCount: number;
  decisivePhase: boolean;
  /** A correct answer is owed exactly one placement; spent on commit. */
  pendingMove: boolean;
  question: MovingXoQuestion | null;
  /**
   * Every item authoritatively opened in front of a team, oldest first.
   *
   * The mechanic's own record of what it has shown — the only one that exists,
   * because an on-demand challenge has no launch binding to compare against. It
   * is also what stops a repeat: an item already here can never be opened again.
   */
  presentedContentItemIds: string[];
  deadlineAt: string | null;
  winningTeamId: string | null;
  /** Set only at a terminal transition, so a draw is distinguishable from "running". */
  outcome: MovingXoOutcome | null;
}

const fail = (code: string, message: string): never => {
  throw new LiveSessionDomainError(code, message);
};

function runtimeOf(state: GameplayModeState): MovingXoRuntime {
  return state as unknown as MovingXoRuntime;
}

function asState(runtime: MovingXoRuntime): GameplayModeState {
  return runtime as unknown as GameplayModeState;
}

const PHASES: readonly MovingXoPhase[] = [
  'question-pending',
  'answering',
  'placement',
  'completed',
];

function validateRuntime(state: GameplayModeState): GameplayModeState {
  const runtime = runtimeOf(state ?? ({} as GameplayModeState));
  const teamIds = Array.isArray(runtime.teamIds) ? runtime.teamIds : [];
  if (teamIds.length !== 2 || new Set(teamIds).size !== 2) {
    fail(
      'INVALID_MOVING_XO_RUNTIME_STATE',
      'Moving XO needs exactly two teams',
    );
  }
  if (!teamIds.includes(runtime.activeTeamId)) {
    fail('INVALID_MOVING_XO_RUNTIME_STATE', 'Active team is not in the match');
  }
  const board = runtime.board;
  if (
    !board ||
    !Array.isArray(board.cells) ||
    board.cells.length !== MOVING_XO_CELL_COUNT
  ) {
    fail(
      'INVALID_MOVING_XO_RUNTIME_STATE',
      'Moving XO needs a nine-cell board',
    );
  }
  if (!PHASES.includes(runtime.phase)) {
    fail('INVALID_MOVING_XO_RUNTIME_STATE', `Unknown phase ${runtime.phase}`);
  }
  if (!Array.isArray(runtime.presentedContentItemIds)) {
    fail(
      'INVALID_MOVING_XO_RUNTIME_STATE',
      'Moving XO must record what it has presented',
    );
  }
  // A pending move outside the placement phase would be a move nobody can spend.
  if (runtime.pendingMove && runtime.phase !== 'placement') {
    fail(
      'INVALID_MOVING_XO_RUNTIME_STATE',
      'An earned move may only exist during placement',
    );
  }
  // A question may only exist while one is actually being played. Carrying one
  // into `question-pending` would make the obligation invisible, and carrying one
  // past the end would leave answer truth in a finished runtime.
  if (runtime.question && runtime.phase !== 'answering') {
    fail(
      'INVALID_MOVING_XO_RUNTIME_STATE',
      'A puzzle may only be held during the answering phase',
    );
  }
  if (runtime.outcome && runtime.phase !== 'completed') {
    fail(
      'INVALID_MOVING_XO_RUNTIME_STATE',
      'An outcome may only exist on a completed challenge',
    );
  }
  return asState(runtime);
}

function opponentOf(runtime: MovingXoRuntime): string {
  return (
    runtime.teamIds.find((teamId) => teamId !== runtime.activeTeamId) ??
    runtime.activeTeamId
  );
}

function deadline(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

/**
 * Hand the turn to the opponent and owe the next puzzle.
 *
 * The one place a turn changes, so a wrong answer, a question timeout, a
 * forfeited placement and a committed move cannot drift apart. The next phase is
 * `question-pending`, never `answering`: a clock may not start before the puzzle
 * it is timing exists, and the pending phase is what the supplier converges on.
 */
function handoff(
  runtime: MovingXoRuntime,
  reason: string,
): { runtime: MovingXoRuntime; effects: GameplayCommandResult['effects'] } {
  const nextTeamId = opponentOf(runtime);
  return {
    runtime: {
      ...runtime,
      phase: 'question-pending',
      activeTeamId: nextTeamId,
      pendingMove: false,
      question: null,
      deadlineAt: null,
    },
    effects: [{ type: 'switch-active-team', teamId: nextTeamId, reason }],
  };
}

function assertActiveTeam(
  context: GameplayPluginContext,
  runtime: MovingXoRuntime,
): void {
  if (context.activeTeamId && context.activeTeamId !== runtime.activeTeamId) {
    fail(
      'MOVING_XO_NOT_ACTIVE_TEAM',
      'Only the active team may act in Moving XO',
    );
  }
}

function assertRunning(runtime: MovingXoRuntime): void {
  if (runtime.phase === 'completed') {
    fail('MOVING_XO_ALREADY_COMPLETE', 'This Moving XO challenge has ended');
  }
}

/**
 * Whether this submission is correct, in the item's own answer contract.
 *
 * Two modes, each resolved the way the rest of the codebase already resolves it:
 * `match` through the single canonical Arabic normalizer, `multiple_choice` by
 * option id exactly as اقرأ خصمك does. No second validator and no
 * mechanic-local normalizer — that is how two mechanics start disagreeing about
 * whether the same answer was right.
 *
 * `closest` cannot reach here: it is absent from
 * `ANSWER_MODE_COMPATIBLE_ITEM_MODES[MOVING_XO]`, so selection never offers such
 * an item, and an unknown mode is refused rather than guessed.
 */
function isCorrect(
  question: MovingXoQuestion,
  payload: GameplayCommandPayload,
): boolean {
  if (question.answerMode === 'multiple_choice') {
    const optionId = payload.optionId;
    return (
      typeof optionId === 'string' &&
      optionId.length > 0 &&
      optionId === question.correctOptionId
    );
  }
  if (question.answerMode === 'match') {
    const normalized = normalizeAnswer(String(payload.answer ?? ''));
    return (question.acceptedAnswers ?? [])
      .map(normalizeAnswer)
      .includes(normalized);
  }
  return fail(
    'MOVING_XO_UNSUPPORTED_ANSWER_MODE',
    `Moving XO V1 accepts match and multiple_choice only, not ${String(question.answerMode)}`,
  );
}

/**
 * The puzzle the server drew, as the runtime will hold it.
 *
 * Parsed from the command rather than trusted: the supplier is server code, but
 * the reducer is the layer that has to stay true under replay, so every invariant
 * §23.11 fixes is re-checked here.
 */
function parseQuestion(
  runtime: MovingXoRuntime,
  payload: GameplayCommandPayload,
): MovingXoQuestion {
  const raw = payload.questionJson;
  if (typeof raw !== 'string' || !raw) {
    fail('MOVING_XO_QUESTION_MISSING', 'No Moving XO puzzle was supplied');
  }
  let parsed: MovingXoQuestion;
  try {
    parsed = JSON.parse(String(raw)) as MovingXoQuestion;
  } catch {
    return fail('MOVING_XO_QUESTION_INVALID', 'The supplied puzzle is invalid');
  }
  if (!parsed?.contentItemId) {
    fail('MOVING_XO_QUESTION_INVALID', 'The supplied puzzle has no item');
  }
  if (!MOVING_XO_ANSWER_MODES.includes(parsed.answerMode)) {
    fail(
      'MOVING_XO_UNSUPPORTED_ANSWER_MODE',
      `Moving XO V1 accepts match and multiple_choice only, not ${String(parsed.answerMode)}`,
    );
  }
  // Never silently repeat. An item this challenge already showed is refused here
  // rather than deduplicated downstream, so a retried or late draw cannot put the
  // same puzzle in front of the other team.
  if (runtime.presentedContentItemIds.includes(parsed.contentItemId)) {
    fail(
      'MOVING_XO_QUESTION_ALREADY_PRESENTED',
      'This Moving XO challenge has already presented that item',
    );
  }
  return parsed;
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
  const runtime = runtimeOf(command.runtimeState);
  const now = context.now ?? new Date();
  const base = {
    roundState: command.roundState,
    effects: [] as GameplayCommandResult['effects'],
  };

  if (command.type === MOVING_XO_COMMANDS.openQuestion) {
    assertRunning(runtime);
    if (runtime.phase !== 'question-pending') {
      fail(
        'MOVING_XO_QUESTION_NOT_PENDING',
        'No Moving XO puzzle was requested',
      );
    }
    const question = parseQuestion(runtime, command.payload);
    // The clock is not started here. `prepareNextPresentation` opens a fresh
    // Fair-Start checkpoint and `activatePresentation` anchors the 15 seconds to
    // the moment a surface is actually showing the puzzle.
    return {
      ...base,
      runtimeState: validateRuntime(
        asState({
          ...runtime,
          phase: 'answering',
          question,
          presentedContentItemIds: [
            ...runtime.presentedContentItemIds,
            question.contentItemId,
          ],
          deadlineAt: null,
        }),
      ),
      eventType: 'moving_xo_question_opened',
      eventPayload: {
        teamId: runtime.activeTeamId,
        contentItemId: question.contentItemId,
      } as unknown as GameplayModeState,
      prepareNextPresentation: true,
    };
  }

  if (command.type === MOVING_XO_COMMANDS.exhausted) {
    assertRunning(runtime);
    // Nothing eligible remains. Ending with no winner is the honest outcome;
    // inventing one would award a game nobody won, and replaying an item the
    // account has already seen would be worse.
    return {
      ...base,
      runtimeState: validateRuntime(
        asState({
          ...runtime,
          phase: 'completed',
          pendingMove: false,
          question: null,
          deadlineAt: null,
          outcome: 'content-exhausted',
          winningTeamId: null,
        }),
      ),
      eventType: 'moving_xo_content_exhausted',
      eventPayload: {
        questionsPresented: runtime.presentedContentItemIds.length,
      } as unknown as GameplayModeState,
    };
  }

  if (command.type === MOVING_XO_COMMANDS.answer) {
    assertRunning(runtime);
    assertActiveTeam(context, runtime);
    if (runtime.phase !== 'answering') {
      fail(
        'MOVING_XO_NOT_ANSWERING',
        'No puzzle is open; a placement may already be owed',
      );
    }
    // Fair-Start: a puzzle whose surfaces are still catching up is not playable,
    // so an answer submitted into the awaiting window is refused rather than
    // graded against a clock that has not started.
    if (context.awaitingPresentationActivation) {
      fail(
        'MOVING_XO_PRESENTATION_NOT_ACTIVE',
        'The puzzle is not playable until presentation activation',
      );
    }

    const question = runtime.question;
    if (!question) {
      return fail('MOVING_XO_NO_QUESTION', 'No puzzle is currently presented');
    }
    if (isCorrect(question, command.payload)) {
      // Correct earns the move; the board does not move until it is placed, and
      // the count does not rise until the placement commits. The puzzle leaves
      // state here: it has been answered, and keeping it would keep its answer.
      return {
        ...base,
        runtimeState: validateRuntime(
          asState({
            ...runtime,
            phase: 'placement',
            pendingMove: true,
            question: null,
            deadlineAt: deadline(now, MOVING_XO_PLACEMENT_SECONDS),
          }),
        ),
        eventType: 'moving_xo_answer_correct',
        eventPayload: { teamId: runtime.activeTeamId } as GameplayModeState,
      };
    }

    const passed = handoff(runtime, 'moving-xo-wrong-answer');
    return {
      ...base,
      runtimeState: validateRuntime(asState(passed.runtime)),
      effects: passed.effects,
      eventType: 'moving_xo_answer_wrong',
      eventPayload: { teamId: runtime.activeTeamId } as GameplayModeState,
    };
  }

  if (command.type === MOVING_XO_COMMANDS.expireQuestion) {
    assertRunning(runtime);
    if (runtime.phase !== 'answering') {
      fail('MOVING_XO_NOT_ANSWERING', 'No question window is open');
    }
    assertDeadlineElapsed(runtime, now);
    // §23.11: a question timeout carries wrong-answer semantics exactly — no
    // move, turn passes, no extra penalty.
    const passed = handoff(runtime, 'moving-xo-question-timeout');
    return {
      ...base,
      runtimeState: validateRuntime(asState(passed.runtime)),
      effects: passed.effects,
      eventType: 'moving_xo_question_expired',
      eventPayload: { teamId: runtime.activeTeamId } as GameplayModeState,
    };
  }

  if (command.type === MOVING_XO_COMMANDS.expirePlacement) {
    assertRunning(runtime);
    if (runtime.phase !== 'placement') {
      fail('MOVING_XO_NOT_PLACING', 'No placement window is open');
    }
    assertDeadlineElapsed(runtime, now);
    // The earned move is forfeited: no mark changes, no auto-placement, and it
    // is not carried into a later turn.
    const passed = handoff(runtime, 'moving-xo-placement-timeout');
    return {
      ...base,
      runtimeState: validateRuntime(asState(passed.runtime)),
      effects: passed.effects,
      eventType: 'moving_xo_placement_expired',
      eventPayload: { teamId: runtime.activeTeamId } as GameplayModeState,
    };
  }

  if (command.type === MOVING_XO_COMMANDS.place) {
    assertRunning(runtime);
    assertActiveTeam(context, runtime);
    if (runtime.phase !== 'placement' || !runtime.pendingMove) {
      fail(
        'MOVING_XO_NO_EARNED_MOVE',
        'A placement requires an earned move from a correct answer',
      );
    }

    const cell = Number(command.payload.cell);
    const issue = placementIssue(
      runtime.board,
      runtime.activeTeamId,
      cell,
      runtime.decisivePhase,
    );
    if (issue) {
      fail('MOVING_XO_ILLEGAL_PLACEMENT', `Illegal placement: ${issue}`);
    }

    // One atomic transition, then resolve in the order §23.11 fixes: win first,
    // then a full board in الحسم, then continue.
    const board = applyPlacement(
      runtime.board,
      runtime.activeTeamId,
      cell,
      runtime.decisivePhase,
    );
    const successfulMoveCount = runtime.successfulMoveCount + 1;
    const resolution = resolveAfterMove(
      board,
      successfulMoveCount,
      runtime.decisivePhase,
    );
    const placed = {
      ...runtime,
      board,
      successfulMoveCount,
      pendingMove: false,
      question: null,
    };

    if (resolution.kind === 'win' || resolution.kind === 'draw') {
      return {
        ...base,
        runtimeState: validateRuntime(
          asState({
            ...placed,
            phase: 'completed',
            deadlineAt: null,
            outcome: resolution.kind,
            winningTeamId:
              resolution.kind === 'win' ? resolution.winningTeamId : null,
          }),
        ),
        eventType:
          resolution.kind === 'win' ? 'moving_xo_won' : 'moving_xo_drawn',
        eventPayload: {
          teamId: runtime.activeTeamId,
          cell,
        } as unknown as GameplayModeState,
      };
    }

    const passed = handoff(
      { ...placed, decisivePhase: resolution.decisivePhase },
      'moving-xo-move-committed',
    );
    return {
      ...base,
      runtimeState: validateRuntime(asState(passed.runtime)),
      effects: passed.effects,
      eventType: 'moving_xo_move_committed',
      eventPayload: {
        teamId: runtime.activeTeamId,
        cell,
      } as unknown as GameplayModeState,
    };
  }

  return fail('UNKNOWN_MOVING_XO_COMMAND', `Unknown command ${command.type}`);
}

function assertDeadlineElapsed(runtime: MovingXoRuntime, now: Date): void {
  // The reducer proves the persisted deadline passed, so a controller cannot
  // force an early forfeit by issuing the expiry command by hand.
  if (
    typeof runtime.deadlineAt !== 'string' ||
    now.getTime() < Date.parse(runtime.deadlineAt)
  ) {
    fail(
      'MOVING_XO_DEADLINE_NOT_ELAPSED',
      'Moving XO deadline has not elapsed',
    );
  }
}

/** The puzzle as a surface may render it — never with the answer attached. */
function projectQuestion(
  question: MovingXoQuestion | null,
): Record<string, unknown> | null {
  if (!question) return null;
  return {
    contentItemId: question.contentItemId,
    scopeId: question.scopeId,
    answerMode: question.answerMode,
    prompt: question.prompt,
    media: question.media ?? null,
    ...(question.options ? { options: question.options } : {}),
  };
}

/** Public board state. Never carries answer truth. */
function projectPublic(state: GameplayModeState): GameplayModeState {
  const runtime = runtimeOf(state);
  return {
    phase: runtime.phase,
    activeTeamId: runtime.activeTeamId,
    board: runtime.board,
    successfulMoveCount: runtime.successfulMoveCount,
    decisivePhase: runtime.decisivePhase,
    pendingMove: runtime.pendingMove,
    deadlineAt: runtime.deadlineAt,
    outcome: runtime.outcome,
    winningTeamId: runtime.winningTeamId,
    questionsPresented: runtime.presentedContentItemIds.length,
    // Prompt, media and the choice list; `acceptedAnswers` and `correctOptionId`
    // are dropped by construction rather than by a deny list.
    question: projectQuestion(runtime.question),
  } as unknown as GameplayModeState;
}

/** The verdict the launcher reports to the Match, once there is one. */
export function movingXoResult(
  state: GameplayModeState,
): MovingXoResult | undefined {
  const runtime = runtimeOf(state ?? ({} as GameplayModeState));
  if (!runtime.outcome) return undefined;
  return {
    winnerTeamId: runtime.winningTeamId ?? null,
    endedBy: runtime.outcome,
    successfulMoveCount: runtime.successfulMoveCount ?? 0,
    questionsPresented: runtime.presentedContentItemIds?.length ?? 0,
    decisivePhase: Boolean(runtime.decisivePhase),
  };
}

export const MOVING_XO_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: MOVING_XO_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  /**
   * One declared deadline, two windows.
   *
   * The instant lives on `runtimeState.deadlineAt` and which command expires it
   * is decided by the phase, so there is exactly one authoritative owner at any
   * moment rather than two clocks that can disagree. `question-pending` is listed
   * nowhere, so a challenge that is waiting for content runs no clock at all.
   *
   * Fair-Start arrives in two forms here, and both are needed. The **first**
   * puzzle is drawn inside the launch itself, before any surface has
   * acknowledged anything, so it is the one-time activation that must hold its
   * clock — hence `requiresPresentationActivation`. Every puzzle **after** it is
   * opened by a runtime that has already activated, so `openQuestion` opens a
   * recurring generation and that checkpoint holds the clock instead. "المرحلة"
   * needs only the second because its first question cannot arrive until a team
   * has already chosen a difficulty on an activated surface.
   */
  deadline: {
    source: 'runtime-state',
    commandType: MOVING_XO_COMMANDS.expireQuestion,
    activePhases: ['answering'],
    // The placement window is the server's clock too. Declaring it here keeps
    // one scheduler authoritative for both — a countdown the server does not own
    // is a countdown a client can out-wait.
    commandTypeByPhase: {
      placement: MOVING_XO_COMMANDS.expirePlacement,
    },
    requiresPresentationActivation: true,
  },
  requiredPresentationSurfaces: ({ runtimeState }) =>
    runtimeState.phase === 'answering' ? [{ capability: 'shared' }] : undefined,
  activatePresentation: (state, now) => {
    const runtime = runtimeOf(state);
    // Only the question window is Fair-Started. The placement clock starts from
    // the correct answer, on a surface that is by then demonstrably live.
    if (runtime.phase !== 'answering' || runtime.deadlineAt) return state;
    return validateRuntime(
      asState({
        ...runtime,
        deadlineAt: deadline(now, MOVING_XO_QUESTION_SECONDS),
      }),
    );
  },
  createInitialRuntimeState(context) {
    const seed = runtimeOf(context.initialState ?? ({} as GameplayModeState));
    const teamIds = Array.isArray(seed.teamIds) ? seed.teamIds : [];
    // The canonical Match turn owner starts — never a coin flip (§23.11).
    const activeTeamId =
      context.activeTeamId && teamIds.includes(context.activeTeamId)
        ? context.activeTeamId
        : (seed.activeTeamId ?? teamIds[0]);
    return validateRuntime(
      asState({
        // Nothing is drawn at launch: the challenge opens owing its first puzzle.
        phase: 'question-pending',
        activeTeamId,
        teamIds,
        board: seed.board ?? createMovingXoBoard(teamIds),
        successfulMoveCount: 0,
        decisivePhase: false,
        pendingMove: false,
        question: null,
        presentedContentItemIds: [],
        deadlineAt: null,
        winningTeamId: null,
        outcome: null,
      }),
    );
  },
  createInitialRoundState(context) {
    const runtime = runtimeOf(
      context.runtimeState ?? ({} as GameplayModeState),
    );
    return { phase: runtime.phase } as unknown as GameplayModeState;
  },
  validateRuntimeState: validateRuntime,
  validateRoundState: (state) => state,
  command(type) {
    if (
      type === MOVING_XO_COMMANDS.answer ||
      type === MOVING_XO_COMMANDS.place
    ) {
      return {
        type,
        // Any connected player on the active team may act; the reducer decides
        // which attempt wins. §23.11: first valid authoritative commit wins.
        authorization: 'active-team-player',
        allowedRoundStatuses: ['active'],
        validatePayload: (payload) => payload,
      };
    }
    if (
      type === MOVING_XO_COMMANDS.expireQuestion ||
      type === MOVING_XO_COMMANDS.expirePlacement ||
      type === MOVING_XO_COMMANDS.openQuestion ||
      type === MOVING_XO_COMMANDS.exhausted
    ) {
      // Server-owned: content arrives from the application layer, and expiry and
      // depletion are the server's conclusions rather than a player's action.
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
  /**
   * Only the puzzles actually opened in front of a team.
   *
   * Naturally incremental, because nothing is ever planned ahead: one item is
   * drawn per turn and recorded when it is opened. Cumulative on purpose, so a
   * ledger write missed on one mutation is repaired by the next.
   */
  presentedContentItemIds({ runtimeState }) {
    const presented = runtimeOf(runtimeState).presentedContentItemIds;
    return Array.isArray(presented) ? [...presented] : [];
  },
  projectRuntimeState: projectPublic,
  projectRoundState: (state) => state,
  /**
   * The public board, plus the active team's own placement affordances.
   *
   * The opponent and spectators get the board and nothing actionable. The active
   * team additionally learns which of its marks is expiring and which cells are
   * legal — information it needs to choose, and which tells no one the answer.
   *
   * This is presentation help, never the authority: the reducer re-checks every
   * placement, so a client that ignores `legalCells` is refused anyway.
   */
  projectRuntimeStateForActor(state, actor: InteractionActorProjection) {
    const runtime = runtimeOf(state);
    const publicState = projectPublic(state);
    const isActiveTeam =
      actor.teamId !== undefined && actor.teamId === runtime.activeTeamId;
    if (!isActiveTeam || runtime.phase !== 'placement') return publicState;
    return {
      ...publicState,
      expiringCell: expiringCellFor(
        runtime.board,
        runtime.activeTeamId,
        runtime.decisivePhase,
      ),
      legalCells: legalTargetsFor(
        runtime.board,
        runtime.activeTeamId,
        runtime.decisivePhase,
      ),
    } as unknown as GameplayModeState;
  },
};
