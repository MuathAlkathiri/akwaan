import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';
import { QuestionAudioJobService } from '../../src/modules/questions/application/question-audio-job.service';
import { AudioQuestionKind } from '../../src/modules/questions/schemas/question.schema';
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

describe('manual question architecture integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let categoryId: string;
  const jobs = { enqueue: jest.fn().mockReturnValue(true) };

  beforeAll(async () => {
    database = await connectTestDatabase();
    await resetTestDatabase(database);
    const fixtures = await seedIntegrationFixtures(database);
    categoryId = fixtures.categoryIds[0].toString();
    app = await createIntegrationTestApp({
      env: { AI_QUESTION_GENERATION_ENABLED: 'false' },
      configure: (builder) =>
        builder.overrideProvider(QuestionAudioJobService).useValue(jobs),
    });
    token = await loginForToken(app, fixtureCredentials.admin);
  });

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('returns the structured disabled-generation response', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, count: 1 })
      .expect(503);
    expect(response.body).toMatchObject({
      statusCode: 503,
      code: 'AI_QUESTION_GENERATION_DISABLED',
      message: 'AI question generation is currently disabled.',
    });
  });

  it('persists an audio draft immediately and enqueues isolated processing', async () => {
    const response = await request(app.getHttpServer())
      .post('/questions')
      .set(auth())
      .send({
        category: categoryId,
        question: 'ما اسم الشخصية في هذا المقطع الصوتي الفريد؟',
        answer: 'كريتوس',
        difficulty: 'medium',
        points: 400,
        requiresAudio: true,
        audioRequest: {
          kind: AudioQuestionKind.IDENTIFY_CHARACTER,
          searchQuery: 'Kratos voice line God of War',
          targetName: 'Kratos',
          sourceTitle: 'God of War',
          language: 'en',
          preferredDurationSeconds: 8,
        },
      });
    if (response.status !== 201)
      throw new Error(`Create failed: ${JSON.stringify(response.body)}`);
    expect(response.body.data).toMatchObject({
      status: 'draft',
      requiresAudio: true,
      audioStatus: 'pending',
      audioReviewStatus: 'pending',
    });
    expect(jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        questionId: response.body.data._id,
        requestVersion: 1,
        requestHash: expect.any(String),
        mode: 'research',
      }),
    );
  });

  it('exposes standalone normalized duplicate detection', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/questions/check-duplicates')
      .set(auth())
      .send({
        categoryId,
        question: 'ما اسم الشخصيه في هذا المقطع الصوتي الفريد',
      })
      .expect(201);
    expect(response.body.exactMatch).toBe(true);
    expect(response.body.highestSimilarity).toBe(1);
  });
});
