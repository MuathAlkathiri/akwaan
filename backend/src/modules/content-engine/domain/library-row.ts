import { createHash } from 'crypto';

/**
 * The verified question library: human-approved facts held beside the Skills,
 * never instead of them.
 *
 * This file owns what a workbook row *means*. Every rule that decides whether a
 * row may reach generation lives in `isLibraryRowGenerationEligible`, so the
 * importer, the repository lookup and later the slot allocator cannot disagree.
 */

export const LIBRARY_REVIEW_STATUSES = [
  'APPROVED',
  'PARK',
  'REJECT',
  'REWRITE',
  'TO_REVIEW',
] as const;
export type LibraryReviewStatus = (typeof LIBRARY_REVIEW_STATUSES)[number];

export const LIBRARY_SCOPE_STATUSES = [
  'MATCH',
  'NEAR',
  'NEW_SCOPE',
  'WORLD_ONLY',
  'FUTURE_WORLD',
  'NO_WORLD',
] as const;
export type LibraryScopeStatus = (typeof LIBRARY_SCOPE_STATUSES)[number];

export const LIBRARY_ROLES = [
  'FACT_SEED',
  'EXEMPLAR_CANDIDATE',
  'NEGATIVE_BENCHMARK',
  'PARK',
] as const;
export type LibraryRole = (typeof LIBRARY_ROLES)[number];

export const LIBRARY_HOOK_TYPES = ['HOOK', 'ANTI-PATTERN'] as const;
export type LibraryHookType = (typeof LIBRARY_HOOK_TYPES)[number];

/**
 * Human Product approval, 2026-11-01. The workbook still marks every hook
 * PROPOSED, so approval is recorded here and not read from the sheet.
 */
export const LIBRARY_APPROVED_HOOK_IDS: readonly string[] = [
  'H01',
  'H02',
  'H03',
  'H04',
  'H05',
  'H06',
  'H07',
];

/**
 * Sources a human has judged weak but still acceptable. A row citing one stays
 * usable and carries a warning into review, so the warning clears itself when
 * the source is replaced.
 */
export const LIBRARY_WEAK_SOURCE_HOSTS: readonly string[] = [
  'daddyjim.ai',
  'oddscalendar.com',
  'otakumode.com',
];
export type LibrarySourceWarning = 'WEAK_SOURCE';

/** An `asof_needed` row with no event estimate is re-checked after this long. */
export const LIBRARY_DEFAULT_REVALIDATE_MONTHS = 12;

export const LIBRARY_HOOK_COLUMNS = [
  'id',
  'type',
  'name_ar',
  'description',
  'akwaan_fit',
  'caution',
  'status',
] as const;

export const LIBRARY_REQUIRED_COLUMNS = [
  'id',
  'src',
  'question',
  'world',
  'scope',
  'scope_status',
  'akwaan_fit',
  'quality_p1',
  'asof_needed',
  'role',
  'claude_rewrite',
  'review_status',
  'verified_answer',
  'source_url',
  'verified_on',
  'top5_window',
  'top5_correct_5',
  'top5_traps_5',
  'next_event_date_estimate',
] as const;

/** One workbook row keyed by column name; blank cells are absent. */
export type LibrarySheetRow = Record<string, string>;

export interface LibraryTop5CorrectEntry {
  /** Card-safe name. Year labels stay in `annotation` and never reach a card. */
  label: string;
  annotation: string | null;
}

export interface LibraryTop5Facts {
  window: string | null;
  correct: LibraryTop5CorrectEntry[];
  traps: string[];
  /** The row's own statement about its traps, when it makes one. */
  trapAttestation: string | null;
}

export interface LibraryRow {
  libraryId: string;
  sourceRef: string | null;
  worldKey: string | null;
  scopeKey: string | null;
  scopeStatus: LibraryScopeStatus;
  role: LibraryRole;
  reviewStatus: LibraryReviewStatus;
  /** Canonical mechanic slugs read from `akwaan_fit`; empty when it names none. */
  mechanicKeys: string[];
  akwaanFit: string | null;
  qualityP1: string | null;
  /** `claude_rewrite` when present, otherwise the original question. */
  questionText: string;
  hasApprovedRewrite: boolean;
  options: string[];
  verifiedAnswer: string | null;
  /** `verified_answer` without its trailing explanation; null for Top-5. */
  canonicalAnswer: string | null;
  /** The numeric target of a Closest row. Derived, for review. */
  canonicalNumber: number | null;
  sourceUrl: string | null;
  sourceWarning: LibrarySourceWarning | null;
  verifiedOn: string | null;
  asofNeeded: boolean;
  /** Treated as an estimate: it schedules a re-check and proves nothing. */
  nextEventDateEstimate: string | null;
  revalidateAfter: string | null;
  top5: LibraryTop5Facts | null;
  /** Every source cell, so nothing the workbook said is lost to this mapping. */
  raw: LibrarySheetRow;
  rowHash: string;
}

