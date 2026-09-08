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

/**
 * "الكومبو" — the Anime Signature mechanic.
 *
 * Knowledge plus push-your-luck. A team plays a Run of up to four questions of
 * rising stage, banking nothing as it goes: every correct answer adds one point
 * to an *unbanked* balance the team can either secure (تثبيت) or gamble on the
 * next question (كمل الكومبو). One wrong answer, or one expired clock, and the
 * whole unbanked balance is gone.
 *
 * The opponent holds one charge of "كسر الكومبو" per challenge. Armed secretly
 * against a live question, it does not change the question — it removes the
 * *right to stop*. Survive the forced question and the team is paid double for
 * it; miss it and the entire Run is lost. That is the pressure the mechanic
 * exists to create, and it is why the armed flag never appears in the target's
 * projection (see `publicState`).
 *
 * Two Runs per challenge, one each, then the challenge is over. Combo points are
 * the mechanic's own margin, never Match score — the launcher reports them as
 * `mechanicSummary` and the Match awards its ordinary Signature win to whoever
 * banked more.
 */

export const COMBO_MODE_KEY = 'combo';
/** Every question, every stage. The clock is not the difficulty lever. */
export const COMBO_QUESTION_SECONDS = 30;
export const COMBO_QUESTIONS_PER_RUN = 4;
export const COMBO_RUNS_PER_CHALLENGE = 2;
/**
 * How long the hand-over recap holds before the server opens the next Run.
 *
 * **This is a lifecycle recovery fallback, not gameplay balance.** It is not the
 * approved 30-second question timer and must not be conflated with it: the host
 * normally advances the recap deliberately, and this only exists because
 * `run-complete` must not be a state that only the controller can leave. If they
 * drop there, nothing else would ever move the challenge — the freeze class this
 * lifecycle exists to prevent — so the phase carries a deadline like any other.
 *
 * Deliberately configurable and deliberately separate from
 * `COMBO_QUESTION_SECONDS`: tuning the recap window is an operational decision,
 * and changing it must never change how long a team gets to answer.
 */
export const COMBO_RUN_HANDOVER_SECONDS = Number(
  process.env.COMBO_RUN_HANDOVER_SECONDS ?? 30,
);
/** Surviving a forced question is worth this on top of the ordinary point. */
export const COMBO_BREAK_SURVIVAL_BONUS = 1;
export const COMBO_STAGES = [1, 2, 3, 4] as const;

export type ComboStage = (typeof COMBO_STAGES)[number];
export type ComboPhase =
  'question' | 'decision' | 'break-reveal' | 'run-complete' | 'completed';
export type ComboChargeState = 'available' | 'spent';

/** One planned question. `acceptedAnswers` is authored, never projected. */
export interface ComboPlannedQuestion {
  contentItemId: string;
  scopeId: string;
  stage: ComboStage;
  prompt: unknown;
  acceptedAnswers: string[];
}

export interface ComboRunResult {
  teamId: string;
  runIndex: number;
  bankedPoints: number;
  questionsAnswered: number;
  /** Why the Run ended — the recap reads this rather than inferring it. */
  endedBy: 'cash-out' | 'combo-break' | 'timeout' | 'final-question';
  brokenByTeamId: string | null;
  endedAt: string;
}

export interface ComboResult {
  winnerTeamId: string | null;
  tie: boolean;
  points: Record<string, number>;
}

function fail(message: string): never {
  throw new LiveSessionDomainError('INVALID_COMBO_STATE', message);
}

function reject(code: string, message: string): never {
  throw new LiveSessionDomainError(code, message);
}

function parse<T>(value: unknown, label: string): T {
  if (typeof value !== 'string' || !value) fail(`${label} is missing`);
  try {
    return JSON.parse(value) as T;
  } catch {
    return fail(`${label} is not valid JSON`);
  }
}

function teamsOf(state: GameplayModeState): string[] {
  return parse<string[]>(state.teamIdsJson, 'Combo teams');
}

