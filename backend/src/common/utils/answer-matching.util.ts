import { createHash } from 'crypto';
import { normalizeAnswer } from './answer-normalization.util';

/**
 * Deciding whether a typed answer is one of an item's accepted answers.
 *
 * The one place a `match` mechanic asks that question, so every mechanic that
 * adopts it judges the same way. It sits on top of the canonical normalizer
 * rather than beside it: `normalizeAnswer` decides what two spellings *are*;
 * this decides whether a submission is accepted. Content identity and
 * deduplication keep using the normalizer directly and are not affected by
 * anything here.
 *
 * Two policies:
 *
 * - `exact` — what every mechanic did inline before: normalize both sides and
 *   compare. The default, and unchanged since Phase A.
 * - `guarded-tolerant` — exact first, then at most one Damerau-Levenshtein edit
 *   in at most one long-enough word, and only when the item's collision guard
 *   is present, current, and does not place the submission within reach of a
 *   different entity's answer. Anything less than all of that is exact-only.
 *
 * Server-side only. The result names which accepted answer matched; that must
 * never be sent to a player before the question resolves.
 */

/** The tolerance knobs. Deterministic, and versioned by `id`. */
export interface TolerantMatchConfig {
  /** Policy version. A guard built for another id is not used. */
  readonly id: string;
  /** Shortest normalized word that may take an edit; shorter words are exact. */
  readonly oneEditFromLength: number;
  /** Edits allowed inside one word. V1 has no two-edit tier. */
  readonly maxEditsPerWord: number;
  /** Words per answer that may differ at all. */
  readonly maxFuzzyWords: number;
  /** How far a different entity's answer may be and still be guarded against. */
  readonly guardReachEdits: number;
  /** A guard larger than this is not trusted; the item stays exact-only. */
  readonly maxGuardEntries: number;
}

/**
 * C4, guarded, version 1 — the Phase B policy.
 *
 * One edit from four letters, exact at three or fewer, one fuzzy word per
 * answer, no two-edit tier. The guard reaches two edits: anything a single typo
 * of this answer could also be a typo of.
 */
export const C4_GUARDED_V1: TolerantMatchConfig = Object.freeze({
  id: 'c4-guarded-v1',
  oneEditFromLength: 4,
  maxEditsPerWord: 1,
  maxFuzzyWords: 1,
  guardReachEdits: 2,
  maxGuardEntries: 64,
});

/**
 * An item's collision guard: the other entities' answers its tolerance must not
 * reach. Built from the item's World when content is drawn, never per answer.
 */
export interface AnswerGuard {
  /** The policy it was built for. */
  readonly policyId: string;
  /** The item's own accepted answers it was built against. */
  readonly answersFingerprint: string;
  /** The catalog it was built from, for detecting a stale stored guard. */
  readonly catalogFingerprint: string;
  /** Normalized answers of different entities within reach. */
  readonly blockedAnswers: readonly string[];
}

export type AnswerMatchPolicy =
  | { readonly kind: 'exact' }
  | {
      readonly kind: 'guarded-tolerant';
      readonly config: TolerantMatchConfig;
      readonly guard?: AnswerGuard;
    };

/** Today's behaviour, and the default. */
export const EXACT_ANSWER_MATCH: AnswerMatchPolicy = Object.freeze({
  kind: 'exact',
});

/** Why a tolerant policy did not accept. Diagnostic, server-side only. */
export type ToleranceOutcome =
  | 'empty-submission'
  | 'guard-missing'
  | 'guard-stale'
  | 'no-candidate'
  | 'guard-blocked';

export type AnswerMatchResult =
  | {
      readonly matched: true;
      /** `exact`: equal after normalization. `tolerant`: within one typo. */
      readonly kind: 'exact' | 'tolerant';
      /** Index into the accepted answers that matched. Server-side only. */
      readonly acceptedIndex: number;
    }
  | { readonly matched: false; readonly tolerance?: ToleranceOutcome };

const NO_MATCH: AnswerMatchResult = Object.freeze({ matched: false });

export function matchAcceptedAnswer(
  submitted: string,
  acceptedAnswers: readonly string[],
  policy: AnswerMatchPolicy = EXACT_ANSWER_MATCH,
): AnswerMatchResult {
  // Exhaustive on purpose: a policy kind added later without a branch here is
  // a compile error, never a silent fall-through to some other behaviour.
  switch (policy?.kind) {
    case 'exact':
      return matchExact(submitted, acceptedAnswers);
    case 'guarded-tolerant':
      assertTolerantConfig(policy.config);
      return matchGuardedTolerant(
        submitted,
        acceptedAnswers,
        policy.config,
        policy.guard,
      );
    default: {
      const unknown: never = policy;
      throw new Error(
        `Unknown answer match policy: ${JSON.stringify(unknown ?? null)}`,
      );
    }
  }
}

