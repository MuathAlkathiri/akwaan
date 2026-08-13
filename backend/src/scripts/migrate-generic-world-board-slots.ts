import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import type { Collection, Document } from 'mongodb';

const SLOT_MAP = {
  signature: 'slot_1',
  ryo_1: 'slot_2',
  ryo_2: 'slot_3',
  flex: 'slot_4',
} as const;

const GENERIC_SLOTS = new Set<string>(Object.values(SLOT_MAP));

export function genericSlotFor(slotKey: string): string | undefined {
  return SLOT_MAP[slotKey as keyof typeof SLOT_MAP];
}

interface ConfigurationDocument extends Document {
  _id: Types.ObjectId;
  worldId: Types.ObjectId;
  slotKey?: string;
  slotType?: string;
}

interface MigrationPlan {
  updates: Array<{ id: Types.ObjectId; slotKey: string }>;
  unsetOnly: Types.ObjectId[];
  skippedWorlds: Array<{ worldId: string; reason: string }>;
  invalid: Array<{ id: string; slotKey: string | undefined }>;
}

export function buildMigrationPlan(
  configurations: ConfigurationDocument[],
): MigrationPlan {
  const plan: MigrationPlan = {
    updates: [],
    unsetOnly: [],
    skippedWorlds: [],
    invalid: [],
  };
  const byWorld = new Map<string, ConfigurationDocument[]>();
  for (const configuration of configurations) {
    const bucket = byWorld.get(String(configuration.worldId)) ?? [];
    bucket.push(configuration);
    byWorld.set(String(configuration.worldId), bucket);
  }

  for (const [worldId, entries] of byWorld) {
    const resulting = entries.map(
      (entry) => genericSlotFor(entry.slotKey ?? '') ?? entry.slotKey,
    );
    const invalid = entries.filter(
      (entry) =>
        !entry.slotKey ||
        (!genericSlotFor(entry.slotKey) && !GENERIC_SLOTS.has(entry.slotKey)),
    );
    if (invalid.length) {
      plan.invalid.push(
        ...invalid.map((entry) => ({
          id: String(entry._id),
          slotKey: entry.slotKey,
        })),
      );
      plan.skippedWorlds.push({
        worldId,
        reason: 'contains an unknown board slot identifier',
      });
      continue;
    }
    if (new Set(resulting).size !== resulting.length) {
      plan.skippedWorlds.push({
        worldId,
        reason: 'generic slot migration would collide with an existing slot',
      });
      continue;
    }
    for (const entry of entries) {
      const target = genericSlotFor(entry.slotKey ?? '');
      if (target) plan.updates.push({ id: entry._id, slotKey: target });
      else if (entry.slotType !== undefined) plan.unsetOnly.push(entry._id);
    }
  }
  return plan;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const mongoUri =
    process.env.MONGODB_URI ?? 'mongodb://localhost:27017/lammah-quiz';
  await mongoose.connect(mongoUri);
  const collection = mongoose.connection.db!.collection<ConfigurationDocument>(
    'world_challenge_configurations',
  );
  const documents = await collection.find({}).toArray();
  const plan = buildMigrationPlan(documents);

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        slotIdentifiersToMigrate: plan.updates.length,
        legacySlotTypeFieldsToRemove:
          plan.updates.length + plan.unsetOnly.length,
        skippedWorlds: plan.skippedWorlds,
        invalidConfigurations: plan.invalid,
      },
      null,
      2,
    ),
  );

  if (!apply) return;
  if (plan.skippedWorlds.length) {
    throw new Error(
      'Migration stopped safely because one or more Worlds need review.',
    );
  }
  await applyPlan(collection, plan);
  const remaining = await collection.countDocuments({
    slotKey: { $in: Object.keys(SLOT_MAP) },
  });
  if (remaining) {
    throw new Error(
      `${remaining} legacy slot identifier(s) remain after migration.`,
    );
  }
  console.log(
    `Migrated ${plan.updates.length} slot identifier(s) successfully.`,
  );
}

async function applyPlan(
  collection: Collection<ConfigurationDocument>,
  plan: MigrationPlan,
): Promise<void> {
  const operations = [
    ...plan.updates.map((update) => ({
      updateOne: {
        filter: { _id: update.id },
        update: { $set: { slotKey: update.slotKey }, $unset: { slotType: '' } },
      },
    })),
    ...plan.unsetOnly.map((id) => ({
      updateOne: {
        filter: { _id: id },
        update: { $unset: { slotType: '' } },
      },
    })),
  ];
  if (operations.length)
    await collection.bulkWrite(operations, { ordered: true });
}

if (require.main === module) {
  run()
    .catch((error) => {
      console.error('Generic board slot migration failed:', error);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}
