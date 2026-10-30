import { createHash } from 'crypto';
import {
  CanonicalFamily,
  CanonicalFamilyCatalog,
  ExtractedTableFamily,
  FamilyParityDrift,
  FamilyParityReport,
  FamilyResolutionError,
  MECHANIC_FIT_RATINGS,
  MechanicFitRating,
} from './canonical-family.types';

export * from './canonical-family.types';

/**
 * Fenced code block delimiter for canonical family catalogs.
 *
 * Follows the established `akwaan-rules` convention: strictly JSON inside
 * a designated fenced code block adjacent to canonical human-readable prose.
 */
const FAMILY_BLOCK = /```akwaan-families\s*\n([\s\S]*?)\n```/g;

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const MECHANIC_HEADER_MAP: Record<string, string> = {
  'moving xo': 'moving-xo',
  'moving-xo': 'moving-xo',
  ryo: 'read-your-opponent',
  'read-your-opponent': 'read-your-opponent',
  'read your opponent': 'read-your-opponent',
  bomb: 'bomb',
  closest: 'closest',
};

const cleanCell = (cell: string): string => cell.replace(/[`*]/g, '').trim();

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * Parses one family block from markdown text.
 * Fails closed if the block is malformed or invalid.
 */
export function parseFamilyBlock(
  text: string,
  source: string,
  context: { worldKey: string; scopeKey: string },
): CanonicalFamily[] {
  FAMILY_BLOCK.lastIndex = 0;
  const matches = [...text.matchAll(FAMILY_BLOCK)];
  if (!matches.length) return [];

  const families: CanonicalFamily[] = [];
  const seenKeys = new Set<string>();

  for (const match of matches) {
    const rawJson = match[1].trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch (error) {
      throw new FamilyResolutionError(
        'MALFORMED_JSON',
        source,
        error instanceof Error ? error.message : String(error),
      );
    }

    const record = asRecord(parsed);
    if (!record) {
      throw new FamilyResolutionError(
        'INVALID_CATALOG_SHAPE',
        source,
        'family block must be a JSON object',
      );
    }

    if (record.version !== 1) {
      throw new FamilyResolutionError(
        'UNSUPPORTED_VERSION',
        source,
        `expected version: 1, got: ${String(record.version)}`,
      );
    }

    if (typeof record.scope === 'string' && record.scope.trim()) {
      const declaredScope = record.scope.trim();
      const validScopes = [
        context.scopeKey,
        `${context.worldKey}/${context.scopeKey}`,
        `${context.worldKey}.${context.scopeKey}`,
      ];
      if (!validScopes.includes(declaredScope)) {
        throw new FamilyResolutionError(
          'SCOPE_MISMATCH',
          source,
          `family catalog declares scope "${declaredScope}", but resolved context is "${context.worldKey}/${context.scopeKey}"`,
        );
      }
    }

    if (!Array.isArray(record.families)) {
      throw new FamilyResolutionError(
        'INVALID_FAMILIES_ARRAY',
        source,
        'catalog must contain a "families" array',
      );
    }

    for (let i = 0; i < record.families.length; i += 1) {
      const item = asRecord(record.families[i]);
      if (!item) {
        throw new FamilyResolutionError(
          'INVALID_FAMILY_OBJECT',
          source,
          `family at index ${i} is not a JSON object`,
        );
      }

      const familyKey = (
        typeof item.familyKey === 'string' ? item.familyKey : ''
      ).trim();
      if (!familyKey) {
        throw new FamilyResolutionError(
          'FAMILY_KEY_REQUIRED',
          source,
          `family at index ${i} is missing "familyKey"`,
        );
      }

      if (!SLUG_PATTERN.test(familyKey)) {
        throw new FamilyResolutionError(
          'INVALID_FAMILY_KEY',
          source,
          `familyKey "${familyKey}" at index ${i} must be a valid kebab-case slug (/^[a-z0-9]+(-[a-z0-9]+)*$/)`,
        );
      }

      if (seenKeys.has(familyKey)) {
        throw new FamilyResolutionError(
          'DUPLICATE_FAMILY_KEY',
          source,
          `familyKey "${familyKey}" is declared more than once in this scope`,
        );
      }
      seenKeys.add(familyKey);

      const name = (typeof item.name === 'string' ? item.name : '').trim();
      if (!name) {
        throw new FamilyResolutionError(
          'FAMILY_NAME_REQUIRED',
          source,
          `family "${familyKey}" is missing required "name"`,
        );
      }

      const description = (
        typeof item.description === 'string' ? item.description : ''
      ).trim();
      if (!description) {
        throw new FamilyResolutionError(
          'FAMILY_DESCRIPTION_REQUIRED',
          source,
          `family "${familyKey}" is missing required "description"`,
        );
      }

      const playerSolve = (
        typeof item.playerSolve === 'string' ? item.playerSolve : ''
      ).trim();

      const modality = (
        typeof item.modality === 'string' ? item.modality : ''
      ).trim();

      const scalability = (
        typeof item.scalability === 'string' ? item.scalability : ''
      ).trim();

      let mechanicFit: Record<string, MechanicFitRating> | undefined;
      if (item.mechanicFit !== undefined) {
        const fitRecord = asRecord(item.mechanicFit);
        if (!fitRecord) {
          throw new FamilyResolutionError(
            'INVALID_MECHANIC_FIT',
            source,
            `mechanicFit on family "${familyKey}" must be an object`,
          );
        }
        mechanicFit = {};
        for (const [mKey, rating] of Object.entries(fitRecord)) {
          if (
            typeof rating !== 'string' ||
            !MECHANIC_FIT_RATINGS.includes(rating as MechanicFitRating)
          ) {
            throw new FamilyResolutionError(
              'INVALID_MECHANIC_FIT_RATING',
              source,
              `mechanicFit rating "${String(rating)}" for mechanic "${mKey}" on family "${familyKey}" must be one of: ${MECHANIC_FIT_RATINGS.join(', ')}`,
            );
          }
          mechanicFit[mKey] = rating as MechanicFitRating;
        }
      }

      let answerModes: string[] | undefined;
      if (item.answerModes !== undefined) {
        if (
          !Array.isArray(item.answerModes) ||
          item.answerModes.some(
            (mode) => typeof mode !== 'string' || !mode.trim(),
          )
        ) {
          throw new FamilyResolutionError(
            'INVALID_ANSWER_MODES',
            source,
            `answerModes on family "${familyKey}" must be an array of non-empty strings`,
          );
        }
        answerModes = item.answerModes.map((m) => m.trim());
      }

      families.push({
        familyKey,
        name,
        description,
        ...(playerSolve ? { playerSolve } : {}),
        scopeKey: context.scopeKey,
        worldKey: context.worldKey,
        ...(modality ? { modality } : {}),
        ...(scalability ? { scalability } : {}),
        ...(mechanicFit ? { mechanicFit } : {}),
        ...(answerModes ? { answerModes } : {}),
        source,
      });
    }
  }

  return families;
}

/**
 * Computes a deterministic SHA-256 digest over normalized family definitions.
 */
export function computeFamilyCatalogDigest(
  families: CanonicalFamily[],
): string {
  const normalized = families.map((f) => ({
    familyKey: f.familyKey,
    name: f.name,
    description: f.description,
    playerSolve: f.playerSolve ?? null,
    scopeKey: f.scopeKey,
    worldKey: f.worldKey,
    modality: f.modality ?? null,
    scalability: f.scalability ?? null,
    mechanicFit: f.mechanicFit ?? null,
    answerModes: f.answerModes ?? null,
    source: f.source,
  }));

  return createHash('sha256')
    .update(JSON.stringify(normalized), 'utf8')
    .digest('hex');
}

/**
 * Extracts markdown tables with header and rows.
 */
export function parseMarkdownTables(
  text: string,
): Array<{ header: string[]; rows: string[][] }> {
  const lines = text.split('\n');
  const tables: Array<{ header: string[]; rows: string[][] }> = [];
  let currentHeader: string[] | null = null;
  let currentRows: string[][] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (!currentHeader) {
        currentHeader = cells;
      } else if (
        currentRows.length === 0 &&
        cells.every((c) => /^:?-+:?$/.test(c))
      ) {
        // Divider row, skip
      } else {
        currentRows.push(cells);
      }
    } else {
      if (currentHeader && currentRows.length > 0) {
        tables.push({ header: currentHeader, rows: currentRows });
      }
      currentHeader = null;
      currentRows = [];
    }
  }
  if (currentHeader && currentRows.length > 0) {
    tables.push({ header: currentHeader, rows: currentRows });
  }
  return tables;
}

/**
 * Extracts canonical family rows from markdown tables (e.g. Scope Approved Families or
 * Mechanic Compatibility Matrix).
 */
export function extractFamilyTables(
  text: string,
  source: string,
): ExtractedTableFamily[] {
  const tables = parseMarkdownTables(text);
  const extracted: ExtractedTableFamily[] = [];

  for (const table of tables) {
    const slugIdx = table.header.findIndex((h) =>
      /^(family(\s+slug)?|slug)$/i.test(h.trim()),
    );
    if (slugIdx === -1) continue;

    const nameIdx = table.header.findIndex((h) =>
      /^(arabic(\s+name)?|name)$/i.test(h.trim()),
    );
    const mediaIdx = table.header.findIndex((h) =>
      /^(primary\s+media|media)$/i.test(h.trim()),
    );
    const answerModesIdx = table.header.findIndex((h) =>
      /^(answer\s+modes?|modes?)$/i.test(h.trim()),
    );

    const mechanicCols: Array<{ colIdx: number; mechanicKey: string }> = [];
    table.header.forEach((h, idx) => {
      const norm = h.replace(/[`*]/g, '').trim().toLowerCase();
      if (MECHANIC_HEADER_MAP[norm]) {
        mechanicCols.push({
          colIdx: idx,
          mechanicKey: MECHANIC_HEADER_MAP[norm],
        });
      }
    });

    for (let r = 0; r < table.rows.length; r += 1) {
      const row = table.rows[r];
      if (row.length <= slugIdx) continue;
      const slug = cleanCell(row[slugIdx]);
      if (!slug || !SLUG_PATTERN.test(slug)) continue;

      const name =
        nameIdx !== -1 && row[nameIdx] ? cleanCell(row[nameIdx]) : '';
      const media =
        mediaIdx !== -1 && row[mediaIdx] ? cleanCell(row[mediaIdx]) : undefined;
      const rawModes =
        answerModesIdx !== -1 && row[answerModesIdx]
          ? cleanCell(row[answerModesIdx])
          : undefined;
      const answerModes = rawModes
        ? rawModes
            .split(/[,/]/)
            .map((m) => m.trim())
            .filter(Boolean)
        : undefined;

      let mechanicFit: Record<string, MechanicFitRating> | undefined;
      if (mechanicCols.length > 0) {
        mechanicFit = {};
        for (const col of mechanicCols) {
          if (row[col.colIdx]) {
            const rawRating = cleanCell(row[col.colIdx]);
            if (MECHANIC_FIT_RATINGS.includes(rawRating as MechanicFitRating)) {
              mechanicFit[col.mechanicKey] = rawRating as MechanicFitRating;
            }
          }
        }
      }

      extracted.push({
        index: r + 1,
        familyKey: slug,
        name,
        ...(media ? { media } : {}),
        ...(answerModes ? { answerModes } : {}),
        ...(mechanicFit && Object.keys(mechanicFit).length > 0
          ? { mechanicFit }
          : {}),
        source,
      });
    }
  }

  return extracted;
}