function matchExact(
  submitted: string,
  acceptedAnswers: readonly string[],
): AnswerMatchResult {
  // Byte-for-byte the comparison the mechanics made inline:
  // `acceptedAnswers.map(normalizeAnswer).includes(normalizeAnswer(answer))`.
  // That includes its edge — an empty normalized submission equals an empty
  // normalized accepted answer — which authoring validation already makes
  // unreachable (EMPTY_ACCEPTED_ANSWER). Keeping it identical is what lets a
  // mechanic adopt this with no change in verdicts.
  const normalized = normalizeAnswer(submitted);
  const acceptedIndex = acceptedAnswers.findIndex(
    (accepted) => normalizeAnswer(accepted) === normalized,
  );
  return acceptedIndex === -1
    ? NO_MATCH
    : { matched: true, kind: 'exact', acceptedIndex };
}

function matchGuardedTolerant(
  submitted: string,
  acceptedAnswers: readonly string[],
  config: TolerantMatchConfig,
  guard: AnswerGuard | undefined,
): AnswerMatchResult {
  const typed = normalizeAnswer(submitted);
  // Nothing typed is never an answer, whatever the list holds.
  if (!typed) return { matched: false, tolerance: 'empty-submission' };

  // Approved answers — aliases, transliterations, translations — are exact.
  const exactIndex = acceptedAnswers.findIndex(
    (accepted) => normalizeAnswer(accepted) === typed,
  );
  if (exactIndex !== -1) {
    return { matched: true, kind: 'exact', acceptedIndex: exactIndex };
  }

  // No current guard, no tolerance: an old or missing guard never permits it.
  if (!guard) return { matched: false, tolerance: 'guard-missing' };
  if (!isAnswerGuardCurrent(guard, { config, acceptedAnswers })) {
    return { matched: false, tolerance: 'guard-stale' };
  }

  // A number or an identifier typed is never a typo of something else.
  if (hasDigit(typed)) return { matched: false, tolerance: 'no-candidate' };
  const candidate = acceptedAnswers.findIndex(
    (accepted) =>
      !isProtectedAnswer(accepted) &&
      withinTypoTolerance(normalizeAnswer(accepted), typed, config),
  );
  if (candidate === -1) return { matched: false, tolerance: 'no-candidate' };

  // Within one typo of this item — and also of a different entity? Then it is
  // not this item's to claim.
  if (
    guard.blockedAnswers.some(
      (blocked) =>
        blocked === typed || withinTypoTolerance(blocked, typed, config),
    )
  ) {
    return { matched: false, tolerance: 'guard-blocked' };
  }
  return { matched: true, kind: 'tolerant', acceptedIndex: candidate };
}

// ── Shared primitives, also used to build guards ──────────────────────────

/**
 * Is a config well formed? A malformed one is refused outright rather than
 * silently treated as something looser.
 */
export function assertTolerantConfig(config: TolerantMatchConfig): void {
  const whole = (value: unknown, min: number) =>
    Number.isInteger(value) && (value as number) >= min;
  if (
    !config ||
    typeof config.id !== 'string' ||
    !config.id ||
    !whole(config.oneEditFromLength, 2) ||
    !whole(config.maxFuzzyWords, 1) ||
    !whole(config.guardReachEdits, 1) ||
    !whole(config.maxGuardEntries, 0) ||
    // V1 has no two-edit tier, and a zero-edit "tolerance" is just exact.
    config.maxEditsPerWord !== 1 ||
    config.guardReachEdits < config.maxEditsPerWord
  ) {
    throw new Error(`Malformed answer match policy: ${JSON.stringify(config)}`);
  }
}

const hasDigit = (value: string) => /\p{Nd}/u.test(value);

/**
 * Answers that are exact-only whatever the policy: anything with a digit (a
 * year, an edition, a trim) and anything carrying an acronym (FIFA, NEOM), where
 * one letter is a different thing rather than a typo.
 */
export function isProtectedAnswer(raw: string): boolean {
  return hasDigit(raw) || /(?:^|[^A-Za-z])[A-Z]{2,5}(?:$|[^A-Za-z])/.test(raw);
}

