import 'dotenv/config';
import mongoose from 'mongoose';
import type { Db } from 'mongodb';
import {
  PRODUCTION_MECHANICS,
  ProductionMechanicDefinition,
} from '../modules/world-content/domain/production-mechanic.definition';
import { SLUG_PATTERN } from '../modules/world-content/schemas/world-content-shared.schema';

const APPLY = process.argv.includes('--apply');
const MONGO_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/lammah-quiz';

/**
 * Gives an implemented mechanic back the slug its launcher answers to.
 *
 * A ChallengeType authored through the admin UI receives a generated
 * `mechanic-<timestamp>` slug. The Match launcher registry resolves a mechanic by
 * slug, so a World wired to such a ChallengeType configures a board position that
 * can never start — the mechanic is implemented, but nothing can find it.
 *
 * This migration is a rename and nothing else. The document keeps its `_id`, so
 * every WorldChallengeConfiguration and every ContentItem
 * `compatibleChallengeTypeIds` entry still points at it: there is nothing to
 * repoint, nothing to deduplicate, and nothing to delete. That is deliberate — the
 * safest repair for this class of problem is the one that moves no references.
 *
 * A candidate is identified by its *structural* identity (family, item structure,
 * answer mode), never by its display name, and the rename is refused unless
 * exactly one candidate exists and the canonical slug is free. Anything else is
 * reported for a human rather than guessed at.
 */

/** A mechanic that has a launcher, and the shape a ChallengeType must have to be it. */
export type CanonicalMechanic = Pick<
  ProductionMechanicDefinition,
  'slug' | 'family' | 'itemStructure' | 'answerMode'
>;

/**
 * Only mechanics whose structural identity is unambiguous.
 *
 * `top-5` is deliberately absent: it is already canonically slugged, and its
 * rename from the retired `top-10` is `migrate-top10-to-top5` — a payload
 * reshape, not a slug repair.
 * `distributed-information` is deliberately absent too — the ChallengeType that
 * resembles it ("معلومات مقسّمة") answers with `split`, which that mechanic's
 * launcher does not accept, so they are different mechanics rather than one
 * mechanic with a bad slug. Converting them is content authoring, not a rename.
 */
export const CANONICAL_MECHANICS: readonly CanonicalMechanic[] =
  PRODUCTION_MECHANICS;

export interface ChallengeTypeRecord {
  _id: unknown;
  slug: string;
  name?: string;
  family?: string;
  itemStructure?: string;
  answerMode?: string;
}

export type RenameDecision =
  | { kind: 'rename'; from: ChallengeTypeRecord; to: string }
  /** The canonical slug is already worn by the right document. */
  | { kind: 'already-canonical'; slug: string }
  /** Nothing in this database implements the mechanic. */
  | { kind: 'absent'; slug: string }
  /** More than one document claims the structure; a human must choose. */
  | { kind: 'ambiguous'; slug: string; candidates: ChallengeTypeRecord[] }
  /** A structurally different document already holds the canonical slug. */
  | { kind: 'slug-conflict'; slug: string; holder: ChallengeTypeRecord };

/**
 * What to do about one canonical mechanic, decided from the documents alone.
 *
 * Pure, so the decision table is testable without a database, and so the same
 * function decides in dry-run and in apply.
 */
export function decideRename(
  mechanic: CanonicalMechanic,
  challengeTypes: ChallengeTypeRecord[],
): RenameDecision {
  const structural = challengeTypes.filter(
    (candidate) =>
      candidate.family === mechanic.family &&
      candidate.itemStructure === mechanic.itemStructure &&
      candidate.answerMode === mechanic.answerMode,
  );
  const holder = challengeTypes.find(
    (candidate) => candidate.slug === mechanic.slug,
  );

  if (holder && structural.some((candidate) => candidate === holder)) {
    // Already done. Running this migration twice changes nothing.
    return { kind: 'already-canonical', slug: mechanic.slug };
  }
  if (holder) {
    // Something else owns the slug. Renaming onto it would break a unique index
    // and, worse, would silently point a launcher at the wrong mechanic.
    return { kind: 'slug-conflict', slug: mechanic.slug, holder };
  }
  if (!structural.length) return { kind: 'absent', slug: mechanic.slug };
  if (structural.length > 1) {
    return { kind: 'ambiguous', slug: mechanic.slug, candidates: structural };
  }
  return { kind: 'rename', from: structural[0], to: mechanic.slug };
}

