import ExcelJS from 'exceljs';
import {
  LIBRARY_REQUIRED_COLUMNS,
  LibraryRow,
  LibrarySheetRow,
  mapLibrarySheetRow,
} from '../domain/library-row';

export const LIBRARY_SHEET_NAME = 'Library';

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

const readSheetRows = (sheet: ExcelJS.Worksheet): LibrarySheetRow[] => {
  const columns = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, column) => {
    columns.set(column, cellText(cell.value));
  });

  const missing = LIBRARY_REQUIRED_COLUMNS.filter(
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

/**
 * Reads the whole workbook or nothing. A single bad row refuses the import, so a
 * half-understood file can never leave the library half-updated.
 */
export const readLibraryWorkbook = async (
  file: Buffer,
): Promise<LibraryRow[]> => {
  const workbook = new ExcelJS.Workbook();
  // exceljs declares its own Buffer shape, which Node's generic Buffer misses.
  await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet(LIBRARY_SHEET_NAME);
  if (!sheet) {
    throw new LibraryWorkbookError([`missing sheet "${LIBRARY_SHEET_NAME}"`]);
  }

  const problems: string[] = [];
  const rows: LibraryRow[] = [];
  const seen = new Set<string>();
  for (const sheetRow of readSheetRows(sheet)) {
    try {
      const row = mapLibrarySheetRow(sheetRow);
      if (seen.has(row.libraryId)) {
        problems.push(`${row.libraryId}: duplicate id`);
        continue;
      }
      seen.add(row.libraryId);
      rows.push(row);
    } catch (error) {
      problems.push((error as Error).message);
    }
  }
  if (!rows.length && !problems.length) problems.push('no rows found');
  if (problems.length) throw new LibraryWorkbookError(problems);
  return rows;
};
