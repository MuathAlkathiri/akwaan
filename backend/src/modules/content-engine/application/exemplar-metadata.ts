/**
 * Strict parser for the versioned Scope EXEMPLARS.md metadata contract.
 *
 * Only explicit metadata markers are authoritative. Markdown headings, prose,
 * emoji and tables cannot grant an exemplar generation eligibility. The raw
 * source remains available to historical screening while generation receives
 * only APPROVED blocks.
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
const COMMENT_RE = /<!--([\s\S]*?)-->/g;

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
  return {
    version: 1,
    id: record.id,
    status: record.status as ExemplarStatus,
    reusePolicy: EXEMPLAR_REUSE_POLICY,
    ...(record.routingNote === undefined
      ? {}
      : { routingNote: record.routingNote as string }),
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

export const resolveExemplarDocument = (text: string): ExemplarDocument => {
  const { entries, contentRanges } = parseDocument(text);
  const approvedText = entries
    .filter((entry) => entry.metadata.status === 'APPROVED' && entry.content)
    .map((entry) => entry.sourceBlock)
    .join('\n\n');
  const diagnostics: string[] = [];
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
