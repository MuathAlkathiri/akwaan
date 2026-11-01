import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  isLibraryRowGenerationEligible,
  LibraryRow,
} from '../domain/library-row';
import { EngineLibraryRowDocument } from '../schemas/engine-library-row.schema';

export interface LibraryImportSummary {
  total: number;
  approved: number;
  generationEligible: number;
  created: number;
  updated: number;
  unchanged: number;
  retired: number;
}

/**
 * Keeps `engine_library_rows` equal to the latest workbook, keyed by row id.
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
  ) {}

  async importRows(incoming: LibraryRow[]): Promise<LibraryImportSummary> {
    const stored = await this.rows
      .find({}, { libraryId: 1, rowHash: 1, retired: 1 })
      .lean()
      .exec();
    const storedById = new Map(stored.map((row) => [row.libraryId, row]));

    const changed = incoming.filter((row) => {
      const current = storedById.get(row.libraryId);
      return !current || current.retired || current.rowHash !== row.rowHash;
    });
    const incomingIds = new Set(incoming.map((row) => row.libraryId));
    const dropped = stored
      .filter((row) => !row.retired && !incomingIds.has(row.libraryId))
      .map((row) => row.libraryId);

    if (changed.length) {
      await this.rows.bulkWrite(
        changed.map((row) => ({
          updateOne: {
            filter: { libraryId: row.libraryId },
            update: { $set: { ...row, retired: false } },
            upsert: true,
          },
        })),
      );
    }
    if (dropped.length) {
      await this.rows.updateMany(
        { libraryId: { $in: dropped } },
        { $set: { retired: true } },
      );
    }

    const created = changed.filter(
      (row) => !storedById.has(row.libraryId),
    ).length;
    return {
      total: incoming.length,
      approved: incoming.filter((row) => row.reviewStatus === 'APPROVED')
        .length,
      generationEligible: incoming.filter(isLibraryRowGenerationEligible)
        .length,
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
}
