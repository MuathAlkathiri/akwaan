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
import { GameplayObserverRegistry } from '../../src/modules/live-game-sessions/application/gameplay-observer.registry';
import { GameplayInteractionUseCases } from '../../src/modules/live-game-sessions/application/gameplay-interaction.use-cases';
import { PresentationReady } from '../../src/modules/live-game-sessions/application/gameplay-runtime.lifecycle';
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
 *
 * Fair-start: RYO is a multi-surface mechanic. Launching holds the first item
 * `prepared` with no deadline until every surface — the shared screen, the
 * answering phone, and the deciding phone — acknowledges readiness over a
 * socket connection. The 25-second window is anchored at that activation, never
 * at launch, and the scheduler must arm nothing while the item is held.
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
      await presence.connected(
        sessionId,
        joined.participantId,
        // One simulated socket per participant. Presence is keyed by
        // connection now, so a test phone needs an identity like a real one.
        `test-socket-${joined.participantId}`,
      );
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

  /**
   * One socket-surface acknowledgement against real Mongo, exactly the call the
   * gateway makes after receiving `live-session:presentation-ready`. The
   * connection id is the server-observed socket identity; the use case anchors
   * it to the surface the acknowledging actor is currently committed to.
   */
  const ackSurface = async (
    sessionId: string,
    actor: LiveSessionActor,
    connectionId: string,
  ) => {
    const document = (await rawRuntime(sessionId))!;
    return app.get(PresentationReady).execute({
      sessionId,
      actor,
      connectionId,
      commandId: uuid(),
      expectedRuntimeRevision: Number(document.state.revision),
      expectedSessionRevision: await sessionRevision(sessionId),
    });
  };

  /**
   * Every required RYO surface acknowledges, the way the three real devices
   * would. The order is taken from the committed assignments, so partial-ack
   * tests can still single out a specific withheld surface.
   */
  const activateRyo = async (
    sessionId: string,
    participants: LiveSessionActor[],
  ) => {
    const runtime = (await runtimes().findBySessionId(sessionId))!;
    const surfaces = runtime.requiredPresentationSurfaces();
    for (const surface of surfaces) {
      const actor =
        surface.capability === 'shared'
          ? ({ kind: 'user', actorId: controllerId } as LiveSessionActor)
          : participants.find(
              (participant) =>
                participant.participantId === surface.participantId,
            )!;
      await ackSurface(sessionId, actor, `sock-${surface.capability}`);
    }
  };

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

  /**
   * Announce a committed runtime mutation, exactly as gameplay does.
   *
   * These tests rewrite the persisted deadline behind the lifecycle's back to
   * avoid waiting out a real 25 seconds, so something has to stand in for the
   * commit that would normally accompany a state change. This is that commit's
   * announcement and nothing more — the same single call `SubmitGameplayCommand`
   * and `GameplayInteractionUseCases` make after they save. Notably it is *not*
   * `scheduler.schedule()`: if the scheduler ever stops subscribing to this
   * hook, every test below fails, which is the wiring these used to assume.
   */
  const converge = async (sessionId: string) => {
    const runtime = await runtimes().findBySessionId(sessionId);
    await app.get(GameplayObserverRegistry).notifyRuntimeMutated({
      sessionId,
      runtimeId: runtime!.id,
      runtimeState: runtime!.serialize(),
    });
  };

  it('holds the first item unexposed and un-armed until every surface has acknowledged', async () => {
    // The regression, stated directly. Launching RYO is the only thing that
    // happens here: no scheduler call, no observer nudge, no test helper. If
    // the production lifecycle armed a deadline at this point, a phone still
    // cold-starting would be burning time against a clock nobody can see yet —
    // the freeze this suite exists to prevent, now inverted into the hold.
    const { sessionId, participants } = await startSession();
    await createUnified(sessionId);
    await launchRyo(sessionId);

    const runtime = (await rawRuntime(sessionId))!;
    const interaction = runtime.state.activeRound.interaction;
    expect(runtime.state.presentationActivatedAt).toBeUndefined();
    expect(interaction.status).toBe('prepared');
    expect(interaction.prompt.deadlineAt).toBeUndefined();
    const armed = app.get(GameplayDeadlineScheduler).armedKeyFor(sessionId);
    expect(armed).toBeUndefined();

    // Every surface acknowledges — and only then does the item open with a
    // real, armed 25-second clock anchored to this moment.
    await activateRyo(sessionId, participants);

    const activated = (await rawRuntime(sessionId))!;
    expect(activated.state.presentationActivatedAt).toBeTruthy();
    expect(activated.state.presentationReady).toEqual([]);
    const opened = activated.state.activeRound.interaction;
    expect(opened.status).toBe('open');
    const deadlineAt = new Date(opened.prompt.deadlineAt).getTime();
    expect(deadlineAt).toBeGreaterThan(Date.now() + 24_000);
    const armedAfter = app
      .get(GameplayDeadlineScheduler)
      .armedKeyFor(sessionId);
    expect(armedAfter).toBeDefined();
    // Armed for *this* item: the identity is what makes the timer harmless to
    // whatever replaces it.
    expect(armedAfter).toContain(String(opened.id));
    expect(armedAfter).toContain(String(activated.state.id));
  }, 120_000);

  it('holds the clock while the decision surface withholds, then anchors a full window at activation', async () => {
    // The multiplayer worst case, against real Mongo: the deciding phone is the
    // last to come up. The shared screen and the answering phone are up, but if
    // the 25 seconds started at launch the decider would inherit nothing — or,
    // worse, the challenge would resolve before it ever renders. Under
    // fair-start the hold is propped against real persistence, the scheduler
    // arms nothing, and the final ack re-anchors the whole window to now.
    const { sessionId, participants } = await startSession();
    await createUnified(sessionId);
    const launchSaw = Date.now();
    await launchRyo(sessionId);

    const ready = app.get(PresentationReady);
    const scheduler = app.get(GameplayDeadlineScheduler);
    const runtime = (await runtimes().findBySessionId(sessionId))!;
    const surfaces = runtime.requiredPresentationSurfaces();
    const decision = surfaces.find((s) => s.capability === 'decision')!;
    const decisionActor = participants.find(
      (participant) => participant.participantId === decision.participantId,
    )!;

    for (const surface of surfaces.filter((s) => s.capability !== 'decision')) {
      const actor =
        surface.capability === 'shared'
          ? ({ kind: 'user', actorId: controllerId } as LiveSessionActor)
          : participants.find(
              (participant) =>
                participant.participantId === surface.participantId,
            )!;
      await ackSurface(sessionId, actor, `sock-${surface.capability}`);
    }
    expect(ready).toBeDefined();

    // Two surfaces up, the barrier still intact: no activation stamp, nothing
    // open, no clock persisted anywhere, no timer armed — the decider's late
    // arrival costs it nothing.
    const held = (await rawRuntime(sessionId))!;
    expect(held.state.presentationActivatedAt).toBeUndefined();
    expect(held.state.activeRound.interaction.status).toBe('prepared');
    expect(
      held.state.activeRound.interaction.prompt.deadlineAt,
    ).toBeUndefined();
    expect(scheduler.armedKeyFor(sessionId)).toBeUndefined();

    // The deciding phone finally acks, cold-starting long after launch. The
    // full window is anchored here, so setup-and-launch latency is free time.
    const justBeforeDecision = Date.now();
    await ackSurface(sessionId, decisionActor, 'sock-decision');

    const activated = (await rawRuntime(sessionId))!;
    expect(activated.state.presentationActivatedAt).toBeTruthy();
    const first = activated.state.activeRound.interaction;
    expect(first.status).toBe('open');
    // The BSON date comes back as a Date; stringifying it drops milliseconds,
    // so compare the raw instant to keep the whole 25,000ms window.
    const deadlineAt = new Date(first.prompt.deadlineAt).getTime();
    // The whole window, not whatever remained since launch. A launch-anchored
    // clock would have been shaved by the hold (and would long since have
    // fired while this test waited for the third phone); this clocks in as a
    // full run from the moment the decider arrived.
    expect(deadlineAt - justBeforeDecision).toBeGreaterThanOrEqual(25_000);
    expect(deadlineAt - launchSaw).toBeGreaterThan(25_000);

    const armed = scheduler.armedKeyFor(sessionId);
    expect(armed).toBeDefined();
    expect(armed).toContain(String(first.id));
    expect(armed).toContain(String(activated.state.id));
  }, 120_000);

  it('arms the next item deadline when the previous item resolves', async () => {
    // The other half of the audit gap. Fixing only the launch would leave every
    // item after the first unwatched, so this asserts the armed identity
    // actually *moves* to the new interaction as the challenge progresses.
    const { sessionId, participants } = await startSession();
    await createUnified(sessionId);
    await launchRyo(sessionId);
    await activateRyo(sessionId, participants);
    const scheduler = app.get(GameplayDeadlineScheduler);

    const first = (await rawRuntime(sessionId))!;
    const firstArmed = scheduler.armedKeyFor(sessionId);
    expect(firstArmed).toContain(
      String(first.state.activeRound.interaction.id),
    );

    await expireDeadlineInMongo(sessionId);
    await converge(sessionId);
    await settle();

    const second = (await rawRuntime(sessionId))!;
    if (['completed', 'cancelled'].includes(String(second.status))) {
      // A challenge that finished instead of advancing must leave nothing armed.
      expect(scheduler.armedKeyFor(sessionId)).toBeUndefined();
      return;
    }
    const nextInteraction = second.state.activeRound?.interaction;
    expect(nextInteraction).toBeDefined();
    const secondArmed = scheduler.armedKeyFor(sessionId);
    expect(secondArmed).toBeDefined();
    expect(secondArmed).not.toEqual(firstArmed);
    expect(secondArmed).toContain(String(nextInteraction.id));
  }, 120_000);

  it('resolves an expired RYO item, advances, and finishes the challenge', async () => {
    const { sessionId, participants } = await startSession();
    await createUnified(sessionId);
    await launchRyo(sessionId);
    await activateRyo(sessionId, participants);

    const before = await rawRuntime(sessionId);
    expect(before!.modeKey).toBe(RYO_MODE_KEY);
    expect(before!.status).toBe('round-active');
    expect(before!.state.presentationActivatedAt).toBeTruthy();
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
      await converge(sessionId);
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
    const { sessionId, participants } = await startSession();
    await createUnified(sessionId);
    await launchRyo(sessionId);
    await activateRyo(sessionId, participants);

    for (let item = 0; item < 3; item += 1) {
      const current = await rawRuntime(sessionId);
      if (
        !current ||
        ['completed', 'cancelled'].includes(String(current.status))
      ) {
        break;
      }
      await expireDeadlineInMongo(sessionId);
      await converge(sessionId);
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
    await activateRyo(sessionId, participants);

    const read = app.get(GetGameplayRuntime);
    const beforeSnapshot = await read.execute(sessionId, participants[0]);
    expect(beforeSnapshot).toBeDefined();

    await expireDeadlineInMongo(sessionId);
    await converge(sessionId);
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
    const { sessionId, participants } = await startSession();
    await createUnified(sessionId);
    await launchRyo(sessionId);
    await activateRyo(sessionId, participants);
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
    const { sessionId, participants } = await startSession();
    await createUnified(sessionId);
    await launchRyo(sessionId);
    await activateRyo(sessionId, participants);
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
