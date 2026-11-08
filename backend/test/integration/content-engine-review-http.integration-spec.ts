import { INestApplication } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
import { ContentEngineReviewService } from '../../src/modules/content-engine/application/content-engine-review.service';
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

  it('restricts reference content and catalog detail to administrators', async () => {
    const id = new Types.ObjectId().toString();
    for (const path of [
      `/admin/content-items/${id}`,
      `/admin/scopes/${id}`,
      `/admin/challenge-types/${id}`,
      '/admin/content-engine/candidates/http-review-candidate',
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(path.includes('candidates/') ? 200 : 404);
    }
  });

  it('returns revision details for stale approval and 404 for missing candidates', async () => {
    const stale = await request(app.getHttpServer())
      .post('/admin/content-engine/candidates/http-review-candidate/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expectedRevision: 8, explanation: 'review' })
      .expect(409);
    expect(stale.body).toMatchObject({
      expectedRevision: 8,
      currentRevision: 0,
    });
    await request(app.getHttpServer())
      .post('/admin/content-engine/candidates/missing-candidate/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expectedRevision: 0, explanation: 'review' })
      .expect(404);
  });

  it('rejects malformed overlap acknowledgments before any review logic runs', async () => {
    for (const overlapAcknowledgments of [
      [{ fingerprint: 'not-a-fingerprint' }],
      [{ fingerprint: `ovl1:${'A'.repeat(64)}` }],
      ['ovl1:' + '0'.repeat(64)],
    ]) {
      await request(app.getHttpServer())
        .post('/admin/content-engine/candidates/http-review-candidate/approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          expectedRevision: 0,
          explanation: 'review',
          overlapAcknowledgments,
        })
        .expect(400);
    }
    const row = await database
      .collection('engine_candidates')
      .findOne({ candidateId: 'http-review-candidate' });
    expect(row?.reviewStatus).toBe('pending');
    expect(row?.reviewRevision).toBe(0);
  });

  it('returns a structured conflict for inconsistent identity without changing the candidate', async () => {
    await database.collection('engine_candidates').updateOne(
      { candidateId: 'http-review-candidate' },
      {
        $set: {
          'draft.metadata.subject': 'one',
          authoring: { subject: 'two' },
        },
      },
    );
    try {
      const response = await request(app.getHttpServer())
        .post('/admin/content-engine/candidates/http-review-candidate/rescreen')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ expectedRevision: 0 })
        .expect(409);
      expect(response.body).toMatchObject({
        code: 'CANDIDATE_IDENTITY_CONFLICT',
        details: { field: 'subject' },
      });
      const row = await database
        .collection('engine_candidates')
        .findOne({ candidateId: 'http-review-candidate' });
      expect(row?.reviewRevision).toBe(0);
      expect(row?.reviewEvents).toHaveLength(0);
    } finally {
      await database
        .collection('engine_candidates')
        .updateOne(
          { candidateId: 'http-review-candidate' },
          { $unset: { 'draft.metadata': '', authoring: '' } },
        );
    }
  });

  it('keeps unexpected review errors as server errors without exposing details', async () => {
    const review = app.get(ContentEngineReviewService);
    const spy = jest
      .spyOn(review as any, 'assertIdentityMetadata')
      .mockImplementation(() => {
        throw new Error('private infrastructure details');
      });
    try {
      const response = await request(app.getHttpServer())
        .post('/admin/content-engine/candidates/http-review-candidate/rescreen')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ expectedRevision: 0 })
        .expect(500);
      expect(response.body.message).toBe('Internal server error');
      expect(JSON.stringify(response.body)).not.toContain(
        'private infrastructure details',
      );
    } finally {
      spy.mockRestore();
    }
  });
});
