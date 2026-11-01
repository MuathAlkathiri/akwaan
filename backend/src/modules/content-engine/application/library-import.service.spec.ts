import { readFileSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import mongoose, { Model } from 'mongoose';
import {
  isLibraryHookWriterEligible,
  isLibraryRowGenerationEligible,
  LIBRARY_HOOK_COLUMNS,
  LIBRARY_REQUIRED_COLUMNS,
  LibraryHook,
  LibraryRow,
  mapLibrarySheetRow,
} from '../domain/library-row';
import {
  LibraryWorkbook,
  LibraryWorkbookError,
  readLibraryWorkbook,
} from '../infrastructure/library-workbook.reader';
import { bindStructuredSeed } from '../domain/structured-seed-binding';
import { EngineLibraryHookDocument } from '../schemas/engine-library-hook.schema';
import {
  EngineLibraryRowDocument,
  EngineLibraryRowSchema,
} from '../schemas/engine-library-row.schema';
import {
  assertImportTarget,
  databaseArgument,
} from '../../../scripts/import-content-library';
import { LibraryImportService } from './library-import.service';

const FIXTURE = join(__dirname, '../testing/fixtures/akwaan_library_v1.xlsx');

const fixtureWorkbook = (): Promise<LibraryWorkbook> =>
  readLibraryWorkbook(readFileSync(FIXTURE));

const fixtureRows = async (): Promise<LibraryRow[]> =>
  (await fixtureWorkbook()).rows;

type Stored = (LibraryRow | LibraryHook) & { retired: boolean };

/** Enough of a Model for the service, with counted writes. */
const fakeCollection = (idField: 'libraryId' | 'hookId') => {
  const docs = new Map<string, Stored>();
  const writes = { bulkWrite: 0, updateMany: 0 };
  const idOf = (row: Stored) =>
    (row as unknown as Record<string, string>)[idField];
  const query = (rows: Stored[]) => ({
    sort: () => query(rows),
    lean: () => ({ exec: () => Promise.resolve(rows) }),
  });
  const model = {
    find: (filter: Record<string, unknown>) => {
      const rows = [...docs.values()].filter((doc) => {
        const row = doc as unknown as Record<string, unknown>;
        return (
          (filter.worldKey === undefined || row.worldKey === filter.worldKey) &&
          (filter.scopeKey === undefined || row.scopeKey === filter.scopeKey) &&
          (filter.mechanicKeys === undefined ||
            doc.mechanicKeys.includes(filter.mechanicKeys as string)) &&
          (filter.retired === undefined || doc.retired === filter.retired)
        );
      });
      return query(rows);
    },
    bulkWrite: (ops: Array<{ updateOne: { update: { $set: Stored } } }>) => {
      writes.bulkWrite += 1;
      for (const op of ops) {
        const row = op.updateOne.update.$set;
        docs.set(idOf(row), row);
      }
      return Promise.resolve();
    },
    updateMany: (filter: Record<string, { $in: string[] }>) => {
      writes.updateMany += 1;
      for (const id of filter[idField].$in) {
        docs.get(id)!.retired = true;
      }
      return Promise.resolve();
    },
  };
  return { docs, writes, model };
};

const fakeModel = () => {
  const rows = fakeCollection('libraryId');
  const hooks = fakeCollection('hookId');
  return {
    docs: rows.docs,
    hookDocs: hooks.docs,
    writes: rows.writes,
    service: new LibraryImportService(
      rows.model as unknown as Model<EngineLibraryRowDocument>,
      hooks.model as unknown as Model<EngineLibraryHookDocument>,
    ),
  };
};

const workbookWith = async (
  rows: Array<Record<string, string>>,
  extraHeaders: string[] = [],
): Promise<Buffer> => {
  const headers = [...LIBRARY_REQUIRED_COLUMNS, ...extraHeaders];
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Hooks').addRow([...LIBRARY_HOOK_COLUMNS]);
  const sheet = workbook.addWorksheet('Library');
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((header) => row[header] ?? null));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const parkedSheetRow = (id: string) => ({
  id,
  question: 'سؤال؟',
  world: 'football',
  scope_status: 'FUTURE_WORLD',
  asof_needed: 'N',
  role: 'PARK',
  review_status: 'PARK',
});

describe('library workbook import', () => {
  it('stores all 78 rows and loads the 21 APPROVED ones', async () => {
    const rows = await fixtureRows();
    expect(rows).toHaveLength(78);
    expect(rows.filter((row) => row.reviewStatus === 'APPROVED')).toHaveLength(
      21,
    );
    expect(rows.filter((row) => row.reviewStatus === 'PARK')).toHaveLength(50);
    expect(rows.filter((row) => row.reviewStatus === 'REJECT')).toHaveLength(7);
  });

  it('never lets PARK or REJECT rows reach generation', async () => {
    const rows = await fixtureRows();
    const eligible = rows.filter(isLibraryRowGenerationEligible);
    expect(eligible).toHaveLength(16);
    expect(
      eligible.every(
        (row) => row.reviewStatus === 'APPROVED' && row.scopeStatus === 'MATCH',
      ),
    ).toBe(true);
  });

  it('gates APPROVED rows whose Scope does not exist yet', async () => {
    const byId = new Map(
      (await fixtureRows()).map((row) => [row.libraryId, row]),
    );
    for (const id of ['LIB-004', 'LIB-010', 'LIB-024', 'LIB-035', 'LIB-077']) {
      expect(byId.get(id)?.reviewStatus).toBe('APPROVED');
      expect(isLibraryRowGenerationEligible(byId.get(id)!)).toBe(false);
    }
  });

  it('keeps the rows parked in this workbook out', async () => {
    const byId = new Map(
      (await fixtureRows()).map((row) => [row.libraryId, row]),
    );
    for (const id of ['LIB-011', 'LIB-012', 'LIB-062']) {
      expect(byId.get(id)?.reviewStatus).toBe('PARK');
      expect(isLibraryRowGenerationEligible(byId.get(id)!)).toBe(false);
    }
  });

  it('parses every Top-5 row into five answers and five traps', async () => {
    const top5Rows = (await fixtureRows()).filter((row) => row.top5);
    expect(top5Rows.map((row) => row.libraryId)).toEqual([
      'LIB-035',
      'LIB-074',
      'LIB-076',
      'LIB-077',
      'LIB-078',
    ]);
    for (const row of top5Rows) {
      expect(row.top5?.correct).toHaveLength(5);
      expect(row.top5?.traps).toHaveLength(5);
      const labels = [
        ...row.top5!.correct.map((entry) => entry.label),
        ...row.top5!.traps,
      ];
      expect(labels.filter((label) => /[()\d]{4}/.test(label))).toEqual([]);
    }
  });

  it('produces rows the stored schema accepts', async () => {
    const connection = mongoose.createConnection();
    const model = connection.model(
      EngineLibraryRowDocument.name,
      EngineLibraryRowSchema,
    );
    for (const row of await fixtureRows()) {
      expect(new model({ ...row, retired: false }).validateSync()).toBe(
        undefined,
      );
    }
    await connection.close();
  });

  it('turns the event estimate into revalidate_after', async () => {
    const byId = new Map(
      (await fixtureRows()).map((row) => [row.libraryId, row]),
    );
    expect(byId.get('LIB-035')?.revalidateAfter).toBe('2026-12-31');
    expect(byId.get('LIB-076')?.revalidateAfter).toBe('2030-07-31');
    // LIB-010 goes stale but its next event is unknown.
    expect(byId.get('LIB-010')?.revalidateAfter).toBe('2027-11-01');
  });

  it('refuses the whole workbook when one row is bad', async () => {
    const file = await workbookWith([
      parkedSheetRow('LIB-1'),
      { ...parkedSheetRow('LIB-2'), review_status: 'APPROVED' },
    ]);
    await expect(readLibraryWorkbook(file)).rejects.toThrow(
      'LIB-2: APPROVED without verified_answer',
    );
  });

  it('refuses a duplicate id', async () => {
    const file = await workbookWith([
      parkedSheetRow('LIB-1'),
      parkedSheetRow('LIB-1'),
    ]);
    await expect(readLibraryWorkbook(file)).rejects.toThrow(
      'LIB-1: duplicate id',
    );
  });

  it('refuses a workbook missing a required column', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Hooks').addRow([...LIBRARY_HOOK_COLUMNS]);
    workbook.addWorksheet('Library').addRow(['id', 'question']);
    await expect(
      readLibraryWorkbook(Buffer.from(await workbook.xlsx.writeBuffer())),
    ).rejects.toThrow(LibraryWorkbookError);
  });

  it('refuses a workbook without the Library sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Other').addRow(['id']);
    await expect(
      readLibraryWorkbook(Buffer.from(await workbook.xlsx.writeBuffer())),
    ).rejects.toThrow('missing sheet "Library"');
  });
});

