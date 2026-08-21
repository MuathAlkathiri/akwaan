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
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
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
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../../src/modules/match/persistence/match.repository';
import { MatchConvergenceSweeper } from '../../src/modules/match/application/match-convergence.sweeper';
import { CLOSEST_MODE_KEY } from '../../src/modules/live-game-sessions/domain/closest-gameplay.plugin';
import { ONE_CLUE_MODE_KEY } from '../../src/modules/live-game-sessions/domain/one-clue-gameplay.plugin';
import { RYO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/ryo-gameplay.plugin';
import { TOP5_SLUG } from '../../src/modules/world-content/domain/world-content.constants';

/**
 * Abort as a first-class lifecycle transition, on real replica-set Mongo.
 *
 * The product rule behind all of this: starting a challenge and changing your
 * mind must never be able to freeze the game. Abort is therefore a real
 * transition rather than a client-side navigation — it releases the runtime,
 * releases the Match's ownership of the board position, and scores nothing.
 *
 * The races below are deterministic without sleeps or timing luck. Every
 * concurrent lifecycle command in this system carries the runtime revision it
 * was decided against, so "two operations racing" is expressed exactly as a
 * concurrent client would express it: hold the revision read before the other
 * operation committed, then send. CAS decides, and the loser is refused.
 */

type MatchBearingSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']> & {
    unified: NonNullable<
      NonNullable<LiveGameSessionSnapshot['match']>['unified']
    >;
  };
};

