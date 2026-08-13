import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import request from 'supertest';
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
import { Game, GameSchema } from '../../src/modules/games/schemas/game.schema';

type BoardQuestion = {
  question: string | { _id: string };
  points: number;
  isAnswered: boolean;
  isAnswerRevealed: boolean;
  awardedPoints?: number;
};

describe('Games HTTP lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let userToken: string;
  let expiredToken: string;
  let categoryId: string;

  beforeAll(async () => {
    database = await connectTestDatabase();
    await resetTestDatabase(database);
    const fixtures = await seedIntegrationFixtures(database);
    categoryId = fixtures.categoryIds[0].toString();
    app = await createIntegrationTestApp();
    userToken = await loginForToken(app, fixtureCredentials.user);
    expiredToken = await loginForToken(app, fixtureCredentials.expired);
  });

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  const auth = (token = userToken) => ({ Authorization: `Bearer ${token}` });
  const gamePayload = (name = 'لعبة دورة حياة') => ({
    name,
    teams: [
      { name: 'الفريق الأول', members: ['أحمد'] },
      { name: 'الفريق الثاني', members: ['سارة'] },
    ],
    categoryIds: [categoryId],
  });
  const questionId = (item: BoardQuestion) =>
    typeof item.question === 'string' ? item.question : item.question._id;

  it('enforces authentication, validation, and current subscription rules', async () => {
    await request(app.getHttpServer())
      .post('/games')
      .send(gamePayload())
      .expect(401);
    await request(app.getHttpServer())
      .post('/games')
      .set(auth())
      .send({ ...gamePayload(), teams: [{ name: 'واحد', members: [] }] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/games')
      .set(auth())
      .send({ ...gamePayload(), categoryIds: [] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/games')
      .set(auth())
      .send({ ...gamePayload(), categoryIds: ['700000000000000000009999'] })
      .expect(404);

    // Current rule permits the first free game even for an expired subscription.
    await request(app.getHttpServer())
      .post('/games')
      .set(auth(expiredToken))
      .send(gamePayload('اللعبة المجانية للحساب المنتهي'))
      .expect(201);
    await request(app.getHttpServer())
      .post('/games')
      .set(auth(expiredToken))
      .send(gamePayload('اللعبة الثانية للحساب المنتهي'))
      .expect(403);
  });

  it('creates a deterministic board, persists it, and prevents cross-user access', async () => {
    const created = await request(app.getHttpServer())
      .post('/games')
      .set(auth())
      .send(gamePayload())
      .expect(201);
    const game = created.body.data;
    expect(game).toMatchObject({
      status: 'active',
      currentTurnTeamIndex: 0,
      isFreeGame: true,
      questionSelectionMode: 'fixed',
      teams: [{ score: 0 }, { score: 0 }],
    });
    expect(game.board).toHaveLength(1);
    const questions = game.board[0].questions as BoardQuestion[];
    expect(questions).toHaveLength(6);
    expect(questions.filter((q) => q.points === 200)).toHaveLength(2);
    expect(questions.filter((q) => q.points === 400)).toHaveLength(2);
    expect(questions.filter((q) => q.points === 600)).toHaveLength(2);
    expect(new Set(questions.map(questionId)).size).toBe(6);
    expectSafeResponse(created.body);

    const refetched = await request(app.getHttpServer())
      .get(`/games/${game._id}`)
      .set(auth())
      .expect(200);
    expect(refetched.body.data).toMatchObject({
      _id: game._id,
      currentTurnTeamIndex: 0,
      status: 'active',
    });
    await request(app.getHttpServer())
      .get(`/games/${game._id}`)
      .set(auth(expiredToken))
      .expect(403);
  });

  it('reveals, scores, skips, completes, and refetches authoritative state', async () => {
    // The active subscriber already used the free game above; paid selection remains
    // eligibility-based and unique even though its order is randomized.
    const created = await request(app.getHttpServer())
      .post('/games')
      .set(auth())
      .send(gamePayload('لعبة مدفوعة كاملة'))
      .expect(201);
    const gameId = created.body.data._id as string;
    const questions = created.body.data.board[0].questions as BoardQuestion[];
    const firstId = questionId(questions[0]);

    const revealed = await request(app.getHttpServer())
      .post(`/games/${gameId}/reveal-answer`)
      .set(auth())
      .send({ questionId: firstId })
      .expect(200);
    expect(
      revealed.body.data.teams.map((team: { score: number }) => team.score),
    ).toEqual([0, 0]);
    expect(revealed.body.data.currentTurnTeamIndex).toBe(0);

    const scored = await request(app.getHttpServer())
      .post(`/games/${gameId}/award-points`)
      .set(auth())
      .send({ questionId: firstId, teamIndex: 0 })
      .expect(200);
    expect(scored.body.data.teams[0].score).toBe(questions[0].points);
    expect(scored.body.data.teams[1].score).toBe(0);
    expect(scored.body.data.currentTurnTeamIndex).toBe(1);
    await request(app.getHttpServer())
      .post(`/games/${gameId}/award-points`)
      .set(auth())
      .send({ questionId: firstId, teamIndex: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/games/${gameId}/award-points`)
      .set(auth())
      .send({ questionId: questionId(questions[1]), teamIndex: 4 })
      .expect(400);

    const secondId = questionId(questions[1]);
    const skipped = await request(app.getHttpServer())
      .post(`/games/${gameId}/skip-question`)
      .set(auth())
      .send({ questionId: secondId })
      .expect(200);
    const skippedQuestion = (
      skipped.body.data.board[0].questions as BoardQuestion[]
    ).find((item) => questionId(item) === secondId);
    expect(skippedQuestion).toMatchObject({
      isAnswered: true,
      isAnswerRevealed: true,
      awardedPoints: 0,
    });
    expect(skipped.body.data.teams[0].score).toBe(questions[0].points);

    for (const item of questions.slice(2)) {
      await request(app.getHttpServer())
        .post(`/games/${gameId}/skip-question`)
        .set(auth())
        .send({ questionId: questionId(item) })
        .expect(200);
    }
    const final = await request(app.getHttpServer())
      .get(`/games/${gameId}`)
      .set(auth())
      .expect(200);
    expect(final.body.data.status).toBe('finished');
    expect(final.body.data.teams[0].score).toBe(questions[0].points);
    expect(
      (final.body.data.board[0].questions as BoardQuestion[]).every(
        (q) => q.isAnswered,
      ),
    ).toBe(true);
    expectSafeResponse(final.body);
    await request(app.getHttpServer())
      .post(`/games/${gameId}/skip-question`)
      .set(auth())
      .send({ questionId: firstId })
      .expect(400);
    await request(app.getHttpServer())
      .post('/games/700000000000000000009999/skip-question')
      .set(auth())
      .send({ questionId: firstId })
      .expect(404);
  });

  it('prevents stale Mongoose writes through optimistic concurrency', async () => {
    const created = await request(app.getHttpServer())
      .post('/games')
      .set(auth())
      .send(gamePayload('لعبة اختبار التزامن'))
      .expect(201);
    const games =
      (database.models[Game.name] as
        ReturnType<Connection['model']> | undefined) ??
      database.model(Game.name, GameSchema);
    const first = await games.findById(created.body.data._id).exec();
    const stale = await games.findById(created.body.data._id).exec();
    expect(first).not.toBeNull();
    expect(stale).not.toBeNull();
    first!.set('name', 'الحالة الأحدث');
    await first!.save();
    stale!.set('name', 'كتابة قديمة مرفوضة');
    await expect(stale!.save()).rejects.toMatchObject({ name: 'VersionError' });
    const persisted = await games.findById(created.body.data._id).lean().exec();
    expect(persisted?.name).toBe('الحالة الأحدث');
  });
});