/** The full plan: one array of four questions per Run, fixed before play. */
function planOf(state: GameplayModeState): ComboPlannedQuestion[][] {
  return parse<ComboPlannedQuestion[][]>(
    state.questionPlanJson,
    'Combo question plan',
  );
}

function resultsOf(state: GameplayModeState): ComboRunResult[] {
  return parse<ComboRunResult[]>(state.runResultsJson, 'Combo run results');
}

function chargesOf(state: GameplayModeState): Record<string, ComboChargeState> {
  return parse<Record<string, ComboChargeState>>(
    state.chargesJson,
    'Combo break charges',
  );
}

/**
 * Resolve the authenticated command actor to a participating Combo team.
 *
 * `connected-player` is the outer session authorization boundary. Combo still
 * has to establish team ownership itself because its active Run changes from
 * Team A to Team B inside one generic gameplay round; the round's active team
 * follows the Match/session turn and is not a second source of Combo truth.
 */
function comboSubmitterTeamId(
  context: GameplayPluginContext,
  teams: readonly string[],
): string {
  const participant = (context.eligibleParticipants ?? []).find(
    (candidate) => candidate.participantId === context.submitterParticipantId,
  );
  if (!participant?.teamId || !teams.includes(participant.teamId)) {
    reject(
      'COMBO_COMMAND_FORBIDDEN',
      'Only an eligible competing Combo player may act',
    );
  }
  return participant.teamId;
}

function assertActiveComboTeam(
  context: GameplayPluginContext,
  state: GameplayModeState,
  activeTeamId: string | null,
): void {
  const submitterTeamId = comboSubmitterTeamId(context, teamsOf(state));
  if (!activeTeamId || submitterTeamId !== activeTeamId) {
    reject(
      'COMBO_COMMAND_FORBIDDEN',
      'Only a player on the active Combo team may issue this command',
    );
  }
}

/**
 * The team whose Run is being played. Runs are taken in the order the plan was
 * built, so the active team is a function of `runIndex` and never stored twice.
 */
export function comboActiveTeamId(state: GameplayModeState): string | null {
  const teams = teamsOf(state);
  const runIndex = Number(state.runIndex);
  return runIndex >= 0 && runIndex < teams.length ? teams[runIndex] : null;
}

function currentQuestion(
  state: GameplayModeState,
): ComboPlannedQuestion | undefined {
  return planOf(state)[Number(state.runIndex)]?.[Number(state.questionIndex)];
}

/**
 * Whether a further question exists after the current one.
 *
 * `كسر الكومبو` is only legal while this is true: the ability works by forcing
 * the next question, so with nothing left to force there is nothing to arm.
 */
export function comboHasNextQuestion(state: GameplayModeState): boolean {
  const run = planOf(state)[Number(state.runIndex)] ?? [];
  return Number(state.questionIndex) + 1 < run.length;
}

function validateRuntime(state: GameplayModeState): GameplayModeState {
  const teams = teamsOf(state);
  const plan = planOf(state);
  const results = resultsOf(state);
  const charges = chargesOf(state);
  const phases: ComboPhase[] = [
    'question',
    'decision',
    'break-reveal',
    'run-complete',
    'completed',
  ];
  if (
    teams.length !== COMBO_RUNS_PER_CHALLENGE ||
    new Set(teams).size !== teams.length ||
    plan.length !== COMBO_RUNS_PER_CHALLENGE ||
    plan.some(
      (run) =>
        run.length !== COMBO_QUESTIONS_PER_RUN ||
        run.some(
          (question, index) =>
            !question.contentItemId ||
            !question.scopeId ||
            question.stage !== COMBO_STAGES[index] ||
            !Array.isArray(question.acceptedAnswers) ||
            !question.acceptedAnswers.length,
        ),
    ) ||
    !phases.includes(state.phase as ComboPhase) ||
    !Number.isInteger(state.runIndex) ||
    Number(state.runIndex) < 0 ||
    Number(state.runIndex) > COMBO_RUNS_PER_CHALLENGE ||
    !Number.isInteger(state.questionIndex) ||
    Number(state.questionIndex) < 0 ||
    Number(state.questionIndex) >= COMBO_QUESTIONS_PER_RUN ||
    !Number.isInteger(state.unbankedPoints) ||
    Number(state.unbankedPoints) < 0 ||
    results.length > COMBO_RUNS_PER_CHALLENGE ||
    teams.some((teamId) => !['available', 'spent'].includes(charges[teamId])) ||
    typeof state.forcedQuestion !== 'boolean'
  ) {
    return fail(
      'Combo requires two teams, two four-stage runs, and a coherent phase',
    );
  }
  const armedBy = state.armedBreakByTeamId;
  if (armedBy !== null && !teams.includes(String(armedBy))) {
    return fail('Combo break can only be armed by a participating team');
  }
  return {
    ...state,
    teamIdsJson: JSON.stringify(teams),
    questionPlanJson: JSON.stringify(plan),
    runResultsJson: JSON.stringify(results),
    chargesJson: JSON.stringify(charges),
  };
}

