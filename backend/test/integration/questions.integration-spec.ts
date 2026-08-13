import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AssetService } from '../../src/modules/ai-agent/application/asset.service';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { loginForToken } from '../helpers/auth-helper';
import { expectSafeResponse } from '../helpers/response-safety';

describe('Questions HTTP lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let adminToken: string;
  let userToken: string;
  let categoryId: string;

  const assetService = {
    process: jest.fn(async (assetRequest: Record<string, unknown>) => ({
      assetStatus: 'READY',
      asset: {
        type: 'image',
        url: '/uploads/test/safe-image.jpg',
        localPath: '/private/test/hidden.jpg',
        source: 'integration-fake',
        provider: 'fake-image',
        metadata: { license: 'test-fixture', purpose: assetRequest.purpose },
      },
    })),
  };

  beforeAll(async () => {
    database = await connectTestDatabase();
    await resetTestDatabase(database);
    const fixtures = await seedIntegrationFixtures(database);
    categoryId = fixtures.categoryIds[0].toString();
    app = await createIntegrationTestApp({
      configure: (builder) =>
        builder.overrideProvider(AssetService).useValue(assetService),
    });
    adminToken = await loginForToken(app, fixtureCredentials.admin);
    userToken = await loginForToken(app, fixtureCredentials.user);
  });

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
  const validQuestion = () => ({
    category: categoryId,
    question: 'سؤال دورة حياة متكامل؟',
    answer: 'الإجابة الصحيحة',
    correctAnswer: 'الإجابة الصحيحة',
    wrongAnswers: ['خاطئة 1', 'خاطئة 2', 'خاطئة 3'],
    explanation: 'شرح اختبار آمن',
    difficulty: 'medium',
    points: 400,
    gameMode: 'trivia',
    type: 'text',
    source: 'ai',
    status: 'draft',
    gameplayMetadata: { fixture: true },
  });

  it('enforces authorization and creates, reads, updates, and deletes safely', async () => {
    await request(app.getHttpServer())
      .post('/questions')
      .send(validQuestion())
      .expect(401);
    await request(app.getHttpServer())
      .post('/questions')
      .set('Authorization', `Bearer ${userToken}`)
      .send(validQuestion())
      .expect(403);
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(asAdmin())
      .send(validQuestion())
      .expect(201);
    const id = created.body.data._id as string;
    expect(created.body.data).toMatchObject({
      _id: id,
      answer: 'الإجابة الصحيحة',
      wrongAnswers: ['خاطئة 1', 'خاطئة 2', 'خاطئة 3'],
      difficulty: 'medium',
      gameMode: 'trivia',
      source: 'ai',
      status: 'draft',
    });
    expectSafeResponse(created.body);

    const publicDetail = await request(app.getHttpServer())
      .get(`/questions/${id}`)
      .expect(200);
    expect(publicDetail.body.data.answer).toBeUndefined();
    const updated = await request(app.getHttpServer())
      .patch(`/questions/${id}`)
      .set(asAdmin())
      .send({ question: 'سؤال دورة حياة محدّث؟', status: 'approved' })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      question: 'سؤال دورة حياة محدّث؟',
      status: 'approved',
    });
    expect(updated.body.data.correctAnswer).toBe('الإجابة الصحيحة');

    await request(app.getHttpServer())
      .patch(`/questions/${id}`)
      .set(asAdmin())
      .send({ unknownField: true })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/questions/${id}`)
      .set(asAdmin())
      .send({ category: '700000000000000000009999' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/questions/${id}`)
      .set(asAdmin())
      .expect(204);
    await request(app.getHttpServer()).get(`/questions/${id}`).expect(404);
    await request(app.getHttpServer())
      .delete(`/questions/${id}`)
      .set(asAdmin())
      .expect(404);
  });

  it('rejects invalid create payloads and exposes public/admin lists correctly', async () => {
    await request(app.getHttpServer())
      .post('/questions')
      .set(asAdmin())
      .send({ ...validQuestion(), question: undefined })
      .expect(400);
    await request(app.getHttpServer())
      .post('/questions')
      .set(asAdmin())
      .send({ ...validQuestion(), difficulty: 'impossible' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/questions')
      .set(asAdmin())
      .send({ ...validQuestion(), category: '700000000000000000009999' })
      .expect(404);

    const publicList = await request(app.getHttpServer())
      .get('/questions')
      .expect(200);
    expect(publicList.body.data.length).toBeGreaterThanOrEqual(36);
    expect(
      publicList.body.data.every(
        (item: Record<string, unknown>) => item.answer === undefined,
      ),
    ).toBe(true);
    await request(app.getHttpServer()).get('/admin/questions').expect(401);
    await request(app.getHttpServer())
      .get('/admin/questions')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    const adminList = await request(app.getHttpServer())
      .get('/admin/questions')
      .set(asAdmin())
      .expect(200);
    expect(adminList.body.data[0].answer).toEqual(expect.any(String));
    expectSafeResponse(adminList.body);
  });

  it('filters persisted AI questions and performs validated bulk review actions', async () => {
    const ids: string[] = [];
    for (const suffix of ['alpha', 'beta']) {
      const response = await request(app.getHttpServer())
        .post('/questions')
        .set(asAdmin())
        .send({
          ...validQuestion(),
          question: `بحث تكامل ${suffix}`,
          assetStatus: 'FAILED',
        })
        .expect(201);
      ids.push(response.body.data._id as string);
    }
    const filtered = await request(app.getHttpServer())
      .get('/admin/questions/ai-generated/list')
      .query({
        status: 'draft',
        difficulty: 'medium',
        gameMode: 'trivia',
        assetStatus: 'FAILED',
        source: 'ai',
        category: categoryId,
        search: 'بحث تكامل',
      })
      .set(asAdmin())
      .expect(200);
    expect(filtered.body.data).toHaveLength(2);

    await request(app.getHttpServer())
      .post('/admin/questions/bulk-action')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ ids, action: 'approve' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/admin/questions/bulk-action')
      .set(asAdmin())
      .send({ ids: [], action: 'approve' })
      .expect(400);
    const bulk = await request(app.getHttpServer())
      .post('/admin/questions/bulk-action')
      .set(asAdmin())
      .send({ ids, action: 'approve' })
      .expect(201);
    expect(bulk.body.modifiedCount).toBe(2);
    for (const id of ids) {
      const detail = await request(app.getHttpServer())
        .get(`/admin/questions/${id}`)
        .set(asAdmin())
        .expect(200);
      expect(detail.body.data.status).toBe('approved');
    }
  });

  it('retries primary and cover assets through the overridden infrastructure boundary', async () => {
    const created = await request(app.getHttpServer())
      .post('/questions')
      .set(asAdmin())
      .send({
        ...validQuestion(),
        type: 'image',
        assetStatus: 'FAILED',
        primaryAssetRequest: {
          type: 'image',
          entity: 'Fixture Entity',
          purpose: 'gameplay',
        },
        coverImageStatus: 'FAILED',
        coverImageRequest: {
          type: 'image',
          franchise: 'Fixture',
          purpose: 'decorative',
        },
      })
      .expect(201);
    const id = created.body.data._id as string;
    const primary = await request(app.getHttpServer())
      .post(`/admin/questions/${id}/retry-primary-asset`)
      .set(asAdmin())
      .expect(201);
    expect(primary.body.data).toMatchObject({
      assetStatus: 'READY',
      primaryAsset: { provider: 'fake-image' },
    });
    expectSafeResponse(primary.body);
    const cover = await request(app.getHttpServer())
      .post(`/admin/questions/${id}/retry-cover-image`)
      .set(asAdmin())
      .expect(201);
    expect(cover.body.data).toMatchObject({
      coverImageStatus: 'READY',
      coverImage: { provider: 'fake-image' },
    });
    expect(assetService.process).toHaveBeenCalledTimes(2);
    expectSafeResponse(cover.body);
  });
});
