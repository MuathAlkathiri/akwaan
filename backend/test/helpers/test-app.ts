import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter';
import { configureApiApplication } from '../../src/common/swagger/swagger.config';
import { requireSafeTestDatabaseUri } from './test-database';

export async function createIntegrationTestApp(options?: {
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  env?: Record<string, string>;
}): Promise<INestApplication> {
  process.env.NODE_ENV = 'test';
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
  return app;
}
