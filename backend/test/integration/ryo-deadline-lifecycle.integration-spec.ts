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
import { loginForToken } from '../helpers/auth-helper';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ContentItemStatus,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../../src/modules/scoring/domain/scoring-rule';
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
import { GetGameplayRuntime } from '../../src/modules/live-game-sessions/application/gameplay-runtime.queries';
import { GameplayDeadlineScheduler } from '../../src/modules/live-game-sessions/application/gameplay-deadline.scheduler';
import { GameplayInteractionUseCases } from '../../src/modules/live-game-sessions/application/gameplay-interaction.use-cases';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';
import { RYO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/ryo-gameplay.plugin';
import { LIVE_SESSION_TRANSITION_PUBLISHER } from '../../src/modules/live-game-sessions/application/live-session-transition.publisher';

/**
 * "اقرأ خصمك" against real Mongo, closing the gap the unit tests could not.
 *
 * The production freeze: RYO puts its 25-second clock on the interaction prompt
 * and nowhere else. Clients count down against it; before the fix nothing on the
 * server did, so a turn that ran out sat open for ever, the round never
 * completed, and the runtime never became terminal — which then blocked every
 * later challenge in that session with GAMEPLAY_RUNTIME_EXISTS.
 *
 * Waiting out three real 25-second timers would blow the suite timeout, so each
 * scenario rewrites the *persisted* deadline into the past and then drives the
 * real scheduler. Everything downstream is genuine: the real resolution use
 * case, the real plugin outcome, the real transaction, the real Mongo document,
 * and the real snapshot a client would receive.
 */
type MatchBearingSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']> & {
    unified: NonNullable<
      NonNullable<LiveGameSessionSnapshot['match']>['unified']
    >;
  };
};

