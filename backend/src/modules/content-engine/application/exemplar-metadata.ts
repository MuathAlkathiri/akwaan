/**
 * Strict parser for the versioned Scope EXEMPLARS.md metadata contract.
 *
 * Only explicit metadata markers are authoritative. Markdown headings, prose,
 * emoji and tables cannot grant an exemplar generation eligibility. The raw
 * source remains available to historical screening while generation receives
 * only APPROVED blocks that explicitly target the mechanic being generated.
 *
 * `APPROVED` is the engine's eligibility marker. It is not the Reference
 * Library's Gold standard, and the provenance fields record an approval —
 * they do not verify one. Final Gold approval is the Product Owner's.
 */

export const EXEMPLAR_METADATA_VERSION = 1;
export const EXEMPLAR_REUSE_POLICY = 'DO_NOT_REGENERATE' as const;
export const EXEMPLAR_STATUSES = [
  'APPROVED',
  'WITHHELD',
  'REJECTED',
  'RETIRED',
  'INVALID_TEST_SAMPLE',
] as const;
export type ExemplarStatus = (typeof EXEMPLAR_STATUSES)[number];

export interface ExemplarMetadata {
  version: 1;
  id: string;
  status: ExemplarStatus;
  reusePolicy: 'DO_NOT_REGENERATE';
  routingNote?: string;
  /**
   * Canonical manifest mechanic keys this exemplar may teach. Absent on
   * legacy entries, which are then never eligible for generation: an
   * untargeted exemplar is never treated as "all mechanics".
   */
  mechanics?: string[];
  /**
   * Recorded approval provenance. These are author-written fields: they say
   * who is *recorded* as approving and when, not that an approval workflow
   * verified it. Only meaningful on APPROVED entries.
   */
  approvedBy?: string;
  /** ISO calendar date, YYYY-MM-DD. */
  approvedAt?: string;
  /** Where the exemplar came from, e.g. a reference-library row id. */
  sourceRef?: string;
}

/** Why an APPROVED entry did not reach a generation prompt. */
export const EXEMPLAR_UNTARGETED_EXCLUDED = 'EXEMPLAR_UNTARGETED_EXCLUDED';
export const EXEMPLAR_MECHANIC_EXCLUDED = 'EXEMPLAR_MECHANIC_EXCLUDED';

export interface ExemplarSelection {
  /** The canonical manifest key of the mechanic being generated. */
  mechanicKey: string;
  /**
   * Canonical manifest mechanic keys. When given, a target outside this set
   * fails validation, so a typo or an alias cannot silently match nothing.
   */
  knownMechanics?: readonly string[];
}

export interface ParsedExemplarMetadata {
  metadata: ExemplarMetadata;
  startLine: number;
  endLine: number;
  content: string;
  sourceBlock: string;
}

export interface ExemplarDocument {
  entries: ParsedExemplarMetadata[];
  approvedText: string;
  historicalText: string;
  diagnostics: string[];
}

const ID_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
/** Manifest mechanic keys are lowercase words joined by `-` or `_`. */
const MECHANIC_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_APPROVED_BY = 120;
const MAX_SOURCE_REF = 200;
const COMMENT_RE = /<!--([\s\S]*?)-->/g;

const isCalendarDate = (value: string): boolean => {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

/** A single-line, trimmed, bounded string — or the reason it is not one. */
const singleLineProblem = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string' || !value.trim()) return 'a non-empty string';
  if (value !== value.trim()) return 'without surrounding whitespace';
  if (/[\r\n]/.test(value)) return 'a single line';
  if (value.length > max) return `at most ${max} characters`;
  return null;
};

export class ExemplarMetadataError extends Error {}

const lineNumber = (text: string, offset: number): number =>
  text.slice(0, offset).split('\n').length;

