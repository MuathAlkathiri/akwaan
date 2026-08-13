import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
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

describe('Auth, catalogs, and categories HTTP integration', () => {
  let app: INestApplication;
  let database: Connection;

  beforeAll(async () => {
    database = await connectTestDatabase();
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp();
  });

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  it('registers, logs in, hydrates safely, and rejects duplicate/invalid auth', async () => {
    const registration = {
      fullName: 'HTTP Test User',
      email: 'http-user@integration.invalid',
      password: 'SafeTest!42',
    };
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send(registration)
      .expect(201);
    expect(registered.body.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(registered.body)).not.toMatch(/password|__v/);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(registration)
      .expect(409);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: registration.email, password: 'incorrect' })
      .expect(401);
    await request(app.getHttpServer()).get('/auth/me').expect(401);

    const token = await loginForToken(app, registration);
    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.email).toBe(registration.email);
    expect(JSON.stringify(me.body)).not.toMatch(/password|__v/);
  });

  it('enforces administrator-only user listing', async () => {
    const adminToken = await loginForToken(app, fixtureCredentials.admin);
    const userToken = await loginForToken(app, fixtureCredentials.user);
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(response.body.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(response.body)).not.toMatch(/password|__v/);
  });

  it('lists deterministic catalog and category relationships safely', async () => {
    const catalogs = await request(app.getHttpServer())
      .get('/catalogs')
      .expect(200);
    expect(catalogs.body.data).toHaveLength(1);
    expect(catalogs.body.data[0].slug).toBe('integration-tests');
    expect(JSON.stringify(catalogs.body)).not.toMatch(/"path"|__v/);

    const categories = await request(app.getHttpServer())
      .get('/categories')
      .expect(200);
    expect(categories.body.data).toHaveLength(6);
    expect(categories.body.data[0].gameplayConfig).toBeDefined();
    expect(JSON.stringify(categories.body)).not.toMatch(/"path"|__v/);
  });
});