/** Restricted Damerau-Levenshtein (adjacent swaps cost one), on code points. */
export function editDistance(left: string, right: string, cap: number): number {
  const a = [...left];
  const b = [...right];
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...new Array<number>(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

/**
 * Unrestricted Damerau-Levenshtein (Lowrance-Wagner), on code points.
 *
 * Unlike the restricted form above, this is a true metric: it obeys the
 * triangle inequality. The guard depends on that. A typo one edit from this
 * answer and one edit from another proves the two answers are at most two apart
 * — but only under this distance. Restricted distance scores تليفون ↔ تلفزيون as
 * three, although the single typo تلفيون sits one edit from each.
 */
export function metricEditDistance(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  const infinity = a.length + b.length;
  const lastRow = new Map<string, number>();
  const d: number[][] = Array.from({ length: a.length + 2 }, () =>
    new Array<number>(b.length + 2).fill(0),
  );
  d[0][0] = infinity;
  for (let i = 0; i <= a.length; i += 1) {
    d[i + 1][0] = infinity;
    d[i + 1][1] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    d[0][j + 1] = infinity;
    d[1][j + 1] = j;
  }
  for (let i = 1; i <= a.length; i += 1) {
    let lastMatchColumn = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const k = lastRow.get(b[j - 1]) ?? 0;
      const l = lastMatchColumn;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      if (cost === 0) lastMatchColumn = j;
      d[i + 1][j + 1] = Math.min(
        d[i][j] + cost,
        d[i + 1][j] + 1,
        d[i][j + 1] + 1,
        d[k][l] + (i - k - 1) + 1 + (j - l - 1),
      );
    }
    lastRow.set(a[i - 1], i);
  }
  return d[a.length + 1][b.length + 1];
}

/**
 * Is normalized `typed` one tolerated typo of normalized `target`?
 *
 * Word by word, in order, same word count: a long-enough word may differ by
 * one edit, a short word must be equal, and at most `maxFuzzyWords` words may
 * differ. Equal strings are not a typo — exact matching owns those.
 */
export function withinTypoTolerance(
  target: string,
  typed: string,
  config: TolerantMatchConfig,
): boolean {
  if (!target || !typed || target === typed) return false;
  if (hasDigit(target) || hasDigit(typed)) return false;
  const targetWords = target.split(' ');
  const typedWords = typed.split(' ');
  if (targetWords.length !== typedWords.length) return false;
  let fuzzyWords = 0;
  for (let index = 0; index < targetWords.length; index += 1) {
    const word = targetWords[index];
    if (word === typedWords[index]) continue;
    if ([...word].length < config.oneEditFromLength) return false;
    if (
      editDistance(word, typedWords[index], config.maxEditsPerWord) >
      config.maxEditsPerWord
    ) {
      return false;
    }
    fuzzyWords += 1;
    if (fuzzyWords > config.maxFuzzyWords) return false;
  }
  return fuzzyWords > 0;
}

/**
 * Could one tolerated typo of `target` also be a typo of `other`? True when the
 * two are within `guardReachEdits` of each other, word by word, under the true
 * metric — see `metricEditDistance` for why the restricted distance is not
 * enough here.
 */
export function withinGuardReach(
  target: string,
  other: string,
  config: TolerantMatchConfig,
): boolean {
  if (!target || !other || target === other) return false;
  const targetWords = target.split(' ');
  const otherWords = other.split(' ');
  if (targetWords.length !== otherWords.length) return false;
  let total = 0;
  for (let index = 0; index < targetWords.length; index += 1) {
    if (targetWords[index] === otherWords[index]) continue;
    total += metricEditDistance(targetWords[index], otherWords[index]);
    if (total > config.guardReachEdits) return false;
  }
  return true;
}

/** Order-insensitive identity of a set of accepted answers, after normalization. */
export function fingerprintAnswers(acceptedAnswers: readonly string[]): string {
  const normalized = [
    ...new Set(acceptedAnswers.map(normalizeAnswer).filter(Boolean)),
  ].sort();
  return createHash('sha256')
    .update(normalized.join('\n'))
    .digest('hex')
    .slice(0, 32);
}

/**
 * Is this guard usable for this item under this policy right now?
 *
 * Built for another policy version, for a different set of accepted answers,
 * or — when the caller knows the current catalog — from a different catalog:
 * not current, and tolerance is withheld.
 */
export function isAnswerGuardCurrent(
  guard: AnswerGuard | undefined,
  input: {
    config: TolerantMatchConfig;
    acceptedAnswers: readonly string[];
    catalogFingerprint?: string;
  },
): boolean {
  if (!guard || typeof guard !== 'object') return false;
  if (guard.policyId !== input.config.id) return false;
  if (
    !Array.isArray(guard.blockedAnswers) ||
    !guard.blockedAnswers.every((entry) => typeof entry === 'string') ||
    guard.blockedAnswers.length > input.config.maxGuardEntries
  ) {
    return false;
  }
  if (guard.answersFingerprint !== fingerprintAnswers(input.acceptedAnswers)) {
    return false;
  }
  if (
    input.catalogFingerprint !== undefined &&
    guard.catalogFingerprint !== input.catalogFingerprint
  ) {
    return false;
  }
  return true;
}
