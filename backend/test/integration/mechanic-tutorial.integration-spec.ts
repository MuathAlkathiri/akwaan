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

  it('keeps Bomb private until publish and derives pass/expiry outcome', async () => {
    const saved = await admin('put', '/draft', BOMB_MECHANIC)
      .send(bombScenario())
      .expect(200);
    expect(saved.body.data.draft.outcome).toMatchObject({
      passedToTeam: 'team-b',
      expiredTeam: 'team-b',
      winnerTeam: 'team-a',
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

  it('404s an unknown mechanic key rather than inventing one', async () => {
    await request(app.getHttpServer())
      .get('/mechanics/not-a-mechanic/tutorial')
      .expect(404);
  });
});
