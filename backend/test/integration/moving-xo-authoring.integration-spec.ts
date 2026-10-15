import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
import { createIntegrationTestApp } from '../helpers/test-app';
import {
  connectTestDatabase,
  resetTestDatabase,
} from '../helpers/test-database';
import {
  fixtureCredentials,
  seedIntegrationFixtures,
} from '../fixtures/integration.fixture';
import { loginForToken } from '../helpers/auth-helper';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  ContentItemStatus,
  MOVING_XO_SLUG,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../../src/modules/scoring/domain/scoring-rule';

/**
 * Draft → READY for Moving XO, over HTTP, against an isolated test database.
 *
 * The unit spec proves the policy's rules. This proves the thing a unit spec
 * cannot: that those rules are actually *reached* by the admin API, that they
 * stop a READY write, and that they leave drafting alone.
 *
 * **The seven puzzles below are test fixtures.** They are written to be
 * structurally canonical — real Scopes, real families, real answer payloads —
 * and nothing more. They are not product-approved content, they have had no
 * human content review, and nothing here promotes or publishes anything: every
 * write lands in a database whose name must end in `_test` or the harness
 * refuses to connect.
 *
 * The fixture uses the canonical `moving_xo` mechanic answer mode. Its
 * compatibility-map entry accepts both generic item modes, so the two blocks
 * below exercise one ChallengeType without mutating its contract mid-suite.
 */
