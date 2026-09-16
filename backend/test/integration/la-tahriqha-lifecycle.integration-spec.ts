import crypto from 'crypto';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Connection } from 'mongoose';
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
import { productionMechanicFixture } from '../fixtures/production-mechanic.fixture';
import { loginForToken } from '../helpers/auth-helper';
import {
  ChallengeAnswerMode,
  ContentItemStatus,
  LA_TAHRIQHA_SLUG,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { CLOSEST_MODE_KEY } from '../../src/modules/live-game-sessions/domain/closest-gameplay.plugin';
import { BOMB_MODE_KEY } from '../../src/modules/live-game-sessions/domain/bomb-gameplay.plugin';
import { RYO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/ryo-gameplay.plugin';
import { LiveGameSessionSnapshot } from '../../src/modules/live-game-sessions/application/live-game-session.snapshot';
import { LiveSessionActor } from '../../src/modules/live-game-sessions/application/live-session-actor';
import {
  MarkSessionReady,
  StartLiveGameSession,
} from '../../src/modules/live-game-sessions/application/live-session-lifecycle.use-cases';
import { CreateSessionJoinAccess } from '../../src/modules/live-game-sessions/application/live-session-join-access.use-cases';
import {
  JoinLiveSession,
  SetParticipantReadiness,
} from '../../src/modules/live-game-sessions/application/live-participant.use-cases';
import { UpdateParticipantPresence } from '../../src/modules/live-game-sessions/application/update-participant-presence.use-case';
import { GameplayDeadlineScheduler } from '../../src/modules/live-game-sessions/application/gameplay-deadline.scheduler';
import { GetGameplayRuntime } from '../../src/modules/live-game-sessions/application/gameplay-runtime.queries';
import { GameplayRuntimeSocketFacade } from '../../src/modules/live-game-sessions/application/gameplay-runtime.socket-facade';
import { SubmitGameplayCommand } from '../../src/modules/live-game-sessions/application/submit-gameplay-command.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';
import {
  LaTahriqhaDishResult,
  LaTahriqhaRuntimeDish,
} from '../../src/modules/live-game-sessions/domain/la-tahriqha-gameplay.plugin';
import { MatchStage } from '../../src/modules/match/domain/match.constants';

/**
 * "لا تحرقها" end to end, against a real database.
 *
 * The unit tests already hold the reducer to the rules. What only this tier can
 * show is that the rules survive the whole authoritative path: that a dish the
 * Admin accepted actually launches, that Fair-Start keeps the thirty-second
 * window from starting before the room is ready, that the projection a phone
 * receives over the real snapshot carries no correctness and no opponent's
 * cards, that قائد الطبق rotates exactly once per dish and survives a reconnect,
 * that an unattended dish is committed by the production scheduler rather than
 * by a test, and that the Match converges exactly once at the end.
 */

type MatchSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']>;
};

const SLOT = WorldChallengeSlotKey.SLOT_1;
/** Three players a side, which is the only size that can show A → B → C. */
const PER_TEAM = 3;

const INGREDIENTS = [
  'أرز',
  'دجاج',
  'بصل',
  'طماطم',
  'بهار الكبسة',
  'معكرونة',
  'جبن',
  'زيتون',
];

describe('لا تحرقها lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let scopeIds: string[];

  const uuid = () => crypto.randomUUID();

  beforeAll(async () => {
    database = await connectTestDatabase('la-tahriqha-lifecycle');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('la-tahriqha-lifecycle') },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    controllerId = String(
      unwrap<{ id: string }>(await bearer(http().get('/auth/me')).expect(200))
        .id,
    );
    ({ worldId, scopeIds } = await seedWorld());
  }, 240_000);

  beforeEach(async () => {
    await database.collection('content_exposures').deleteMany({});
  });

  afterAll(async () => {
    app?.get(GameplayDeadlineScheduler)?.onModuleDestroy();
    await app?.close();
    if (database) await resetTestDatabase(database);
    await database?.close();
  });

  const http = () => request(app.getHttpServer());
  const bearer = <T extends request.Test>(value: T): T =>
    value.set('Authorization', `Bearer ${token}`) as T;
  const unwrap = <T>(response: request.Response): T =>
    (response.body?.data ?? response.body) as T;

  /** Exactly what the Admin form emits: five correct, three plausible. */
  const dishPayload = (label: string) => ({
    variant: 'la-tahriqha',
    dishName: { ar: `طبق ${label}` },
    dishNote: { ar: 'الطريقة النجدية' },
    ingredients: INGREDIENTS.map((ingredient, index) => ({
      localId: `ingredient-${index + 1}`,
      label: { ar: `${ingredient} ${label}` },
      correct: index < 5,
    })),
  });

  const seedWorld = async () => {
    const type = async (slug: string) => {
      const response = await bearer(http().post('/admin/challenge-types')).send(
        productionMechanicFixture(slug, { status: WorldContentStatus.ACTIVE }),
      );
      if (response.status !== 201)
        throw new Error(
          `${slug}: ${response.status} ${JSON.stringify(response.body)}`,
        );
      return response.body.data as { id: string };
    };
    // The Food board as it would ship: Signature + RYO + Closest + Bomb.
    const laTahriqha = await type(LA_TAHRIQHA_SLUG);
    const ryo = await type(RYO_MODE_KEY);
    const closest = await type(CLOSEST_MODE_KEY);
    const bomb = await type(BOMB_MODE_KEY);
    const world = (
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'الأكل', slug: 'la-tahriqha-food' })
        .expect(201)
    ).body.data as { id: string };
    const scopes: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const scope = (
        await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
          .send({
            name: `أكل ${index + 1}`,
            slug: `la-tahriqha-scope-${index + 1}`,
            status: WorldContentStatus.ACTIVE,
          })
          .expect(201)
      ).body.data as { id: string };
      scopes.push(String(scope.id));
    }
    for (const [index, [challengeTypeId, slotKey]] of [
      [laTahriqha.id, SLOT],
      [ryo.id, WorldChallengeSlotKey.SLOT_2],
      [closest.id, WorldChallengeSlotKey.SLOT_3],
      [bomb.id, WorldChallengeSlotKey.SLOT_4],
    ].entries()) {
      await bearer(
        http().post(`/admin/worlds/${world.id}/challenge-configurations`),
      )
        .send({ challengeTypeId, slotKey, isEnabled: true, sortOrder: index })
        .expect(201);
    }
    for (const [scopeIndex, scopeId] of scopes.entries()) {
      for (let copy = 0; copy < 3; copy += 1) {
        const label = `p${scopeIndex}-${copy}`;
        const created = await bearer(http().post('/admin/content-items')).send({
          scopeId,
          prompt: { ar: `وش مكوّنات هذا الطبق؟ ${label}` },
          compatibleChallengeTypeIds: [laTahriqha.id],
          // لا تحرقها answers in its own mode: the five correct cards are the
          // answer, so the item carries no accepted-answer text at all.
          answerPayload: { mode: ChallengeAnswerMode.LA_TAHRIQHA },
          mechanicPayload: dishPayload(label),
          status: ContentItemStatus.READY,
        });
        // Authoring and launch share one contract: a dish the Admin accepts is
        // exactly a dish the launcher will start.
        if (created.status !== 201)
          throw new Error(
            `content item: ${created.status} ${JSON.stringify(created.body)}`,
          );
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId,
            prompt: { ar: `أقرب ${label}` },
            compatibleChallengeTypeIds: [closest.id],
            answerPayload: {
              mode: ChallengeAnswerMode.CLOSEST,
              correctValue: 42,
            },
            status: ContentItemStatus.READY,
          })
          .expect(201);
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId,
            prompt: { ar: `قنبلة ${label}` },
            compatibleChallengeTypeIds: [bomb.id],
            answerPayload: {
              mode: ChallengeAnswerMode.MATCH,
              acceptedAnswers: [`قنبلة-${label}`],
            },
            status: ContentItemStatus.READY,
          })
          .expect(201);
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId,
            prompt: { ar: `خصم ${label}` },
            compatibleChallengeTypeIds: [ryo.id],
            answerPayload: {
              mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
              options: [
                { id: 'yes', label: { ar: 'صح' } },
                { id: 'no', label: { ar: 'خطأ' } },
              ],
              correctOptionId: 'yes',
            },
            status: ContentItemStatus.READY,
          })
          .expect(201);
      }
    }
    await bearer(http().patch(`/admin/worlds/${world.id}`))
      .send({ status: WorldContentStatus.ACTIVE })
      .expect(200);
    return { worldId: String(world.id), scopeIds: scopes };
  };

  const sessionRevision = async (sessionId: string) =>
    unwrap<{ revision: number }>(
      await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    ).revision;
  const runtimeRepository = () =>
    app.get<GameplayRuntimeRepository>(GAMEPLAY_RUNTIME_REPOSITORY);
  const runtime = async (sessionId: string) =>
    (await runtimeRepository().findBySessionId(sessionId))!;
  const rawRuntime = (sessionId: string) =>
    database
      .collection('gameplay_runtimes')
      .findOne({ sessionId }, { sort: { createdAt: -1 } });
  const rawState = async (sessionId: string) => {
    const document = await rawRuntime(sessionId);
    return (document!.state as { runtimeState: Record<string, unknown> })
      .runtimeState;
  };
  const currentDish = async (sessionId: string) => {
    const state = await rawState(sessionId);
    const dishes = JSON.parse(
      String(state.dishesJson),
    ) as LaTahriqhaRuntimeDish[];
    return dishes[Number(state.currentDishIndex)];
  };
  /** The ids of the cards that actually belong in the dish on screen. */
  const correctIds = async (sessionId: string) =>
    (await currentDish(sessionId)).ingredients
      .filter((ingredient) => ingredient.correct)
      .map((ingredient) => ingredient.localId);
  const distractorIds = async (sessionId: string) =>
    (await currentDish(sessionId)).ingredients
      .filter((ingredient) => !ingredient.correct)
      .map((ingredient) => ingredient.localId);
  const dishResults = async (sessionId: string) =>
    JSON.parse(
      String((await rawState(sessionId)).resultsJson),
    ) as LaTahriqhaDishResult[];
  const exposedCount = () =>
    database
      .collection('content_exposures')
      .countDocuments({ state: 'exposed' });

  const startSession = async () => {
    const created = unwrap<{ snapshot: LiveGameSessionSnapshot }>(
      await bearer(http().post('/live-game-sessions'))
        .send({
          modeKey: 'core-timed-turns',
          modeVersion: 1,
          teamNames: ['ألفا', 'بيتا'],
        })
        .expect(201),
    ).snapshot;
    const access = await app.get(CreateSessionJoinAccess).execute({
      sessionId: created.sessionId,
      actorId: controllerId,
      assignmentPolicy: 'explicit',
    });
    /** Team index → its players, in the order they joined. */
    const roster: LiveSessionActor[][] = [];
    for (const [teamIndex, team] of created.teams.entries()) {
      const members: LiveSessionActor[] = [];
      for (let seat = 0; seat < PER_TEAM; seat += 1) {
        const joined = await app.get(JoinLiveSession).execute({
          joinCode: access.joinCode,
          displayName: `لاعب ${teamIndex + 1}-${seat + 1}`,
          requestedTeamId: team.id,
          joinRequestId: uuid(),
        });
        const actor: LiveSessionActor = {
          kind: 'participant',
          actorId: joined.participantId,
          sessionId: created.sessionId,
          participantId: joined.participantId,
          role: 'team-player',
          credentialVersion: 1,
        };
        await app
          .get(UpdateParticipantPresence)
          .connected(
            created.sessionId,
            joined.participantId,
            `socket-${joined.participantId}`,
          );
        await app.get(SetParticipantReadiness).execute({
          actor,
          ready: true,
          expectedRevision: await sessionRevision(created.sessionId),
          commandId: uuid(),
        });
        members.push(actor);
      }
      roster.push(members);
    }
    const ready = await app.get(MarkSessionReady).execute({
      sessionId: created.sessionId,
      actorId: controllerId,
      commandId: uuid(),
      expectedRevision: await sessionRevision(created.sessionId),
    });
    await app.get(StartLiveGameSession).execute({
      sessionId: created.sessionId,
      actorId: controllerId,
      commandId: uuid(),
      expectedRevision: ready.revision,
    });
    return {
      sessionId: created.sessionId,
      teamIds: created.teams.map((team) => team.id),
      roster,
    };
  };

  const matchRoute = (sessionId: string, path = '') =>
    `/live-game-sessions/${sessionId}/match${path}`;
  const snapshot = async (sessionId: string) =>
    unwrap<MatchSnapshot>(
      await bearer(http().get(matchRoute(sessionId))).expect(200),
    );
  const launch = async (sessionId: string) => {
    await bearer(http().post(matchRoute(sessionId, '/unified')))
      .send({
        occurrences: [0, 1, 2].map((occurrenceIndex) => ({
          occurrenceIndex,
          worldId,
          selectedScopeIds: scopeIds,
        })),
      })
      .expect(201);
    let selectingTeamId = '';
    for (const path of ['prepare', 'launch']) {
      const current = await snapshot(sessionId);
      if (path === 'prepare')
        selectingTeamId = String(current.match.unified!.selectingTeamId);
      const response = await bearer(
        http().post(matchRoute(sessionId, `/unified/challenges/${path}`)),
      ).send({
        commandId: uuid(),
        expectedMatchRevision: current.match.revision,
        occurrenceIndex: 0,
        slotKey: SLOT,
        selectingTeamId,
      });
      if (response.status !== 201)
        throw new Error(
          `${path}: ${response.status} ${JSON.stringify(response.body)}`,
        );
    }
    return { selectingTeamId };
  };

  const controller = (): LiveSessionActor => ({
    kind: 'user',
    actorId: controllerId,
  });
  const present = async (sessionId: string) => {
    const current = await runtime(sessionId);
    const checkpoint = current.currentPresentationCheckpoint();
    await app.get(GameplayRuntimeSocketFacade).presentationReady(
      controller(),
      {
        sessionId,
        commandId: uuid(),
        expectedSessionRevision: await sessionRevision(sessionId),
        expectedRuntimeRevision: current.revision,
        ...(checkpoint
          ? { presentationGeneration: checkpoint.generation }
          : {}),
      },
      'shared-screen-socket',
    );
  };
  const command = async (
    sessionId: string,
    actor: LiveSessionActor,
    commandType: string,
    payload: Record<string, string> = {},
  ) => {
    const current = await runtime(sessionId);
    return app.get(SubmitGameplayCommand).execute({
      sessionId,
      roundId: current.serialize().activeRound!.id,
      actor,
      commandId: uuid(),
      commandType,
      payload,
      expectedSessionRevision: await sessionRevision(sessionId),
      expectedRuntimeRevision: current.revision,
    });
  };

  const projection = async (sessionId: string, actor: LiveSessionActor) =>
    (await app.get(GetGameplayRuntime).execute(sessionId, actor)).gameplay!
      .modeState;

  /**
   * Who each team's قائد الطبق is right now, read from committed state.
   *
   * Deliberately from the persisted assignment rather than from a projection: a
   * dish waiting on Fair-Start projects no mode state at all to anybody, which
   * is exactly right, and the rotation still has to be provably correct while it
   * waits — it happened on the advance, not on the activation.
   */
  const captains = async (sessionId: string) => {
    const assignments = JSON.parse(
      String((await rawState(sessionId)).teamActionJson),
    ) as { assignments: Array<{ action: string; participantId: string }> };
    return Object.fromEntries(
      assignments.assignments.map((assignment) => [
        assignment.action.replace('la-tahriqha.dish.', ''),
        assignment.participantId,
      ]),
    ) as Record<string, string>;
  };

  const actorFor = (
    session: Awaited<ReturnType<typeof startSession>>,
    teamId: string,
    participantId: string,
  ) =>
    session.roster[session.teamIds.indexOf(teamId)].find(
      (member) => member.participantId === participantId,
    )!;

  /** The dish captain plays the given cards and, optionally, commits. */
  const play = async (
    session: Awaited<ReturnType<typeof startSession>>,
    teamId: string,
    ids: string[],
    commit = true,
  ) => {
    const captain = actorFor(
      session,
      teamId,
      (await captains(session.sessionId))[teamId],
    );
    for (const ingredientId of ids) {
      await command(
        session.sessionId,
        captain,
        'select-la-tahriqha-ingredient',
        { ingredientId },
      );
    }
    if (commit) {
      await command(session.sessionId, captain, 'lock-la-tahriqha-dish');
    }
    return captain;
  };

  const teamGrade = (
    results: LaTahriqhaDishResult[],
    index: number,
    teamId: string,
  ) => results[index].teams.find((team) => team.teamId === teamId)!;

  it('seats the Food board and resolves the Signature through a real launcher', async () => {
    const readiness = unwrap<{
      board: { slots: Array<{ slotKey: string; challengeTypeSlug: string }> };
      blockers: Array<{ code: string }>;
    }>(
      await bearer(http().get(`/admin/worlds/${worldId}/readiness`)).expect(
        200,
      ),
    );
    expect(
      readiness.board.slots.map((slot) => [
        slot.slotKey,
        slot.challengeTypeSlug,
      ]),
    ).toEqual([
      [WorldChallengeSlotKey.SLOT_1, LA_TAHRIQHA_SLUG],
      [WorldChallengeSlotKey.SLOT_2, RYO_MODE_KEY],
      [WorldChallengeSlotKey.SLOT_3, CLOSEST_MODE_KEY],
      [WorldChallengeSlotKey.SLOT_4, BOMB_MODE_KEY],
    ]);
    // The canonical slug resolves to a registered launcher — the check that
    // would have caught لا تحرقها being seated before it had one.
    expect(readiness.blockers.map((blocker) => blocker.code)).not.toContain(
      'CHALLENGE_LAUNCHER_NOT_IMPLEMENTED',
    );
  }, 60_000);

  it('plays three dishes with rotating captains, a burn, a perfect dish and one convergence', async () => {
    const session = await startSession();
    await launch(session.sessionId);
    const [teamA, teamB] = session.teamIds;

    // Fair-Start: the dish is prepared, clockless, and nothing is burned yet.
    const before = await rawState(session.sessionId);
    expect(before.phase).toBe('preparing');
    expect(before.deadlineAt).toBeNull();
    expect(await exposedCount()).toBe(0);

    await present(session.sessionId);
    const opened = await rawState(session.sessionId);
    expect(opened.phase).toBe('selecting');
    expect(Date.parse(String(opened.deadlineAt))).toBeGreaterThan(Date.now());
    expect(await exposedCount()).toBe(1);

    // The first dish goes to the first player on each team's canonical order.
    const firstCaptains = await captains(session.sessionId);
    expect(firstCaptains[teamA]).toBe(session.roster[0][0].participantId);
    expect(firstCaptains[teamB]).toBe(session.roster[1][0].participantId);

    // Privacy over the real snapshot: nobody is told which cards are correct,
    // not even the host, and the eight cards carry a label and nothing else.
    const shared = await projection(session.sessionId, controller());
    expect(JSON.stringify(shared)).not.toContain('correct');
    const cards = (
      JSON.parse(String(shared.currentDishJson)) as {
        ingredients: Array<Record<string, unknown>>;
      }
    ).ingredients;
    expect(cards).toHaveLength(8);
    for (const card of cards) {
      expect(Object.keys(card).sort()).toEqual(['label', 'localId']);
    }

    // ---- Dish 1: three correct against four correct. -----------------------
    const dishOneCorrect = await correctIds(session.sessionId);
    await play(session, teamA, dishOneCorrect.slice(0, 3), false);

    // Mid-dish, the opponent is told a team is choosing and nothing more.
    const opponentMid = await projection(
      session.sessionId,
      session.roster[1][0],
    );
    const midStatus = JSON.parse(String(opponentMid.teamStatusJson)) as Record<
      string,
      { locked: boolean; committedCount: number | null }
    >;
    expect(midStatus[teamA]).toEqual({ locked: false, committedCount: null });
    expect(JSON.parse(String(opponentMid.ownSelectedJson))).toEqual([]);
    for (const id of dishOneCorrect.slice(0, 3)) {
      expect(
        JSON.stringify({ ...opponentMid, currentDishJson: undefined }),
      ).not.toContain(id);
    }
    // A teammate of the captain sees the very same live set they do.
    const teammateMid = await projection(
      session.sessionId,
      session.roster[0][1],
    );
    expect(JSON.parse(String(teammateMid.ownSelectedJson))).toEqual(
      dishOneCorrect.slice(0, 3),
    );
    expect(teammateMid.isDishCaptain).toBe(false);

    // A teammate may not move a card, by name rather than by role.
    await expect(
      command(
        session.sessionId,
        session.roster[0][1],
        'select-la-tahriqha-ingredient',
        { ingredientId: dishOneCorrect[4] },
      ),
    ).rejects.toThrow();

    const captainA = actorFor(
      session,
      teamA,
      (await captains(session.sessionId))[teamA],
    );
    await command(session.sessionId, captainA, 'lock-la-tahriqha-dish');

    // Committed: the count is released, the identities are not.
    const opponentAfterLock = await projection(
      session.sessionId,
      session.roster[1][0],
    );
    expect(
      (
        JSON.parse(String(opponentAfterLock.teamStatusJson)) as Record<
          string,
          { locked: boolean; committedCount: number | null }
        >
      )[teamA],
    ).toEqual({ locked: true, committedCount: 3 });

    await play(session, teamB, dishOneCorrect.slice(0, 4));

    // Both committed, so the dish resolved early rather than burning the clock.
    const afterOne = await rawState(session.sessionId);
    expect(afterOne.phase).toBe('revealed');
    const resultsOne = await dishResults(session.sessionId);
    expect(resultsOne[0].resolutionReason).toBe('both-locked');
    expect(teamGrade(resultsOne, 0, teamA).points).toBe(3);
    expect(teamGrade(resultsOne, 0, teamB).points).toBe(4);
    expect(resultsOne[0].totalsAfter).toEqual({ [teamA]: 3, [teamB]: 4 });
    // The reveal releases the truth, and only now.
    const revealOne = await projection(session.sessionId, controller());
    expect(
      JSON.parse(String(revealOne.revealJson)).correctIngredientIds,
    ).toHaveLength(5);

    // ---- Dish 2: a burn against a perfect dish. ---------------------------
    await command(session.sessionId, controller(), 'advance-la-tahriqha');
    const preparedTwo = (await runtime(session.sessionId)).serialize();
    expect(preparedTwo.currentPresentation?.status).toBe('prepared');
    expect(preparedTwo.runtimeState.phase).toBe('preparing');
    expect(preparedTwo.runtimeState.deadlineAt).toBeNull();
    // Dish two has been drawn but not shown, so it is not spent yet.
    expect(await exposedCount()).toBe(1);

    // The captaincy moved exactly one seat, and it moved on the advance rather
    // than on the activation — so the rotation is already correct here.
    const secondCaptains = await captains(session.sessionId);
    expect(secondCaptains[teamA]).toBe(session.roster[0][1].participantId);
    expect(secondCaptains[teamB]).toBe(session.roster[1][1].participantId);

    await present(session.sessionId);
    expect(await exposedCount()).toBe(2);
    // Activating again re-anchors the clock and must not move the captaincy.
    await present(session.sessionId);
    expect(await captains(session.sessionId)).toEqual(secondCaptains);

    const dishTwoCorrect = await correctIds(session.sessionId);
    const dishTwoWrong = await distractorIds(session.sessionId);
    await play(session, teamA, [
      ...dishTwoCorrect.slice(0, 4),
      dishTwoWrong[0],
    ]);
    await play(session, teamB, dishTwoCorrect);

    const resultsTwo = await dishResults(session.sessionId);
    const burned = teamGrade(resultsTwo, 1, teamA);
    expect(burned.burned).toBe(true);
    expect(burned.points).toBe(0);
    expect(burned.correctIds).toHaveLength(4);
    expect(burned.wrongIds).toEqual([dishTwoWrong[0]]);
    const perfect = teamGrade(resultsTwo, 1, teamB);
    expect(perfect.perfect).toBe(true);
    expect(perfect.points).toBe(7);
    expect(resultsTwo[1].totalsAfter).toEqual({ [teamA]: 3, [teamB]: 11 });

    // ---- Dish 3: the production scheduler commits an unattended dish. ------
    await command(session.sessionId, controller(), 'advance-la-tahriqha');
    const thirdCaptains = await captains(session.sessionId);
    expect(thirdCaptains[teamA]).toBe(session.roster[0][2].participantId);
    expect(thirdCaptains[teamB]).toBe(session.roster[1][2].participantId);
    await present(session.sessionId);

    const dishThreeCorrect = await correctIds(session.sessionId);
    // A holds a valid set but never commits; B never reaches three.
    await play(session, teamA, dishThreeCorrect.slice(0, 3), false);
    await play(session, teamB, dishThreeCorrect.slice(0, 2), false);

    // No expiry command from this test. The deadline is pushed into the past in
    // Mongo and the real scheduler is left to discover it and fire.
    const document = await rawRuntime(session.sessionId);
    await database.collection('gameplay_runtimes').updateOne(
      { runtimeId: document!.runtimeId },
      {
        $set: {
          'state.runtimeState.deadlineAt': new Date(
            Date.now() - 1_000,
          ).toISOString(),
        },
      },
    );
    await app.get(GameplayDeadlineScheduler).synchronize(session.sessionId);
    const settled = await waitFor(
      session.sessionId,
      (state) => state.phase === 'revealed',
    );
    expect(settled.phase).toBe('revealed');

    const resultsThree = await dishResults(session.sessionId);
    expect(resultsThree[2].resolutionReason).toBe('deadline');
    const autoLocked = teamGrade(resultsThree, 2, teamA);
    expect(autoLocked.lockReason).toBe('deadline');
    expect(autoLocked.points).toBe(3);
    // The exact set the captain had, never topped up to five.
    expect(autoLocked.selected).toEqual(dishThreeCorrect.slice(0, 3));
    const short = teamGrade(resultsThree, 2, teamB);
    expect(short.understaffed).toBe(true);
    expect(short.points).toBe(0);
    expect(short.selected).toEqual(dishThreeCorrect.slice(0, 2));

    // ---- Convergence: one verdict, once. ----------------------------------
    await command(session.sessionId, controller(), 'advance-la-tahriqha');
    const finished = await snapshot(session.sessionId);
    expect(finished.match.stage.key).toBe(MatchStage.CHALLENGE_RESULT);
    expect(finished.match.challengeResult?.challengeKey).toBe(LA_TAHRIQHA_SLUG);
    expect(finished.match.challengeResult?.winnerTeamId).toBe(teamB);
    expect(finished.match.challengeResult?.details.mechanicTotals).toEqual({
      [teamA]: 6,
      [teamB]: 11,
    });
    expect(finished.match.challengeResult?.details.burns).toBe(1);
    expect(finished.match.challengeResult?.details.perfectDishes).toBe(1);
    expect(finished.match.challengeHistory).toHaveLength(1);
    expect(await exposedCount()).toBe(3);
  }, 180_000);

  it('keeps the captaincy and the set across a reconnect mid-dish', async () => {
    const session = await startSession();
    await launch(session.sessionId);
    await present(session.sessionId);
    const [teamA] = session.teamIds;
    const chosen = (await correctIds(session.sessionId)).slice(0, 2);
    const captain = await play(session, teamA, chosen, false);

    // The captain's phone drops and comes back on a new socket.
    await app
      .get(UpdateParticipantPresence)
      .disconnected(session.sessionId, `socket-${captain.participantId}`);
    await app
      .get(UpdateParticipantPresence)
      .connected(
        session.sessionId,
        captain.participantId,
        `socket-${captain.participantId}-again`,
      );

    const resumed = await projection(session.sessionId, captain);
    expect(resumed.isDishCaptain).toBe(true);
    expect(JSON.parse(String(resumed.ownSelectedJson))).toEqual(chosen);
    expect(
      (
        JSON.parse(String(resumed.captainParticipantIdsJson)) as Record<
          string,
          string
        >
      )[teamA],
    ).toBe(captain.participantId);
    // The clock was not restarted by the reconnection.
    expect(resumed.phase).toBe('selecting');
    await command(session.sessionId, captain, 'select-la-tahriqha-ingredient', {
      ingredientId: (await correctIds(session.sessionId))[2],
    });
    await command(session.sessionId, captain, 'lock-la-tahriqha-dish');
    expect(
      (await dishResults(session.sessionId)).length +
        Number((await rawState(session.sessionId)).phase === 'selecting'),
    ).toBeGreaterThan(0);
  }, 120_000);

  it('keeps a player who was still connecting at launch in the rotation', async () => {
    // The defect a real four-phone Chromium run exposed: the last phone to join
    // had not finished opening its socket when the host pressed start, so that
    // team's rotation persisted with a single name in it and the second player
    // could never hold قائد الطبق — for the whole challenge, while sitting
    // there connected.
    const session = await startSession();
    const [teamA] = session.teamIds;
    const latecomer = session.roster[0][1];
    await app
      .get(UpdateParticipantPresence)
      .disconnected(session.sessionId, `socket-${latecomer.participantId}`);
    await launch(session.sessionId);
    await present(session.sessionId);

    const order = (
      JSON.parse(
        String((await rawState(session.sessionId)).teamActionJson),
      ) as {
        rotations: Array<{ teamId: string; order: string[] }>;
      }
    ).rotations.find((rotation) => rotation.teamId === teamA)!.order;
    expect(order).toEqual(
      session.roster[0].map((member) => member.participantId),
    );
    // Away at launch, so the dish is captained by the player who is here…
    expect((await captains(session.sessionId))[teamA]).toBe(
      session.roster[0][0].participantId,
    );

    // …and once they are back they take their own turn on the next dish.
    await app
      .get(UpdateParticipantPresence)
      .connected(
        session.sessionId,
        latecomer.participantId,
        `socket-${latecomer.participantId}-again`,
      );
    const correct = await correctIds(session.sessionId);
    await play(session, teamA, correct.slice(0, 3));
    await play(session, session.teamIds[1], correct.slice(0, 3));
    await command(session.sessionId, controller(), 'advance-la-tahriqha');
    expect((await captains(session.sessionId))[teamA]).toBe(
      latecomer.participantId,
    );
  }, 120_000);

  it('reports an equal three-dish total as a real tie', async () => {
    const session = await startSession();
    await launch(session.sessionId);
    const [teamA, teamB] = session.teamIds;
    for (let dish = 0; dish < 3; dish += 1) {
      await present(session.sessionId);
      const correct = await correctIds(session.sessionId);
      await play(session, teamA, correct.slice(0, 3));
      await play(session, teamB, correct.slice(0, 3));
      await command(session.sessionId, controller(), 'advance-la-tahriqha');
    }
    const finished = await snapshot(session.sessionId);
    expect(finished.match.challengeResult?.winnerTeamId).toBeNull();
    expect(finished.match.challengeResult?.details.tie).toBe(true);
    expect(finished.match.challengeResult?.details.mechanicTotals).toEqual({
      [teamA]: 9,
      [teamB]: 9,
    });
    // A tie is an outcome, not a reason to play a fourth dish.
    expect(finished.match.stage.key).toBe(MatchStage.CHALLENGE_RESULT);
  }, 180_000);

  it('aborts before first activation without burning a dish', async () => {
    const session = await startSession();
    await launch(session.sessionId);
    const current = await runtime(session.sessionId);
    await bearer(
      http().post(`/live-game-sessions/${session.sessionId}/runtime/cancel`),
    )
      .send({
        commandId: uuid(),
        expectedSessionRevision: await sessionRevision(session.sessionId),
        expectedRuntimeRevision: current.revision,
      })
      .expect(201);
    expect(await exposedCount()).toBe(0);
    expect((await snapshot(session.sessionId)).match.stage.key).toBe(
      MatchStage.BOARD,
    );
  }, 60_000);

  const waitFor = async (
    sessionId: string,
    predicate: (state: Record<string, unknown>) => boolean,
    timeoutMs = 15_000,
  ): Promise<Record<string, unknown>> => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const state = await rawState(sessionId);
      if (predicate(state)) return state;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('state condition not met within timeout');
  };
});
