import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  RYO_CONFIDENCE_BANDS,
  RYO_TARGET_CONFIDENCE_BANDS,
  type RyoConfidenceBand,
} from './candidate-generator.service';
import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import { ScreenFinding } from '../schemas/engine-candidate.schema';

export interface ScreenResult {
  passed: boolean;
  findings: ScreenFinding[];
}

/**
 * Arabic demonstratives. A prompt that says "this ability" is pointing at
 * something; if nothing is attached, it points at nothing.
 */
const DEMONSTRATIVES = ['هذه', 'هذا', 'هؤلاء', 'تلك', 'ذلك', 'هذي'];

/**
 * Phrases where a demonstrative legitimately refers to the answer options
 * themselves rather than to absent media — "which of these…".
 */
const OPTION_REFERENCES = [
  'من هذه',
  'من هؤلاء',
  'من هذي',
  'هذه الخيارات',
  'هذه الإجابات',
];

/**
 * Below this many positions a slider stops being an estimation surface. The
 * pilot's «primary colours in RGB» item ran 2-5 by a step of 1: four positions,
 * which is a multiple-choice question wearing a slider.
 */
const MIN_SLIDER_POSITIONS = 10;

/** Written without diacritics and with alef folded; see `timeStability`. */
const TIME_UNSTABLE_MARKERS = [
  'حتى الان',
  'حتى اليوم',
  'حاليا',
  'هذا العام',
  'هذا الموسم',
  'في الوقت الحالي',
];

/**
 * Roadmap §6.1: a multiple-choice prompt carries 2-4 options. Four is a phone
 * screen's comfortable limit, and the ceiling is a gameplay rule rather than a
 * schema convenience.
 */
const MAX_ANSWER_OPTIONS = 4;

/**
 * Outer fraction of a span, inclusive, in which a target is flagged as badly
 * placed. A single-seeded fruit one step from the end of a 0-20 slider sits
 * exactly on this line, and that is the case worth catching.
 */
const ENDPOINT_PROXIMITY_FRACTION = 0.05;

/** Share of an exemplar phrase's words a candidate may share before warning. */
const EXEMPLAR_OVERLAP_THRESHOLD = 0.7;

/** Content words, folded for comparison. Arabic and Latin alike. */
const words = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((word) => word.length > 2);

/**
 * The quoted prompts and domain lines of a Scope's `EXEMPLARS.md`.
 *
 * Only the lines that describe an item are taken — block quotes and `Domain:`
 * bullets — so the file's prose about authoring rules does not become a
 * similarity target in its own right.
 */
const exemplarPhrases = (exemplars?: string): string[][] => {
  if (!exemplars) return [];
  return exemplars
    .split('\n')
    .filter(
      (line) =>
        line.trimStart().startsWith('>') || /^-\s*Domain:/i.test(line.trim()),
    )
    .map((line) => words(line))
    .filter((phrase) => phrase.length >= 4);
};

/**
 * Worked examples inside a mechanic profile.
 *
 * Narrow on purpose. The profile is thousands of words of rules, and treating
 * all of it as a similarity corpus would flag any candidate that happened to
 * discuss the mechanic's own vocabulary. Only the italic phrase on a line that
 * opens with a bold `Works` or `Fails` marker is taken — the convention the
 * profiles use to label a retired subject.
 */
const mechanicRetiredPhrases = (profile?: string): string[][] => {
  if (!profile) return [];
  const phrases: string[][] = [];
  for (const line of profile.split('\n')) {
    const match = /^\*\*(?:Works|Fails)\*\*\s*[—-]\s*\*([^*]+)\*/.exec(
      line.trim(),
    );
    if (match) {
      const phrase = words(match[1]);
      if (phrase.length >= 4) phrases.push(phrase);
    }
  }
  return phrases;
};

/**
 * Order-independent identity for a multiple-choice puzzle.
 *
 * Built from the normalized prompt and the normalized option labels, sorted.
 * Both halves go through the same canonical normalizer the runtime grades
 * with, so whitespace, punctuation, diacritics and Arabic letter-form variants
 * already collapse before they reach here.
 */
const multipleChoiceIdentity = (
  normalizedPrompt: string,
  normalizedLabels: string[],
): string =>
  `mc:${normalizedPrompt}|${[...normalizedLabels]
    .filter(Boolean)
    .sort()
    .join('~')}`;

const blocking = (code: string, message: string): ScreenFinding => ({
  code,
  severity: 'blocking',
  message,
});
const warning = (code: string, message: string): ScreenFinding => ({
  code,
  severity: 'warning',
  message,
});
const deferred = (code: string, message: string): ScreenFinding => ({
  code,
  severity: 'deferred',
  message,
});