function validateRound(state: GameplayModeState): GameplayModeState {
  if (
    !Number.isInteger(state.runIndex) ||
    !Number.isInteger(state.questionIndex) ||
    typeof state.phase !== 'string'
  ) {
    return fail('Combo round progress is incomplete');
  }
  return state;
}

function answerPayload(
  payload: GameplayCommandPayload,
): GameplayCommandPayload {
  if (
    Object.keys(payload).some(
      (key) => !['answer', 'assignmentSequence'].includes(key),
    ) ||
    typeof payload.answer !== 'string' ||
    !payload.answer.trim()
  ) {
    reject('INVALID_COMBO_SUBMISSION', 'Submit one non-empty answer');
  }
  return payload;
}

function noPayload(payload: GameplayCommandPayload): GameplayCommandPayload {
  if (Object.keys(payload).length) {
    reject('INVALID_COMBO_COMMAND', 'This command does not accept a payload');
  }
  return {};
}

/** A fresh clock for the question at `questionIndex`. */
function questionDeadline(now: Date): string {
  return new Date(now.getTime() + COMBO_QUESTION_SECONDS * 1000).toISOString();
}

/**
 * End the active Run and hand over, or finish the challenge.
 *
 * Every ending funnels through here — cash out, wrong answer, expired clock and
 * the final question all converge, so there is exactly one place that decides
 * what a finished Run means. That is what keeps `combo-break` from growing a
 * second copy of end-of-run logic.
 */
function endRun(
  state: GameplayModeState,
  input: {
    bankedPoints: number;
    endedBy: ComboRunResult['endedBy'];
    brokenByTeamId: string | null;
    now: Date;
  },
): GameplayModeState {
  const teams = teamsOf(state);
  const runIndex = Number(state.runIndex);
  const teamId = teams[runIndex];
  const results = [
    ...resultsOf(state),
    {
      teamId,
      runIndex,
      bankedPoints: input.bankedPoints,
      questionsAnswered: Number(state.questionIndex) + 1,
      endedBy: input.endedBy,
      brokenByTeamId: input.brokenByTeamId,
      endedAt: input.now.toISOString(),
    },
  ];
  const nextRunIndex = runIndex + 1;
  const finished = nextRunIndex >= COMBO_RUNS_PER_CHALLENGE;
  const base: GameplayModeState = {
    ...state,
    runResultsJson: JSON.stringify(results),
    unbankedPoints: 0,
    // The armed charge is consumed by the attempt, not by the outcome, so it is
    // cleared here whether or not it ever became visible.
    armedBreakByTeamId: null,
    forcedQuestion: false,
    deadlineAt: null,
  };
  if (!finished) {
    return validateRuntime({
      ...base,
      runIndex: nextRunIndex,
      questionIndex: 0,
      phase: 'run-complete',
      // Armed so the hand-over cannot depend on the host coming back.
      deadlineAt: new Date(
        input.now.getTime() + COMBO_RUN_HANDOVER_SECONDS * 1000,
      ).toISOString(),
    });
  }
  const points = Object.fromEntries(
    teams.map((candidate) => [
      candidate,
      results
        .filter((result) => result.teamId === candidate)
        .reduce((total, result) => total + result.bankedPoints, 0),
    ]),
  );
  const best = Math.max(...Object.values(points));
  const leaders = teams.filter((candidate) => points[candidate] === best);
  const result: ComboResult = {
    // A tie is reported as a tie. The Match already knows how to record a
    // challenge with no winner; inventing a tie-breaker here would be a product
    // decision this mechanic is not entitled to make.
    winnerTeamId: leaders.length === 1 ? leaders[0] : null,
    tie: leaders.length !== 1,
    points,
  };
  return validateRuntime({
    ...base,
    runIndex: nextRunIndex - 1,
    phase: 'completed',
    resultJson: JSON.stringify(result),
  });
}

