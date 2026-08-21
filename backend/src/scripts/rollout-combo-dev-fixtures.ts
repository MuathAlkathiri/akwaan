import 'dotenv/config';
import mongoose from 'mongoose';
import { ChallengeAnswerMode } from '../modules/world-content/domain/world-content.constants';
import {
  buildComboQuestionPlan,
  validateComboItem,
  COMBO_ITEM_COUNT,
  COMBO_RUNS_PER_CHALLENGE,
  COMBO_STAGES,
  type ComboStage,
} from '../modules/world-content/domain/combo-content.policy';
import { ContentItemSchema } from '../modules/world-content/schemas/content-item.schema';
import { ContentItemRepository } from '../modules/world-content/persistence/content-item.repository';
import { MatchContentSelector } from '../modules/match/application/match-content-selection.service';
import { COMBO_CHALLENGE_LAUNCHER_REQUIREMENTS } from '../modules/match/application/combo-challenge.launcher';

/**
 * Local/dev Combo smoke content, and the gate that proves it is launchable.
 *
 * This is **not** a content pipeline and not production authoring. No authored
 * Combo content exists in the repository yet, so this script inserts the
 * smallest set that lets a real Combo challenge launch and be played end to end
 * on a developer machine. Every document it writes is stamped with
 * `metadata.source = COMBO_FIXTURE_SOURCE` so it can never be mistaken for
 * finalized authored content, and so it can be found and removed in one query.
 *
 * Dry run unless `--apply`, matching `provision-production-mechanics`.
 */

export const COMBO_FIXTURE_SOURCE = 'local-dev-combo-smoke-fixture';
const FIXTURE_NOTE =
  'LOCAL/DEV SMOKE FIXTURE — not production-authored Combo content. ' +
  'Created to launch and play one Combo challenge locally. Safe to delete.';

const APPLY = process.argv.includes('--apply');
const VERIFY_ONLY = process.argv.includes('--verify-only');
const MONGO_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/lammah-quiz';

/** Anime Scope slugs are generated, so the fixtures key off the display name. */
type ScopeName = 'ناروتو' | 'ون بيس' | 'هجوم العمالقة' | 'بليتش';

interface FixtureSeed {
  scope: ScopeName;
  stage: ComboStage;
  prompt: string;
  answers: string[];
}

/**
 * Three items per stage across all four Anime Scopes.
 *
 * Two per stage is the launch minimum; a third gives the stratified draw a real
 * choice, so the selector is observed *choosing* rather than being forced — and
 * gives the Scope-spread tie-break something to do.
 */
export const COMBO_FIXTURES: readonly FixtureSeed[] = [
  // Stage 1 — anyone who has watched an episode.
  {
    scope: 'ناروتو',
    stage: 1,
    prompt: 'ما اسم القرية التي ينتمي إليها ناروتو؟',
    answers: ['كونوها', 'قرية الورق', 'قرية الورق المخفية'],
  },
  {
    scope: 'ون بيس',
    stage: 1,
    prompt: 'ما لقب مونكي دي لوفي المرتبط بقبعته؟',
    answers: ['قبعة القش', 'لوفي قبعة القش'],
  },
  {
    scope: 'هجوم العمالقة',
    stage: 1,
    prompt: 'من هي شقيقة إرين ييغر بالتبني؟',
    answers: ['ميكاسا', 'ميكاسا أكرمان'],
  },

  // Stage 2 — a regular viewer.
  {
    scope: 'ناروتو',
    stage: 2,
    prompt: 'من هو معلم الفريق السابع؟',
    answers: ['كاكاشي', 'كاكاشي هاتاكي'],
  },
  {
    scope: 'ون بيس',
    stage: 2,
    prompt: 'من هو طبيب طاقم قبعة القش؟',
    answers: ['تشوبر', 'توني توني تشوبر'],
  },
  {
    scope: 'بليتش',
    stage: 2,
    prompt: 'ما اسم الزانباكوتو الخاص بإتشيغو كوروساكي؟',
    answers: ['زانغيتسو'],
  },

  // Stage 3 — a fan.
  {
    scope: 'ناروتو',
    stage: 3,
    prompt: 'من هو والد ناروتو أوزوماكي؟',
    answers: ['ميناتو', 'ميناتو ناميكازي', 'الهوكاجي الرابع'],
  },
  {
    scope: 'ون بيس',
    stage: 3,
    prompt:
      'من هو أخ لوفي بالتبني الذي قاد الأسطول الثاني لقراصنة اللحية البيضاء؟',
    answers: ['إيس', 'بورتغاس دي إيس', 'آيس'],
  },
  {
    scope: 'بليتش',
    stage: 3,
    prompt: 'من هو قائد الفرقة العاشرة في الغوتي 13؟',
    answers: ['هيتسوغايا', 'توشيرو هيتسوغايا'],
  },

  // Stage 4 — deep lore, where a team actually has to think about cashing out.
  {
    scope: 'ناروتو',
    stage: 4,
    prompt: 'من أسّس قرية الورق مع هاشيراما سينجو؟',
    answers: ['مادارا', 'مادارا أوتشيها'],
  },
  {
    scope: 'ون بيس',
    stage: 4,
    prompt: 'من هو ملك القراصنة الذي أُعدم في لوغ تاون؟',
    answers: ['غول دي روجر', 'غولد روجر', 'روجر'],
  },
  {
    scope: 'هجوم العمالقة',
    stage: 4,
    prompt: 'ما اسم الجدار الخارجي الذي سقط أولاً؟',
    answers: ['ماريا', 'حائط ماريا'],
  },
];