export interface MechanicSlugMigrationReport {
  apply: boolean;
  decisions: Array<{
    canonicalSlug: string;
    outcome: RenameDecision['kind'];
    challengeTypeId?: string;
    challengeTypeName?: string;
    previousSlug?: string;
    /** Board positions that gain a launcher. Their ids do not change. */
    affectedBoardPositions?: number;
    /** Always zero: a rename moves no reference. Reported so that is provable. */
    contentItemsRepointed: number;
    readyContentItems?: number;
    note?: string;
  }>;
  renamed: number;
  /** No document is ever removed by this migration. */
  challengeTypesDeleted: 0;
}

export class CanonicalMechanicSlugMigration {
  constructor(
    private readonly db: Db,
    private readonly apply: boolean,
  ) {}

  async run(): Promise<MechanicSlugMigrationReport> {
    const challengeTypes = this.db.collection('challenge_types');
    const configurations = this.db.collection('world_challenge_configurations');
    const contentItems = this.db.collection('content_items');
    const all = (await challengeTypes
      .find({})
      .toArray()) as unknown as ChallengeTypeRecord[];

    const decisions: MechanicSlugMigrationReport['decisions'] = [];
    let renamed = 0;

    for (const mechanic of CANONICAL_MECHANICS) {
      const decision = decideRename(mechanic, all);
      if (decision.kind !== 'rename') {
        decisions.push({
          canonicalSlug: mechanic.slug,
          outcome: decision.kind,
          contentItemsRepointed: 0,
          note: this.explain(decision),
        });
        continue;
      }

      const id = decision.from._id;
      const affectedBoardPositions = await configurations.countDocuments({
        challengeTypeId: id,
      });
      const readyContentItems = await contentItems.countDocuments({
        status: 'ready',
        compatibleChallengeTypeIds: id,
      });

      // The slug the launcher wants must still be a legal slug; a migration that
      // writes a value the schema would reject is a migration that breaks the
      // next save of that document.
      if (!SLUG_PATTERN.test(decision.to)) {
        throw new Error(
          `Canonical slug "${decision.to}" does not match the ChallengeType slug pattern`,
        );
      }

      if (this.apply) {
        await challengeTypes.updateOne(
          { _id: id as never },
          { $set: { slug: decision.to, updatedAt: new Date() } },
        );
        renamed += 1;
      }

      decisions.push({
        canonicalSlug: mechanic.slug,
        outcome: 'rename',
        challengeTypeId: String(id),
        ...(decision.from.name
          ? { challengeTypeName: decision.from.name }
          : {}),
        previousSlug: decision.from.slug,
        affectedBoardPositions,
        // The identifier is untouched, so no reference anywhere needs rewriting.
        contentItemsRepointed: 0,
        readyContentItems,
      });
    }

    return {
      apply: this.apply,
      decisions,
      renamed,
      challengeTypesDeleted: 0,
    };
  }

  private explain(decision: RenameDecision): string {
    switch (decision.kind) {
      case 'already-canonical':
        return 'The canonical slug is already held by the mechanic that matches it. Nothing to do.';
      case 'absent':
        return 'No ChallengeType in this database has this mechanic structure. Nothing to rename.';
      case 'ambiguous':
        return `${decision.candidates.length} ChallengeTypes share this structure (${decision.candidates
          .map((candidate) => `${String(candidate._id)}:${candidate.slug}`)
          .join(', ')}). Refusing to guess which is canonical.`;
      case 'slug-conflict':
        return `Slug is held by ${String(decision.holder._id)} ("${decision.holder.name ?? '?'}"), whose structure does not match this mechanic. Refusing to overwrite it.`;
      default:
        return '';
    }
  }
}

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const report = await new CanonicalMechanicSlugMigration(db, APPLY).run();
  console.log(
    JSON.stringify(
      {
        mode: APPLY ? 'APPLIED' : 'DRY RUN',
        ...report,
        note: 'Renames a ChallengeType slug only. No id changes, so no WorldChallengeConfiguration or ContentItem reference is rewritten and no document is deleted.',
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('Canonical mechanic slug migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  });
}
