import { ConfigModule } from '@nestjs/config';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { resolve } from 'path';
import { ContentEngineModule } from '../../src/modules/content-engine/content-engine.module';
import { DeterministicScreenService } from '../../src/modules/content-engine/application/deterministic-screen.service';
import { ContentEngineReviewService } from '../../src/modules/content-engine/application/content-engine-review.service';
import { HistoricalCoverageService } from '../../src/modules/content-engine/application/historical-coverage.service';
import { ENGINE_AI_PROVIDER } from '../../src/modules/content-engine/domain/content-engine.constants';
import { isolatedTestDatabaseUri } from '../helpers/test-database';

describe('historical alias inventory with MongoDB', () => {
  let moduleRef: TestingModule;
  let db: Connection;
  let screen: DeterministicScreenService;
  let review: ContentEngineReviewService;
  let coverage: HistoricalCoverageService;
  const worldId = new Types.ObjectId();
  const scopeId = new Types.ObjectId();
  const otherWorldId = new Types.ObjectId();
  const otherScopeId = new Types.ObjectId();
  const currentJob = new Types.ObjectId();
  const historicJob = new Types.ObjectId();
  const readyId = new Types.ObjectId();
  const draft = (prompt: string) => ({
    prompt: { ar: prompt },
    answerPayload: {
      mode: 'multiple_choice',
      options: [
        { id: 'a', label: { ar: 'ليفربول' } },
        { id: 'b', label: { ar: 'أرسنال' } },
      ],
      correctOptionId: 'a',
    },
  });
  const actor = {
    id: 'reviewer',
    email: 'reviewer@example.test',
    role: 'admin',
  } as never;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({ ENGINE_AUTHORING_ROOT: resolve(__dirname, '../../..') }),
          ],
        }),
        MongooseModule.forRoot(isolatedTestDatabaseUri('historical-alias')),
        ContentEngineModule,
      ],
    })
      .overrideProvider(ENGINE_AI_PROVIDER)
      .useValue(null)
      .compile();
    db = moduleRef.get(getConnectionToken());
    await Promise.all(db.modelNames().map((name) => db.model(name).init()));
    screen = moduleRef.get(DeterministicScreenService);
    review = moduleRef.get(ContentEngineReviewService);
    coverage = moduleRef.get(HistoricalCoverageService);
  });

  afterAll(async () => {
    await db?.dropDatabase();
    await moduleRef?.close();
  });

  beforeEach(async () => {
    for (const { name } of await db.db!.listCollections().toArray()) {
      await db.collection(name).deleteMany({});
    }
    await db.collection('worlds').insertMany([
      { _id: worldId, slug: 'test', name: 'عالم كرة القدم', status: 'active' },
      {
        _id: otherWorldId,
        slug: 'other-world',
        name: 'Other World',
        status: 'active',
      },
    ]);
    await db.collection('scopes').insertMany([
      {
        _id: scopeId,
        worldId,
        slug: 'scope-1785790447091',
        name: 'الدوري الانجليزي',
        status: 'active',
        excludedChallengeTypeIds: [],
      },
      {
        _id: otherScopeId,
        worldId: otherWorldId,
        slug: 'premier-league',
        name: 'Other League',
        status: 'active',
      },
    ]);
    await db.collection('challenge_types').insertOne({
      slug: 'read-your-opponent',
      name: 'RYO',
      status: 'active',
      family: 'ryo',
      itemStructure: 'discrete_triple',
      answerMode: 'ryo',
    });
    await db.collection('engine_jobs').insertMany([
      {
        _id: currentJob,
        requestHash: 'alias-current',
        worldKey: 'football',
        scopeKey: 'premier-league',
        mechanicKey: 'read-your-opponent',
        status: 'awaiting_review',
      },
      {
        _id: historicJob,
        requestHash: 'alias-historical',
        worldKey: 'test',
        scopeKey: 'scope-1785790447091',
        mechanicKey: 'read-your-opponent',
        status: 'awaiting_review',
      },
    ]);
    await db.collection('content_items').insertMany([
      {
        _id: readyId,
        scopeId,
        status: 'ready',
        ...draft('من فاز بالدوري الإنجليزي عام ألفين؟'),
      },
      {
        scopeId: otherScopeId,
        status: 'ready',
        ...draft('سؤال خاص بعالم آخر تماماً؟'),
      },
    ]);
    await db.collection('engine_candidates').insertMany([
      {
        candidateId: 'approved-historical',
        jobId: String(historicJob),
        reviewStatus: 'approved',
        publishedContentItemId: null,
        reviewDecision: {
          decision: 'approved',
          reviewerId: 'reviewer',
          reviewerEmail: 'reviewer@example.test',
          revision: 1,
        },
        reviewEvents: [
          {
            action: 'approved',
            actorId: 'reviewer',
            actorEmail: 'reviewer@example.test',
            revision: 1,
          },
        ],
        draft: draft('أي نادٍ حقق اللقب التاريخي؟'),
      },
      {
        candidateId: 'rescreen-target',
        jobId: String(currentJob),
        ordinal: 0,
        status: 'awaiting_review',
        reviewStatus: 'pending',
        reviewRevision: 0,
        contextHash: 'fixture',
        promptVersion: 'fixture',
        provider: 'fake',
        model: 'fake',
        attempt: 1,
        factualClaims: [],
        reviewEvents: [],
        writeEpoch: 1,
        findings: [
          {
            code: 'HISTORICAL_INVENTORY_NOT_CONFIGURED',
            severity: 'warning',
            message: 'not checked',
          },
        ],
        draft: draft('سؤال خاص بعالم آخر تماماً؟'),
      },
    ]);
  });

  it('loads READY content and approved alias jobs, detects duplicates, and excludes another World', async () => {
    const session = screen.createSession({
      worldKey: 'football',
      scopeKey: 'premier-league',
    });
    const result = await screen.loadHistoricalScope(
      { worldKey: 'football', scopeKey: 'premier-league' },
      session,
    );
    expect(result).toMatchObject({
      status: 'COMPLETE',
      canonicalCount: 1,
      candidateCount: 1,
    });
    expect(session.historicalRecords.map((r) => r.id)).toEqual(
      expect.arrayContaining([String(readyId), 'approved-historical']),
    );
    const ready = screen.screen(
      draft('من فاز بالدوري الإنجليزي عام ألفين؟'),
      null,
      { session, worldKey: 'football', scopeKey: 'premier-league' },
    );
    expect(ready.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DUPLICATE_HISTORICAL_CONTENT' }),
      ]),
    );
    const approved = screen.screen(draft('أي نادٍ حقق اللقب التاريخي؟'), null, {
      session,
      worldKey: 'football',
      scopeKey: 'premier-league',
    });
    expect(approved.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DUPLICATE_APPROVED_CANDIDATE' }),
      ]),
    );
    const other = screen.screen(draft('سؤال خاص بعالم آخر تماماً؟'), null, {
      session,
      worldKey: 'football',
      scopeKey: 'premier-league',
    });
    expect(
      other.findings.some((f) => f.code.startsWith('DUPLICATE_HISTORICAL')),
    ).toBe(false);
  });

  it('reads uncommitted inventory through the caller transaction session', async () => {
    const mongoSession = await db.startSession();
    try {
      mongoSession.startTransaction();
      await db.collection('content_items').insertOne(
        {
          scopeId,
          status: 'ready',
          ...draft('محتوى مرئي داخل المعاملة فقط؟'),
        },
        { session: mongoSession },
      );
      const result = await screen.loadHistoricalScope({
        worldKey: 'football',
        scopeKey: 'premier-league',
        mongoSession,
      });
      expect(result).toMatchObject({ status: 'COMPLETE', canonicalCount: 2 });
      await mongoSession.abortTransaction();
    } finally {
      await mongoSession.endSession();
    }
  });

  it('keeps rescreen incomplete for conflicting aliases and clears it after a complete lookup', async () => {
    const conflictId = new Types.ObjectId();
    await db.collection('scopes').insertOne({
      _id: conflictId,
      worldId,
      slug: 'premier-league',
      name: 'Conflicting League',
      status: 'active',
    });
    const first = await review.rescreenCandidate('rescreen-target', 0, actor);
    expect(first.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'HISTORICAL_INVENTORY_NOT_CONFIGURED',
        }),
      ]),
    );
    await db.collection('scopes').deleteOne({ _id: conflictId });
    const second = await review.rescreenCandidate('rescreen-target', 1, actor);
    expect(
      second.findings.some((f) => f.code.startsWith('HISTORICAL_INVENTORY_')),
    ).toBe(false);
    expect(
      second.findings.some((f) => f.code.startsWith('DUPLICATE_HISTORICAL')),
    ).toBe(false);
  });

  it('finds approved jobs using unlisted catalog slugs resolved by name', async () => {
    await db
      .collection('worlds')
      .updateOne({ _id: worldId }, { $set: { slug: 'old-football' } });
    await db
      .collection('scopes')
      .updateOne({ _id: scopeId }, { $set: { slug: 'old-league' } });
    await db
      .collection('engine_jobs')
      .updateOne(
        { _id: historicJob },
        { $set: { worldKey: 'old-football', scopeKey: 'old-league' } },
      );
    const session = screen.createSession({
      worldKey: 'football',
      scopeKey: 'premier-league',
    });
    const result = await screen.loadHistoricalScope(
      { worldKey: 'football', scopeKey: 'premier-league' },
      session,
    );
    expect(result).toMatchObject({ status: 'COMPLETE', candidateCount: 1 });
    const duplicate = screen.screen(
      draft('أي نادٍ حقق اللقب التاريخي؟'),
      null,
      { session, worldKey: 'football', scopeKey: 'premier-league' },
    );
    expect(duplicate.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DUPLICATE_APPROVED_CANDIDATE' }),
      ]),
    );
    const reverse = await screen.loadHistoricalScope({
      worldKey: 'old-football',
      scopeKey: 'old-league',
    });
    expect(reverse).toMatchObject({ status: 'COMPLETE', candidateCount: 1 });
  });

  it('fails closed when the number of approved candidates exceeds the bound', async () => {
    await db.collection('engine_candidates').insertMany(
      Array.from({ length: 1000 }, (_, i) => ({
        candidateId: `overflow-${i}`,
        ordinal: i + 1,
        jobId: String(historicJob),
        reviewStatus: 'approved',
      })),
    );
    const result = await screen.loadHistoricalScope({
      worldKey: 'football',
      scopeKey: 'premier-league',
    });
    expect(result.status).not.toBe('COMPLETE');
  });

  it.each([
    [
      'unknown retired target',
      { jobId: String(historicJob) },
      { worldKey: 'retired-unknown' },
    ],
    ['missing job', { jobId: String(new Types.ObjectId()) }, null],
  ])(
    'blocks screening and coverage for %s',
    async (_name, candidateChange, jobChange) => {
      await db
        .collection('engine_candidates')
        .updateOne(
          { candidateId: 'approved-historical' },
          { $set: candidateChange },
        );
      if (jobChange)
        await db
          .collection('engine_jobs')
          .updateOne({ _id: historicJob }, { $set: jobChange });
      expect(
        (
          await screen.loadHistoricalScope({
            worldKey: 'football',
            scopeKey: 'premier-league',
          })
        ).status,
      ).not.toBe('COMPLETE');
      await expect(
        coverage.getCoverage({
          worldKey: 'football',
          scopeKey: 'premier-league',
        }),
      ).rejects.toThrow();
    },
  );

  it('blocks an unpublished approved candidate with a publication row', async () => {
    await db.collection('engine_draft_publications').insertOne({
      candidateId: 'approved-historical',
      jobId: String(historicJob),
      contentItemId: String(new Types.ObjectId()),
      reviewRevision: 1,
    });
    expect(
      (
        await screen.loadHistoricalScope({
          worldKey: 'football',
          scopeKey: 'premier-league',
        })
      ).status,
    ).not.toBe('COMPLETE');
    await expect(
      coverage.getCoverage({
        worldKey: 'football',
        scopeKey: 'premier-league',
      }),
    ).rejects.toThrow('publication state is inconsistent');
  });

  it.each(['deleted', 'moved', 'retired-catalog', 'archived'])(
    'does not globally block for a published item that was %s',
    async (scenario) => {
      const itemId = new Types.ObjectId();
      const publishedJob = new Types.ObjectId();
      await db.collection('engine_jobs').insertOne({
        _id: publishedJob,
        worldKey: 'other-world',
        scopeKey: 'premier-league',
        mechanicKey: 'read-your-opponent',
      });
      await db.collection('engine_candidates').insertOne({
        candidateId: 'published-old',
        jobId: String(publishedJob),
        reviewStatus: 'approved',
        publishedContentItemId: String(itemId),
      });
      await db.collection('engine_draft_publications').insertOne({
        candidateId: 'published-old',
        jobId: String(publishedJob),
        contentItemId: String(itemId),
        reviewRevision: 1,
      });
      if (scenario === 'retired-catalog') {
        await db
          .collection('worlds')
          .updateOne(
            { _id: otherWorldId },
            { $set: { slug: 'renamed-world' } },
          );
      }
      await db.collection('content_items').insertOne({
        _id: itemId,
        scopeId,
        status: 'draft',
        ...draft('سؤال قديم عن فريق آخر؟'),
      });
      if (scenario === 'deleted')
        await db.collection('content_items').deleteOne({ _id: itemId });
      if (scenario === 'moved')
        await db
          .collection('content_items')
          .updateOne({ _id: itemId }, { $set: { scopeId: otherScopeId } });
      if (scenario === 'archived')
        await db
          .collection('content_items')
          .updateOne({ _id: itemId }, { $set: { status: 'archived' } });
      const screening = screen.createSession({
        worldKey: 'football',
        scopeKey: 'premier-league',
      });
      expect(
        (
          await screen.loadHistoricalScope(
            { worldKey: 'football', scopeKey: 'premier-league' },
            screening,
          )
        ).status,
      ).toBe('COMPLETE');
      if (scenario === 'retired-catalog') {
        expect(
          screen
            .screen(draft('سؤال قديم عن فريق آخر؟'), null, {
              worldKey: 'football',
              scopeKey: 'premier-league',
              session: screening,
            })
            .findings.some((f) => f.code === 'DUPLICATE_HISTORICAL_DRAFT'),
        ).toBe(true);
      }
      if (scenario === 'moved') {
        const other = screen.createSession({
          worldKey: 'other-world',
          scopeKey: 'premier-league',
        });
        expect(
          (
            await screen.loadHistoricalScope(
              { worldKey: 'other-world', scopeKey: 'premier-league' },
              other,
            )
          ).status,
        ).toBe('COMPLETE');
        expect(
          screen
            .screen(draft('سؤال قديم عن فريق آخر؟'), null, {
              worldKey: 'other-world',
              scopeKey: 'premier-league',
              session: other,
            })
            .findings.some((f) => f.code === 'DUPLICATE_HISTORICAL_DRAFT'),
        ).toBe(true);
      }
    },
  );

  it('does not count more than 1000 previously published candidates against the unpublished bound', async () => {
    const published = Array.from({ length: 1001 }, (_, i) => ({
      candidateId: `old-published-${i}`,
      ordinal: i + 1,
      jobId: String(historicJob),
      reviewStatus: 'approved',
      publishedContentItemId: String(new Types.ObjectId()),
    }));
    await db.collection('engine_candidates').insertMany(published);
    await db.collection('engine_draft_publications').insertMany(
      published.map((c) => ({
        candidateId: c.candidateId,
        jobId: c.jobId,
        contentItemId: c.publishedContentItemId,
        reviewRevision: 1,
      })),
    );
    expect(
      (
        await screen.loadHistoricalScope({
          worldKey: 'football',
          scopeKey: 'premier-league',
        })
      ).status,
    ).toBe('COMPLETE');
    await expect(
      coverage.getCoverage({
        worldKey: 'football',
        scopeKey: 'premier-league',
      }),
    ).resolves.toBeDefined();
  });

  it('excludes a verified other-World approval and fails closed for an ambiguous historical target', async () => {
    await db
      .collection('engine_jobs')
      .updateOne(
        { _id: historicJob },
        { $set: { worldKey: 'other-world', scopeKey: 'premier-league' } },
      );
    const session = screen.createSession({
      worldKey: 'football',
      scopeKey: 'premier-league',
    });
    expect(
      (
        await screen.loadHistoricalScope(
          { worldKey: 'football', scopeKey: 'premier-league' },
          session,
        )
      ).candidateCount,
    ).toBe(0);
    expect(
      session.historicalRecords.some((r) => r.id === 'approved-historical'),
    ).toBe(false);
    await db.collection('scopes').insertOne({
      _id: new Types.ObjectId(),
      worldId: otherWorldId,
      slug: 'conflicting-league',
      name: 'premier-league',
      status: 'active',
    });
    expect(
      (
        await screen.loadHistoricalScope({
          worldKey: 'football',
          scopeKey: 'premier-league',
        })
      ).status,
    ).not.toBe('COMPLETE');
  });

  it('sees an unresolved approval inserted inside the caller transaction', async () => {
    const mongoSession = await db.startSession();
    try {
      mongoSession.startTransaction();
      await db
        .collection('engine_candidates')
        .updateOne(
          { candidateId: 'approved-historical' },
          { $set: { jobId: String(new Types.ObjectId()) } },
          { session: mongoSession },
        );
      expect(
        (
          await screen.loadHistoricalScope({
            worldKey: 'football',
            scopeKey: 'premier-league',
            mongoSession,
          })
        ).status,
      ).not.toBe('COMPLETE');
      await mongoSession.abortTransaction();
    } finally {
      await mongoSession.endSession();
    }
  });
});
