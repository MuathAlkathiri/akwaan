import crypto from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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
  ODD_PIECE_SLUG,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
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
import { GameplayRuntimeSocketFacade } from '../../src/modules/live-game-sessions/application/gameplay-runtime.socket-facade';
import { GetGameplayRuntime } from '../../src/modules/live-game-sessions/application/gameplay-runtime.queries';
import { StartOddPieceGameplay } from '../../src/modules/live-game-sessions/application/start-odd-piece-gameplay.use-case';
import { SubmitGameplayCommand } from '../../src/modules/live-game-sessions/application/submit-gameplay-command.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';

describe('Odd Piece Phase C.1 local multiplayer verification', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let oddTypeId: string;

  const uuid = () => crypto.randomUUID();
  const unwrap = <T>(response: request.Response): T =>
    (response.body?.data ?? response.body) as T;

  beforeAll(async () => {
    database = await connectTestDatabase('odd-piece-phase-c1');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('odd-piece-phase-c1') },
    });
    const http = () => request(app.getHttpServer());
    const login = await loginForToken(app, fixtureCredentials.admin);
    token = login;
    const me = await http()
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    controllerId = String(unwrap<{ id: string }>(me).id);
    const auth = <T extends request.Test>(value: T): T =>
      value.set('Authorization', `Bearer ${token}`) as T;

    const oddFixture = productionMechanicFixture(ODD_PIECE_SLUG);
    const mechanic = await auth(http().post('/admin/challenge-types'))
      .send(
        productionMechanicFixture(ODD_PIECE_SLUG, {
          status: WorldContentStatus.ACTIVE,
          defaultPresentation: {
            ...(oddFixture.defaultPresentation as Record<string, unknown>),
            timerSeconds: 30,
            answerTimerSeconds: 5,
          },
        }),
      )
      .expect(201);
    oddTypeId = String(unwrap<{ id: string }>(mechanic).id);
    const world = await auth(http().post('/admin/worlds'))
      .send({ name: 'Phase C1 Cars', slug: 'odd-piece-phase-c1' })
      .expect(201);
    worldId = String(unwrap<{ id: string }>(world).id);
    const scope = await auth(http().post(`/admin/worlds/${worldId}/scopes`))
      .send({
        name: 'Phase C1 Scope',
        slug: 'odd-piece-phase-c1-scope',
        status: WorldContentStatus.ACTIVE,
      })
      .expect(201);
    const scopeId = String(unwrap<{ id: string }>(scope).id);
    await auth(http().post(`/admin/worlds/${worldId}/challenge-configurations`))
      .send({
        challengeTypeId: oddTypeId,
        slotKey: WorldChallengeSlotKey.SLOT_1,
        isEnabled: true,
        sortOrder: 0,
      })
      .expect(201);

    const image = (key: string) => ({
      width: 1200,
      height: 800,
      orientation: 'landscape',
      media: {
        type: 'image',
        assets: [{ url: `https://assets.test/phase-c1/${key}.jpg` }],
      },
      provenance: {
        assetOrigin: 'authentic',
        sourceUrl: 'https://source.test/phase-c1',
      },
    });
    for (const [index, difficulty] of ['easy', 'medium', 'hard'].entries()) {
      const payload = {
        variant: 'odd-piece',
        version: 2,
        difficulty,
        modifiedImage: image(`p${index + 1}-modified`),
        originalImage: image(`p${index + 1}-original`),
        targetVehicleIdentity: 'target-car-generation',
        targetVehicleLabel: 'Target car',
        intruderVehicleIdentity: 'intruder-car-generation',
        intruderVehicleLabel: 'Intruder car',
        intruderPartIdentity: 'intruder-headlight',
        intruderPartLabel: 'Headlight',
        hotspot: {
          polygon: [
            { x: 0.4, y: 0.4 },
            { x: 0.6, y: 0.4 },
            { x: 0.6, y: 0.6 },
            { x: 0.4, y: 0.6 },
          ],
          tolerance: 0.01,
        },
      };
      await auth(http().post('/admin/content-items'))
        .send({
          scopeId,
          prompt: { ar: `حدد القطعة ${index + 1}` },
          compatibleChallengeTypeIds: [oddTypeId],
          answerPayload: { mode: ChallengeAnswerMode.ODD_PIECE },
          mechanicPayload: payload,
          status: ContentItemStatus.READY,
        })
        .expect(201);
    }
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    if (database) await resetTestDatabase(database);
    await database?.close();
  });

  const http = () => request(app.getHttpServer());
  const auth = <T extends request.Test>(value: T): T =>
    value.set('Authorization', `Bearer ${token}`) as T;
  const sessionRevision = async (sessionId: string) =>
    unwrap<{ revision: number }>(
      await auth(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    ).revision;
  const runtime = async (sessionId: string) =>
    (await app
      .get<GameplayRuntimeRepository>(GAMEPLAY_RUNTIME_REPOSITORY)
      .findBySessionId(sessionId))!;
  const state = async (sessionId: string) =>
    (await runtime(sessionId)).serialize().runtimeState;
  const controller = (): LiveSessionActor => ({
    kind: 'user',
    actorId: controllerId,
  });

  async function createFourPlayerSession() {
    const created = unwrap<{ snapshot: LiveGameSessionSnapshot }>(
      await auth(http().post('/live-game-sessions'))
        .send({
          modeKey: 'core-timed-turns',
          modeVersion: 1,
          teamNames: ['Team 1', 'Team 2'],
        })
        .expect(201),
    ).snapshot;
    expect(created.teams).toHaveLength(2);
    const access = await app.get(CreateSessionJoinAccess).execute({
      sessionId: created.sessionId,
      actorId: controllerId,
      assignmentPolicy: 'explicit',
    });
    const participants: LiveSessionActor[] = [];
    for (const team of created.teams) {
      for (let index = 0; index < 2; index += 1) {
        const joined = await app.get(JoinLiveSession).execute({
          joinCode: access.joinCode,
          displayName: `${team.name} Player ${index + 1}`,
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
            `c1-${joined.participantId}`,
          );
        await app.get(SetParticipantReadiness).execute({
          actor,
          ready: true,
          expectedRevision: await sessionRevision(created.sessionId),
          commandId: uuid(),
        });
        participants.push(actor);
      }
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
    return { sessionId: created.sessionId, teams: created.teams, participants };
  }

  const acknowledge = async (
    sessionId: string,
    actor: LiveSessionActor,
    connectionId: string,
  ) => {
    const current = await runtime(sessionId);
    const checkpoint = current.currentPresentationCheckpoint();
    await app.get(GameplayRuntimeSocketFacade).presentationReady(
      actor,
      {
        sessionId,
        commandId: uuid(),
        expectedSessionRevision: await sessionRevision(sessionId),
        expectedRuntimeRevision: current.revision,
        ...(checkpoint
          ? { presentationGeneration: checkpoint.generation }
          : {}),
      },
      connectionId,
    );
  };

  const command = async (
    sessionId: string,
    actor: LiveSessionActor,
    commandType: string,
    payload: Record<string, number> = {},
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

  it('verifies four-player privacy, fair-start, claim/5s handoff, reconnect and final scoring', async () => {
    const session = await createFourPlayerSession();
    const [team1, team2] = session.teams;
    const [team1a, team1b, team2a, team2b] = session.participants;
    const itemIds = (
      await database
        .collection('content_items')
        .find({ 'mechanicPayload.version': 2 })
        .sort({ createdAt: 1 })
        .toArray()
    ).map((item) => String(item._id));
    expect(itemIds).toHaveLength(3);

    await app.get(StartOddPieceGameplay).execute({
      sessionId: session.sessionId,
      actorId: controllerId,
      worldId,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      contentItemIds: itemIds,
    });
    const prepared = await state(session.sessionId);
    expect(prepared.phase).toBe('preparing');
    expect(prepared.deadlineAt).toBeNull();
    const required = (
      await runtime(session.sessionId)
    ).requiredPresentationSurfaces()!;
    expect(required.map((surface) => surface.capability)).toEqual([
      'shared',
      'answering',
      'decision',
    ]);
    expect(required.filter((surface) => surface.teamId)).toHaveLength(2);

    await acknowledge(session.sessionId, controller(), 'c1-shared-1');
    expect((await state(session.sessionId)).phase).toBe('preparing');
    await acknowledge(session.sessionId, team1a, `c1-${team1a.participantId}`);
    expect((await state(session.sessionId)).phase).toBe('preparing');
    await acknowledge(session.sessionId, team2a, `c1-${team2a.participantId}`);
    const open = await state(session.sessionId);
    expect(open.phase).toBe('open');
    const discussionSeconds =
      (Date.parse(String(open.deadlineAt)) - Date.now()) / 1000;
    expect(discussionSeconds).toBeGreaterThan(28);
    expect(discussionSeconds).toBeLessThanOrEqual(30.5);

    const privateOpen = await app
      .get(GetGameplayRuntime)
      .execute(session.sessionId, team1a);
    const projected = privateOpen.gameplay?.modeState ?? {};
    expect(projected).not.toHaveProperty('targetVehicleIdentity');
    expect(projected).not.toHaveProperty('hotspot');
    expect(String(projected.modifiedImageJson)).not.toContain('originalImage');
    await expect(
      command(session.sessionId, team1b, 'claim-odd-piece-hotspot'),
    ).rejects.toThrow('Only an acknowledged answer surface may submit');

    await command(session.sessionId, team1a, 'claim-odd-piece-hotspot');
    const claimed = await state(session.sessionId);
    expect(claimed.answerOwnerTeamId).toBe(team1.id);
    const answerSeconds =
      (Date.parse(String(claimed.deadlineAt)) - Date.now()) / 1000;
    expect(answerSeconds).toBeGreaterThan(4.2);
    expect(answerSeconds).toBeLessThanOrEqual(5.5);
    await command(session.sessionId, team1a, 'submit-odd-piece-hotspot', {
      x: 0.1,
      y: 0.1,
    });
    const wrong = await state(session.sessionId);
    expect(wrong.phase).toBe('answering');
    expect(wrong.answerOwnerTeamId).toBe(team2.id);
    const handoffSeconds =
      (Date.parse(String(wrong.deadlineAt)) - Date.now()) / 1000;
    expect(handoffSeconds).toBeGreaterThan(4.2);
    await command(session.sessionId, team2a, 'submit-odd-piece-hotspot', {
      x: 0.5,
      y: 0.5,
    });
    const revealed = await state(session.sessionId);
    expect(revealed.phase).toBe('revealed');
    const revealedProjection = await app
      .get(GetGameplayRuntime)
      .execute(session.sessionId, team1a);
    expect(revealedProjection.gameplay?.modeState).toHaveProperty('revealJson');
    expect(String(revealedProjection.gameplay?.modeState.revealJson)).toContain(
      'targetVehicleIdentity',
    );

    await app
      .get(UpdateParticipantPresence)
      .disconnected(
        session.sessionId,
        team1a.participantId!,
        `c1-${team1a.participantId}`,
      );
    const afterDisconnect = await state(session.sessionId);
    expect(
      JSON.parse(String(afterDisconnect.presentationReadyParticipantIdsJson)),
    ).not.toContain(team1a.participantId);
    await app
      .get(UpdateParticipantPresence)
      .connected(
        session.sessionId,
        team1a.participantId!,
        `c1-${team1a.participantId}-reconnect`,
      );
    await expect(
      command(session.sessionId, team1a, 'advance-odd-piece-hotspot'),
    ).rejects.toThrow();

    const playNext = async (actor: LiveSessionActor, teamId: string) => {
      await command(
        session.sessionId,
        controller(),
        'advance-odd-piece-hotspot',
      );
      await acknowledge(
        session.sessionId,
        controller(),
        `c1-shared-${Math.random()}`,
      );
      await acknowledge(
        session.sessionId,
        team1a,
        `c1-reconnected-${Math.random()}`,
      );
      await acknowledge(
        session.sessionId,
        team2a,
        `c1-opponent-${Math.random()}`,
      );
      expect((await state(session.sessionId)).phase).toBe('open');
      await command(session.sessionId, actor, 'claim-odd-piece-hotspot');
      expect((await state(session.sessionId)).answerOwnerTeamId).toBe(teamId);
      await command(session.sessionId, actor, 'submit-odd-piece-hotspot', {
        x: 0.5,
        y: 0.5,
      });
    };
    await playNext(team1a, team1.id);
    await playNext(team1a, team1.id);
    await command(session.sessionId, controller(), 'advance-odd-piece-hotspot');
    const completed = await state(session.sessionId);
    expect(completed.phase).toBe('completed');
    expect(JSON.parse(String(completed.resultJson))).toEqual({
      winnerTeamId: team1.id,
      tie: false,
      points: { [team1.id]: 2, [team2.id]: 1 },
    });
    // The second participant on each team was present and ready, but only the
    // server-assigned answering/decision surfaces can submit the current item.
    expect([team1b.participantId, team2b.participantId]).toHaveLength(2);
  }, 180_000);
});
