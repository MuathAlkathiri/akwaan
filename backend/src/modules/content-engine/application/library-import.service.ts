import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  isLibraryHookWriterEligible,
  isLibraryRowGenerationEligible,
  LibraryHook,
  LibraryRow,
} from '../domain/library-row';
import { LibraryWorkbook } from '../infrastructure/library-workbook.reader';
import { EngineLibraryHookDocument } from '../schemas/engine-library-hook.schema';
import { EngineLibraryRowDocument } from '../schemas/engine-library-row.schema';

export interface LibraryImportSummary {
  total: number;
  approved: number;
  generationEligible: number;
  created: number;
  updated: number;
  unchanged: number;
  retired: number;
  hooks: { total: number; writerEligible: number };
}

/** The operations `sync` needs, common to both library collections. */
type SyncModel = Pick<
  Model<{ rowHash: string; retired: boolean }>,
  'find' | 'bulkWrite' | 'updateMany'
>;

interface SyncOutcome {
  created: number;
  updated: number;
  unchanged: number;
  retired: number;
}

/**
 * Keeps the library collections equal to the latest workbook, keyed by id.
 *
 * Importing the same workbook twice writes nothing. A row a newer workbook drops
 * is retired rather than deleted, so an approval that was withdrawn stops feeding
 * generation while its history stays readable.
 */
@Injectable()
export class LibraryImportService {
  constructor(
    @InjectModel(EngineLibraryRowDocument.name)
    private readonly rows: Model<EngineLibraryRowDocument>,
    @InjectModel(EngineLibraryHookDocument.name)
    private readonly hooks: Model<EngineLibraryHookDocument>,
  ) {}

  async importWorkbook(
    workbook: LibraryWorkbook,
  ): Promise<LibraryImportSummary> {
    const rowsOutcome = await this.sync(
      this.rows as unknown as SyncModel,
      'libraryId',
      workbook.rows,
    );
    await this.sync(
      this.hooks as unknown as SyncModel,
      'hookId',
      workbook.hooks,
    );
    return {
      total: workbook.rows.length,
      approved: workbook.rows.filter((row) => row.reviewStatus === 'APPROVED')
        .length,
      generationEligible: workbook.rows.filter(isLibraryRowGenerationEligible)
        .length,
      ...rowsOutcome,
      hooks: {
        total: workbook.hooks.length,
        writerEligible: workbook.hooks.filter(isLibraryHookWriterEligible)
          .length,
      },
    };
  }

  private async sync(
    model: SyncModel,
    idField: 'libraryId' | 'hookId',
    incoming: Array<LibraryRow | LibraryHook>,
  ): Promise<SyncOutcome> {
    const idOf = (row: object) => (row as Record<string, string>)[idField];
    const stored = await model
      .find({}, { [idField]: 1, rowHash: 1, retired: 1 })
      .lean()
      .exec();
    const storedById = new Map(stored.map((row) => [idOf(row), row]));

    const changed = incoming.filter((row) => {
      const current = storedById.get(idOf(row));
      return !current || current.retired || current.rowHash !== row.rowHash;
    });
    const incomingIds = new Set(incoming.map(idOf));
    const dropped = stored
      .filter((row) => !row.retired && !incomingIds.has(idOf(row)))
      .map(idOf);

    if (changed.length) {
      await model.bulkWrite(
        changed.map((row) => ({
          updateOne: {
            filter: { [idField]: idOf(row) },
            update: { $set: { ...row, retired: false } },
            upsert: true,
          },
        })),
      );
    }
    if (dropped.length) {
      await model.updateMany(
        { [idField]: { $in: dropped } },
        { $set: { retired: true } },
      );
    }

    const created = changed.filter((row) => !storedById.has(idOf(row))).length;
    return {
      created,
      updated: changed.length - created,
      unchanged: incoming.length - changed.length,
      retired: dropped.length,
    };
  }

  /** Rows that may feed this exact World, Scope and mechanic, oldest id first. */
  async findEligible(target: {
    worldKey: string;
    scopeKey: string;
    mechanicKey: string;
  }): Promise<EngineLibraryRowDocument[]> {
    const rows = await this.rows
      .find({
        worldKey: target.worldKey,
        scopeKey: target.scopeKey,
        mechanicKeys: target.mechanicKey,
        retired: false,
      })
      .sort({ libraryId: 1 })
      .lean()
      .exec();
    return rows.filter(isLibraryRowGenerationEligible);
  }

  /** Approved hooks written for this mechanic. Anti-patterns never pass. */
  async findWriterHooks(
    mechanicKey: string,
  ): Promise<EngineLibraryHookDocument[]> {
    const hooks = await this.hooks
      .find({ mechanicKeys: mechanicKey, retired: false })
      .sort({ hookId: 1 })
      .lean()
      .exec();
    return hooks.filter(isLibraryHookWriterEligible);
  }
}
