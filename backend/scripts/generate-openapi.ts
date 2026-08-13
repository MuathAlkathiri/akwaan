import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import {
  configureApiApplication,
  createOpenApiDocument,
} from '../src/common/swagger/swagger.config';

async function generate(): Promise<void> {
  const { OpenApiAppModule } = await import('./openapi-app.module');
  const app = await NestFactory.create(OpenApiAppModule, {
    logger: ['error'],
  });
  try {
    configureApiApplication(app);
    await app.init();
    const document = createOpenApiDocument(app);
    const output = process.env.OPENAPI_OUTPUT
      ? resolve(process.env.OPENAPI_OUTPUT)
      : resolve(__dirname, '../openapi/openapi.json');
    writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    process.stdout.write(`OpenAPI document written to ${output}\n`);
  } finally {
    await app.close();
  }
}

void generate().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`OpenAPI generation failed: ${message}\n`);
  process.exitCode = 1;
});
