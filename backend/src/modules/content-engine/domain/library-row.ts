import { createHash } from 'crypto';
import { closestAnchorIssues } from './closest-anchor.policy';

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

/** `source_url` may name a second source, separated by " | ". */
export const LIBRARY_MAX_SOURCE_URLS = 2;

/** An `asof_needed` row with no event estimate is re-checked after this long. */
export const LIBRARY_DEFAULT_REVALIDATE_MONTHS = 12;

/** The Celebrities workbook's sheet of worked examples. */
export const LIBRARY_EXAMPLE_COLUMNS = [
  'id',
  'scope',
  'celebrity',
  'fit',
  'question_example',
  'answer',
  'answer_numeric',
  'source_url',
  'confidence',
  'caveat',
  'review_status',
  'interaction_mode',
  'anchor_left',
  'anchor_right',
  'anchor_years_internal',
  'range_min',
  'range_max',
] as const;

export const LIBRARY_ANCHOR_COLUMNS = [
  'id',
  'label_ar',
  'year',
  'source_url',
  'note',
] as const;

/** The World of a workbook whose rows do not name one. */
export const LIBRARY_EXAMPLES_DEFAULT_WORLD = 'celebrities';

export const LIBRARY_ROW_SHEETS = ['Library', 'Examples'] as const;
export type LibraryRowSheet = (typeof LIBRARY_ROW_SHEETS)[number];

export const CLOSEST_INTERACTION_MODES = [
  'numeric-range',
  'between-anchors',
] as const;
export type ClosestInteractionMode = (typeof CLOSEST_INTERACTION_MODES)[number];

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

/** The scale a Closest row was verified on. */
export interface LibraryClosestFacts {
  mode: ClosestInteractionMode;
  min: number;
  max: number;
  step: number | null;
  leftAnchor: string | null;
  rightAnchor: string | null;
}

/** One curated anchor. Only a human adds to the bank. */
export interface LibraryAnchor {
  anchorId: string;
  worldKey: string;
  labelAr: string;
  year: number | null;
  sourceUrl: string | null;
  note: string | null;
  raw: LibrarySheetRow;
  rowHash: string;
}

