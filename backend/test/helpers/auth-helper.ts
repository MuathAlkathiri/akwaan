import request from 'supertest';
import { INestApplication } from '@nestjs/common';

export async function loginForToken(
  app: INestApplication,
  credentials: { email: string; password: string },
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: credentials.email, password: credentials.password })
    .expect(201);
  return response.body.accessToken as string;
}
