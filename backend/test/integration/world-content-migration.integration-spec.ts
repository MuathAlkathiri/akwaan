import { Connection, Types } from 'mongoose';
import {
  MigrationReport,
  WorldContentMigration,
} from '../../src/scripts/migrate-world-content';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ContentItemStatus,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../../src/modules/scoring/domain/scoring-rule';
import {
  connectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('migrate:world-content (roadmap 18)', () => {
  let connection: Connection;

  const footballCatalogId = new Types.ObjectId();
  const animeCatalogId = new Types.ObjectId();
  const footballWorldId = new Types.ObjectId();
  const animeWorldId = new Types.ObjectId();
  const footballScopeId = new Types.ObjectId();
  const footballStandardId = new Types.ObjectId();
  const animeStandardId = new Types.ObjectId();
  const footballBombId = new Types.ObjectId();
  const multipleChoiceQuestionId = new Types.ObjectId();
  const openAnswerQuestionId = new Types.ObjectId();

  beforeAll(async () => {
    // This suite drops the database between cases, so it uses its own.
    connection = await connectTestDatabase('migration');
  });

  afterAll(async () => {
    await resetTestDatabase(connection);
    await connection.destroy();
  });

  beforeEach(async () => {
    await resetTestDatabase(connection);
    await seed();
  });

  const db = () => {
    if (!connection.db) throw new Error('test database is not connected');
    return connection.db;
  };

  const run = (apply: boolean): Promise<MigrationReport> =>
    new WorldContentMigration(db(), apply).run();

  async function seed(): Promise<void> {
    await db()
      .collection('catalogs')
      .insertMany([
        {
          _id: footballCatalogId,
          name: { ar: 'كرة القدم' },
          slug: 'football',
          isActive: true,
        },
        {
          _id: animeCatalogId,
          name: { ar: 'أنمي' },
          slug: 'anime',
          isActive: false,
        },
      ]);
    await db().collection('categories').insertOne({
      _id: new Types.ObjectId(),
      catalogId: footballCatalogId,
      name: 'كأس العالم',
      slug: 'world-cup',
      gameplayMode: 'STANDARD',
      isActive: true,
    });

    // Previously migrated taxonomy: two Worlds each owning their own copy of the
    // same "standard" mechanic, plus a Bomb mechanic with no roadmap mapping.
    await db()
      .collection('worlds')
      .insertMany([
        {
          _id: footballWorldId,
          name: 'Football',
          slug: 'football-world',
          status: 'active',
        },
        {
          _id: animeWorldId,
          name: 'Anime',
          slug: 'anime-world',
          status: 'inactive',
        },
      ]);
    await db().collection('content_categories').insertOne({
      _id: footballScopeId,
      worldId: footballWorldId,
      name: 'الدوري السعودي',
      slug: 'saudi-league',
      status: 'active',
    });
    await db()
      .collection('challenge_types')
      .insertMany([
        {
          _id: footballStandardId,
          worldId: footballWorldId,
          name: 'أسئلة قياسية',
          slug: 'standard',
          status: 'active',
        },
        {
          _id: animeStandardId,
          worldId: animeWorldId,
          name: 'أسئلة الأنمي',
          slug: 'standard',
          status: 'active',
        },
        {
          _id: footballBombId,
          worldId: footballWorldId,
          name: 'القنبلة',
          slug: 'bomb',
          status: 'active',
        },
      ]);

    await db()
      .collection('questions')
      .insertMany([
        {
          _id: multipleChoiceQuestionId,
          worldId: footballWorldId,
          contentCategoryId: footballScopeId,
          challengeTypeId: footballStandardId,
          question: 'من فاز بكأس العالم 2018؟',
          answer: 'فرنسا',
          wrongAnswers: ['كرواتيا', 'البرازيل'],
          questionType: 'standard',
          points: 400,
          difficulty: 'medium',
        },
        {
          _id: openAnswerQuestionId,
          worldId: footballWorldId,
          contentCategoryId: footballScopeId,
          challengeTypeId: footballStandardId,
          question: 'اذكر أفضل لاعب في تاريخ النادي',
          answer: 'ماجد عبدالله',
          questionType: 'standard',
        },
      ]);
  }

  it('does not write anything during a dry run', async () => {
    const report = await run(false);

    expect(report.worldsMigrated).toBeGreaterThan(0);
    expect(report.globalChallengeTypesCreated).toBe(1);
    expect(await db().collection('scopes').countDocuments()).toBe(0);
    expect(
      await db().collection('world_challenge_configurations').countDocuments(),
    ).toBe(0);
    expect(await db().collection('content_items').countDocuments()).toBe(0);
    // Legacy documents are still exactly where they were.
    expect(
      await db()
        .collection('challenge_types')
        .countDocuments({ worldId: { $exists: true } }),
    ).toBe(3);
    expect(await db().collection('questions').countDocuments()).toBe(2);
  });

  it('deduplicates world-owned mechanics into one global challenge type', async () => {
    const report = await run(true);

    expect(report.challengeTypesDeduplicated).toBe(1);
    const globals = await db()
      .collection('challenge_types')
      .find({ worldId: { $exists: false } })
      .toArray();
    expect(globals).toHaveLength(1);
    expect(globals[0]).toMatchObject({
      slug: 'read-your-opponent',
      family: ChallengeFamily.RYO,
      answerMode: ChallengeAnswerMode.RYO,
      scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      status: WorldContentStatus.DRAFT,
    });
  });

  it('turns each old World relationship into a board-position configuration', async () => {
    await run(true);

    const configurations = await db()
      .collection('world_challenge_configurations')
      .find({})
      .sort({ _id: 1 })
      .toArray();
    expect(configurations).toHaveLength(2);
    for (const configuration of configurations) {
      expect(configuration.slotKey).toBe(WorldChallengeSlotKey.SLOT_2);
      expect(configuration.slotType).toBeUndefined();
      // The mechanic keeps one global name, so no per-World label is written.
      expect(configuration.displayName).toBeUndefined();
      // A board slot is an editorial decision, never switched on by a migration.
      expect(configuration.isEnabled).toBe(false);
    }
  });

  it('removes the replaced world-owned challenge type documents', async () => {
    const report = await run(true);

    expect(report.legacyWorldOwnedChallengeTypesRemoved).toBe(2);
    expect(
      await db()
        .collection('challenge_types')
        .countDocuments({ slug: 'standard' }),
    ).toBe(0);
    // The unmapped Bomb mechanic is left untouched and reported instead.
    expect(
      await db().collection('challenge_types').countDocuments({ slug: 'bomb' }),
    ).toBe(1);
    expect(
      report.manualReview.some(
        (entry) =>
          entry.kind === 'mechanic definition required' &&
          entry.label.includes('bomb'),
      ),
    ).toBe(true);
  });

  it('converts only deterministically convertible questions into content items', async () => {
    const report = await run(true);

    expect(report.contentItemsMigrated).toBe(1);
    expect(report.openAnswerItemsRequiringConversion).toBe(1);
    const items = await db().collection('content_items').find({}).toArray();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      status: ContentItemStatus.DRAFT,
      answerPayload: expect.objectContaining({
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        correctOptionId: 'correct',
      }),
      metadata: expect.objectContaining({
        source: `legacy-question:${String(multipleChoiceQuestionId)}`,
      }),
    });
    // No legacy scoring vocabulary comes across.
    expect(items[0].points).toBeUndefined();
    expect(items[0].difficulty).toBeUndefined();
  });

  it('flags open-answer content for manual multiple-choice conversion', async () => {
    const report = await run(true);

    const flagged = report.manualReview.filter(
      (entry) =>
        entry.kind === 'open answer requiring multiple-choice conversion',
    );
    expect(flagged).toHaveLength(1);
    expect(flagged[0].id).toBe(String(openAnswerQuestionId));
  });

  it('never deletes legacy question records', async () => {
    await run(true);
    expect(await db().collection('questions').countDocuments()).toBe(2);
    expect(
      await db().collection('questions').countDocuments({
        _id: openAnswerQuestionId,
      }),
    ).toBe(1);
    expect(await db().collection('categories').countDocuments()).toBe(1);
    expect(await db().collection('catalogs').countDocuments()).toBe(2);
  });

  it('is idempotent across repeated applies', async () => {
    await run(true);
    const snapshot = await counts();

    const second = await run(true);

    expect(await counts()).toEqual(snapshot);
    expect(second.worldsMigrated).toBe(0);
    expect(second.globalChallengeTypesCreated).toBe(0);
    expect(second.worldChallengeConfigurationsCreated).toBe(0);
    expect(second.contentItemsMigrated).toBe(0);
  });

  it('demotes a legacy active World that cannot satisfy the activation rules', async () => {
    const report = await run(true);

    // "انمي" was active in the legacy model but has no four-slot board, and
    // leaving it active would block the edits that would make it valid.
    expect(report.worldsDemotedToDraft.length).toBeGreaterThan(0);
    const worlds = await db().collection('worlds').find({}).toArray();
    expect(worlds.every((world) => world.status !== 'active')).toBe(true);
    expect(
      worlds.find((world) => world._id.equals(footballWorldId))?.status,
    ).toBe(WorldContentStatus.DRAFT);
  });

  it('reports the state that still needs a human decision', async () => {
    const report = await run(true);

    expect(report.worldsWithInvalidBoardComposition.length).toBeGreaterThan(0);
    expect(
      report.manualReview.some(
        (entry) => entry.kind === 'mechanic definition required',
      ),
    ).toBe(true);
  });

  async function counts(): Promise<Record<string, number>> {
    const names = [
      'worlds',
      'scopes',
      'challenge_types',
      'world_challenge_configurations',
      'content_items',
      'questions',
      'categories',
      'catalogs',
    ];
    const entries = await Promise.all(
      names.map(
        async (name) =>
          [name, await db().collection(name).countDocuments()] as const,
      ),
    );
    return Object.fromEntries(entries);
  }
});
