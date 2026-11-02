import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { AiProvider } from '../../src/modules/ai-agent/domain/ai-provider.interface';
import { LibraryImportService } from '../../src/modules/content-engine/application/library-import.service';
import { ENGINE_AI_PROVIDER } from '../../src/modules/content-engine/domain/content-engine.constants';
import {
  isLibraryRowGenerationEligible,
  LIBRARY_ANCHOR_COLUMNS,
  LIBRARY_EXAMPLE_COLUMNS,
  LibraryRow,
  mapLibrarySheetRow,
} from '../../src/modules/content-engine/domain/library-row';
import {
  LibraryWorkbook,
  readLibraryWorkbook,
} from '../../src/modules/content-engine/infrastructure/library-workbook.reader';
import { EngineLibraryHookDocument } from '../../src/modules/content-engine/schemas/engine-library-hook.schema';
import { EngineLibraryRowDocument } from '../../src/modules/content-engine/schemas/engine-library-row.schema';
import { FakeAiProvider } from '../../src/modules/content-engine/testing/fake-ai.provider';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { loginForToken } from '../helpers/auth-helper';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  isolatedTestDatabaseUri,
  resetTestDatabase,
} from '../helpers/test-database';

/**
 * The verified library against real Mongo: the import, then a request split into
 * two jobs and driven over Admin HTTP to a DRAFT. Unit tests prove the rules on
 * fakes; this proves upserts, indexes, transactions and the HTTP path hold them.
 *
 * The provider is `FakeAiProvider`, so no paid call is reachable.
 */

const SUITE = 'content-library';
const FIXTURE = join(
  __dirname,
  '../../src/modules/content-engine/testing/fixtures/akwaan_library_v1.xlsx',
);

const TARGET = {
  mechanicKey: 'read-your-opponent',
  worldKey: 'video-games',
  scopeKey: 'overwatch',
};

const pinnedRow = (id: string, question: string, answer: string): LibraryRow =>
  mapLibrarySheetRow({
    id,
    question,
    world: TARGET.worldKey,
    scope: TARGET.scopeKey,
    scope_status: 'MATCH',
    akwaan_fit: 'RYO',
    asof_needed: 'N',
    role: 'FACT_SEED',
    review_status: 'APPROVED',
    verified_answer: answer,
    source_url: 'https://example.test/one | https://example.test/two',
    verified_on: '2026-11-01',
  });

const ROWS = [
  pinnedRow('LIB-9001', 'أي بطل يملك قدرة الشفاء الجماعي في أوفرواتش؟', 'مرسي'),
  pinnedRow('LIB-9002', 'أي بطل يقود الدبابة ذات الدرع الدائري؟', 'راينهارت'),
  pinnedRow(
    'LIB-9003',
    'أي خريطة تدور أحداثها في مصر القديمة؟',
    'تمبل أوف أنوبيس',
  ),
  pinnedRow('LIB-9004', 'أي بطل يحمل قوسًا وسهامًا صوتية؟', 'هانزو'),
];