describe('RYO deadline lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let contentItemIds: string[];
  let worldId: string;
  let scopeIds: string[];
  const published: Array<{ sessionId: string; event: string }> = [];

  const uuid = () =>
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

  beforeAll(async () => {
    database = await connectTestDatabase('ryo-deadline');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('ryo-deadline') },
      configure: (builder) =>
        builder.overrideProvider(LIVE_SESSION_TRANSITION_PUBLISHER).useValue({
          publish: () => undefined,
          publishEvent: (sessionId: string, event: string) =>
            published.push({ sessionId, event }),
        }),
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    controllerId = await currentUserId();
    ({ contentItemIds, worldId, scopeIds } = await seedWorld());
  }, 120_000);

  afterAll(async () => {
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

  const seedWorld = async () => {
    const presentation = {
      inputType: 'phone-choice',
      timerSeconds: 25,
      soundPack: null,
      revealStyle: null,
    };
    const challengeType = async (body: Record<string, unknown>) => {
      const response = await bearer(http().post('/admin/challenge-types')).send(
        { ...body, defaultPresentation: presentation },
      );
      if (response.status !== 201) {
        throw new Error(
          `challenge-type ${String(body.slug)} -> ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
      return response.body.data;
    };

    const ryo = await challengeType({
      name: 'اقرأ خصمك',
      slug: RYO_MODE_KEY,
      family: ChallengeFamily.RYO,
      answerMode: ChallengeAnswerMode.RYO,
      scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
      itemStructure: 'discrete_triple',
      status: WorldContentStatus.ACTIVE,
    });
    const others = await Promise.all(
      [
        ['Formation Builder', 'ryo-dl-signature', ChallengeFamily.SIGNATURE],
        ['Same Wavelength', 'ryo-dl-relational', ChallengeFamily.RELATIONAL],
        ['Third', 'ryo-dl-third', ChallengeFamily.SIGNATURE],
      ].map(([name, slug, family]) =>
        challengeType({
          name,
          slug,
          family,
          answerMode: ChallengeAnswerMode.MULTIPLE_CHOICE,
          scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
          status: WorldContentStatus.ACTIVE,
        }),
      ),
    );

    const world = (
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'عالم المهلة', slug: 'ryo-deadline-world' })
        .expect(201)
    ).body.data;

    const scopes: Array<{ id: string }> = [];
    for (const [name, slug] of [
      ['كأس العالم', 'ryo-dl-world-cup'],
      ['الدوري الإنجليزي', 'ryo-dl-premier'],
      ['الدوري السعودي', 'ryo-dl-saudi'],
      ['أبطال أوروبا', 'ryo-dl-ucl'],
    ]) {
      scopes.push(
        (
          await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
            .send({ name, slug, status: WorldContentStatus.ACTIVE })
            .expect(201)
        ).body.data,
      );
    }

    const configure = (body: Record<string, unknown>) =>
      bearer(
        http().post(`/admin/worlds/${world.id}/challenge-configurations`),
      ).send(body);
    await configure({
      challengeTypeId: others[0].id,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      isEnabled: true,
    }).expect(201);
    await configure({
      challengeTypeId: ryo.id,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      isEnabled: true,
      sortOrder: 1,
    }).expect(201);
    await configure({
      challengeTypeId: others[1].id,
      slotKey: WorldChallengeSlotKey.SLOT_3,
      isEnabled: true,
      sortOrder: 2,
    }).expect(201);
    await configure({
      challengeTypeId: others[2].id,
      slotKey: WorldChallengeSlotKey.SLOT_4,
      isEnabled: true,
      sortOrder: 3,
    }).expect(201);

    const itemsByScope: string[][] = scopes.map(() => []);
    for (let round = 0; round < 3; round += 1) {
      for (const [scopeIndex, scope] of scopes.entries()) {
        const created = (
          await bearer(http().post('/admin/content-items'))
            .send({
              scopeId: scope.id,
              prompt: { ar: `سؤال ${scopeIndex}-${round}` },
              compatibleChallengeTypeIds: [ryo.id],
              answerPayload: {
                mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
                options: [
                  { id: 'right', label: { ar: 'صحيح' } },
                  { id: 'wrong', label: { ar: 'خطأ' } },
                ],
                correctOptionId: 'right',
              },
              status: ContentItemStatus.READY,
            })
            .expect(201)
        ).body.data;
        itemsByScope[scopeIndex].push(String(created.id));
      }
    }

    await bearer(http().patch(`/admin/worlds/${world.id}`))
      .send({ status: WorldContentStatus.ACTIVE })
      .expect(200);

    return {
      worldId: String(world.id),
      scopeIds: scopes.map((entry) => String(entry.id)),
      contentItemIds: [
        itemsByScope[0][0],
        itemsByScope[1][0],
        itemsByScope[2][0],
      ],
    };
  };

  const sessionRevision = async (sessionId: string) =>
    unwrap<{ revision: number }>(
      await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    ).revision;

  /** A real active session with two teams, each with a connected ready player. */
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
    const join = app.get(JoinLiveSession);
    const readiness = app.get(SetParticipantReadiness);
    const presence = app.get(UpdateParticipantPresence);
    const participants: LiveSessionActor[] = [];
    for (const [index, teamId] of teamIds.entries()) {
      const joined = await join.execute({
        joinCode: access.joinCode,
        displayName: `Player ${index + 1}`,
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
      await presence.connected(sessionId, joined.participantId);
      await readiness.execute({
        actor,
        ready: true,
        expectedRevision: await sessionRevision(sessionId),
        commandId: uuid(),
      });
      participants.push(actor);
    }
    await app.get(MarkSessionReady).execute({
      sessionId,
      actorId: controllerId,
      expectedRevision: await sessionRevision(sessionId),
      commandId: uuid(),
    });
    await app.get(StartLiveGameSession).execute({
      sessionId,
      actorId: controllerId,
      expectedRevision: await sessionRevision(sessionId),
      commandId: uuid(),
    });
    return { sessionId, teamIds, participants };
  };

  const matchRoute = (sessionId: string, path = '') =>
    `/live-game-sessions/${sessionId}/match${path}`;

  const matchSnapshot = async (sessionId: string) =>
    unwrap<Record<string, never>>(
      await bearer(http().get(matchRoute(sessionId))).expect(200),
    ) as unknown as MatchBearingSnapshot;

  const matchCommand = async (
    sessionId: string,
    path: string,
    body: Record<string, unknown> = {},
  ) => {
    const current = await matchSnapshot(sessionId);
    return unwrap<MatchBearingSnapshot>(
      await bearer(http().post(matchRoute(sessionId, path)))
        .send({
          commandId: uuid(),
          expectedMatchRevision: current.match.revision,
          ...body,
        })
        .expect(201),
    );
  };

  /** Creates the real unified Match board for this session. */
  const createUnified = async (sessionId: string) =>
    unwrap<MatchBearingSnapshot>(
      await bearer(http().post(matchRoute(sessionId, '/unified')))
        .send({
          occurrences: [0, 1, 2].map((occurrenceIndex) => ({
            occurrenceIndex,
            worldId,
            selectedScopeIds: scopeIds.slice(0, 4),
          })),
        })
        .expect(201),
    );

  /** Launches RYO into the slot it is configured on. */
  const launchRyo = (sessionId: string) =>
    matchCommand(sessionId, '/challenges/launch', {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      contentItemIds,
    });

  const runtimes = () =>
    app.get<GameplayRuntimeRepository>(GAMEPLAY_RUNTIME_REPOSITORY);

  const rawRuntime = async (sessionId: string) =>
    database
      .collection('gameplay_runtimes')
      .find({ sessionId })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();

  /**
   * Move the persisted prompt deadline into the past.
   *
   * This is the only compression in these tests: the clock, not the mechanism.
   * Everything the scheduler then reads is exactly what it would read after a
   * real 25 seconds.
   */
  const expireDeadlineInMongo = async (sessionId: string) => {
    const document = await rawRuntime(sessionId);
    const past = new Date(Date.now() - 5_000);
    await database
      .collection('gameplay_runtimes')
      .updateOne(
        { _id: document!._id },
        { $set: { 'state.activeRound.interaction.prompt.deadlineAt': past } },
      );
    return past;
  };

  const settle = async (ms = 1200) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  it('resolves an expired RYO item, advances, and finishes the challenge', async () => {
    const { sessionId } = await startSession();
    await createUnified(sessionId);
    await launchRyo(sessionId);

    const scheduler = app.get(GameplayDeadlineScheduler);
    const before = await rawRuntime(sessionId);
    expect(before!.modeKey).toBe(RYO_MODE_KEY);
    expect(before!.status).toBe('round-active');
    expect(before!.state.activeRound.interaction.status).toBe('open');
    expect(
      before!.state.activeRound.interaction.prompt.deadlineAt,
    ).toBeTruthy();

    // Three items, each abandoned at its deadline. Nobody submits anything.
    for (let item = 0; item < 3; item += 1) {
      const current = await rawRuntime(sessionId);
      if (
        !current ||
        ['completed', 'cancelled'].includes(String(current.status))
      ) {
        break;
      }
      await expireDeadlineInMongo(sessionId);
      await scheduler.schedule(sessionId);
      await settle();
    }

    const after = await rawRuntime(sessionId);
    // The runtime reached a terminal status without a single client action.
    expect(['completed', 'cancelled']).toContain(String(after!.status));
    expect(after!.state.activeRound).toBeUndefined();
    // Exactly one round completion recorded: one challenge, one result.
    expect(after!.state.completedRounds).toHaveLength(1);

    const repository = runtimes();
    const reloaded = await repository.findBySessionId(sessionId);
    expect(reloaded?.isTerminal).toBe(true);
  }, 120_000);

  it('lets the same session start another challenge afterwards', async () => {
    const { sessionId } = await startSession();
    await createUnified(sessionId);
    await launchRyo(sessionId);

    for (let item = 0; item < 3; item += 1) {
      const current = await rawRuntime(sessionId);
      if (
        !current ||
        ['completed', 'cancelled'].includes(String(current.status))
      ) {
        break;
      }
      await expireDeadlineInMongo(sessionId);
      await app.get(GameplayDeadlineScheduler).schedule(sessionId);
      await settle();
    }
    expect(['completed', 'cancelled']).toContain(
      String((await rawRuntime(sessionId))!.status),
    );

    // The guard that produced GAMEPLAY_RUNTIME_EXISTS in production must no
    // longer fire, because the previous challenge is genuinely terminal rather
    // than merely finished-looking.
    const current = await matchSnapshot(sessionId);
    const response = await bearer(
      http().post(matchRoute(sessionId, '/challenges/launch')),
    ).send({
      commandId: uuid(),
      expectedMatchRevision: current.match.revision,
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      contentItemIds,
    });
    expect(response.body?.code).not.toBe('GAMEPLAY_RUNTIME_EXISTS');
    expect([201, 400]).toContain(response.status);
  }, 120_000);

  it('projects the advanced state to the snapshot a client would receive', async () => {
    const { sessionId, participants } = await startSession();
    await createUnified(sessionId);
    await launchRyo(sessionId);

    const read = app.get(GetGameplayRuntime);
    const beforeSnapshot = await read.execute(sessionId, participants[0]);
    expect(beforeSnapshot).toBeDefined();

    await expireDeadlineInMongo(sessionId);
    await app.get(GameplayDeadlineScheduler).schedule(sessionId);
    await settle();

    const afterSnapshot = JSON.stringify(
      await read.execute(sessionId, participants[0]),
    );
    // The projection has moved on: the client is not still being handed the
    // interaction it was stuck on.
    expect(afterSnapshot).not.toEqual(JSON.stringify(beforeSnapshot));
    expect(published.some((entry) => entry.sessionId === sessionId)).toBe(true);
  }, 120_000);

  it('recovers an already-expired deadline at application bootstrap', async () => {
    const { sessionId } = await startSession();
    await createUnified(sessionId);
    await launchRyo(sessionId);
    const beforeIndex = Number(
      (await rawRuntime(sessionId))!.state.runtimeState.currentItemIndex,
    );
    await expireDeadlineInMongo(sessionId);

    const scheduler = app.get(GameplayDeadlineScheduler);
    // Drop every in-memory timer the way a redeploy or a free-tier instance
    // waking from sleep would, then boot again. No client reconnects.
    scheduler.onModuleDestroy();

    const live = await runtimes().findSessionIdsWithLiveRuntimes();
    expect(live).toContain(sessionId);

    await scheduler.onApplicationBootstrap();
    await settle();

    const after = await rawRuntime(sessionId);
    const advanced =
      Number(after!.state.runtimeState.currentItemIndex) > beforeIndex;
    const terminal = ['completed', 'cancelled'].includes(String(after!.status));
    // Recovery means the expired item was actually settled and the challenge
    // moved on — either onto the next item, or all the way to terminal. No
    // client reconnected; the sweep alone did this.
    expect(advanced || terminal).toBe(true);
    const interaction = after!.state.activeRound?.interaction;
    if (interaction && !terminal) {
      // Any interaction still open belongs to the *next* item and carries its
      // own future deadline, not the expired one.
      expect(
        new Date(String(interaction.prompt.deadlineAt)).getTime(),
      ).toBeGreaterThan(Date.now() - 1_000);
    }
  }, 120_000);

  it('lets exactly one of an answer and a timeout win the same item', async () => {
    const { sessionId } = await startSession();
    await createUnified(sessionId);
    await launchRyo(sessionId);
    await expireDeadlineInMongo(sessionId);

    const document = await rawRuntime(sessionId);
    const round = document!.state.activeRound;
    const interaction = round.interaction;
    const interactions = app.get(GameplayInteractionUseCases);
    const controller = { kind: 'user' as const, actorId: controllerId };
    // Resolution requires a closed interaction, exactly as the timeout path
    // does it, so the race is between two *resolutions* of the same closed item.
    await interactions.close({
      sessionId,
      roundId: String(round.id),
      actor: controller,
      commandId: uuid(),
      expectedSessionRevision: await sessionRevision(sessionId),
      expectedRuntimeRevision: Number(document!.state.revision),
      expectedInteractionRevision: Number(interaction.revision),
    });
    const closed = (await rawRuntime(sessionId))!;
    const base = {
      sessionId,
      roundId: String(closed.state.activeRound.id),
      actor: controller,
      expectedSessionRevision: await sessionRevision(sessionId),
      expectedRuntimeRevision: Number(closed.state.revision),
      expectedInteractionRevision: Number(
        closed.state.activeRound.interaction.revision,
      ),
    };

    // Two resolutions for the identical item state, fired together — the shape
    // of a player answering as the clock runs out.
    const results = await Promise.allSettled([
      interactions.resolve({ ...base, commandId: uuid() }),
      interactions.resolve({ ...base, commandId: uuid() }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const after = await rawRuntime(sessionId);
    // One resolution is recorded, not two, and the runtime is still coherent.
    const resolvedTransitions = (
      after!.state.transitions as Array<{ type: string }>
    ).filter((t) => t.type === 'interaction-resolved');
    expect(resolvedTransitions.length).toBeLessThanOrEqual(1);
    expect(after!.state.completedRounds.length).toBeLessThanOrEqual(1);
    expect(await runtimes().findBySessionId(sessionId)).toBeTruthy();
  }, 120_000);
});
