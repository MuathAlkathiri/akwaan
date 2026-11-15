import { createHash } from 'crypto';
import { normalizeAnswer } from './answer-normalization.util';
import {
  assertTolerantConfig,
  fingerprintAnswers,
  withinGuardReach,
  type AnswerGuard,
  type TolerantMatchConfig,
} from './answer-matching.util';

/**
 * Building an item's collision guard.
 *
 * The guard lists the answers of *other* items in the collision domain (V1: the
 * item's World) that one tolerated typo of this item's answers could also reach.
 * A submission within tolerance of one of them is refused rather than credited
 * to this item.
 *
 * Similar names are never treated as the same entity on their own, and neither
 * is a shared Latin alias: only a recorded human decision removes another item
 * from the guard, and only while both items still carry the answers that were
 * reviewed. Everything else stays protected — an unresolved pair is a guarded
 * pair. When a guard cannot be built within its bounds, the item is exact-only.
 *
 * Pure and deterministic: the same inputs build the same guard, so a dry run
 * over a catalog export reproduces exactly what the runtime would build.
 */

/** One item of the collision domain: its id and its accepted answers. */
export interface GuardCatalogEntry {
  readonly id: string;
  readonly acceptedAnswers: readonly string[];
}

/**
 * A human decision that two items name the same entity, bound to the answers
 * both items carried when it was made. Edit either and it stops applying.
 */
export interface ReviewedEquivalence {
  readonly itemIds: readonly [string, string];
  readonly answersFingerprints: readonly [string, string];
}

/** Another item within reach: what a reviewer is asked to decide on. */
export interface GuardReviewPair {
  readonly otherItemId: string;
  readonly answer: string;
  readonly otherAnswer: string;
}

export type BuildAnswerGuardResult =
  | {
      readonly status: 'ready';
      readonly guard: AnswerGuard;
      readonly reviewPairs: readonly GuardReviewPair[];
    }
  | {
      /** The item plays exact-only. */
      readonly status: 'exact-only';
      readonly reason: 'no-answers' | 'guard-too-large';
      readonly reviewPairs: readonly GuardReviewPair[];
    };

/** Identity of a whole collision domain, for detecting a stale stored guard. */
export function fingerprintCatalog(
  domain: readonly GuardCatalogEntry[],
  config: TolerantMatchConfig,
): string {
  const rows = domain
    .map((entry) => `${entry.id}:${fingerprintAnswers(entry.acceptedAnswers)}`)
    .sort();
  return createHash('sha256')
    .update(`${config.id}\n${rows.join('\n')}`)
    .digest('hex')
    .slice(0, 32);
}

export function buildAnswerGuard(input: {
  readonly itemId: string;
  readonly acceptedAnswers: readonly string[];
  /** The collision domain. May include the item itself; it is skipped. */
  readonly domain: readonly GuardCatalogEntry[];
  readonly reviewedEquivalences?: readonly ReviewedEquivalence[];
  /** Answers a human marked as conflicting, from outside the domain. */
  readonly knownConflicts?: readonly string[];
  readonly config: TolerantMatchConfig;
}): BuildAnswerGuardResult {
  assertTolerantConfig(input.config);
  const own = [
    ...new Set(input.acceptedAnswers.map(normalizeAnswer).filter(Boolean)),
  ];
  if (!own.length) {
    return { status: 'exact-only', reason: 'no-answers', reviewPairs: [] };
  }
  const ownFingerprint = fingerprintAnswers(input.acceptedAnswers);
  const ownSet = new Set(own);

  const blocked = new Set<string>();
  const reviewPairs: GuardReviewPair[] = [];
  for (const other of input.domain) {
    if (other.id === input.itemId) continue;
    if (
      isReviewedEquivalent(
        input.itemId,
        ownFingerprint,
        other,
        input.reviewedEquivalences ?? [],
      )
    ) {
      continue;
    }
    for (const otherAnswer of new Set(
      other.acceptedAnswers.map(normalizeAnswer).filter(Boolean),
    )) {
      // The very same string is the same answer: a typo of it is no more
      // ambiguous than the answer itself, which this item already accepts.
      if (ownSet.has(otherAnswer)) continue;
      const near = own.find((answer) =>
        withinGuardReach(answer, otherAnswer, input.config),
      );
      if (!near) continue;
      blocked.add(otherAnswer);
      reviewPairs.push({ otherItemId: other.id, answer: near, otherAnswer });
    }
  }
  for (const conflict of input.knownConflicts ?? []) {
    const normalized = normalizeAnswer(conflict);
    if (normalized && !ownSet.has(normalized)) blocked.add(normalized);
  }

  if (blocked.size > input.config.maxGuardEntries) {
    return { status: 'exact-only', reason: 'guard-too-large', reviewPairs };
  }
  return {
    status: 'ready',
    guard: {
      policyId: input.config.id,
      answersFingerprint: ownFingerprint,
      catalogFingerprint: fingerprintCatalog(input.domain, input.config),
      blockedAnswers: [...blocked].sort(),
    },
    reviewPairs,
  };
}

function isReviewedEquivalent(
  itemId: string,
  ownFingerprint: string,
  other: GuardCatalogEntry,
  decisions: readonly ReviewedEquivalence[],
): boolean {
  const otherFingerprint = fingerprintAnswers(other.acceptedAnswers);
  return decisions.some((decision) => {
    const [first, second] = decision.itemIds;
    const [firstPrint, secondPrint] = decision.answersFingerprints;
    if (first === itemId && second === other.id) {
      return firstPrint === ownFingerprint && secondPrint === otherFingerprint;
    }
    if (second === itemId && first === other.id) {
      return secondPrint === ownFingerprint && firstPrint === otherFingerprint;
    }
    return false;
  });
}
