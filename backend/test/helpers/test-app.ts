import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter';
import { configureApiApplication } from '../../src/common/swagger/swagger.config';
import { requireSafeTestDatabaseUri } from './test-database';

export async function createIntegrationTestApp(options?: {
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  env?: Record<string, string>;
}): Promise<INestApplication> {
  process.env.NODE_ENV = 'test';
  // The `_test` safety guard, and the base every suite starts from. A suite that
  // wants its own database overrides this through `options.env` below.
  process.env.MONGODB_URI = requireSafeTestDatabaseUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'integration-test-secret';
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  process.env.EXTERNAL_INTEGRATIONS_DISABLED = 'true';
  Object.assign(process.env, options?.env);

  const { AppModule } = await import('../../src/app.module');
  const builder = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await (options?.configure?.(builder) ?? builder).compile();
  const app = moduleRef.createNestApplication();
  configureApiApplication(app);
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  // Mongoose builds every model's indexes in the background after boot. On a
  // fresh suite database those builds hold collection locks, and a test's first
  // transaction can then fail with a transient `LockTimeout` and be retried by
  // the driver — re-running a test callback whose side effects already happened.
  // Hand the app over only once the indexes are in place.
  const connection = app.get<Connection>(getConnectionToken());
  await Promise.all(
    connection.modelNames().map((name) => connection.model(name).init()),
  );
  return app;
}
