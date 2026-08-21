import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
} from './world-content.constants';
import { WorldContentValidationError } from './world-content.errors';
import { WorldContentIssue } from './world-content.types';

/**
 * "الكومبو" authored content, in the canonical World Content model.
 *
 * Combo is played as two Runs of four questions of rising stage, so a challenge
 * is a selection of eight ordinary ContentItems: two at each of the four stages.
 * Nothing new is nested inside a document and no new media format appears —
 * exactly the shape Bomb, "مين اقرب" and "بدليل واحد" already use, at a
 * different cardinality.
 *
 * The one thing Combo needs that no shared field carries is **which stage of the
 * run an item belongs to**. It lives in `mechanicPayload.comboStage`, owned by
 * this mechanic, for the same reason "بدليل واحد" owns `clues` and "ركّبها" owns
 * `segments`.
 *
 * It is deliberately *not* a shared `difficulty` field. `difficulty` is a
 * REJECTED_LEGACY_CONTENT_FIELD — the World Content domain carries no points and
 * no difficulty — and Combo is not entitled to reintroduce that vocabulary for
 * every other mechanic. A Combo stage is a position in Combo's own progression,
 * meaningful only to Combo.
 */

export const COMBO_STAGE_COUNT = 4;
export const COMBO_RUNS_PER_CHALLENGE = 2;
/** Two Runs of four questions: one item per stage per Run. */
export const COMBO_ITEM_COUNT = COMBO_STAGE_COUNT * COMBO_RUNS_PER_CHALLENGE;
export const COMBO_MAX_ANSWERS = 10;
export const COMBO_MAX_ANSWER_LENGTH = 120;
export const COMBO_STAGES = [1, 2, 3, 4] as const;

export type ComboStage = (typeof COMBO_STAGES)[number];

/** The shape this policy needs from a persisted item; nothing more. */
export interface ComboCandidateItem {
  id: string;
  status: ContentItemStatus;
  worldId: string;
  scopeId: string;
  prompt: unknown;
  answerMode?: ChallengeAnswerMode;
  acceptedAnswers?: string[];
  mechanicPayload?: Record<string, unknown>;
}

export interface ComboAuthoredQuestion {
  contentItemId: string;
  scopeId: string;
  stage: ComboStage;
  prompt: unknown;
  acceptedAnswers: string[];
}

function reject(code: string, message: string): never {
  throw new WorldContentValidationError(
    [{ code, message } as WorldContentIssue],
    message,
  );
}

/**
 * Whether a value is an authored Combo stage.
 *
 * The single home of the rule. Authoring-time validation and launch-time
 * validation both ask this, so an item the admin form accepted can never be one
 * the plan builder rejects.
 */
export function isComboStage(value: unknown): value is ComboStage {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    COMBO_STAGES.includes(value as ComboStage)
  );
}

/** The authored stage of one item, or a rejection explaining why it has none. */
export function comboStageOf(
  item: ComboCandidateItem,
  position: number,
): ComboStage {
  const raw = item.mechanicPayload?.comboStage;
  if (!isComboStage(raw)) {
    reject(
      'COMBO_ITEM_STAGE_INVALID',
      `Item ${position} needs mechanicPayload.comboStage of 1, 2, 3 or 4; Combo's run rises through four stages.`,
    );
  }
  return raw as ComboStage;
}

/**
 * Validate one candidate and reduce it to the question the runtime will play.
 *
 * Combo grades typed text, so an item must carry a MATCH payload with accepted
 * answers — the same contract Bomb uses, through the same normalizer.
 */
