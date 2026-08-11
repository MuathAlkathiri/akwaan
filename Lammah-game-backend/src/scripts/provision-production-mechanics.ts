import 'dotenv/config';
import mongoose from 'mongoose';
import type { Db } from 'mongodb';
import {
  PRODUCTION_MECHANICS,
  productionMechanicSystemFields,
  ProductionMechanicDefinition,
} from '../modules/world-content/domain/production-mechanic.definition';
import { WorldContentStatus } from '../modules/world-content/domain/world-content.constants';

const APPLY = process.argv.includes('--apply');
const MONGO_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/lammah-quiz';

export function canonicalProvisionedDocument(
  definition: ProductionMechanicDefinition,
  existing?: Record<string, unknown> | null,
): Record<string, unknown> {
  const now = new Date();
  return {
    ...(existing ?? {
      name: definition.seed.name,
      description: definition.seed.description,
      defaultPresentation: definition.seed.defaultPresentation,
      status: WorldContentStatus.DRAFT,
      sortOrder: 0,
      createdAt: now,
      __v: 0,
    }),
    ...productionMechanicSystemFields(definition),
    updatedAt: now,
  };
}

export interface ProductionMechanicProvisionReport {
  apply: boolean;
  entries: Array<{
    slug: string;
    outcome: 'create' | 'update' | 'unchanged';
    id?: string;
    changedFields: string[];
  }>;
}

export class ProductionMechanicProvisioner {
  constructor(
    private readonly db: Db,
    private readonly apply: boolean,
  ) {}

  async run(): Promise<ProductionMechanicProvisionReport> {
    const collection = this.db.collection('challenge_types');
    const entries: ProductionMechanicProvisionReport['entries'] = [];
    for (const definition of PRODUCTION_MECHANICS) {
      const existing = await collection.findOne({ slug: definition.slug });
      const systemFields = productionMechanicSystemFields(definition);
      const changedFields = Object.entries(systemFields)
        .filter(([field, value]) => existing?.[field] !== value)
        .map(([field]) => field);
      if (!existing) {
        if (this.apply) {
          const result = await collection.insertOne(
            canonicalProvisionedDocument(definition),
          );
          entries.push({
            slug: definition.slug,
            outcome: 'create',
            id: String(result.insertedId),
            changedFields: Object.keys(systemFields),
          });
        } else {
          entries.push({
            slug: definition.slug,
            outcome: 'create',
            changedFields: Object.keys(systemFields),
          });
        }
        continue;
      }
      if (changedFields.length && this.apply) {
        await collection.updateOne(
          { _id: existing._id },
          { $set: { ...systemFields, updatedAt: new Date() } },
        );
      }
      entries.push({
        slug: definition.slug,
        outcome: changedFields.length ? 'update' : 'unchanged',
        id: String(existing._id),
        changedFields,
      });
    }
    return { apply: this.apply, entries };
  }
}

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const report = await new ProductionMechanicProvisioner(db, APPLY).run();
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

if (require.main === module) {
  void main().catch(async (error) => {
    console.error('Production mechanic provisioning failed:', error);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}