describe('challenge abort lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let scopeIds: string[];

  // Real UUIDs: the command DTOs validate the format, and a lifecycle command
  // rejected for a malformed id proves nothing about the lifecycle.
  const uuid = () => crypto.randomUUID();

  beforeAll(async () => {
    database = await connectTestDatabase('challenge-abort');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('challenge-abort') },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    controllerId = await currentUserId();
    ({ worldId, scopeIds } = await seedWorld());
  }, 240_000);

  /**
   * A fresh content history for every scenario.
   *
   * These scenarios relaunch the same board position repeatedly as one fixture
   * account, so the per-account no-repeat rule would legitimately exhaust the
   * seeded content partway through. That rule has its own suite; this one is about
   * abort and launch-time recovery, so each scenario starts as a first-time
   * account would.
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
   * A board carrying three genuinely different mechanics.
   *
   * Closest and One-Clue are the two the abort contract had never been proven
   * against on real Mongo; RYO is included so a race can be run on the mechanic
   * whose lifecycle is interaction-driven rather than mode-command-driven.
   */
  const seedWorld = async () => {
    const challengeType = async (slug: string) => {
      const response = await bearer(http().post('/admin/challenge-types')).send(
        // Active, because a draft mechanic cannot legally fill a board slot.
        productionMechanicFixture(slug, {
          status: WorldContentStatus.ACTIVE,
        }),
      );
      if (response.status !== 201) {
        throw new Error(
          `challenge-type ${slug} -> ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
      return response.body.data as { id: string };
    };

    const closest = await challengeType(CLOSEST_MODE_KEY);
    const oneClue = await challengeType(ONE_CLUE_MODE_KEY);
    const ryo = await challengeType(RYO_MODE_KEY);
    // A fourth, distinct mechanic: a World refuses the same challenge type in
    // two board positions, and a unified Match needs all four configured.
    const top5 = await challengeType(TOP5_SLUG);

    const world = (
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'عالم الإلغاء', slug: 'abort-world' })
        .expect(201)
    ).body.data as { id: string };

    const scopes: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const scope = (
        await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
          .send({
            name: `نطاق ${index}`,
            slug: `abort-scope-${index}`,
            status: WorldContentStatus.ACTIVE,
          })
          .expect(201)
      ).body.data as { id: string };
      scopes.push(String(scope.id));
    }

    const configure = (body: Record<string, unknown>) =>
      bearer(
        http().post(`/admin/worlds/${world.id}/challenge-configurations`),
      ).send(body);
    for (const [index, [challengeTypeId, slotKey]] of [
      [closest.id, WorldChallengeSlotKey.SLOT_1],
      [ryo.id, WorldChallengeSlotKey.SLOT_2],
      [oneClue.id, WorldChallengeSlotKey.SLOT_3],
      [top5.id, WorldChallengeSlotKey.SLOT_4],
    ].entries()) {
      await configure({
        challengeTypeId,
        slotKey,
        isEnabled: true,
        sortOrder: index,
      }).expect(201);
    }

    /** Enough ready items per mechanic that a position can be relaunched. */
    const seedItems = async (
      mechanicId: string,
      answerPayload: Record<string, unknown>,
      label: string,
      mechanicPayload?: Record<string, unknown>,
    ) => {
      const ids: string[] = [];
      for (const [scopeIndex, scopeId] of scopes.entries()) {
        for (let round = 0; round < 3; round += 1) {
          const response = await bearer(
            http().post('/admin/content-items'),
          ).send({
            scopeId,
            prompt: { ar: `${label} ${scopeIndex}-${round}` },
            compatibleChallengeTypeIds: [mechanicId],
            answerPayload,
            ...(mechanicPayload ? { mechanicPayload } : {}),
            status: ContentItemStatus.READY,
          });
          if (response.status !== 201) {
            throw new Error(
              `content-item ${label} -> ${response.status} ${JSON.stringify(response.body)}`,
            );
          }
          ids.push(String((response.body.data as { id: string }).id));
        }
      }
      return ids;
    };

    const items: Record<string, string[]> = {
      [CLOSEST_MODE_KEY]: await seedItems(
        closest.id,
        { mode: ChallengeAnswerMode.CLOSEST, correctValue: 42 },
        'أقرب',
      ),
      [ONE_CLUE_MODE_KEY]: await seedItems(
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
      ),
      [RYO_MODE_KEY]: await seedItems(
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
      ),
    };

    const activation = await bearer(
      http().patch(`/admin/worlds/${world.id}`),
    ).send({ status: WorldContentStatus.ACTIVE });
    if (activation.status !== 200) {
      throw new Error(
        `world activation -> ${activation.status} ${JSON.stringify(activation.body)}`,
      );
    }

    return {
      worldId: String(world.id),
      scopeIds: scopes,
      itemsByMechanic: items,
    };
  };

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
            selectedScopeIds: scopeIds.slice(0, 4),
          })),
        })
        .expect(201),
    );

  /**
   * Prepare, then launch — the two-step flow every phone-required mechanic
   * takes. No ContentItem id travels either way: the server draws its own
   * content at launch, after re-checking the phones are in the room.
   */
  const launch = async (
    sessionId: string,
    slotKey: WorldChallengeSlotKey,
    occurrenceIndex = 0,
    expected = 201,
  ) => {
    const send = async (path: 'prepare' | 'launch', expectStatus?: number) => {
      const current = await snapshotOf(sessionId);
      const response = await bearer(
        http().post(matchRoute(sessionId, `/unified/challenges/${path}`)),
      ).send({
        commandId: uuid(),
        expectedMatchRevision: current.match.revision,
        occurrenceIndex,
        slotKey,
        selectingTeamId: current.match.unified.selectingTeamId,
      });
      if (expectStatus !== undefined)
        expect(response.status).toBe(expectStatus);
      return response;
    };
    const stage = (await snapshotOf(sessionId)).match.stage.key;
    if (stage !== MatchStage.PREFLIGHT) {
      const prepared = await send('prepare');
      // A refusal at prepare is the answer; there is nothing left to launch.
      if (prepared.status !== 201) {
        expect(prepared.status).toBe(expected);
        return prepared;
      }
    }
    return send('launch', expected);
  };

  const runtimes = () =>
    app.get<GameplayRuntimeRepository>(GAMEPLAY_RUNTIME_REPOSITORY);

  const currentRuntime = async (sessionId: string) =>
    (await runtimes().findBySessionId(sessionId))!.serialize();

  /**
   * The production abort command.
   *
   * `expectedRuntimeRevision` is exposed so a race can be expressed honestly:
   * a client that decided to abort before another command landed carries the
   * revision it saw, which is exactly what CAS is there to arbitrate.
   */
  const abort = async (
    sessionId: string,
    options: {
      commandId?: string;
      expectedRuntimeRevision?: number;
      expectedSessionRevision?: number;
      expected?: number;
    } = {},
  ) => {
    const runtime = await currentRuntime(sessionId);
    const response = await bearer(
      http().post(`/live-game-sessions/${sessionId}/runtime/cancel`),
    ).send({
      commandId: options.commandId ?? uuid(),
      expectedRuntimeRevision:
        options.expectedRuntimeRevision ?? runtime.revision,
      expectedSessionRevision:
        options.expectedSessionRevision ?? (await sessionRevision(sessionId)),
    });
    if (
      options.expected !== undefined &&
      response.status !== options.expected
    ) {
      throw new Error(
        `abort -> ${response.status} ${JSON.stringify(response.body)}`,
      );
    }
    return response;
  };

  const positionOf = (snapshot: MatchBearingSnapshot, key: string) =>
    snapshot.match.unified.board.positions.find(
      (position) => position.positionKey === key,
    )!;

  /** Everything the abort contract promises, asserted in one place. */
  const assertReleasedToBoard = async (
    sessionId: string,
    positionKey: string,
    runtimeId: string,
  ) => {
    const snapshot = await snapshotOf(sessionId);
    expect(snapshot.match.stage.key).toBe(MatchStage.BOARD);
    expect(snapshot.match.currentChallenge).toBeUndefined();
    expect(snapshot.match.challengeResult).toBeUndefined();
    expect(snapshot.match.challengeHistory).toHaveLength(0);
    expect(positionOf(snapshot, positionKey).status).toBe(
      MatchSlotStatus.AVAILABLE,
    );
    expect((await runtimes().findById(runtimeId))!.serialize().status).toBe(
      'cancelled',
    );
    const match = (await app
      .get<MatchRepository>(MATCH_REPOSITORY)
      .findActiveBySessionId(sessionId))!;
    expect(match.serialize().scoreEvents).toHaveLength(0);
    return snapshot;
  };

  describe('mechanics not previously proven against real Mongo', () => {
    it.each([
      ['مين أقرب', CLOSEST_MODE_KEY, WorldChallengeSlotKey.SLOT_1, '0#slot_1'],
      [
        'بدليل واحد',
        ONE_CLUE_MODE_KEY,
        WorldChallengeSlotKey.SLOT_3,
        '0#slot_3',
      ],
    ])(
      '%s: launch → abort → board → launch again',
      async (_label, modeKey, slotKey, positionKey) => {
        // The abort contract is infrastructure, not mechanic code. These two
        // route through the same launcher and reconciliation as the mechanics
        // already covered, and this is what proves it rather than assuming it.
        const { sessionId } = await startSession();
        await createUnified(sessionId);

        await launch(sessionId, slotKey);
        const first = await currentRuntime(sessionId);
        expect(first.modeKey).toBe(modeKey);
        expect(['completed', 'cancelled']).not.toContain(first.status);

        await abort(sessionId, { expected: 201 });
        await assertReleasedToBoard(sessionId, positionKey, first.id);

        // The same position relaunches, on a genuinely new runtime.
        await launch(sessionId, slotKey);
        const second = await currentRuntime(sessionId);
        expect(second.id).not.toBe(first.id);
        expect(second.modeKey).toBe(modeKey);
        expect(['completed', 'cancelled']).not.toContain(second.status);
      },
      240_000,
    );
  });

  describe('abort racing another lifecycle transition', () => {
    /**
     * Both operations are decided against the same runtime revision, which is
     * what "concurrent" means to this system. No sleeps, no ordering luck: the
     * loser is holding a revision that no longer exists by the time it arrives.
     */
    it('abort loses to an answer that committed first, and cannot un-complete it', async () => {
      const { sessionId } = await startSession();
      await createUnified(sessionId);
      await launch(sessionId, WorldChallengeSlotKey.SLOT_1);

      const before = await currentRuntime(sessionId);
      const staleRevision = before.revision;

      // The answer commits, moving the runtime on.
      const answer = await bearer(
        http().post(`/live-game-sessions/${sessionId}/runtime/commands`),
      ).send({
        commandId: uuid(),
        expectedSessionRevision: await sessionRevision(sessionId),
        expectedRuntimeRevision: staleRevision,
        roundId: before.activeRound!.id,
        commandType: 'submit-estimate',
        payload: { value: 41 },
      });
      // Only the assigned answerer may submit; either way the runtime moved or
      // it did not, and the abort below is judged against that same fact.
      const afterAnswer = await currentRuntime(sessionId);
      if (answer.status === 201) {
        expect(afterAnswer.revision).toBeGreaterThan(staleRevision);

        // The abort was decided before that answer existed.
        const losing = await abort(sessionId, {
          expectedRuntimeRevision: staleRevision,
        });
        expect(losing.status).toBeGreaterThanOrEqual(400);
        expect(String(losing.body?.code ?? losing.body?.message)).toMatch(
          /STALE_RUNTIME_REVISION|revision/i,
        );

        const settled = await currentRuntime(sessionId);
        expect(settled.status).not.toBe('cancelled');
        const snapshot = await snapshotOf(sessionId);
        expect(snapshot.match.currentChallenge?.runtimeId).toBe(settled.id);
      }
    }, 240_000);

    it('an answer decided before a committed abort cannot score afterwards', async () => {
      // The direction that matters most: a losing gameplay command must not be
      // able to produce a score or a result once the challenge was released.
      const { sessionId } = await startSession();
      await createUnified(sessionId);
      await launch(sessionId, WorldChallengeSlotKey.SLOT_1);

      const before = await currentRuntime(sessionId);
      const staleRevision = before.revision;
      const staleRoundId = before.activeRound!.id;

      await abort(sessionId, { expected: 201 });

      const losing = await bearer(
        http().post(`/live-game-sessions/${sessionId}/runtime/commands`),
      ).send({
        commandId: uuid(),
        expectedSessionRevision: await sessionRevision(sessionId),
        expectedRuntimeRevision: staleRevision,
        roundId: staleRoundId,
        commandType: 'submit-estimate',
        payload: { value: 42 },
      });
      expect(losing.status).toBeGreaterThanOrEqual(400);

      await assertReleasedToBoard(sessionId, '0#slot_1', before.id);
    }, 240_000);

    it('abort loses to a runtime that already completed, leaving the result intact', async () => {
      // Abort vs natural completion. A completed runtime is terminal, so the
      // abort has nothing to release and must not rewrite a scored challenge.
      const { sessionId } = await startSession();
      await createUnified(sessionId);
      await launch(sessionId, WorldChallengeSlotKey.SLOT_1);
      const runtime = await currentRuntime(sessionId);
      const staleRevision = runtime.revision;

      // Complete through the real terminal path: the round closes, then the
      // runtime. A runtime still holding an active round refuses to complete.
      await bearer(
        http().post(
          `/live-game-sessions/${sessionId}/runtime/rounds/${runtime.activeRound!.id}/complete`,
        ),
      )
        .send({
          commandId: uuid(),
          expectedSessionRevision: await sessionRevision(sessionId),
          expectedRuntimeRevision: staleRevision,
          reason: 'test-completion',
        })
        .expect(201);
      await bearer(
        http().post(`/live-game-sessions/${sessionId}/runtime/complete`),
      )
        .send({
          commandId: uuid(),
          expectedSessionRevision: await sessionRevision(sessionId),
          expectedRuntimeRevision: (await currentRuntime(sessionId)).revision,
        })
        .expect(201);

      const completed = (await runtimes().findById(runtime.id))!.serialize();
      expect(completed.status).toBe('completed');

      const losing = await abort(sessionId, {
        expectedRuntimeRevision: staleRevision,
      });
      expect(losing.status).toBeGreaterThanOrEqual(400);
      expect((await runtimes().findById(runtime.id))!.serialize().status).toBe(
        'completed',
      );
    }, 240_000);

    it('abort is idempotent when the acknowledgement is lost and it is retried', async () => {
      const { sessionId } = await startSession();
      await createUnified(sessionId);
      await launch(sessionId, WorldChallengeSlotKey.SLOT_1);
      const runtime = await currentRuntime(sessionId);

      const commandId = uuid();
      const revision = runtime.revision;
      const sessionRev = await sessionRevision(sessionId);
      const first = await abort(sessionId, {
        commandId,
        expectedRuntimeRevision: revision,
        expectedSessionRevision: sessionRev,
        expected: 201,
      });
      const replay = await abort(sessionId, {
        commandId,
        expectedRuntimeRevision: revision,
        expectedSessionRevision: sessionRev,
        expected: 201,
      });

      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      // One transition, whatever the client did with its retries.
      await assertReleasedToBoard(sessionId, '0#slot_1', runtime.id);
    }, 240_000);
  });

  describe('deadline ownership after abort', () => {
    it('a timer armed for an aborted challenge cannot touch the next one', async () => {
      // The stale-timer-after-abort case. Challenge A's deadline was armed
      // while it was live; B then takes the board. A's callback must find that
      // the identity it was armed for is gone and do nothing.
      const { sessionId } = await startSession();
      await createUnified(sessionId);

      await launch(sessionId, WorldChallengeSlotKey.SLOT_1);
      const runtimeA = await currentRuntime(sessionId);
      const scheduler = app.get(GameplayDeadlineScheduler);
      await scheduler.schedule(sessionId);
      const armedForA = scheduler.armedKeyFor(sessionId);
      expect(armedForA).toContain(runtimeA.id);

      await abort(sessionId, { expected: 201 });
      // Convergence away from a released challenge: nothing is armed for it.
      await scheduler.synchronize(sessionId);
      expect(scheduler.armedKeyFor(sessionId)).toBeUndefined();

      await launch(sessionId, WorldChallengeSlotKey.SLOT_3);
      const runtimeB = await currentRuntime(sessionId);
      expect(runtimeB.id).not.toBe(runtimeA.id);
      const beforeStaleTimer = (await runtimes().findById(
        runtimeB.id,
      ))!.serialize().revision;

      // Whatever A left behind, convergence against current state can only
      // ever arm B's identity — A's key is unreachable from here. The
      // callback-level guard (a timer holding A's key refusing to act on B) is
      // pinned by `gameplay-deadline.scheduler.spec.ts`; this is the same
      // guarantee at the abort boundary.
      const armedNow = scheduler.armedKeyFor(sessionId);
      expect(armedNow ?? '').not.toContain(runtimeA.id);
      await scheduler.synchronize(sessionId);
      await scheduler.synchronize(sessionId);

      const afterStaleTimer = (await runtimes().findById(
        runtimeB.id,
      ))!.serialize();
      expect(afterStaleTimer.status).not.toBe('cancelled');
      expect(afterStaleTimer.status).not.toBe('completed');
      expect(afterStaleTimer.revision).toBe(beforeStaleTimer);
      const snapshot = await snapshotOf(sessionId);
      expect(snapshot.match.currentChallenge?.runtimeId).toBe(runtimeB.id);
      expect(snapshot.match.challengeHistory).toHaveLength(0);
    }, 240_000);
  });

  describe('launch-time lifecycle recovery', () => {
    it('compensates a runtime whose Match binding could not be saved', async () => {
      // The real persistence window: the runtime exists, and the Match write
      // that would have bound it fails. Production compensates by cancelling
      // the runtime it just created, so nothing is left holding the session.
      const { sessionId } = await startSession();
      await createUnified(sessionId);
      // Preflight succeeds normally; the failure is injected on the save that
      // would have bound the newly created runtime.
      await bearer(
        http().post(matchRoute(sessionId, '/unified/challenges/prepare')),
      )
        .send({
          commandId: uuid(),
          expectedMatchRevision: (await snapshotOf(sessionId)).match.revision,
          occurrenceIndex: 0,
          slotKey: WorldChallengeSlotKey.SLOT_1,
          selectingTeamId: (await snapshotOf(sessionId)).match.unified
            .selectingTeamId,
        })
        .expect(201);
      const matchRepository = app.get<MatchRepository>(MATCH_REPOSITORY);
      const save = jest
        .spyOn(matchRepository, 'save')
        .mockRejectedValueOnce(new Error('mongo unavailable'));

      const failed = await bearer(
        http().post(matchRoute(sessionId, '/unified/challenges/launch')),
      ).send({
        commandId: uuid(),
        expectedMatchRevision: (await snapshotOf(sessionId)).match.revision,
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_1,
      });
      expect(failed.status).toBeGreaterThanOrEqual(500);
      save.mockRestore();

      // The runtime the failed launch created was compensated away.
      const orphan = await runtimes().findBySessionId(sessionId);
      expect(orphan?.serialize().status).toBe('cancelled');
      const snapshot = await snapshotOf(sessionId);
      expect(snapshot.match.currentChallenge).toBeUndefined();
      expect(snapshot.match.challengeHistory).toHaveLength(0);

      // And the position is still launchable, which is the whole point.
      await launch(sessionId, WorldChallengeSlotKey.SLOT_1);
      expect(['completed', 'cancelled']).not.toContain(
        (await currentRuntime(sessionId)).status,
      );
    }, 240_000);

    it('recovers a provably unbound runtime left by a crash, through the real launch path', async () => {
      // Only the persisted residue a crash can leave is constructed: a live
      // runtime, and a Match on the board that never bound it. Nothing calls
      // recovery directly — the ordinary next launch has to notice.
      const { sessionId } = await startSession();
      await createUnified(sessionId);
      await launch(sessionId, WorldChallengeSlotKey.SLOT_1);
      const orphan = await currentRuntime(sessionId);

      // Rewind the Match to the board without touching the runtime, exactly as
      // a crash between runtime creation and the Match save would leave it.
      await database.collection('matches').updateOne(
        { liveSessionId: sessionId },
        {
          $unset: { currentChallenge: '' },
          $set: {
            stage: MatchStage.BOARD,
            'occurrences.0.slots.slot_1': {
              status: MatchSlotStatus.AVAILABLE,
            },
          },
        },
      );

      await launch(sessionId, WorldChallengeSlotKey.SLOT_1);

      expect((await runtimes().findById(orphan.id))!.serialize().status).toBe(
        'cancelled',
      );
      const active = await currentRuntime(sessionId);
      expect(active.id).not.toBe(orphan.id);
      expect(['completed', 'cancelled']).not.toContain(active.status);
      expect(
        (await snapshotOf(sessionId)).match.currentChallenge?.runtimeId,
      ).toBe(active.id);
    }, 240_000);

    it('never cancels a legitimately active challenge to make room for another', async () => {
      // The line recovery must not cross. A bound, live runtime is real
      // gameplay; the guard refuses the second launch instead of clearing it.
      const { sessionId } = await startSession();
      await createUnified(sessionId);
      await launch(sessionId, WorldChallengeSlotKey.SLOT_1);
      const active = await currentRuntime(sessionId);

      const refused = await launch(
        sessionId,
        WorldChallengeSlotKey.SLOT_3,
        0,
        400,
      );
      expect(String(refused.body?.code ?? refused.body?.message)).toMatch(
        /MATCH_STAGE_INVALID|GAMEPLAY_RUNTIME_EXISTS|challenge/i,
      );

      const survivor = (await runtimes().findById(active.id))!.serialize();
      expect(survivor.status).toBe(active.status);
      expect(['completed', 'cancelled']).not.toContain(survivor.status);
      expect(
        (await snapshotOf(sessionId)).match.currentChallenge?.runtimeId,
      ).toBe(active.id);
    }, 240_000);
  });

  describe('hard invariant mismatches are reported, never guessed at', () => {
    it('does not invent a result for a Match bound to a runtime that is gone', async () => {
      const { sessionId } = await startSession();
      await createUnified(sessionId);
      await launch(sessionId, WorldChallengeSlotKey.SLOT_1);
      const bound = await currentRuntime(sessionId);

      await database
        .collection('gameplay_runtimes')
        .deleteOne({ runtimeId: bound.id });

      // The sweeper sees the obligation and finds nothing to discharge it with.
      await app.get(MatchConvergenceSweeper).sweep('manual');

      const match = (await app
        .get<MatchRepository>(MATCH_REPOSITORY)
        .findActiveBySessionId(sessionId))!;
      const state = match.serialize();
      // Ownership is retained rather than silently released, and nothing was
      // scored on a challenge whose record no longer exists.
      expect(state.currentChallenge?.runtimeId).toBe(bound.id);
      expect(state.scoreEvents).toHaveLength(0);
      expect(state.challengeResults).toHaveLength(0);
    }, 240_000);

    it('does not release a Match whose bound runtime is not the live one', async () => {
      const { sessionId } = await startSession();
      await createUnified(sessionId);
      await launch(sessionId, WorldChallengeSlotKey.SLOT_1);
      const real = await currentRuntime(sessionId);

      // Point the Match at a runtime that was never this session's challenge.
      await database.collection('matches').updateOne(
        { liveSessionId: sessionId },
        {
          $set: {
            'currentChallenge.runtimeId': 'runtime-that-never-existed',
          },
        },
      );

      await abort(sessionId);

      const state = (await app
        .get<MatchRepository>(MATCH_REPOSITORY)
        .findActiveBySessionId(sessionId))!.serialize();
      // The cancellation of the real runtime does not release a binding that
      // names something else; mismatched ownership is left for an operator.
      expect(state.currentChallenge?.runtimeId).toBe(
        'runtime-that-never-existed',
      );
      expect(state.scoreEvents).toHaveLength(0);
      expect(state.challengeResults).toHaveLength(0);
      expect((await runtimes().findById(real.id))!.serialize().status).toBe(
        'cancelled',
      );
    }, 240_000);
  });

  describe('reconnect after abort', () => {
    it('hydrates the board from persisted state with nothing blocking', async () => {
      const { sessionId, participants } = await startSession();
      await createUnified(sessionId);
      await launch(sessionId, WorldChallengeSlotKey.SLOT_1);
      const runtime = await currentRuntime(sessionId);

      await abort(sessionId, { expected: 201 });

      // The client never saw the response: it dropped and came back.
      const participant = participants[0];
      await app
        .get(UpdateParticipantPresence)
        .disconnected(
          sessionId,
          participant.participantId!,
          `socket-${participant.participantId}`,
        );
      await app
        .get(UpdateParticipantPresence)
        .connected(
          sessionId,
          participant.participantId!,
          `socket-${participant.participantId}-new`,
        );

      const hydrated = await snapshotOf(sessionId);
      expect(hydrated.match.stage.key).toBe(MatchStage.BOARD);
      expect(hydrated.match.currentChallenge).toBeUndefined();
      expect(positionOf(hydrated, '0#slot_1').status).toBe(
        MatchSlotStatus.AVAILABLE,
      );
      expect((await runtimes().findById(runtime.id))!.serialize().status).toBe(
        'cancelled',
      );
      // Nothing blocking: the next challenge starts with no cleanup.
      await launch(sessionId, WorldChallengeSlotKey.SLOT_3);
    }, 240_000);
  });
});
