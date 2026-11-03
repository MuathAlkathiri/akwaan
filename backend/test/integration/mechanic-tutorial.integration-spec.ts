import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  isolatedTestDatabaseUri,
  resetTestDatabase,
} from '../helpers/test-database';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { loginForToken } from '../helpers/auth-helper';

/**
 * The mechanic tutorial, end to end over HTTP.
 *
 * The properties under test are the ones that make it safe to show a correct
 * answer in public: a draft never reaches the public endpoint, the demonstrated
 * score is derived rather than asserted by the client, and a scenario that is
 * really a competitive question cannot be published.
 *
 * Runs against its own `_test` database, seeded here; no local or production
 * data is touched.
 */
describe('Mechanic tutorial HTTP integration', () => {
  let app: INestApplication;
  let database: Connection;
  let adminToken: string;
  let userToken: string;

  const MECHANIC = 'read-your-opponent';
  const CLOSEST_MECHANIC = 'closest';
  const BOMB_MECHANIC = 'bomb';
  const EXTENDED_MECHANICS = [
    'top-5',
    'combo',
    'marhala',
    'laqatha',
    'first-note',
    'odd-piece',
    'ekshifni',
    'la-tahriqha',
  ] as const;
  const COMPETITIVE_PROMPT =
    'من توّج بلقب كأس العالم 2014 بعد فوزه على الأرجنتين في النهائي؟';

  const scenario = (overrides: Record<string, unknown> = {}) => ({
    prompt: 'كم لونًا في قوس قزح؟',
    options: [
      { id: 'a', label: 'سبعة' },
      { id: 'b', label: 'خمسة' },
      { id: 'c', label: 'ستة' },
      { id: 'd', label: 'ثمانية' },
    ],
    correctOptionId: 'a',
    answeringSelectionOptionId: 'a',
    opposingDecision: 'STEAL',
    ...overrides,
  });

  const closestScenario = (overrides: Record<string, unknown> = {}) => ({
    kind: 'closest',
    version: 1,
    prompt: 'كم يبلغ ارتفاع برج المملكة تقريبًا؟',
    teamAEstimate: 280,
    teamBEstimate: 320,
    correctValue: 302,
    unit: 'متر',
    ...overrides,
  });

  const bombScenario = () => ({
    kind: 'bomb',
    version: 1,
    prompt: 'وش اسم الكوكب الأحمر؟',
    acceptedAnswer: 'المريخ',
    nextPrompt: 'وش اسم أكبر كوكب؟',
    startingTeam: 'team-a',
    correctAtSecondsRemaining: 18,
    opponentExpiresAtSecondsRemaining: 0,
  });

  const extendedScenarios: Record<
    (typeof EXTENDED_MECHANICS)[number],
    Record<string, unknown>
  > = {
    'top-5': {
      kind: 'top-5',
      version: 1,
      prompt: 'من أكثر خمسة هدافين؟',
      title: 'أفضل 5 هدافين',
      rankingBasis: 'أهداف الدوري',
      sourceLabel: 'مثال تعليمي',
      instruction: 'اختاروا تثبيت البطاقة أو إعطاءها للفريق الآخر.',
      startingTeam: 'team-a',
      entries: [
        { id: 'a', label: 'أ', rank: 1 },
        { id: 'b', label: 'ب', rank: 2 },
        { id: 'c', label: 'ج', rank: 3 },
        { id: 'd', label: 'د', rank: 4 },
        { id: 'e', label: 'هـ', rank: 5 },
        { id: 'f', label: 'و', rank: null },
        { id: 'g', label: 'ز', rank: null },
        { id: 'h', label: 'ح', rank: null },
        { id: 'i', label: 'ط', rank: null },
        { id: 'j', label: 'ي', rank: null },
      ],
      decisions: Array.from({ length: 10 }, (_, index) => ({
        action: index % 2 === 0 ? 'keep' : 'give',
      })),
    },
    combo: {
      kind: 'combo',
      version: 1,
      stages: [
        {
          stage: 1,
          prompt: 'سؤال أول',
          correctAnswer: 'أ',
          submittedAnswer: 'أ',
        },
        {
          stage: 2,
          prompt: 'سؤال ثان',
          correctAnswer: 'ب',
          submittedAnswer: 'ب',
        },
        {
          stage: 3,
          prompt: 'سؤال ثالث',
          correctAnswer: 'ج',
          submittedAnswer: 'خطأ',
        },
      ],
    },
    marhala: {
      kind: 'marhala',
      version: 1,
      prompt: 'أي لعبة ترتبط بكريتوس؟',
      correctAnswer: 'غود أوف وور',
      submittedAnswer: 'غود أوف وور',
      teamAPosition: 4,
      teamBPosition: 11,
      activeTeam: 'team-a',
      difficulty: 'hard',
      movement: 4,
      baseLanding: 8,
      tile: 'boost',
      finalLanding: 13,
    },
    laqatha: {
      kind: 'laqatha',
      version: 1,
      prompt: 'تعرّفوا على الفيلم من أدلة متدرجة.',
      title: 'حديقة الديناصورات',
      clues: [
        { order: 1, value: 5, text: 'زيارة جزيرة نائية تسبق افتتاح متنزه.' },
        { order: 2, value: 4, text: 'عالم حفريات يقود مشروع الحمض النووي.' },
        { order: 3, value: 3, text: 'تعود حيوانات منقرضة إلى الحياة.' },
        { order: 4, value: 2, text: 'طفلان قرب سياج كهربائي.' },
        { order: 5, value: 1, text: 'تي-ريكس يطارد الناجين.' },
      ],
      acceptedAnswers: ['حديقة الديناصورات', 'Jurassic Park'],
      firstSubmittedAnswer: 'حديقة الوحوش',
      secondSubmittedAnswer: 'حديقة الديناصورات',
    },
    'first-note': {
      kind: 'first-note',
      version: 1,
      prompt: 'تعرّفوا على الأغنية من مزاد ثوانٍ.',
      title: 'على بالي',
      clueLabel: 'السياق',
      contextualClue: 'أغنية عربية معاصرة بصوت نسائي من ألبوم واسع الانتشار.',
      bids: [
        { team: 'team-a', seconds: 8 },
        { team: 'team-b', seconds: 5 },
        { team: 'team-a', seconds: 3 },
      ],
      acceptedAnswers: ['على بالي'],
      firstSubmittedAnswer: 'ليلة صيف',
      stealSubmittedAnswer: 'على بالي',
    },
    'odd-piece': {
      kind: 'odd-piece',
      version: 2,
      prompt: 'أين القطعة الدخيلة؟',
      targetVehicleIdentity: 'BMW M4 G82',
      targetVehicleLabel: 'BMW M4 Competition Coupe (G82)',
      intruderVehicleIdentity: 'Mercedes-AMG C63 W206',
      intruderVehicleLabel: 'Mercedes-AMG C63 (W206)',
      intruderPartIdentity: 'mirror-right',
      intruderPartLabel: 'مرآة جانبية',
      modifiedImage: {
        width: 1942,
        height: 809,
        orientation: 'landscape',
        media: {
          type: 'image',
          assets: [
            {
              url: '/tutorial-media/odd-piece-v2/question-modified-bmw-m4.png',
            },
          ],
        },
        provenance: {
          assetOrigin: 'ai-edited',
          sourceUrl: 'local://owner-supplied-bmw-m4',
        },
      },
      originalImage: {
        width: 1942,
        height: 809,
        orientation: 'landscape',
        media: {
          type: 'image',
          assets: [
            {
              url: '/tutorial-media/odd-piece-v2/question-modified-bmw-m4.png',
            },
          ],
        },
        provenance: {
          assetOrigin: 'authentic',
          sourceUrl: 'local://owner-supplied-bmw-m4',
        },
      },
      hotspot: {
        polygon: [
          { x: 0.326, y: 0.39 },
          { x: 0.506, y: 0.39 },
          { x: 0.506, y: 0.87 },
          { x: 0.326, y: 0.87 },
        ],
        tolerance: 0.02,
      },
      wrongPoint: { x: 0.1, y: 0.1 },
      correctPoint: { x: 0.42, y: 0.62 },
    },
    ekshifni: {
      kind: 'ekshifni',
      version: 1,
      prompt: 'مين هذي؟',
      celebrityIdentity: 'رضوى الشربيني',
      image: {
        url: '/tutorial-media/ekshifni-v1/radwa-el-sherbiny.jpg',
        altText: 'صورة الكشف النهائي',
        sha256:
          '2c6c2e377eb19fcbc580569acb9059a011c52adea82132c76c5e54f98464b695',
        provenanceNote: 'أصل محلي مؤرشف؛ الحقوق الخارجية غير مثبتة.',
      },
      regions: [1, 2, 3, 4, 5, 6].map((number) => ({
        id: `r${number}`,
        number,
        shape: { x: 0.05 * number, y: 0.05, width: 0.1, height: 0.1 },
      })),
      wrongSubmittedAnswer: 'لجين عمران',
      correctSubmittedAnswer: 'رضوى الشربيني',
    },
    'la-tahriqha': {
      kind: 'la-tahriqha',
      version: 1,
      prompt: 'اختاروا مكونات الطبق وانتبهوا للدخيل.',
      dishWindowSeconds: 30,
      dishes: [
        {
          id: 'kabsa',
          name: 'كبسة دجاج',
          ingredients: [
            ['rice', 'أرز', true],
            ['chicken', 'دجاج', true],
            ['onion', 'بصل', true],
            ['tomato', 'طماطم', true],
            ['loomi', 'لومي', true],
            ['pasta', 'مكرونة', false],
            ['mozzarella', 'موزاريلا', false],
            ['strawberry', 'فراولة', false],
          ].map(([id, label, correct]) => ({ id, label, correct })),
          teamASelection: ['rice', 'chicken', 'onion', 'pasta'],
          teamBSelection: ['rice', 'chicken', 'onion', 'tomato', 'loomi'],
        },
        {
          id: 'jareesh',
          name: 'جريش',
          ingredients: [
            ['wheat', 'قمح', true],
            ['yogurt', 'لبن', true],
            ['onion', 'بصل', true],
            ['cumin', 'كمون', true],
            ['butter', 'زبدة', true],
            ['rice', 'أرز', false],
            ['tuna', 'تونة', false],
            ['pasta', 'مكرونة', false],
          ].map(([id, label, correct]) => ({ id, label, correct })),
          teamASelection: ['wheat', 'yogurt', 'onion', 'cumin'],
          teamBSelection: ['wheat', 'yogurt', 'onion'],
        },
        {
          id: 'mandi',
          name: 'مندي دجاج',
          ingredients: [
            ['rice', 'أرز', true],
            ['chicken', 'دجاج', true],
            ['onion', 'بصل', true],
            ['tomato', 'طماطم', true],
            ['cardamom', 'هيل', true],
            ['pasta', 'مكرونة', false],
            ['cheese', 'جبن', false],
            ['strawberry', 'فراولة', false],
          ].map(([id, label, correct]) => ({ id, label, correct })),
          teamASelection: ['rice', 'chicken', 'onion'],
          teamBSelection: ['rice', 'chicken', 'onion', 'tomato'],
        },
      ],
      captainRotation: {
        teamA: ['نورة', 'مها', 'سارة'],
        teamB: ['فيصل', 'راشد', 'ماجد'],
      },
    },
  };

  beforeAll(async () => {
    database = await connectTestDatabase('mechanic-tutorial');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);

    const mechanicId = new Types.ObjectId();
    await database.collection('challenge_types').insertOne({
      _id: mechanicId,
      name: 'اقرأ خصمك',
      slug: MECHANIC,
      family: 'ryo',
      itemStructure: 'discrete_triple',
      answerMode: 'ryo',
      scoringRuleId: 'ryo.payoff-matrix',
      status: 'active',
      sortOrder: 0,
      defaultPresentation: { inputType: 'phone-multiple-choice' },
    });
    await database.collection('challenge_types').insertOne({
      _id: new Types.ObjectId(),
      name: 'مين أقرب',
      slug: CLOSEST_MECHANIC,
      family: 'coop',
      itemStructure: 'discrete_triple',
      answerMode: 'closest',
      scoringRuleId: 'closest.absolute-distance',
      status: 'active',
      sortOrder: 1,
      defaultPresentation: { inputType: 'phone-slider' },
    });
    await database.collection('challenge_types').insertOne({
      _id: new Types.ObjectId(),
      name: 'القنبلة',
      slug: BOMB_MECHANIC,
      family: 'coop',
      itemStructure: 'continuous',
      answerMode: 'match',
      scoringRuleId: 'challenge.win',
      status: 'active',
      sortOrder: 2,
      defaultPresentation: { inputType: 'phone-text' },
    });
    for (const [index, slug] of EXTENDED_MECHANICS.entries()) {
      await database.collection('challenge_types').insertOne({
        _id: new Types.ObjectId(),
        name: `شرح ${slug}`,
        slug,
        family: 'coop',
        itemStructure: 'discrete_triple',
        answerMode: 'match',
        scoringRuleId: 'challenge.win',
        status: 'active',
        sortOrder: 10 + index,
        defaultPresentation: { inputType: 'phone-text' },
      });
    }
    // One competitive item, so the overlap guard has something real to catch.
    await database.collection('content_items').insertOne({
      _id: new Types.ObjectId(),
      worldId: new Types.ObjectId(),
      scopeId: new Types.ObjectId(),
      prompt: { ar: COMPETITIVE_PROMPT },
      compatibleChallengeTypeIds: [mechanicId],
      answerPayload: { mode: 'multiple_choice', correctOptionId: 'a' },
      status: 'ready',
      isReusableAcrossSessions: false,
    });

    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('mechanic-tutorial') },
    });
    adminToken = await loginForToken(app, fixtureCredentials.admin);
    userToken = await loginForToken(app, fixtureCredentials.user);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  const admin = (
    method: 'get' | 'put' | 'post',
    path: string,
    mechanic = MECHANIC,
  ) =>
    request(app.getHttpServer())
      [method](`/admin/mechanics/${mechanic}/tutorial${path}`)
      .set('Authorization', `Bearer ${adminToken}`);

  const publicTutorial = (mechanic = MECHANIC) =>
    request(app.getHttpServer()).get(`/mechanics/${mechanic}/tutorial`);

  it('refuses the admin surface without an admin role', async () => {
    await request(app.getHttpServer())
      .get(`/admin/mechanics/${MECHANIC}/tutorial`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/admin/mechanics/${MECHANIC}/tutorial`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('serves nothing publicly before anything is published', async () => {
    const response = await publicTutorial().expect(200);
    expect(response.body.data).toBeNull();
  });

  it('rejects a structurally invalid draft with every issue at once', async () => {
    const response = await admin('put', '/draft')
      .send(scenario({ correctOptionId: 'zzz' }))
      .expect(400);
    expect(response.body.message.code ?? response.body.code).toBe(
      'WORLD_CONTENT_VALIDATION_FAILED',
    );
  });

  it('saves a draft that stays invisible to the public endpoint', async () => {
    const saved = await admin('put', '/draft').send(scenario()).expect(200);
    expect(saved.body.data.draft.prompt).toBe('كم لونًا في قوس قزح؟');
    expect(saved.body.data.published).toBeNull();
    expect(saved.body.data.hasUnpublishedChanges).toBe(true);

    // The whole point: a draft is not servable.
    const response = await publicTutorial().expect(200);
    expect(response.body.data).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain('قوس قزح');
  });

  it('derives the outcome from the real payoff rule rather than the request', async () => {
    const saved = await admin('put', '/draft')
      .send(
        scenario({
          answeringSelectionOptionId: 'b',
          opposingDecision: 'STEAL',
        }),
      )
      .expect(200);
    // Wrong answer + steal is the one losing combination in the real matrix.
    expect(saved.body.data.draft.outcome).toMatchObject({
      teamRole: 'opposing',
      delta: -1,
      reason: 'ryo.steal.failed',
      correct: false,
    });

    const trusted = await admin('put', '/draft')
      .send(scenario({ opposingDecision: 'TRUST' }))
      .expect(200);
    expect(trusted.body.data.draft.outcome).toMatchObject({
      teamRole: 'answering',
      delta: 1,
      reason: 'ryo.trust.correct',
    });
  });

  it('refuses an outcome supplied by the client', async () => {
    // There is no `outcome` field on the DTO, and the global validation pipe
    // rejects unknown properties — so a client cannot even propose a score,
    // let alone have one accepted. The stored outcome is only ever derived.
    await admin('put', '/draft')
      .send({
        ...scenario(),
        outcome: {
          teamRole: 'answering',
          delta: 99,
          reason: 'nope',
          correct: true,
        },
      })
      .expect(400);

    const saved = await admin('put', '/draft').send(scenario()).expect(200);
    expect(saved.body.data.draft.outcome).toMatchObject({
      teamRole: 'opposing',
      delta: 1,
      reason: 'ryo.steal.correct',
    });
  });

  it('refuses to publish a scenario that is a competitive question', async () => {
    await admin('put', '/draft')
      .send(scenario({ prompt: COMPETITIVE_PROMPT }))
      .expect(200);
    const refused = await admin('post', '/publish').send({}).expect(400);
    expect(JSON.stringify(refused.body)).toContain(
      'TUTORIAL_OVERLAPS_COMPETITIVE_CONTENT',
    );

    // Still nothing public, and the competitive item was not touched.
    expect((await publicTutorial().expect(200)).body.data).toBeNull();
    const item = await database
      .collection('content_items')
      .findOne({ 'prompt.ar': COMPETITIVE_PROMPT });
    expect(item?.status).toBe('ready');
  });

  it('reports overlap from the validate endpoint without writing', async () => {
    const response = await admin('post', '/validate')
      .send(scenario({ prompt: COMPETITIVE_PROMPT }))
      .expect(201);
    expect(response.body.data.valid).toBe(false);
    expect(response.body.data.competitiveOverlap.length).toBeGreaterThan(0);
  });

  it('publishes a safe scenario and only then serves it publicly', async () => {
    await admin('put', '/draft').send(scenario()).expect(200);
    const published = await admin('post', '/publish').send({}).expect(201);
    expect(published.body.data.publishedRevision).toBe(1);
    expect(published.body.data.hasUnpublishedChanges).toBe(false);

    const response = await publicTutorial().expect(200);
    expect(response.body.data.scenario.prompt).toBe('كم لونًا في قوس قزح؟');
    expect(response.body.data.revision).toBe(1);
    // The public payload has no draft key at all, not merely a null one.
    expect(Object.keys(response.body.data)).not.toContain('draft');
  });

  it('keeps serving the published revision while a new draft is edited', async () => {
    await admin('put', '/draft')
      .send(scenario({ prompt: 'كم عدد قارات العالم؟' }))
      .expect(200);

    const response = await publicTutorial().expect(200);
    expect(response.body.data.scenario.prompt).toBe('كم لونًا في قوس قزح؟');
    expect(response.body.data.revision).toBe(1);
    expect(JSON.stringify(response.body)).not.toContain('قارات');
  });

  it('bumps the revision on each publish', async () => {
    const published = await admin('post', '/publish').send({}).expect(201);
    expect(published.body.data.publishedRevision).toBe(2);
    const response = await publicTutorial().expect(200);
    expect(response.body.data.scenario.prompt).toBe('كم عدد قارات العالم؟');
  });

  it('keeps a Closest draft private and publishes its canonically derived outcome', async () => {
    const saved = await admin('put', '/draft', CLOSEST_MECHANIC)
      .send(closestScenario())
      .expect(200);
    expect(saved.body.data.draft).toMatchObject({
      kind: 'closest',
      version: 1,
      outcome: {
        teamADistance: 22,
        teamBDistance: 18,
        winnerTeam: 'team-b',
        tie: false,
        mechanicTallyDelta: 1,
        matchPointDelta: 0,
        reason: 'closest.absolute-distance',
      },
    });
    expect(
      (await publicTutorial(CLOSEST_MECHANIC).expect(200)).body.data,
    ).toBeNull();

    await admin('post', '/publish', CLOSEST_MECHANIC).send({}).expect(201);
    const published = await publicTutorial(CLOSEST_MECHANIC).expect(200);
    expect(published.body.data.scenario).toMatchObject({
      kind: 'closest',
      prompt: 'كم يبلغ ارتفاع برج المملكة تقريبًا؟',
      outcome: { winnerTeam: 'team-b', matchPointDelta: 0 },
    });
  });

  it('rejects a tutorial kind that does not match its mechanic', async () => {
    const response = await admin('post', '/validate', MECHANIC)
      .send(closestScenario())
      .expect(201);
    expect(response.body.data).toMatchObject({
      valid: false,
      issues: [{ code: 'TUTORIAL_MECHANIC_KIND_MISMATCH' }],
    });
  });

  it('keeps Bomb private until publish and derives the approved outcome', async () => {
    const saved = await admin('put', '/draft', BOMB_MECHANIC)
      .send(bombScenario())
      .expect(200);
    expect(saved.body.data.draft.outcome).toMatchObject({
      passedToTeam: 'team-a',
      expiredTeam: 'team-a',
      winnerTeam: 'team-b',
      correctAnswerPassesTurn: true,
      timerResetsOnPass: false,
      matchPointDelta: 1,
      reason: 'bomb.clock-expired',
    });
    expect(
      (await publicTutorial(BOMB_MECHANIC).expect(200)).body.data,
    ).toBeNull();
    await admin('post', '/publish', BOMB_MECHANIC).send({}).expect(201);
    expect(
      (await publicTutorial(BOMB_MECHANIC).expect(200)).body.data.scenario.kind,
    ).toBe('bomb');
  });

  it.each(EXTENDED_MECHANICS)(
    'publishes %s through the real Admin/public HTTP lifecycle and keeps the previous revision live while editing',
    async (mechanic) => {
      const input = extendedScenarios[mechanic];
      const beforePublish = await publicTutorial(mechanic).expect(200);
      expect(beforePublish.body.data).toBeNull();

      const saved = await admin('put', '/draft', mechanic)
        .send(input)
        .expect(200);
      expect(saved.body.data.draft.kind).toBe(input.kind);
      expect(saved.body.data.draft.outcome).toBeDefined();
      expect(saved.body.data.published).toBeNull();
      expect(
        JSON.stringify(await publicTutorial(mechanic).expect(200)),
      ).not.toContain(String(input.prompt));

      const validated = await admin('post', '/validate', mechanic)
        .send(input)
        .expect(201);
      expect(validated.body.data.valid).toBe(true);
      expect(validated.body.data.outcome).toEqual(
        saved.body.data.draft.outcome,
      );

      const published = await admin('post', '/publish', mechanic)
        .send({})
        .expect(201);
      expect(published.body.data.publishedRevision).toBe(1);
      const publicRevisionOne = await publicTutorial(mechanic).expect(200);
      expect(publicRevisionOne.body.data.revision).toBe(1);
      expect(publicRevisionOne.body.data.scenario.kind).toBe(input.kind);
      expect(Object.keys(publicRevisionOne.body.data)).not.toContain('draft');

      const expectedPrompt =
        typeof input.prompt === 'string'
          ? input.prompt
          : (input.stages as Array<{ prompt: string }>)[0]?.prompt;
      const edited =
        mechanic === 'combo'
          ? {
              ...input,
              stages: (input.stages as Array<Record<string, unknown>>).map(
                (stage, index) =>
                  index === 0
                    ? {
                        ...stage,
                        prompt: `${String(stage.prompt)} — نسخة لاحقة`,
                      }
                    : stage,
              ),
            }
          : {
              ...input,
              prompt: `${String(input.prompt)} — نسخة لاحقة`,
            };
      await admin('put', '/draft', mechanic).send(edited).expect(200);
      const stillLive = await publicTutorial(mechanic).expect(200);
      expect(stillLive.body.data.revision).toBe(1);
      expect(stillLive.body.data.scenario.prompt).toBe(expectedPrompt);
      expect(JSON.stringify(stillLive.body)).not.toContain('نسخة لاحقة');

      await admin('post', '/publish', mechanic).send({}).expect(201);
      const publicRevisionTwo = await publicTutorial(mechanic).expect(200);
      expect(publicRevisionTwo.body.data.revision).toBe(2);
      expect(publicRevisionTwo.body.data.scenario.prompt).toContain(
        'نسخة لاحقة',
      );

      const invalid = { ...input, version: 99 };
      await admin('put', '/draft', mechanic).send(invalid).expect(400);
      await admin('post', '/validate', mechanic).send(invalid).expect(400);
    },
  );

  it('404s an unknown mechanic key rather than inventing one', async () => {
    await request(app.getHttpServer())
      .get('/mechanics/not-a-mechanic/tutorial')
      .expect(404);
  });
});
