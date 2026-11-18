/**
 * Disposable test-data cleanup (pre-launch, Product Owner policy 2026-11-18).
 *
 * Removes records the Product Owner classified as disposable — old gameplay
 * history, legacy-system history, expired caches, automated smoke catalogue
 * and automated test accounts — and nothing else. Approved Worlds, Scopes,
 * mechanics, ContentItems, media, rights and content-engine provenance are
 * never selected.
 *
 * DRY RUN BY DEFAULT. It prints (and optionally writes) the exact manifest:
 * per collection, the selection, the count and the dependency checks. Deleting
 * needs `--execute --confirm-database=<name> --backup-reference=<ref>`, and is
 * refused for `--environment=production` (see cleanup-target.ts).
 *
 *   CLEANUP_MONGODB_URI='mongodb://localhost:27017/lammah-quiz?replicaSet=rs0' \
 *   npx ts-node -r tsconfig-paths/register src/scripts/cleanup-disposable-test-data.ts \
 *     --environment=local --database=lammah-quiz \
 *     --categories=gameplay-history,legacy-history,expired-caches,test-catalogue,test-users \
 *     [--report=../ai/workbench/artifacts/cleanup/dry-run.json]
 *
 * Collections are never dropped; only documents matching the printed filters
 * are deleted, in dependency order. Re-running is safe (idempotent).
 */
import { writeFileSync } from 'fs';
import mongoose, { Types } from 'mongoose';
import type { Db, Document, Filter } from 'mongodb';
import {
  AUTOMATED_TEST_EMAIL_PATTERN,
  CleanupCategory,
  CleanupTarget,
  CleanupTargetError,
  parseCleanupArgs,
  TEST_CHALLENGE_TYPE_SLUG_PATTERN,
  TEST_WORLD_SLUG_PATTERNS,
} from './disposable-test-data/cleanup-target';

const TERMINAL_SESSION_STATUSES = ['finished', 'cancelled', 'expired'];

interface Step {
  collection: string;
  description: string;
  filter: Filter<Document>;
  count: number;
  deleted?: number;
}

interface CategoryPlan {
  category: CleanupCategory;
  steps: Step[];
  /** A non-empty list stops this category from executing. */
  blockers: string[];
  notes: string[];
}

