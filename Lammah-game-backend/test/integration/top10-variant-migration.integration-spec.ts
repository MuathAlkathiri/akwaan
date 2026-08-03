import { Connection, Types } from 'mongoose';
import { Top10VariantMigration } from '../../src/scripts/migrate-top10-variant';
import {
  connectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('migrate:top10-variant', () => {
  let connection: Connection;

  beforeAll(async () => {
    connection = await connectTestDatabase('top10-variant-migration');
  });

  afterAll(async () => {
    await resetTestDatabase(connection);
    await connection.destroy();
  });

  beforeEach(async () => {
    await resetTestDatabase(connection);
    const db = connection.db!;
    await db.collection('content_items').insertOne({
      _id: new Types.ObjectId(),
      answerPayload: { mode: 'top_10' },
      prompt: { ar: 'أفضل عشرة' },
    });
    await db.collection('questions').insertOne({
      _id: new Types.ObjectId(),
      questionType: 'ranked_list',
      rankedListEntries: Array.from({ length: 10 }, (_, index) => ({
        rank: index + 1,
        answer: `answer-${index + 1}`,
      })),
    });
  });

  const db = () => connection.db!;

  it('supports dry-run, apply, and idempotent rerun without touching classic Questions', async () => {
    const before = await db().collection('questions').findOne({});
    const dryRun = await new Top10VariantMigration(db(), false).run();
    expect(dryRun).toMatchObject({
      canonicalMechanicCreated: 1,
      classicItemsMarked: 1,
      classicQuestionsPreserved: 1,
    });
    expect(await db().collection('challenge_types').countDocuments()).toBe(0);
    expect(
      await db().collection('content_items').findOne({}),
    ).not.toHaveProperty('mechanicPayload');

    await new Top10VariantMigration(db(), true).run();
    expect(
      await db().collection('challenge_types').findOne({ slug: 'top-10' }),
    ).toMatchObject({
      answerMode: 'top_10',
      scoringRuleId: 'top10.poison-deck.result',
      status: 'draft',
    });
    expect(await db().collection('content_items').findOne({})).toMatchObject({
      mechanicPayload: { variant: 'classic' },
    });

    const rerun = await new Top10VariantMigration(db(), true).run();
    expect(rerun).toMatchObject({
      canonicalMechanicCreated: 0,
      classicItemsMarked: 0,
      classicQuestionsPreserved: 1,
    });
    expect(await db().collection('challenge_types').countDocuments()).toBe(1);
    expect(await db().collection('questions').findOne({})).toEqual(before);
  });
});
