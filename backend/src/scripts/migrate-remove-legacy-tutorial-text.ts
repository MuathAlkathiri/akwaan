import 'dotenv/config';
import mongoose from 'mongoose';
import type { Db } from 'mongodb';

const APPLY = process.argv.includes('--apply');
const MONGO_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/lammah-quiz';

/**
 * The retired text tutorial system had exactly two persistence entry points:
 * the mechanic-global `playerInstructions` object and the per-World
 * configuration `instructions` string. GSAP scenarios and their revision
 * history live elsewhere and are deliberately not included here.
 */
export const LEGACY_TUTORIAL_TEXT_TARGETS = [
  {
    collection: 'challenge_types',
    fieldPath: 'defaultPresentation.playerInstructions',
  },
  {
    collection: 'world_challenge_configurations',
    fieldPath: 'instructions',
  },
] as const;

export interface LegacyTutorialTextCleanupReport {
  mode: 'DRY RUN' | 'APPLIED';
  targetDatabase: string;
  targets: Array<{
    collection: string;
    fieldPath: string;
    matchedDocuments: number;
    removedDocuments: number;
    remainingDocuments: number;
  }>;
  gsapCollectionsUntouched: string[];
  rollbackPrerequisites: string[];
}

function databaseLabel(uri: string): string {
  try {
    const parsed = new URL(uri);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '<unparseable MONGODB_URI>';
  }
}

export class LegacyTutorialTextCleanup {
  constructor(
    private readonly db: Db,
    private readonly apply: boolean,
    private readonly targetDatabase: string,
  ) {}

  async run(): Promise<LegacyTutorialTextCleanupReport> {
    const targets: LegacyTutorialTextCleanupReport['targets'] = [];

    for (const target of LEGACY_TUTORIAL_TEXT_TARGETS) {
      const collection = this.db.collection(target.collection);
      const filter = { [target.fieldPath]: { $exists: true } };
      const matchedDocuments = await collection.countDocuments(filter);

      let removedDocuments = 0;
      if (this.apply && matchedDocuments > 0) {
        const result = await collection.updateMany(filter, {
          $unset: { [target.fieldPath]: '' },
        });
        removedDocuments = result.modifiedCount;
      }

      const remainingDocuments = await collection.countDocuments(filter);
      targets.push({
        collection: target.collection,
        fieldPath: target.fieldPath,
        matchedDocuments,
        removedDocuments,
        remainingDocuments,
      });
    }

    return {
      mode: this.apply ? 'APPLIED' : 'DRY RUN',
      targetDatabase: this.targetDatabase,
      targets,
      gsapCollectionsUntouched: [
        'challenge_types.tutorial',
        'scoped_mechanic_tutorials',
      ],
      rollbackPrerequisites: [
        'Take a targeted export of the two legacy fields before --apply.',
        'Restore only those fields from the export if rollback is required.',
        'Re-run this script without --apply to verify zero remaining legacy fields.',
      ],
    };
  }
}

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');

  const report = await new LegacyTutorialTextCleanup(
    db,
    APPLY,
    databaseLabel(MONGO_URI),
  ).run();
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('Legacy tutorial text cleanup failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  });
}
