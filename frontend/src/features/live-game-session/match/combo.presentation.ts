/**
 * Reading the "الكومبو" runtime projection.
 *
 * The Combo runtime publishes a flat map of scalars with the structured parts as
 * JSON text, and it publishes *different* maps to different actors: the running
 * team, the opposing team that may still be holding its break charge, and the
 * shared screen each see their own projection. These helpers are the only place
 * that shape is interpreted.
 *
 * The rule that matters here: this module never derives a secret. Whether a
 * break is armed, who armed it, whether this actor may arm one — all of that is
 * decided by the server and only read back. There is deliberately no helper
 * that infers an armed break from anything other than the key the server chose
 * to send to this actor.
 */

import { authoredText, type AuthoredText } from "../authored-text";

export const COMBO_MODE_KEY = "combo";
export const COMBO_CHALLENGE_NAME = "الكومبو";
export const COMBO_QUESTIONS_PER_RUN = 4;
export const COMBO_RUNS_PER_CHALLENGE = 2;

export type ComboPhase =
  "question" | "decision" | "break-reveal" | "run-complete" | "completed";

export type ComboChargeState = "available" | "spent";

export interface ComboRunResult {
  teamId: string;
  runIndex: number;
  bankedPoints: number;
  questionsAnswered: number;
  endedBy: "cash-out" | "combo-break" | "timeout" | "final-question";
  brokenByTeamId: string | null;
  endedAt: string;
}

export interface ComboResult {
  winnerTeamId: string | null;
  tie: boolean;
  points: Record<string, number>;
}

/**
 * The whole projection, read once.
 *
 * Fields absent from this actor's projection stay absent here rather than
 * becoming a default — `ownComboBreakArmed` is `false` for an actor the server
 * did not tell, which is exactly the same thing the actor should render.
 */
export interface ComboView {
  phase: ComboPhase;
  runIndex: number;
  questionNumber: number;
  questionsPerRun: number;
  activeTeamId: string;
  unbankedPoints: number;
  forcedQuestion: boolean;
  teamIds: string[];
  charges: Record<string, ComboChargeState>;
  runResults: ComboRunResult[];
  result?: ComboResult;
  deadlineAt?: string;
  prompt?: AuthoredText;
  questionStage?: number;
  /** Public once the target survives an armed question — before that, absent. */
  breakRevealedByTeamId?: string;
  /** This actor's own team, when the projection is actor-specific. */
  actorTeamId?: string;
  /** Server's word on whether this actor's team is the one answering. */
  isActiveTeam: boolean;
  /** Server's word on whether the break button should exist at all. */
  canArmComboBreak: boolean;
  /** Private acknowledgement, sent only to the team that armed. */
  ownComboBreakArmed: boolean;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function count(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const PHASES: readonly ComboPhase[] = [
  "question",
  "decision",
  "break-reveal",
  "run-complete",
  "completed",
];

function phaseOf(value: unknown): ComboPhase {
  return PHASES.includes(value as ComboPhase)
    ? (value as ComboPhase)
    : "question";
}

export function readComboView(state: Record<string, unknown>): ComboView {
  return {
    phase: phaseOf(state.phase),
    runIndex: count(state.runIndex, 0),
    questionNumber: count(state.questionNumber, 1),
    questionsPerRun: count(state.questionsPerRun, COMBO_QUESTIONS_PER_RUN),
    activeTeamId: text(state.activeTeamId) ?? "",
    unbankedPoints: count(state.unbankedPoints, 0),
    forcedQuestion: state.forcedQuestion === true,
    teamIds: parseJson<string[]>(state.teamIdsJson, []),
    charges: parseJson<Record<string, ComboChargeState>>(state.chargesJson, {}),
    runResults: parseJson<ComboRunResult[]>(state.runResultsJson, []),
    result: parseJson<ComboResult | undefined>(state.resultJson, undefined),
    deadlineAt: text(state.deadlineAt),
    prompt: parseJson<AuthoredText>(state.questionPrompt, undefined),
    questionStage:
      typeof state.questionStage === "number" ? state.questionStage : undefined,
    breakRevealedByTeamId: text(state.comboBreakRevealedByTeamId),
    actorTeamId: text(state.actorTeamId),
    isActiveTeam: state.isActiveTeam === true,
    canArmComboBreak: state.canArmComboBreak === true,
    ownComboBreakArmed: state.ownComboBreakArmed === true,
  };
}

/** Prompt text, ready to render, or a waiting line while the run turns over. */
export function comboPromptText(view: ComboView): string {
  return authoredText(view.prompt, "جارٍ تجهيز السؤال…");
}

/**
 * Which run this is, one-based, for the header.
 *
 * The runtime counts runs from zero because it indexes the plan with it; the
 * screen counts from one because people do.
 */
export function comboRunNumber(view: ComboView): number {
  return view.runIndex + 1;
}

/** How far through the whole challenge, as a percentage, for the frame. */
export function comboProgressValue(view: ComboView): number {
  const totalQuestions = COMBO_RUNS_PER_CHALLENGE * view.questionsPerRun;
  const done = view.runIndex * view.questionsPerRun + (view.questionNumber - 1);
  return Math.min(100, Math.round((done / totalQuestions) * 100));
}

/**
 * What the streak is worth if it is banked right now.
 *
 * Read straight off the projection: the runtime already added the survival
 * bonus when it paid the forced question, so the client must not add one.
 */
export function comboStreakPoints(view: ComboView): number {
  return view.unbankedPoints;
}

/** The run in progress ends the challenge — used to word the recap button. */
export function comboIsFinalRun(view: ComboView): boolean {
  return comboRunNumber(view) >= COMBO_RUNS_PER_CHALLENGE;
}

/** A finished run belonging to this team, if it has already played. */
export function comboRunOf(
  view: ComboView,
  teamId: string,
): ComboRunResult | undefined {
  return view.runResults.find((run) => run.teamId === teamId);
}

/** Why a run ended, in the product's words. */
export function describeComboRunEnd(run: ComboRunResult): string {
  if (run.endedBy === "combo-break") return "كُسر الكومبو";
  if (run.endedBy === "cash-out") return "سحبوا النقاط";
  if (run.endedBy === "timeout") return "انتهى الوقت";
  return "أكملوا كل الأسئلة";
}
