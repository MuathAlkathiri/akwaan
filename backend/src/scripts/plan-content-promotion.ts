import 'dotenv/config';
import { MongoClient, Db } from 'mongodb';

/**
 * What staging has that production does not — read only, both ends.
 *
 * Content now flows upward too: the Puzzles world was generated on staging with
 * a real model spend, and `seed:staging` only ever flows down. Before anything
 * writes into live content, this says exactly what a promotion would carry:
 * which worlds and scopes production has never seen, how many questions hang
 * off them, and which of those questions the Match could actually play.
 *
 * It opens two connections, counts, prints, and closes. There is no `--apply`
 * here on purpose — promoting is a second script, and it should be written
 * against real numbers rather than assumptions.
 *
 *   cd backend
 *   SOURCE_MONGODB_URI="<staging>" TARGET_MONGODB_URI="<production>" \
 *     npx ts-node -r tsconfig-paths/register src/scripts/plan-content-promotion.ts
 */

/** The same allowlist `seed:staging` uses, for the same reason. */
const CONTENT_COLLECTIONS = [
  'worlds',
  'scopes',
  'challenge_types',
  'world_challenge_configurations',
  'content_items',
  'scoped_mechanic_tutorials',
  'media_rights',
] as const;

async function idsIn(db: Db, collection: string): Promise<Set<string>> {
  const rows = await db
    .collection(collection)
    .find({}, { projection: { _id: 1 } })
    .toArray();
  return new Set(rows.map((row) => String(row._id)));
}

async function main(): Promise<void> {
  const sourceUri = process.env.SOURCE_MONGODB_URI;
  const targetUri = process.env.TARGET_MONGODB_URI;
  if (!sourceUri || !targetUri) {
    console.error(
      'Set SOURCE_MONGODB_URI (staging) and TARGET_MONGODB_URI (production). Both are read only here.',
    );
    process.exitCode = 1;
    return;
  }

  const source = new MongoClient(sourceUri);
  const target = new MongoClient(targetUri);
  await Promise.all([source.connect(), target.connect()]);
  try {
    const from = source.db();
    const to = target.db();
    console.log(`\nمن: ${from.databaseName} @ ${sourceUri.split('/')[2]}`);
    console.log(`إلى: ${to.databaseName} @ ${targetUri.split('/')[2]}\n`);

    console.log('الجداول — جديد عند المصدر مقابل الموجود عند الهدف:');
    const newIds: Record<string, Set<string>> = {};
    for (const collection of CONTENT_COLLECTIONS) {
      const [here, there] = await Promise.all([
        idsIn(from, collection),
        idsIn(to, collection),
      ]);
      const fresh = new Set([...here].filter((id) => !there.has(id)));
      newIds[collection] = fresh;
      console.log(
        `  ${collection}: المصدر ${here.size} · الهدف ${there.size} · جديد ${fresh.size}`,
      );
    }

    const worlds = await from
      .collection('worlds')
      .find({}, { projection: { name: 1 } })
      .toArray();
    const scopes = await from
      .collection('scopes')
      .find({}, { projection: { name: 1, worldId: 1 } })
      .toArray();
    const items = await from
      .collection('content_items')
      .find(
        {},
        {
          projection: {
            worldId: 1,
            scopeId: 1,
            'answerPayload.mode': 1,
            'mechanicPayload.closestSlider': 1,
          },
        },
      )
      .toArray();

    console.log('\nالعوالم عند المصدر:');
    for (const world of worlds) {
      const worldId = String(world._id);
      const isNew = newIds.worlds.has(worldId);
      const worldScopes = scopes.filter((s) => String(s.worldId) === worldId);
      const worldItems = items.filter((i) => String(i.worldId) === worldId);
      const freshItems = worldItems.filter((i) =>
        newIds.content_items.has(String(i._id)),
      );
      const closest = worldItems.filter(
        (i) =>
          (i.answerPayload as { mode?: string } | undefined)?.mode ===
          'closest',
      );
      const withSlider = closest.filter(
        (i) =>
          (i.mechanicPayload as { closestSlider?: unknown } | undefined)
            ?.closestSlider,
      );
      console.log(
        `\n  ${String(world.name ?? worldId)} ${isNew ? '← عالم جديد على الإنتاج' : ''}`,
      );
      console.log(
        `    نطاقات: ${worldScopes.length} (جديد ${worldScopes.filter((s) => newIds.scopes.has(String(s._id))).length})`,
      );
      console.log(
        `    أسئلة: ${worldItems.length} (جديد ${freshItems.length})`,
      );
      console.log(
        `    «مين أقرب»: ${closest.length} · منها بمدى سلايدر ${withSlider.length}`,
      );
    }
    console.log('');
  } finally {
    await Promise.all([source.close(), target.close()]);
  }
}

void main();