/** Open the next question of the active Run with a fresh clock. */
function openQuestion(
  state: GameplayModeState,
  input: { questionIndex: number; forced: boolean; now: Date },
): GameplayModeState {
  return validateRuntime({
    ...state,
    questionIndex: input.questionIndex,
    phase: 'question',
    forcedQuestion: input.forced,
    // The previous question's truth never trails into this one.
    lastQuestionRevealJson: null,
    deadlineAt: questionDeadline(input.now),
  });
}

/** What one resolved Combo question was, for the reveal that follows it. */
export interface ComboQuestionReveal {
  questionIndex: number;
  teamId: string;
  submittedAnswer: string | null;
  correctAnswer: string;
  correct: boolean;
  resolvedBy: 'answer' | 'timeout';
  earned: number;
  /** When the server resolved it, so a reveal can pace itself honestly. */
  resolvedAt: string;
}

/**
 * Attach the answer truth of the question that has just ended.
 *
 * Written at resolution and nowhere else: the canonical answer is read from the
 * question the team has already finished, so there is no state in which this
 * record exists and the question is still open. `openQuestion` clears it, so it
 * can never trail into the next one.
 */
function recordQuestionReveal(
  state: GameplayModeState,
  input: {
    submittedAnswer: string | null;
    correct: boolean;
    resolvedBy: 'answer' | 'timeout';
    earned: number;
    now: Date;
  },
): GameplayModeState {
  const question = currentQuestion(state);
  const teamId = comboActiveTeamId(state);
  // No question or no team on it means there is nothing that just resolved.
  if (!question || !teamId) return state;
  const reveal: ComboQuestionReveal = {
    questionIndex: Number(state.questionIndex),
    teamId,
    submittedAnswer: input.submittedAnswer,
    correctAnswer: question.acceptedAnswers[0] ?? '',
    correct: input.correct,
    resolvedBy: input.resolvedBy,
    earned: input.earned,
    resolvedAt: input.now.toISOString(),
  };
  return { ...state, lastQuestionRevealJson: JSON.stringify(reveal) };
}

/**
 * Resolve a lost question — wrong answer or expired clock, they are the same
 * event as far as the Run is concerned.
 */
function comboBreak(
  state: GameplayModeState,
  input: { endedBy: 'combo-break' | 'timeout'; now: Date },
): GameplayModeState {
  const armedBy = state.armedBreakByTeamId;
  return endRun(state, {
    // The whole unbanked balance, including anything earned before the opponent
    // armed their charge.
    bankedPoints: 0,
    endedBy: input.endedBy,
    brokenByTeamId: armedBy === null ? null : String(armedBy),
    now: input.now,
  });
}

/**
 * Resolve a won question.
 *
 * Three outcomes, in strict order of precedence: a forced question pays its
 * survival bonus and returns the right to stop; the final question banks
 * automatically because there is nothing left to gamble on; anything else opens
 * the ordinary تثبيت/كمل decision. If a charge was armed against this question,
 * the reveal replaces that decision with a forced next question.
 */