export interface LibraryHook {
  hookId: string;
  type: LibraryHookType;
  nameAr: string;
  description: string;
  mechanicKeys: string[];
  caution: string | null;
  status: string | null;
  raw: LibrarySheetRow;
  rowHash: string;
}

export class LibraryRowError extends Error {
  constructor(
    readonly libraryId: string,
    message: string,
  ) {
    super(`${libraryId}: ${message}`);
  }
}

const NO_WORLD_MARKER = '(none)';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
/** The Arabic comma separates list items; a year label may hold anything. */
const TOP_LEVEL_LIST_SEPARATOR = /،(?![^()]*\))/;
const TRAILING_PARENTHETICAL = /\s*\(([^()]*)\)\s*$/;

const MECHANIC_TOKENS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^RYO\b/i, 'read-your-opponent'],
  [/^Closest\b/i, 'closest'],
  [/^Top-5\b/i, 'top-5'],
  [/^Bomb\b/i, 'bomb'],
];

const oneOf = <T extends string>(
  libraryId: string,
  column: string,
  value: string | undefined,
  allowed: readonly T[],
): T => {
  if (!value || !allowed.includes(value as T)) {
    throw new LibraryRowError(
      libraryId,
      `${column} "${value ?? ''}" is not one of ${allowed.join(', ')}`,
    );
  }
  return value as T;
};

const parseMechanicKeys = (akwaanFit: string | undefined): string[] => {
  const keys = (akwaanFit ?? '').split('/').flatMap((part) => {
    const token = part.trim();
    return MECHANIC_TOKENS.filter(([pattern]) => pattern.test(token)).map(
      ([, key]) => key,
    );
  });
  return [...new Set(keys)];
};

const toWesternDigits = (value: string): string =>
  value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

const parseIsoDate = (
  libraryId: string,
  column: string,
  value: string | undefined,
): string | null => {
  if (!value) return null;
  const date = ISO_DATE_RE.exec(value)?.[0];
  if (!date || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new LibraryRowError(
      libraryId,
      `${column} "${value}" does not start with a YYYY-MM-DD date`,
    );
  }
  return date;
};

const addMonths = (isoDate: string, months: number): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};

const withoutTrailingParenthetical = (value: string): string =>
  value.replace(TRAILING_PARENTHETICAL, '').trim();