export interface ComboFixtureReport {
  apply: boolean;
  challengeTypeId: string;
  worldId: string;
  inserted: number;
  skipped: number;
  byStage: Record<string, number>;
  byScope: Record<string, number>;
}

async function rollout(db: mongoose.Connection): Promise<ComboFixtureReport> {
  const challengeType = await db
    .collection('challenge_types')
    .findOne({ slug: 'combo' });
  if (!challengeType) {
    throw new Error(
      'No combo ChallengeType exists. Run provision:production-mechanics --only=combo --apply first.',
    );
  }
  const world = await db.collection('worlds').findOne({ name: 'انمي' });
  if (!world) throw new Error('Anime World not found by name "انمي".');

  const scopes = await db
    .collection('scopes')
    .find({ worldId: world._id })
    .toArray();
  const scopeByName = new Map(scopes.map((scope) => [scope.name, scope]));
  for (const name of new Set(COMBO_FIXTURES.map((f) => f.scope))) {
    if (!scopeByName.has(name)) {
      throw new Error(`Anime Scope "${name}" not found in this database.`);
    }
  }

  const items = db.collection('content_items');
  const report: ComboFixtureReport = {
    apply: APPLY,
    challengeTypeId: String(challengeType._id),
    worldId: String(world._id),
    inserted: 0,
    skipped: 0,
    byStage: {},
    byScope: {},
  };

  for (const fixture of COMBO_FIXTURES) {
    const scope = scopeByName.get(fixture.scope)!;
    const now = new Date();
    const document = {
      scopeId: scope._id,
      worldId: world._id,
      prompt: { ar: fixture.prompt },
      compatibleChallengeTypeIds: [challengeType._id],
      answerPayload: {
        mode: ChallengeAnswerMode.MATCH,
        acceptedAnswers: fixture.answers,
      },
      mechanicPayload: { comboStage: fixture.stage },
      isReusableAcrossSessions: false,
      status: 'ready',
      metadata: {
        source: COMBO_FIXTURE_SOURCE,
        notes: FIXTURE_NOTE,
        tags: ['dev-fixture', 'combo-smoke'],
      },
      createdAt: now,
      updatedAt: now,
      __v: 0,
    };

    // Validate through the mechanic's own gate before writing, so a fixture that
    // Combo would refuse at launch is refused here instead.
    validateComboItem(
      {
        id: 'pending',
        status: 'ready' as never,
        worldId: String(world._id),
        scopeId: String(scope._id),
        prompt: document.prompt,
        answerMode: ChallengeAnswerMode.MATCH,
        acceptedAnswers: fixture.answers,
        mechanicPayload: document.mechanicPayload,
      },
      { worldId: String(world._id), position: 1 },
    );

    // Idempotent on (fixture source, prompt): re-running never duplicates.
    const existing = await items.findOne({
      'metadata.source': COMBO_FIXTURE_SOURCE,
      'prompt.ar': fixture.prompt,
    });
    if (existing) {
      report.skipped += 1;
    } else {
      if (APPLY) await items.insertOne(document);
      report.inserted += 1;
    }
    report.byStage[`stage-${fixture.stage}`] =
      (report.byStage[`stage-${fixture.stage}`] ?? 0) + 1;
    report.byScope[fixture.scope] = (report.byScope[fixture.scope] ?? 0) + 1;
  }
  return report;
}

/**
 * The real gate: the shared selector and the Combo policy, not a Mongo count.
 *
 * Runs `MatchContentSelector.select` with the launcher's own declared
 * requirements, then feeds the result to `buildComboQuestionPlan` — the exact
 * path a launch takes.
 */