/**
 * Validates parity between the machine-readable CanonicalFamilyCatalog and the
 * human-readable markdown tables across provided authoring sections.
 *
 * Explicitly surfaces limitations:
 * - Free prose descriptions cannot be compared via brittle exact equality.
 * - Arabic labels in column-constrained markdown tables may be abbreviated relative to catalog names.
 */
export function validateFamilyCatalogParity(
  catalog: CanonicalFamilyCatalog,
  sections: Array<{ slot: string; source: string; text: string }>,
): FamilyParityReport {
  const drifts: FamilyParityDrift[] = [];
  const limitations = [
    'Narrative prose descriptions and player-solve summaries cannot be compared by string equality without brittle failures across editorial formatting.',
    'Markdown table columns frequently use abbreviated Arabic labels (e.g. table header column limits); name validation checks non-empty presence but does not enforce full phrase equality.',
    'Primary media column in tables contains authoring guidance strings rather than runtime enums; runtime answerModes are verified where present.',
  ];

  const sourceTables: Array<{
    source: string;
    families: ExtractedTableFamily[];
  }> = [];

  for (const s of sections) {
    const extracted = extractFamilyTables(s.text, s.source);
    if (extracted.length > 0) {
      sourceTables.push({ source: s.source, families: extracted });
    }
  }

  if (sourceTables.length === 0) {
    return {
      valid: true,
      driftCount: 0,
      drifts: [],
      tablesFound: 0,
      authoritativeFamilyCount: 0,
      catalogFamilyCount: catalog.families.length,
      verifiedFields: [],
      limitations,
    };
  }

  // Cross-check tables if multiple human-readable sources carry family tables
  if (sourceTables.length > 1) {
    const baseSet = new Set(sourceTables[0].families.map((f) => f.familyKey));
    for (let i = 1; i < sourceTables.length; i += 1) {
      const otherSet = new Set(
        sourceTables[i].families.map((f) => f.familyKey),
      );
      for (const k of baseSet) {
        if (!otherSet.has(k)) {
          drifts.push({
            type: 'SOURCE_TABLE_MISMATCH',
            familyKey: k,
            detail: `Family "${k}" is present in "${sourceTables[0].source}" table but missing from "${sourceTables[i].source}" table`,
            source: sourceTables[i].source,
          });
        }
      }
      for (const k of otherSet) {
        if (!baseSet.has(k)) {
          drifts.push({
            type: 'SOURCE_TABLE_MISMATCH',
            familyKey: k,
            detail: `Family "${k}" is present in "${sourceTables[i].source}" table but missing from "${sourceTables[0].source}" table`,
            source: sourceTables[0].source,
          });
        }
      }
    }
  }

  // Build aggregated authoritative table map
  const tableMap = new Map<string, ExtractedTableFamily>();
  for (const st of sourceTables) {
    for (const f of st.families) {
      const existing = tableMap.get(f.familyKey);
      if (!existing) {
        tableMap.set(f.familyKey, { ...f });
      } else {
        if (f.mechanicFit) {
          existing.mechanicFit = {
            ...existing.mechanicFit,
            ...f.mechanicFit,
          };
        }
        if (f.answerModes) {
          existing.answerModes = f.answerModes;
        }
      }
    }
  }

  const catalogMap = new Map(catalog.families.map((f) => [f.familyKey, f]));

  // 1. Missing in catalog
  for (const [key, tFam] of tableMap.entries()) {
    if (!catalogMap.has(key)) {
      drifts.push({
        type: 'MISSING_IN_CATALOG',
        familyKey: key,
        detail: `Family "${key}" is declared in authoritative human-readable table (${tFam.source}) but missing from structured catalog`,
        source: tFam.source,
      });
    }
  }

  // 2. Extra in catalog
  for (const [key, cFam] of catalogMap.entries()) {
    if (!tableMap.has(key)) {
      drifts.push({
        type: 'EXTRA_IN_CATALOG',
        familyKey: key,
        detail: `Family "${key}" is present in structured catalog but not declared in authoritative human-readable tables`,
        source: cFam.source,
      });
    }
  }

  // 3. Mechanic fit and answer modes verification
  for (const [key, tFam] of tableMap.entries()) {
    const cFam = catalogMap.get(key);
    if (!cFam) continue;

    if (tFam.mechanicFit) {
      for (const [mKey, expectedRating] of Object.entries(tFam.mechanicFit)) {
        const actualRating = cFam.mechanicFit
          ? cFam.mechanicFit[mKey]
          : undefined;
        if (actualRating !== expectedRating) {
          drifts.push({
            type: 'MECHANIC_FIT_MISMATCH',
            familyKey: key,
            detail: `Family "${key}" mechanicFit for "${mKey}" is "${actualRating ?? 'undefined'}", but authoritative matrix declares "${expectedRating}"`,
            source: tFam.source,
            expected: expectedRating,
            actual: actualRating,
          });
        }
      }
    }

    if (tFam.answerModes && cFam.answerModes) {
      for (const mode of tFam.answerModes) {
        if (!cFam.answerModes.includes(mode)) {
          drifts.push({
            type: 'ANSWER_MODES_MISMATCH',
            familyKey: key,
            detail: `Family "${key}" answerMode "${mode}" from table is missing in structured catalog`,
            source: tFam.source,
            expected: mode,
            actual: cFam.answerModes,
          });
        }
      }
    }
  }

  return {
    valid: drifts.length === 0,
    driftCount: drifts.length,
    drifts,
    tablesFound: sourceTables.length,
    authoritativeFamilyCount: tableMap.size,
    catalogFamilyCount: catalog.families.length,
    verifiedFields: ['familyKey', 'membership', 'mechanicFit', 'answerModes'],
    limitations,
  };
}