const splitEntries = (value: string): string[] =>
  value
    .split(TOP_LEVEL_LIST_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseTop5 = (row: LibrarySheetRow): LibraryTop5Facts | null => {
  if (!row.top5_correct_5 && !row.top5_traps_5) return null;
  const traps = splitEntries(row.top5_traps_5 ?? '');
  const lastTrap = traps.at(-1);
  return {
    window: row.top5_window ?? null,
    correct: splitEntries(row.top5_correct_5 ?? '').map((entry) => ({
      label: withoutTrailingParenthetical(entry),
      annotation: TRAILING_PARENTHETICAL.exec(entry)?.[1]?.trim() ?? null,
    })),
    traps: traps.map(withoutTrailingParenthetical),
    trapAttestation: lastTrap
      ? (TRAILING_PARENTHETICAL.exec(lastTrap)?.[1]?.trim() ?? null)
      : null,
  };
};

const parseCanonicalNumber = (
  mechanicKeys: string[],
  canonicalAnswer: string | null,
): number | null => {
  if (!canonicalAnswer || !mechanicKeys.includes('closest')) return null;
  const match = /^\d+/.exec(toWesternDigits(canonicalAnswer));
  return match ? Number(match[0]) : null;
};

const isHttpUrl = (value: string): boolean => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

const sourceWarningFor = (
  sourceUrl: string | null,
): LibrarySourceWarning | null => {
  if (!sourceUrl || !isHttpUrl(sourceUrl)) return null;
  const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
  return LIBRARY_WEAK_SOURCE_HOSTS.some(
    (weak) => host === weak || host.endsWith(`.${weak}`),
  )
    ? 'WEAK_SOURCE'
    : null;
};

const hashRow = (row: object): string =>
  createHash('sha256').update(JSON.stringify(row), 'utf8').digest('hex');

/**
 * Maps one sheet row and refuses anything unsafe to store. An APPROVED row must
 * carry the proof that approval stands on; otherwise a typo in the workbook would
 * quietly become an unverified fact.
 */
export const mapLibrarySheetRow = (row: LibrarySheetRow): LibraryRow => {
  const libraryId = row.id?.trim();
  if (!libraryId) throw new LibraryRowError('(blank id)', 'row has no id');

  const reviewStatus = oneOf(
    libraryId,
    'review_status',
    row.review_status,
    LIBRARY_REVIEW_STATUSES,
  );
  const scopeStatus = oneOf(
    libraryId,
    'scope_status',
    row.scope_status,
    LIBRARY_SCOPE_STATUSES,
  );
  const role = oneOf(libraryId, 'role', row.role, LIBRARY_ROLES);
  const asof = oneOf(libraryId, 'asof_needed', row.asof_needed, ['Y', 'N']);

  const questionText = row.claude_rewrite ?? row.question;
  if (!questionText) {
    throw new LibraryRowError(libraryId, 'row has no question');
  }

  const verifiedOn = parseIsoDate(libraryId, 'verified_on', row.verified_on);
  const sourceUrl = row.source_url ?? null;
  if (reviewStatus === 'APPROVED') {
    if (!row.verified_answer) {
      throw new LibraryRowError(libraryId, 'APPROVED without verified_answer');
    }
    if (!sourceUrl || !isHttpUrl(sourceUrl)) {
      throw new LibraryRowError(
        libraryId,
        'APPROVED without an http(s) source_url',
      );
    }
    if (!verifiedOn) {
      throw new LibraryRowError(libraryId, 'APPROVED without verified_on');
    }
  }

  const nextEventDateEstimate = parseIsoDate(
    libraryId,
    'next_event_date_estimate',
    row.next_event_date_estimate,
  );
  const asofNeeded = asof === 'Y';
  const mechanicKeys = parseMechanicKeys(row.akwaan_fit);
  const verifiedAnswer = row.verified_answer ?? null;
  const top5 = parseTop5(row);
  // A Top-5 answer is its five entries, so it has no single value to derive.
  const canonicalAnswer =
    verifiedAnswer && !top5
      ? withoutTrailingParenthetical(verifiedAnswer)
      : null;

  const mapped: Omit<LibraryRow, 'rowHash'> = {
    libraryId,
    sourceRef: row.src ?? null,
    worldKey: !row.world || row.world === NO_WORLD_MARKER ? null : row.world,
    scopeKey: row.scope ?? null,
    scopeStatus,
    role,
    reviewStatus,
    mechanicKeys,
    akwaanFit: row.akwaan_fit ?? null,
    qualityP1: row.quality_p1 ?? null,
    questionText,
    hasApprovedRewrite: Boolean(row.claude_rewrite),
    options: (row.options_or_items ?? '')
      .split('|')
      .map((option) => option.trim())
      .filter(Boolean),
    verifiedAnswer,
    canonicalAnswer,
    canonicalNumber: parseCanonicalNumber(mechanicKeys, canonicalAnswer),
    sourceUrl,
    sourceWarning: sourceWarningFor(sourceUrl),
    verifiedOn,
    asofNeeded,
    nextEventDateEstimate,
    revalidateAfter:
      asofNeeded && verifiedOn
        ? (nextEventDateEstimate ??
          addMonths(verifiedOn, LIBRARY_DEFAULT_REVALIDATE_MONTHS))
        : null,
    top5,
    raw: row,
  };
  return { ...mapped, rowHash: hashRow(mapped) };
};

type EligibilityFields = Pick<
  LibraryRow,
  'reviewStatus' | 'scopeStatus' | 'role' | 'worldKey' | 'scopeKey'
>;

/**
 * The single gate into generation. NEW_SCOPE and WORLD_ONLY rows fail here until
 * a re-import marks them MATCH, which is what "gated until their Scope exists"
 * means in practice.
 */
export const isLibraryRowGenerationEligible = (
  row: EligibilityFields,
): boolean =>
  row.reviewStatus === 'APPROVED' &&
  row.scopeStatus === 'MATCH' &&
  (row.role === 'FACT_SEED' || row.role === 'EXEMPLAR_CANDIDATE') &&
  Boolean(row.worldKey) &&
  Boolean(row.scopeKey);

/** Approval covers the fact; only exemplar candidates lend their wording. */
export const libraryExemplarWording = (
  row: EligibilityFields & Pick<LibraryRow, 'questionText'>,
): string | null =>
  isLibraryRowGenerationEligible(row) && row.role === 'EXEMPLAR_CANDIDATE'
    ? row.questionText
    : null;

export const mapLibraryHookRow = (row: LibrarySheetRow): LibraryHook => {
  const hookId = row.id?.trim();
  if (!hookId) throw new LibraryRowError('(blank id)', 'hook has no id');
  const type = oneOf(hookId, 'type', row.type, LIBRARY_HOOK_TYPES);
  if (!row.name_ar || !row.description) {
    throw new LibraryRowError(hookId, 'hook needs name_ar and description');
  }
  const mapped: Omit<LibraryHook, 'rowHash'> = {
    hookId,
    type,
    nameAr: row.name_ar,
    description: row.description,
    mechanicKeys: parseMechanicKeys(row.akwaan_fit),
    caution: row.caution ?? null,
    status: row.status ?? null,
    raw: row,
  };
  return { ...mapped, rowHash: hashRow(mapped) };
};

/** Anti-patterns stay out by type, even if an id were ever listed as approved. */
export const isLibraryHookWriterEligible = (
  hook: Pick<LibraryHook, 'hookId' | 'type'>,
): boolean =>
  hook.type === 'HOOK' && LIBRARY_APPROVED_HOOK_IDS.includes(hook.hookId);