describe('LibraryImportService', () => {
  it('writes nothing when the same workbook is imported twice', async () => {
    const { service, writes } = fakeModel();
    const rows = await fixtureRows();

    expect(await service.importWorkbook({ rows, hooks: [] })).toMatchObject({
      total: 78,
      approved: 21,
      generationEligible: 16,
      created: 78,
      updated: 0,
      unchanged: 0,
      retired: 0,
    });
    expect(await service.importWorkbook({ rows, hooks: [] })).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 78,
      retired: 0,
    });
    expect(writes).toEqual({ bulkWrite: 1, updateMany: 0 });
  });

  it('updates a changed row by id and leaves the others alone', async () => {
    const { service, docs } = fakeModel();
    const rows = await fixtureRows();
    await service.importWorkbook({ rows, hooks: [] });

    const edited = rows.map((row) =>
      row.libraryId === 'LIB-069'
        ? { ...row, canonicalNumber: 97, rowHash: 'changed' }
        : row,
    );
    expect(
      await service.importWorkbook({ rows: edited, hooks: [] }),
    ).toMatchObject({
      created: 0,
      updated: 1,
      unchanged: 77,
    });
    expect(docs.size).toBe(78);
    expect((docs.get('LIB-069') as LibraryRow).canonicalNumber).toBe(97);
  });

  it('applies a demotion, so a withdrawn approval stops feeding', async () => {
    const { service } = fakeModel();
    const rows = await fixtureRows();
    await service.importWorkbook({ rows, hooks: [] });
    const target = {
      worldKey: 'football',
      scopeKey: 'saudi-league',
      mechanicKey: 'closest',
    };
    expect(
      (await service.findEligible(target)).map((row) => row.libraryId),
    ).toEqual(['LIB-069']);

    await service.importWorkbook({
      rows: rows.map((row) =>
        row.libraryId === 'LIB-069'
          ? { ...row, reviewStatus: 'PARK', rowHash: 'demoted' }
          : row,
      ),
      hooks: [],
    });
    expect(await service.findEligible(target)).toEqual([]);
  });

  it('retires a dropped row and restores it when it returns', async () => {
    const { service, docs } = fakeModel();
    const rows = await fixtureRows();
    await service.importWorkbook({ rows, hooks: [] });
    const target = {
      worldKey: 'anime',
      scopeKey: 'demon-slayer',
      mechanicKey: 'read-your-opponent',
    };

    const without = rows.filter((row) => row.libraryId !== 'LIB-021');
    expect(
      await service.importWorkbook({ rows: without, hooks: [] }),
    ).toMatchObject({ retired: 1 });
    expect(docs.get('LIB-021')?.retired).toBe(true);
    expect(await service.findEligible(target)).toEqual([]);

    expect(await service.importWorkbook({ rows, hooks: [] })).toMatchObject({
      updated: 1,
      retired: 0,
    });
    expect(
      (await service.findEligible(target)).map((row) => row.libraryId),
    ).toEqual(['LIB-021']);
  });

  it('finds rows by Scope and mechanic, not by Scope alone', async () => {
    const { service } = fakeModel();
    await service.importWorkbook(await fixtureWorkbook());
    const find = async (scopeKey: string, mechanicKey: string) =>
      (
        await service.findEligible({
          worldKey: 'football',
          scopeKey,
          mechanicKey,
        })
      ).map((row) => row.libraryId);

    expect(await find('saudi-league', 'read-your-opponent')).toEqual([
      'LIB-009',
      'LIB-029',
      'LIB-057',
      'LIB-058',
    ]);
    expect(await find('la-liga', 'top-5')).toEqual(['LIB-074']);
    expect(await find('la-liga', 'read-your-opponent')).toEqual([]);
  });
});

