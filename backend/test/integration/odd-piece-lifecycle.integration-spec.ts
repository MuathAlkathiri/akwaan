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
  ODD_PIECE_SLUG,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { CLOSEST_MODE_KEY } from '../../src/modules/live-game-sessions/domain/closest-gameplay.plugin';
import { ONE_CLUE_MODE_KEY } from '../../src/modules/live-game-sessions/domain/one-clue-gameplay.plugin';
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
import { OddPiecePuzzle } from '../../src/modules/live-game-sessions/domain/odd-piece-gameplay.plugin';
import { MatchStage } from '../../src/modules/match/domain/match.constants';

type MatchSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']>;
};

const SLOT = WorldChallengeSlotKey.SLOT_1;

describe('Odd Piece lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let scopeIds: string[];

  const uuid = () => crypto.randomUUID();

  beforeAll(async () => {
    database = await connectTestDatabase('odd-piece-lifecycle');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('odd-piece-lifecycle') },
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

  const image = (url: string) => ({
    type: 'image',
    assets: [{ url }],
  });
  const oddPayload = (label: string) => ({
    variant: 'odd-piece',
    targetVehicleIdentity: `${label}-target`,
    targetVehicleLabel: `${label} Target`,
    targetVehicleReveal: image(`https://test/${label}/full.jpg`),
    pieces: [
      ['a', `${label}-target`, `${label} Target`],
      ['b', `${label}-target`, `${label} Target`],
      ['c', `${label}-target`, `${label} Target`],
      ['d', `${label}-odd`, `${label} Intruder`],
    ].map(([localId, vehicleIdentity, vehicleLabel]) => ({
      localId,
      vehicleIdentity,
      vehicleLabel,
      media: image(`https://test/${label}/${localId}.jpg`),
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
    const odd = await type(ODD_PIECE_SLUG);
    const closest = await type(CLOSEST_MODE_KEY);
    const oneClue = await type(ONE_CLUE_MODE_KEY);
    const ryo = await type(RYO_MODE_KEY);
    const world = (
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'السيارات', slug: 'odd-piece-cars' })
        .expect(201)
    ).body.data as { id: string };
    const scopes: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const scope = (
        await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
          .send({
            name: `سيارات ${index + 1}`,
            slug: `odd-piece-scope-${index + 1}`,
            status: WorldContentStatus.ACTIVE,
          })
          .expect(201)
      ).body.data as { id: string };
      scopes.push(String(scope.id));
    }
    for (const [index, [challengeTypeId, slotKey]] of [
      [odd.id, SLOT],
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
    for (const [scopeIndex, scopeId] of scopes.entries()) {
      for (let copy = 0; copy < 3; copy += 1) {
        const label = `p${scopeIndex}-${copy}`;
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId,
            prompt: { ar: `اختر القطعة ${label}` },
            compatibleChallengeTypeIds: [odd.id],
            answerPayload: { mode: ChallengeAnswerMode.ODD_PIECE },
            mechanicPayload: oddPayload(label),
            status: ContentItemStatus.READY,
          })
          .expect(201);
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
            prompt: { ar: `دليل ${label}` },
            compatibleChallengeTypeIds: [oneClue.id],
            answerPayload: {
              mode: ChallengeAnswerMode.MATCH,
              acceptedAnswers: ['إجابة'],
            },
            mechanicPayload: {
              clues: [5, 4, 3, 2, 1].map((value, clueIndex) => ({
                order: clueIndex + 1,
                value,
                text: { ar: `دليل ${clueIndex + 1} ${label}` },
              })),
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
  const rawState = async (sessionId: string) => {
    const document = await database
      .collection('gameplay_runtimes')
      .findOne({ sessionId }, { sort: { createdAt: -1 } });
    return (document!.state as { runtimeState: Record<string, unknown> })
      .runtimeState;
  };
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
    const participants: LiveSessionActor[] = [];
    for (const [index, team] of created.teams.entries()) {
      const joined = await app.get(JoinLiveSession).execute({
        joinCode: access.joinCode,
        displayName: `لاعب ${index + 1}`,
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
      participants.push(actor);
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
      participants,
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
    for (const path of ['prepare', 'launch']) {
      const current = await snapshot(sessionId);
      const response = await bearer(
        http().post(matchRoute(sessionId, `/unified/challenges/${path}`)),
      ).send({
        commandId: uuid(),
        expectedMatchRevision: current.match.revision,
        occurrenceIndex: 0,
        slotKey: SLOT,
        selectingTeamId: current.match.unified!.selectingTeamId,
      });
      if (response.status !== 201)
        throw new Error(
          `${path}: ${response.status} ${JSON.stringify(response.body)}`,
        );
    }
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
    revisions?: { session: number; runtime: number },
  ) => {
    const current = await runtime(sessionId);
    return app.get(SubmitGameplayCommand).execute({
      sessionId,
      roundId: current.serialize().activeRound!.id,
      actor,
      commandId: uuid(),
      commandType,
      payload,
      expectedSessionRevision:
        revisions?.session ?? (await sessionRevision(sessionId)),
      expectedRuntimeRevision: revisions?.runtime ?? current.revision,
    });
  };
  const currentPuzzle = async (sessionId: string) => {
    const state = await rawState(sessionId);
    const puzzles = JSON.parse(String(state.puzzlesJson)) as OddPiecePuzzle[];
    return puzzles[Number(state.currentPuzzleIndex)];
  };
  const oddId = (puzzle: OddPiecePuzzle) => {
    const counts = new Map<string, number>();
    puzzle.pieces.forEach((piece) =>
      counts.set(
        piece.vehicleIdentity,
        (counts.get(piece.vehicleIdentity) ?? 0) + 1,
      ),
    );
    return puzzle.pieces.find(
      (piece) => counts.get(piece.vehicleIdentity) === 1,
    )!.id;
  };

  it('plays three recurring puzzles through Match and converges exactly once', async () => {
    const session = await startSession();
    await launch(session.sessionId);

    const before = await rawState(session.sessionId);
    expect(before.phase).toBe('preparing');
    expect(before.deadlineAt).toBeNull();
    expect(await exposedCount()).toBe(0);

    await present(session.sessionId);
    const active = await rawState(session.sessionId);
    expect(active.phase).toBe('open');
    expect(Date.parse(String(active.deadlineAt))).toBeGreaterThan(Date.now());

    const participantSnapshot = await app
      .get(GetGameplayRuntime)
      .execute(session.sessionId, session.participants[0]);
    const projected = participantSnapshot.gameplay!.modeState;
    expect(projected).not.toHaveProperty('targetVehicleIdentity');
    expect(String(projected.piecesJson)).not.toContain('vehicleIdentity');
    expect(String(projected.piecesJson)).not.toContain('imageUrl');
    const sharedSnapshot = await app
      .get(GetGameplayRuntime)
      .execute(session.sessionId, controller());
    expect(String(sharedSnapshot.gameplay!.modeState.piecesJson)).toContain(
      'imageUrl',
    );
    const firstOrdering = String(projected.piecesJson);
    const reconnected = await app
      .get(GetGameplayRuntime)
      .execute(session.sessionId, session.participants[0]);
    expect(reconnected.gameplay!.modeState.piecesJson).toBe(firstOrdering);
    expect(reconnected.gameplay!.modeState.deadlineAt).toBe(
      projected.deadlineAt,
    );

    const raceRuntime = await runtime(session.sessionId);
    const raceRevisions = {
      session: await sessionRevision(session.sessionId),
      runtime: raceRuntime.revision,
    };
    const race = await Promise.allSettled([
      command(
        session.sessionId,
        session.participants[0],
        'claim-odd-piece',
        {},
        raceRevisions,
      ),
      command(
        session.sessionId,
        session.participants[1],
        'claim-odd-piece',
        {},
        raceRevisions,
      ),
    ]);
    expect(race.filter((entry) => entry.status === 'fulfilled')).toHaveLength(
      1,
    );
    const stateAfterRace = await rawState(session.sessionId);
    const owner = String(stateAfterRace.answerOwnerTeamId);
    const ownerIndex = session.teamIds.indexOf(owner);
    const firstActor = session.participants[ownerIndex];
    const opponentActor = session.participants[ownerIndex === 0 ? 1 : 0];
    const firstPuzzle = await currentPuzzle(session.sessionId);
    const wrongPiece = firstPuzzle.pieces.find(
      (piece) => piece.id !== oddId(firstPuzzle),
    )!.id;
    await command(session.sessionId, firstActor, 'submit-odd-piece', {
      pieceId: wrongPiece,
    });
    const handedOff = await rawState(session.sessionId);
    expect(handedOff.phase).toBe('selecting');
    expect(handedOff.answerOwnerTeamId).toBe(
      session.teamIds[ownerIndex === 0 ? 1 : 0],
    );
    await command(session.sessionId, opponentActor, 'submit-odd-piece', {
      pieceId: oddId(firstPuzzle),
    });

    for (let puzzleIndex = 1; puzzleIndex < 3; puzzleIndex += 1) {
      await command(session.sessionId, controller(), 'advance-odd-piece');
      const prepared = (await runtime(session.sessionId)).serialize();
      expect(prepared.currentPresentation?.status).toBe('prepared');
      expect(prepared.currentPresentation?.generation).toBe(puzzleIndex);
      expect(await exposedCount()).toBe(puzzleIndex);
      await present(session.sessionId);
      const puzzle = await currentPuzzle(session.sessionId);
      const actor = session.participants[puzzleIndex % 2];
      await command(session.sessionId, actor, 'claim-odd-piece');
      await command(session.sessionId, actor, 'submit-odd-piece', {
        pieceId: oddId(puzzle),
      });
    }
    await command(session.sessionId, controller(), 'advance-odd-piece');

    const finished = await snapshot(session.sessionId);
    expect(finished.match.stage.key).toBe(MatchStage.CHALLENGE_RESULT);
    expect(finished.match.challengeResult?.challengeKey).toBe(ODD_PIECE_SLUG);
    expect(finished.match.challengeResult?.details.points).toBeDefined();
    expect(await exposedCount()).toBe(3);
    expect(finished.match.challengeHistory).toHaveLength(1);
  }, 120_000);

  it('aborts before first activation without burning selected content', async () => {
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
});