const parseMetadata = (raw: string, line: number): ExemplarMetadata => {
  const prefix = 'AKWAAN_EXEMPLAR_META';
  if (!raw.startsWith(prefix)) {
    throw new ExemplarMetadataError(
      `line ${line}: unknown exemplar metadata marker`,
    );
  }
  const payload = raw.slice(prefix.length).trim();
  if (!payload) {
    throw new ExemplarMetadataError(`line ${line}: missing metadata JSON`);
  }
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new ExemplarMetadataError(`line ${line}: malformed metadata JSON`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExemplarMetadataError(`line ${line}: metadata must be an object`);
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([
    'version',
    'id',
    'status',
    'reusePolicy',
    'routingNote',
    'mechanics',
    'approvedBy',
    'approvedAt',
    'sourceRef',
  ]);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new ExemplarMetadataError(
      `line ${line}: unknown metadata field(s): ${unknown.sort().join(', ')}`,
    );
  }
  if (record.version !== EXEMPLAR_METADATA_VERSION) {
    throw new ExemplarMetadataError(
      `line ${line}: unsupported metadata version ${String(record.version)}`,
    );
  }
  if (typeof record.id !== 'string' || !ID_RE.test(record.id)) {
    throw new ExemplarMetadataError(
      `line ${line}: id must be lowercase kebab-case`,
    );
  }
  if (
    typeof record.status !== 'string' ||
    !(EXEMPLAR_STATUSES as readonly string[]).includes(record.status)
  ) {
    throw new ExemplarMetadataError(
      `line ${line}: unknown review status ${String(record.status)}`,
    );
  }
  if (record.reusePolicy !== EXEMPLAR_REUSE_POLICY) {
    throw new ExemplarMetadataError(
      `line ${line}: reusePolicy must be ${EXEMPLAR_REUSE_POLICY}`,
    );
  }
  if (
    record.routingNote !== undefined &&
    (typeof record.routingNote !== 'string' || !record.routingNote.trim())
  ) {
    throw new ExemplarMetadataError(
      `line ${line}: routingNote must be a non-empty string when present`,
    );
  }
  let mechanics: string[] | undefined;
  if (record.mechanics !== undefined) {
    if (!Array.isArray(record.mechanics) || record.mechanics.length === 0) {
      // An empty list must never be read as "every mechanic".
      throw new ExemplarMetadataError(
        `line ${line}: mechanics must be a non-empty list of canonical mechanic keys`,
      );
    }
    for (const mechanic of record.mechanics) {
      if (typeof mechanic !== 'string' || !MECHANIC_RE.test(mechanic)) {
        throw new ExemplarMetadataError(
          `line ${line}: malformed mechanic key ${JSON.stringify(mechanic)}`,
        );
      }
    }
    if (new Set(record.mechanics).size !== record.mechanics.length) {
      throw new ExemplarMetadataError(
        `line ${line}: mechanics must not repeat a key`,
      );
    }
    mechanics = [...(record.mechanics as string[])];
  }
  const hasApprover = record.approvedBy !== undefined;
  const hasDate = record.approvedAt !== undefined;
  if ((hasApprover || hasDate) && record.status !== 'APPROVED') {
    throw new ExemplarMetadataError(
      `line ${line}: approvedBy/approvedAt are only valid on APPROVED entries`,
    );
  }
  if (hasApprover !== hasDate) {
    throw new ExemplarMetadataError(
      `line ${line}: approvedBy and approvedAt must be recorded together`,
    );
  }
  if (hasApprover) {
    const problem = singleLineProblem(record.approvedBy, MAX_APPROVED_BY);
    if (problem) {
      throw new ExemplarMetadataError(
        `line ${line}: approvedBy must be ${problem}`,
      );
    }
    if (
      typeof record.approvedAt !== 'string' ||
      !isCalendarDate(record.approvedAt)
    ) {
      throw new ExemplarMetadataError(
        `line ${line}: approvedAt must be a calendar date YYYY-MM-DD`,
      );
    }
  }
  if (record.sourceRef !== undefined) {
    const problem = singleLineProblem(record.sourceRef, MAX_SOURCE_REF);
    if (problem) {
      throw new ExemplarMetadataError(
        `line ${line}: sourceRef must be ${problem}`,
      );
    }
  }
  return {
    version: 1,
    id: record.id,
    status: record.status as ExemplarStatus,
    reusePolicy: EXEMPLAR_REUSE_POLICY,
    ...(record.routingNote === undefined
      ? {}
      : { routingNote: record.routingNote as string }),
    ...(mechanics ? { mechanics } : {}),
    ...(hasApprover
      ? {
          approvedBy: record.approvedBy as string,
          approvedAt: record.approvedAt as string,
        }
      : {}),
    ...(record.sourceRef === undefined
      ? {}
      : { sourceRef: record.sourceRef as string }),
  };
};

const looksLikeUnclassifiedEntry = (line: string): boolean =>
  /^\s*###\s+\d+[.)]\s+/.test(line) || /^\s*-\s*Domain:\s*\S/i.test(line);

