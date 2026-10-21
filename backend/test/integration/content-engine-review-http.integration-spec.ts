import { INestApplication } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { loginForToken } from '../helpers/auth-helper';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('Content Engine review HTTP authorization', () => {
  let app: INestApplication;
  let database: Connection;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    database = await connectTestDatabase();
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp();
    adminToken = await loginForToken(app, fixtureCredentials.admin);
    userToken = await loginForToken(app, fixtureCredentials.user);

    const jobId = new Types.ObjectId();
    await database.collection('engine_jobs').insertOne({
      _id: jobId,
      requestHash: 'http-review-auth',
      mechanicKey: 'read-your-opponent',
      worldKey: 'video-games',
      scopeKey: 'overwatch',
      targetCount: 1,
      status: 'awaiting_review',
      leaseEpoch: 1,
      attempts: 1,
      cancellationRequested: false,
      reservedMicros: 0,
      spentMicros: 0,
      pipelineStage: 'awaiting_review',
      stageCheckpoints: {},
    });
    await database.collection('engine_candidates').insertOne({
      candidateId: 'http-review-candidate',
      jobId: String(jobId),
      ordinal: 0,
      status: 'awaiting_review',
      draft: {
        prompt: { ar: 'مرشح' },
        answerPayload: { mode: 'multiple_choice' },
      },
      findings: [],
      contextHash: 'fixture',
      promptVersion: 'fixture',
      provider: 'fake',
      model: 'fake',
      attempt: 1,
      factualClaims: [],
      reviewRevision: 0,
      reviewStatus: 'pending',
      reviewEvents: [],
      writeEpoch: 1,
    });
  });

  afterAll(async () => {
    await resetTestDatabase(database);
    await app?.close();
    await database?.close();
  });

  it('returns 401 anonymously, 403 to a player, and data to an Admin', async () => {
    await request(app.getHttpServer())
      .get('/admin/content-engine/candidates')
      .expect(401);
    await request(app.getHttpServer())
      .get('/admin/content-engine/candidates')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    const response = await request(app.getHttpServer())
      .get('/admin/content-engine/candidates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.data).toEqual([
      expect.objectContaining({
        candidateId: 'http-review-candidate',
        reviewStatus: 'pending',
      }),
    ]);
  });
});