describe('Verified question library on real Mongo', () => {
  let app: INestApplication;
  let database: Connection;
  let adminToken: string;
  let library: LibraryImportService;
  let workbook: LibraryWorkbook;
  let fake: FakeAiProvider;

  const api = () => request(app.getHttpServer());
  const asAdmin = <T extends request.Test>(value: T): T =>
    value.set('Authorization', `Bearer ${adminToken}`) as T;
  const rows = () => database.collection('engine_library_rows');

  /** Answers an anchored call by slot, so each behaviour lands on one candidate. */
  /** Every anchored Closest slot keeps the row's scale and answer. */
  const respondClosest = (prompt: string): string => {
    const count = Number(/Author exactly (\d+) candidate/.exec(prompt)![1]);
    const anchored = prompt.includes('## LIBRARY-ANCHORED SLOTS');
    return JSON.stringify({
      candidates: Array.from({ length: count }, (_, slotIndex) => ({
        ...(anchored ? { slotIndex } : {}),
        concept: 'A date fans can place between two releases.',
        answerBasis: 'knowledge-anchored',
        playerReasoningStrategy: 'Place it between the two known releases.',
        prompt: `متى ظهرت الخريطة الجديدة في الإصدار رقم ${slotIndex + 3}؟`,
        domainDescription: 'Release years of the series.',
        min: 0,
        max: 0,
        step: 1,
        correctValue: 2019,
        stepsFromMin: 3,
        unit: null,
        displayFormat: null,
        interactionMode: 'between-anchors',
        leftAnchorId: 'ANC-1',
        rightAnchorId: 'ANC-2',
        factualClaims: ['A claim the model wrote'],
      })),
    });
  };

  const respond = (prompt: string): string => {
    if (prompt.includes('## ANCHOR BANK')) return respondClosest(prompt);
    if (!prompt.includes('## LIBRARY-ANCHORED SLOTS')) {
      const count = Number(/Author exactly (\d+) candidate/.exec(prompt)![1]);
      return JSON.stringify({
        candidates: Array.from({ length: count }, (_, index) => ({
          prompt: `أي بطل كان الأكثر اختيارًا في الموسم رقم ${index + 3}؟`,
          options: [
            { id: 'a', label: 'تريسر' },
            { id: 'b', label: 'جينجي' },
          ],
          correctOptionId: 'a',
          factualClaims: ['Tracer was the most picked hero'],
        })),
      });
    }
    const slots = [
      ...prompt.matchAll(/slotIndex (\d+):\n<library_row id="(LIB-\d+)"/g),
    ].map((match) => ({ slotIndex: Number(match[1]), libraryId: match[2] }));
    const answerOf = (libraryId: string) =>
      ROWS.find((row) => row.libraryId === libraryId)!;
    return JSON.stringify({
      candidates: slots.map(({ slotIndex, libraryId }) => {
        const row = answerOf(libraryId);
        const copies = slotIndex === 1;
        const changesAnswer = slotIndex === 2;
        return {
          slotIndex,
          prompt: copies
            ? row.questionText
            : `ما الاسم الذي يختاره معظم اللاعبين هنا بحسب السؤال ${slotIndex + 3}؟`,
          options: [
            {
              id: 'a',
              label: changesAnswer ? 'دوفا' : row.canonicalAnswer!,
            },
            { id: 'b', label: 'ليوسيو' },
          ],
          correctOptionId: 'a',
          factualClaims: ['A claim the model wrote'],
        };
      }),
    });
  };

  beforeAll(async () => {
    fake = new FakeAiProvider({
      text: (call) => respond(call.prompt),
      model: 'fake-model',
      usage: { promptTokens: 1200, completionTokens: 800 },
    });
    database = await connectTestDatabase(SUITE);
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: {
        MONGODB_URI: isolatedTestDatabaseUri(SUITE),
        CONTENT_ENGINE_ENABLED: 'true',
        ENGINE_AUTHORING_ROOT: process.cwd().replace(/\/backend$/, ''),
        ENGINE_PROVIDER_NAME: 'fake',
        ENGINE_GENERATION_MODEL: 'fake-model',
        ENGINE_QUALITY_MODEL: 'fake-model',
        ENGINE_MONTHLY_CAP_SAR: '100',
        ENGINE_BATCH_CAP_SAR: '25',
        ENGINE_MODEL_PRICING: JSON.stringify({
          'fake/fake-model': {
            inputMicrosPerMillion: 1_000,
            outputMicrosPerMillion: 2_000,
          },
        }),
      },
      configure: (builder) =>
        builder
          .overrideProvider(ENGINE_AI_PROVIDER)
          .useValue(fake as AiProvider),
    });
    adminToken = await loginForToken(app, fixtureCredentials.admin);
    library = app.get(LibraryImportService, { strict: false });
    workbook = await readLibraryWorkbook(readFileSync(FIXTURE));

    // Screening reads the Scope's history, so it must exist before jobs run.
    const worldId = new Types.ObjectId();
    await database.collection('worlds').insertOne({
      _id: worldId,
      name: 'Video Games',
      slug: TARGET.worldKey,
      status: 'draft',
      sortOrder: 0,
    });
    await database.collection('scopes').insertOne({
      worldId,
      name: 'Overwatch',
      slug: TARGET.scopeKey,
      excludedChallengeTypeIds: [],
      status: 'draft',
      sortOrder: 0,
    });
    await database.collection('challenge_types').updateOne(
      { slug: TARGET.mechanicKey },
      {
        $setOnInsert: {
          name: 'Read Your Opponent',
          family: 'ryo',
          itemStructure: 'discrete_triple',
          answerMode: 'ryo',
          defaultPresentation: {
            inputType: 'multiple_choice',
            timerSeconds: null,
          },
          scoringRuleId: 'ryo-payoff-matrix',
          status: 'draft',
          sortOrder: 0,
        },
      },
      { upsert: true },
    );
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  describe('import', () => {
    it('refuses to run against anything but a _test database', () => {
      expect(database.name).toMatch(/_test$/);
    });

    it('builds the unique id indexes the upsert depends on', async () => {
      await Promise.all([
        app.get(getModelToken(EngineLibraryRowDocument.name)).init(),
        app.get(getModelToken(EngineLibraryHookDocument.name)).init(),
      ]);
      const unique = async (name: string, key: string) =>
        (await database.collection(name).indexes()).some(
          (index) => index.unique && index.key[key] === 1,
        );
      expect(await unique('engine_library_rows', 'libraryId')).toBe(true);
      expect(await unique('engine_library_hooks', 'hookId')).toBe(true);
    });

    it('stores every row and loads the 21 APPROVED ones', async () => {
      expect(await library.importWorkbook(workbook)).toMatchObject({
        total: 78,
        approved: 21,
        generationEligible: 16,
        created: 78,
        updated: 0,
        unchanged: 0,
        retired: 0,
        hooks: { total: 12, writerEligible: 7 },
      });
      expect(await rows().countDocuments()).toBe(78);
      expect(await rows().countDocuments({ reviewStatus: 'APPROVED' })).toBe(
        21,
      );
      expect(await rows().countDocuments({ reviewStatus: 'PARK' })).toBe(50);
      expect(await rows().countDocuments({ reviewStatus: 'REJECT' })).toBe(7);
    });

    it('keeps two source URLs and a weak-source flag through Mongo', async () => {
      const lib076 = await rows().findOne({ libraryId: 'LIB-076' });
      expect(lib076?.sourceUrls).toHaveLength(2);
      expect(lib076?.sourceUrl).toBe(lib076?.sourceUrls[0]);
      const flagged = await rows()
        .find({ sourceWarning: 'WEAK_SOURCE' })
        .map((row) => row.libraryId as string)
        .toArray();
      expect(flagged.sort()).toEqual(['LIB-021', 'LIB-059']);
    });

    it('writes nothing when the same workbook is imported again', async () => {
      const before = await rows().find().sort({ libraryId: 1 }).toArray();
      expect(await library.importWorkbook(workbook)).toMatchObject({
        created: 0,
        updated: 0,
        unchanged: 78,
        retired: 0,
      });
      expect(await rows().find().sort({ libraryId: 1 }).toArray()).toEqual(
        before,
      );
    });

    it('updates a changed row by id, without a second document', async () => {
      const edited = workbook.rows.map((row) =>
        row.libraryId === 'LIB-069'
          ? { ...row, verifiedAnswer: '97 نقطة', rowHash: 'edited' }
          : row,
      );
      expect(
        await library.importWorkbook({ ...workbook, rows: edited }),
      ).toMatchObject({ created: 0, updated: 1, unchanged: 77 });
      expect(await rows().countDocuments({ libraryId: 'LIB-069' })).toBe(1);
      expect(
        (await rows().findOne({ libraryId: 'LIB-069' }))?.verifiedAnswer,
      ).toBe('97 نقطة');
      await library.importWorkbook(workbook);
    });

    it('never returns PARK, REJECT or gated rows for generation', async () => {
      for (const row of workbook.rows.filter(
        (candidate) =>
          candidate.worldKey &&
          candidate.scopeKey &&
          !isLibraryRowGenerationEligible(candidate),
      )) {
        for (const mechanicKey of row.mechanicKeys) {
          const found = await library.findEligible({
            worldKey: row.worldKey!,
            scopeKey: row.scopeKey!,
            mechanicKey,
          });
          expect(found.map((item) => item.libraryId)).not.toContain(
            row.libraryId,
          );
        }
      }
    });

    it('keeps LIB-077 gated despite its new sources', async () => {
      expect(
        await library.findEligible({
          worldKey: 'football',
          scopeKey: 'uefa-super-cup',
          mechanicKey: 'top-5',
        }),
      ).toEqual([]);
    });

    it('retires a dropped row, then restores it', async () => {
      const target = {
        worldKey: 'anime',
        scopeKey: 'demon-slayer',
        mechanicKey: 'read-your-opponent',
      };
      await library.importWorkbook({
        ...workbook,
        rows: workbook.rows.filter((row) => row.libraryId !== 'LIB-021'),
      });
      expect(await library.findEligible(target)).toEqual([]);
      expect(await rows().countDocuments({ libraryId: 'LIB-021' })).toBe(1);

      await library.importWorkbook(workbook);
      expect(
        (await library.findEligible(target)).map((row) => row.libraryId),
      ).toEqual(['LIB-021']);
    });

    it('serves approved hooks only, with no anti-pattern', async () => {
      const hooks = await library.findWriterHooks('read-your-opponent');
      expect(hooks.map((hook) => hook.hookId)).toEqual(['H01', 'H03', 'H07']);
      expect(
        await database
          .collection('engine_library_hooks')
          .countDocuments({ type: 'ANTI-PATTERN' }),
      ).toBe(5);
    });
  });

  describe('a Celebrities-shaped workbook', () => {
    const bankRow = {
      id: 'CEL-9001',
      world: TARGET.worldKey,
      scope: TARGET.scopeKey,
      scope_status: 'MATCH',
      verified_on: '2026-11-01',
      fit: 'Closest (سنة)',
      question_example: 'متى صدرت هذه الخريطة؟',
      answer: '2019',
      answer_numeric: 2019,
      source_url: 'https://example.test/row',
      review_status: 'APPROVED',
      interaction_mode: 'between-anchors',
      anchor_left: 'الإصدار الأول',
      anchor_right: 'الإصدار الأخير',
      anchor_years_internal: '2016-2022',
      range_min: 2016,
      range_max: 2022,
    };

    const workbookFile = async () => {
      const file = new ExcelJS.Workbook();
      const columns = [
        ...LIBRARY_EXAMPLE_COLUMNS,
        'world',
        'scope_status',
        'verified_on',
      ];
      const examples = file.addWorksheet('Examples');
      examples.addRow(columns);
      examples.addRow(
        columns.map(
          (column) => (bankRow as Record<string, unknown>)[column] ?? null,
        ),
      );
      const anchors = file.addWorksheet('Anchors');
      anchors.addRow([...LIBRARY_ANCHOR_COLUMNS, 'world']);
      anchors.addRow([
        'ANC-1',
        'الإصدار الأول',
        2016,
        null,
        null,
        'video-games',
      ]);
      anchors.addRow([
        'ANC-2',
        'الإصدار الأخير',
        2022,
        null,
        null,
        'video-games',
      ]);
      return Buffer.from(await file.xlsx.writeBuffer());
    };

    const closestRequest = {
      ...TARGET,
      mechanicKey: 'closest',
      targetCount: 3,
    };

    afterAll(async () => {
      await database.collection('engine_jobs').deleteMany({});
      await database.collection('engine_candidates').deleteMany({});
      await database.collection('engine_cost_ledger').deleteMany({});
      await database
        .collection('engine_library_rows')
        .deleteOne({ libraryId: 'CEL-9001' });
      fake.calls.length = 0;
    });

    it('imports beside the football library without retiring it', async () => {
      await library.importWorkbook(workbook);
      const parsed = await readLibraryWorkbook(await workbookFile());
      expect(await library.importWorkbook(parsed)).toMatchObject({
        created: 1,
        retired: 0,
        anchors: { total: 2 },
      });
      expect(await rows().countDocuments({ retired: true })).toBe(0);
      expect(
        (await library.findAnchorBank(TARGET.worldKey)).map((a) => a.anchorId),
      ).toEqual(['ANC-1', 'ANC-2']);
    });

    it('runs an anchored Closest job from the bank to bound evidence', async () => {
      const plan = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send(closestRequest)
          .expect(201)
      ).body.data;
      const { jobs } = (
        await asAdmin(api().post('/admin/content-engine/jobs'))
          .send({ ...closestRequest, planDigest: plan.planDigest })
          .expect(201)
      ).body.data;
      const anchored = jobs.find(
        (job: { mode: string }) => job.mode === 'library_anchored',
      );
      await asAdmin(
        api().post(`/admin/content-engine/jobs/${anchored.jobId}/run`),
      ).expect(201);

      const call = fake.calls.find((entry) =>
        entry.prompt.includes('Author exactly'),
      )!;
      expect(call.prompt).toContain('## ANCHOR BANK');
      expect(call.prompt).not.toContain('2016-2022');

      const [candidate] = await database
        .collection('engine_candidates')
        .find({ jobId: anchored.jobId })
        .sort({ ordinal: 1 })
        .toArray();
      expect(candidate.draft.mechanicPayload.closestSlider).toEqual({
        mode: 'between-anchors',
        min: 2016,
        max: 2022,
        step: 1,
        leftAnchor: 'الإصدار الأول',
        rightAnchor: 'الإصدار الأخير',
      });
      expect(candidate.status).not.toBe('screened_reject');
      expect(candidate.factVerification.seedBinding).toMatchObject({
        covered: true,
        libraryId: 'CEL-9001',
      });
    });
  });

  describe('a request split into two jobs', () => {
    const REQUEST = { ...TARGET, targetCount: 10, difficulty: 'mixed' };
    let plan: {
      planDigest: string;
      sourcingPlan: {
        anchoredCount: number;
        exploratoryCount: number;
        jobCount: number;
      };
    };
    let jobs: Array<{ jobId: string; mode: string; targetCount: number }>;

    const candidatesOf = (jobId: string) =>
      database
        .collection('engine_candidates')
        .find({ jobId })
        .sort({ ordinal: 1 })
        .toArray();
    const anchoredJob = () =>
      jobs.find((job) => job.mode === 'library_anchored')!;
    const exploratoryJob = () =>
      jobs.find((job) => job.mode === 'exploratory')!;

    beforeAll(async () => {
      await library.importWorkbook({
        ...workbook,
        rows: [...workbook.rows, ...ROWS],
      });
      plan = (
        await asAdmin(api().post('/admin/content-engine/jobs/preflight'))
          .send(REQUEST)
          .expect(201)
      ).body.data;
    });

    it('plans 7 anchored and 3 exploratory across two jobs', () => {
      expect(plan.sourcingPlan).toMatchObject({
        anchoredCount: 7,
        exploratoryCount: 3,
        jobCount: 2,
      });
    });

    it('refuses a preflight made stale by a library change', async () => {
      const changed = ROWS.map((row, index) =>
        index ? row : { ...row, verifiedAnswer: 'تغير', rowHash: 'drift' },
      );
      await library.importWorkbook({
        ...workbook,
        rows: [...workbook.rows, ...changed],
      });
      const response = await asAdmin(api().post('/admin/content-engine/jobs'))
        .send({ ...REQUEST, planDigest: plan.planDigest })
        .expect(409);
      expect(JSON.stringify(response.body)).toContain('PREFLIGHT_PLAN_DRIFT');
      await library.importWorkbook({
        ...workbook,
        rows: [...workbook.rows, ...ROWS],
      });
    });

    it('creates two distinct jobs, and a repeat click creates none', async () => {
      const submitted = (
        await asAdmin(api().post('/admin/content-engine/jobs'))
          .send({ ...REQUEST, planDigest: plan.planDigest })
          .expect(201)
      ).body.data;
      jobs = submitted.jobs;
      expect(jobs.map((job) => [job.mode, job.targetCount])).toEqual([
        ['library_anchored', 7],
        ['exploratory', 3],
      ]);
      expect(new Set(jobs.map((job) => job.jobId)).size).toBe(2);

      const repeat = (
        await asAdmin(api().post('/admin/content-engine/jobs'))
          .send({ ...REQUEST, planDigest: plan.planDigest })
          .expect(201)
      ).body.data;
      expect(repeat.jobs.map((job: { jobId: string }) => job.jobId)).toEqual(
        jobs.map((job) => job.jobId),
      );
      expect(
        repeat.jobs.every((job: { created: boolean }) => !job.created),
      ).toBe(true);
      expect(await database.collection('engine_jobs').countDocuments()).toBe(2);
    });

    it('runs each job as one provider call, each with its own budget entry', async () => {
      for (const job of jobs) {
        await asAdmin(
          api().post(`/admin/content-engine/jobs/${job.jobId}/run`),
        ).expect(201);
      }
      const generationCalls = fake.calls.filter((call) =>
        call.prompt.includes('Author exactly'),
      );
      expect(generationCalls).toHaveLength(2);
      for (const job of jobs) {
        expect(
          await database
            .collection('engine_cost_ledger')
            .countDocuments({ jobId: job.jobId, stage: 'generation' }),
        ).toBe(1);
      }
    });

    it('never shows an exploratory job a library row', () => {
      const exploratory = fake.calls.find(
        (call) =>
          call.prompt.includes('Author exactly') &&
          !call.prompt.includes('## LIBRARY-ANCHORED SLOTS'),
      )!;
      expect(exploratory.prompt).not.toContain('LIB-9');
      for (const row of ROWS) {
        expect(exploratory.prompt).not.toContain(row.questionText);
      }
      expect(exploratory.prompt).not.toMatch(/<hook id="X\d/);
    });

    it('records mode, rows and similarity on every candidate', async () => {
      const anchored = await candidatesOf(anchoredJob().jobId);
      expect(anchored).toHaveLength(7);
      for (const candidate of anchored) {
        expect(candidate.sourcing.mode).toBe('library_anchored');
        expect(candidate.sourcing.libraryIds.length).toBeGreaterThanOrEqual(1);
        expect(candidate.sourcing.libraryIds.length).toBeLessThanOrEqual(3);
        expect(candidate.librarySimilarity.libraryId).toMatch(/^LIB-9/);
      }
      const exploratory = await candidatesOf(exploratoryJob().jobId);
      expect(exploratory).toHaveLength(3);
      for (const candidate of exploratory) {
        expect(candidate.sourcing).toMatchObject({
          mode: 'exploratory',
          libraryIds: [],
        });
        expect(candidate.librarySimilarity).toBeNull();
      }
    });

    it('rejects the verbatim copy', async () => {
      const [, copy] = await candidatesOf(anchoredJob().jobId);
      expect(copy.status).toBe('screened_reject');
      expect(copy.findings).toContainEqual(
        expect.objectContaining({
          code: 'LIBRARY_ROW_COPY',
          severity: 'blocking',
        }),
      );
      expect(copy.librarySimilarity.similarity).toBe(1);
    });

    it('binds the exact answer and not a changed one', async () => {
      const [covered, , changed] = await candidatesOf(anchoredJob().jobId);
      expect(covered.factVerification.seedBinding).toMatchObject({
        covered: true,
      });
      expect(covered.factVerification.claims[0].evidence[0]).toMatchObject({
        method: 'structured-seed',
        url: 'https://example.test/one',
        additionalSourceUrls: ['https://example.test/two'],
        verifiedOn: '2026-11-01',
      });
      expect(changed.factVerification.seedBinding).toMatchObject({
        covered: false,
        reason: 'ANSWER_CHANGED',
      });
    });

    it('carries provenance to the DRAFT over review HTTP', async () => {
      const [covered] = await candidatesOf(anchoredJob().jobId);
      const path = `/admin/content-engine/candidates/${covered.candidateId}`;
      const revision = async () =>
        (await asAdmin(api().get(path)).expect(200)).body.data
          .reviewRevision as number;

      // A covered candidate needs no pasted URL: the row's source is on record.
      await asAdmin(api().post(`${path}/assessment`))
        .send({
          expectedRevision: await revision(),
          factualState: 'SUPPORTED',
          factualExplanation: 'Checked against the library row.',
          evidence: [],
          quality: {
            correctness: 5,
            mechanicFit: 4,
            clarity: 5,
            multiplayerFit: 4,
            originality: 4,
            explanation: 'A new question on a verified fact.',
          },
        })
        .expect(201);
      const approval = await asAdmin(api().post(`${path}/approve`)).send({
        expectedRevision: await revision(),
        explanation: 'Approved by the integration test.',
      });
      expect([approval.status, approval.body?.message]).toEqual([
        201,
        undefined,
      ]);
      const draft = (
        await asAdmin(api().post(`${path}/create-draft`))
          .send({ expectedRevision: await revision() })
          .expect(201)
      ).body.data;

      const item = await database
        .collection('content_items')
        .findOne({ _id: new Types.ObjectId(draft.contentItemId) });
      expect(item?.status).toBe('draft');
      expect(item?.metadata).toMatchObject({
        generationMode: 'library_anchored',
        libraryIds: covered.sourcing.libraryIds,
      });
    });
  });
});
