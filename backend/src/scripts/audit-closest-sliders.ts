import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

/**
 * How much «مين أقرب» content predates the slider, and how much of it is safe
 * to delete.
 *
 * Reads only. It opens one connection, counts, prints, and closes — there is no
 * `--apply`, because the decision this informs (edit the old questions, or drop
 * them and generate clean ones) is not one a script should take.
 *
 * Two numbers matter. An item with no `mechanicPayload.closestSlider` is one the
 * phone still renders as a typed field, so it is what a regeneration would be
 * replacing. And an item that already appears in `content_exposures` has been
 * shown in a real match: deleting it leaves that row pointing at nothing, so
 * those are the ones to retire rather than remove.
 *
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register src/scripts/audit-closest-sliders.ts
 *
 * Reads `MONGODB_URI`, or `AUDIT_MONGODB_URI` when you want to point it
 * somewhere other than the database your local .env names.
 */

const CLOSEST = 'closest';

interface ClosestItem {
  _id: ObjectId;
  worldId?: string;
  scopeId?: string;
  mechanicPayload?: { closestSlider?: { mode?: string } };
}

function tally(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

async function main(): Promise<void> {
  const uri = process.env.AUDIT_MONGODB_URI ?? process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set MONGODB_URI (or AUDIT_MONGODB_URI) first.');
    process.exitCode = 1;
    return;
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db();
    const items = await db
      .collection<ClosestItem>('content_items')
      .find(
        // Mongoose stores the six answer modes as one discriminated payload,
        // so the mode is a field inside it and not a column of its own.
        { 'answerPayload.mode': CLOSEST },
        {
          projection: {
            worldId: 1,
            scopeId: 1,
            'mechanicPayload.closestSlider': 1,
          },
        },
      )
      .toArray();

    const withSlider = items.filter(
      (item) => item.mechanicPayload?.closestSlider,
    );
    const legacy = items.filter((item) => !item.mechanicPayload?.closestSlider);

    // Shown in a real match at least once. `content_exposures` keeps both
    // `reserved` (drawn, maybe never seen) and `exposed` rows; either way the
    // row names the item, so either way a delete orphans it.
    const legacyIds = legacy.map((item) => String(item._id));
    const seenIds = legacyIds.length
      ? await db
          .collection('content_exposures')
          .distinct('contentItemId', { contentItemId: { $in: legacyIds } })
      : [];

    const worlds = new Map(
      (
        await db
          .collection('worlds')
          .find({}, { projection: { name: 1 } })
          .toArray()
      ).map((world) => [String(world._id), String(world.name ?? world._id)]),
    );
    const scopes = new Map(
      (
        await db
          .collection('scopes')
          .find({}, { projection: { name: 1 } })
          .toArray()
      ).map((scope) => [String(scope._id), String(scope.name ?? scope._id)]),
    );

    const label = (item: ClosestItem) =>
      `${worlds.get(String(item.worldId)) ?? item.worldId ?? '—'} · ${
        scopes.get(String(item.scopeId)) ?? item.scopeId ?? '—'
      }`;

    // Where this actually connected, and what it found there. Printed first and
    // always: a zero in the report below means "no slider-less questions" only
    // if the database is the one you meant, and local and production carry the
    // same database name.
    const host = uri.replace(/\/\/[^@]*@/, '//');
    const everything = await db
      .collection('content_items')
      .aggregate<{ _id: string | null; count: number }>([
        { $group: { _id: '$answerPayload.mode', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray();

    console.log(`\n«مين أقرب» — جرد المدى`);
    console.log(`الخادم: ${host.split('/')[2] ?? '—'}`);
    console.log(`القاعدة: ${db.databaseName}`);
    console.log(
      `كل الأسئلة في القاعدة: ${everything.reduce((sum, row) => sum + row.count, 0)}`,
    );
    for (const row of everything) {
      console.log(`  ${row._id ?? '(بلا نمط إجابة)'}: ${row.count}`);
    }
    console.log('');
    console.log(`الإجمالي: ${items.length}`);
    console.log(`  بمدى سلايدر: ${withSlider.length}`);
    for (const [mode, count] of tally(
      withSlider.map(
        (item) => item.mechanicPayload?.closestSlider?.mode ?? '(بلا نمط)',
      ),
    )) {
      console.log(`    ${mode}: ${count}`);
    }
    console.log(`  بلا مدى (قديم): ${legacy.length}`);
    console.log(
      `    ظهر في مباراة: ${seenIds.length}   ← حذفه يترك مرجعًا معلّقًا`,
    );
    console.log(
      `    ما ظهر أبدًا: ${legacy.length - seenIds.length}   ← حذفه لا يمس شيئًا`,
    );

    if (legacy.length) {
      console.log(`\nالقديم موزّعًا على العوالم والنطاقات:`);
      for (const [where, count] of tally(legacy.map(label))) {
        const total = items.filter((item) => label(item) === where).length;
        console.log(`  ${where}: ${count} من ${total}`);
      }
    }
    console.log('');
  } finally {
    await client.close();
  }
}

void main();