describe('library hooks', () => {
  it('imports all twelve and offers only H01-H07 to the writer', async () => {
    const { hooks } = await fixtureWorkbook();
    expect(hooks).toHaveLength(12);
    expect(
      hooks.filter(isLibraryHookWriterEligible).map((hook) => hook.hookId),
    ).toEqual(['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07']);
  });

  it('never offers X01-X05 to the writer for any mechanic', async () => {
    const { service, hookDocs } = fakeModel();
    await service.importWorkbook(await fixtureWorkbook());
    expect(hookDocs.has('X01')).toBe(true);
    for (const mechanicKey of [
      'read-your-opponent',
      'closest',
      'top-5',
      'bomb',
    ]) {
      const ids = (await service.findWriterHooks(mechanicKey)).map(
        (hook) => hook.hookId,
      );
      expect(ids.filter((id) => id.startsWith('X'))).toEqual([]);
    }
  });

  it('refuses an anti-pattern even if its id were listed as approved', () => {
    expect(
      isLibraryHookWriterEligible({ hookId: 'H01', type: 'ANTI-PATTERN' }),
    ).toBe(false);
  });

  it('matches hooks to the mechanic they were written for', async () => {
    const { service } = fakeModel();
    await service.importWorkbook(await fixtureWorkbook());
    const ids = async (mechanicKey: string) =>
      (await service.findWriterHooks(mechanicKey)).map((hook) => hook.hookId);
    expect(await ids('read-your-opponent')).toEqual(['H01', 'H03', 'H07']);
    expect(await ids('closest')).toEqual(['H02']);
  });
});

