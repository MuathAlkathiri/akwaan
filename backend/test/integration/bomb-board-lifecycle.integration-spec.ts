import { randomUUID } from 'crypto';
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
  ContentMediaType,
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
import { SubmitGameplayCommand } from '../../src/modules/live-game-sessions/application/submit-gameplay-command.use-case';
import { GetGameplayRuntime } from '../../src/modules/live-game-sessions/application/gameplay-runtime.queries';
import { GameplayDeadlineScheduler } from '../../src/modules/live-game-sessions/application/gameplay-deadline.scheduler';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';
import { BOMB_MODE_KEY } from '../../src/modules/live-game-sessions/domain/bomb-gameplay.plugin';

/**
 * "القنبلة" through the whole assembled backend, against real Mongo.
 *
 * Nothing here is mocked: a real World with a real Bomb slot, real ContentItems,
 * the real Match board, the real launcher, the real start use case, real
 * commands, and the real deadline scheduler. The point is to prove the chain
 * executes, not that its parts can be stubbed.
 *
 * The only compression is the clock: a Bomb team clock is minutes long, so the
 * scenarios that need expiry rewrite the *persisted* clock rather than waiting.
 */
const BOMB_ITEM_COUNT = 10;

describe('Bomb board lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let scopeIds: string[];
  let bombItemIds: string[];
  let ryoItemIds: string[];

  const uuid = () =>
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

  beforeAll(async () => {
    database = await connectTestDatabase('bomb-board');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('bomb-board') },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    controllerId = await currentUserId();
    ({ worldId, scopeIds, bombItemIds, ryoItemIds } = await seedWorld());
  }, 180_000);

  afterAll(async () => {
    await app?.get(GameplayDeadlineScheduler).onModuleDestroy();
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

  /** A World whose board really carries Bomb, plus a second mechanic to follow it. */
  const seedWorld = async () => {
    const challengeType = async (body: Record<string, unknown>) => {
      const response = await bearer(http().post('/admin/challenge-types')).send(
        body,
      );
      if (response.status !== 201) {
        throw new Error(
          `challenge-type ${String(body.slug)} -> ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
      return response.body.data;
    };

    // Bomb is registered as a production mechanic, so it must be created with
    // its canonical identity or the drift guard rejects it. That rejection is
    // itself the proof that Bomb is a first-class production ChallengeType.
    const bomb = await challengeType({
      name: 'القنبلة',
      slug: BOMB_MODE_KEY,
      // Shared Core, not a Signature (§16.1). A canonical slug must match its
      // code definition or the drift guard rejects it, which is exactly how this
      // fixture caught the family change.
      family: ChallengeFamily.COOP,
      itemStructure: 'continuous',
      answerMode: ChallengeAnswerMode.MATCH,
      scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
      status: WorldContentStatus.ACTIVE,
      defaultPresentation: {
        inputType: 'phone-text',
        timerSeconds: null,
        soundPack: null,
        revealStyle: null,
      },
    });
    const ryo = await challengeType({
      name: 'اقرأ خصمك',
      slug: 'read-your-opponent',
      family: ChallengeFamily.RYO,
      itemStructure: 'discrete_triple',
      answerMode: ChallengeAnswerMode.RYO,
      scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
      status: WorldContentStatus.ACTIVE,
      defaultPresentation: {
        inputType: 'phone-choice',
        timerSeconds: 25,
        soundPack: null,
        revealStyle: null,
      },
    });
    const filler = await Promise.all(
      [
        ['Formation', 'bomb-it-signature', ChallengeFamily.SIGNATURE],
        ['Wavelength', 'bomb-it-relational', ChallengeFamily.RELATIONAL],
      ].map(([name, slug, family]) =>
        challengeType({
          name,
          slug,
          family,
          itemStructure: 'discrete_triple',
          answerMode: ChallengeAnswerMode.MULTIPLE_CHOICE,
          scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
          status: WorldContentStatus.ACTIVE,
          defaultPresentation: {
            inputType: 'phone-choice',
            timerSeconds: 25,
            soundPack: null,
            revealStyle: null,
          },
        }),
      ),
    );

    const world = (
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'عالم القنبلة', slug: 'bomb-it-world' })
        .expect(201)
    ).body.data;

    const scopes: Array<{ id: string }> = [];
    for (const [name, slug] of [
      ['كأس العالم', 'bomb-it-wc'],
      ['الدوري الإنجليزي', 'bomb-it-epl'],
      ['الدوري السعودي', 'bomb-it-spl'],
      ['أبطال أوروبا', 'bomb-it-ucl'],
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
      challengeTypeId: bomb.id,
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
      challengeTypeId: filler[0].id,
      slotKey: WorldChallengeSlotKey.SLOT_3,
      isEnabled: true,
      sortOrder: 2,
    }).expect(201);
    await configure({
      challengeTypeId: filler[1].id,
      slotKey: WorldChallengeSlotKey.SLOT_4,
      isEnabled: true,
      sortOrder: 3,
    }).expect(201);

    /** Ten ordered Bomb pictures, each with its own prompt and answer. */
    const bombItems: string[] = [];
    for (let index = 0; index < BOMB_ITEM_COUNT; index += 1) {
      const created = (
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId: scopes[0].id,
            prompt: { ar: `صورة رقم ${index + 1}` },
            compatibleChallengeTypeIds: [bomb.id],
            media: {
              type: ContentMediaType.IMAGE,
              assets: [
                {
                  url: `/uploads/bomb/${index + 1}.webp`,
                  altText: `بديل ${index + 1}`,
                },
              ],
            },
            answerPayload: {
              mode: ChallengeAnswerMode.MATCH,
              acceptedAnswers: [`جواب${index + 1}`],
            },
            status: ContentItemStatus.READY,
          })
          .expect(201)
      ).body.data;
      bombItems.push(String(created.id));
    }

    // A second mechanic's content, so "another challenge in the same session"
    // is a genuinely different challenge rather than Bomb again.
    const ryoItems: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const created = (
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId: scopes[index % scopes.length].id,
            prompt: { ar: `سؤال اقرأ خصمك ${index + 1}` },
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
      ryoItems.push(String(created.id));
    }

    // Every selected Scope must hold ready content or the board refuses to
    // open, so each one gets a playable filler item.
    for (const [index, scope] of scopes.entries()) {
      await bearer(http().post('/admin/content-items'))
        .send({
          scopeId: scope.id,
          prompt: { ar: `حشو ${index + 1}` },
          compatibleChallengeTypeIds: [filler[0].id, filler[1].id],
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
        .expect(201);
    }

    await bearer(http().patch(`/admin/worlds/${world.id}`))
      .send({ status: WorldContentStatus.ACTIVE })
      .expect(200);

    return {
      worldId: String(world.id),
      scopeIds: scopes.map((entry) => String(entry.id)),
      bombItemIds: bombItems,
      ryoItemIds: ryoItems,
    };
  };

  const sessionRevision = async (sessionId: string) =>
    unwrap<{ revision: number }>(
      await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    ).revision;

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
    ) as unknown as { match: Record<string, never> };

  const createUnified = async (sessionId: string) => {
    const response = await bearer(
      http().post(matchRoute(sessionId, '/unified')),
    ).send({
      occurrences: [0, 1, 2].map((occurrenceIndex) => ({
        occurrenceIndex,
        worldId,
        selectedScopeIds: scopeIds.slice(0, 4),
      })),
    });
    if (response.status !== 201) {
      throw new Error(
        `unified -> ${response.status} ${JSON.stringify(response.body)}`,
      );
    }
    return response;
  };

  /** Launches through the real board route, not the use case directly. */
  const launch = async (
    sessionId: string,
    slotKey: WorldChallengeSlotKey,
    contentItemIds: string[],
    expected = 201,
  ) => {
    const current = await matchSnapshot(sessionId);
    const response = await bearer(
      http().post(matchRoute(sessionId, '/challenges/launch')),
    ).send({
      commandId: uuid(),
      expectedMatchRevision: (current.match as { revision: number }).revision,
      occurrenceIndex: 0,
      slotKey,
      contentItemIds,
    });
    if (response.status !== expected) {
      throw new Error(
        `launch ${slotKey} -> ${response.status} ${JSON.stringify(response.body)}`,
      );
    }
    return response;
  };

  /** Uses the product's only transition out of challenge_result. */
  const continueFromChallengeResult = async (sessionId: string) => {
    const current = await matchSnapshot(sessionId);
    return bearer(
      http().post(matchRoute(sessionId, '/unified/challenges/continue')),
    )
      .send({
        commandId: uuid(),
        expectedMatchRevision: (current.match as { revision: number }).revision,
      })
      .expect(201);
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

  const rawSession = async (sessionId: string) =>
    database.collection('live_game_sessions').findOne({ sessionId });

  const command = async (
    sessionId: string,
    actor: LiveSessionActor,
    commandType: string,
    payload: Record<string, unknown> = {},
  ) => {
    const runtime = (await runtimes().findBySessionId(sessionId))!.serialize();
    return app.get(SubmitGameplayCommand).execute({
      sessionId,
      actor,
      commandId: uuid(),
      expectedSessionRevision: await sessionRevision(sessionId),
      expectedRuntimeRevision: runtime.revision,
      roundId: runtime.activeRound!.id,
      commandType,
      payload,
    });
  };

  /** The participant whose team currently holds the bomb. */
  const activeActor = async (
    sessionId: string,
    participants: LiveSessionActor[],
  ) => {
    const session = unwrap<{
      activeTeamId?: string;
      participants: Array<{ id: string; teamId?: string }>;
    }>(
      await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    );
    return participants.find((actor) => {
      const entry = session.participants.find(
        (candidate) => candidate.id === actor.participantId,
      );
      return entry?.teamId === session.activeTeamId;
    })!;
  };

  const answerFor = (itemIndex: number) => `جواب${itemIndex + 1}`;

  /** Push the running team clock into the past so the deadline is due. */
  const expireActiveClock = async (sessionId: string) => {
    const session = (await rawSession(sessionId))!;
    const teams = session.state.teams as Array<Record<string, never>>;
    const activeTeamId = session.state.activeTeamId as unknown as string;
    const index = teams.findIndex(
      (team) => (team as { id: string }).id === activeTeamId,
    );
    await database.collection('live_game_sessions').updateOne(
      { sessionId },
      {
        $set: {
          [`state.teams.${index}.clock.startedAt`]: new Date(
            Date.now() - 3_600_000,
          ),
        },
      },
    );
  };

  /**
   * Leave the active team almost out of clock, without expiring it.
   *
   * Enough budget that no deadline is due yet, and less than the five seconds a
   * skip costs — so the next skip is the thing that empties it.
   */
  const leaveActiveClockAlmostSpent = async (
    sessionId: string,
    remainingMs: number,
  ) => {
    const session = (await rawSession(sessionId))!;
    const teams = session.state.teams as Array<{
      id: string;
      clock: { allocatedMs: number };
    }>;
    const activeTeamId = session.state.activeTeamId as unknown as string;
    const index = teams.findIndex((team) => team.id === activeTeamId);
    await database.collection('live_game_sessions').updateOne(
      { sessionId },
      {
        $set: {
          [`state.teams.${index}.clock.consumedMs`]:
            teams[index].clock.allocatedMs - remainingMs,
          [`state.teams.${index}.clock.startedAt`]: new Date(),
        },
      },
    );
    return activeTeamId;
  };

  const settle = async (ms = 1500) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const bombRunning = async (sessionId: string) => {
    await createUnified(sessionId);
    await launch(sessionId, WorldChallengeSlotKey.SLOT_1, bombItemIds);
  };

  // ---------------------------------------------------------------- scenarios

  it('1–4: places Bomb on a real board, launches it, and preserves item order', async () => {
    const { sessionId } = await startSession();
    await bombRunning(sessionId);

    const runtime = (await rawRuntime(sessionId))!;
    expect(runtime.modeKey).toBe(BOMB_MODE_KEY);
    expect(runtime.status).toBe('round-active');

    const questions = JSON.parse(
      String(runtime.state.runtimeState.questionsJson),
    ) as Array<{ items: Array<{ prompt: string; imageUrl: string }> }>;
    expect(questions[0].items).toHaveLength(BOMB_ITEM_COUNT);
    expect(questions[0].items.map((entry) => entry.imageUrl)).toEqual(
      bombItemIds.map((_, index) => `/uploads/bomb/${index + 1}.webp`),
    );
  }, 180_000);

  it('5: shows each item its own prompt and media', async () => {
    const { sessionId, participants } = await startSession();
    await bombRunning(sessionId);

    const first = (await rawRuntime(sessionId))!.state.activeRound.modeState;
    expect(first.prompt).toBe('صورة رقم 1');
    expect(first.imageUrl).toBe('/uploads/bomb/1.webp');

    await command(
      sessionId,
      await activeActor(sessionId, participants),
      'submit-answer',
      { answer: answerFor(0) },
    );

    const second = (await rawRuntime(sessionId))!.state.activeRound.modeState;
    expect(second.prompt).toBe('صورة رقم 2');
    expect(second.imageUrl).toBe('/uploads/bomb/2.webp');
  }, 180_000);

  it('6: a correct answer advances the item and switches the active team', async () => {
    const { sessionId, participants } = await startSession();
    await bombRunning(sessionId);

    const before = (await rawSession(sessionId))!.state.activeTeamId;
    await command(
      sessionId,
      await activeActor(sessionId, participants),
      'submit-answer',
      { answer: answerFor(0) },
    );

    const runtime = (await rawRuntime(sessionId))!;
    expect(runtime.state.activeRound.modeState.itemIndex).toBe(1);
    expect((await rawSession(sessionId))!.state.activeTeamId).not.toBe(before);
  }, 180_000);

  it('6b: a correct answer passes the bomb without resetting the clock', async () => {
    // The whole tension of Bomb is that time never comes back. A correct answer
    // hands the bomb over; it does not hand over a fresh clock. Nothing else in
    // this suite pins that, and it is the mechanic's defining property.
    const { sessionId, participants } = await startSession();
    await bombRunning(sessionId);

    const teamsOf = async () =>
      (await rawSession(sessionId))!.state.teams as unknown as Array<{
        id: string;
        clock: { allocatedMs: number; consumedMs: number };
      }>;

    const before = await teamsOf();
    const passingTeamId = (await rawSession(sessionId))!.state.activeTeamId;
    // Spend a measurable slice of the passing team's clock first.
    await leaveActiveClockAlmostSpent(sessionId, 20_000);
    const spent = (await teamsOf()).find(
      (team) => team.id === passingTeamId,
    )!.clock;
    expect(spent.consumedMs).toBeGreaterThan(0);

    await command(
      sessionId,
      await activeActor(sessionId, participants),
      'submit-answer',
      { answer: answerFor(0) },
    );

    const after = await teamsOf();
    const passer = after.find((team) => team.id === passingTeamId)!.clock;
    // Time only ever accrues. The team that answered keeps every millisecond it
    // had already burned — never fewer — and the figure stays where it was rather
    // than dropping back toward zero, which is what a reset would look like.
    expect(passer.consumedMs).toBeGreaterThanOrEqual(spent.consumedMs);
    expect(passer.consumedMs).toBeLessThan(spent.consumedMs + 10_000);
    expect(passer.consumedMs).toBeGreaterThan(0);
    // And no team's allocation was topped back up by the hand-over.
    for (const team of after) {
      const original = before.find((entry) => entry.id === team.id)!;
      expect(team.clock.allocatedMs).toBe(original.clock.allocatedMs);
    }
  }, 180_000);

  it('7: a wrong answer changes nothing', async () => {
    const { sessionId, participants } = await startSession();
    await bombRunning(sessionId);

    const beforeTeam = (await rawSession(sessionId))!.state.activeTeamId;
    await command(
      sessionId,
      await activeActor(sessionId, participants),
      'submit-answer',
      { answer: 'إجابة خاطئة تمامًا' },
    );

    const runtime = (await rawRuntime(sessionId))!;
    expect(runtime.state.activeRound.modeState.itemIndex).toBe(0);
    expect(runtime.state.activeRound.modeState.prompt).toBe('صورة رقم 1');
    expect((await rawSession(sessionId))!.state.activeTeamId).toBe(beforeTeam);
  }, 180_000);

  it('8–9: skip advances, costs exactly 5000ms, and keeps the same team', async () => {
    const { sessionId, participants } = await startSession();
    await bombRunning(sessionId);

    const before = (await rawSession(sessionId))!;
    const activeTeamId = before.state.activeTeamId as unknown as string;
    const clockBefore = (
      before.state.teams as Array<{
        id: string;
        clock: { consumedMs: number; startedAt: Date };
      }>
    ).find((team) => team.id === activeTeamId)!.clock;

    await command(
      sessionId,
      await activeActor(sessionId, participants),
      'skip',
    );

    const after = (await rawSession(sessionId))!;
    const clockAfter = (
      after.state.teams as Array<{
        id: string;
        clock: { consumedMs: number; startedAt: Date };
      }>
    ).find((team) => team.id === activeTeamId)!.clock;

    expect(
      (await rawRuntime(sessionId))!.state.activeRound.modeState.itemIndex,
    ).toBe(1);
    // TeamClock.adjust first persists naturally elapsed wall time, resets
    // startedAt to the command instant, then applies the mechanic adjustment.
    // Subtracting that independently persisted elapsed interval proves the
    // penalty itself is exactly 5000ms without pretending Mongo/HTTP took 0ms.
    const persistedElapsedMs =
      new Date(clockAfter.startedAt).getTime() -
      new Date(clockBefore.startedAt).getTime();
    expect(
      clockAfter.consumedMs - clockBefore.consumedMs - persistedElapsedMs,
    ).toBe(5_000);
    expect(after.state.activeTeamId).toBe(activeTeamId);
  }, 180_000);

  it('abort and skip cannot both win: the first commit takes the runtime', async () => {
    // Abort vs Skip at the persistence boundary. Both are decided against the
    // same runtime revision — which is what "concurrent" means here — and CAS
    // arbitrates. The loser must leave nothing behind: no score, no result,
    // and no half-cancelled runtime.
    const { sessionId, participants } = await startSession();
    await bombRunning(sessionId);

    const before = (await runtimes().findBySessionId(sessionId))!.serialize();
    const staleRevision = before.revision;

    // Skip commits first, moving the runtime on.
    await command(
      sessionId,
      await activeActor(sessionId, participants),
      'skip',
    );
    const afterSkip = (await runtimes().findBySessionId(
      sessionId,
    ))!.serialize();
    expect(afterSkip.revision).toBeGreaterThan(staleRevision);

    // The abort was decided before that skip existed.
    const losing = await bearer(
      http().post(`/live-game-sessions/${sessionId}/runtime/cancel`),
    ).send({
      commandId: randomUUID(),
      expectedRuntimeRevision: staleRevision,
      expectedSessionRevision: await sessionRevision(sessionId),
    });
    expect(losing.status).toBeGreaterThanOrEqual(400);

    const settled = (await runtimes().findBySessionId(sessionId))!.serialize();
    expect(settled.status).not.toBe('cancelled');
    expect((await rawSession(sessionId))!.status).toBe('active');
    const match = await matchSnapshot(sessionId);
    expect(
      (match.match as unknown as { challengeHistory: unknown[] })
        .challengeHistory,
    ).toHaveLength(0);
  }, 240_000);

  it('a committed abort refuses a skip decided before it', async () => {
    // The other direction: a losing skip may not resurrect or score a released
    // challenge.
    const { sessionId, participants } = await startSession();
    await bombRunning(sessionId);

    const before = (await runtimes().findBySessionId(sessionId))!.serialize();
    const staleRevision = before.revision;
    const actor = await activeActor(sessionId, participants);

    await bearer(http().post(`/live-game-sessions/${sessionId}/runtime/cancel`))
      .send({
        commandId: randomUUID(),
        expectedRuntimeRevision: staleRevision,
        expectedSessionRevision: await sessionRevision(sessionId),
      })
      .expect(201);

    await expect(
      app.get(SubmitGameplayCommand).execute({
        sessionId,
        actor,
        commandId: uuid(),
        expectedSessionRevision: await sessionRevision(sessionId),
        expectedRuntimeRevision: staleRevision,
        roundId: before.activeRound!.id,
        commandType: 'skip',
        payload: {},
      }),
    ).rejects.toBeDefined();

    const settled = (await runtimes().findBySessionId(sessionId))!.serialize();
    expect(settled.status).toBe('cancelled');
    const match = await matchSnapshot(sessionId);
    const state = match.match as unknown as {
      challengeHistory: unknown[];
      scoring: { matchTotals: Array<{ signedTotal: number }> };
    };
    expect(state.challengeHistory).toHaveLength(0);
    expect(
      state.scoring.matchTotals.reduce(
        (total, entry) => total + entry.signedTotal,
        0,
      ),
    ).toBe(0);
  }, 240_000);

  it('a skip that empties the clock ends the challenge, not the whole match', async () => {
    // The historical defect. Skip costs the active team five seconds, and when
    // that penalty emptied their clock the effect handler called
    // `session.finish()` — finishing the entire LiveGameSession from inside one
    // board position, with eleven other positions still unplayed. A board
    // position has no authority to end the Match.
    const { sessionId, teamIds, participants } = await startSession();
    await bombRunning(sessionId);

    const loserId = await leaveActiveClockAlmostSpent(sessionId, 4_000);
    const expectedWinner = teamIds.find((id) => id !== loserId)!;

    await command(
      sessionId,
      await activeActor(sessionId, participants),
      'skip',
    );

    // The mechanic resolved, through the same verdict a timeout produces.
    const runtime = (await rawRuntime(sessionId))!;
    expect(['completed', 'cancelled']).toContain(String(runtime.status));
    const verdict = JSON.parse(String(runtime.state.runtimeState.resultJson));
    expect(verdict.endedBy).toBe('clock-expired');
    expect(verdict.winnerTeamId).toBe(expectedWinner);
    expect(runtime.state.completedRounds).toHaveLength(1);

    // The session did not end. This is the assertion that fails on the old code.
    expect((await rawSession(sessionId))!.status).toBe('active');

    // And the Match kept its own progression: one challenge scored, board free.
    const match = await matchSnapshot(sessionId);
    const matchState = match.match as unknown as {
      challengeHistory: Array<{ winnerTeamId: string | null }>;
      scoring: { matchTotals: Array<{ teamId: string; signedTotal: number }> };
    };
    expect(matchState.challengeHistory).toHaveLength(1);
    expect(matchState.challengeHistory[0].winnerTeamId).toBe(expectedWinner);
    expect(
      matchState.scoring.matchTotals.find(
        (entry) => entry.teamId === expectedWinner,
      )?.signedTotal,
    ).toBe(1);

    // The proof that the session is still playable: another mechanic starts.
    await continueFromChallengeResult(sessionId);
    await launch(sessionId, WorldChallengeSlotKey.SLOT_2, ryoItemIds);
    expect((await rawRuntime(sessionId))!.modeKey).toBe('read-your-opponent');
  }, 240_000);

  it('a skip that empties the clock resolves once, even with a deadline armed', async () => {
    // Skip-vs-timeout on the corrected path. The scheduler was armed against
    // the clock this skip just emptied, so its timer is still pending when the
    // skip resolves the challenge. Exactly one verdict, one score, one round.
    const { sessionId, participants } = await startSession();
    await bombRunning(sessionId);
    await leaveActiveClockAlmostSpent(sessionId, 2_000);
    await app.get(GameplayDeadlineScheduler).schedule(sessionId);

    await command(
      sessionId,
      await activeActor(sessionId, participants),
      'skip',
    );
    // Wait past the instant the armed timer was due to fire.
    await settle(3_000);

    const runtime = (await rawRuntime(sessionId))!;
    expect(runtime.state.completedRounds).toHaveLength(1);
    expect(['completed', 'cancelled']).toContain(String(runtime.status));
    const match = await matchSnapshot(sessionId);
    const matchState = match.match as unknown as {
      challengeHistory: unknown[];
      scoring: { matchTotals: Array<{ signedTotal: number }> };
    };
    expect(matchState.challengeHistory).toHaveLength(1);
    expect(
      matchState.scoring.matchTotals.reduce(
        (total, entry) => total + entry.signedTotal,
        0,
      ),
    ).toBe(1);
    expect((await rawSession(sessionId))!.status).toBe('active');
  }, 240_000);

  it('10–14, 17–18: an expired clock ends the challenge, scores the other team, and frees the session', async () => {
    const { sessionId, teamIds } = await startSession();
    await bombRunning(sessionId);

    const loserId = (await rawSession(sessionId))!.state
      .activeTeamId as unknown as string;
    const expectedWinner = teamIds.find((id) => id !== loserId)!;

    // Zero client action from here: the persisted clock is spent and the
    // scheduler alone resolves it.
    await expireActiveClock(sessionId);
    await app.get(GameplayDeadlineScheduler).schedule(sessionId);
    await settle();

    const runtime = (await rawRuntime(sessionId))!;
    expect(['completed', 'cancelled']).toContain(String(runtime.status));

    const verdict = JSON.parse(String(runtime.state.runtimeState.resultJson));
    expect(verdict.winnerTeamId).toBe(expectedWinner);
    expect(verdict.endedBy).toBe('clock-expired');

    // The session survives — this is the whole point of Option A.
    expect((await rawSession(sessionId))!.status).toBe('active');
    expect(runtime.state.completedRounds).toHaveLength(1);

    const match = await matchSnapshot(sessionId);
    const matchState = match.match as unknown as {
      challengeHistory: Array<{ winnerTeamId: string | null }>;
      scoring: {
        matchTotals: Array<{ teamId: string; signedTotal: number }>;
      };
    };
    expect(matchState.challengeHistory).toHaveLength(1);
    expect(matchState.challengeHistory[0].winnerTeamId).toBe(expectedWinner);
    expect(
      matchState.scoring.matchTotals.find(
        (entry) => entry.teamId === expectedWinner,
      )?.signedTotal,
    ).toBe(1);

    // The result is acknowledged through the canonical product transition;
    // only then is the board free for a different mechanic in this session.
    await continueFromChallengeResult(sessionId);
    await launch(sessionId, WorldChallengeSlotKey.SLOT_2, ryoItemIds);
    const next = (await rawRuntime(sessionId))!;
    expect(next.sessionId).toBe(sessionId);
    expect(next.modeKey).toBe('read-your-opponent');
  }, 240_000);

  it('15, 17: a true item-exhaustion tie persists once and scores zero', async () => {
    const { sessionId, participants, teamIds } = await startSession();
    await bombRunning(sessionId);

    for (let index = 0; index < BOMB_ITEM_COUNT - 1; index += 1) {
      await command(
        sessionId,
        await activeActor(sessionId, participants),
        'submit-answer',
        { answer: answerFor(index) },
      );
    }

    // Compress the two clocks to an exact tie before the final item. A future
    // startedAt contributes zero natural elapsed time; the command's single
    // `now` then pauses one clock and starts the other at the same instant.
    const session = (await rawSession(sessionId))!;
    const teams = session.state.teams as Array<{ id: string }>;
    const future = new Date(Date.now() + 60_000);
    await database.collection('live_game_sessions').updateOne(
      { sessionId },
      {
        $set: Object.fromEntries(
          teams.flatMap((team, index) => [
            [`state.teams.${index}.clock.consumedMs`, 10_000],
            [
              `state.teams.${index}.clock.startedAt`,
              team.id === session.state.activeTeamId ? future : null,
            ],
          ]),
        ),
      },
    );

    await command(
      sessionId,
      await activeActor(sessionId, participants),
      'submit-answer',
      { answer: answerFor(BOMB_ITEM_COUNT - 1) },
    );

    const runtime = (await rawRuntime(sessionId))!;
    expect(JSON.parse(String(runtime.state.runtimeState.resultJson))).toEqual({
      winnerTeamId: null,
      endedBy: 'items-completed',
    });
    expect(runtime.state.completedRounds).toHaveLength(1);

    const match = await matchSnapshot(sessionId);
    const matchState = match.match as unknown as {
      challengeHistory: Array<{
        winnerTeamId: string | null;
        tie: boolean;
        matchPoints: Array<{ teamId: string; points: number }>;
      }>;
      scoring: {
        matchTotals: Array<{ teamId: string; signedTotal: number }>;
      };
    };
    expect(matchState.challengeHistory).toHaveLength(1);
    expect(matchState.challengeHistory[0]).toMatchObject({
      winnerTeamId: null,
      tie: true,
    });
    expect(matchState.challengeHistory[0].matchPoints).toEqual(
      expect.arrayContaining(teamIds.map((teamId) => ({ teamId, points: 0 }))),
    );
    for (const teamId of teamIds) {
      expect(
        matchState.scoring.matchTotals.find((entry) => entry.teamId === teamId)
          ?.signedTotal,
      ).toBe(0);
    }
  }, 240_000);

  it('16: playing every item completes exactly once', async () => {
    const { sessionId, participants } = await startSession();
    await bombRunning(sessionId);

    for (let index = 0; index < BOMB_ITEM_COUNT; index += 1) {
      const current = await rawRuntime(sessionId);
      if (
        !current ||
        ['completed', 'cancelled'].includes(String(current.status))
      )
        break;
      await command(
        sessionId,
        await activeActor(sessionId, participants),
        'submit-answer',
        { answer: answerFor(index) },
      );
    }

    const runtime = (await rawRuntime(sessionId))!;
    expect(['completed', 'cancelled']).toContain(String(runtime.status));
    expect(runtime.state.completedRounds).toHaveLength(1);
    expect(
      JSON.parse(String(runtime.state.runtimeState.resultJson)).endedBy,
    ).toBe('items-completed');
    expect((await rawSession(sessionId))!.status).toBe('active');
  }, 240_000);

  it('19: an answer racing the timeout produces at most one completion', async () => {
    const { sessionId, participants } = await startSession();
    await bombRunning(sessionId);
    const actor = await activeActor(sessionId, participants);

    await expireActiveClock(sessionId);
    const scheduler = app.get(GameplayDeadlineScheduler);

    await Promise.allSettled([
      scheduler.schedule(sessionId).then(() => settle(1200)),
      command(sessionId, actor, 'submit-answer', { answer: answerFor(0) }),
    ]);
    await settle();

    const runtime = (await rawRuntime(sessionId))!;
    expect(runtime.state.completedRounds.length).toBeLessThanOrEqual(1);
    const completions = (
      runtime.state.transitions as Array<{ type: string }>
    ).filter((entry) => entry.type === 'runtime-completed');
    expect(completions.length).toBeLessThanOrEqual(1);
  }, 240_000);

  it('bootstrap: rebuilds an expired Bomb deadline with no client action', async () => {
    const { sessionId } = await startSession();
    await bombRunning(sessionId);
    await expireActiveClock(sessionId);

    const scheduler = app.get(GameplayDeadlineScheduler);
    // Drop every timer the way a redeploy would, then boot again.
    scheduler.onModuleDestroy();
    const live = await runtimes().findSessionIdsWithLiveRuntimes();
    expect(live).toContain(sessionId);

    await scheduler.onApplicationBootstrap();
    await settle();

    const runtime = (await rawRuntime(sessionId))!;
    expect(['completed', 'cancelled']).toContain(String(runtime.status));
    expect((await rawSession(sessionId))!.status).toBe('active');
  }, 240_000);

  it('leakage: no accepted answer ever reaches a player snapshot', async () => {
    const { sessionId, participants } = await startSession();
    await bombRunning(sessionId);

    const snapshot = JSON.stringify(
      await app.get(GetGameplayRuntime).execute(sessionId, participants[0]),
    );

    expect(snapshot).not.toContain('answersJson');
    expect(snapshot).not.toContain('questionsJson');
    expect(snapshot).not.toContain('acceptedAnswers');
    // Neither the current item's answer nor any future one.
    for (let index = 0; index < BOMB_ITEM_COUNT; index += 1) {
      expect(snapshot).not.toContain(answerFor(index));
    }
    // A future item's picture is not shipped ahead of time either.
    expect(snapshot).not.toContain('/uploads/bomb/10.webp');
  }, 180_000);
});