function comboCorrect(state: GameplayModeState, now: Date): GameplayModeState {
  const wasForced = state.forcedQuestion === true;
  // +1 for the answer, +1 more if this was a question the team was forced into.
  const earned = 1 + (wasForced ? COMBO_BREAK_SURVIVAL_BONUS : 0);
  const unbanked = Number(state.unbankedPoints) + earned;
  const questionIndex = Number(state.questionIndex);
  const isFinal = questionIndex + 1 >= COMBO_QUESTIONS_PER_RUN;
  const banked: GameplayModeState = {
    ...state,
    unbankedPoints: unbanked,
    forcedQuestion: false,
    deadlineAt: null,
  };
  if (isFinal) {
    // Automatic تثبيت. Offering "continue" with no question behind it would be
    // a decision with one legal answer.
    return endRun(banked, {
      bankedPoints: unbanked,
      endedBy: 'final-question',
      // Surviving is not being broken, even if a charge was spent trying.
      brokenByTeamId: null,
      now,
    });
  }
  const armedBy = state.armedBreakByTeamId;
  if (armedBy !== null && !wasForced) {
    // The charge becomes visible only now, and only because the team survived
    // the question it was armed against.
    return validateRuntime({
      ...banked,
      phase: 'break-reveal',
      armedBreakByTeamId: armedBy,
    });
  }
  return validateRuntime({
    ...banked,
    phase: 'decision',
    armedBreakByTeamId: null,
  });
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
  const activeTeamId = comboActiveTeamId(state);
  const phase = String(state.phase) as ComboPhase;

  const settle = (
    next: GameplayModeState,
    eventType: string,
    eventPayload: GameplayModeState,
  ): GameplayCommandResult => ({
    runtimeState: next,
    roundState: validateRound({
      runIndex: next.runIndex,
      questionIndex: next.questionIndex,
      phase: next.phase,
    }),
    eventType,
    eventPayload,
    effects: [],
  });

  if (command.type === 'submit-combo-answer') {
    assertActiveComboTeam(context, state, activeTeamId);
    if (phase !== 'question') {
      reject('COMBO_NO_ACTIVE_QUESTION', 'No Combo question is open');
    }
    const question = currentQuestion(state);
    if (!question) {
      reject('COMBO_NO_ACTIVE_QUESTION', 'No Combo question is open');
    }
    const submitted = String(command.payload.answer);
    const correct = question.acceptedAnswers
      .map(normalizeAnswer)
      .includes(normalizeAnswer(submitted));
    // Recorded before the run advances, so the reveal describes the question
    // that just ended rather than whatever the Run moved on to.
    const resolved = recordQuestionReveal(state, {
      submittedAnswer: submitted,
      correct,
      resolvedBy: 'answer',
      earned: correct
        ? 1 + (state.forcedQuestion === true ? COMBO_BREAK_SURVIVAL_BONUS : 0)
        : 0,
      now,
    });
    const next = correct
      ? comboCorrect(resolved, now)
      : comboBreak(resolved, { endedBy: 'combo-break', now });
    return settle(
      next,
      correct ? 'combo-answer-correct' : 'combo-answer-incorrect',
      {
        correct,
        teamId: activeTeamId,
        questionIndex: state.questionIndex,
        unbankedPoints: next.unbankedPoints,
      },
    );
  }

  if (command.type === 'expire-combo-question') {
    // One deadline owner, two things it can be counting: a live question, or the
    // hand-over recap. Both are resolved here so the mechanic keeps a single
    // expiry command and the scheduler keeps a single contract.
    if (phase !== 'question' && phase !== 'run-complete') {
      reject('COMBO_NO_ACTIVE_QUESTION', 'No Combo clock is running');
    }
    // The scheduler drives this under the controller identity, so the reducer
    // proves the persisted clock actually elapsed rather than trusting a caller.
    const deadlineAt = state.deadlineAt;
    if (
      typeof deadlineAt !== 'string' ||
      Date.parse(deadlineAt) > now.getTime()
    ) {
      reject('COMBO_DEADLINE_NOT_REACHED', 'The Combo clock has not expired');
    }
    if (phase === 'run-complete') {
      const opened = openQuestion(state, {
        questionIndex: 0,
        forced: false,
        now,
      });
      return settle(opened, 'combo-run-started', {
        teamId: comboActiveTeamId(opened),
        runIndex: opened.runIndex,
        advancedBy: 'deadline',
      });
    }
    // A timeout submitted nothing; the record says so rather than inventing one.
    const next = comboBreak(
      recordQuestionReveal(state, {
        submittedAnswer: null,
        correct: false,
        resolvedBy: 'timeout',
        earned: 0,
        now,
      }),
      { endedBy: 'timeout', now },
    );
    return settle(next, 'combo-question-expired', {
      teamId: activeTeamId,
      questionIndex: state.questionIndex,
    });
  }

  if (command.type === 'cash-out-combo') {
    assertActiveComboTeam(context, state, activeTeamId);
    // Only reachable from the ordinary decision. `break-reveal` deliberately
    // does not accept it — removing the right to stop is the whole ability.
    if (phase !== 'decision') {
      reject('COMBO_CASH_OUT_NOT_AVAILABLE', 'Combo cannot be banked now');
    }
    const next = endRun(state, {
      bankedPoints: Number(state.unbankedPoints),
      endedBy: 'cash-out',
      brokenByTeamId: null,
      now,
    });
    return settle(next, 'combo-cashed-out', {
      teamId: activeTeamId,
      bankedPoints: state.unbankedPoints,
    });
  }

  if (command.type === 'continue-combo') {
    assertActiveComboTeam(context, state, activeTeamId);
    if (phase !== 'decision' && phase !== 'break-reveal') {
      reject(
        'COMBO_CONTINUE_NOT_AVAILABLE',
        'Combo has no question to continue to',
      );
    }
    if (!comboHasNextQuestion(state)) {
      reject(
        'COMBO_CONTINUE_NOT_AVAILABLE',
        'Combo has no question to continue to',
      );
    }
    const forced = phase === 'break-reveal';
    // The arming team is deliberately *not* cleared when the forced question
    // opens: if that question is lost, the recap has to be able to say who
    // forced it. It is already public by this point — the reveal happened.
    const next = openQuestion(
      forced ? state : { ...state, armedBreakByTeamId: null },
      { questionIndex: Number(state.questionIndex) + 1, forced, now },
    );
    return settle(next, forced ? 'combo-forced-question' : 'combo-continued', {
      teamId: activeTeamId,
      questionIndex: next.questionIndex,
      forced,
    });
  }

  if (command.type === 'advance-combo-run') {
    // The handover beat. A Run ending leaves the recap on screen rather than
    // starting the next team's clock behind it, so the host opens the next Run
    // deliberately — the same shape as `advance-closest-item`.
    if (phase !== 'run-complete') {
      reject('COMBO_NO_RUN_TO_ADVANCE', 'No finished Combo run is waiting');
    }
    const next = openQuestion(state, { questionIndex: 0, forced: false, now });
    return settle(next, 'combo-run-started', {
      teamId: comboActiveTeamId(next),
      runIndex: next.runIndex,
    });
  }

  if (command.type === 'arm-combo-break') {
    // Resolved from the authenticated submitter the session layer supplies, not
    // from anything the client asserts about itself.
    const armingTeamId = comboSubmitterTeamId(context, teamsOf(state));
    if (armingTeamId === activeTeamId) {
      reject(
        'COMBO_BREAK_FORBIDDEN',
        'كسر الكومبو can only be used against the other team',
      );
    }
    if (phase !== 'question') {
      reject('COMBO_BREAK_NOT_AVAILABLE', 'كسر الكومبو needs a live question');
    }
    // Structural rule, enforced here and not merely hidden by the client: the
    // ability works by forcing the *next* question, so the final one is immune.
    if (!comboHasNextQuestion(state)) {
      reject(
        'COMBO_BREAK_NOT_AVAILABLE',
        'كسر الكومبو cannot be used on the final question',
      );
    }
    const charges = chargesOf(state);
    if (charges[armingTeamId] !== 'available') {
      reject('COMBO_BREAK_ALREADY_SPENT', 'كسر الكومبو has already been used');
    }
    if (state.armedBreakByTeamId !== null) {
      reject('COMBO_BREAK_ALREADY_SPENT', 'كسر الكومبو is already armed');
    }
    const next = validateRuntime({
      ...state,
      chargesJson: JSON.stringify({ ...charges, [armingTeamId]: 'spent' }),
      armedBreakByTeamId: armingTeamId,
    });
    // The event names the arming team only. `publicState` is what keeps the
    // target from learning it, and the event payload must not undo that.
    return settle(next, 'combo-break-armed', { armedByTeamId: armingTeamId });
  }

  return reject(
    'UNSUPPORTED_COMBO_COMMAND',
    `Combo cannot handle "${command.type}"`,
  );
}