async function verifySelectable(
  connection: mongoose.Connection,
  worldId: string,
  challengeTypeId: string,
): Promise<void> {
  const model =
    connection.models.ContentItem ??
    connection.model('ContentItem', ContentItemSchema, 'content_items');
  const selector = new MatchContentSelector(
    new ContentItemRepository(model as never),
    // This gate asks whether the *catalog* can satisfy Combo, so no account
    // history is applied — exposure would otherwise mask a real content shortage.
    {
      selectable: (_scope: unknown, ids: string[]) => Promise.resolve(ids),
    } as never,
  );
  const scopeIds = (
    await connection
      .db!.collection('scopes')
      .find({ worldId: new mongoose.Types.ObjectId(worldId) })
      .toArray()
  ).map((scope) => String(scope._id));

  const selected = await selector.select({
    matchId: 'combo-rollout-gate',
    occurrenceIndex: 0,
    worldId,
    selectedScopeIds: scopeIds,
    slotKey: 'slot_2' as never,
    challengeTypeId,
    requirements: COMBO_CHALLENGE_LAUNCHER_REQUIREMENTS as never,
    usedContentItemIds: [],
  });

  console.log(`selector returned ${selected.length} items`);
  if (selected.length !== COMBO_ITEM_COUNT) {
    throw new Error(
      `Expected ${COMBO_ITEM_COUNT} items, got ${selected.length}`,
    );
  }
  if (new Set(selected).size !== COMBO_ITEM_COUNT) {
    throw new Error('Selector returned a duplicate item');
  }

  const documents = await model
    .find({
      _id: { $in: selected.map((id) => new mongoose.Types.ObjectId(id)) },
    })
    .exec();
  const ordered = selected.map((id) => {
    const document = documents.find((entry) => String(entry._id) === id)!;
    return {
      id: String(document._id),
      status: document.status,
      worldId: String(document.worldId),
      scopeId: String(document.scopeId),
      prompt: document.prompt,
      answerMode: document.answerPayload.mode,
      acceptedAnswers: document.answerPayload.acceptedAnswers ?? [],
      mechanicPayload: document.mechanicPayload,
    };
  });

  const stageCounts = new Map<number, number>();
  for (const item of ordered) {
    const stage = Number(item.mechanicPayload?.comboStage);
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
  }
  for (const stage of COMBO_STAGES) {
    const count = stageCounts.get(stage) ?? 0;
    if (count !== COMBO_RUNS_PER_CHALLENGE) {
      throw new Error(
        `stage ${stage}: expected ${COMBO_RUNS_PER_CHALLENGE}, got ${count}`,
      );
    }
    console.log(`  stage ${stage}: ${count} items`);
  }

  const runs = buildComboQuestionPlan(ordered as never, { worldId });
  console.log(`plan built: ${runs.length} runs × ${runs[0].length} questions`);
  const runA = runs[0].map((q) => q.contentItemId);
  const runB = runs[1].map((q) => q.contentItemId);
  const shared = runA.filter((id) => runB.includes(id));
  if (shared.length)
    throw new Error(`item shared between runs: ${shared.join(', ')}`);
  console.log('no item shared between the two runs');
  runs.forEach((run, index) =>
    console.log(
      `  run ${index + 1}: stages ${run.map((q) => q.stage).join(' → ')} | scopes ${new Set(run.map((q) => q.scopeId)).size} distinct`,
    ),
  );
}

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  const connection = mongoose.connection;
  if (!connection.db) throw new Error('MongoDB connection is not ready');

  if (!VERIFY_ONLY) {
    const report = await rollout(connection.db as never);
    console.log(JSON.stringify(report, null, 2));
    if (!APPLY) {
      console.log(
        '\nDRY RUN — pass --apply to write. Selector gate needs applied content.',
      );
      await mongoose.disconnect();
      return;
    }
    console.log(
      '\n=== selector gate (real MatchContentSelector + Combo policy) ===',
    );
    await verifySelectable(connection, report.worldId, report.challengeTypeId);
  } else {
    const challengeType = await connection.db
      .collection('challenge_types')
      .findOne({ slug: 'combo' });
    const world = await connection.db
      .collection('worlds')
      .findOne({ name: 'انمي' });
    console.log('=== selector gate (verify only) ===');
    await verifySelectable(
      connection,
      String(world!._id),
      String(challengeType!._id),
    );
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  void main().catch(async (error) => {
    console.error('Combo dev fixture rollout failed:', error);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}
