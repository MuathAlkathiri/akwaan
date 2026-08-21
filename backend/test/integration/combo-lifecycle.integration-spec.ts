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
  COMBO_SLUG,
  ChallengeAnswerMode,
  ContentItemStatus,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { CLOSEST_MODE_KEY } from '../../src/modules/live-game-sessions/domain/closest-gameplay.plugin';
import { ONE_CLUE_MODE_KEY } from '../../src/modules/live-game-sessions/domain/one-clue-gameplay.plugin';
import { RYO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/ryo-gameplay.plugin';
import {
  MatchSlotStatus,
  MatchStage,
} from '../../src/modules/match/domain/match.constants';
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
import { GetLiveGameSession } from '../../src/modules/live-game-sessions/application/get-live-game-session.use-case';
import { SubmitGameplayCommand } from '../../src/modules/live-game-sessions/application/submit-gameplay-command.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../../src/modules/match/persistence/match.repository';
import {
  COMBO_MODE_KEY,
  COMBO_QUESTION_SECONDS,
  COMBO_RUN_HANDOVER_SECONDS,
  ComboPlannedQuestion,
} from '../../src/modules/live-game-sessions/domain/combo-gameplay.plugin';

/**
 * "الكومبو" on real replica-set Mongo.
 *
 * The plugin spec proves the state machine in isolation. This proves the parts
 * only a real stack can: that the eight-question plan is actually drawn from the
 * Match's own Anime Scopes and persisted before play, that the two clocks
 * (question and hand-over) cannot be confused for one another, that the secret
 * كسر الكومبو survives the *snapshot projection path* rather than only the
 * plugin call, and that the challenge converges, aborts and recovers exactly
 * like every other mechanic.
 *
 * Every ChallengeType, Scope and ContentItem here is created inside this suite's
 * own isolated database. Nothing touches the normal runtime catalog.
 */

type MatchBearingSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']> & {
    unified: NonNullable<
      NonNullable<LiveGameSessionSnapshot['match']>['unified']
    >;
  };
};

const COMBO_SLOT = WorldChallengeSlotKey.SLOT_1;

