import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import { LibraryRow } from './library-row';

/**
 * The hard rules for Top-5 content built from the library.
 *
 * These are deliberately stricter than the mechanic's own contract and apply to
 * library content only: `ContentItemCompatibilityPolicy` still governs every
 * Top-5 item, including the ones whose traps are real positions 6-10.
 *
 * A trap is safe because a human approved it for this exact list. The row holds
 * no all-time record to check against, so anything outside `top5_traps_5` fails
 * closed rather than being judged plausible.
 */

export const LIBRARY_TOP5_CORRECT_COUNT = 5;
export const LIBRARY_TOP5_TRAP_COUNT = 5;

export const LIBRARY_TOP5_ISSUE_CODES = [
  'TOP5_NOT_APPLICABLE',
  'TOP5_ENTRY_COUNT_INVALID',
  'TOP5_CORRECT_COUNT_INVALID',
  'TOP5_TRAP_COUNT_INVALID',
  'TOP5_DUPLICATE_ENTRY',
  'TOP5_CORRECT_NOT_IN_ROW',
  'TOP5_TRAP_NOT_APPROVED',
  'TOP5_TRAP_COULD_BE_CORRECT',
  'TOP5_WINDOW_MISSING',
  'TOP5_FORBIDDEN_WORDING',
  'TOP5_LABEL_NOT_CARD_SAFE',
  'TOP5_RANK_UNRESOLVED',
  'TOP5_RANK_ORDER_INVALID',
] as const;
export type LibraryTop5IssueCode = (typeof LIBRARY_TOP5_ISSUE_CODES)[number];

export interface LibraryTop5Issue {
  code: LibraryTop5IssueCode;
  message: string;
}

export interface LibraryTop5Candidate {
  prompt: string;
  /** Rank 1..5 for a correct entry, null for a trap. */
  entries: Array<{ label: string; rank: number | null }>;
}

type Top5Row = Pick<LibraryRow, 'questionText' | 'top5'>;

