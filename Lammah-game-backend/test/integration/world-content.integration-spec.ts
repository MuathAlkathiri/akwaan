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
  ContentItemStatus,
  WorldChallengeSlotKey,
  WorldChallengeSlotType,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../../src/modules/scoring/domain/scoring-rule';

describe('World Management HTTP integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;

  const presentation = (overrides: Record<string, unknown> = {}) => ({
    inputType: 'phone-multiple-choice',
    timerSeconds: 25,
    soundPack: null,
    revealStyle: null,
    ...overrides,
  });

  beforeAll(async () => {
    database = await connectTestDatabase();
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp();
    token = await loginForToken(app, fixtureCredentials.admin);
  });

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  const authed = () => request(app.getHttpServer());
  const bearer = <T extends request.Test>(value: T): T =>
    value.set('Authorization', `Bearer ${token}`) as T;

  const createChallengeType = async (
    body: Record<string, unknown>,
    expected = 201,
  ) => {
    const response = await bearer(authed().post('/admin/challenge-types'))
      .send(body)
      .expect(expected);
    return response.body.data;
  };

  const createWorld = async (name: string, slug: string) => {
    const response = await bearer(authed().post('/admin/worlds'))
      .send({ name, slug })
      .expect(201);
    return response.body.data;
  };

  it('requires an admin token', async () => {
    await authed().get('/admin/worlds').expect(401);
    await authed().get('/admin/challenge-types').expect(401);
    await authed().get('/admin/content-items').expect(401);
  });

  it('serves every rule the admin UI needs so the client restates none of them', async () => {
    const response = await bearer(
      authed().get('/admin/challenge-types/metadata'),
    ).expect(200);
    const metadata = response.body.data;

    expect(
      metadata.families.find(
        (family: { value: string }) =>
          family.value === ChallengeFamily.SIGNATURE,
      ),
    ).toMatchObject({
      mustBeExclusive: true,
      allowedAnswerModes: expect.arrayContaining([ChallengeAnswerMode.RYO]),
    });
    expect(
      metadata.scoringRules.map((rule: { id: string }) => rule.id),
    ).toEqual(expect.arrayContaining([SCORING_RULE_IDS.RYO_PAYOFF_MATRIX]));

    // Board composition and answer-mode compatibility come from the same
    // constants the policies enforce.
    expect(metadata.boardSlotCount).toBe(4);
    expect(metadata.slots).toEqual([
      {
        key: WorldChallengeSlotKey.SIGNATURE,
        slotType: WorldChallengeSlotType.SIGNATURE,
        allowedFamilies: [ChallengeFamily.SIGNATURE],
      },
      {
        key: WorldChallengeSlotKey.RYO_1,
        slotType: WorldChallengeSlotType.RYO,
        allowedFamilies: [ChallengeFamily.RYO],
      },
      {
        key: WorldChallengeSlotKey.RYO_2,
        slotType: WorldChallengeSlotType.RYO,
        allowedFamilies: [ChallengeFamily.RYO],
      },
      {
        key: WorldChallengeSlotKey.FLEX,
        slotType: WorldChallengeSlotType.FLEX,
        allowedFamilies: [ChallengeFamily.COOP, ChallengeFamily.RELATIONAL],
      },
    ]);
    expect(
      metadata.answerModeCompatibility.find(
        (entry: { challengeAnswerMode: string }) =>
          entry.challengeAnswerMode === ChallengeAnswerMode.RYO,
      ).itemAnswerModes,
    ).toEqual([
      ChallengeAnswerMode.RYO,
      ChallengeAnswerMode.MULTIPLE_CHOICE,
      ChallengeAnswerMode.CLOSEST,
    ]);
  });

  it('keeps challenge type slugs globally unique', async () => {
    await createChallengeType({
      name: 'Read Your Opponent',
      slug: 'ryo-shared',
      family: ChallengeFamily.RYO,
      answerMode: ChallengeAnswerMode.RYO,
      defaultPresentation: presentation(),
      scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      status: WorldContentStatus.ACTIVE,
    });
    const conflict = await bearer(authed().post('/admin/challenge-types'))
      .send({
        name: 'Another mechanic with the same identifier',
        slug: 'ryo-shared',
        family: ChallengeFamily.RYO,
        answerMode: ChallengeAnswerMode.RYO,
        defaultPresentation: presentation(),
        scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      })
      .expect(400);
    expect(JSON.stringify(conflict.body)).toContain(
      'CHALLENGE_TYPE_SLUG_TAKEN',
    );
  });

  it('rejects an unregistered scoring rule and an impossible family/answer-mode pair', async () => {
    const unregistered = await bearer(authed().post('/admin/challenge-types'))
      .send({
        name: 'Invented scoring',
        slug: 'invented-scoring',
        family: ChallengeFamily.RYO,
        answerMode: ChallengeAnswerMode.RYO,
        defaultPresentation: presentation(),
        scoringRuleId: 'ryo.invented',
      })
      .expect(400);
    expect(JSON.stringify(unregistered.body)).toContain(
      'SCORING_RULE_NOT_REGISTERED',
    );

    const mismatched = await bearer(authed().post('/admin/challenge-types'))
      .send({
        name: 'RYO that splits',
        slug: 'ryo-that-splits',
        family: ChallengeFamily.RYO,
        answerMode: ChallengeAnswerMode.SPLIT,
        defaultPresentation: presentation(),
        scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      })
      .expect(400);
    expect(JSON.stringify(mismatched.body)).toContain(
      'ANSWER_MODE_NOT_ALLOWED_FOR_FAMILY',
    );
  });

  it('runs a World from draft to activation and blocks every incomplete step', async () => {
    const world = await createWorld('Football', 'football');
    expect(world.status).toBe(WorldContentStatus.DRAFT);
    expect(world.readiness.readiness).toBe('not_ready');

    // A World cannot be created active: there is no board to validate yet.
    const premature = await bearer(authed().post('/admin/worlds'))
      .send({
        name: 'Premature',
        slug: 'premature',
        status: WorldContentStatus.ACTIVE,
      })
      .expect(400);
    expect(JSON.stringify(premature.body)).toContain(
      'WORLD_ACTIVATION_REQUIRES_BOARD',
    );

    const signature = await createChallengeType({
      name: 'Formation Builder',
      slug: 'formation-builder',
      family: ChallengeFamily.SIGNATURE,
      answerMode: ChallengeAnswerMode.MULTIPLE_CHOICE,
      defaultPresentation: presentation({ inputType: 'phone-drag' }),
      scoringRuleId: SCORING_RULE_IDS.SIGNATURE_DECLARED_BY_MECHANIC,
      status: WorldContentStatus.ACTIVE,
    });
    const ryoTwo = await createChallengeType({
      name: 'Read the numbers',
      slug: 'ryo-numbers',
      family: ChallengeFamily.RYO,
      answerMode: ChallengeAnswerMode.RYO,
      defaultPresentation: presentation({ inputType: 'phone-slider' }),
      scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      status: WorldContentStatus.ACTIVE,
    });
    const relational = await createChallengeType({
      name: 'Same Wavelength',
      slug: 'same-wavelength',
      family: ChallengeFamily.RELATIONAL,
      answerMode: ChallengeAnswerMode.VOTE,
      defaultPresentation: presentation({ inputType: 'phone-vote' }),
      scoringRuleId: SCORING_RULE_IDS.RELATIONAL_ITEM_SUCCESS,
      status: WorldContentStatus.ACTIVE,
    });
    const sharedRyo = (
      await bearer(authed().get('/admin/challenge-types')).expect(200)
    ).body.data.find(
      (challengeType: { slug: string }) => challengeType.slug === 'ryo-shared',
    );

    // Exclusivity is derived from the family, not from the request body.
    expect(signature.isExclusive).toBe(true);
    expect(relational.isExclusive).toBe(false);

    const scope = (
      await bearer(authed().post(`/admin/worlds/${world.id}/scopes`))
        .send({
          name: 'World Cup',
          slug: 'world-cup',
          status: WorldContentStatus.ACTIVE,
        })
        .expect(201)
    ).body.data;

    const configure = (body: Record<string, unknown>) =>
      bearer(
        authed().post(`/admin/worlds/${world.id}/challenge-configurations`),
      ).send(body);

    await configure({
      challengeTypeId: signature.id,
      slotKey: WorldChallengeSlotKey.SIGNATURE,
      isEnabled: true,
    }).expect(201);
    // One canonical mechanic fills both RYO positions — no duplicate definition
    // and no per-World rename.
    await configure({
      challengeTypeId: sharedRyo.id,
      slotKey: WorldChallengeSlotKey.RYO_1,
      isEnabled: true,
      sortOrder: 1,
    }).expect(201);
    await configure({
      challengeTypeId: sharedRyo.id,
      slotKey: WorldChallengeSlotKey.RYO_2,
      isEnabled: true,
      sortOrder: 2,
    }).expect(201);

    // A globally fixed mechanic refuses a World-specific label outright.
    const renamed = await bearer(
      authed().post(`/admin/worlds/${world.id}/challenge-configurations`),
    )
      .send({
        challengeTypeId: ryoTwo.id,
        slotKey: WorldChallengeSlotKey.RYO_2,
        displayName: 'اقرأ الأرقام',
      })
      .expect(409);
    expect(JSON.stringify(renamed.body)).toContain('BOARD_SLOT_ALREADY_FILLED');

    // Three slots configured: still not activatable.
    const missingFlex = await bearer(
      authed().patch(`/admin/worlds/${world.id}`),
    )
      .send({
        status: WorldContentStatus.ACTIVE,
        signatureMechanicId: signature.id,
      })
      .expect(400);
    expect(JSON.stringify(missingFlex.body)).toContain(
      'BOARD_SLOT_COUNT_MISMATCH',
    );

    await configure({
      challengeTypeId: relational.id,
      slotKey: WorldChallengeSlotKey.FLEX,
      isEnabled: true,
      sortOrder: 3,
    }).expect(201);

    // A board position holds exactly one configuration.
    const duplicate = await configure({
      challengeTypeId: relational.id,
      slotKey: WorldChallengeSlotKey.FLEX,
    }).expect(409);
    expect(JSON.stringify(duplicate.body)).toContain(
      'BOARD_SLOT_ALREADY_FILLED',
    );

    // The Signature reference must match the configured Signature slot.
    const mismatchedSignature = await bearer(
      authed().patch(`/admin/worlds/${world.id}`),
    )
      .send({
        status: WorldContentStatus.ACTIVE,
        signatureMechanicId: ryoTwo.id,
      })
      .expect(400);
    expect(JSON.stringify(mismatchedSignature.body)).toContain(
      'SIGNATURE_MECHANIC_MISMATCH',
    );

    const activated = await bearer(authed().patch(`/admin/worlds/${world.id}`))
      .send({
        status: WorldContentStatus.ACTIVE,
        signatureMechanicId: signature.id,
      })
      .expect(200);
    expect(activated.body.data.status).toBe(WorldContentStatus.ACTIVE);

    const readiness = (
      await bearer(authed().get(`/admin/worlds/${world.id}/readiness`)).expect(
        200,
      )
    ).body.data;
    expect(readiness.blockers).toEqual([]);
    expect(readiness.boardReady).toBe(true);
    expect(readiness.hasRelationalFlexSlot).toBe(true);
    expect(readiness.board.slots).toHaveLength(4);
    // The mechanic's own name is what players see: one name in every World.
    expect(
      readiness.board.slots.map(
        (slot: { displayName: string }) => slot.displayName,
      ),
    ).toEqual([
      'Formation Builder',
      'Read Your Opponent',
      'Read Your Opponent',
      'Same Wavelength',
    ]);
    expect(
      readiness.board.slots.map((slot: { slotKey: string }) => slot.slotKey),
    ).toEqual(['signature', 'ryo_1', 'ryo_2', 'flex']);

    // A valid board may not be regressed while the World is active.
    const flexSlot = readiness.board.slots.find(
      (slot: { slotType: string }) =>
        slot.slotType === WorldChallengeSlotType.FLEX,
    );
    const refusedRemoval = await bearer(
      authed().delete(
        `/admin/challenge-configurations/${flexSlot.configurationId}`,
      ),
    ).expect(400);
    expect(JSON.stringify(refusedRemoval.body)).toContain(
      'BOARD_SLOT_COUNT_MISMATCH',
    );

    // Scope exclusions must not silently pass: dropping below four blocks the World.
    const breakingExclusion = await bearer(
      authed().patch(`/admin/scopes/${scope.id}`),
    )
      .send({ excludedChallengeTypeIds: [relational.id] })
      .expect(400);
    expect(JSON.stringify(breakingExclusion.body)).toContain(
      'SCOPE_EXCLUSIONS_BELOW_BOARD_MINIMUM',
    );

    // A three-World match needs three board-ready Worlds.
    const selection = await bearer(
      authed().post('/admin/worlds/validate-match-selection'),
    )
      .send({ worldIds: [world.id] })
      .expect(201);
    expect(
      selection.body.data.blockers.map((issue: { code: string }) => issue.code),
    ).toContain('MATCH_WORLD_COUNT_INVALID');
  });

  it('shares one mechanic across Worlds with no per-World presentation', async () => {
    const anime = await createWorld('Anime', 'anime');
    const sharedRyo = (
      await bearer(authed().get('/admin/challenge-types')).expect(200)
    ).body.data.find(
      (challengeType: { slug: string }) => challengeType.slug === 'ryo-shared',
    );
    const signature = (
      await bearer(authed().get('/admin/challenge-types')).expect(200)
    ).body.data.find(
      (challengeType: { slug: string }) =>
        challengeType.slug === 'formation-builder',
    );

    // Sharing the mechanic itself is allowed.
    await bearer(
      authed().post(`/admin/worlds/${anime.id}/challenge-configurations`),
    )
      .send({
        challengeTypeId: sharedRyo.id,
        slotKey: WorldChallengeSlotKey.RYO_1,
        isEnabled: true,
      })
      .expect(201);

    const readiness = (
      await bearer(authed().get(`/admin/worlds/${anime.id}/readiness`)).expect(
        200,
      )
    ).body.data;
    const codes = readiness.blockers.map(
      (issue: { code: string }) => issue.code,
    );
    // A shared mechanic is intentionally identical in every World: Worlds differ
    // through their Signature mechanic and their content, not by renaming or
    // reconfiguring a shared one.
    expect(codes).not.toContain('INSUFFICIENT_PRESENTATION_DIFFERENTIATION');
    expect(codes).toContain('BOARD_SLOT_COUNT_MISMATCH');
    // An exclusive Signature mechanic cannot be borrowed by a second World.
    const exclusive = await bearer(
      authed().post(`/admin/worlds/${anime.id}/challenge-configurations`),
    )
      .send({
        challengeTypeId: signature.id,
        slotKey: WorldChallengeSlotKey.SIGNATURE,
        isEnabled: true,
      })
      .expect(201);
    expect(exclusive.body.data.id).toEqual(expect.any(String));
    const afterExclusive = (
      await bearer(authed().get(`/admin/worlds/${anime.id}/readiness`)).expect(
        200,
      )
    ).body.data;
    expect(
      afterExclusive.blockers.map((issue: { code: string }) => issue.code),
    ).toContain('EXCLUSIVE_CHALLENGE_TYPE_SHARED');
  });

  it('validates content items centrally and refuses legacy fields', async () => {
    const worlds = (await bearer(authed().get('/admin/worlds')).expect(200))
      .body.data;
    const football = worlds.find(
      (world: { slug: string }) => world.slug === 'football',
    );
    const scope = (
      await bearer(authed().get(`/admin/worlds/${football.id}/scopes`)).expect(
        200,
      )
    ).body.data[0];
    const challengeTypes = (
      await bearer(authed().get('/admin/challenge-types')).expect(200)
    ).body.data;
    const sharedRyo = challengeTypes.find(
      (challengeType: { slug: string }) => challengeType.slug === 'ryo-shared',
    );
    const relational = challengeTypes.find(
      (challengeType: { slug: string }) =>
        challengeType.slug === 'same-wavelength',
    );

    const created = (
      await bearer(authed().post('/admin/content-items'))
        .send({
          scopeId: scope.id,
          prompt: { ar: 'من فاز بكأس العالم 2018؟' },
          compatibleChallengeTypeIds: [sharedRyo.id],
          answerPayload: {
            mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
            options: [
              { id: 'france', label: { ar: 'فرنسا' } },
              { id: 'croatia', label: { ar: 'كرواتيا' } },
            ],
            correctOptionId: 'france',
          },
          status: ContentItemStatus.READY,
        })
        .expect(201)
    ).body.data;
    // The World is derived from the Scope, never sent by the client.
    expect(created.worldId).toBe(football.id);
    expect(created.status).toBe(ContentItemStatus.READY);
    expect(created.readiness.blockers).toEqual([]);
    expect(created.isReusableAcrossSessions).toBe(false);

    const legacy = await bearer(authed().post('/admin/content-items'))
      .send({
        scopeId: scope.id,
        prompt: { ar: 'سؤال قديم' },
        compatibleChallengeTypeIds: [sharedRyo.id],
        answerPayload: {
          mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
          options: [
            { id: 'a', label: { ar: 'أ' } },
            { id: 'b', label: { ar: 'ب' } },
          ],
          correctOptionId: 'a',
        },
        points: 400,
        difficulty: 'hard',
      })
      .expect(400);
    // forbidNonWhitelisted keeps legacy fields out at the transport boundary.
    expect(JSON.stringify(legacy.body)).toMatch(/points|difficulty/);

    const badOption = await bearer(authed().post('/admin/content-items'))
      .send({
        scopeId: scope.id,
        prompt: { ar: 'سؤال' },
        compatibleChallengeTypeIds: [sharedRyo.id],
        answerPayload: {
          mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
          options: [
            { id: 'a', label: { ar: 'أ' } },
            { id: 'b', label: { ar: 'ب' } },
          ],
          correctOptionId: 'missing',
        },
        status: ContentItemStatus.READY,
      })
      .expect(400);
    expect(JSON.stringify(badOption.body)).toContain(
      'CORRECT_OPTION_NOT_IN_OPTIONS',
    );

    const relationalItem = (
      await bearer(authed().post('/admin/content-items'))
        .send({
          scopeId: scope.id,
          prompt: { ar: 'من أول من يترك المجموعة؟' },
          compatibleChallengeTypeIds: [relational.id],
          answerPayload: {
            mode: ChallengeAnswerMode.VOTE,
            consensusRule: 'majority',
          },
        })
        .expect(201)
    ).body.data;
    // Relational-only content defaults to reusable across sessions (6.4).
    expect(relationalItem.isReusableAcrossSessions).toBe(true);
    expect(relationalItem.isSessionReuseExempt).toBe(true);

    const listed = (
      await bearer(
        authed().get(`/admin/content-items?worldId=${football.id}`),
      ).expect(200)
    ).body.data;
    expect(listed).toHaveLength(2);
  });

  it('lets an active World with an incomplete board be repaired', async () => {
    // A World left active by legacy data has an invalid board. If board edits
    // were refused while active it could never be completed, so repair is
    // allowed; only regressing a currently valid board is refused.
    const legacyWorld = await createWorld('Legacy', 'legacy-active');
    const coop = await createChallengeType({
      name: 'Split Clue',
      slug: 'split-clue',
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.SPLIT,
      defaultPresentation: presentation({
        inputType: 'phone-split',
        timerSeconds: 45,
      }),
      scoringRuleId: SCORING_RULE_IDS.COOP_ITEM_SUCCESS,
      status: WorldContentStatus.ACTIVE,
    });
    await database.db
      ?.collection('worlds')
      .updateOne(
        { slug: 'legacy-active' },
        { $set: { status: WorldContentStatus.ACTIVE } },
      );

    // Repairing an already-invalid active World is allowed.
    await bearer(
      authed().post(`/admin/worlds/${legacyWorld.id}/challenge-configurations`),
    )
      .send({
        challengeTypeId: coop.id,
        slotKey: WorldChallengeSlotKey.FLEX,
        isEnabled: true,
      })
      .expect(201);

    // Still incomplete, so it stays repairable rather than locked.
    const readiness = (
      await bearer(
        authed().get(`/admin/worlds/${legacyWorld.id}/readiness`),
      ).expect(200)
    ).body.data;
    expect(readiness.boardReady).toBe(false);
    expect(readiness.board.slots).toHaveLength(1);
  });

  it('refuses to delete a mechanic that a World still configures', async () => {
    const challengeTypes = (
      await bearer(authed().get('/admin/challenge-types')).expect(200)
    ).body.data;
    const sharedRyo = challengeTypes.find(
      (challengeType: { slug: string }) => challengeType.slug === 'ryo-shared',
    );
    expect(sharedRyo.worldConfigurationCount).toBeGreaterThan(0);
    const conflict = await bearer(
      authed().delete(`/admin/challenge-types/${sharedRyo.id}`),
    ).expect(409);
    expect(JSON.stringify(conflict.body)).toContain('CHALLENGE_TYPE_IN_USE');
  });
});