describe('weak source warning', () => {
  it('flags LIB-021 and keeps it eligible', async () => {
    const row = (await fixtureRows()).find((r) => r.libraryId === 'LIB-021')!;
    expect(row.sourceWarning).toBe('WEAK_SOURCE');
    expect(isLibraryRowGenerationEligible(row)).toBe(true);
  });

  it('flags every row citing a weak host, and only those', async () => {
    const rows = await fixtureRows();
    expect(
      rows.filter((row) => row.sourceWarning).map((row) => row.libraryId),
    ).toEqual(['LIB-021', 'LIB-059']);
  });

  it.each([
    ['https://daddyjim.ai/one-piece/manga-chapter/Chapter-579', 'WEAK_SOURCE'],
    ['https://www.oddscalendar.com/football/standings', 'WEAK_SOURCE'],
    ['https://otakumode.com/otapedia/x', 'WEAK_SOURCE'],
    ['https://blog.otakumode.com/x', 'WEAK_SOURCE'],
    ['https://notdaddyjim.ai/x', null],
    ['https://en.wikipedia.org/wiki/x', null],
  ])('reads the host of %s', (sourceUrl, expected) => {
    expect(
      mapLibrarySheetRow({
        id: 'LIB-1',
        question: 'س؟',
        scope_status: 'MATCH',
        role: 'FACT_SEED',
        review_status: 'APPROVED',
        asof_needed: 'N',
        verified_answer: 'ج',
        verified_on: '2026-11-01',
        source_url: sourceUrl,
      }).sourceWarning,
    ).toBe(expected);
  });
});

describe('LIB-021 against its stored answer', () => {
  const bind = async (correctLabel: string) => {
    const row = (await fixtureRows()).find((r) => r.libraryId === 'LIB-021')!;
    return bindStructuredSeed({
      draft: {
        prompt: { ar: 'ما كان عمل دوما قبل أن يتحول؟' },
        answerPayload: {
          mode: 'multiple_choice',
          correctOptionId: 'a',
          options: [{ id: 'a', label: { ar: correctLabel } }],
        },
      },
      seeds: [
        {
          libraryId: row.libraryId,
          role: row.role,
          questionText: row.questionText,
          verifiedAnswer: row.verifiedAnswer!,
          canonicalAnswer: row.canonicalAnswer,
          canonicalNumber: row.canonicalNumber,
          sourceUrl: row.sourceUrl!,
          verifiedOn: row.verifiedOn!,
          revalidateAfter: row.revalidateAfter,
          sourceWarning: row.sourceWarning,
        },
      ],
      today: '2026-11-01',
    });
  };

  it('binds on the exact answer text and keeps its source warning', async () => {
    const binding = await bind('زعيم طائفة دينية');
    expect(binding.covered).toBe(true);
    expect(binding.covered && binding.evidence.sourceWarning).toBe(
      'WEAK_SOURCE',
    );
  });

  it('does not bind on the old wording', async () => {
    expect(await bind('زعيم طائفة «الجنة الأبدية»')).toMatchObject({
      covered: false,
      reason: 'ANSWER_CHANGED',
    });
  });
});

describe('import target guard', () => {
  it('refuses --apply without a named database', () => {
    expect(() => assertImportTarget('lammah-quiz', undefined)).toThrow(
      '--apply requires --database=<name>',
    );
  });

  it('refuses a database other than the one connected', () => {
    expect(() => assertImportTarget('lammah-quiz', 'library_test')).toThrow(
      'Refusing to import',
    );
  });

  it('accepts the database it is connected to', () => {
    expect(() =>
      assertImportTarget('library_test', 'library_test'),
    ).not.toThrow();
  });

  it('reads --database from the arguments', () => {
    expect(databaseArgument(['a.xlsx', '--apply', '--database=x_test'])).toBe(
      'x_test',
    );
    expect(databaseArgument(['a.xlsx', '--apply'])).toBeUndefined();
  });
});
