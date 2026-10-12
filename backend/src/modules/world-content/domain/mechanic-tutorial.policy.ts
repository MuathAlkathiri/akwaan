import {
  RyoDecision,
  RyoPayoffMatrixRule,
} from '../../scoring/application/ryo-payoff-matrix.rule';
import {
  ARABIC_DUPLICATE_THRESHOLD,
  arabicTextSimilarity,
  normalizeArabicText,
} from '../../../common/utils/arabic-text-similarity.util';
import { WorldContentIssue } from './world-content.types';

/**
 * The educational scenario a mechanic demonstrates, and the rules that decide
 * whether it may be published.
 *
 * One scenario per mechanic, keyed by the ChallengeType's canonical slug. Not
 * per World and not per Scope: the thing being taught is the *mechanic*, and a
 * host who has seen how "اقرأ خصمك" works has learned it everywhere.
 *
 * Two properties make this safe to show publicly, and both are enforced here
 * rather than trusted:
 *
 * 1. **The outcome is derived, never authored.** An editor chooses what the two
 *    sides *do*; the score that follows is computed by `RyoPayoffMatrixRule` —
 *    the same calculator the real Match scores with. A tutorial therefore cannot
 *    teach scoring the game does not actually apply, and cannot drift when the
 *    rule changes.
 * 2. **It is not competitive content.** A tutorial names no ContentItem, draws
 *    nothing from the catalog, and reserves nothing. The overlap guard below
 *    additionally refuses a prompt that is the same question as something a
 *    team could still be asked — because a publicly shown answer must never be
 *    an answer worth points later.
 */

/** Exactly four, because the mechanic's phone surface shows four. */
export const TUTORIAL_OPTION_COUNT = 4;

/** The sentinel a tutorial carries where a real round carries a ContentItem. */
export const TUTORIAL_CONTENT_ITEM_ID = 'tutorial';

export interface TutorialOption {
  id: string;
  label: string;
}

/** What an editor authors. */
export interface TutorialScenarioInput {
  prompt: string;
  options: TutorialOption[];
  correctOptionId: string;
  /** What the answering team is shown to pick. */
  answeringSelectionOptionId: string;
  /** How the reading team is shown to call it. */
  opposingDecision: RyoDecision;
  /** Optional teaching line; the beat captions themselves stay in code. */
  caption?: string;
}

/** The derived half — computed here, never accepted from a client. */
export interface TutorialOutcome {
  /** Which side the point moves to, by role rather than by team id. */
  teamRole: 'answering' | 'opposing';
  delta: number;
  reason: string;
  correct: boolean;
}

export interface TutorialScenario extends TutorialScenarioInput {
  outcome: TutorialOutcome;
}

const DEMO_ANSWERING_TEAM = 'tutorial-answering';
const DEMO_OPPOSING_TEAM = 'tutorial-opposing';

/**
 * The real calculator, instantiated directly.
 *
 * It is a pure `calculate()` with no injected collaborators, so using it here
 * costs nothing and guarantees the tutorial and the Match cannot disagree. A
 * transcription would be a second implementation of the scoring rules, which is
 * exactly what must not exist.
 */
const payoffRule = new RyoPayoffMatrixRule();

export function deriveTutorialOutcome(
  input: Pick<
    TutorialScenarioInput,
    'correctOptionId' | 'answeringSelectionOptionId' | 'opposingDecision'
  >,
): TutorialOutcome {
  const correct = input.answeringSelectionOptionId === input.correctOptionId;
  const [event] = payoffRule.calculate({
    answeringTeamId: DEMO_ANSWERING_TEAM,
    opposingTeamId: DEMO_OPPOSING_TEAM,
    // No ContentItem exists for a tutorial, and none is invented: the sentinel
    // makes that visible in anything that ever logs this.
    contentItemId: TUTORIAL_CONTENT_ITEM_ID,
    itemIndex: 0,
    selectedAnswer: input.answeringSelectionOptionId,
    correctAnswer: input.correctOptionId,
    decision: input.opposingDecision,
    correct,
  });

  return {
    teamRole: event.teamId === DEMO_ANSWERING_TEAM ? 'answering' : 'opposing',
    delta: event.delta,
    reason: event.reason,
    correct,
  };
}

