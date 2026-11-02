import ExcelJS from 'exceljs';
import {
  LIBRARY_ANCHOR_COLUMNS,
  LIBRARY_EXAMPLE_COLUMNS,
  LIBRARY_HOOK_COLUMNS,
  LIBRARY_REQUIRED_COLUMNS,
  LibraryAnchor,
  LibraryHook,
  LibraryRow,
  LibrarySheetRow,
  mapLibraryAnchorRow,
  mapLibraryExampleRow,
  mapLibraryHookRow,
  mapLibrarySheetRow,
  validateLibraryClosestRow,
} from '../domain/library-row';
import { validateLibraryTop5Row } from '../domain/top5-library.policy';

export const LIBRARY_SHEET_NAME = 'Library';
export const LIBRARY_HOOKS_SHEET_NAME = 'Hooks';
export const LIBRARY_EXAMPLES_SHEET_NAME = 'Examples';
export const LIBRARY_ANCHORS_SHEET_NAME = 'Anchors';

export interface LibraryWorkbook {
  rows: LibraryRow[];
  hooks: LibraryHook[];
  anchors?: LibraryAnchor[];
  /**
   * The sheets this file carries. A re-import retires only what those sheets
   * dropped, so a Celebrities file cannot retire the football library. Omitted
   * means `Library` and `Hooks`.
   */
  sheets?: string[];
}

export class LibraryWorkbookError extends Error {
  constructor(readonly problems: string[]) {
    super(`Library workbook rejected:\n- ${problems.join('\n- ')}`);
  }
}

const cellText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== 'object') return String(value).trim();
  if ('richText' in value) {
    return value.richText
      .map((run) => run.text)
      .join('')
      .trim();
  }
  if ('text' in value) return cellText(value.text as ExcelJS.CellValue);
  if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
  return '';
};

const readSheetRows = (
  sheet: ExcelJS.Worksheet,
  requiredColumns: readonly string[],
): LibrarySheetRow[] => {
  const columns = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, column) => {
    columns.set(column, cellText(cell.value));
  });

  const missing = requiredColumns.filter(
    (column) => ![...columns.values()].includes(column),
  );
  if (missing.length) {
    throw new LibraryWorkbookError(
      missing.map((column) => `missing column "${column}"`),
    );
  }

  const rows: LibrarySheetRow[] = [];
  sheet.eachRow((sheetRow, rowNumber) => {
    if (rowNumber === 1) return;
    const row: LibrarySheetRow = {};
    sheetRow.eachCell((cell, column) => {
      const name = columns.get(column);
      const text = cellText(cell.value);
      if (name && text) row[name] = text;
    });
    if (Object.keys(row).length) rows.push(row);
  });
  return rows;
};

const readUnique = <S, T>(
  sheetRows: S[],
  map: (row: S) => T,
  idOf: (row: T) => string,
  problems: string[],
): T[] => {
  const mapped: T[] = [];
  const seen = new Set<string>();
  for (const sheetRow of sheetRows) {
    try {
      const row = map(sheetRow);
      if (seen.has(idOf(row))) {
        problems.push(`${idOf(row)}: duplicate id`);
        continue;
      }
      seen.add(idOf(row));
      mapped.push(row);
    } catch (error) {
      problems.push((error as Error).message);
    }
  }
  return mapped;
};

/**
 * Reads the whole workbook or nothing. A single bad row refuses the import, so a
 * half-understood file can never leave the library half-updated.
 */
export const readLibraryWorkbook = async (
  file: Buffer,
): Promise<LibraryWorkbook> => {
  const workbook = new ExcelJS.Workbook();
  // exceljs declares its own Buffer shape, which Node's generic Buffer misses.
  await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
  const librarySheet = workbook.getWorksheet(LIBRARY_SHEET_NAME);
  const examplesSheet = workbook.getWorksheet(LIBRARY_EXAMPLES_SHEET_NAME);
  const anchorsSheet = workbook.getWorksheet(LIBRARY_ANCHORS_SHEET_NAME);
  if (!librarySheet && !examplesSheet) {
    throw new LibraryWorkbookError([`missing sheet "${LIBRARY_SHEET_NAME}"`]);
  }
  const hooksSheet = workbook.getWorksheet(LIBRARY_HOOKS_SHEET_NAME);
  if (librarySheet && !hooksSheet) {
    throw new LibraryWorkbookError([
      `missing sheet "${LIBRARY_HOOKS_SHEET_NAME}"`,
    ]);
  }

  const problems: string[] = [];
  const anchors = anchorsSheet
    ? readUnique(
        readSheetRows(anchorsSheet, LIBRARY_ANCHOR_COLUMNS),
        (row) => mapLibraryAnchorRow(row),
        (anchor) => anchor.anchorId,
        problems,
      )
    : [];
  const rows = readUnique(
    [
      ...(librarySheet
        ? readSheetRows(librarySheet, LIBRARY_REQUIRED_COLUMNS).map(
            (row) => [row, 'Library'] as const,
          )
        : []),
      ...(examplesSheet
        ? readSheetRows(examplesSheet, LIBRARY_EXAMPLE_COLUMNS).map(
            (row) => [row, 'Examples'] as const,
          )
        : []),
    ],
    ([row, sheet]) =>
      sheet === 'Library' ? mapLibrarySheetRow(row) : mapLibraryExampleRow(row),
    (row) => row.libraryId,
    problems,
  );
  for (const row of rows) {
    if (row.reviewStatus !== 'APPROVED') continue;
    for (const problem of validateLibraryClosestRow(row, anchors)) {
      problems.push(`${row.libraryId}: ${problem}`);
    }
    if (!row.mechanicKeys.includes('top-5')) continue;
    for (const found of validateLibraryTop5Row(row)) {
      problems.push(`${row.libraryId}: ${found.code}: ${found.message}`);
    }
  }
  const hooks = hooksSheet
    ? readUnique(
        readSheetRows(hooksSheet, LIBRARY_HOOK_COLUMNS),
        mapLibraryHookRow,
        (hook) => hook.hookId,
        problems,
      )
    : [];
  if (!rows.length && !problems.length) problems.push('no rows found');
  if (problems.length) throw new LibraryWorkbookError(problems);
  return {
    rows,
    hooks,
    anchors,
    sheets: [
      ...(librarySheet ? [LIBRARY_SHEET_NAME] : []),
      ...(examplesSheet ? [LIBRARY_EXAMPLES_SHEET_NAME] : []),
      ...(hooksSheet ? [LIBRARY_HOOKS_SHEET_NAME] : []),
      ...(anchorsSheet ? [LIBRARY_ANCHORS_SHEET_NAME] : []),
    ],
  };
};
