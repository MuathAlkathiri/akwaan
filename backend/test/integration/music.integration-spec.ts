import { INestApplication } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import {
  LocalAudioStorageService,
  StoredLocalAudio,
} from '../../src/common/uploads/local-audio-storage.service';
import { AudioProcessorService } from '../../src/infrastructure/media/audio-processor.service';
import { MediaInspectorService } from '../../src/infrastructure/media/media-inspector.service';
import { MusicTrackRepository } from '../../src/modules/music/persistence/music-track.repository';
import { QuestionRepository } from '../../src/modules/questions/persistence/question.repository';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { loginForToken } from '../helpers/auth-helper';
import { expectSafeResponse } from '../helpers/response-safety';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe('Music HTTP lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let adminToken: string;
  let userToken: string;

  const deleted: string[] = [];
  let sequence = 0;
  const storage = {
    saveOriginal: jest.fn(async (): Promise<StoredLocalAudio> => {
      sequence += 1;
      return {
        filename: `safe-${sequence}.mp3`,
        absolutePath: `/private/test/music/safe-${sequence}.mp3`,
        url: `/uploads/music/originals/safe-${sequence}.mp3`,
      };
    }),
    allocateSnippet: jest.fn(
      async (filename: string): Promise<StoredLocalAudio> => ({
        filename: filename.replace('.mp3', '-snippet.mp3'),
        absolutePath: `/private/test/music/${filename}-snippet.mp3`,
        url: `/uploads/music/snippets/${filename}-snippet.mp3`,
      }),
    ),
    delete: jest.fn(async (file?: StoredLocalAudio) => {
      if (file) deleted.push(file.absolutePath);
    }),
  };
  const inspector = { audioDurationSeconds: jest.fn(async () => 80) };
  const processor = { createMp3Snippet: jest.fn(async () => undefined) };

  beforeAll(async () => {
    database = await connectTestDatabase();
    await resetTestDatabase(database);
    const fixtures = await seedIntegrationFixtures(database);
    await database
      .collection('categories')
      .updateOne(
        { _id: fixtures.categoryIds[0] },
        { $set: { name: 'أغاني', slug: 'songs' } },
      );
    app = await createIntegrationTestApp({
      configure: (builder) =>
        builder
          .overrideProvider(LocalAudioStorageService)
          .useValue(storage)
          .overrideProvider(MediaInspectorService)
          .useValue(inspector)
          .overrideProvider(AudioProcessorService)
          .useValue(processor),
    });
    adminToken = await loginForToken(app, fixtureCredentials.admin);
    userToken = await loginForToken(app, fixtureCredentials.user);
  });

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    deleted.length = 0;
    storage.saveOriginal.mockImplementation(async () => {
      sequence += 1;
      return {
        filename: `safe-${sequence}.mp3`,
        absolutePath: `/private/test/music/safe-${sequence}.mp3`,
        url: `/uploads/music/originals/safe-${sequence}.mp3`,
      };
    });
    storage.allocateSnippet.mockImplementation(async (filename: string) => ({
      filename: filename.replace('.mp3', '-snippet.mp3'),
      absolutePath: `/private/test/music/${filename}-snippet.mp3`,
      url: `/uploads/music/snippets/${filename}-snippet.mp3`,
    }));
    storage.delete.mockImplementation(async (file?: StoredLocalAudio) => {
      if (file) deleted.push(file.absolutePath);
    });
    inspector.audioDurationSeconds.mockResolvedValue(80);
    processor.createMp3Snippet.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });
  const upload = (overrides: Record<string, string> = {}) => {
    let call = request(app.getHttpServer())
      .post('/admin/music-tracks/upload')
      .set(auth())
      .attach('file', Buffer.from('deterministic test audio'), {
        filename: 'submitted-name.mp3',
        contentType: 'audio/mpeg',
      });
    const fields = {
      title: 'الأماكن',
      artist: 'محمد عبده',
      album: 'اختبار آمن',
      language: 'ar',
      genre: 'طرب',
      difficulty: 'medium',
      ...overrides,
    };
    for (const [key, value] of Object.entries(fields))
      call = call.field(key, value);
    return call;
  };

  it('uploads safely with default and custom timing and creates a draft question', async () => {
    const created = await upload().expect(201);
    expect(created.body.statusCode).toBe(201);
    expect(created.body.data.musicTrack).toMatchObject({
      title: 'الأماكن',
      artist: 'محمد عبده',
      album: 'اختبار آمن',
      language: 'ar',
      genre: 'طرب',
      difficulty: 'medium',
      durationSeconds: 80,
      snippetStartSecond: 30,
      snippetDurationSeconds: 15,
      isActive: true,
      source: 'admin-upload',
    });
    expect(created.body.data.musicTrack.originalAudioUrl).toMatch(
      /^\/uploads\/music\/originals\/safe-/,
    );
    expect(created.body.data.musicTrack.originalAudioUrl).not.toContain(
      'submitted-name',
    );
    expect(created.body.data.question).toMatchObject({
      type: 'guess_song',
      answer: 'الأماكن',
      difficulty: 'medium',
    });
    expect(storage.saveOriginal).toHaveBeenCalledTimes(1);
    expect(inspector.audioDurationSeconds).toHaveBeenCalledTimes(1);
    expect(processor.createMp3Snippet).toHaveBeenCalledWith(
      expect.objectContaining({ startSecond: 30, durationSeconds: 15 }),
    );
    expectSafeResponse(created.body);

    const custom = await upload({
      title: 'ليلة خميس',
      snippetStartSecond: '75',
      snippetDurationSeconds: '20',
    }).expect(201);
    expect(custom.body.data.musicTrack).toMatchObject({
      snippetStartSecond: 60,
      snippetDurationSeconds: 20,
    });
  });

  it('enforces multipart validation and authorization', async () => {
    await request(app.getHttpServer())
      .post('/admin/music-tracks/upload')
      .set(auth())
      .field('title', 'بدون ملف')
      .expect(400);
    await request(app.getHttpServer())
      .post('/admin/music-tracks/upload')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('file', Buffer.from('audio'), {
        filename: 'x.mp3',
        contentType: 'audio/mpeg',
      })
      .expect(403);
    await request(app.getHttpServer())
      .post('/admin/music-tracks/upload')
      .attach('file', Buffer.from('audio'), {
        filename: 'x.mp3',
        contentType: 'audio/mpeg',
      })
      .expect(401);
    await upload({ difficulty: 'impossible' }).expect(400);
    await upload({ snippetDurationSeconds: '9' }).expect(400);
    await upload({ snippetDurationSeconds: '21' }).expect(400);
    await upload({ snippetStartSecond: 'not-a-number' }).expect(400);
    await request(app.getHttpServer())
      .post('/admin/music-tracks/upload')
      .set(auth())
      .attach('file', Buffer.from('not audio'), {
        filename: 'unsafe.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });

  it('lists, updates, validates normalized answers, and soft deletes', async () => {
    const created = await upload().expect(201);
    const trackId = created.body.data.musicTrack.id as string;
    const questionId = created.body.data.question.id as string;
    const list = await request(app.getHttpServer())
      .get('/admin/music-tracks')
      .set(auth())
      .expect(200);
    expect(
      list.body.data.some((item: { id: string }) => item.id === trackId),
    ).toBe(true);
    expectSafeResponse(list.body);
    await request(app.getHttpServer())
      .get(`/admin/music-tracks/${trackId}`)
      .set(auth())
      .expect(200);
    const updated = await request(app.getHttpServer())
      .patch(`/admin/music-tracks/${trackId}`)
      .set(auth())
      .send({ title: 'الاماكن', artist: 'فنان محدّث' })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      title: 'الاماكن',
      artist: 'فنان محدّث',
      snippetDurationSeconds: 15,
    });
    await request(app.getHttpServer())
      .patch(`/admin/music-tracks/${trackId}`)
      .set(auth())
      .send({ snippetDurationSeconds: 12 })
      .expect(400);

    for (const answer of ['الْأَمَاكِن', 'الـأماكن!!!', '  الاماكن  ']) {
      const checked = await request(app.getHttpServer())
        .post('/music/questions/validate-answer')
        .send({ questionId, answer })
        .expect(201);
      expect(checked.body.data.isCorrect).toBe(true);
      expect(checked.body.data.normalizedCorrectAnswer).toBe('الاماكن');
    }
    const incorrect = await request(app.getHttpServer())
      .post('/music/questions/validate-answer')
      .send({ questionId, answer: 'إجابة أخرى' })
      .expect(201);
    expect(incorrect.body.data.isCorrect).toBe(false);

    const removed = await request(app.getHttpServer())
      .delete(`/admin/music-tracks/${trackId}`)
      .set(auth())
      .expect(200);
    expect(removed.body.data.isActive).toBe(false);
    expect(
      await database.collection('musictracks').findOne({
        _id: new Types.ObjectId(trackId),
      }),
    ).not.toBeNull();
    expect(
      (
        await database.collection('questions').findOne({
          _id: new Types.ObjectId(questionId),
        })
      )?.status,
    ).toBe('rejected');
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('compensates files and records when inspection, processing, or question persistence fails', async () => {
    inspector.audioDurationSeconds.mockRejectedValueOnce(
      new Error('private inspector stderr /Users/secret'),
    );
    const inspection = await upload({ title: 'inspection failure' }).expect(
      500,
    );
    expectSafeResponse(inspection.body);
    expect(deleted).toHaveLength(1);

    processor.createMp3Snippet.mockRejectedValueOnce(
      new Error('processor failed'),
    );
    await upload({ title: 'processing failure' }).expect(500);
    expect(deleted).toHaveLength(3);

    await database
      .collection('categories')
      .updateMany({}, { $set: { isActive: false } });
    await upload({ title: 'question failure' }).expect(500);
    expect(
      await database
        .collection('musictracks')
        .countDocuments({ title: 'question failure' }),
    ).toBe(0);
    expect(deleted).toHaveLength(5);
    await database
      .collection('categories')
      .updateMany({}, { $set: { isActive: true } });
  });

  it('compensates both files when Music repository persistence fails', async () => {
    const tracks = app.get(MusicTrackRepository);
    jest
      .spyOn(tracks, 'create')
      .mockRejectedValueOnce(
        new Error('MongoServerError raw database internals /Users/private'),
      );
    const response = await upload({ title: 'repository failure' }).expect(500);
    expect(response.body.message).toBe('Internal server error');
    expect(deleted).toHaveLength(2);
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(
      await database
        .collection('musictracks')
        .countDocuments({ title: 'repository failure' }),
    ).toBe(0);
    expectSafeResponse(response.body);
  });

  it('stops immediately on original storage failure and compensates snippet allocation failure', async () => {
    storage.saveOriginal.mockRejectedValueOnce(
      new Error('storage failed /private/test/secret'),
    );
    const originalFailure = await upload({
      title: 'original storage failure',
    }).expect(500);
    expect(inspector.audioDurationSeconds).not.toHaveBeenCalled();
    expect(processor.createMp3Snippet).not.toHaveBeenCalled();
    expect(deleted).toHaveLength(0);
    expectSafeResponse(originalFailure.body);

    storage.allocateSnippet.mockRejectedValueOnce(
      new Error('snippet allocation failed'),
    );
    const snippetFailure = await upload({
      title: 'snippet storage failure',
    }).expect(500);
    expect(inspector.audioDurationSeconds).toHaveBeenCalledTimes(1);
    expect(processor.createMp3Snippet).not.toHaveBeenCalled();
    expect(deleted).toHaveLength(1);
    expectSafeResponse(snippetFailure.body);
  });

  it('preserves the primary persistence failure when cleanup also fails', async () => {
    const tracks = app.get(MusicTrackRepository);
    jest
      .spyOn(tracks, 'create')
      .mockRejectedValueOnce(new Error('primary failure'));
    storage.delete.mockRejectedValue(
      new Error('cleanup /Users/private failed'),
    );
    const response = await upload({ title: 'cleanup failure' }).expect(500);
    expect(response.body.message).toBe('Internal server error');
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expectSafeResponse(response.body);
  });

  it('removes the Music record and files when draft Question persistence fails', async () => {
    const questions = app.get(QuestionRepository);
    jest
      .spyOn(questions, 'create')
      .mockRejectedValueOnce(new Error('question MongoDB write failed'));
    const response = await upload({
      title: 'question repository failure',
    }).expect(500);
    expect(
      await database
        .collection('musictracks')
        .countDocuments({ title: 'question repository failure' }),
    ).toBe(0);
    expect(
      await database
        .collection('questions')
        .countDocuments({ answer: 'question repository failure' }),
    ).toBe(0);
    expect(deleted).toHaveLength(2);
    expectSafeResponse(response.body);
  });
});
