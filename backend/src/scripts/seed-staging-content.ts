import 'dotenv/config';
import { MongoClient } from 'mongodb';

/**
 * Fills a staging database with production's CONTENT, and nothing else.
 *
 * Staging is useless empty — you cannot rehearse a Match without Worlds and
 * questions — and dangerous full: a copy of the accounts collection puts real
 * players' emails in a database that exists to be poked at, and a copy of the
 * ledger makes a rehearsal purchase indistinguishable from a real one.
 *
 * So the list below is an ALLOWLIST, and must stay one. A denylist would copy
 * every collection somebody adds later, and the first one that mattered would
 * be the one nobody thought to exclude.
 *
 *   npm run seed:staging                 # says what it would do
 *   npm run seed:staging -- --apply      # does it
 *   npm run seed:staging -- --apply --admin-email=you@example.com
 */

/** Content. Authored, shared, and carrying nothing about any person. */
const CONTENT_COLLECTIONS = [
  'worlds',
  'scopes',
  'challenge_types',
  'world_challenge_configurations',
  'content_items',
  'scoped_mechanic_tutorials',
  'media_rights',
] as const;

export class UnsafeTargetError extends Error {}

/** The database a URI points at, which is the last path segment. */
export function databaseNameOf(uri: string): string {
  const path = new URL(
    uri.replace(/^mongodb\+srv:/, 'https:').replace(/^mongodb:/, 'https:'),
  ).pathname;
  return path.replace(/^\//, '').split('?')[0];
}

/**
 * Refuses to write anywhere that is not obviously a staging database.
 *
 * This is the whole safety of the script. It copies by dropping the target
 * collection first, so a URI pasted one line off would not corrupt production
 * content — it would replace it. The name check is crude on purpose: a rule
 * you can verify by reading the URI out loud is worth more here than a clever
 * one.
 */
export function assertSafeTarget(source: string, target: string): void {
  const from = databaseNameOf(source);
  const to = databaseNameOf(target);

  if (!from)
    throw new UnsafeTargetError('SOURCE_MONGODB_URI names no database');
  if (!to) throw new UnsafeTargetError('TARGET_MONGODB_URI names no database');
  if (from === to) {
    throw new UnsafeTargetError(
      `Source and target are the same database (${to}). Nothing to do, and ` +
        'dropping collections in it would destroy the source.',
    );
  }
  if (!/staging/i.test(to)) {
    throw new UnsafeTargetError(
      `Refusing to write to "${to}": a target database must have "staging" ` +
        'in its name. Rename it, or point this somewhere else.',
    );
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const adminEmail = process.argv
    .find((arg) => arg.startsWith('--admin-email='))
    ?.split('=')[1]
    ?.toLowerCase()
    .trim();

  const source = process.env.SOURCE_MONGODB_URI;
  const target = process.env.TARGET_MONGODB_URI;
  if (!source || !target) {
    throw new Error(
      'Set SOURCE_MONGODB_URI (production, read only) and TARGET_MONGODB_URI (staging).',
    );
  }

  assertSafeTarget(source, target);

  const from = databaseNameOf(source);
  const to = databaseNameOf(target);
  console.log(`${apply ? 'Copying' : 'Would copy'} content: ${from} → ${to}\n`);

  const sourceClient = new MongoClient(source);
  const targetClient = new MongoClient(target);

  try {
    await Promise.all([sourceClient.connect(), targetClient.connect()]);
    const sourceDb = sourceClient.db();
    const targetDb = targetClient.db();

    for (const name of CONTENT_COLLECTIONS) {
      const documents = await sourceDb.collection(name).find().toArray();
      if (!apply) {
        console.log(`  ${name.padEnd(32)} ${documents.length} documents`);
        continue;
      }

      // Replaced wholesale rather than merged. A merge would leave behind
      // whatever staging had from the last copy, and the point of reseeding
      // is to be looking at what production is looking at.
      await targetDb.collection(name).deleteMany({});
      if (documents.length) {
        await targetDb
          .collection(name)
          .insertMany(documents, { ordered: false });
      }
      console.log(`  ${name.padEnd(32)} ${documents.length} copied`);
    }

    if (adminEmail) {
      // Without this there is no way into staging's admin: sign-in creates an
      // ordinary account, and nothing in the product promotes one.
      if (apply) {
        const result = await targetDb.collection('users').updateOne(
          { email: adminEmail },
          {
            $set: { role: 'admin' },
            $setOnInsert: {
              email: adminEmail,
              fullName: 'Staging admin',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        );
        console.log(
          `\n  admin: ${adminEmail} ${result.upsertedCount ? 'created' : 'promoted'}`,
        );
      } else {
        console.log(`\n  admin: would make ${adminEmail} an admin on ${to}`);
      }
    }

    console.log(
      apply
        ? '\nDone. Accounts, balances, the ledger, purchases and discount codes were not touched.'
        : '\nNothing written. Add --apply to do it.',
    );
  } finally {
    await Promise.all([sourceClient.close(), targetClient.close()]);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
