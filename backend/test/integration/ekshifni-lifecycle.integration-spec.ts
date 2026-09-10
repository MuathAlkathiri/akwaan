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
  ContentMediaType,
  EKSHIFNI_REGION_ROLES,
  EKSHIFNI_SLUG,
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
import { EkshifniRuntimeImage } from '../../src/modules/live-game-sessions/domain/ekshifni-gameplay.plugin';
import { MatchStage } from '../../src/modules/match/domain/match.constants';

/**
 * "اكشفني" end to end, against a real database.
 *
 * The unit tests already hold the reducer to the rules. What only this tier can
 * show is that the rules survive the whole authoritative path: that an authored
 * ContentItem the Admin accepted actually launches, that Fair-Start really does
 * keep the celebrity off the wire until the room is ready, that the projection a
 * phone receives over the real snapshot carries no pixels and no answers, and
 * that the Match converges exactly once at the end.
 */

type MatchSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']>;
};

const SLOT = WorldChallengeSlotKey.SLOT_1;

describe('اكشفني lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let scopeIds: string[];

  const uuid = () => crypto.randomUUID();

  beforeAll(async () => {
    database = await connectTestDatabase('ekshifni-lifecycle');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('ekshifni-lifecycle') },
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

  /** Six non-overlapping windows in image fractions, exactly as the Admin emits. */
  const ekshifniPayload = () => ({
    variant: 'ekshifni',
    regions: EKSHIFNI_REGION_ROLES.map((role, index) => ({
      localId: `region-${index + 1}`,
      role,
      shape: {
        x: (index % 3) * 0.32 + 0.02,
        y: index < 3 ? 0.05 : 0.5,
        width: 0.28,
        height: 0.4,
      },
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
    // The locked Celebrities board: Signature + RYO + Closest + Bomb. Seating
    // the real four here is what makes this suite a check on the World that
    // ships, rather than on an arrangement only the test ever sees.
    const ekshifni = await type(EKSHIFNI_SLUG);
    const ryo = await type(RYO_MODE_KEY);
    const closest = await type(CLOSEST_MODE_KEY);
    const bomb = await type(BOMB_MODE_KEY);
    const world = (
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'المشاهير', slug: 'ekshifni-celebrities' })
        .expect(201)
    ).body.data as { id: string };
    const scopes: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const scope = (
        await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
          .send({
            name: `مشاهير ${index + 1}`,
            slug: `ekshifni-scope-${index + 1}`,
            status: WorldContentStatus.ACTIVE,
          })
          .expect(201)
      ).body.data as { id: string };
      scopes.push(String(scope.id));
    }
    for (const [index, [challengeTypeId, slotKey]] of [
      [ekshifni.id, SLOT],
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
          prompt: { ar: `من هذا المشهور؟ ${label}` },
          compatibleChallengeTypeIds: [ekshifni.id],
          media: {
            type: ContentMediaType.IMAGE,
            assets: [{ url: `https://cdn.test/celebrity-${label}.webp` }],
          },
          answerPayload: {
            mode: ChallengeAnswerMode.MATCH,
            acceptedAnswers: [`مشهور-${label}`, `celebrity-${label}`],
          },
          mechanicPayload: ekshifniPayload(),
          status: ContentItemStatus.READY,
        });
        // Authoring and launch share one contract: an item the Admin accepts is
        // exactly an item the launcher will start.
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
  const rawState = async (sessionId: string) => {
    const document = await database
      .collection('gameplay_runtimes')
      .findOne({ sessionId }, { sort: { createdAt: -1 } });
    return (document!.state as { runtimeState: Record<string, unknown> })
      .runtimeState;
  };
  const currentImage = async (sessionId: string) => {
    const state = await rawState(sessionId);
    const images = JSON.parse(
      String(state.imagesJson),
    ) as EkshifniRuntimeImage[];
    return images[Number(state.currentImageIndex)];
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
    // Captured at prepare time: the Match decides the selecting team by coin
    // toss and may rotate it afterwards, so reading it later would be reading a
    // different turn than the one this challenge launched from.
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

  it('seats the locked Celebrities board: Signature + RYO + Closest + Bomb', async () => {
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
      [WorldChallengeSlotKey.SLOT_1, EKSHIFNI_SLUG],
      [WorldChallengeSlotKey.SLOT_2, RYO_MODE_KEY],
      [WorldChallengeSlotKey.SLOT_3, CLOSEST_MODE_KEY],
      [WorldChallengeSlotKey.SLOT_4, BOMB_MODE_KEY],
    ]);
    // Every seat resolves through the launcher registry, so the board is one a
    // Match can actually open — the check that would have caught اكشفني being
    // seated before it had a launcher.
    expect(readiness.blockers.map((blocker) => blocker.code)).not.toContain(
      'CHALLENGE_LAUNCHER_NOT_IMPLEMENTED',
    );
  }, 60_000);

  it('plays three celebrities with split initiative, an open answer race, and converges once', async () => {
    const session = await startSession();
    const { selectingTeamId } = await launch(session.sessionId);

    // Fair-Start: the celebrity is hidden and clockless, and nothing is burned.
    const before = await rawState(session.sessionId);
    expect(before.phase).toBe('preparing');
    expect(before.deadlineAt).toBeNull();
    // The runtime records who selected, and image 1 opens with them: A → B → A
    // is anchored to this team for the rest of the challenge.
    expect(before.selectingTeamId).toBe(selectingTeamId);
    expect(before.initiativeTeamId).toBe(before.selectingTeamId);
    expect(await exposedCount()).toBe(0);
    const hidden = await app
      .get(GetGameplayRuntime)
      .execute(session.sessionId, controller());
    expect(hidden.gameplay!.modeState).not.toHaveProperty('imageMediaJson');

    await present(session.sessionId);
    const active = await rawState(session.sessionId);
    expect(active.phase).toBe('playing');
    expect(Date.parse(String(active.deadlineAt))).toBeGreaterThan(Date.now());

    const image = await currentImage(session.sessionId);
    const initiativeIndex = session.teamIds.indexOf(selectingTeamId);
    const initiativeActor = session.participants[initiativeIndex];
    const opponentActor = session.participants[initiativeIndex === 0 ? 1 : 0];

    // Privacy over the real snapshot. The shared board gets the picture and six
    // numbers; it never gets the celebrity, an accepted answer, or the authoring
    // role of any mask. A phone gets no picture and no geometry at all.
    const shared = (
      await app.get(GetGameplayRuntime).execute(session.sessionId, controller())
    ).gameplay!.modeState;
    expect(String(shared.imageMediaJson)).toContain('celebrity-');
    const sharedText = JSON.stringify(shared);
    expect(sharedText).not.toContain('مشهور-');
    for (const role of EKSHIFNI_REGION_ROLES) {
      expect(sharedText).not.toContain(role);
    }
    // Six mask boxes for the surface that draws them; the role that would name
    // the feature is absent, which is the part that would give the answer away.
    expect(JSON.parse(String(shared.regionsJson))).toHaveLength(6);
    expect(
      JSON.parse(String(shared.regionsJson)).every(
        (region: { shape?: unknown; revealed: boolean }) =>
          region.shape && region.revealed === false,
      ),
    ).toBe(true);
    const phone = (
      await app
        .get(GetGameplayRuntime)
        .execute(session.sessionId, initiativeActor)
    ).gameplay!.modeState;
    expect(phone.imageMediaJson).toBeNull();
    const phoneText = JSON.stringify(phone);
    expect(phoneText).not.toContain('celebrity-');
    expect(phoneText).not.toContain('مشهور-');
    expect(phone.canReveal).toBe(true);
    expect(phone.canAnswer).toBe(true);

    // Reveal is gated by initiative alone.
    await expect(
      command(session.sessionId, opponentActor, 'reveal-ekshifni-region', {
        regionId: image.regions[0].id,
      }),
    ).rejects.toThrow();
    await command(
      session.sessionId,
      initiativeActor,
      'reveal-ekshifni-region',
      {
        regionId: image.regions[0].id,
      },
    );
    // Uncovering a mask makes the picture cheaper, and only the shared screen is
    // told where the mask is.
    const afterReveal = (
      await app.get(GetGameplayRuntime).execute(session.sessionId, controller())
    ).gameplay!.modeState;
    expect(afterReveal.currentValue).toBe(4);
    expect(JSON.parse(String(afterReveal.regionsJson))[0]).toMatchObject({
      revealed: true,
    });
    expect(JSON.parse(String(afterReveal.regionsJson))[1]).toMatchObject({
      revealed: false,
    });
    // A phone still gets numbers and nothing else.
    expect(
      JSON.parse(
        String(
          (
            await app
              .get(GetGameplayRuntime)
              .execute(session.sessionId, initiativeActor)
          ).gameplay!.modeState.regionsJson,
        ),
      ).every((region: { shape?: unknown }) => !region.shape),
    ).toBe(true);

    // The same region cannot be spent twice.
    await expect(
      command(session.sessionId, initiativeActor, 'reveal-ekshifni-region', {
        regionId: image.regions[0].id,
      }),
    ).rejects.toThrow();

    // A wrong answer costs the turn, not the game: initiative moves and the
    // answering team is parked — but nothing about the celebrity is disclosed.
    await command(session.sessionId, initiativeActor, 'submit-ekshifni', {
      answer: 'مشهور خاطئ',
    });
    const parked = await rawState(session.sessionId);
    expect(parked.phase).toBe('playing');
    expect(parked.answerPenaltyTeamId).toBe(selectingTeamId);
    expect(parked.initiativeTeamId).not.toBe(selectingTeamId);
    const stillHidden = (
      await app.get(GetGameplayRuntime).execute(session.sessionId, controller())
    ).gameplay!.modeState;
    expect(stillHidden).not.toHaveProperty('revealJson');
    expect(JSON.stringify(stillHidden)).not.toContain('مشهور-');
    await expect(
      command(session.sessionId, initiativeActor, 'submit-ekshifni', {
        answer: image.acceptedAnswers[0],
      }),
    ).rejects.toThrow();

    // One action from the opponent restores the parked team's eligibility —
    // nobody is eliminated from an image.
    await command(session.sessionId, opponentActor, 'reveal-ekshifni-region', {
      regionId: image.regions[1].id,
    });
    expect((await rawState(session.sessionId)).answerPenaltyTeamId).toBeNull();

    // Answering is open: the team without initiative takes the picture.
    await command(session.sessionId, initiativeActor, 'submit-ekshifni', {
      answer: image.acceptedAnswers[1],
    });
    const resolved = await rawState(session.sessionId);
    expect(resolved.phase).toBe('resolved');
    const firstResult = JSON.parse(String(resolved.resultsJson))[0];
    expect(firstResult.winnerTeamId).toBe(selectingTeamId);
    expect(firstResult.value).toBe(3);
    // Only now is the identity projected, and only through the terminal reveal.
    const revealed = (
      await app.get(GetGameplayRuntime).execute(session.sessionId, controller())
    ).gameplay!.modeState;
    expect(String(revealed.revealJson)).toContain(image.identity);

    // Celebrities 2 and 3, each a fresh Fair-Start generation, with the opening
    // initiative rotating A → B → A.
    for (let imageIndex = 1; imageIndex < 3; imageIndex += 1) {
      await command(session.sessionId, controller(), 'advance-ekshifni');
      const prepared = (await runtime(session.sessionId)).serialize();
      expect(prepared.currentPresentation?.status).toBe('prepared');
      expect(prepared.currentPresentation?.generation).toBe(imageIndex);
      expect(await exposedCount()).toBe(imageIndex);
      const opening = await rawState(session.sessionId);
      expect(opening.initiativeTeamId).toBe(
        imageIndex % 2 === 0
          ? selectingTeamId
          : session.teamIds.find((id) => id !== selectingTeamId),
      );

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
            presentationGeneration: imageIndex - 1,
          },
          'shared-screen-socket',
        ),
      ).rejects.toThrow();

      await present(session.sessionId);
      expect((await rawState(session.sessionId)).phase).toBe('playing');
      const next = await currentImage(session.sessionId);
      await command(
        session.sessionId,
        session.participants[imageIndex % 2],
        'submit-ekshifni',
        { answer: next.acceptedAnswers[0] },
      );
    }
    await command(session.sessionId, controller(), 'advance-ekshifni');

    const finished = await snapshot(session.sessionId);
    expect(finished.match.stage.key).toBe(MatchStage.CHALLENGE_RESULT);
    expect(finished.match.challengeResult?.challengeKey).toBe(EKSHIFNI_SLUG);
    expect(
      finished.match.challengeResult?.details.mechanicTotals,
    ).toBeDefined();
    expect(await exposedCount()).toBe(3);
    expect(finished.match.challengeHistory).toHaveLength(1);
  }, 120_000);

  it('aborts before first activation without burning a celebrity', async () => {
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
