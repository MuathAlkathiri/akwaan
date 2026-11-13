import { ConfigModule } from '@nestjs/config';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { resolve as resolvePath } from 'path';
import { ContentEngineModule } from '../../src/modules/content-engine/content-engine.module';
import { AuthoringContextService } from '../../src/modules/content-engine/application/authoring-context.service';
import {
  DeterministicScreenService,
  hasIncompleteHistoricalVerification,
} from '../../src/modules/content-engine/application/deterministic-screen.service';
import { EngineJobAdminService } from '../../src/modules/content-engine/application/engine-job-admin.service';
import { GenerationPlannerService } from '../../src/modules/content-engine/application/generation-planner.service';
import { HistoricalCoverageService } from '../../src/modules/content-engine/application/historical-coverage.service';
import {
  ENGINE_AI_PROVIDER,
  MICROS_PER_SAR,
} from '../../src/modules/content-engine/domain/content-engine.constants';
import { FakeAiProvider } from '../../src/modules/content-engine/testing/fake-ai.provider';
import { isolatedTestDatabaseUri } from '../helpers/test-database';

/**
 * C-3 — historical inventory bounds at 499 / 500 / 501 / 1000 records.
 *
 * The duplicate screen loads a Scope's READY+DRAFT canonical items oldest
 * first, 500 at most (limit-plus-one detects truncation). Coverage reads every
 * item up to a 1000 safety ceiling. The contract under test: a truncated
 * inventory is never reported or used as complete — generation and duplicate
 * clearance fail closed instead of deciding on a partial corpus.
 */
