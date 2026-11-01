import 'dotenv/config';
import { readFile } from 'fs/promises';
import mongoose from 'mongoose';
import { LibraryImportService } from '../modules/content-engine/application/library-import.service';
import { isLibraryRowGenerationEligible } from '../modules/content-engine/domain/library-row';
import { readLibraryWorkbook } from '../modules/content-engine/infrastructure/library-workbook.reader';
import {
  EngineLibraryRowDocument,
  EngineLibraryRowSchema,
} from '../modules/content-engine/schemas/engine-library-row.schema';

/**
 * Imports the verified question library workbook.
 *
 *   npm run import:content-library -- <workbook.xlsx>
 *   npm run import:content-library -- <workbook.xlsx> --apply --database=<name>
 *
 * Without `--apply` this reads and validates the file and prints what it derived.
 * It never connects to a database. With `--apply`, `--database` must name the
 * database MONGODB_URI actually reaches, so an import cannot land somewhere by
 * accident of the environment. Index creation waits for that check too.
 */

export const databaseArgument = (argv: string[]): string | undefined =>
  argv
    .find((arg) => arg.startsWith('--database='))
    ?.slice('--database='.length);

export const assertImportTarget = (
  connected: string,
  requested: string | undefined,
): void => {
  if (!requested) {
    throw new Error('--apply requires --database=<name>');
  }
  if (connected !== requested) {
    throw new Error(
      `Refusing to import: connected to "${connected}", --database says "${requested}"`,
    );
  }
};

const printDerivedValues = (
  rows: Awaited<ReturnType<typeof readLibraryWorkbook>>,
): void => {
  const approved = rows.filter((row) => row.reviewStatus === 'APPROVED');
  console.table(
    approved.map((row) => ({
      id: row.libraryId,
      scope: row.scopeKey ?? row.scopeStatus,
      mechanics: row.mechanicKeys.join(' + ') || '-',
      role: row.role,
      eligible: isLibraryRowGenerationEligible(row),
      answer: row.canonicalAnswer,
      number: row.canonicalNumber,
      revalidateAfter: row.revalidateAfter,
    })),
  );
  console.log(
    `${rows.length} rows, ${approved.length} APPROVED, ` +
      `${rows.filter(isLibraryRowGenerationEligible).length} eligible for generation`,
  );
};

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  const workbookPath = argv.find((arg) => !arg.startsWith('--'));
  if (!workbookPath) throw new Error('Pass the workbook path');

  const rows = await readLibraryWorkbook(await readFile(workbookPath));
  printDerivedValues(rows);
  if (!argv.includes('--apply')) {
    console.log('Dry run: nothing was written.');
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('--apply requires MONGODB_URI');
  await mongoose.connect(uri, { autoIndex: false });
  try {
    assertImportTarget(mongoose.connection.name, databaseArgument(argv));
    const model = mongoose.model(
      EngineLibraryRowDocument.name,
      EngineLibraryRowSchema,
    );
    await model.createIndexes();
    console.log(await new LibraryImportService(model).importRows(rows));
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
