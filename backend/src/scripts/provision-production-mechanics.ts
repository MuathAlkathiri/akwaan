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
const ONLY = process.argv
  .find((argument) => argument.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
  .map((slug) => slug.trim())
  .filter(Boolean);
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
  /** Slugs this run was restricted to, when it was scoped. */
  only?: string[];
  entries: Array<{
    slug: string;
    outcome: 'create' | 'update' | 'unchanged' | 'intentionally-deleted';
    id?: string;
    changedFields: string[];
  }>;
}

export class ProductionMechanicProvisioner {
  /**
   * @param only Restrict the run to these slugs. Rolling one mechanic out is a
   *   scoped operation: the full sweep would also provision every *other*
   *   mechanic that happens to be missing, which turns a single rollout into an
   *   unrelated catalog change. Omit to sweep everything, as before.
   */
  constructor(
    private readonly db: Db,
    private readonly apply: boolean,
    private readonly only?: readonly string[],
  ) {
    const unknown = (only ?? []).filter(
      (slug) => !PRODUCTION_MECHANICS.some((entry) => entry.slug === slug),
    );
    if (unknown.length) {
      throw new Error(
        `Not a production mechanic slug: ${unknown.join(', ')}. ` +
          `Known: ${PRODUCTION_MECHANICS.map((entry) => entry.slug).join(', ')}`,
      );
    }
  }

  private get selected(): readonly ProductionMechanicDefinition[] {
    if (!this.only?.length) return PRODUCTION_MECHANICS;
    return PRODUCTION_MECHANICS.filter((entry) =>
      this.only!.includes(entry.slug),
    );
  }

  async run(): Promise<ProductionMechanicProvisionReport> {
    const collection = this.db.collection('challenge_types');
    const lifecycle = this.db.collection('production_mechanic_lifecycle');
    const entries: ProductionMechanicProvisionReport['entries'] = [];
    for (const definition of this.selected) {
      const existing = await collection.findOne({ slug: definition.slug });
      const deletedByAdmin = await lifecycle.findOne({
        slug: definition.slug,
        state: 'deleted_by_admin',
      });
      const systemFields = productionMechanicSystemFields(definition);
      const changedFields = Object.entries(systemFields)
        .filter(([field, value]) => existing?.[field] !== value)
        .map(([field]) => field);
      if (!existing) {
        if (deletedByAdmin) {
          entries.push({
            slug: definition.slug,
            outcome: 'intentionally-deleted',
            id: String(deletedByAdmin.challengeTypeId ?? ''),
            changedFields: [],
          });
          continue;
        }
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
    return {
      apply: this.apply,
      ...(this.only?.length ? { only: [...this.only] } : {}),
      entries,
    };
  }
}

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const report = await new ProductionMechanicProvisioner(db, APPLY, ONLY).run();
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