describe('C-3 historical inventory bounds (real MongoDB)', () => {
  const TARGET = {
    mechanicKey: 'read-your-opponent',
    worldKey: 'puzzles',
    scopeKey: 'wordplay-letters',
    targetCount: 3,
  };
  let moduleRef: TestingModule;
  let database: Connection;
  let screen: DeterministicScreenService;
  let admin: EngineJobAdminService;
  let coverage: HistoricalCoverageService;
  let planner: GenerationPlannerService;
  let mechanicProfile: string;
  let worldId: Types.ObjectId;
  let scopeId: Types.ObjectId;

  const draftFor = (index: number) => ({
    prompt: { ar: `ما الكلمة المقصودة في اللغز التاريخي ذي الرقم ${index}؟` },
    answerPayload: {
      mode: 'multiple_choice',
      options: [
        { id: 'a', label: { ar: `جواب ${index}` } },
        { id: 'b', label: { ar: `بديل أول ${index}` } },
        { id: 'c', label: { ar: `بديل ثان ${index}` } },
        { id: 'd', label: { ar: `بديل ثالث ${index}` } },
      ],
      correctOptionId: 'a',
    },
  });

  const BASE_TIME = Date.UTC(2026, 0, 1);
  /** The screen's finding for an exact copy of a loaded historical item. */
  const DUPLICATE = 'DUPLICATE_HISTORICAL_CONTENT';

  /** `count` READY items in the Scope, plus noise that must be filtered out. */
  const seedScope = async (count: number) => {
    await database.collection('content_items').deleteMany({});
    // Inserted newest-first so natural order disagrees with createdAt order.
    const items = Array.from({ length: count }, (_, i) => ({
      worldId,
      scopeId,
      status: 'ready',
      ...draftFor(i),
      createdAt: new Date(BASE_TIME + i * 1000),
    })).reverse();
    await database.collection('content_items').insertMany(items);
    await database.collection('content_items').insertMany([
      // Archived items are not live inventory for duplicate screening.
      ...[0, 1, 2].map((i) => ({
        worldId,
        scopeId,
        status: 'archived',
        ...draftFor(100_000 + i),
        createdAt: new Date(BASE_TIME - 1000 * (i + 1)),
      })),
      // Another Scope's items never count towards this Scope.
      ...[0, 1, 2, 3, 4].map((i) => ({
        worldId,
        scopeId: new Types.ObjectId(),
        status: 'ready',
        ...draftFor(200_000 + i),
        createdAt: new Date(BASE_TIME - 1000 * (i + 10)),
      })),
    ]);
  };

  /** Screens an exact copy of item `index` the way the orchestrator does. */
  const screenCopyOf = async (index: number) => {
    const session = screen.createSession({
      worldKey: TARGET.worldKey,
      scopeKey: TARGET.scopeKey,
    });
    const load = await screen.loadHistoricalScope(
      { worldKey: TARGET.worldKey, scopeKey: TARGET.scopeKey },
      session,
    );
    screen.beginBatch('', mechanicProfile, {
      scopeKey: TARGET.scopeKey,
      worldKey: TARGET.worldKey,
      session,
    });
    const result = screen.screen(draftFor(index), null, {
      candidateId: `probe-${index}`,
      scopeKey: TARGET.scopeKey,
      worldKey: TARGET.worldKey,
      session,
    });
    return { load, codes: result.findings.map((f) => f.code), result };
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              CONTENT_ENGINE_ENABLED: 'true',
              ENGINE_AUTHORING_ROOT: resolvePath(__dirname, '../../..'),
              AI_PROVIDER: 'fake',
              ENGINE_PROVIDER_NAME: 'fake',
              ENGINE_GENERATION_MODEL: 'fake-model',
              ENGINE_MODEL_PRICING: JSON.stringify({
                'fake/fake-model': {
                  inputMicrosPerMillion: MICROS_PER_SAR,
                  outputMicrosPerMillion: MICROS_PER_SAR,
                },
              }),
              ENGINE_MONTHLY_CAP_SAR: '100',
              ENGINE_BATCH_CAP_SAR: '25',
            }),
          ],
        }),
        MongooseModule.forRoot(isolatedTestDatabaseUri('engine-hist-bounds')),
        ContentEngineModule,
      ],
    })
      .overrideProvider(ENGINE_AI_PROVIDER)
      .useValue(new FakeAiProvider())
      .compile();
    database = moduleRef.get<Connection>(getConnectionToken());
    screen = moduleRef.get(DeterministicScreenService);
    admin = moduleRef.get(EngineJobAdminService);
    coverage = moduleRef.get(HistoricalCoverageService);
    planner = moduleRef.get(GenerationPlannerService);
    mechanicProfile = moduleRef
      .get(AuthoringContextService)
      .resolve(TARGET).mechanic;
    await database.dropDatabase();
    await database.syncIndexes();
    worldId = new Types.ObjectId();
    scopeId = new Types.ObjectId();
    await database.collection('worlds').insertOne({
      _id: worldId,
      slug: TARGET.worldKey,
      name: TARGET.worldKey,
      status: 'active',
    });
    await database.collection('scopes').insertOne({
      _id: scopeId,
      worldId,
      slug: TARGET.scopeKey,
      name: TARGET.scopeKey,
      status: 'active',
    });
  }, 60_000);

  afterAll(async () => {
    await database?.dropDatabase();
    await moduleRef?.close();
  });

  describe.each([499, 500])('%i records — within the bound', (count) => {
    beforeAll(() => seedScope(count), 60_000);

    it('loads the whole live inventory as COMPLETE, excluding archived and foreign-Scope items', async () => {
      const { load } = await screenCopyOf(0);
      expect(load).toMatchObject({
        status: 'COMPLETE',
        isTruncated: false,
        canonicalCount: count,
        recordCount: count,
      });
    });

    it('detects a duplicate of both the oldest and the newest item', async () => {
      for (const index of [0, count - 1]) {
        const { codes, result } = await screenCopyOf(index);
        expect(codes).toContain(DUPLICATE);
        expect(hasIncompleteHistoricalVerification(result.findings)).toBe(
          false,
        );
      }
    });

    it('lets Preflight proceed, and coverage/planner see every item', async () => {
      const preflight = await admin.preflight(TARGET);
      expect(preflight.blockedCode).not.toBe('HISTORICAL_INVENTORY_INCOMPLETE');
      expect(preflight.submissionReady).toBe(true);
      const report = await coverage.getCoverage(TARGET);
      expect(report.totals.operationalApproved).toBe(count);
      const plan = await planner.planWithResolvedContext({
        ...TARGET,
        count: TARGET.targetCount,
      });
      expect(plan.slots).toHaveLength(TARGET.targetCount);
    });
  });

  describe.each([501, 1000])('%i records — beyond the bound', (count) => {
    beforeAll(() => seedScope(count), 60_000);

    it('reports PARTIAL with exactly the 500 oldest items loaded', async () => {
      const oldest = await screenCopyOf(0);
      expect(oldest.load).toMatchObject({
        status: 'PARTIAL',
        isTruncated: true,
        canonicalCount: 500,
      });
      expect(oldest.codes).toContain(DUPLICATE);
      // Item 499 is the 500th oldest (loaded); item 500 is the first dropped.
      expect((await screenCopyOf(499)).codes).toContain(DUPLICATE);
      expect((await screenCopyOf(500)).codes).not.toContain(DUPLICATE);
    });

    it('never clears an unloaded duplicate: the finding marks verification incomplete', async () => {
      const newest = await screenCopyOf(count - 1);
      expect(newest.codes).not.toContain(DUPLICATE);
      expect(newest.codes).toContain('HISTORICAL_INVENTORY_PARTIAL');
      expect(hasIncompleteHistoricalVerification(newest.result.findings)).toBe(
        true,
      );
    });

    it('blocks Preflight fail-closed; coverage counts every item or refuses above its own ceiling', async () => {
      const preflight = await admin.preflight(TARGET);
      expect(preflight.submissionReady).toBe(false);
      expect(preflight.blockedCode).toBe('HISTORICAL_INVENTORY_INCOMPLETE');
      // Coverage counts every item in the Scope, archived included, against
      // its own 1000 ceiling — and throws rather than report a partial count.
      const scopeTotal = count + 3;
      if (scopeTotal <= 1000) {
        const report = await coverage.getCoverage(TARGET);
        expect(report.totals.operationalApproved).toBe(count);
      } else {
        await expect(coverage.getCoverage(TARGET)).rejects.toThrow(
          'Historical coverage items exceed safety limit',
        );
      }
    });
  });
});