/**
 * The cheap gate, run before a single judging token is spent.
 *
 * Everything here is deterministic and free. That is the point: the economics
 * of the engine depend on rejecting weak candidates *before* they reach an AI
 * judge, and on the judge's output never being what decides structural
 * validity.
 *
 * Findings are three-way on purpose:
 *
 *   blocking  the candidate is wrong and stops here
 *   warning   a human should look, but it may be fine
 *   deferred  a check that genuinely cannot run yet, named rather than skipped
 *
 * The third category matters. Phase 1c runs the canonical compatibility policy
 * in a separate stage, so this screen records only checks that genuinely belong
 * later (factual verification and incomplete novelty coverage).
 */
@Injectable()
export class DeterministicScreenService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Puzzle identities already seen in this batch, mapped to their answer.
   *
   * Identity is **not** the prompt. A multiple-choice prompt is often a generic
   * stem — «ما العنصر الدخيل؟» — with the puzzle itself living in the options,
   * so prompt-only identity reported two unrelated Spot-the-Error puzzles as
   * duplicates and blocked a sound candidate (§30.11). The value stored is the
   * candidate's normalized correct answer, which is what lets a repeat of the
   * same puzzle with a *different* key be reported as the contradiction it is
   * rather than as an ordinary duplicate.
   *
   * Keys are namespaced per answer mode so the two schemes cannot collide.
   */
  private seenInBatch = new Map<string, string>();

  /**
   * Phrases drawn from the retired examples a generator was shown.
   *
   * Two sources, one list: the Scope's `EXEMPLARS.md` and the worked examples
   * inside the mechanic profile. Both are declared retired in their own text,
   * and a generator reaches for whichever is nearest — Phase 2h copied the
   * Scope's, Phase 2i copied the mechanic's. Keeping one list avoids a second
   * place to maintain; the extractors stay narrow so prose about rules does
   * not become a similarity target.
   */
  private exemplarPhrases: string[][] = [];

  beginBatch(exemplars?: string, mechanicProfile?: string): void {
    this.seenInBatch = new Map<string, string>();
    this.exemplarPhrases = [
      ...exemplarPhrases(exemplars),
      ...mechanicRetiredPhrases(mechanicProfile),
    ];
  }

  /**
   * The cross-batch novelty index.
   *
   * Coverage is small — 32 concepts at the time of writing, and the records are
   * not keyed by Scope — so a miss here is **not** evidence a candidate is
   * novel. It is reported as a warning when it hits and claimed as nothing when
   * it does not.
   */
  private knownSubjects(): Set<string> {
    const root =
      this.config.get<string>('ENGINE_AUTHORING_ROOT')?.trim() ?? process.cwd();
    const path = join(root, 'ai/.opencode/authoring-concept-history.json');
    if (!existsSync(path)) return new Set();
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
        concepts?: { conceptKey?: { subject?: string } }[];
      };
      return new Set(
        (parsed.concepts ?? [])
          .map((concept) => normalizeAnswer(concept.conceptKey?.subject ?? ''))
          .filter(Boolean),
      );
    } catch {
      return new Set();
    }
  }

  screen(
    draft: Record<string, unknown>,
    authoring?: Record<string, unknown> | null,
  ): ScreenResult {
    const findings: ScreenFinding[] = [];

    const prompt = ((draft.prompt as { ar?: string })?.ar ?? '').trim();
    const payload = draft.answerPayload as
      | {
          mode?: string;
          options?: { id?: string; label?: { ar?: string } }[];
          correctOptionId?: string;
        }
      | undefined;

    // --- required fields ------------------------------------------------
    if (!prompt)
      findings.push(blocking('PROMPT_REQUIRED', 'Arabic prompt is empty'));
    if (!payload) {
      findings.push(
        blocking('ANSWER_PAYLOAD_REQUIRED', 'answerPayload is missing'),
      );
      return { passed: false, findings };
    }

    // --- answer payload integrity (mirrors the backend policy's rules) ---
    if (payload.mode === 'closest') {
      findings.push(...this.screenClosest(draft, prompt, authoring));
      findings.push(...this.deferredNotes());
      return {
        passed: !findings.some((finding) => finding.severity === 'blocking'),
        findings,
      };
    }
    if (payload.mode !== 'multiple_choice') {
      findings.push(
        blocking(
          'ANSWER_MODE_UNSUPPORTED',
          `mode "${payload.mode}" is not supported`,
        ),
      );
    }
    const options = payload.options ?? [];
    if (options.length < 2) {
      findings.push(
        blocking('ANSWER_OPTIONS_REQUIRED', 'at least two options required'),
      );
    }
    // Roadmap §6.1: an RYO prompt is multiple choice with **2-4 options**, or a
    // numeric estimate, and never open free text. The lower bound is enforced
    // above and again by `ContentItemCompatibilityPolicy`; the upper bound was
    // carried only by `maxItems` in the generation schema, which OpenAI strict
    // structured outputs rejects. Enforcing it here keeps the gameplay rule
    // independent of which provider generated the candidate — and of whether a
    // schema can express it at all.
    if (options.length > MAX_ANSWER_OPTIONS) {
      findings.push(
        blocking(
          'ANSWER_OPTIONS_TOO_MANY',
          `at most ${MAX_ANSWER_OPTIONS} options are allowed; ${options.length} were authored`,
        ),
      );
    }

    const ids = options.map((option) => (option.id ?? '').trim());
    if (ids.some((id) => !id)) {
      findings.push(
        blocking('ANSWER_OPTION_ID_REQUIRED', 'every option needs an id'),
      );
    }
    if (new Set(ids).size !== ids.length) {
      findings.push(
        blocking('DUPLICATE_ANSWER_OPTION_ID', 'option ids must be unique'),
      );
    }

    const labels = options.map((option) => (option.label?.ar ?? '').trim());
    if (labels.some((label) => !label)) {
      findings.push(
        blocking('ANSWER_OPTION_LABEL_REQUIRED', 'every option needs text'),
      );
    }
    const normalizedLabels = labels.map((label) => normalizeAnswer(label));
    if (
      new Set(normalizedLabels.filter(Boolean)).size !==
      normalizedLabels.filter(Boolean).length
    ) {
      // The same canonical normalizer the runtime grades with: two options that
      // normalize alike are one answer offered twice.
      findings.push(
        blocking(
          'DUPLICATE_ANSWER_OPTION_LABEL',
          'two options read the same once normalized',
        ),
      );
    }
    if (!ids.includes((payload.correctOptionId ?? '').trim())) {
      findings.push(
        blocking(
          'CORRECT_OPTION_NOT_IN_OPTIONS',
          'correctOptionId is not one of the options',
        ),
      );
    }

    // --- answer leakage --------------------------------------------------
    const correct = options.find(
      (option) =>
        (option.id ?? '').trim() === (payload.correctOptionId ?? '').trim(),
    );
    const correctLabel = correct?.label?.ar ?? '';
    const normalizedPrompt = normalizeAnswer(prompt);
    if (correctLabel && this.detectAnswerLeakage(prompt, correctLabel)) {
      findings.push(
        blocking(
          'ANSWER_LEAKAGE',
          'the correct answer appears in the prompt text',
        ),
      );
    }

    // --- anagram letter multiset verification ----------------------------
    const anagramFinding = this.checkAnagramLetterConsistency(
      prompt,
      correctLabel,
    );
    if (anagramFinding) {
      findings.push(anagramFinding);
    }

    // --- text normalization ----------------------------------------------
    if (prompt !== prompt.replace(/\s{2,}/g, ' ')) {
      findings.push(
        warning('PROMPT_WHITESPACE', 'collapse repeated whitespace'),
      );
    }
    if (!/[؀-ۿ]/.test(prompt)) {
      findings.push(
        warning('PROMPT_NOT_ARABIC', 'prompt contains no Arabic script'),
      );
    }

    // --- dangling reference ------------------------------------------------
    // Caught deterministically because the rule is checkable: a demonstrative
    // with no media and no option-reference has no referent. "وش اسم هذه
    // القدرة" asks about something the player was never shown. Kept to a
    // warning — a reviewer confirms whether media was intended or the wording
    // should change — because the judgement of *which* is subjective.
    const mediaAttached = Boolean(
      (draft.media as { assets?: unknown[] } | undefined)?.assets?.length,
    );
    if (!mediaAttached) {
      const refersToOptions = OPTION_REFERENCES.some((phrase) =>
        prompt.includes(phrase),
      );
      const dangling = DEMONSTRATIVES.find((word) => prompt.includes(word));
      if (dangling && !refersToOptions) {
        findings.push(
          warning(
            'DANGLING_DEMONSTRATIVE',
            `prompt says "${dangling}" but carries no media — the reference has nothing to point at`,
          ),
        );
      }
    }

    // --- duplication ------------------------------------------------------
    if (normalizedPrompt) {
      // Prompt plus the option set, order-independent. Option *ids* are
      // generated and carry no meaning, so they are excluded deliberately:
      // regenerating them must not make the same puzzle look new. Sorting the
      // labels is what catches a reshuffle. Authoring rationale, confidence
      // and provider metadata are excluded — none of them is the puzzle.
      const identity = multipleChoiceIdentity(
        normalizedPrompt,
        normalizedLabels,
      );
      const seenAnswer = this.seenInBatch.get(identity);
      if (seenAnswer !== undefined) {
        if (seenAnswer === correctLabel) {
          findings.push(
            blocking(
              'DUPLICATE_IN_BATCH',
              'another candidate asks the same thing',
            ),
          );
        } else {
          // The same puzzle keyed two different ways. At most one can be
          // right, so this is reported as the contradiction it is rather than
          // being waved through as two independent items.
          findings.push(
            blocking(
              'CONFLICTING_ANSWER_KEY_IN_BATCH',
              'another candidate offers this same puzzle with a different correct answer',
            ),
          );
        }
      } else {
        this.seenInBatch.set(identity, correctLabel);
      }
      const known = this.knownSubjects();
      if (correctLabel && known.has(correctLabel)) {
        findings.push(
          warning(
            'NOVELTY_INDEX_MATCH',
            'this answer subject appears in the concept history',
          ),
        );
      }
    }

    // --- what cannot be checked here --------------------------------------
    findings.push(
      ...this.ryoRationale(options, payload.correctOptionId, authoring),
    );
    // The same check the closest path runs, against the same corpus.
    //
    // It lived only inside `screenClosest`, so it never saw a multiple-choice
    // candidate. The Phase 2m RYO pilot produced three verbatim copies of the
    // Scope's worked examples and every one screened clean. `concept` is
    // included on the candidate side for the reason Phase 2i established: an
    // Arabic prompt can share no words with an English worked example while
    // the concept restates it almost exactly.
    findings.push(...this.exemplarImitation(prompt, [authoring?.concept]));
    findings.push(...this.deferredNotes());

    return {
      passed: !findings.some((finding) => finding.severity === 'blocking'),
      findings,
    };
  }

  /**
   * Closest-specific structure, mirroring `validateClosestSlider` in the
   * compatibility policy so a candidate fails here — free — rather than at
   * draft creation after a human has already read it.
   *
   * Everything checkable is checked. Whether the span is *honest* — chosen from
   * the question's domain rather than drawn around the answer — is a judgement
   * no rule can make, and stays with the reviewer and the rubric.
   */
  private screenClosest(
    draft: Record<string, unknown>,
    prompt: string,
    authoring?: Record<string, unknown> | null,
  ): ScreenFinding[] {
    const findings: ScreenFinding[] = [];
    const payload = draft.answerPayload as {
      correctValue?: unknown;
      acceptedTolerance?: unknown;
    };
    const slider = (
      draft.mechanicPayload as
        { closestSlider?: Record<string, unknown> } | undefined
    )?.closestSlider;

    const finite = (value: unknown): value is number =>
      typeof value === 'number' && Number.isFinite(value);
    const target = payload.correctValue;

    if (!finite(target)) {
      findings.push(
        blocking(
          'NUMERIC_ANSWER_REQUIRED',
          'a closest item needs a finite numeric target',
        ),
      );
    }

    if (payload.acceptedTolerance !== undefined) {
      const tolerance = payload.acceptedTolerance;
      if (!finite(tolerance) || tolerance < 0) {
        findings.push(
          blocking(
            'INVALID_ANSWER_TOLERANCE',
            'tolerance must be a finite number of zero or more',
          ),
        );
      } else {
        // Valid but inert: the Closest runtime grades nearest-wins and never
        // reads it. Surfaced so a reviewer is not misled into thinking it does.
        findings.push(
          warning(
            'CLOSEST_TOLERANCE_IGNORED',
            'the Closest runtime grades by nearest answer and ignores acceptedTolerance',
          ),
        );
      }
    }

    if (!slider) {
      // New content must choose an interaction mode; a sliderless item is the
      // legacy shape the authoring guard exists to refuse.
      findings.push(
        blocking(
          'CLOSEST_SLIDER_MODE_REQUIRED',
          'a new closest item must author a slider',
        ),
      );
      return findings;
    }

    const mode = slider.mode;
    const min = slider.min;
    const max = slider.max;
    const step = slider.step;
    const unit = slider.unit;
    const displayFormat = slider.displayFormat;

    if (mode !== 'numeric-range' && mode !== 'between-anchors') {
      findings.push(
        blocking(
          'CLOSEST_SLIDER_MODE_REQUIRED',
          `slider mode "${String(mode)}" is not authorable`,
        ),
      );
    }

    if (!finite(min) || !finite(max) || min >= max) {
      findings.push(
        blocking(
          'CLOSEST_SLIDER_RANGE_INVALID',
          'min and max must be finite with min < max',
        ),
      );
    } else if (finite(target) && (target < min || target > max)) {
      findings.push(
        blocking(
          'CLOSEST_SLIDER_TARGET_OUT_OF_RANGE',
          `target ${target} is outside [${min}, ${max}]`,
        ),
      );
    }

    if (step !== undefined) {
      if (!finite(step) || step <= 0) {
        findings.push(
          blocking(
            'CLOSEST_SLIDER_STEP_INVALID',
            'step must be a positive finite number',
          ),
        );
      } else if (
        finite(min) &&
        finite(target) &&
        Math.abs((target - min) / step - Math.round((target - min) / step)) >
          1e-8
      ) {
        findings.push(
          blocking(
            'CLOSEST_SLIDER_TARGET_STEP_INVALID',
            `target ${target} is not reachable from ${min} in steps of ${step}`,
          ),
        );
      }
    }

    if (
      displayFormat !== undefined &&
      displayFormat !== 'number' &&
      displayFormat !== 'calendar-year'
    ) {
      findings.push(
        blocking(
          'CLOSEST_SLIDER_DISPLAY_FORMAT_INVALID',
          'unsupported displayFormat',
        ),
      );
    }
    if (displayFormat === 'calendar-year' && unit !== undefined) {
      findings.push(
        blocking(
          'CLOSEST_SLIDER_YEAR_UNIT_FORBIDDEN',
          'a calendar-year slider takes no unit',
        ),
      );
    }
    if (
      unit !== undefined &&
      (typeof unit !== 'string' || unit.trim().length > 40)
    ) {
      findings.push(
        blocking(
          'CLOSEST_SLIDER_UNIT_INVALID',
          'unit must be at most 40 characters',
        ),
      );
    }

    // --- leakage: the number itself must not sit in the question ----------
    if (finite(target)) {
      const western = String(target);
      const arabicIndic = western.replace(
        /[0-9]/g,
        (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)],
      );
      const boundary = new RegExp(`(^|[^0-9])${western}([^0-9]|$)`);
      if (boundary.test(prompt) || prompt.includes(arabicIndic)) {
        findings.push(
          blocking(
            'ANSWER_LEAKAGE',
            `the target ${target} appears in the prompt text`,
          ),
        );
      }
    }

    if (prompt && prompt.trim().length < 12) {
      findings.push(
        warning(
          'PROMPT_UNDERSPECIFIED',
          'prompt is very short for an estimation question',
        ),
      );
    }

    // --- the model's own grid arithmetic, checked ------------------------
    // The schema makes the generator state `stepsFromMin` rather than leave
    // the division implicit. Checking it is pure arithmetic on values the
    // model supplied, so it cannot produce a false positive: either the
    // identity holds or the model did not do the work it claimed.
    const claimedSteps = authoring?.stepsFromMin;
    if (
      typeof claimedSteps === 'number' &&
      Number.isFinite(claimedSteps) &&
      finite(min) &&
      finite(step) &&
      step > 0 &&
      finite(target)
    ) {
      if (!Number.isInteger(claimedSteps)) {
        findings.push(
          blocking(
            'CLOSEST_STEP_GRID_MISMATCH',
            `stepsFromMin ${claimedSteps} is not a whole number of steps`,
          ),
        );
      } else if (Math.abs(min + claimedSteps * step - target) > 1e-8) {
        findings.push(
          blocking(
            'CLOSEST_STEP_GRID_MISMATCH',
            `stated stepsFromMin ${claimedSteps} gives ${
              min + claimedSteps * step
            }, not the target ${target}`,
          ),
        );
      }
    }

    // --- a slider with too few positions is a multiple choice ------------
    if (finite(min) && finite(max) && finite(step) && step > 0 && max > min) {
      const positions = (max - min) / step;
      if (positions < MIN_SLIDER_POSITIONS) {
        findings.push(
          warning(
            'CLOSEST_SLIDER_RESOLUTION_TRIVIAL',
            `the slider offers only ${
              Math.floor(positions) + 1
            } positions; there is little to estimate`,
          ),
        );
      }
    }

    // --- a target sitting on, or beside, an endpoint ---------------------
    // Pilot 02 produced a 1-1024 slider whose answer was 1024: a team that
    // drags to the end and confirms wins outright. This is the same family as
    // the midpoint signal the mechanic profile already records — objective
    // enough to measure, subjective enough that only a human should reject it.
    if (finite(min) && finite(max) && finite(target) && max > min) {
      const span = max - min;
      if (target === min || target === max) {
        findings.push(
          warning(
            'CLOSEST_TARGET_AT_ENDPOINT',
            `target ${target} sits exactly on ${
              target === min ? 'min' : 'max'
            }; the slider can be won without reasoning`,
          ),
        );
      } else if (
        Math.min(target - min, max - target) / span <=
        ENDPOINT_PROXIMITY_FRACTION
      ) {
        findings.push(
          warning(
            'CLOSEST_TARGET_NEAR_ENDPOINT',
            `target ${target} sits in the outer ${Math.round(
              ENDPOINT_PROXIMITY_FRACTION * 100,
            )}% of [${min}, ${max}]; check the span is domain-first`,
          ),
        );
      }
    }

    // --- the target seated exactly in the middle of its own range --------
    // A QA signal, never a rejection: the mechanic profile records that a
    // shared, independently defensible continuum may put one answer at its
    // midpoint honestly. It is reported because a thumb that starts centred
    // wins such an item without anyone reasoning.
    if (finite(min) && finite(max) && finite(target) && max > min) {
      if (Math.abs(target - (min + max) / 2) <= 1e-8) {
        findings.push(
          warning(
            'CLOSEST_TARGET_AT_MIDPOINT',
            `target ${target} is the exact midpoint of [${min}, ${max}]; confirm the span is domain-first`,
          ),
        );
      }
    }

    findings.push(...this.timeStability(prompt));
    findings.push(...this.batchDuplicate(prompt));
    findings.push(
      ...this.exemplarImitation(prompt, [
        authoring?.domainDescription,
        // The GPT-5 batch reproduced the mechanic profile's worked example,
        // and the match lived here: its Arabic prompt shared no words with the
        // English description, but its `concept` restated it almost verbatim.
        authoring?.concept,
      ]),
    );

    return findings;
  }

  /**
   * A candidate that reuses an exemplar's subject.
   *
   * Mechanic-neutral: the finding was once named for Closest because that was
   * the only path calling it, which read as a mistake the first time it fired
   * on a multiple-choice candidate.
   *
   * Both live pilots showed the generator reaching for the nearest concrete
   * pattern: with no exemplars it copied the mechanic profile's football
   * illustrations, and with exemplars it reproduced two of them with the
   * numbers changed. This measures word overlap against the exemplar text —
   * lexical, not semantic, and deliberately a warning. It cannot establish that
   * a candidate is derivative, only that it looks worth a second glance, and a
   * reviewer decides. The threshold is set high so ordinary shared vocabulary
   * ("tiles", "room") does not trip it.
   */
  private exemplarImitation(
    prompt: string,
    rationale: unknown[],
  ): ScreenFinding[] {
    if (!this.exemplarPhrases.length) return [];
    const extra = rationale
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
    const candidate = words(`${prompt} ${extra}`);
    if (candidate.length < 4) return [];
    const candidateSet = new Set(candidate);
    for (const phrase of this.exemplarPhrases) {
      if (phrase.length < 4) continue;
      const shared = phrase.filter((word) => candidateSet.has(word)).length;
      if (shared / phrase.length >= EXEMPLAR_OVERLAP_THRESHOLD) {
        return [
          warning(
            'CANDIDATE_RESEMBLES_EXEMPLAR',
            'this closely matches a worked example; exemplar subjects are retired and must not be reused',
          ),
        ];
      }
    }
    return [];
  }

  /**
   * Phrases that mark an answer as a moving target.
   *
   * A value that drifts after authoring cannot be graded — the first live pilot
   * produced two career totals qualified with «حتى الآن», both already stale by
   * the time a reviewer would see them. The markers are multi-word and
   * deliberately few, because the cost of a false positive here is a reviewer's
   * attention, not a rejection: this is a warning, never blocking. Deciding
   * whether a particular quantity really moves is a judgement, and judgement
   * stays with the human.
   */
  private timeStability(prompt: string): ScreenFinding[] {
    const folded = prompt
      .replace(/[\u064B-\u0652\u0670]/g, '')
      .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627');
    const hit = TIME_UNSTABLE_MARKERS.find((marker) => folded.includes(marker));
    return hit
      ? [
          warning(
            'ANSWER_MAY_BE_TIME_UNSTABLE',
            `"${hit}" suggests a value that changes after authoring; confirm the answer is fixed`,
          ),
        ]
      : [];
  }

  /**
   * Repeat prompts inside one batch.
   *
   * The multiple-choice path has always done this; the closest path returned
   * before reaching it, so a batch could carry the same question ten times
   * unremarked.
   */
  private batchDuplicate(prompt: string): ScreenFinding[] {
    // Closest is unchanged: its prompt carries the question, so prompt-only
    // identity is correct there. Namespaced so it cannot meet a
    // multiple-choice key.
    const normalized = normalizeAnswer(prompt);
    if (!normalized) return [];
    const identity = `closest:${normalized}`;
    if (this.seenInBatch.has(identity)) {
      return [
        warning(
          'DUPLICATE_PROMPT_IN_BATCH',
          'another candidate in this batch asks the same question',
        ),
      ];
    }
    this.seenInBatch.set(identity, '');
    return [];
  }

  /**
   * RYO authoring rationale: structure only.
   *
   * What is checked here is mechanical — that a rationale points at a real
   * incorrect option, exactly once, and that the confidence band is one of the
   * five. What is **not** checked is whether the rationale is any good or the
   * band is accurate: confidence is an authoring hypothesis about a table, not
   * measured player performance, and no deterministic rule can confirm it. A
   * band outside the mechanic's useful range is reported as the model's own
   * declaration, never as a verdict.
   *
   * Silent on candidates that carry no rationale at all, so content generated
   * before these fields existed screens exactly as it did before.
   */
  private ryoRationale(
    options: { id?: string }[],
    correctOptionId: string | undefined,
    authoring?: Record<string, unknown> | null,
  ): ScreenFinding[] {
    if (!authoring) return [];
    const findings: ScreenFinding[] = [];
    const correct = (correctOptionId ?? '').trim();
    const optionIds = new Set(
      options.map((option) => (option.id ?? '').trim()).filter(Boolean),
    );

    const rationale = authoring.distractorRationale;
    if (Array.isArray(rationale)) {
      const seen = new Set<string>();
      for (const entry of rationale as {
        optionId?: unknown;
        why?: unknown;
      }[]) {
        const optionId = String(entry?.optionId ?? '').trim();
        if (!optionId || !optionIds.has(optionId)) {
          findings.push(
            blocking(
              'RYO_DISTRACTOR_RATIONALE_UNKNOWN_OPTION',
              `distractor rationale names "${optionId}", which is not an option on this item`,
            ),
          );
          continue;
        }
        if (optionId === correct) {
          findings.push(
            blocking(
              'RYO_DISTRACTOR_RATIONALE_NAMES_ANSWER',
              `distractor rationale names "${optionId}", which is the correct answer`,
            ),
          );
          continue;
        }
        if (seen.has(optionId)) {
          findings.push(
            blocking(
              'RYO_DISTRACTOR_RATIONALE_DUPLICATE',
              `option "${optionId}" has more than one rationale`,
            ),
          );
          continue;
        }
        seen.add(optionId);
        if (!String(entry?.why ?? '').trim()) {
          findings.push(
            blocking(
              'RYO_DISTRACTOR_RATIONALE_EMPTY',
              `option "${optionId}" has a rationale entry with no reason in it`,
            ),
          );
        }
      }
      // Incomplete coverage is a quality gap, not an invalid item: a reviewer
      // decides whether an unexplained option earns its place.
      const distractors = [...optionIds].filter((id) => id !== correct);
      const missing = distractors.filter((id) => !seen.has(id));
      if (missing.length && seen.size) {
        findings.push(
          warning(
            'RYO_DISTRACTOR_RATIONALE_INCOMPLETE',
            `no rationale for ${missing.length} of ${distractors.length} incorrect options (${missing.join(', ')})`,
          ),
        );
      }
    }

    const confidence = authoring.estimatedConfidence as
      { band?: unknown } | undefined;
    if (confidence) {
      const band = String(confidence.band ?? '').trim();
      if (!RYO_CONFIDENCE_BANDS.includes(band as RyoConfidenceBand)) {
        findings.push(
          blocking(
            'RYO_CONFIDENCE_BAND_INVALID',
            `"${band}" is not one of ${RYO_CONFIDENCE_BANDS.join(', ')}`,
          ),
        );
      } else if (
        !RYO_TARGET_CONFIDENCE_BANDS.includes(band as RyoConfidenceBand)
      ) {
        findings.push(
          warning(
            'RYO_CONFIDENCE_OUTSIDE_TARGET_BAND',
            `the author's own estimate is "${band}"; at that extreme the Steal/Trust decision answers itself`,
          ),
        );
      }
    }

    return findings;
  }

  /** The checks no screen can perform yet, named rather than skipped. */
  private deferredNotes(): ScreenFinding[] {
    const findings: ScreenFinding[] = [];
    findings.push(
      deferred(
        'FACTUAL_VERIFICATION_PENDING',
        'claims are verified in Phase 1c',
      ),
    );
    findings.push(
      deferred(
        'NOVELTY_COVERAGE_LIMITED',
        'the concept history is small and not Scope-keyed; a non-match is not evidence of novelty',
      ),
    );

    return findings;
  }

  /**
   * Token-based answer leakage detector.
   * Prevents false positives on single-letter options embedded in unrelated words (e.g. 'ع' in 'مساعدة')
   * while strictly catching whole-word / phrase leakage (e.g. 'العصفور' in prompt).
   */
  detectAnswerLeakage(prompt: string, answerLabel: string): boolean {
    if (!prompt || !answerLabel) return false;
    const rawAnswer = answerLabel.trim();
    if (!rawAnswer) return false;

    // Single-character answer: only match if it appears as an isolated token
    if (rawAnswer.length === 1 || normalizeAnswer(rawAnswer).length === 1) {
      const singleChar = normalizeAnswer(rawAnswer).trim();
      const tokens = prompt
        .split(/[^\p{L}\p{N}]+/gu)
        .map((t) => normalizeAnswer(t).trim())
        .filter(Boolean);
      return tokens.includes(singleChar);
    }

    // Multi-character answer: normalize and tokenize
    const normAnswer = normalizeAnswer(rawAnswer).trim();
    if (!normAnswer) return false;

    const promptTokens = prompt
      .split(/[^\p{L}\p{N}]+/gu)
      .map((t) => normalizeAnswer(t).trim())
      .filter(Boolean);

    const answerTokens = normAnswer
      .split(/[^\p{L}\p{N}]+/gu)
      .map((t) => t.trim())
      .filter(Boolean);

    if (answerTokens.length === 0) return false;

    const stripAl = (token: string): string =>
      token.startsWith('ال') && token.length > 3 ? token.slice(2) : token;

    // Single word answer
    if (answerTokens.length === 1) {
      const at = answerTokens[0];
      const atBase = stripAl(at);
      return promptTokens.some((pt) => {
        const ptBase = stripAl(pt);
        return pt === at || (atBase.length >= 3 && ptBase === atBase);
      });
    }

    // Multi-word phrase answer: search for contiguous matching sub-sequence
    for (let i = 0; i <= promptTokens.length - answerTokens.length; i++) {
      let match = true;
      for (let j = 0; j < answerTokens.length; j++) {
        const pt = promptTokens[i + j];
        const at = answerTokens[j];
        const ptBase = stripAl(pt);
        const atBase = stripAl(at);
        if (pt !== at && !(atBase.length >= 3 && ptBase === atBase)) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }

    return false;
  }

  /**
   * Mathematical multiset letter validation for anagrams and letter-rearrangement challenges.
   * Catches hallucinated / impossible answers where clue letters do not match answer letters.
   */
  checkAnagramLetterConsistency(
    prompt: string,
    answerLabel: string,
  ): ScreenFinding | null {
    if (!prompt || !answerLabel) return null;

    const isAnagram =
      /(?:كون|تكوين|رتب|ترتيب|أعد ترتيب|اعد ترتيب|تجميع)\s+(?:كلمة|الحروف|حروف)/i.test(
        prompt,
      ) || /(?:الحروف التالية|من الحروف)/i.test(prompt);

    if (!isAnagram) return null;

    let letterRegion = '';
    const colonMatch = prompt.match(/:\s*([^\n\.\?؟!]+)/);
    if (colonMatch) {
      letterRegion = colonMatch[1];
    } else {
      const parenMatch = prompt.match(/[\(（\[]([^\)）\]]+)[\)）\]]/);
      if (parenMatch) {
        letterRegion = parenMatch[1];
      } else {
        letterRegion = prompt;
      }
    }

    const rawTokens = letterRegion.split(/[^\p{L}]+/gu).filter(Boolean);
    const singleLetters = rawTokens.filter(
      (t) => t.length === 1 && /[\u0621-\u064A]/.test(t),
    );
    if (singleLetters.length < 2) return null;

    const normalizeLetter = (ch: string): string => {
      if (/[أإآٱ]/.test(ch)) return 'ا';
      if (ch === 'ة') return 'ه';
      if (ch === 'ى') return 'ي';
      return ch;
    };

    const clueNorm = singleLetters.map(normalizeLetter);
    const answerNorm = answerLabel
      .replace(/[^\u0621-\u064A]/g, '')
      .split('')
      .map(normalizeLetter);

    const countMap = (arr: string[]): Record<string, number> => {
      const m: Record<string, number> = {};
      for (const c of arr) m[c] = (m[c] || 0) + 1;
      return m;
    };

    const clueMap = countMap(clueNorm);
    const ansMap = countMap(answerNorm);

    const allKeys = new Set([...Object.keys(clueMap), ...Object.keys(ansMap)]);
    for (const k of allKeys) {
      if ((clueMap[k] || 0) !== (ansMap[k] || 0)) {
        return blocking(
          'ANAGRAM_LETTER_MULTISET_MISMATCH',
          `clue letters do not match the answer letters (mismatch on letter "${k}")`,
        );
      }
    }

    return null;
  }
}
