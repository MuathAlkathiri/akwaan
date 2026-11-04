import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Connection, Model, Schema } from 'mongoose';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  isolatedTestDatabaseUri,
  resetTestDatabase,
} from '../helpers/test-database';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { loginForToken } from '../helpers/auth-helper';
import {
  World,
  WorldSchema,
} from '../../src/modules/world-content/schemas/world.schema';
import {
  ChallengeType,
  ChallengeTypeSchema,
} from '../../src/modules/world-content/schemas/challenge-type.schema';
import {
  WorldChallengeConfiguration,
  WorldChallengeConfigurationSchema,
} from '../../src/modules/world-content/schemas/world-challenge-configuration.schema';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  WorldContentStatus,
  WorldChallengeSlotKey,
} from '../../src/modules/world-content/domain/world-content.constants';

function model<T>(
  connection: Connection,
  name: string,
  schema: Schema,
): Model<T> {
  return (
    (connection.models[name] as Model<T> | undefined) ??
    connection.model<T>(name, schema)
  );
}

describe('World-specific mechanic tutorial HTTP integration', () => {
  let app: INestApplication;
  let database: Connection;
  let adminToken: string;
  let worldId: string;

  const firstScenario = (prompt: string) => ({
    prompt,
    options: [
      { id: 'a', label: 'سبعة' },
      { id: 'b', label: 'خمسة' },
      { id: 'c', label: 'ستة' },
      { id: 'd', label: 'ثمانية' },
    ],
    correctOptionId: 'a',
    answeringSelectionOptionId: 'a',
    opposingDecision: 'STEAL',
  });

  beforeAll(async () => {
    database = await connectTestDatabase('world-specific');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('world-specific') },
    });
    await app.init();

    const worlds = model<World>(database, World.name, WorldSchema);
    const challengeTypes = model<ChallengeType>(
      database,
      ChallengeType.name,
      ChallengeTypeSchema,
    );
    const configurations = model<WorldChallengeConfiguration>(
      database,
      WorldChallengeConfiguration.name,
      WorldChallengeConfigurationSchema,
    );
    const world = await worlds.create({
      name: 'Scoped Tutorial World',
      slug: 'scoped-tutorial-world',
      status: WorldContentStatus.DRAFT,
      sortOrder: 1,
    });
    const mechanic = await challengeTypes.create({
      name: 'اقرأ خصمك',
      slug: 'read-your-opponent',
      family: ChallengeFamily.RYO,
      itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
      answerMode: ChallengeAnswerMode.RYO,
      defaultPresentation: {
        inputType: 'multiple_choice',
        timerSeconds: 10,
        playerInstructions: { summary: 'شرح', steps: [] },
      },
      scoringRuleId: 'ryo.default',
      status: WorldContentStatus.DRAFT,
      sortOrder: 1,
    });
    await configurations.create({
      worldId: world._id,
      challengeTypeId: mechanic._id,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      isEnabled: false,
      sortOrder: 1,
    });
    worldId = String(world._id);
    adminToken = await loginForToken(app, fixtureCredentials.admin);
  });

  afterAll(async () => {
    await app?.close();
    await database?.close();
  });

  it('keeps scoped drafts private, rejects flow changes, publishes, restores, and withdraws', async () => {
    const base = `/admin/worlds/${worldId}/mechanics/read-your-opponent/tutorial`;
    await request(app.getHttpServer())
      .put(`${base}/draft`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(firstScenario('مثال العالم الأول'))
      .expect(200);

    await request(app.getHttpServer())
      .put(`${base}/draft`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...firstScenario('تغيير غير مسموح'), opposingDecision: 'TRUST' })
      .expect(400);

    const beforePublish = await request(app.getHttpServer())
      .get(`/worlds/${worldId}/mechanics/read-your-opponent/tutorial`)
      .expect(200);
    expect(beforePublish.body.data).toBeNull();

    await request(app.getHttpServer())
      .post(`${base}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const published = await request(app.getHttpServer())
      .get(`/worlds/${worldId}/mechanics/read-your-opponent/tutorial`)
      .expect(200);
    expect(published.body.data.source).toBe('world');
    expect(published.body.data.scenario.prompt).toBe('مثال العالم الأول');

    await request(app.getHttpServer())
      .put(`${base}/draft`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(firstScenario('مثال العالم الثاني'))
      .expect(200);
    await request(app.getHttpServer())
      .post(`${base}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    const revisions = await request(app.getHttpServer())
      .get(`${base}/revisions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      revisions.body.data.map((item: { revision: number }) => item.revision),
    ).toContain(1);

    await request(app.getHttpServer())
      .post(`${base}/revisions/1/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    const restored = await request(app.getHttpServer())
      .get(`/worlds/${worldId}/mechanics/read-your-opponent/tutorial`)
      .expect(200);
    expect(restored.body.data.scenario.prompt).toBe('مثال العالم الأول');

    await request(app.getHttpServer())
      .post(`${base}/withdraw`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    const withdrawn = await request(app.getHttpServer())
      .get(`/worlds/${worldId}/mechanics/read-your-opponent/tutorial`)
      .expect(200);
    expect(withdrawn.body.data).toBeNull();

    // A generic published tutorial remains the compatibility fallback after a
    // scoped withdrawal; the scoped record must not overwrite it.
    const genericBase = '/admin/mechanics/read-your-opponent/tutorial';
    await request(app.getHttpServer())
      .put(`${genericBase}/draft`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(firstScenario('المثال العام'))
      .expect(200);
    await request(app.getHttpServer())
      .post(`${genericBase}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    const genericFallback = await request(app.getHttpServer())
      .get(`/worlds/${worldId}/mechanics/read-your-opponent/tutorial`)
      .expect(200);
    expect(genericFallback.body.data.source).toBe('generic');
    expect(genericFallback.body.data.scenario.prompt).toBe('المثال العام');
  });
});