/** Whole words: `اختراع` and `المرتبة` are ordinary topic vocabulary. */
const FORBIDDEN_WORDING: ReadonlyArray<RegExp> = [
  /(?:^|[\s(])و?اختر(?:وا)?(?=[\s:،.؟]|$)/,
  /\d\s*من\s*\d/,
  /(?:^|[\s(])و?رت+ّ?ب(?:وا)?(?=[\s:،.؟]|$)/,
  /تجنب\s+الفخاخ/,
];
const YEAR = /(?:1[5-9]|20)\d{2}/g;

const issue = (
  code: LibraryTop5IssueCode,
  message: string,
): LibraryTop5Issue => ({ code, message });

const westernDigits = (value: string): string =>
  value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

const yearsIn = (text: string): number[] =>
  (westernDigits(text).match(YEAR) ?? []).map(Number);

const isCardSafe = (label: string): boolean =>
  !/[()]/.test(label) && !yearsIn(label).length;

/**
 * Correct entries, latest win first. A win in the season 2025-26 counts from
 * 2025, which orders seasons and single years alike. Two entries sharing a latest
 * year have no honest order, so the ranking refuses instead of guessing.
 */
export const rankLibraryTop5 = (
  row: Pick<LibraryRow, 'top5'>,
): { labels: string[] } | { unresolved: string } => {
  const dated = (row.top5?.correct ?? []).map((entry) => ({
    label: entry.label,
    latest: Math.max(...yearsIn(entry.annotation ?? '')),
  }));
  const undated = dated.find((entry) => !Number.isFinite(entry.latest));
  if (undated) return { unresolved: `"${undated.label}" has no win year` };

  const ordered = [...dated].sort((a, b) => b.latest - a.latest);
  const tied = ordered.find(
    (entry, index) => index > 0 && entry.latest === ordered[index - 1].latest,
  );
  if (tied) {
    return { unresolved: `"${tied.label}" ties on ${tied.latest}` };
  }
  return { labels: ordered.map((entry) => entry.label) };
};

const validateWindow = (
  prompt: string,
  window: string | null,
): LibraryTop5Issue[] => {
  if (!window) return [];
  const windowYears = yearsIn(window);
  if (!windowYears.length) return [];
  const promptYears = yearsIn(prompt);
  const start = windowYears[0];
  const end = windowYears[windowYears.length - 1];
  const statesEnd = promptYears.includes(end) || /منذ/.test(prompt);
  return promptYears.includes(start) && statesEnd
    ? []
    : [
        issue(
          'TOP5_WINDOW_MISSING',
          `the question must state its time window (${window})`,
        ),
      ];
};

const validateRanks = (
  row: Top5Row,
  correct: LibraryTop5Candidate['entries'],
): LibraryTop5Issue[] => {
  const ranked = rankLibraryTop5(row);
  if ('unresolved' in ranked) {
    return [issue('TOP5_RANK_UNRESOLVED', ranked.unresolved)];
  }
  const expected = new Map(
    ranked.labels.map((label, index) => [normalizeAnswer(label), index + 1]),
  );
  const misranked = correct.filter(
    (entry) => expected.get(normalizeAnswer(entry.label)) !== entry.rank,
  );
  return misranked.length
    ? [
        issue(
          'TOP5_RANK_ORDER_INVALID',
          `correct entries must rank most recent first: ${misranked
            .map((entry) => entry.label)
            .join(', ')}`,
        ),
      ]
    : [];
};

/** Every reason this candidate may not stand as library Top-5 content. */
export const validateLibraryTop5 = (
  candidate: LibraryTop5Candidate,
  row: Top5Row,
): LibraryTop5Issue[] => {
  if (!row.top5) {
    return [issue('TOP5_NOT_APPLICABLE', 'the row carries no Top-5 facts')];
  }

  const issues: LibraryTop5Issue[] = [];
  const { entries, prompt } = candidate;
  const correct = entries.filter((entry) => entry.rank !== null);
  const traps = entries.filter((entry) => entry.rank === null);
  const expectedCount = LIBRARY_TOP5_CORRECT_COUNT + LIBRARY_TOP5_TRAP_COUNT;

  if (entries.length !== expectedCount) {
    issues.push(
      issue(
        'TOP5_ENTRY_COUNT_INVALID',
        `exactly ${expectedCount} entries are required, received ${entries.length}`,
      ),
    );
  }
  if (correct.length !== LIBRARY_TOP5_CORRECT_COUNT) {
    issues.push(
      issue(
        'TOP5_CORRECT_COUNT_INVALID',
        `exactly ${LIBRARY_TOP5_CORRECT_COUNT} correct answers are required, received ${correct.length}`,
      ),
    );
  }
  if (traps.length !== LIBRARY_TOP5_TRAP_COUNT) {
    issues.push(
      issue(
        'TOP5_TRAP_COUNT_INVALID',
        `exactly ${LIBRARY_TOP5_TRAP_COUNT} traps are required, received ${traps.length}`,
      ),
    );
  }

  const labels = entries.map((entry) => normalizeAnswer(entry.label));
  if (new Set(labels).size !== labels.length) {
    issues.push(issue('TOP5_DUPLICATE_ENTRY', 'entries must be unique'));
  }

  const approvedCorrect = new Set(
    row.top5.correct.map((entry) => normalizeAnswer(entry.label)),
  );
  const approvedTraps = new Set(row.top5.traps.map(normalizeAnswer));

  for (const entry of correct) {
    if (!approvedCorrect.has(normalizeAnswer(entry.label))) {
      issues.push(
        issue(
          'TOP5_CORRECT_NOT_IN_ROW',
          `"${entry.label}" is not a verified answer of this row`,
        ),
      );
    }
  }
  for (const entry of traps) {
    const label = normalizeAnswer(entry.label);
    if (approvedCorrect.has(label)) {
      issues.push(
        issue(
          'TOP5_TRAP_COULD_BE_CORRECT',
          `"${entry.label}" is a verified answer, so it cannot be a trap`,
        ),
      );
    } else if (!approvedTraps.has(label)) {
      issues.push(
        issue(
          'TOP5_TRAP_NOT_APPROVED',
          `"${entry.label}" is not in the approved trap list`,
        ),
      );
    }
  }

  // The row's own lists must also be disjoint, or a re-used row smuggles in a
  // trap that a human approved by mistake.
  for (const trap of row.top5.traps) {
    if (approvedCorrect.has(normalizeAnswer(trap))) {
      issues.push(
        issue(
          'TOP5_TRAP_COULD_BE_CORRECT',
          `the row lists "${trap}" as both an answer and a trap`,
        ),
      );
    }
  }

  issues.push(...validateWindow(prompt, row.top5.window));

  for (const pattern of FORBIDDEN_WORDING) {
    if (pattern.test(westernDigits(prompt))) {
      issues.push(
        issue(
          'TOP5_FORBIDDEN_WORDING',
          `the question may state the topic only, not ${pattern.source}`,
        ),
      );
    }
  }

  for (const entry of entries) {
    if (!isCardSafe(entry.label)) {
      issues.push(
        issue(
          'TOP5_LABEL_NOT_CARD_SAFE',
          `"${entry.label}" reveals a year or note on its card`,
        ),
      );
    }
  }

  issues.push(...validateRanks(row, correct));
  return issues;
};

/** The ten entries a row stands for, with ranks. Null if it cannot be ranked. */
export const top5CandidateFromRow = (
  row: Top5Row,
): LibraryTop5Candidate | null => {
  const ranked = row.top5 ? rankLibraryTop5(row) : null;
  if (!ranked || 'unresolved' in ranked) return null;
  return {
    prompt: row.questionText,
    entries: [
      ...ranked.labels.map((label, index) => ({ label, rank: index + 1 })),
      ...row.top5!.traps.map((label) => ({ label, rank: null })),
    ],
  };
};

/**
 * Applies the rules to a row as it arrives. An APPROVED Top-5 row is a promise
 * that the list is playable, so a row that breaks them is refused at import.
 */
export const validateLibraryTop5Row = (
  row: Pick<LibraryRow, 'questionText' | 'top5'>,
): LibraryTop5Issue[] => {
  const candidate = top5CandidateFromRow(row);
  if (candidate) return validateLibraryTop5(candidate, row);
  const ranked = row.top5 ? rankLibraryTop5(row) : null;
  return [
    ranked && 'unresolved' in ranked
      ? issue('TOP5_RANK_UNRESOLVED', ranked.unresolved)
      : issue('TOP5_NOT_APPLICABLE', 'the row carries no Top-5 facts'),
  ];
};
