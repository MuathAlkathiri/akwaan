import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.dto';

export function configureApiApplication(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Lammah Game API')
    .setDescription(
      'Runtime HTTP contract for Lammah game administration, content, and gameplay.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponseDto],
  });

  // Some legacy decorators contain OpenAPI 2-style response examples under a
  // top-level `schema`. Once a typed OpenAPI 3 `content` response exists that
  // sibling is invalid and breaks standards-compliant generators such as Orval.
  for (const pathItem of Object.values(document.paths)) {
    for (const operation of Object.values(pathItem)) {
      if (
        !operation ||
        typeof operation !== 'object' ||
        !('responses' in operation)
      )
        continue;
      for (const response of Object.values(operation.responses ?? {})) {
        if (
          !response ||
          typeof response !== 'object' ||
          !('content' in response)
        )
          continue;
        delete (response as typeof response & { schema?: unknown }).schema;
      }
    }
  }

  return document;
}