describe('combo lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let scopeIds: string[];
  let foreignScopeId: string;
  let foreignItemIds: string[];

  const uuid = () => crypto.randomUUID();

  beforeAll(async () => {
    database = await connectTestDatabase('combo-lifecycle');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('combo-lifecycle') },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    controllerId = await currentUserId();
    ({ worldId, scopeIds, foreignScopeId, foreignItemIds } = await seedWorld());
  }, 240_000);

  /**
   * A fresh content history for every scenario.
   *
   * These 30 tests all play as the same fixture account against the same twelve
   * seeded items, so the per-account no-repeat rule would legitimately exhaust it
   * after the first couple of launches. That rule is proven in its own suite; this
   * one is about the Combo lifecycle, so it starts each scenario with the history
   * a real first-time account would have.
   */
  beforeEach(async () => {
    await database.collection('content_exposures').deleteMany({});
  });

  afterAll(async () => {
    app?.get(GameplayDeadlineScheduler).onModuleDestroy();
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  const http = () => request(app.getHttpServer());
  const bearer = <T extends request.Test>(value: T): T =>
    value.set('Authorization', `Bearer ${token}`) as T;
  const unwrap = <T>(response: request.Response): T =>
    (response.body?.data ?? response.body) as T;

  const currentUserId = async () =>
    String(
      unwrap<{ id: string }>(await bearer(http().get('/auth/me')).expect(200))
        .id,
    );

  /**
   * An Anime-shaped World whose first slot is Combo.
   *
   * A fifth Scope is seeded deliberately outside the four the Match selects, so
   * "no out-of-scope item may appear" is a claim this suite can actually falsify.
   */
  const seedWorld = async () => {
    const challengeType = async (slug: string) => {
      const response = await bearer(http().post('/admin/challenge-types')).send(
        productionMechanicFixture(slug, { status: WorldContentStatus.ACTIVE }),
      );
      if (response.status !== 201) {
        throw new Error(
          `challenge-type ${slug} -> ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
      return response.body.data as { id: string };
    };

    const combo = await challengeType(COMBO_SLUG);
    const closest = await challengeType(CLOSEST_MODE_KEY);
    const oneClue = await challengeType(ONE_CLUE_MODE_KEY);
    const ryo = await challengeType(RYO_MODE_KEY);

    const world = (
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'الأنمي', slug: 'combo-anime' })
        .expect(201)
    ).body.data as { id: string };

    const scopes: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const scope = (
        await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
          .send({
            name: `نطاق ${index}`,
            slug: `combo-scope-${index}`,
            status: WorldContentStatus.ACTIVE,
          })
          .expect(201)
      ).body.data as { id: string };
      scopes.push(String(scope.id));
    }
    const selected = scopes.slice(0, 4);
    const outsideSelection = scopes[4];

    const configure = (body: Record<string, unknown>) =>
      bearer(
        http().post(`/admin/worlds/${world.id}/challenge-configurations`),
      ).send(body);
    for (const [index, [challengeTypeId, slotKey]] of [
      [combo.id, COMBO_SLOT],
      [closest.id, WorldChallengeSlotKey.SLOT_2],
      [oneClue.id, WorldChallengeSlotKey.SLOT_3],
      [ryo.id, WorldChallengeSlotKey.SLOT_4],
    ].entries()) {
      await configure({
        challengeTypeId,
        slotKey,
        isEnabled: true,
        sortOrder: index,
      }).expect(201);
    }

    /**
     * Combo items carrying an authored stage.
     *
     * Three per stage per Scope, so the selector has genuine choice and a
     * relaunch is possible. The answer is derived from the item's own identity
     * so a test can answer any drawn question correctly without knowing which
     * one it got.
     */
    const seedCombo = async (scopeId: string, label: string) => {
      const ids: string[] = [];
      for (const stage of [1, 2, 3, 4]) {
        for (let copy = 0; copy < 3; copy += 1) {
          const response = await bearer(
            http().post('/admin/content-items'),
          ).send({
            scopeId,
            prompt: { ar: `${label} مرحلة ${stage} #${copy}` },
            compatibleChallengeTypeIds: [combo.id],
            answerPayload: {
              mode: ChallengeAnswerMode.MATCH,
              acceptedAnswers: [answerFor(scopeId, stage, copy)],
            },
            mechanicPayload: { comboStage: stage },
            status: ContentItemStatus.READY,
          });
          if (response.status !== 201) {
            throw new Error(
              `combo item -> ${response.status} ${JSON.stringify(response.body)}`,
            );
          }
          ids.push(String((response.body.data as { id: string }).id));
        }
      }
      return ids;
    };

    const comboIds: string[] = [];
    for (const [index, scopeId] of selected.entries()) {
      comboIds.push(...(await seedCombo(scopeId, `كومبو ${index}`)));
    }
    // Same mechanic, same World, but a Scope this Match never selects.
    const foreignIds = await seedCombo(outsideSelection, 'خارج النطاق');

    // The other three slots need content so a unified Match can be created.
    const seedOther = async (
      mechanicId: string,
      answerPayload: Record<string, unknown>,
      label: string,
      mechanicPayload?: Record<string, unknown>,
    ) => {
      for (const scopeId of selected) {
        for (let round = 0; round < 3; round += 1) {
          await bearer(http().post('/admin/content-items'))
            .send({
              scopeId,
              prompt: { ar: `${label} ${round}` },
              compatibleChallengeTypeIds: [mechanicId],
              answerPayload,
              ...(mechanicPayload ? { mechanicPayload } : {}),
              status: ContentItemStatus.READY,
            })
            .expect(201);
        }
      }
    };
    await seedOther(
      closest.id,
      { mode: ChallengeAnswerMode.CLOSEST, correctValue: 42 },
      'أقرب',
    );
    await seedOther(
      oneClue.id,
      { mode: ChallengeAnswerMode.MATCH, acceptedAnswers: ['ميسي'] },
      'بدليل',
      {
        clues: [5, 4, 3, 2, 1].map((value, index) => ({
          order: index + 1,
          value,
          text: { ar: `دليل ${index + 1}` },
        })),
      },
    );
    await seedOther(
      ryo.id,
      {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'right', label: { ar: 'صحيح' } },
          { id: 'wrong', label: { ar: 'خطأ' } },
        ],
        correctOptionId: 'right',
      },
      'اقرأ',
    );

    await bearer(http().patch(`/admin/worlds/${world.id}`))
      .send({ status: WorldContentStatus.ACTIVE })
      .expect(200);

    return {
      worldId: String(world.id),
      scopeIds: selected,
      comboItemIds: comboIds,
      foreignScopeId: String(outsideSelection),
      foreignItemIds: foreignIds,
    };
  };

  const answerFor = (scopeId: string, stage: number, copy: number) =>
    `answer-${scopeId}-${stage}-${copy}`;

  /** A live session with two teams, each holding one ready, connected phone. */
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
    const sessionId = created.sessionId;
    const teamIds = created.teams.map((team) => team.id);

    const access = await app.get(CreateSessionJoinAccess).execute({
      sessionId,
      actorId: controllerId,
      assignmentPolicy: 'explicit',
    });
    const participants: LiveSessionActor[] = [];
    for (const [index, teamId] of teamIds.entries()) {
      const joined = await app.get(JoinLiveSession).execute({
        joinCode: access.joinCode,
        displayName: `لاعب ${index}`,
        requestedTeamId: teamId,
        joinRequestId: uuid(),
      });
      const actor: LiveSessionActor = {
        kind: 'participant',
        actorId: joined.participantId,
        sessionId,
        participantId: joined.participantId,
        role: 'team-player',
        credentialVersion: 1,
      };
      await app
        .get(UpdateParticipantPresence)
        .connected(
          sessionId,
          joined.participantId,
          `socket-${joined.participantId}`,
        );
      await app.get(SetParticipantReadiness).execute({
        actor,
        ready: true,
        expectedRevision: await sessionRevision(sessionId),
        commandId: uuid(),
      });
      participants.push(actor);
    }
    const ready = await app.get(MarkSessionReady).execute({
      sessionId,
      actorId: controllerId,
      commandId: uuid(),
      expectedRevision: await sessionRevision(sessionId),
    });
    await app.get(StartLiveGameSession).execute({
      sessionId,
      actorId: controllerId,
      commandId: uuid(),
      expectedRevision: ready.revision,
    });
    return { sessionId, teamIds, participants };
  };

  const sessionRevision = async (sessionId: string) =>
    unwrap<{ revision: number }>(
      await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    ).revision;

  const matchRoute = (sessionId: string, path = '') =>
    `/live-game-sessions/${sessionId}/match${path}`;

  const snapshotOf = async (sessionId: string) =>
    unwrap<MatchBearingSnapshot>(
      await bearer(http().get(matchRoute(sessionId))).expect(200),
    );

  const createUnified = async (sessionId: string) =>
    unwrap<MatchBearingSnapshot>(
      await bearer(http().post(matchRoute(sessionId, '/unified')))
        .send({
          occurrences: [0, 1, 2].map((occurrenceIndex) => ({
            occurrenceIndex,
            worldId,
            selectedScopeIds: scopeIds,
          })),
        })
        .expect(201),
    );

  const launch = async (
    sessionId: string,
    slotKey: WorldChallengeSlotKey = COMBO_SLOT,
    expected = 201,
  ) => {
    const send = async (path: 'prepare' | 'launch', expectStatus?: number) => {
      const current = await snapshotOf(sessionId);
      const response = await bearer(
        http().post(matchRoute(sessionId, `/unified/challenges/${path}`)),
      ).send({
        commandId: uuid(),
        expectedMatchRevision: current.match.revision,
        occurrenceIndex: 0,
        slotKey,
        selectingTeamId: current.match.unified.selectingTeamId,
      });
      if (expectStatus !== undefined && response.status !== expectStatus) {
        // The body is the whole diagnosis when a launch is refused; a bare
        // status assertion would hide it.
        throw new Error(
          `${path} -> ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
      return response;
    };
    const stage = (await snapshotOf(sessionId)).match.stage.key;
    if (stage !== MatchStage.PREFLIGHT) {
      const prepared = await send('prepare');
      if (prepared.status !== 201) {
        expect(prepared.status).toBe(expected);
        return prepared;
      }
    }
    return send('launch', expected);
  };

  const runtimes = () =>
    app.get<GameplayRuntimeRepository>(GAMEPLAY_RUNTIME_REPOSITORY);
  const matches = () => app.get<MatchRepository>(MATCH_REPOSITORY);

  const rawRuntime = async (sessionId: string) =>
    database
      .collection('gameplay_runtimes')
      .findOne({ sessionId }, { sort: { createdAt: -1 } });

  /** The persisted plan, as the server actually stored it. */
  const planOf = async (sessionId: string) => {
    const document = await rawRuntime(sessionId);
    return JSON.parse(
      String(
        (document!.state as { runtimeState: Record<string, unknown> })
          .runtimeState.questionPlanJson,
      ),
    ) as ComboPlannedQuestion[][];
  };

  const runtimeStateOf = async (sessionId: string) => {
    const document = await rawRuntime(sessionId);
    return (document!.state as { runtimeState: Record<string, unknown> })
      .runtimeState;
  };

  /** Drive a mode command as the given actor, through the production use case. */
  const command = async (
    sessionId: string,
    actor: LiveSessionActor,
    commandType: string,
    payload: Record<string, unknown> = {},
  ) => {
    const runtime = (await runtimes().findBySessionId(sessionId))!;
    const roundId = runtime.serialize().activeRound!.id;
    return app.get(SubmitGameplayCommand).execute({
      sessionId,
      roundId,
      actor,
      commandId: uuid(),
      commandType,
      payload,
      expectedSessionRevision: await sessionRevision(sessionId),
      expectedRuntimeRevision: runtime.revision,
    });
  };

  const controllerActor = (): LiveSessionActor => ({
    kind: 'user',
    actorId: controllerId,
  });

  /** Answer whatever question is currently open, correctly. */
  const answerCurrent = async (sessionId: string, actor: LiveSessionActor) => {
    const state = await runtimeStateOf(sessionId);
    const plan = await planOf(sessionId);
    const question = plan[Number(state.runIndex)][Number(state.questionIndex)];
    return command(sessionId, actor, 'submit-combo-answer', {
      answer: question.acceptedAnswers[0],
    });
  };

  /** Force the persisted deadline into the past without touching gameplay. */
  const expireDeadlineInMongo = async (sessionId: string) => {
    const document = await rawRuntime(sessionId);
    const state = document!.state as {
      runtimeState: Record<string, unknown>;
    };
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
    return state;
  };

  /**
   * A second World whose Combo content stops at stage 3.
   *
   * Built once, lazily, so the healthy World above stays untouched — starving a
   * stage by mutating shared fixtures would make every other test order-dependent.
   */
  let starvedWorld: { worldId: string; scopeIds: string[] } | undefined;
  const seedStarvedWorld = async () => {
    if (starvedWorld) return starvedWorld;
    // ChallengeType slugs are globally unique, so this World reuses the same
    // mechanics as the healthy one. Only its *content* is deliberately short.
    const typeOf = async (slug: string) => {
      const listed = unwrap<Array<{ id: string; slug: string }>>(
        await bearer(http().get('/admin/challenge-types')).expect(200),
      );
      const found = listed.find((entry) => entry.slug === slug);
      if (!found) throw new Error(`challenge type ${slug} not seeded`);
      return { id: String(found.id) };
    };
    const combo = await typeOf(COMBO_SLUG);
    const closest = await typeOf(CLOSEST_MODE_KEY);
    const oneClue = await typeOf(ONE_CLUE_MODE_KEY);
    const ryo = await typeOf(RYO_MODE_KEY);
    const world = (
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'أنمي ناقص', slug: 'combo-starved' })
        .expect(201)
    ).body.data as { id: string };
    const scopes: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const scope = (
        await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
          .send({
            name: `ناقص ${index}`,
            slug: `starved-scope-${index}`,
            status: WorldContentStatus.ACTIVE,
          })
          .expect(201)
      ).body.data as { id: string };
      scopes.push(String(scope.id));
    }
    for (const [index, [challengeTypeId, slotKey]] of [
      [combo.id, COMBO_SLOT],
      [closest.id, WorldChallengeSlotKey.SLOT_2],
      [oneClue.id, WorldChallengeSlotKey.SLOT_3],
      [ryo.id, WorldChallengeSlotKey.SLOT_4],
    ].entries()) {
      await bearer(
        http().post(`/admin/worlds/${world.id}/challenge-configurations`),
      )
        .send({ challengeTypeId, slotKey, isEnabled: true, sortOrder: index })
        .expect(201);
    }
    for (const scopeId of scopes) {
      // Stages 1-3 only. Stage 4 is deliberately absent.
      for (const stage of [1, 2, 3]) {
        for (let copy = 0; copy < 3; copy += 1) {
          await bearer(http().post('/admin/content-items'))
            .send({
              scopeId,
              prompt: { ar: `ناقص ${stage}-${copy}` },
              compatibleChallengeTypeIds: [combo.id],
              answerPayload: {
                mode: ChallengeAnswerMode.MATCH,
                acceptedAnswers: [`starved-${stage}-${copy}`],
              },
              mechanicPayload: { comboStage: stage },
              status: ContentItemStatus.READY,
            })
            .expect(201);
        }
      }
      for (const [mechanicId, payload, extra] of [
        [
          closest.id,
          { mode: ChallengeAnswerMode.CLOSEST, correctValue: 42 },
          undefined,
        ],
        [
          oneClue.id,
          { mode: ChallengeAnswerMode.MATCH, acceptedAnswers: ['ميسي'] },
          {
            clues: [5, 4, 3, 2, 1].map((value, index) => ({
              order: index + 1,
              value,
              text: { ar: `دليل ${index + 1}` },
            })),
          },
        ],
        [
          ryo.id,
          {
            mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
            options: [
              { id: 'right', label: { ar: 'صحيح' } },
              { id: 'wrong', label: { ar: 'خطأ' } },
            ],
            correctOptionId: 'right',
          },
          undefined,
        ],
      ] as Array<
        [string, Record<string, unknown>, Record<string, unknown> | undefined]
      >) {
        for (let round = 0; round < 3; round += 1) {
          await bearer(http().post('/admin/content-items'))
            .send({
              scopeId,
              prompt: { ar: `حشو ${round}` },
              compatibleChallengeTypeIds: [mechanicId],
              answerPayload: payload,
              ...(extra ? { mechanicPayload: extra } : {}),
              status: ContentItemStatus.READY,
            })
            .expect(201);
        }
      }
    }
    await bearer(http().patch(`/admin/worlds/${world.id}`))
      .send({ status: WorldContentStatus.ACTIVE })
      .expect(200);
    starvedWorld = { worldId: String(world.id), scopeIds: scopes };
    return starvedWorld;
  };

  /** Abort through the production Back-to-Board route. */
  const abort = async (sessionId: string) => {
    const runtime = (await runtimes().findBySessionId(sessionId))!;
    const response = await bearer(
      http().post(`/live-game-sessions/${sessionId}/runtime/cancel`),
    ).send({
      commandId: uuid(),
      expectedSessionRevision: await sessionRevision(sessionId),
      expectedRuntimeRevision: runtime.revision,
    });
    // The route answers 201: cancelling creates a new authoritative transition.
    if (response.status !== 201) {
      throw new Error(
        `abort -> ${response.status} ${JSON.stringify(response.body)}`,
      );
    }
    return response;
  };

  /** A launched Combo challenge with Team A on question 1. */
  const launchedCombo = async () => {
    const session = await startSession();
    await createUnified(session.sessionId);
    await launch(session.sessionId);
    return session;
  };

  describe('launch and the persisted question plan', () => {
    it('binds the challenge and opens Team A on question 1 of 4', async () => {
      const { sessionId, teamIds } = await launchedCombo();

      const snapshot = await snapshotOf(sessionId);
      expect(snapshot.match.currentChallenge?.challengeKey).toBe(
        COMBO_MODE_KEY,
      );
      const state = await runtimeStateOf(sessionId);
      expect(state.phase).toBe('question');
      expect(state.runIndex).toBe(0);
      expect(state.questionIndex).toBe(0);
      expect(state.unbankedPoints).toBe(0);
      expect(JSON.parse(String(state.teamIdsJson))).toEqual(teamIds);
    });

    it('persists 8 unique items, exactly 2 per stage', async () => {
      const { sessionId } = await launchedCombo();

      const plan = await planOf(sessionId);
      const all = plan.flat();
      expect(all).toHaveLength(8);
      expect(new Set(all.map((q) => q.contentItemId)).size).toBe(8);
      for (const stage of [1, 2, 3, 4]) {
        expect(all.filter((q) => q.stage === stage)).toHaveLength(2);
      }
      // And each Run rises through the four stages in order.
      for (const run of plan) {
        expect(run.map((q) => q.stage)).toEqual([1, 2, 3, 4]);
      }
    });

    it('draws only from the Anime Scopes this Match selected', async () => {
      const { sessionId } = await launchedCombo();

      const plan = await planOf(sessionId);
      for (const question of plan.flat()) {
        expect(scopeIds).toContain(question.scopeId);
        expect(question.scopeId).not.toBe(foreignScopeId);
        expect(foreignItemIds).not.toContain(question.contentItemId);
      }
    });

    it('never gives the same item to both teams', async () => {
      const { sessionId } = await launchedCombo();

      const [runA, runB] = await planOf(sessionId);
      const idsA = runA.map((q) => q.contentItemId);
      const idsB = runB.map((q) => q.contentItemId);
      expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
    });

    it('arms the question clock at the approved 30 seconds', async () => {
      const { sessionId } = await launchedCombo();

      const state = await runtimeStateOf(sessionId);
      const remaining = Date.parse(String(state.deadlineAt)) - Date.now();
      expect(remaining).toBeGreaterThan((COMBO_QUESTION_SECONDS - 10) * 1000);
      expect(remaining).toBeLessThanOrEqual(COMBO_QUESTION_SECONDS * 1000);
    });

    it('refuses to launch when a stage has no content, leaving no ownership behind', async () => {
      // A World whose Combo content stops at stage 3: the four-stage contract
      // cannot be satisfied, so the launch must fail *before* anything is owned.
      const starved = await seedStarvedWorld();
      const session = await startSession();
      await bearer(http().post(matchRoute(session.sessionId, '/unified')))
        .send({
          occurrences: [0, 1, 2].map((occurrenceIndex) => ({
            occurrenceIndex,
            worldId: starved.worldId,
            selectedScopeIds: starved.scopeIds,
          })),
        })
        .expect(201);

      const response = await launch(session.sessionId, COMBO_SLOT, 400);
      expect(response.status).toBeGreaterThanOrEqual(400);

      // No partial ownership on either side of the boundary.
      const snapshot = await snapshotOf(session.sessionId);
      expect(snapshot.match.currentChallenge).toBeUndefined();
      expect(snapshot.match.stage.key).not.toBe(MatchStage.CHALLENGE);
      const slot = snapshot.match.unified.board.positions.find(
        (position) => position.slotKey === COMBO_SLOT,
      );
      expect(slot?.status).not.toBe(MatchSlotStatus.IN_PROGRESS);
      // And no runtime was left behind for the next launch to trip over.
      const runtime = await runtimes().findBySessionId(session.sessionId);
      expect(runtime === null || runtime.isTerminal).toBe(true);
    });
  });

  describe('the run, the clocks, and the hand-over', () => {
    it('banks on تثبيت and hands the run to Team B', async () => {
      const { sessionId, participants } = await launchedCombo();

      await answerCurrent(sessionId, participants[0]);
      let state = await runtimeStateOf(sessionId);
      expect(state.phase).toBe('decision');
      expect(state.unbankedPoints).toBe(1);

      await command(sessionId, participants[0], 'cash-out-combo');
      state = await runtimeStateOf(sessionId);
      expect(state.phase).toBe('run-complete');
      expect(state.runIndex).toBe(1);
      // The recap carries its own clock so the host cannot strand it.
      expect(typeof state.deadlineAt).toBe('string');
    });

    it('lets the controller advance the hand-over deliberately', async () => {
      const { sessionId, participants, teamIds } = await launchedCombo();
      await answerCurrent(sessionId, participants[0]);
      await command(sessionId, participants[0], 'cash-out-combo');

      await command(sessionId, controllerActor(), 'advance-combo-run');

      const state = await runtimeStateOf(sessionId);
      expect(state.phase).toBe('question');
      expect(state.questionIndex).toBe(0);
      expect(
        JSON.parse(String(state.teamIdsJson))[Number(state.runIndex)],
      ).toBe(teamIds[1]);
    });

    it('advances the hand-over from the server when the controller never returns', async () => {
      const { sessionId, participants, teamIds } = await launchedCombo();
      await answerCurrent(sessionId, participants[0]);
      await command(sessionId, participants[0], 'cash-out-combo');
      expect((await runtimeStateOf(sessionId)).phase).toBe('run-complete');

      // No controller command at all — only the elapsed recap clock.
      await expireDeadlineInMongo(sessionId);
      await command(sessionId, controllerActor(), 'expire-combo-question');

      const state = await runtimeStateOf(sessionId);
      expect(state.phase).toBe('question');
      expect(
        JSON.parse(String(state.teamIdsJson))[Number(state.runIndex)],
      ).toBe(teamIds[1]);
      // A full question clock, not the remainder of the recap window.
      const remaining = Date.parse(String(state.deadlineAt)) - Date.now();
      expect(remaining).toBeGreaterThan((COMBO_QUESTION_SECONDS - 10) * 1000);
      expect(remaining).toBeLessThanOrEqual(COMBO_QUESTION_SECONDS * 1000);
      expect(COMBO_RUN_HANDOVER_SECONDS).toBeGreaterThan(0);
    });

    it('never lets a stale hand-over timer forfeit the question it opened', async () => {
      // The one command handles both clocks, so this is the identity risk: an
      // expiry decided against the recap must not land on Team B's new question.
      const { sessionId, participants } = await launchedCombo();
      await answerCurrent(sessionId, participants[0]);
      await command(sessionId, participants[0], 'cash-out-combo');

      // Controller advances first; the recap clock is now historical.
      await command(sessionId, controllerActor(), 'advance-combo-run');
      const opened = await runtimeStateOf(sessionId);
      expect(opened.phase).toBe('question');

      // The late recap expiry arrives. The new question's clock is still live,
      // so the reducer must refuse it rather than forfeit the run.
      await expect(
        command(sessionId, controllerActor(), 'expire-combo-question'),
      ).rejects.toThrow(/has not expired/);

      const after = await runtimeStateOf(sessionId);
      expect(after.phase).toBe('question');
      expect(after.questionIndex).toBe(0);
      expect(after.unbankedPoints).toBe(0);
      expect(JSON.parse(String(after.runResultsJson))).toHaveLength(1);
    });

    it('treats an expired question clock as a lost run', async () => {
      const { sessionId, participants } = await launchedCombo();
      await answerCurrent(sessionId, participants[0]);
      await command(sessionId, participants[0], 'continue-combo');

      await expireDeadlineInMongo(sessionId);
      await command(sessionId, controllerActor(), 'expire-combo-question');

      const state = await runtimeStateOf(sessionId);
      const [result] = JSON.parse(String(state.runResultsJson)) as Array<{
        bankedPoints: number;
        endedBy: string;
      }>;
      expect(result.bankedPoints).toBe(0);
      expect(result.endedBy).toBe('timeout');
    });
  });

  describe('completion and convergence', () => {
    /** Play both Runs to a banked finish. */
    const playToCompletion = async () => {
      const session = await launchedCombo();
      const { sessionId, participants } = session;
      await answerCurrent(sessionId, participants[0]);
      await command(sessionId, participants[0], 'cash-out-combo');
      await command(sessionId, controllerActor(), 'advance-combo-run');
      await answerCurrent(sessionId, participants[1]);
      await command(sessionId, participants[1], 'cash-out-combo');
      return session;
    };

    it('completes the runtime once both runs have banked', async () => {
      const { sessionId } = await playToCompletion();

      const state = await runtimeStateOf(sessionId);
      expect(state.phase).toBe('completed');
      expect(state.deadlineAt).toBeNull();
      expect(JSON.parse(String(state.runResultsJson))).toHaveLength(2);
      const runtime = (await runtimes().findBySessionId(sessionId))!;
      expect(runtime.isTerminal).toBe(true);
    });

    it('converges the result into the Match exactly once', async () => {
      const { sessionId } = await playToCompletion();

      const snapshot = await snapshotOf(sessionId);
      // Ownership released, result recorded once.
      expect(snapshot.match.currentChallenge).toBeUndefined();
      expect(snapshot.match.challengeHistory).toHaveLength(1);
      const [record] = snapshot.match.challengeHistory;
      expect(record.challengeKey).toBe(COMBO_MODE_KEY);
      // Combo points are provenance, not Match score: a 1-1 draw awards nobody.
      const totals = snapshot.match.scoring.matchTotals;
      expect(totals.every((team) => team.signedTotal === 0)).toBe(true);
    });

    it('leaves no outstanding convergence obligation', async () => {
      const { sessionId } = await playToCompletion();

      const match = (await matches().findLatestBySessionId(sessionId))!;
      expect(match.currentChallenge).toBeUndefined();
    });
  });

  describe('abort and back to board', () => {
    it('releases the slot with no score, and the next challenge launches', async () => {
      const { sessionId } = await launchedCombo();

      await abort(sessionId);

      const snapshot = await snapshotOf(sessionId);
      expect(snapshot.match.currentChallenge).toBeUndefined();
      expect(snapshot.match.stage.key).toBe(MatchStage.BOARD);
      expect(snapshot.match.challengeHistory).toHaveLength(0);
      expect(
        snapshot.match.scoring.matchTotals.every(
          (team) => team.signedTotal === 0,
        ),
      ).toBe(true);
      const slot = snapshot.match.unified.board.positions.find(
        (position) => position.slotKey === COMBO_SLOT,
      );
      expect(slot?.status).toBe(MatchSlotStatus.AVAILABLE);

      // The cancelled runtime is terminal, so it blocks nothing.
      const runtime = (await runtimes().findBySessionId(sessionId))!;
      expect(runtime.isTerminal).toBe(true);
      await launch(sessionId, WorldChallengeSlotKey.SLOT_2, 201);
    });

    it('aborts cleanly from the hand-over recap', async () => {
      const { sessionId, participants } = await launchedCombo();
      await answerCurrent(sessionId, participants[0]);
      await command(sessionId, participants[0], 'cash-out-combo');
      expect((await runtimeStateOf(sessionId)).phase).toBe('run-complete');

      await abort(sessionId);

      const snapshot = await snapshotOf(sessionId);
      expect(snapshot.match.currentChallenge).toBeUndefined();
      // Team A banked a point inside the mechanic, but an aborted challenge
      // awards no Match result at all.
      expect(snapshot.match.challengeHistory).toHaveLength(0);
    });
  });

  describe('reconnect and duplicate delivery', () => {
    it('hands a reconnecting client the same question, not a fresh draw', async () => {
      const { sessionId, participants } = await launchedCombo();
      const before = await planOf(sessionId);
      const beforeState = await runtimeStateOf(sessionId);

      // A reconnect is a fresh authoritative read for that actor.
      const snapshot = await app
        .get(GetLiveGameSession)
        .execute(sessionId, participants[0]);

      const after = await planOf(sessionId);
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
      const afterState = await runtimeStateOf(sessionId);
      expect(afterState.questionIndex).toBe(beforeState.questionIndex);
      expect(afterState.deadlineAt).toBe(beforeState.deadlineAt);
      // And the client is told the authoritative remaining clock.
      expect(snapshot.gameplay?.modeState.deadlineAt).toBe(
        beforeState.deadlineAt,
      );
    });

    it('does not score a replayed answer twice', async () => {
      const { sessionId, participants } = await launchedCombo();
      const plan = await planOf(sessionId);
      const answer = plan[0][0].acceptedAnswers[0];
      const runtime = (await runtimes().findBySessionId(sessionId))!;
      const roundId = runtime.serialize().activeRound!.id;
      const commandId = uuid();
      const body = {
        sessionId,
        roundId,
        actor: participants[0],
        commandId,
        commandType: 'submit-combo-answer',
        payload: { answer },
        expectedSessionRevision: await sessionRevision(sessionId),
        expectedRuntimeRevision: runtime.revision,
      };

      await app.get(SubmitGameplayCommand).execute(body);
      // The identical command again, exactly as a retrying client would send it.
      await app.get(SubmitGameplayCommand).execute(body);

      const state = await runtimeStateOf(sessionId);
      expect(state.unbankedPoints).toBe(1);
      expect(state.phase).toBe('decision');
    });

    it('does not bank a replayed cash-out twice', async () => {
      const { sessionId, participants } = await launchedCombo();
      await answerCurrent(sessionId, participants[0]);
      const runtime = (await runtimes().findBySessionId(sessionId))!;
      const body = {
        sessionId,
        roundId: runtime.serialize().activeRound!.id,
        actor: participants[0],
        commandId: uuid(),
        commandType: 'cash-out-combo',
        payload: {},
        expectedSessionRevision: await sessionRevision(sessionId),
        expectedRuntimeRevision: runtime.revision,
      };

      await app.get(SubmitGameplayCommand).execute(body);
      await app.get(SubmitGameplayCommand).execute(body);

      const state = await runtimeStateOf(sessionId);
      expect(JSON.parse(String(state.runResultsJson))).toHaveLength(1);
    });
  });

  describe('كسر الكومبو through the real projection path', () => {
    /**
     * Privacy proven where it actually matters: the snapshot every client reads,
     * built by `GetLiveGameSession` and the observer/enricher chain, rather than
     * by calling the plugin's projection directly.
     */
    const armedSession = async () => {
      const session = await launchedCombo();
      // Team B arms secretly against Team A's live question.
      await command(
        session.sessionId,
        session.participants[1],
        'arm-combo-break',
      );
      return session;
    };

    const modeStateFor = async (
      sessionId: string,
      actor: LiveSessionActor,
    ): Promise<Record<string, unknown>> => {
      const snapshot = await app
        .get(GetLiveGameSession)
        .execute(sessionId, actor);
      return (snapshot.gameplay?.modeState ?? {}) as Record<string, unknown>;
    };

    it('stores the armed charge server-side', async () => {
      const { sessionId, teamIds } = await armedSession();

      const state = await runtimeStateOf(sessionId);
      expect(state.armedBreakByTeamId).toBe(teamIds[1]);
    });

    it('tells only the arming team, through its own snapshot', async () => {
      const { sessionId, participants } = await armedSession();

      const armed = await modeStateFor(sessionId, participants[1]);
      expect(armed.ownComboBreakArmed).toBe(true);
    });

    it('leaks nothing to the target through its snapshot', async () => {
      const { sessionId, participants } = await armedSession();

      const target = await modeStateFor(sessionId, participants[0]);
      expect('ownComboBreakArmed' in target).toBe(false);
      expect('armedBreakByTeamId' in target).toBe(false);
      expect('comboBreakRevealedByTeamId' in target).toBe(false);
      expect(JSON.stringify(target)).not.toContain('armed');
    });

    it('leaks nothing to the shared screen', async () => {
      const { sessionId } = await armedSession();

      // The controller's snapshot is what the shared screen renders.
      const shared = await modeStateFor(sessionId, controllerActor());
      expect('armedBreakByTeamId' in shared).toBe(false);
      expect('ownComboBreakArmed' in shared).toBe(false);
      expect(JSON.stringify(shared)).not.toContain('armed');
    });

    it('never ships the authored answers to any viewer', async () => {
      const { sessionId, participants } = await armedSession();
      const plan = await planOf(sessionId);
      const secret = plan[0][0].acceptedAnswers[0];

      for (const viewer of [
        participants[0],
        participants[1],
        controllerActor(),
      ]) {
        const view = await modeStateFor(sessionId, viewer);
        expect(JSON.stringify(view)).not.toContain(secret);
        expect('questionPlanJson' in view).toBe(false);
      }
    });

    it('reveals to everyone only after the target survives the question', async () => {
      const { sessionId, participants, teamIds } = await armedSession();

      await answerCurrent(sessionId, participants[0]);

      const state = await runtimeStateOf(sessionId);
      expect(state.phase).toBe('break-reveal');
      for (const viewer of [
        participants[0],
        participants[1],
        controllerActor(),
      ]) {
        const view = await modeStateFor(sessionId, viewer);
        expect(view.comboBreakRevealedByTeamId).toBe(teamIds[1]);
      }
    });

    it('forces the next question and pays +2 in total for surviving it', async () => {
      const { sessionId, participants } = await armedSession();
      await answerCurrent(sessionId, participants[0]);

      await command(sessionId, participants[0], 'continue-combo');
      const forced = await runtimeStateOf(sessionId);
      expect(forced.forcedQuestion).toBe(true);
      const before = Number(forced.unbankedPoints);

      await answerCurrent(sessionId, participants[0]);

      const after = await runtimeStateOf(sessionId);
      // One for the answer, one for surviving. Never three.
      expect(Number(after.unbankedPoints) - before).toBe(2);
    });

    it('refuses a second charge from the same team', async () => {
      const { sessionId, participants } = await armedSession();
      await answerCurrent(sessionId, participants[0]);
      await command(sessionId, participants[0], 'continue-combo');
      await answerCurrent(sessionId, participants[0]);
      await command(sessionId, participants[0], 'continue-combo');

      await expect(
        command(sessionId, participants[1], 'arm-combo-break'),
      ).rejects.toThrow(/already/);
    });
  });

  describe('the real deadline scheduler path', () => {
    /**
     * The rest of this suite sends `expire-combo-question` explicitly to test
     * the reducer. These tests prove the *production* expiry path instead: the
     * `GameplayDeadlineScheduler` discovers an elapsed deadline, arms a timer,
     * and fires the command itself — exactly what runs when nobody is watching.
     *
     * No test-side gameplay expiry command is sent in any of these scenarios.
     * The deadline is pushed into the past in Mongo, the scheduler is told to
     * converge, and the timer is left to fire on its own.
     */
    const scheduler = () => app.get(GameplayDeadlineScheduler);

    const waitForState = async (
      sessionId: string,
      predicate: (state: Record<string, unknown>) => boolean,
      timeoutMs = 10_000,
    ): Promise<Record<string, unknown>> => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const state = await runtimeStateOf(sessionId);
        if (predicate(state)) return state;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('state condition not met within timeout');
    };

    it('resolves an unattended question as a timeout through the scheduler alone', async () => {
      const { sessionId } = await launchedCombo();
      expect((await runtimeStateOf(sessionId)).phase).toBe('question');

      // Push the question clock into the past. The scheduler will read this on
      // convergence and arm a ~0ms timer that fires the expiry command itself.
      await expireDeadlineInMongo(sessionId);
      await scheduler().synchronize(sessionId);

      const state = await waitForState(sessionId, (s) =>
        Boolean(
          s.runResultsJson && JSON.parse(String(s.runResultsJson)).length,
        ),
      );

      const [result] = JSON.parse(String(state.runResultsJson)) as Array<{
        bankedPoints: number;
        endedBy: string;
      }>;
      expect(result.bankedPoints).toBe(0);
      expect(result.endedBy).toBe('timeout');
    });

    it('advances the hand-over from the scheduler when the controller never returns', async () => {
      const { sessionId, participants, teamIds } = await launchedCombo();
      await answerCurrent(sessionId, participants[0]);
      await command(sessionId, participants[0], 'cash-out-combo');
      expect((await runtimeStateOf(sessionId)).phase).toBe('run-complete');

      // No advance-combo-run, no expire-combo-question from the test. Only the
      // scheduler discovering the elapsed recap clock.
      await expireDeadlineInMongo(sessionId);
      await scheduler().synchronize(sessionId);

      const state = await waitForState(
        sessionId,
        (s) => s.phase === 'question' && Number(s.runIndex) === 1,
      );

      expect(
        JSON.parse(String(state.teamIdsJson))[Number(state.runIndex)],
      ).toBe(teamIds[1]);
      // A completely fresh 30s question clock — the recap elapsed time was not
      // subtracted from Team B's timer.
      const remaining = Date.parse(String(state.deadlineAt)) - Date.now();
      expect(remaining).toBeGreaterThan((COMBO_QUESTION_SECONDS - 10) * 1000);
      expect(remaining).toBeLessThanOrEqual(COMBO_QUESTION_SECONDS * 1000);
      expect(COMBO_RUN_HANDOVER_SECONDS).toBeGreaterThan(0);
    });

    it('never lets a stale hand-over deadline affect the question it opened', async () => {
      const { sessionId, participants } = await launchedCombo();
      await answerCurrent(sessionId, participants[0]);
      await command(sessionId, participants[0], 'cash-out-combo');

      // Let the scheduler auto-advance from the hand-over.
      await expireDeadlineInMongo(sessionId);
      await scheduler().synchronize(sessionId);
      const opened = await waitForState(
        sessionId,
        (s) => s.phase === 'question' && Number(s.runIndex) === 1,
      );
      const questionDeadline = String(opened.deadlineAt);

      // The scheduler must have armed for Team B's *question* deadline, not the
      // old hand-over. The key embeds the deadline instant, so it is a direct
      // proof of which clock the timer is watching.
      const armed = scheduler().armedKeyFor(sessionId);
      expect(armed).toContain(questionDeadline);
      expect(armed).not.toContain('run-complete');

      // Re-converge: the old hand-over deadline is still in the past in the
      // state history, but current state carries the new question clock. This
      // must be a no-op — no second advance, no forfeit, no state change.
      await scheduler().synchronize(sessionId);
      const after = await runtimeStateOf(sessionId);
      expect(after.phase).toBe('question');
      expect(after.questionIndex).toBe(0);
      expect(after.unbankedPoints).toBe(0);
      expect(String(after.deadlineAt)).toBe(questionDeadline);
      expect(JSON.parse(String(after.runResultsJson))).toHaveLength(1);

      // The armed key is still the question's, unchanged by the re-convergence.
      expect(scheduler().armedKeyFor(sessionId)).toBe(armed);
    });
  });
});
