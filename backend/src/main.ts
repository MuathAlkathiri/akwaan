import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import {
  configureApiApplication,
  createOpenApiDocument,
} from './common/swagger/swagger.config';
import {
  corsOriginDelegate,
  resolveCorsOrigins,
} from './common/config/cors-origins';
import {
  MEDIA_OBJECT_STORAGE,
  type MediaObjectStorage,
  normalizeKey,
} from './common/uploads/media-object-storage';

const DEFAULT_PORT = 3000;
const MAX_PORT_FALLBACK_ATTEMPTS = 10;
/** Managed hosts route traffic in over a private interface, never loopback. */
const HOST = '0.0.0.0';

function getPort(): number {
  const configuredPort = process.env.PORT;

  if (!configuredPort) {
    return DEFAULT_PORT;
  }

  const port = Number(configuredPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid PORT value "${configuredPort}". Please set PORT to a number between 1 and 65535.`,
    );
  }

  return port;
}

function isAddressInUseError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
  );
}

async function listen(app: INestApplication, port: number): Promise<number> {
  const shouldTryFallbackPorts = process.env.NODE_ENV !== 'production';
  const lastPortToTry = shouldTryFallbackPorts
    ? Math.min(port + MAX_PORT_FALLBACK_ATTEMPTS, 65535)
    : port;

  for (let currentPort = port; currentPort <= lastPortToTry; currentPort += 1) {
    try {
      await app.listen(currentPort, HOST);
      return currentPort;
    } catch (error) {
      if (!isAddressInUseError(error) || currentPort === lastPortToTry) {
        throw error;
      }

      Logger.warn(
        `Port ${currentPort} is already in use. Trying port ${
          currentPort + 1
        }...`,
        'Bootstrap',
      );
    }
  }

  return port;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const uploadsRoot =
    configService.get<string>('UPLOADS_DIR') ?? join(process.cwd(), 'uploads');

  app.use('/uploads', express.static(uploadsRoot));

  // Anything the local disk does not have is served from the mirror. On a host
  // with an ephemeral filesystem that is every pre-existing asset, which is how
  // the BETA plays media the DB still points at as `/uploads/...` — no document
  // rewrite, no frontend change.
  const objectStorage = app.get<MediaObjectStorage>(MEDIA_OBJECT_STORAGE);
  app.use(
    '/uploads',
    (
      request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      const target = objectStorage.publicUrl(
        normalizeKey(decodeURIComponent(request.path)),
      );
      if (!target) {
        next();
        return;
      }
      response.redirect(302, target);
    },
  );

  app.enableCors({
    origin: corsOriginDelegate(),
    credentials: true,
  });

  configureApiApplication(app);

  // Off by default in production. The document enumerates every admin mutation
  // and its payload shape — useful locally, an operational map of the API for
  // anyone who finds the BETA URL.
  const swaggerFlag = configService.get<string>('SWAGGER_ENABLED');
  const swaggerEnabled =
    process.env.NODE_ENV === 'production'
      ? swaggerFlag === 'true'
      : swaggerFlag !== 'false';
  if (swaggerEnabled) {
    SwaggerModule.setup('api', app, createOpenApiDocument(app));
  }

  const port = await listen(app, getPort());
  Logger.log(`Listening on ${HOST}:${port}`, 'Bootstrap');
  Logger.log(
    `CORS allowlist: ${resolveCorsOrigins().join(', ') || '(empty)'}`,
    'Bootstrap',
  );
  Logger.log(
    swaggerEnabled ? 'Swagger UI mounted at /api' : 'Swagger UI disabled',
    'Bootstrap',
  );
}

bootstrap();
