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
  FIRST_NOTE_SLUG,
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
import { FirstNoteRuntimeSong } from '../../src/modules/live-game-sessions/domain/first-note-gameplay.plugin';
import { MatchStage } from '../../src/modules/match/domain/match.constants';

type MatchSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']>;
};

const SLOT = WorldChallengeSlotKey.SLOT_1;

describe('من أول نغمة lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let scopeIds: string[];

  const uuid = () => crypto.randomUUID();

  beforeAll(async () => {
    database = await connectTestDatabase('first-note-lifecycle');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('first-note-lifecycle') },
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

  const firstNotePayload = (label: string) => ({
    variant: 'first-note',
    contextualClue: { ar: `من حقبة ${label}` },
    clueLabel: { ar: 'الحقبة' },
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
    const firstNote = await type(FIRST_NOTE_SLUG);
    const closest = await type(CLOSEST_MODE_KEY);
    const oneClue = await type(ONE_CLUE_MODE_KEY);
    const ryo = await type(RYO_MODE_KEY);
    const world = (
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'الأغاني', slug: 'first-note-music' })
        .expect(201)
    ).body.data as { id: string };
    const scopes: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const scope = (
        await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
          .send({
            name: `أغانٍ ${index + 1}`,
            slug: `first-note-scope-${index + 1}`,
            status: WorldContentStatus.ACTIVE,
          })
          .expect(201)
      ).body.data as { id: string };
      scopes.push(String(scope.id));
    }
    for (const [index, [challengeTypeId, slotKey]] of [
      [firstNote.id, SLOT],
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
            prompt: { ar: `أغنية ${label}` },
            compatibleChallengeTypeIds: [firstNote.id],
            answerPayload: {
              mode: ChallengeAnswerMode.MATCH,
              acceptedAnswers: [`أغنية-${label}`, `song-${label}`],
            },
            mechanicPayload: firstNotePayload(label),
            media: {
              type: 'audio',
              assets: [{ url: `https://cdn.test/${label}.mp3` }],
            },
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
  const currentSong = async (sessionId: string) => {
    const state = await rawState(sessionId);
    const songs = JSON.parse(String(state.songsJson)) as FirstNoteRuntimeSong[];
    return songs[Number(state.currentSongIndex)];
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
    payload: Record<string, string | number> = {},
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

  it('plays three recurring auctions with CAS, same-duration steal, and converges once', async () => {
    const session = await startSession();
    await launch(session.sessionId);

    const before = await rawState(session.sessionId);
    expect(before.phase).toBe('preparing');
    expect(before.deadlineAt).toBeNull();
    expect(await exposedCount()).toBe(0);

    await present(session.sessionId);
    const active = await rawState(session.sessionId);
    expect(active.phase).toBe('auction');
    expect(active.deadlineAt).toBeNull();

    // Privacy: clue is public, while answer truth, future audio, and every phone
    // audio URL remain server-side.
    const sharedSnapshot = await app
      .get(GetGameplayRuntime)
      .execute(session.sessionId, controller());
    const sharedMode = sharedSnapshot.gameplay!.modeState;
    expect(String(sharedMode.contextualClueJson)).toContain('من حقبة');
    expect(JSON.stringify(sharedMode)).not.toContain('song-');
    expect(String(sharedMode.audioJson)).toContain('.mp3');
    expect(sharedMode).not.toHaveProperty('acceptedAnswers');
    const phoneSnapshot = await app
      .get(GetGameplayRuntime)
      .execute(session.sessionId, session.participants[0]);
    const phoneMode = phoneSnapshot.gameplay!.modeState;
    expect(JSON.stringify(phoneMode)).not.toContain('song-');
    expect(JSON.stringify(phoneMode)).not.toContain('.mp3');

    // Reconnect preserves the auction state rather than restarting it.
    const reconnected = await app
      .get(GetGameplayRuntime)
      .execute(session.sessionId, controller());
    expect(reconnected.gameplay!.modeState.biddingTeamId).toBe(
      sharedMode.biddingTeamId,
    );

    // Two simultaneous teammate bids against one revision: exactly one commits.
    const raceRuntime = await runtime(session.sessionId);
    const raceRevisions = {
      session: await sessionRevision(session.sessionId),
      runtime: raceRuntime.revision,
    };
    const race = await Promise.allSettled([
      command(
        session.sessionId,
        session.participants[0],
        'submit-first-note-bid',
        { seconds: 9 },
        raceRevisions,
      ),
      command(
        session.sessionId,
        session.participants[0],
        'submit-first-note-bid',
        { seconds: 8 },
        raceRevisions,
      ),
    ]);
    expect(race.filter((entry) => entry.status === 'fulfilled')).toHaveLength(
      1,
    );

    const afterRace = await rawState(session.sessionId);
    expect(afterRace.phase).toBe('auction');
    expect(afterRace.currentBidTeamId).toBe(session.teamIds[0]);
    expect(afterRace.biddingTeamId).toBe(session.teamIds[1]);
    await command(
      session.sessionId,
      session.participants[1],
      'pass-first-note-bid',
    );
    const answering = await rawState(session.sessionId);
    expect(answering).toMatchObject({
      phase: 'answering',
      answerOwnerTeamId: session.teamIds[0],
      finalBidSeconds: answering.currentBidSeconds,
    });
    const frozenDeadline = String(answering.deadlineAt);
    const sharedAnswer = await app
      .get(GetGameplayRuntime)
      .execute(session.sessionId, controller());
    expect(String(sharedAnswer.gameplay!.modeState.audioJson)).toContain(
      '.mp3',
    );
    expect(
      (
        await app
          .get(GetGameplayRuntime)
          .execute(session.sessionId, session.participants[0])
      ).gameplay!.modeState,
    ).not.toHaveProperty('audioJson');
    expect(
      (
        await app
          .get(GetGameplayRuntime)
          .execute(session.sessionId, controller())
      ).gameplay!.modeState.deadlineAt,
    ).toBe(frozenDeadline);

    // Wrong first answer transfers one same-duration attempt to the opponent.
    await command(
      session.sessionId,
      session.participants[0],
      'submit-first-note-answer',
      { answer: 'خطأ' },
    );
    const steal = await rawState(session.sessionId);
    expect(steal).toMatchObject({
      phase: 'steal',
      answerOwnerTeamId: session.teamIds[1],
      finalBidSeconds: answering.finalBidSeconds,
    });
    const song = await currentSong(session.sessionId);
    await command(
      session.sessionId,
      session.participants[1],
      'submit-first-note-answer',
      { answer: song.acceptedAnswers[0] },
    );
    expect((await rawState(session.sessionId)).phase).toBe('resolved');

    // Songs 2 and 3 each receive a fresh Fair-Start generation.
    for (let songIndex = 1; songIndex < 3; songIndex += 1) {
      await command(session.sessionId, controller(), 'advance-first-note');
      const prepared = (await runtime(session.sessionId)).serialize();
      expect(prepared.currentPresentation?.status).toBe('prepared');
      expect(prepared.currentPresentation?.generation).toBe(songIndex);
      expect(await exposedCount()).toBe(songIndex);

      // A stale ack for the previous generation must never activate this one.
      await expect(
        app.get(GameplayRuntimeSocketFacade).presentationReady(
          controller(),
          {
            sessionId: session.sessionId,
            commandId: uuid(),
            expectedSessionRevision: await sessionRevision(session.sessionId),
            expectedRuntimeRevision: (await runtime(session.sessionId))
              .revision,
            presentationGeneration: songIndex - 1,
          },
          'shared-screen-socket',
        ),
      ).rejects.toThrow();

      await present(session.sessionId);
      expect((await rawState(session.sessionId)).phase).toBe('auction');
      const opener = session.participants[songIndex % 2];
      const passer = session.participants[(songIndex + 1) % 2];
      await command(session.sessionId, opener, 'submit-first-note-bid', {
        seconds: songIndex === 1 ? 6 : 12,
      });
      await command(session.sessionId, passer, 'pass-first-note-bid');
      const nextSong = await currentSong(session.sessionId);
      await command(session.sessionId, opener, 'submit-first-note-answer', {
        answer: nextSong.acceptedAnswers[0],
      });
    }
    await command(session.sessionId, controller(), 'advance-first-note');

    const finished = await snapshot(session.sessionId);
    expect(finished.match.stage.key).toBe(MatchStage.CHALLENGE_RESULT);
    expect(finished.match.challengeResult?.challengeKey).toBe(FIRST_NOTE_SLUG);
    expect(
      finished.match.challengeResult?.details.mechanicTotals,
    ).toBeDefined();
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