const parseDocument = (
  text: string,
): {
  entries: ParsedExemplarMetadata[];
  contentRanges: Array<[number, number]>;
} => {
  const entries: ParsedExemplarMetadata[] = [];
  const contentRanges: Array<[number, number]> = [];
  const seen = new Set<string>();
  let active:
    | {
        metadata: ExemplarMetadata;
        startLine: number;
        blockStart: number;
        contentStart: number;
      }
    | undefined;
  let match: RegExpExecArray | null;
  COMMENT_RE.lastIndex = 0;
  while ((match = COMMENT_RE.exec(text)) !== null) {
    const raw = match[1].trim();
    const line = lineNumber(text, match.index);
    if (raw.startsWith('AKWAAN_EXEMPLAR_META')) {
      if (active) {
        throw new ExemplarMetadataError(
          `line ${line}: nested exemplar metadata marker`,
        );
      }
      const metadata = parseMetadata(raw, line);
      if (seen.has(metadata.id)) {
        throw new ExemplarMetadataError(
          `line ${line}: duplicate exemplar id ${metadata.id}`,
        );
      }
      seen.add(metadata.id);
      active = {
        metadata,
        startLine: line,
        blockStart: match.index,
        contentStart: match.index + match[0].length,
      };
    } else if (raw === '/AKWAAN_EXEMPLAR_META') {
      if (!active) {
        throw new ExemplarMetadataError(
          `line ${line}: closing marker without an opening marker`,
        );
      }
      entries.push({
        metadata: active.metadata,
        startLine: active.startLine,
        endLine: line,
        content: text.slice(active.contentStart, match.index).trim(),
        sourceBlock: text.slice(
          active.blockStart,
          match.index + match[0].length,
        ),
      });
      contentRanges.push([active.contentStart, match.index]);
      active = undefined;
    }
  }
  if (active) {
    throw new ExemplarMetadataError(
      `line ${active.startLine}: missing closing exemplar metadata marker`,
    );
  }
  return { entries, contentRanges };
};

export const parseExemplarMetadata = (text: string): ParsedExemplarMetadata[] =>
  parseDocument(text).entries;

/**
 * The generation-safe view for one mechanic.
 *
 * An entry reaches `approvedText` only when it is APPROVED, has content and
 * explicitly lists `selection.mechanicKey` in `mechanics`. Legacy APPROVED
 * entries without `mechanics` are excluded and reported — never treated as
 * eligible for every mechanic. `historicalText` is always the untouched source,
 * so duplicate screening still sees every entry, eligible or not.
 */
export const resolveExemplarDocument = (
  text: string,
  selection: ExemplarSelection,
): ExemplarDocument => {
  const { entries, contentRanges } = parseDocument(text);
  if (selection.knownMechanics) {
    const known = new Set(selection.knownMechanics);
    for (const entry of entries) {
      for (const mechanic of entry.metadata.mechanics ?? []) {
        if (!known.has(mechanic)) {
          throw new ExemplarMetadataError(
            `line ${entry.startLine}: unknown mechanic ${mechanic} (use a canonical manifest key)`,
          );
        }
      }
    }
  }
  const approved = entries.filter(
    (entry) => entry.metadata.status === 'APPROVED' && entry.content,
  );
  const untargeted = approved.filter((entry) => !entry.metadata.mechanics);
  const otherMechanic = approved.filter(
    (entry) =>
      entry.metadata.mechanics &&
      !entry.metadata.mechanics.includes(selection.mechanicKey),
  );
  const approvedText = approved
    .filter((entry) =>
      entry.metadata.mechanics?.includes(selection.mechanicKey),
    )
    .map((entry) => entry.sourceBlock)
    .join('\n\n');
  const diagnostics: string[] = [];
  if (untargeted.length) {
    diagnostics.push(
      `${EXEMPLAR_UNTARGETED_EXCLUDED}: ${untargeted
        .map((entry) => entry.metadata.id)
        .join(',')}`,
    );
  }
  if (otherMechanic.length) {
    diagnostics.push(
      `${EXEMPLAR_MECHANIC_EXCLUDED}: ${otherMechanic
        .map((entry) => entry.metadata.id)
        .join(',')}`,
    );
  }
  let offset = 0;
  const unclassifiedLines: number[] = [];
  for (const [index, line] of text.split(/(?<=\n)/).entries()) {
    if (
      !contentRanges.some(([start, end]) => start <= offset && offset < end)
    ) {
      if (looksLikeUnclassifiedEntry(line)) unclassifiedLines.push(index + 1);
    }
    offset += line.length;
  }
  if (unclassifiedLines.length) {
    diagnostics.push(
      `EXEMPLAR_STATUS_UNCLASSIFIED: ${unclassifiedLines.join(',')}`,
    );
  }
  return {
    entries,
    approvedText,
    historicalText: text,
    diagnostics,
  };
};
