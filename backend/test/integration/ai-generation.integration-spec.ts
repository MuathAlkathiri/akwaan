import { INestApplication } from '@nestjs/common';
import { Connection, Model, Types } from 'mongoose';
import request from 'supertest';
import { AssetService } from '../../src/modules/ai-agent/application/asset.service';
import { EntityVerificationService } from '../../src/modules/ai-agent/application/entity-verification.service';
import type {
  EntityVerificationRequest,
  VerifiedEntity,
} from '../../src/modules/ai-agent/application/entity-verification.types';
import { LlmClientService } from '../../src/modules/ai-agent/infrastructure/ai/llm-client.service';
import { Question } from '../../src/modules/questions/schemas/question.schema';
import { FakeLlmProvider } from '../fixtures/fake-llm.provider';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { loginForToken } from '../helpers/auth-helper';
import { expectSafeResponse } from '../helpers/response-safety';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';

describe.skip('retired AI Generation HTTP orchestration integration', () => {
  let app: INestApplication;
  let database: Connection;
  let adminToken: string;
  let userToken: string;
  let categoryId: string;
  const llm = new FakeLlmProvider();
  const assets = {
    process: jest.fn(async (assetRequest?: Record<string, unknown>) =>
      assetRequest
        ? {
            assetStatus: 'READY',
            asset: {
              type: 'image',
              url: '/uploads/test/ai-safe.jpg',
              localPath: '/Users/private/provider-result.jpg',
              provider: 'fake-image',
              source: 'integration-fixture',
              metadata: { license: 'fixture', entity: assetRequest.entity },
            },
          }
        : { assetStatus: 'NOT_REQUIRED' },
    ),
  };
  const verification = {
    verify: jest.fn(
      async (
        requestValue: EntityVerificationRequest,
      ): Promise<VerifiedEntity> => ({
        verificationStatus: 'VERIFIED',
        canonicalEntity: requestValue.proposedEntity,
        canonicalAnswer: requestValue.proposedAnswer,
        entityType: requestValue.entityType,
        aliases: [requestValue.proposedEntity],
        originalLanguageAliases: [requestValue.proposedEntity],
        transliterations: [],
        ...(requestValue.franchise
          ? { franchise: requestValue.franchise }
          : {}),
        ...(requestValue.artist
          ? {
              song: {
                title: requestValue.proposedEntity,
                artist: requestValue.artist,
                titleAliases: [requestValue.proposedEntity],
                artistAliases: [requestValue.artist],
              },
            }
          : {}),
        confidence: {
          overall: 0.9,
          identity: 0.9,
          answer: 0.9,
          association: 0.9,
        },
        evidence: [
          {
            sourceTitle: 'integration fixture',
            sourceDomain: 'integration.fixture',
            sourceTier: 'official',
            supportsIdentity: true,
            supportsAnswer: true,
            supportsAssociation: true,
          },
        ],
        searchHints: {
          requiredTerms: [requestValue.proposedEntity],
          trustedAliases: [requestValue.proposedEntity],
          franchiseTerms: requestValue.franchise
            ? [requestValue.franchise]
            : [],
          providerHints: [],
          prohibitedGenericTerms: [],
        },
        issues: ['ENTITY_VERIFICATION_SUCCEEDED'],
        cacheHit: false,
        durationMs: 1,
      }),
    ),
    diagnostics: jest.fn((entity: VerifiedEntity, required: boolean) => ({
      verificationRequired: required,
      verificationProvider: 'wigolo',
      verificationStatus: entity.verificationStatus,
      verificationCacheHit: Boolean(entity.cacheHit),
      canonicalEntity: entity.canonicalEntity,
      canonicalAnswer: entity.canonicalAnswer,
      verifiedAliasesCount: entity.aliases.length,
      evidenceSourceCount: entity.evidence.length,
      evidenceTierCounts: { official: entity.evidence.length },
      overallConfidence: entity.confidence.overall,
      identityConfidence: entity.confidence.identity,
      answerConfidence: entity.confidence.answer,
      associationConfidence: entity.confidence.association,
      verificationDurationMs: entity.durationMs ?? 0,
      verificationIssueCodes: entity.issues,
      ...(entity.song
        ? {
            canonicalSongTitle: entity.song.title,
            canonicalArtist: entity.song.artist,
            titleAliasCount: entity.song.titleAliases.length,
            artistAliasCount: entity.song.artistAliases.length,
          }
        : {}),
      ...(entity.franchise ? { verifiedFranchise: entity.franchise } : {}),
    })),
  };

  beforeAll(async () => {
    database = await connectTestDatabase();
    await resetTestDatabase(database);
    const fixtures = await seedIntegrationFixtures(database);
    categoryId = fixtures.categoryIds[0].toString();
    app = await createIntegrationTestApp({
      env: { AI_PROVIDER: 'lmstudio' },
      configure: (builder) =>
        builder
          .overrideProvider(LlmClientService)
          .useValue(llm)
          .overrideProvider(AssetService)
          .useValue(assets)
          .overrideProvider(EntityVerificationService)
          .useValue(verification),
    });
    adminToken = await loginForToken(app, fixtureCredentials.admin);
    userToken = await loginForToken(app, fixtureCredentials.user);
  });

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  beforeEach(() => {
    llm.reset();
    jest.clearAllMocks();
    assets.process.mockImplementation(
      async (assetRequest?: Record<string, unknown>) =>
        assetRequest
          ? {
              assetStatus: 'READY',
              asset: {
                type: 'image',
                url: '/uploads/test/ai-safe.jpg',
                localPath: '/Users/private/provider-result.jpg',
                provider: 'fake-image',
                source: 'integration-fixture',
                metadata: { license: 'fixture', entity: assetRequest.entity },
              },
            }
          : { assetStatus: 'NOT_REQUIRED' },
    );
  });

  afterEach(() => jest.restoreAllMocks());

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });
  const draft = (index: number) => ({
    question: `ما نتيجة السؤال المتكامل رقم ${index}؟`,
    correctAnswer: `الإجابة ${index}`,
    wrongAnswers: [`خاطئة ${index}-1`, `خاطئة ${index}-2`, `خاطئة ${index}-3`],
    difficulty: 'medium',
    gameMode: 'trivia',
    type: 'text',
    assetRequest: null,
    primaryAssetRequest: null,
    coverImageRequest: {
      type: 'image',
      entity: `موضوع ${index}`,
      purpose: 'decorative',
    },
    assetStatus: 'NOT_REQUIRED',
    asset: null,
    explanation: `شرح ${index}`,
    qualityScore: 8,
    issues: [],
  });

  function queueReviewedGeneration() {
    llm.enqueue(
      { questions: [draft(1), draft(2)] },
      { primaryAssetPlan: null, coverImagePlan: draft(1).coverImageRequest },
      { primaryAssetPlan: null, coverImagePlan: draft(2).coverImageRequest },
      { accepted: true, confidence: 1, issues: [], reason: 'safe fixture' },
      { accepted: true, confidence: 1, issues: [], reason: 'safe fixture' },
      {
        approvedForAdminReview: true,
        qualityScore: 9,
        issues: [],
        suggestedFixes: [],
      },
      {
        approvedForAdminReview: true,
        qualityScore: 9,
        issues: [],
        suggestedFixes: [],
      },
    );
  }

  function queueSingleGeneration(
    generated: Record<string, unknown>,
    primaryAssetPlan: Record<string, unknown> | null = null,
    coverImagePlan: Record<string, unknown> = draft(1).coverImageRequest,
  ) {
    llm.enqueue(
      { questions: [generated] },
      { primaryAssetPlan, coverImagePlan },
      { accepted: true, confidence: 1, issues: [], reason: 'safe fixture' },
      {
        approvedForAdminReview: true,
        qualityScore: 9,
        issues: [],
        suggestedFixes: [],
      },
    );
  }

  function mockProviderContent(content: unknown) {
    return jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  typeof content === 'string'
                    ? content
                    : JSON.stringify(content),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  it('runs the real multi-agent sequence with default count two and persists nothing', async () => {
    const questions = database.models[Question.name] as Model<Question>;
    const before = await questions.countDocuments();
    queueReviewedGeneration();
    const response = await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, difficulty: 'medium', language: 'ar' })
      .expect(201);

    expect(response.body).toMatchObject({
      statusCode: 201,
      count: 2,
      meta: {
        source: 'categoryId',
        multiAgentContentPipeline: true,
        gameplayValidatorUsed: true,
        coverImagesReady: 2,
      },
    });
    expect(response.body.data.questions).toHaveLength(2);
    expect(response.body.data.questions[0]).toMatchObject({
      question: draft(1).question,
      correctAnswer: draft(1).correctAnswer,
      wrongAnswers: draft(1).wrongAnswers,
      qualityScore: 9,
      primaryAssetStatus: 'NOT_REQUIRED',
      coverImageStatus: 'READY',
      coverImage: { url: '/uploads/test/ai-safe.jpg', provider: 'fake-image' },
    });
    expect(llm.calls).toHaveLength(7);
    expect(llm.calls.map((call) => call.prompt.split('\n')[0])).toEqual([
      expect.stringContaining('You are a senior Arabic quiz editor'),
      expect.stringContaining('Plan assets from the draft'),
      expect.stringContaining('Plan assets from the draft'),
      expect.stringContaining('Review only the supplied asset metadata'),
      expect.stringContaining('Review only the supplied asset metadata'),
      expect.stringContaining('Review this completed Arabic party-game draft'),
      expect.stringContaining('Review this completed Arabic party-game draft'),
    ]);
    expect(llm.calls[0].prompt).toContain('Required count: 2');
    expect(llm.calls[0].prompt).toContain('Knowledge File:');
    expect(await questions.countDocuments()).toBe(before);
    expectSafeResponse(response.body);
  });

  it('repairs exam-style wording without changing answer, difficulty, mode, assets, or persistence', async () => {
    const questions = database.models[Question.name] as Model<Question>;
    const before = await questions.countDocuments();
    const generated = {
      ...draft(1),
      question:
        'في ضوء المعلومات المذكورة عن عالم ناروتو، ما التقنية الخاصة التي يستخدمها كاكاشي لنسخ تقنيات خصومه، مع العلم أنها مرتبطة بعينه وتمنحه قدرة مميزة؟',
      correctAnswer: 'الشارينغان',
      difficulty: 'hard',
      gameMode: 'trivia',
    };
    queueSingleGeneration(generated);
    llm.enqueue({
      question: 'ما التقنية التي يستخدمها كاكاشي لنسخ تقنيات خصومه؟',
    });

    const response = await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, count: 1, difficulty: 'hard' })
      .expect(201);

    expect(response.body.data.questions[0]).toMatchObject({
      question: 'ما التقنية التي يستخدمها كاكاشي لنسخ تقنيات خصومه؟',
      correctAnswer: 'الشارينغان',
      difficulty: 'hard',
      gameMode: 'trivia',
      coverImageStatus: 'READY',
      issues: expect.arrayContaining([
        'QUESTION_TOO_LONG',
        'QUESTION_ACADEMIC_STYLE',
        'QUESTION_WORDING_REPAIRED',
      ]),
    });
    expect(response.body.meta.wordingRepairUsed).toBe(true);
    expect(llm.calls.at(-1)?.prompt).toContain(
      'Shorten one Arabic party-game question',
    );
    expect(await questions.countDocuments()).toBe(before);
    expectSafeResponse(response.body);
  });

  it('enforces authorization and validates reviewed-generation input', async () => {
    await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .send({ categoryId })
      .expect(401);
    await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ categoryId })
      .expect(403);
    await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, count: 0 })
      .expect(400);
  });

  it('returns a safe stable error for invalid model output without persistence', async () => {
    const questions = database.models[Question.name] as Model<Question>;
    const before = await questions.countDocuments();
    llm.enqueue('not-json');
    const response = await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, count: 1 })
      .expect(500);
    expect(response.body.message).toContain(
      'LM Studio server is not running or unreachable',
    );
    expect(await questions.countDocuments()).toBe(before);
    expectSafeResponse(response.body);
  });

  it('saves reviewed drafts separately, maps responses safely, and reports duplicates', async () => {
    const payload = {
      categoryId,
      drafts: [
        {
          ...draft(9),
          primaryAssetStatus: 'READY',
          primaryAsset: {
            type: 'image',
            url: '/uploads/test/persisted.jpg',
            localPath: '/Users/private/hidden.jpg',
            provider: 'fake-image',
            source: 'integration-fixture',
          },
          aiMetadata: { model: 'fake', fixture: true },
          gameplayMetadata: { interaction: 'trivia' },
        },
      ],
    };
    const saved = await request(app.getHttpServer())
      .post('/admin/ai-generator/save-drafts')
      .set(auth())
      .send(payload)
      .expect(201);
    expect(saved.body).toMatchObject({ savedCount: 1, failedCount: 0 });
    expect(saved.body.savedQuestions[0]).toMatchObject({
      question: draft(9).question,
      source: 'ai',
      status: 'draft',
      primaryAsset: { url: '/uploads/test/persisted.jpg' },
      gameplayMetadata: { interaction: 'trivia' },
    });
    expect(saved.body.savedQuestions[0]).not.toHaveProperty('aiMetadata');
    expectSafeResponse(saved.body);

    const duplicate = await request(app.getHttpServer())
      .post('/admin/ai-generator/save-drafts')
      .set(auth())
      .send(payload)
      .expect(201);
    expect(duplicate.body).toMatchObject({ savedCount: 0, failedCount: 1 });
    await request(app.getHttpServer())
      .post('/admin/ai-generator/save-drafts')
      .send(payload)
      .expect(401);
  });

  it('repairs duplicate, missing, and correct-answer wrong answers through the provider boundary', async () => {
    const invalid = {
      ...draft(20),
      wrongAnswers: ['الإجابة 20', 'مكرر', 'مكرر'],
    };
    queueSingleGeneration(invalid);
    const provider = mockProviderContent({
      wrongAnswers: ['بديل أول', 'بديل ثان', 'بديل ثالث'],
    });
    const response = await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, count: 1 })
      .expect(201);
    expect(response.body.data.questions[0]).toMatchObject({
      wrongAnswers: ['بديل أول', 'بديل ثان', 'بديل ثالث'],
    });
    expect(response.body.data.questions[0].issues).toEqual(
      expect.arrayContaining([
        'correctAnswer appears in wrongAnswers',
        'wrongAnswers are duplicated',
        'wrongAnswers repaired',
      ]),
    );
    expect(response.body.meta.wrongAnswerRepairUsed).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
    expectSafeResponse(response.body);
  });

  it('preserves repair issues when the provider repair is incomplete', async () => {
    queueSingleGeneration({ ...draft(21), wrongAnswers: ['وحيد'] });
    mockProviderContent({ wrongAnswers: ['واحد فقط'] });
    const response = await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, count: 1 })
      .expect(201);
    expect(response.body.data.questions[0].wrongAnswers).toEqual(['وحيد']);
    expect(response.body.data.questions[0].issues).toEqual(
      expect.arrayContaining([
        'wrongAnswers must have exactly 3 items',
        expect.stringContaining('wrongAnswers repair failed'),
      ]),
    );
    expectSafeResponse(response.body);
  });

  it('preserves the current empty wrong-answer behavior without a repair call', async () => {
    queueSingleGeneration({ ...draft(25), wrongAnswers: [] });
    const provider = jest.spyOn(global, 'fetch');
    const response = await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, count: 1 })
      .expect(201);
    expect(response.body.data.questions[0].wrongAnswers).toEqual([]);
    expect(response.body.meta.wrongAnswerRepairUsed).toBe(false);
    expect(provider).not.toHaveBeenCalled();
    expectSafeResponse(response.body);
  });

  it('normalizes trivia-like gameplay and canonically plans a missing identifying asset request', async () => {
    queueSingleGeneration({
      ...draft(22),
      gameMode: 'identifyCharacter',
      type: 'text',
      assetRequest: null,
    });
    const trivia = await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, count: 1 })
      .expect(201);
    expect(trivia.body.data.questions[0]).toMatchObject({
      gameMode: 'trivia',
      type: 'text',
      wasGameplayAutoFixed: true,
      primaryAssetStatus: 'NOT_REQUIRED',
    });

    llm.reset();
    queueSingleGeneration({
      ...draft(23),
      question: 'تعرف على هذه الشخصية من الصورة المعروضة',
      gameMode: 'identifyCharacter',
      type: 'image',
      assetRequest: null,
    });
    const missing = await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, count: 1 })
      .expect(201);
    expect(missing.body.data.questions[0].issues).toEqual(
      expect.arrayContaining([
        'question type image is not supported by gameplayConfig',
      ]),
    );
    expect(missing.body.data.questions[0]).toMatchObject({
      primaryAssetStatus: 'READY',
      primaryAssetRequest: {
        canonicalEntity: draft(23).correctAnswer,
        entity: draft(23).correctAnswer,
      },
    });
    expectSafeResponse(missing.body);
  });

  it('normalizes timeout and unavailable provider failures without persistence or assets', async () => {
    const questions = database.models[Question.name] as Model<Question>;
    const before = await questions.countDocuments();
    llm.enqueue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    const timeout = await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, count: 1 })
      .expect(500);
    expect(timeout.body.message).toContain('LM Studio request timed out');
    expect(llm.calls).toHaveLength(1);
    expect(assets.process).not.toHaveBeenCalled();
    expectSafeResponse(timeout.body);

    llm.reset();
    jest.restoreAllMocks();
    llm.enqueue(new TypeError('fetch failed'));
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    const unavailable = await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, count: 1 })
      .expect(500);
    expect(unavailable.body.message).toContain(
      'LM Studio server is not running or unreachable',
    );
    expect(llm.calls).toHaveLength(1);
    expect(await questions.countDocuments()).toBe(before);
    expectSafeResponse(unavailable.body);
  });

  it('represents primary and cover asset failures independently', async () => {
    await database
      .collection('categories')
      .updateOne(
        { _id: new Types.ObjectId(categoryId) },
        { $set: { 'gameplayConfig.supportedAssetTypes': ['text', 'image'] } },
      );
    const primaryPlan = {
      assetType: 'image',
      type: 'image',
      entity: 'شخصية اختبار',
      purpose: 'gameplay',
    };
    queueSingleGeneration(
      {
        ...draft(24),
        gameMode: 'identifyCharacter',
        type: 'image',
        assetRequest: primaryPlan,
      },
      primaryPlan,
    );
    assets.process.mockImplementation(
      async (requestValue?: Record<string, unknown>) => ({
        assetStatus: 'FAILED',
        assetFailureReason:
          requestValue?.purpose === 'decorative'
            ? 'cover unavailable'
            : 'primary unavailable',
        assetFailureStep: 'fake-resolution',
        assetFailureDiagnostics: {
          localPath: '/Users/private/result',
          safeCode: 'NO_RESULT',
        },
      }),
    );
    const response = await request(app.getHttpServer())
      .post('/admin/ai-generator/generate-reviewed')
      .set(auth())
      .send({ categoryId, count: 1 })
      .expect(201);
    expect(response.body.data.questions[0]).toMatchObject({
      primaryAssetStatus: 'FAILED',
      assetFailureReason: 'primary unavailable',
      assetFailureStep: 'fake-resolution',
      coverImageStatus: 'FAILED',
      coverImageFailureReason: 'cover unavailable',
      question: draft(24).question,
      qualityScore: 9,
    });
    expectSafeResponse(response.body);
    await database
      .collection('categories')
      .updateOne(
        { _id: new Types.ObjectId(categoryId) },
        { $set: { 'gameplayConfig.supportedAssetTypes': ['text'] } },
      );
  });

  it('keeps the legacy AI endpoint authenticated, typed, safe, and persistent', async () => {
    await request(app.getHttpServer())
      .post('/ai-agent/generate-questions')
      .send({ categoryId, count: 1 })
      .expect(401);
    const questions = database.models[Question.name] as Model<Question>;
    const before = await questions.countDocuments();
    const provider = mockProviderContent([
      {
        question: 'ما هو السؤال القديم المتوافق مع واجهة HTTP؟',
        answer: 'إجابة قديمة',
        explanation: 'شرح متوافق وآمن',
        difficulty: 'medium',
        points: 400,
        type: 'text',
      },
    ]);
    const response = await request(app.getHttpServer())
      .post('/ai-agent/generate-questions')
      .set(auth())
      .send({ categoryId, count: 1 })
      .expect(201);
    expect(response.body).toMatchObject({
      statusCode: 200,
      count: 1,
      message: 'Questions generated successfully',
    });
    expect(response.body.data).toHaveLength(1);
    expect(await questions.countDocuments()).toBe(before + 1);
    expect(provider).toHaveBeenCalledTimes(1);
    expectSafeResponse(response.body);
  });

  it('reports partial save-draft failures and protects debug-tool diagnostics', async () => {
    const partial = await request(app.getHttpServer())
      .post('/admin/ai-generator/save-drafts')
      .set(auth())
      .send({
        categoryId,
        drafts: [
          { ...draft(30), question: 'سؤال صالح ضمن حفظ جزئي متكامل؟' },
          { correctAnswer: 'إجابة بلا سؤال' },
        ],
      })
      .expect(201);
    expect(partial.body).toMatchObject({ savedCount: 1, failedCount: 1 });
    expect(partial.body.failures[0]).toMatchObject({
      index: 1,
      reason: 'Missing question',
    });
    expectSafeResponse(partial.body);

    await request(app.getHttpServer())
      .get('/admin/ai-generator/debug-tools')
      .expect(401);
    await request(app.getHttpServer())
      .get('/admin/ai-generator/debug-tools')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    const diagnostics = await request(app.getHttpServer())
      .get('/admin/ai-generator/debug-tools')
      .set(auth())
      .expect(200);
    expect(diagnostics.body).toEqual({
      ffmpegAvailable: expect.any(Boolean),
      ytDlpAvailable: expect.any(Boolean),
      ffmpegVersion: expect.any(String),
      ytDlpVersion: expect.any(String),
    });
    expect(JSON.stringify(diagnostics.body)).not.toMatch(
      /ENOENT|spawn|\/Users\/|localPath|stack|command|apiKey|token/i,
    );
  });
});