export interface LibraryRow {
  libraryId: string;
  /** Re-imports retire only rows from a sheet the workbook actually carries. */
  sourceSheet: LibraryRowSheet;
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
  /** The lead source. `sourceUrls` holds every source the row cites. */
  sourceUrl: string | null;
  sourceUrls: string[];
  sourceWarning: LibrarySourceWarning | null;
  verifiedOn: string | null;
  asofNeeded: boolean;
  /** Treated as an estimate: it schedules a re-check and proves nothing. */
  nextEventDateEstimate: string | null;
  revalidateAfter: string | null;
  top5: LibraryTop5Facts | null;
  closest: LibraryClosestFacts | null;
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

const finiteNumber = (value: string | undefined): number | null => {
  if (value === undefined || !value.trim()) return null;
  const parsed = Number(toWesternDigits(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const parseClosestFacts = (
  libraryId: string,
  row: LibrarySheetRow,
): LibraryClosestFacts | null => {
  if (!row.interaction_mode) return null;
  const mode = oneOf(
    libraryId,
    'interaction_mode',
    row.interaction_mode,
    CLOSEST_INTERACTION_MODES,
  );
  const min = finiteNumber(row.range_min);
  const max = finiteNumber(row.range_max);
  if (min === null || max === null || min >= max) {
    throw new LibraryRowError(
      libraryId,
      'range_min and range_max must be numbers with range_min below range_max',
    );
  }
  const step = finiteNumber(row.anchor_step);
  if (row.anchor_step && (step === null || step <= 0)) {
    throw new LibraryRowError(libraryId, 'anchor_step must be positive');
  }
  return {
    mode,
    min,
    max,
    step,
    leftAnchor: mode === 'between-anchors' ? (row.anchor_left ?? null) : null,
    rightAnchor: mode === 'between-anchors' ? (row.anchor_right ?? null) : null,
  };
};

const parseCanonicalNumber = (
  mechanicKeys: string[],
  canonicalAnswer: string | null,
  answerNumeric: string | undefined,
): number | null => {
  const stated = finiteNumber(answerNumeric);
  if (stated !== null) return stated;
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

const isWeakSource = (sourceUrl: string): boolean => {
  if (!isHttpUrl(sourceUrl)) return false;
  const host = new URL(sourceUrl).hostname.replace(/^www\./, '');
  return LIBRARY_WEAK_SOURCE_HOSTS.some(
    (weak) => host === weak || host.endsWith(`.${weak}`),
  );
};

const hashRow = (row: object): string =>
  createHash('sha256').update(JSON.stringify(row), 'utf8').digest('hex');

/**
 * Maps one sheet row and refuses anything unsafe to store. An APPROVED row must
 * carry the proof that approval stands on; otherwise a typo in the workbook would
 * quietly become an unverified fact.
 */
export const mapLibrarySheetRow = (
  row: LibrarySheetRow,
  options: { sourceSheet?: LibraryRowSheet; undatedApproval?: boolean } = {},
): LibraryRow => {
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
  const sourceUrls = (row.source_url ?? '')
    .split('|')
    .map((url) => url.trim())
    .filter(Boolean);
  const [sourceUrl = null] = sourceUrls;
  if (sourceUrls.length > LIBRARY_MAX_SOURCE_URLS) {
    throw new LibraryRowError(
      libraryId,
      `source_url lists ${sourceUrls.length} URLs, at most ${LIBRARY_MAX_SOURCE_URLS}`,
    );
  }
  if (reviewStatus === 'APPROVED') {
    if (!row.verified_answer) {
      throw new LibraryRowError(libraryId, 'APPROVED without verified_answer');
    }
    if (!sourceUrl || !sourceUrls.every(isHttpUrl)) {
      throw new LibraryRowError(
        libraryId,
        'APPROVED without an http(s) source_url',
      );
    }
    if (!verifiedOn && !options.undatedApproval) {
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
  // A parked row may still be a sketch, so only an approval is held to its scale.
  const closest =
    reviewStatus === 'APPROVED' ? parseClosestFacts(libraryId, row) : null;
  // A Top-5 answer is its five entries, so it has no single value to derive.
  const canonicalAnswer =
    verifiedAnswer && !top5
      ? withoutTrailingParenthetical(verifiedAnswer)
      : null;

  const mapped: Omit<LibraryRow, 'rowHash'> = {
    libraryId,
    sourceSheet: options.sourceSheet ?? 'Library',
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
    canonicalNumber: parseCanonicalNumber(
      mechanicKeys,
      canonicalAnswer,
      row.answer_numeric,
    ),
    sourceUrl,
    sourceUrls,
    sourceWarning: sourceUrls.some(isWeakSource) ? 'WEAK_SOURCE' : null,
    verifiedOn,
    asofNeeded,
    nextEventDateEstimate,
    revalidateAfter:
      asofNeeded && verifiedOn
        ? (nextEventDateEstimate ??
          addMonths(verifiedOn, LIBRARY_DEFAULT_REVALIDATE_MONTHS))
        : null,
    top5,
    closest,
    raw: row,
  };
  return { ...mapped, rowHash: hashRow(mapped) };
};

type EligibilityFields = Pick<
  LibraryRow,
  | 'reviewStatus'
  | 'scopeStatus'
  | 'role'
  | 'worldKey'
  | 'scopeKey'
  | 'verifiedOn'
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
  Boolean(row.scopeKey) &&
  Boolean(row.verifiedOn);

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

/**
 * The Examples sheet in the Library sheet's terms, so one mapper holds every
 * rule. Its rows name no status beyond review, so they stay gated (`NEW_SCOPE`)
 * until the sheet says otherwise, and `anchor_years_internal` stays in `raw`.
 */
export const mapLibraryExampleRow = (row: LibrarySheetRow): LibraryRow =>
  mapLibrarySheetRow(
    {
      ...row,
      question: row.question_example,
      verified_answer: row.answer,
      akwaan_fit: row.fit,
      world: row.world ?? LIBRARY_EXAMPLES_DEFAULT_WORLD,
      scope_status: row.scope_status ?? 'NEW_SCOPE',
      role: row.role ?? 'FACT_SEED',
      asof_needed: row.asof_needed ?? 'N',
    },
    { sourceSheet: 'Examples', undatedApproval: true },
  );

export const mapLibraryAnchorRow = (
  row: LibrarySheetRow,
  defaultWorld = LIBRARY_EXAMPLES_DEFAULT_WORLD,
): LibraryAnchor => {
  const anchorId = row.id?.trim();
  if (!anchorId) throw new LibraryRowError('(blank id)', 'anchor has no id');
  if (!row.label_ar)
    throw new LibraryRowError(anchorId, 'anchor has no label_ar');
  const year = finiteNumber(row.year);
  if (row.year && year === null) {
    throw new LibraryRowError(anchorId, `year "${row.year}" is not a number`);
  }
  if (row.source_url && !isHttpUrl(row.source_url)) {
    throw new LibraryRowError(anchorId, 'source_url must be http(s)');
  }
  const mapped: Omit<LibraryAnchor, 'rowHash'> = {
    anchorId,
    worldKey: row.world ?? defaultWorld,
    labelAr: row.label_ar,
    year,
    sourceUrl: row.source_url ?? null,
    note: row.note ?? null,
    raw: row,
  };
  return { ...mapped, rowHash: hashRow(mapped) };
};

/**
 * Applies the anchor rules to an approved row as it arrives. A row's anchors
 * must come from the bank of its own World.
 */
export const validateLibraryClosestRow = (
  row: Pick<LibraryRow, 'closest' | 'canonicalNumber' | 'worldKey'>,
  anchors: readonly LibraryAnchor[],
): string[] => {
  if (!row.closest) return [];
  if (row.canonicalNumber === null) {
    return ['interaction_mode needs a numeric answer'];
  }
  const { mode, min, max, leftAnchor, rightAnchor } = row.closest;
  if (mode === 'numeric-range') {
    return row.canonicalNumber < min || row.canonicalNumber > max
      ? [`answer ${row.canonicalNumber} is outside the range`]
      : [];
  }
  return closestAnchorIssues({
    leftAnchor,
    rightAnchor,
    min,
    max,
    target: row.canonicalNumber,
    bank: anchors
      .filter((anchor) => anchor.worldKey === row.worldKey)
      .filter((anchor) => anchor.year !== null)
      .map((anchor) => ({ labelAr: anchor.labelAr, value: anchor.year! })),
  }).map((issue) => `${issue.code}: ${issue.message}`);
};