/**
 * Asserts parity between catalog and human-readable tables, failing closed
 * with a FamilyResolutionError on any detected drift.
 */
export function assertFamilyCatalogParity(
  catalog: CanonicalFamilyCatalog,
  sections: Array<{ slot: string; source: string; text: string }>,
): FamilyParityReport {
  const report = validateFamilyCatalogParity(catalog, sections);
  if (!report.valid) {
    const firstDrift = report.drifts[0];
    throw new FamilyResolutionError(
      `PARITY_DRIFT:${firstDrift.type}`,
      firstDrift.source ?? catalog.scopeKey,
      firstDrift.detail,
    );
  }
  return report;
}

/**
 * Resolves the canonical family catalog across provided document sections.
 *
 * Scans Scope-layer sections (`scope`, `knowledge`) for structured blocks.
 * If no blocks are found, returns a valid empty catalog (zero breaking changes for legacy scopes).
 * Orders families deterministically by `familyKey`.
 * Automatically verifies parity against human-readable tables when present.
 */
export function resolveCanonicalFamilies(
  sections: Array<{ slot: string; source: string; text: string }>,
  context: { worldKey: string; scopeKey: string },
  options?: { skipParityCheck?: boolean },
): CanonicalFamilyCatalog {
  const families: CanonicalFamily[] = [];
  const structuredSources: string[] = [];
  const seenKeys = new Map<string, string>();

  for (const section of sections) {
    const parsed = parseFamilyBlock(section.text, section.source, context);
    if (!parsed.length) continue;

    structuredSources.push(section.source);
    for (const fam of parsed) {
      const priorSource = seenKeys.get(fam.familyKey);
      if (priorSource) {
        throw new FamilyResolutionError(
          'DUPLICATE_FAMILY_KEY',
          fam.source,
          `familyKey "${fam.familyKey}" is declared in both "${priorSource}" and "${fam.source}"`,
        );
      }
      seenKeys.set(fam.familyKey, fam.source);
      families.push(fam);
    }
  }

  // Deterministic sorting by familyKey
  families.sort((a, b) => a.familyKey.localeCompare(b.familyKey));

  const digest = computeFamilyCatalogDigest(families);

  const catalog: CanonicalFamilyCatalog = {
    version: 1,
    worldKey: context.worldKey,
    scopeKey: context.scopeKey,
    families,
    digest,
    structuredSources,
  };

  if (!options?.skipParityCheck && catalog.families.length > 0) {
    assertFamilyCatalogParity(catalog, sections);
  }

  return catalog;
}