/** Structural validation. Returns every problem, not the first. */
export function validateTutorialScenario(
  input: TutorialScenarioInput,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  const add = (code: string, message: string, details?: Record<string, unknown>) =>
    issues.push(details ? { code, message, details } : { code, message });

  if (!input.prompt?.trim()) {
    add('TUTORIAL_PROMPT_REQUIRED', 'السؤال التوضيحي مطلوب.');
  }

  const options = input.options ?? [];
  if (options.length !== TUTORIAL_OPTION_COUNT) {
    add(
      'TUTORIAL_OPTION_COUNT',
      `يجب أن تكون الخيارات ${TUTORIAL_OPTION_COUNT} بالضبط.`,
      { received: options.length },
    );
  }

  if (options.some((option) => !option?.id?.trim() || !option?.label?.trim())) {
    add('TUTORIAL_OPTION_INCOMPLETE', 'كل خيار يحتاج معرّفًا ونصًا.');
  }

  const ids = options.map((option) => option?.id?.trim()).filter(Boolean);
  if (new Set(ids).size !== ids.length) {
    add('TUTORIAL_OPTION_IDS_DUPLICATED', 'معرّفات الخيارات مكررة.');
  }

  // Two options reading the same thing make the demonstrated "read" meaningless,
  // so near-duplicates are rejected with the same normalization used everywhere.
  const labels = options
    .map((option) => normalizeArabicText(option?.label ?? ''))
    .filter(Boolean);
  if (new Set(labels).size !== labels.length) {
    add('TUTORIAL_OPTION_LABELS_DUPLICATED', 'نصوص الخيارات مكررة.');
  }

  const known = new Set(ids);
  if (!known.has(input.correctOptionId?.trim())) {
    add('TUTORIAL_CORRECT_OPTION_UNKNOWN', 'الإجابة الصحيحة ليست ضمن الخيارات.');
  }
  if (!known.has(input.answeringSelectionOptionId?.trim())) {
    add(
      'TUTORIAL_SELECTION_UNKNOWN',
      'اختيار الفريق المجيب ليس ضمن الخيارات.',
    );
  }
  if (input.opposingDecision !== 'TRUST' && input.opposingDecision !== 'STEAL') {
    add('TUTORIAL_DECISION_INVALID', 'قرار الفريق الخصم غير صالح.');
  }

  return issues;
}

export interface CompetitivePrompt {
  contentItemId: string;
  prompt: string;
}

export interface TutorialOverlapMatch {
  contentItemId: string;
  similarity: number;
}

/**
 * The content-safety gate: a tutorial may not be a question still worth points.
 *
 * Publishing shows the correct answer to every host, so if the same question can
 * still be drawn competitively, the tutorial has leaked it. There is no
 * tutorial-only flag on ContentItem and this guard deliberately does not add
 * one — it never touches the catalog. It only refuses to publish an overlap,
 * which keeps the two bodies of content separate without mutating either.
 */
export function findTutorialOverlap(
  prompt: string,
  competitive: CompetitivePrompt[],
  threshold = ARABIC_DUPLICATE_THRESHOLD,
): TutorialOverlapMatch[] {
  const normalized = normalizeArabicText(prompt);
  if (!normalized) return [];
  return competitive
    .map((candidate) => ({
      contentItemId: candidate.contentItemId,
      similarity: arabicTextSimilarity(
        normalized,
        normalizeArabicText(candidate.prompt),
      ),
    }))
    .filter((candidate) => candidate.similarity >= threshold)
    .sort((left, right) => right.similarity - left.similarity);
}