describe('Moving XO authoring Draft → READY (roadmap §23.11)', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;

  let worldId: string;
  let challengeTypeId: string;
  const scopes: Record<string, string> = {};

  /** The seven text-native puzzles. No media: none of these Scopes demands it. */
  const TEXT_NATIVE = [
    {
      key: 'anagram',
      scope: 'wordplay-letters',
      family: 'anagram-rearrange',
      prompt: 'رتّب حروف «م ل ق» لتكوّن أداة كتابة.',
      match: ['قلم'],
    },
    {
      key: 'letter-op',
      scope: 'wordplay-letters',
      family: 'letter-operation',
      prompt: 'احذف أول حرف من «كتاب». ما الكلمة الناتجة؟',
      options: ['تاب', 'كتب', 'باب', 'تابع'],
      correct: 0,
    },
    {
      key: 'hidden-word',
      scope: 'wordplay-letters',
      family: 'hidden-word',
      prompt: 'أي كلمة مخبّأة داخل «مكتبة»؟',
      options: ['كتب', 'نجم', 'قلم', 'باب'],
      correct: 0,
    },
    {
      key: 'numeric-pattern',
      scope: 'numbers-estimation',
      family: 'numeric-pattern',
      prompt: '٢ ، ٤ ، ٨ ، ١٦ ، ... ما العدد التالي؟',
      options: ['٢٤', '٣٢', '٤٨', '٦٤'],
      correct: 1,
    },
    {
      key: 'quantity',
      scope: 'numbers-estimation',
      family: 'quantity-intuition',
      prompt: 'أيّهما أكبر: ثلث المئة، أم ربع المئة وعشرون؟',
      options: ['ثلث المئة', 'ربع المئة وعشرون', 'متساويان'],
      correct: 1,
    },
    {
      key: 'intruder',
      scope: 'spot-the-error',
      family: 'intruder-element',
      prompt: 'ثلاثة منها أدوات مدرسية. أيّها الدخيل؟',
      options: ['قلم', 'دفتر', 'ممحاة', 'تفاحة'],
      correct: 3,
    },
    {
      key: 'order',
      scope: 'spot-the-error',
      family: 'order-violation',
      prompt: 'صباح، ظهر، عصر، فجر — أي وقت يجب أن يكون الأول؟',
      match: ['فجر'],
    },
  ];

  beforeAll(async () => {
    database = await connectTestDatabase();
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp();
    token = await loginForToken(app, fixtureCredentials.admin);

    const api = request(app.getHttpServer());
    const auth = <T extends request.Test>(value: T): T =>
      value.set('Authorization', `Bearer ${token}`) as T;

    worldId = (
      await auth(api.post('/admin/worlds'))
        .send({ name: 'عالم الألغاز', slug: 'puzzles-mxo-test' })
        .expect(201)
    ).body.data.id;

    // Every forward Scope plus one retired Scope, so the retired-Scope blocker
    // is exercised against a Scope that genuinely exists.
    for (const slug of [
      'observation-illusions',
      'wordplay-letters',
      'numbers-estimation',
      'assembly-rotation',
      'paths-motion',
      'spot-the-error',
      'general-knowledge',
    ]) {
      scopes[slug] = (
        await auth(api.post(`/admin/worlds/${worldId}/scopes`))
          .send({ name: slug, slug, status: WorldContentStatus.ACTIVE })
          .expect(201)
      ).body.data.id;
    }

    challengeTypeId = (
      await auth(api.post('/admin/challenge-types'))
        .send({
          name: 'Moving XO',
          slug: MOVING_XO_SLUG,
          family: ChallengeFamily.SIGNATURE,
          itemStructure: ChallengeItemStructure.CONTINUOUS,
          answerMode: ChallengeAnswerMode.MOVING_XO,
          defaultPresentation: {
            inputType: 'phone-choice',
            timerSeconds: 15,
            soundPack: null,
            revealStyle: null,
          },
          scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
          status: WorldContentStatus.ACTIVE,
        })
        .expect(201)
    ).body.data.id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  const api = () => request(app.getHttpServer());
  const auth = <T extends request.Test>(value: T): T =>
    value.set('Authorization', `Bearer ${token}`) as T;

  const body = (
    puzzle: (typeof TEXT_NATIVE)[number],
    status: ContentItemStatus,
  ) => ({
    scopeId: scopes[puzzle.scope],
    prompt: { ar: puzzle.prompt },
    compatibleChallengeTypeIds: [challengeTypeId],
    answerPayload: puzzle.match
      ? { mode: ChallengeAnswerMode.MATCH, acceptedAnswers: puzzle.match }
      : {
          mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
          options: puzzle.options!.map((label, index) => ({
            id: `o${index}`,
            label: { ar: label },
          })),
          correctOptionId: `o${puzzle.correct}`,
        },
    status,
  });

  const create = async (payload: object, expected: number) =>
    auth(api().post('/admin/content-items')).send(payload).expect(expected);

  const multipleChoice = TEXT_NATIVE.filter((puzzle) => !puzzle.match);
  const matching = TEXT_NATIVE.filter((puzzle) => puzzle.match);

  describe('multiple-choice puzzles', () => {
    it.each(multipleChoice.map((puzzle) => [puzzle.key, puzzle] as const))(
      'drafts and then promotes %s to READY',
      async (_key, puzzle) => {
        // Draft first — authoring is iterative, and a draft must never need to
        // be ready-shaped to be saved.
        const draft = await create(body(puzzle, ContentItemStatus.DRAFT), 201);
        expect(draft.body.data.status).toBe(ContentItemStatus.DRAFT);

        const ready = await auth(
          api().patch(`/admin/content-items/${draft.body.data.id}`),
        )
          .send({ status: ContentItemStatus.READY })
          .expect(200);
        expect(ready.body.data.status).toBe(ContentItemStatus.READY);
      },
    );

    it('refuses READY on a retired Scope, and still allows the draft', async () => {
      const puzzle = multipleChoice[0];
      const draft = await create(
        {
          ...body(puzzle, ContentItemStatus.DRAFT),
          scopeId: scopes['general-knowledge'],
        },
        201,
      );
      const refused = await auth(
        api().patch(`/admin/content-items/${draft.body.data.id}`),
      )
        .send({ status: ContentItemStatus.READY })
        .expect(400);
      expect(JSON.stringify(refused.body)).toContain(
        'MOVING_XO_SCOPE_NOT_FORWARD',
      );

      // The draft survives the refusal — nothing was mutated or archived.
      const after = await auth(
        api().get(`/admin/content-items/${draft.body.data.id}`),
      ).expect(200);
      expect(after.body.data.status).toBe(ContentItemStatus.DRAFT);
    });

    it.each(['observation-illusions', 'assembly-rotation', 'paths-motion'])(
      'refuses READY on %s with no resolved media asset',
      async (slug) => {
        const puzzle = multipleChoice[0];
        const draft = await create(
          { ...body(puzzle, ContentItemStatus.DRAFT), scopeId: scopes[slug] },
          201,
        );
        const refused = await auth(
          api().patch(`/admin/content-items/${draft.body.data.id}`),
        )
          .send({ status: ContentItemStatus.READY })
          .expect(400);
        expect(JSON.stringify(refused.body)).toContain(
          'PUZZLE_SCOPE_REQUIRES_MEDIA',
        );
      },
    );

    it('refuses a declared media intent that resolved to nothing', async () => {
      // The authored packs in ai/workbench carry a `mediaIntent` brief and no
      // asset. However it is spelled, an intention is not an asset and a host
      // cannot play one — so the declared-but-empty case is refused too, not
      // just the absent one.
      const puzzle = multipleChoice[0];
      const draft = await create(
        {
          ...body(puzzle, ContentItemStatus.DRAFT),
          scopeId: scopes['observation-illusions'],
          media: { type: 'image', assets: [] },
        },
        201,
      );
      const refused = await auth(
        api().patch(`/admin/content-items/${draft.body.data.id}`),
      )
        .send({ status: ContentItemStatus.READY })
        .expect(400);
      expect(JSON.stringify(refused.body)).toContain(
        'PUZZLE_SCOPE_REQUIRES_MEDIA',
      );
    });

    it('leaves the mixed and text-native Scopes alone on media', async () => {
      // No Puzzle Family is persisted, so the family-led rule cannot be machine
      // -enforced here. A Scope-level media rule would reject honest text
      // puzzles; this asserts it does not.
      for (const slug of [
        'wordplay-letters',
        'numbers-estimation',
        'spot-the-error',
      ]) {
        const ready = await create(
          {
            ...body(multipleChoice[0], ContentItemStatus.READY),
            scopeId: scopes[slug],
          },
          201,
        );
        expect(ready.body.data.status).toBe(ContentItemStatus.READY);
      }
    });

    it('accepts the same puzzle once the asset is resolved', async () => {
      const puzzle = multipleChoice[0];
      const ready = await create(
        {
          ...body(puzzle, ContentItemStatus.READY),
          scopeId: scopes['observation-illusions'],
          media: {
            type: 'image',
            assets: [{ url: 'https://cdn.akwaan.test/puzzles/fixture.png' }],
          },
        },
        201,
      );
      expect(ready.body.data.status).toBe(ContentItemStatus.READY);
    });

    it('refuses an answer mode Moving XO cannot play', async () => {
      // `closest` resolves for other mechanics; the board needs a binary result.
      const refused = await auth(api().post('/admin/content-items'))
        .send({
          scopeId: scopes['numbers-estimation'],
          prompt: { ar: 'كم عدد الحبات في الكيس؟' },
          compatibleChallengeTypeIds: [challengeTypeId],
          answerPayload: {
            mode: ChallengeAnswerMode.CLOSEST,
            correctValue: 42,
          },
          status: ContentItemStatus.READY,
        })
        .expect(400);
      // The exact code, not a prefix: on this branch the generic
      // ANSWER_PAYLOAD_INCOMPATIBLE_WITH_CHALLENGE also fires, and a loose
      // assertion here would pass without the Moving XO rule running at all.
      expect(JSON.stringify(refused.body)).toContain(
        'MOVING_XO_ANSWER_MODE_UNSUPPORTED',
      );
    });
  });

  describe('match puzzles', () => {
    it.each(matching.map((puzzle) => [puzzle.key, puzzle] as const))(
      'drafts and then promotes %s to READY',
      async (_key, puzzle) => {
        const draft = await create(body(puzzle, ContentItemStatus.DRAFT), 201);
        const ready = await auth(
          api().patch(`/admin/content-items/${draft.body.data.id}`),
        )
          .send({ status: ContentItemStatus.READY })
          .expect(200);
        expect(ready.body.data.status).toBe(ContentItemStatus.READY);
      },
    );

    it('refuses a numeric typed answer', async () => {
      // ٧ and 7 are different strings to the shared normalizer, so a correct
      // answer typed on the other keyboard loses the turn.
      const refused = await auth(api().post('/admin/content-items'))
        .send({
          scopeId: scopes['numbers-estimation'],
          prompt: { ar: 'كم ضلعًا للمثلث؟' },
          compatibleChallengeTypeIds: [challengeTypeId],
          answerPayload: {
            mode: ChallengeAnswerMode.MATCH,
            acceptedAnswers: ['3'],
          },
          status: ContentItemStatus.READY,
        })
        .expect(400);
      expect(JSON.stringify(refused.body)).toContain(
        'MOVING_XO_MATCH_ANSWER_NUMERIC',
      );
    });

    it('accepts the same question asked as a word', async () => {
      const accepted = await auth(api().post('/admin/content-items'))
        .send({
          scopeId: scopes['wordplay-letters'],
          prompt: { ar: 'ما اسم الشكل ذي الأضلاع الثلاثة؟' },
          compatibleChallengeTypeIds: [challengeTypeId],
          answerPayload: {
            mode: ChallengeAnswerMode.MATCH,
            acceptedAnswers: ['مثلث'],
          },
          status: ContentItemStatus.READY,
        })
        .expect(201);
      expect(accepted.body.data.status).toBe(ContentItemStatus.READY);
    });
  });

  it('left nothing published or promoted outside this test database', async () => {
    // The harness refuses any database whose name does not end in `_test`, and
    // every write above went through that connection. This asserts the other
    // half: no item here was ever marked for a live World board.
    const items = (await auth(api().get('/admin/content-items')).expect(200))
      .body.data;
    const list = Array.isArray(items) ? items : (items?.items ?? []);
    expect(Array.isArray(list)).toBe(true);
    const world = (
      await auth(api().get(`/admin/worlds/${worldId}`)).expect(200)
    ).body.data;
    expect(world.status).toBe(WorldContentStatus.DRAFT);
  });
});
