import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../users/schemas/user.schema';
import { ContentEngineReviewController } from './content-engine-review.controller';
import {
  CandidateMediaAttachDto,
  CandidateMediaReviewDto,
  CandidateMediaRightsAcknowledgementDto,
} from './content-engine-review.dto';

describe('ContentEngineReviewController authorization', () => {
  it('requires authenticated Admin access for every review route', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ContentEngineReviewController),
    ).toEqual([UserRole.ADMIN]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ContentEngineReviewController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
  });
});

describe('ContentEngineReviewController media-review contract (§30.22 Phase 3A)', () => {
  // Built the same way the contract generator reflects controllers: real route
  // and DTO metadata, documentation-only providers, no database or storage.
  const documentFor = async () => {
    const { Test } = await import('@nestjs/testing');
    const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
    const { ContentEngineReviewService } =
      await import('../application/content-engine-review.service');
    const { CandidateMediaReviewService } =
      await import('../application/candidate-media-review.service');
    const moduleRef = await Test.createTestingModule({
      controllers: [ContentEngineReviewController],
      providers: [
        { provide: ContentEngineReviewService, useValue: {} },
        { provide: CandidateMediaReviewService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    await app.close();
    return document;
  };

  const base = '/admin/content-engine/candidates/{candidateId}/media/{slotKey}';

  it('exposes exactly the three media actions as POST routes with both path parameters', async () => {
    const document = await documentFor();
    const mediaPaths = Object.keys(document.paths).filter((path) =>
      path.includes('/media/'),
    );
    expect(mediaPaths.sort()).toEqual(
      [
        `${base}/asset`,
        `${base}/review`,
        `${base}/rights-acknowledgement`,
      ].sort(),
    );
    for (const path of mediaPaths) {
      const operation = document.paths[path];
      expect(Object.keys(operation)).toEqual(['post']);
      expect(
        (operation.post!.parameters as Array<{ name: string; in: string }>)
          .filter((parameter) => parameter.in === 'path')
          .map((parameter) => parameter.name)
          .sort(),
      ).toEqual(['candidateId', 'slotKey']);
    }
  });

  it('accepts JSON for review and acknowledgment, and multipart only for the asset upload', async () => {
    const document = await documentFor();
    const contentTypes = (path: string) =>
      Object.keys(
        (
          document.paths[path].post!.requestBody as {
            content: Record<string, unknown>;
          }
        ).content,
      );
    expect(contentTypes(`${base}/asset`)).toEqual(['multipart/form-data']);
    expect(contentTypes(`${base}/review`)).toEqual(['application/json']);
    expect(contentTypes(`${base}/rights-acknowledgement`)).toEqual([
      'application/json',
    ]);
  });
});

/**
 * The Review Studio DTOs are validated, not Swagger-annotated (the Content
 * Engine sits outside the generated OpenAPI contract), so their types are
 * checked through the exact global ValidationPipe the application installs.
 */
describe('media-review DTOs under the global ValidationPipe', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const run = (metatype: new () => object, value: unknown) =>
    pipe.transform(value, { type: 'body', metatype });

  it('types CandidateMediaReviewDto', async () => {
    await expect(
      run(CandidateMediaReviewDto, {
        expectedMediaReviewRevision: 2,
        status: 'rejected',
        reasonCode: 'WRONG_SUBJECT',
        explanation: '  not the right person  ',
      }),
    ).resolves.toMatchObject({
      expectedMediaReviewRevision: 2,
      status: 'rejected',
      explanation: 'not the right person',
    });
    for (const invalid of [
      { status: 'approved' },
      { expectedMediaReviewRevision: -1, status: 'approved' },
      { expectedMediaReviewRevision: 1, status: 'pending' },
      {
        expectedMediaReviewRevision: 1,
        status: 'approved',
        reasonCode: 'NOPE',
      },
      { expectedMediaReviewRevision: 1, status: 'approved', slotKey: 'hero' },
    ]) {
      await expect(
        run(CandidateMediaReviewDto, invalid),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('types CandidateMediaRightsAcknowledgementDto', async () => {
    await expect(
      run(CandidateMediaRightsAcknowledgementDto, {
        expectedMediaReviewRevision: 0,
        note: ' agency confirming ',
      }),
    ).resolves.toMatchObject({ note: 'agency confirming' });
    for (const invalid of [
      { expectedMediaReviewRevision: 0, note: '   ' },
      { expectedMediaReviewRevision: 0 },
      { expectedMediaReviewRevision: 0, note: 'n', rightsStatus: 'CLEARED' },
    ]) {
      await expect(
        run(CandidateMediaRightsAcknowledgementDto, invalid),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('types CandidateMediaAttachDto, coercing the multipart revision and refusing any URL', async () => {
    await expect(
      run(CandidateMediaAttachDto, { expectedMediaReviewRevision: '3' }),
    ).resolves.toEqual(
      expect.objectContaining({ expectedMediaReviewRevision: 3 }),
    );
    for (const invalid of [
      { expectedMediaReviewRevision: 'x' },
      { expectedMediaReviewRevision: '1', url: 'https://evil.example/x.png' },
      { expectedMediaReviewRevision: '1', altText: 'answer' },
    ]) {
      await expect(
        run(CandidateMediaAttachDto, invalid),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