/**
 * What a viewer may see.
 *
 * Two secrets live in this state and neither is ever projected: the authored
 * `acceptedAnswers` of every planned question, and — until it is revealed — the
 * fact that a charge of كسر الكومبو is armed.
 *
 * The armed flag is **omitted**, not falsified. The running team receives a
 * state with no key for it at all, so there is nothing for a client to notice,
 * log, or reveal early. Only the arming team is told, and only about its own
 * action.
 */
function publicState(
  state: GameplayModeState,
  actor?: InteractionActorProjection,
): GameplayModeState {
  const valid = validateRuntime(state);
  const teams = teamsOf(valid);
  const plan = planOf(valid);
  const runIndex = Number(valid.runIndex);
  const questionIndex = Number(valid.questionIndex);
  const phase = String(valid.phase) as ComboPhase;
  const activeTeamId = comboActiveTeamId(valid);
  const question = plan[runIndex]?.[questionIndex];
  const armedBy = valid.armedBreakByTeamId;
  const revealed = phase === 'break-reveal';
  const charges = chargesOf(valid);

  const shared: GameplayModeState = {
    phase,
    runIndex,
    questionIndex,
    questionNumber: questionIndex + 1,
    questionsPerRun: COMBO_QUESTIONS_PER_RUN,
    activeTeamId,
    unbankedPoints: valid.unbankedPoints,
    forcedQuestion: valid.forcedQuestion,
    teamIdsJson: JSON.stringify(teams),
    runResultsJson: valid.runResultsJson,
    // Charge availability is public — both teams may know whether the ability
    // has been used at all. *When* it is armed is the secret, not *whether* it
    // was ever spent, and the reveal makes it public anyway.
    chargesJson: JSON.stringify(charges),
    ...(valid.deadlineAt ? { deadlineAt: valid.deadlineAt } : {}),
    ...(valid.resultJson ? { resultJson: valid.resultJson } : {}),
    // Present only because a question already resolved: `openQuestion` clears
    // it, so it can never be readable while its question is still open.
    ...(valid.lastQuestionRevealJson
      ? { lastQuestionRevealJson: valid.lastQuestionRevealJson }
      : {}),
    // The prompt and its stage, never the accepted answers.
    ...(question
      ? {
          questionPrompt: JSON.stringify(question.prompt),
          questionStage: question.stage,
          questionScopeId: question.scopeId,
          questionContentItemId: question.contentItemId,
        }
      : {}),
    // Revealed to everyone the moment the target survives the armed question.
    // Public from the reveal onward, including while the forced question is
    // being played — the screen has to keep showing who forced it.
    ...((revealed || valid.forcedQuestion === true) && armedBy !== null
      ? { comboBreakRevealedByTeamId: String(armedBy) }
      : {}),
  };

  if (!actor) return shared;

  const isArmingTeam =
    armedBy !== null &&
    actor.teamId != null &&
    actor.teamId === String(armedBy);
  return {
    ...shared,
    actorTeamId: actor.teamId ?? null,
    isActiveTeam: actor.teamId != null && actor.teamId === activeTeamId,
    canArmComboBreak:
      phase === 'question' &&
      actor.teamId != null &&
      actor.teamId !== activeTeamId &&
      charges[actor.teamId] === 'available' &&
      armedBy === null &&
      comboHasNextQuestion(valid),
    // Private acknowledgement, for the arming side only. Before the reveal no
    // other projection carries any form of this key.
    ...(isArmingTeam && !revealed ? { ownComboBreakArmed: true } : {}),
  };
}

