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

const DEFAULT_PORT = 3000;
const MAX_PORT_FALLBACK_ATTEMPTS = 10;

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
      await app.listen(currentPort);
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

  const configuredCorsOrigins = configService
    .get<string>('CORS_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: configuredCorsOrigins?.length
      ? configuredCorsOrigins
      : ['http://localhost:3001', 'http://127.0.0.1:3001'],
    credentials: true,
  });

  configureApiApplication(app);

  if (configService.get<string>('SWAGGER_ENABLED') !== 'false') {
    SwaggerModule.setup('api', app, createOpenApiDocument(app));
  }

  const port = await listen(app, getPort());
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger UI available at: http://localhost:${port}/api`);
}

bootstrap();
