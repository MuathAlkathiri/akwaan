import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  ClaimVerificationResult,
  FactEvidenceState,
  FactVerificationResult,
  StructuredSeedBinding,
  StructuredSeedEvidence,
} from './fact-verification.types';
import { GenerationSourcing, LibrarySeed } from './library-sourcing';

/**
 * Decides whether an approved library row vouches for a candidate.
 *
 * Coverage is exact. A row verifies one answer inside one time window, so a
 * candidate keeps that evidence only while it keeps both. Anything else is a new
 * claim and takes the normal verification route. This proves the value matches,
 * not that the question really asks for it, which is why a human still decides.
 */

const YEAR = '(?:1[5-9]|20)\\d{2}';
const WINDOW_TOKEN = new RegExp(
  `(?<!\\d)(${YEAR})(?:\\s*[–—\\-/\\\\]\\s*(\\d{4}|\\d{2}))?(?!\\d)`,
  'g',
);

const westernDigits = (value: string): string =>
  value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

/** `2023–24`, `2023/24` and `٢٠٢٣-٢٠٢٤` are one season. */
export const windowTokens = (text: string): string[] => {
  const tokens = [...westernDigits(text).matchAll(WINDOW_TOKEN)].map(
    ([, start, end]) => (end ? `${start}-${end.slice(-2)}` : start),
  );
  return [...new Set(tokens)].sort();
};

const sameTokens = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((token, index) => token === b[index]);

const promptOf = (draft: Record<string, unknown> | null): string =>
  (draft?.prompt as { ar?: string } | undefined)?.ar ?? '';

const answersRow = (
  draft: Record<string, unknown> | null,
  seed: LibrarySeed,
): boolean => {
  const answer = draft?.answerPayload as
    | {
        mode?: string;
        correctValue?: unknown;
        correctOptionId?: unknown;
        options?: Array<{ id?: string; label?: { ar?: string } }>;
      }
    | undefined;
  if (answer?.mode === 'closest') {
    return (
      seed.canonicalNumber !== null &&
      answer.correctValue === seed.canonicalNumber
    );
  }
  if (answer?.mode !== 'multiple_choice' || !seed.canonicalAnswer) return false;
  const label = answer.options?.find(
    (option) => option.id === answer.correctOptionId,
  )?.label?.ar;
  return (
    Boolean(label) &&
    normalizeAnswer(label as string) === normalizeAnswer(seed.canonicalAnswer)
  );
};

const evidenceFrom = (seed: LibrarySeed): StructuredSeedEvidence => ({
  method: 'structured-seed',
  sourceId: seed.libraryId,
  sourceName: 'Akwaan verified library',
  url: seed.sourceUrl,
  excerpt: seed.verifiedAnswer,
  retrievedAt: seed.verifiedOn,
  relation: 'supports',
  verifiedOn: seed.verifiedOn,
  revalidateAfter: seed.revalidateAfter,
  sourceWarning: seed.sourceWarning,
});

/** The rows a candidate's slot pinned, read from its job. */
export const seedsForCandidate = (
  sourcing: GenerationSourcing | null | undefined,
  candidate: { libraryIds?: string[] } | null | undefined,
): LibrarySeed[] => {
  const libraryIds = candidate?.libraryIds ?? [];
  return (sourcing?.seeds ?? []).filter((seed) =>
    libraryIds.includes(seed.libraryId),
  );
};

export const bindStructuredSeed = (input: {
  draft: Record<string, unknown> | null;
  seeds: LibrarySeed[];
  /** YYYY-MM-DD. Passed in, so a job's outcome never depends on a hidden clock. */
  today: string;
}): StructuredSeedBinding => {
  const matches = input.seeds.filter((seed) => answersRow(input.draft, seed));
  if (!matches.length) {
    return { covered: false, reason: 'ANSWER_CHANGED', libraryId: null };
  }

  const promptWindow = windowTokens(promptOf(input.draft));
  const inWindow = matches.filter((seed) =>
    sameTokens(windowTokens(seed.questionText), promptWindow),
  );
  if (!inWindow.length) {
    return {
      covered: false,
      reason: 'WINDOW_CHANGED',
      libraryId: matches[0].libraryId,
    };
  }

  const current = inWindow.find(
    (seed) => !seed.revalidateAfter || seed.revalidateAfter >= input.today,
  );
  if (!current) {
    return {
      covered: false,
      reason: 'EVIDENCE_EXPIRED',
      libraryId: inWindow[0].libraryId,
    };
  }
  return {
    covered: true,
    libraryId: current.libraryId,
    verifiedAnswer: current.verifiedAnswer,
    revalidateAfter: current.revalidateAfter,
    evidence: evidenceFrom(current),
  };
};

export const seedClaimResult = (
  binding: Extract<StructuredSeedBinding, { covered: true }>,
): ClaimVerificationResult => ({
  claim: binding.verifiedAnswer,
  state: 'SUPPORTED',
  evidence: [binding.evidence],
  attempts: 0,
  reason: 'STRUCTURED_SEED_EXACT_MATCH',
});

export const aggregateFactStates = (
  states: FactEvidenceState[],
): FactEvidenceState => {
  if (states.includes('CONTRADICTED')) return 'CONTRADICTED';
  if (states.includes('UNRESOLVED')) return 'UNRESOLVED';
  if (states.includes('UNSUPPORTED')) return 'UNSUPPORTED';
  return 'SUPPORTED';
};

/**
 * Folds a binding into a verification result. The row vouches for the answer
 * only: the model's other claims keep their own states, so one unverified claim
 * still holds the candidate back from automatic advance.
 */
export const withSeedBinding = (
  base: FactVerificationResult,
  binding: StructuredSeedBinding,
): FactVerificationResult => {
  if (!binding.covered) return { ...base, seedBinding: binding };
  const claims = [seedClaimResult(binding), ...base.claims];
  const state = aggregateFactStates(claims.map((claim) => claim.state));
  return {
    state,
    claims,
    automaticAdvance: state === 'SUPPORTED',
    seedBinding: binding,
  };
};

/**
 * What a human edit leaves behind. Retrieval does not rerun here, so claims the
 * reviewer kept are unresolved until a reviewer resolves them, and the binding
 * is recomputed from the edited draft rather than carried over.
 */
export const factVerificationAfterEdit = (input: {
  draft: Record<string, unknown> | null;
  seeds: LibrarySeed[];
  claims: string[];
  today: string;
}): FactVerificationResult =>
  withSeedBinding(
    {
      state: 'UNRESOLVED',
      claims: input.claims.map((claim) => ({
        claim,
        state: 'UNRESOLVED',
        evidence: [],
        attempts: 0,
        reason: 'HUMAN_EDIT_NOT_REVERIFIED',
      })),
      automaticAdvance: false,
    },
    bindStructuredSeed(input),
  );
