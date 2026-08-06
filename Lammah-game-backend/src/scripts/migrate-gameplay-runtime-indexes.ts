import 'dotenv/config';
import mongoose from 'mongoose';
import type { Db } from 'mongodb';
import { LIVE_GAMEPLAY_RUNTIME_STATUSES } from '../modules/live-game-sessions/infrastructure/gameplay-runtime.schema';

const APPLY = process.argv.includes('--apply');
const MONGO_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/lammah-quiz';

const LEGACY_UNIQUE_INDEX = 'sessionId_1';
const LIVE_RUNTIME_INDEX = 'sessionId_live_unique';
const RECENCY_INDEX = 'sessionId_1_createdAt_-1';

export interface GameplayRuntimeIndexMigrationReport {
  apply: boolean;
  legacyUniqueIndexPresent: boolean;
  legacyUniqueIndexDropped: number;
  liveRuntimeIndexCreated: number;
  recencyIndexCreated: number;
  runtimesBackfilledWithCreatedAt: number;
  runtimeDocumentsPreserved: number;
}

/**
 * A live session hosts one runtime at a time but several across a Match, so the
 * old globally-unique `sessionId` index has to become a partial unique index over
 * the *live* statuses only.
 *
 * Nothing is deleted: every existing runtime document is kept, and the top-level
 * `createdAt` mirror is backfilled from the state each document already carries so
 * "the session's current runtime" stays answerable.
 */
export class GameplayRuntimeIndexMigration {
  constructor(
    private readonly db: Db,
    private readonly apply: boolean,
  ) {}

  async run(): Promise<GameplayRuntimeIndexMigrationReport> {
    const runtimes = this.db.collection('gameplay_runtimes');
    const existing = await runtimes.indexes();
    const names = new Set(existing.map((index) => index.name));
    const legacy = existing.find(
      (index) => index.name === LEGACY_UNIQUE_INDEX && index.unique === true,
    );
    const missingCreatedAt = { createdAt: { $exists: false } };
    const runtimesBackfilledWithCreatedAt =
      await runtimes.countDocuments(missingCreatedAt);
    const runtimeDocumentsPreserved = await runtimes.countDocuments({});

    if (this.apply) {
      if (runtimesBackfilledWithCreatedAt > 0) {
        // Mirrors the value already stored inside `state`; no timestamp is invented.
        await runtimes.updateMany(missingCreatedAt, [
          { $set: { createdAt: '$state.createdAt' } },
        ]);
      }
      if (legacy) await runtimes.dropIndex(LEGACY_UNIQUE_INDEX);
      if (!names.has(LIVE_RUNTIME_INDEX)) {
        await runtimes.createIndex(
          { sessionId: 1 },
          {
            name: LIVE_RUNTIME_INDEX,
            unique: true,
            partialFilterExpression: {
              status: { $in: LIVE_GAMEPLAY_RUNTIME_STATUSES },
            },
          },
        );
      }
      if (!names.has(RECENCY_INDEX)) {
        await runtimes.createIndex(
          { sessionId: 1, createdAt: -1 },
          { name: RECENCY_INDEX },
        );
      }
    }

    return {
      apply: this.apply,
      legacyUniqueIndexPresent: Boolean(legacy),
      legacyUniqueIndexDropped: legacy ? 1 : 0,
      liveRuntimeIndexCreated: names.has(LIVE_RUNTIME_INDEX) ? 0 : 1,
      recencyIndexCreated: names.has(RECENCY_INDEX) ? 0 : 1,
      runtimesBackfilledWithCreatedAt,
      runtimeDocumentsPreserved,
    };
  }
}

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const report = await new GameplayRuntimeIndexMigration(db, APPLY).run();
  console.log(
    JSON.stringify(
      {
        mode: APPLY ? 'APPLIED' : 'DRY RUN',
        ...report,
        note: 'No gameplay runtime, live session, or legacy game record is deleted or rewritten.',
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('Gameplay runtime index migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  });
}