export function validateComboItem(
  item: ComboCandidateItem,
  input: { worldId: string; position: number },
): ComboAuthoredQuestion {
  const { position } = input;
  if (item.status !== ContentItemStatus.READY) {
    reject(
      'COMBO_ITEM_NOT_READY',
      `Item ${position} is not ready and cannot be played.`,
    );
  }
  if (item.worldId !== input.worldId) {
    reject(
      'COMBO_ITEM_WORLD_MISMATCH',
      `Item ${position} belongs to another World.`,
    );
  }
  if (item.answerMode && item.answerMode !== ChallengeAnswerMode.MATCH) {
    reject(
      'COMBO_ITEM_ANSWER_MODE_INVALID',
      `Item ${position} must use a match answer; Combo grades typed text.`,
    );
  }
  const authored = item.acceptedAnswers ?? [];
  if (!authored.length || authored.length > COMBO_MAX_ANSWERS) {
    reject(
      'COMBO_ITEM_ANSWERS_INVALID',
      `Item ${position} needs 1–${COMBO_MAX_ANSWERS} accepted answers.`,
    );
  }
  if (authored.some((answer) => answer.length > COMBO_MAX_ANSWER_LENGTH)) {
    reject(
      'COMBO_ITEM_ANSWER_TOO_LONG',
      `Item ${position} has an accepted answer longer than ${COMBO_MAX_ANSWER_LENGTH} characters.`,
    );
  }
  // Normalized once, here, so gameplay compares like with like and two
  // spellings of the same answer cannot both be "accepted" separately.
  const normalized = [...new Set(authored.map(normalizeAnswer))].filter(
    Boolean,
  );
  if (!normalized.length) {
    reject(
      'COMBO_ITEM_ANSWERS_INVALID',
      `Item ${position} has no usable accepted answer after normalization.`,
    );
  }
  return {
    contentItemId: item.id,
    scopeId: item.scopeId,
    stage: comboStageOf(item, position),
    prompt: item.prompt,
    acceptedAnswers: normalized,
  };
}

/**
 * Build the whole challenge plan: two Runs, four rising stages each.
 *
 * Deterministic by construction. The selection arrives already spread across the
 * occurrence's Scopes by `MatchContentSelector`, and this function only ever
 * reads that order — so the same selection always produces the same plan, which
 * is what lets a reconnecting client be handed the question it left rather than
 * a freshly rolled one.
 *
 * Where a stage offers a genuine choice, the Run that has not yet used the
 * item's Scope takes it. That is the "avoid repeating a Scope inside one Run"
 * preference, expressed as a tie-break rather than as a constraint — it never
 * reorders stages and never rejects otherwise valid content.
 */
export function buildComboQuestionPlan(
  candidates: ComboCandidateItem[],
  input: { worldId: string },
): ComboAuthoredQuestion[][] {
  if (
    candidates.length !== COMBO_ITEM_COUNT ||
    new Set(candidates.map((item) => item.id)).size !== COMBO_ITEM_COUNT
  ) {
    reject(
      'COMBO_REQUIRES_EIGHT_ITEMS',
      `Combo needs exactly ${COMBO_ITEM_COUNT} distinct items: two at each of the four stages.`,
    );
  }
  const validated = candidates.map((item, index) =>
    validateComboItem(item, { worldId: input.worldId, position: index + 1 }),
  );
  const byStage = new Map<ComboStage, ComboAuthoredQuestion[]>();
  for (const question of validated) {
    byStage.set(question.stage, [
      ...(byStage.get(question.stage) ?? []),
      question,
    ]);
  }
  for (const stage of COMBO_STAGES) {
    if ((byStage.get(stage) ?? []).length !== COMBO_RUNS_PER_CHALLENGE) {
      reject(
        'COMBO_STAGE_COVERAGE_INVALID',
        `Combo needs exactly ${COMBO_RUNS_PER_CHALLENGE} items at stage ${stage}, one per run.`,
      );
    }
  }
  const runs: ComboAuthoredQuestion[][] = Array.from(
    { length: COMBO_RUNS_PER_CHALLENGE },
    () => [],
  );
  const usedScopes = runs.map(() => new Set<string>());
  for (const stage of COMBO_STAGES) {
    const [first, second] = byStage.get(stage)!;
    // Give run 0 whichever of the pair it has not already drawn a Scope from.
    const swap =
      usedScopes[0].has(first.scopeId) && !usedScopes[0].has(second.scopeId);
    const forRun0 = swap ? second : first;
    const forRun1 = swap ? first : second;
    runs[0].push(forRun0);
    runs[1].push(forRun1);
    usedScopes[0].add(forRun0.scopeId);
    usedScopes[1].add(forRun1.scopeId);
  }
  return runs;
}