async function main(): Promise<void> {
  let target: CleanupTarget;
  try {
    target = parseCleanupArgs(process.argv.slice(2), process.env);
  } catch (error) {
    if (error instanceof CleanupTargetError) {
      console.error(`Refused: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }

  await mongoose.connect(target.uri);
  const db = mongoose.connection.db as unknown as Db;
  if (db.databaseName !== target.database) {
    throw new Error(
      `Connected to "${db.databaseName}", expected "${target.database}"`,
    );
  }
  try {
    const plans: CategoryPlan[] = [];
    for (const category of target.categories) {
      plans.push(await planCategory(db, category));
    }
    if (target.execute) {
      // Categories run in the order given, and each is re-planned immediately
      // before deleting: counts and dependency checks reflect the database
      // now, including what earlier categories just removed (e.g. history
      // cleared first unblocks the test catalogue).
      for (const [index, plan] of plans.entries()) {
        const fresh = await planCategory(db, plan.category);
        plans[index] = fresh;
        if (fresh.blockers.length) continue;
        for (const step of fresh.steps) {
          step.deleted = (
            await db.collection(step.collection).deleteMany(step.filter)
          ).deletedCount;
        }
      }
    }
    const report = {
      tool: 'cleanup-disposable-test-data',
      generatedAt: new Date().toISOString(),
      mode: target.execute ? 'execute' : 'dry-run',
      environment: target.environment,
      database: target.database,
      backupReference: target.backupReference,
      categories: plans.map((plan) => ({
        category: plan.category,
        executable: plan.blockers.length === 0,
        blockers: plan.blockers,
        notes: plan.notes,
        steps: plan.steps.map((step) => ({
          collection: step.collection,
          description: step.description,
          filter: step.filter,
          count: step.count,
          ...(step.deleted === undefined ? {} : { deleted: step.deleted }),
        })),
      })),
    };
    // Readable manifest: patterns as text, long id lists summarised (the exact
    // ids are re-derived from the same rules at execution time).
    const json = JSON.stringify(
      report,
      (_key, value: unknown) =>
        value instanceof RegExp
          ? value.toString()
          : Array.isArray(value) && value.length > 20
            ? `[${value.length} values]`
            : value,
      2,
    );
    if (target.reportPath) writeFileSync(target.reportPath, `${json}\n`);
    console.log(json);
  } finally {
    await mongoose.disconnect();
  }
}

async function planCategory(
  db: Db,
  category: CleanupCategory,
): Promise<CategoryPlan> {
  switch (category) {
    case 'gameplay-history':
      return planGameplayHistory(db);
    case 'legacy-history':
      return planSimple(db, category, [
        [
          'questionhistories',
          'Legacy classic-game question history (system removed)',
        ],
        ['games', 'Legacy classic-game instances (system removed)'],
      ]);
    case 'expired-caches':
      return planSimple(db, category, [
        ['ai_knowledge_units', 'Retired AI fact cache (no schema or reader)'],
      ]);
    case 'test-catalogue':
      return planTestCatalogue(db);
    case 'test-users':
      return planTestUsers(db);
  }
}

/**
 * Everything belonging to sessions that can no longer be played. A session
 * still playable right now (not terminal, not expired) keeps all its records.
 */
async function planGameplayHistory(db: Db): Promise<CategoryPlan> {
  const now = new Date();
  const live = await db
    .collection('live_game_sessions')
    .find(
      { status: { $nin: TERMINAL_SESSION_STATUSES }, expiresAt: { $gt: now } },
      { projection: { sessionId: 1 } },
    )
    .toArray();
  const liveIds = live.map((session) => String(session.sessionId));
  const liveMatches = await db
    .collection('matches')
    .find({ liveSessionId: { $in: liveIds } }, { projection: { matchId: 1 } })
    .toArray();
  const liveMatchIds = liveMatches.map((match) => String(match.matchId));

  const notLive = { sessionId: { $nin: liveIds } };
  const specs: Array<[string, string, Filter<Document>]> = [
    ['live_session_presence', 'Presence of non-live sessions', notLive],
    ['live_session_join_access', 'Join codes of non-live sessions', notLive],
    ['gameplay_runtimes', 'Runtimes of non-live sessions', notLive],
    [
      'content_exposures',
      'Exposure/no-repeat rows of Matches outside live sessions',
      { matchId: { $nin: liveMatchIds } },
    ],
    [
      'matches',
      'Matches outside live sessions',
      { liveSessionId: { $nin: liveIds } },
    ],
    ['live_game_sessions', 'Finished, cancelled or expired sessions', notLive],
  ];
  return {
    category: 'gameplay-history',
    steps: await count(db, specs),
    blockers: [],
    notes: [
      `${liveIds.length} live session(s) and ${liveMatchIds.length} Match(es) in them are preserved.`,
      'backend_instance_leases is excluded: it is live coordination state while a backend runs.',
    ],
  };
}

async function planSimple(
  db: Db,
  category: CleanupCategory,
  collections: Array<[string, string]>,
): Promise<CategoryPlan> {
  return {
    category,
    steps: await count(
      db,
      collections.map(([name, description]) => [name, description, {}]),
    ),
    blockers: [],
    notes: [],
  };
}

/**
 * The smoke/QA catalogue: Worlds with generated slugs, everything inside them,
 * and the generated filler mechanics. Refuses if a filler mechanic or a test
 * World's content is used by anything outside the test set.
 */
async function planTestCatalogue(db: Db): Promise<CategoryPlan> {
  const blockers: string[] = [];
  const worlds = await db
    .collection('worlds')
    .find(
      { $or: TEST_WORLD_SLUG_PATTERNS.map((pattern) => ({ slug: pattern })) },
      { projection: { slug: 1 } },
    )
    .toArray();
  const worldIds = worlds.map((world) => world._id as Types.ObjectId);
  const fillers = await db
    .collection('challenge_types')
    .find(
      { slug: TEST_CHALLENGE_TYPE_SLUG_PATTERN },
      { projection: { slug: 1 } },
    )
    .toArray();
  const fillerIds = fillers.map((type) => type._id as Types.ObjectId);
  const fillerSlugs = fillers.map((type) => String(type.slug));

  const outsideItems = await db.collection('content_items').countDocuments({
    worldId: { $nin: worldIds },
    compatibleChallengeTypeIds: { $in: fillerIds },
  });
  if (outsideItems) {
    blockers.push(
      `${outsideItems} ContentItem(s) outside the test Worlds use a filler mechanic.`,
    );
  }
  const outsideBindings = await db
    .collection('world_challenge_configurations')
    .countDocuments({
      worldId: { $nin: worldIds },
      challengeTypeId: { $in: fillerIds },
    });
  if (outsideBindings) {
    blockers.push(
      `${outsideBindings} board binding(s) outside the test Worlds use a filler mechanic.`,
    );
  }
  const itemIds = (
    await db
      .collection('content_items')
      .find({ worldId: { $in: worldIds } }, { projection: { _id: 1 } })
      .toArray()
  ).map((item) => String(item._id));
  const published = await db
    .collection('engine_draft_publications')
    .countDocuments({ contentItemId: { $in: itemIds } });
  if (published) {
    blockers.push(
      `${published} content-engine publication(s) point at test-World items; review before removing.`,
    );
  }
  const liveMatches = await db.collection('matches').countDocuments({
    status: 'active',
    $or: [
      { 'occurrences.worldId': { $in: worldIds.map(String) } },
      { 'configuredBoardPositions.challengeTypeSlug': { $in: fillerSlugs } },
    ],
  });
  if (liveMatches) {
    blockers.push(
      `${liveMatches} active Match(es) reference the test catalogue; run gameplay-history first.`,
    );
  }
  const media = await db
    .collection('content_items')
    .distinct('media.assets.url', { worldId: { $in: worldIds } });

  const inWorlds = { worldId: { $in: worldIds } };
  const steps = await count(db, [
    ['scoped_mechanic_tutorials', 'Tutorials of test Worlds', inWorlds],
    [
      'world_challenge_configurations',
      'Board bindings of test Worlds',
      inWorlds,
    ],
    [
      'content_exposures',
      'Exposure rows of test-World items',
      { contentItemId: { $in: itemIds } },
    ],
    ['content_items', 'ContentItems of test Worlds', inWorlds],
    ['scopes', 'Scopes of test Worlds', inWorlds],
    [
      'challenge_types',
      'Generated filler mechanics',
      { _id: { $in: fillerIds } },
    ],
    ['worlds', 'Generated smoke/QA Worlds', { _id: { $in: worldIds } }],
  ]);
  return {
    category: 'test-catalogue',
    steps,
    blockers,
    notes: [
      `Test Worlds: ${worlds.map((world) => world.slug).join(', ') || 'none'}.`,
      `Selected by exact generated-slug patterns only; the real Football World (slug "test") never matches.`,
      `${media.length} media URL(s) were used by these items. Files are NOT deleted by this tool; verify each is unreferenced before removing it from storage.`,
    ],
  };
}

/**
 * Accounts created by automated runs (reserved test domains). A user is kept
 * — and reported — if anything with an independent retention need points at
 * them: a subscription, content-engine provenance, media-rights review, or a
 * live session they control.
 */
async function planTestUsers(db: Db): Promise<CategoryPlan> {
  const candidates = await db
    .collection('users')
    .find(
      { email: AUTOMATED_TEST_EMAIL_PATTERN },
      {
        projection: {
          email: 1,
          role: 1,
          subscriptionStatus: 1,
          subscriptionExpiresAt: 1,
        },
      },
    )
    .toArray();
  const now = new Date();
  const removable: Types.ObjectId[] = [];
  const kept: string[] = [];
  for (const user of candidates) {
    const id = String(user._id);
    const reasons: string[] = [];
    if (
      (user.subscriptionStatus && user.subscriptionStatus !== 'none') ||
      (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > now)
    ) {
      reasons.push('subscription');
    }
    const references: Array<[string, Filter<Document>]> = [
      ['engine_jobs', { createdBy: id }],
      ['engine_draft_publications', { createdBy: id }],
      ['engine_candidates', { 'reviewEvents.actorId': id }],
      ['media_rights', { reviewedBy: id }],
      [
        'live_game_sessions',
        {
          controllerActorId: id,
          status: { $nin: TERMINAL_SESSION_STATUSES },
          expiresAt: { $gt: now },
        },
      ],
    ];
    for (const [collection, filter] of references) {
      if (
        await db.collection(collection).countDocuments(filter, { limit: 1 })
      ) {
        reasons.push(collection);
      }
    }
    if (reasons.length)
      kept.push(`${String(user.email)} (${reasons.join(', ')})`);
    else removable.push(user._id as Types.ObjectId);
  }
  return {
    category: 'test-users',
    steps: await count(db, [
      [
        'users',
        'Automated test accounts (reserved test email domains) with no retained references',
        { _id: { $in: removable } },
      ],
    ]),
    blockers: [],
    notes: [
      kept.length
        ? `Kept because something still references them: ${kept.join('; ')}.`
        : 'No automated test account is referenced by retained records.',
      'Manual QA accounts (e.g. @test.com) and real-looking addresses are never selected: they need a Product Owner decision.',
    ],
  };
}

async function count(
  db: Db,
  specs: Array<[string, string, Filter<Document>]>,
): Promise<Step[]> {
  const steps: Step[] = [];
  for (const [collection, description, filter] of specs) {
    steps.push({
      collection,
      description,
      filter,
      count: await db.collection(collection).countDocuments(filter),
    });
  }
  return steps;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
