import 'dotenv/config';
import { MongoClient, Filter, Document } from 'mongodb';

/**
 * Takes «مين أقرب» questions with no authored range out of play.
 *
 * Every closest question in production predates the slider, so the phone
 * renders all of them as a typed number — the one thing the mechanic was
 * decided not to do. They go, and newly generated ones replace them; the review
 * gate already refuses a closest candidate without `mechanicPayload.closestSlider`,
 * so nothing slider-less can come back.
 *
 * Archives by default rather than deleting. A Match only ever draws items whose
 * status is `ready`, so archiving removes them from play just as completely,
 * while leaving them visible in admin, reversible with one field, and — unlike a
 * delete — leaving no exposure row pointing at a question that no longer exists.
 * `--delete` is there for when you want them gone for good.
 *
 *   cd backend
 *   TARGET_MONGODB_URI="<production>" npx ts-node -r tsconfig-paths/register \
 *     src/scripts/retire-sliderless-closest.ts              # says what it would do
 *   ... src/scripts/retire-sliderless-closest.ts --apply     # archives
 *   ... src/scripts/retire-sliderless-closest.ts --apply --delete
 *
 * Reads TARGET_MONGODB_URI, or MONGODB_URI when that is unset.
 */

const SLIDERLESS_CLOSEST: Filter<Document> = {
  'answerPayload.mode': 'closest',
  $or: [
    { 'mechanicPayload.closestSlider': { $exists: false } },
    { 'mechanicPayload.closestSlider': null },
  ],
};

function tally(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

async function main(): Promise<void> {
  const uri = process.env.TARGET_MONGODB_URI ?? process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set TARGET_MONGODB_URI (or MONGODB_URI).');
    process.exitCode = 1;
    return;
  }
  const apply = process.argv.includes('--apply');
  const hardDelete = process.argv.includes('--delete');

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db();
    const items = db.collection('content_items');
    const doomed = await items
      .find(SLIDERLESS_CLOSEST, {
        projection: { worldId: 1, scopeId: 1, status: 1 },
      })
      .toArray();

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
    const exposed = doomed.length
      ? await db.collection('content_exposures').distinct('contentItemId', {
          contentItemId: { $in: doomed.map((item) => String(item._id)) },
        })
      : [];

    console.log(`\nالخادم: ${uri.split('/')[2] ?? '—'}`);
    console.log(`القاعدة: ${db.databaseName}`);
    console.log(`\n«مين أقرب» بلا مدى سلايدر: ${doomed.length}`);
    console.log(`  منها ظهر في مباراة: ${exposed.length}`);
    for (const [where, count] of tally(
      doomed.map(
        (item) =>
          `${worlds.get(String(item.worldId)) ?? '—'} · ${
            scopes.get(String(item.scopeId)) ?? '—'
          }`,
      ),
    )) {
      console.log(`  ${where}: ${count}`);
    }

    const action = hardDelete ? 'حذف نهائي' : 'أرشفة';
    if (!apply) {
      console.log(`\nتجربة بلا تنفيذ. الإجراء لو أضفت --apply: ${action}.`);
      console.log('');
      return;
    }

    const result = hardDelete
      ? await items.deleteMany(SLIDERLESS_CLOSEST)
      : await items.updateMany(SLIDERLESS_CLOSEST, {
          $set: { status: 'archived' },
        });
    const touched =
      'deletedCount' in result ? result.deletedCount : result.modifiedCount;
    console.log(`\nتم: ${action} — ${touched}`);

    // What the Match can still draw. Zero is expected, and is the point: the
    // mechanic has no playable content until the new questions land.
    const stillPlayable = await items.countDocuments({
      'answerPayload.mode': 'closest',
      status: 'ready',
    });
    console.log(`«مين أقرب» الجاهزة للعب الآن: ${stillPlayable}`);
    console.log('');
  } finally {
    await client.close();
  }
}

void main();