export const COMBO_GAMEPLAY_PLUGIN: GameplayModePlugin = {
  key: COMBO_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  // Each question carries its own clock, so the deadline lives on the runtime
  // and is live only while a question is open. `decision`, `break-reveal` and
  // the terminal phases must never be armed.
  deadline: {
    source: 'runtime-state',
    commandType: 'expire-combo-question',
    activePhases: ['question', 'run-complete'],
    // Fair-start: the first question's clock is armed only once a presentation
    // surface is ready (see `activatePresentation`), so a slow client cold-start
    // never eats into the 30-second question.
    requiresPresentationActivation: true,
  },
  // Re-anchor the first question's deadline to activation time. Combo launches in
  // the `question` phase (its invariant that a question always carries a clock is
  // preserved), so activation re-stamps that clock from `now`; the configured
  // 30 seconds is unchanged — only its origin moves from launch to activation.
  activatePresentation: (state, now) =>
    String((state as { phase?: unknown }).phase) === 'question'
      ? { ...state, deadlineAt: questionDeadline(now) }
      : state,
  createInitialRuntimeState: (context) =>
    validateRuntime(context.initialState ?? {}),
  createInitialRoundState(context) {
    const runtime = validateRuntime(context.runtimeState ?? {});
    return validateRound({
      runIndex: runtime.runIndex,
      questionIndex: runtime.questionIndex,
      phase: runtime.phase,
    });
  },
  validateRuntimeState: validateRuntime,
  validateRoundState: validateRound,
  command(type) {
    if (type === 'submit-combo-answer') {
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: answerPayload,
      };
    }
    if (type === 'cash-out-combo' || type === 'continue-combo') {
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    if (type === 'arm-combo-break') {
      return {
        type,
        authorization: 'connected-player',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    if (type === 'advance-combo-run') {
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    if (type === 'expire-combo-question') {
      return {
        type,
        authorization: 'controller',
        allowedRoundStatuses: ['active'],
        validatePayload: noPayload,
      };
    }
    return undefined;
  },
  handleCommand: handle,
  /**
   * The questions a team actually reached — never the plan.
   *
   * Combo builds all eight questions before play, and a run that ends at Q2
   * leaves six of them unseen. Those must stay eligible for future Matches, so
   * this counts reached questions per run rather than returning the plan: a
   * finished run reports the question it ended on (`questionsAnswered`), and the
   * run in progress reports up to the question currently open.
   */
  presentedContentItemIds: ({ runtimeState }) => {
    // Never throws. This runs after every committed mutation, and an exception
    // here would be swallowed by the observer registry — silently skipping
    // exposure, which is the one failure mode that loses content quietly.
    if (typeof runtimeState.questionPlanJson !== 'string') return [];
    const plan = planOf(runtimeState);
    if (!plan.length) return [];
    const runIndex = Number(runtimeState.runIndex);
    const questionIndex = Number(runtimeState.questionIndex);
    const finished = resultsOf(runtimeState);
    const presented: string[] = [];
    for (const [index, run] of plan.entries()) {
      const result = finished.find((entry) => entry.runIndex === index);
      const reached = result
        ? result.questionsAnswered
        : index === runIndex
          ? questionIndex + 1
          : 0;
      for (const question of run.slice(0, Math.max(0, reached))) {
        presented.push(question.contentItemId);
      }
    }
    return [...new Set(presented)];
  },
  projectRuntimeState: (state) => publicState(state),
  projectRuntimeStateForActor: (state, actor) => publicState(state, actor),
  projectRoundState: validateRound,
};

/** The mechanic's own margin, for the launcher's completion summary. */
export function comboResult(state: GameplayModeState): ComboResult | undefined {
  return typeof state.resultJson === 'string' && state.resultJson
    ? (JSON.parse(state.resultJson) as ComboResult)
    : undefined;
}
