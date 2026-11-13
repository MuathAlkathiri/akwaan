import crypto from 'crypto';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Connection, Types } from 'mongoose';
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
  ChallengeFamily,
  ChallengeItemStructure,
  BOMB_SLUG,
  ContentItemStatus,
  ContentMediaType,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../../src/modules/scoring/domain/scoring-rule';
import { CLOSEST_MODE_KEY } from '../../src/modules/live-game-sessions/domain/closest-gameplay.plugin';
import { RYO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/ryo-gameplay.plugin';
import { MatchStage } from '../../src/modules/match/domain/match.constants';
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
import { pendingDeadline } from '../../src/modules/live-game-sessions/application/gameplay-deadline.scheduler';
import { SubmitGameplayCommand } from '../../src/modules/live-game-sessions/application/submit-gameplay-command.use-case';
import { GameplayRuntimeSocketFacade } from '../../src/modules/live-game-sessions/application/gameplay-runtime.socket-facade';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../../src/modules/live-game-sessions/domain/live-game-session.repository';
import { MOVING_XO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/moving-xo-board';
import {
  MOVING_XO_COMMANDS,
  MOVING_XO_GAMEPLAY_PLUGIN,
  MOVING_XO_PLACEMENT_SECONDS,
  MOVING_XO_QUESTION_SECONDS,
  MovingXoQuestion,
} from '../../src/modules/live-game-sessions/domain/moving-xo-gameplay.plugin';

/**
 * "Moving XO" on real replica-set Mongo.
 *
 * The plugin spec proves the state machine in isolation. This proves the part
 * only a real stack can: that a challenge launched with **no deck at all**
 * actually feeds itself — that a committed `question-pending` is an obligation
 * the server discharges within the same request, that every puzzle it draws is
 * unseen, that putting it on screen is what spends it, that the server owns both
 * the fifteen-second answer window and the ten-second placement window, and that
 * when the catalog runs dry the challenge ends with no winner instead of
 * repeating an item or sitting pending forever.
 *
 * Every ChallengeType, Scope and ContentItem is created inside this suite's own
 * isolated database. Nothing touches the developer runtime catalog.
 */

type MatchBearingSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']> & {
    unified: NonNullable<
      NonNullable<LiveGameSessionSnapshot['match']>['unified']
    >;
  };
};

const MOVING_XO_SLOT = WorldChallengeSlotKey.SLOT_1;

describe('moving xo lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let scopeIds: string[];
  /** Every Puzzles item the suite seeded, so depletion is drivable. */
  let puzzleIds: string[];

  const uuid = () => crypto.randomUUID();

  beforeAll(async () => {
    database = await connectTestDatabase('moving-xo-lifecycle');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: {
        MONGODB_URI: isolatedTestDatabaseUri('moving-xo-lifecycle'),
        AI_PROVIDER: 'lmstudio',
        LMSTUDIO_BASE_URL: 'http://127.0.0.1:9/v1',
      },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    controllerId = await currentUserId();
    ({ worldId, scopeIds, puzzleIds } = await seedWorld());
  }, 240_000);

  /** A first-time account's content history for every scenario. */
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
   * A Puzzles-shaped World whose first slot is Moving XO.
   *
   * The ChallengeType is created explicitly rather than from the production
   * mechanic catalog: Moving XO is not provisioned there, and provisioning is a
   * separate Product step this suite must not perform. The other three slots hold
   * canonical mechanics, because a World only activates when every slot holds one
   * the runtime can actually launch.
   *
   * Both V1 answer modes are seeded, in both Scopes, so "the mechanic plays
   * `match` and `multiple_choice` and nothing else" is falsifiable rather than
   * accidentally true.
   */
  const seedWorld = async () => {
    const movingXo = unwrap<{ id: string }>(
      await bearer(http().post('/admin/challenge-types'))
        .send({
          name: 'Moving XO',
          slug: MOVING_XO_MODE_KEY,
          description: 'لوحة ٣×٣: جاوب بشكل صحيح واكسب حركة واحدة.',
          family: ChallengeFamily.SIGNATURE,
          // No fixed question count: the challenge consumes as many eligible
          // items as the game actually requires.
          itemStructure: ChallengeItemStructure.CONTINUOUS,
          answerMode: ChallengeAnswerMode.MOVING_XO,
          scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
          defaultPresentation: {
            inputType: 'phone-choice',
            timerSeconds: MOVING_XO_QUESTION_SECONDS,
            soundPack: null,
            revealStyle: null,
          },
          status: WorldContentStatus.ACTIVE,
        })
        .expect(201),
    );

    // Three canonical mechanics beside it, because a World only activates when
    // every slot holds one the runtime can actually launch.
    const filler = async (slug: string) =>
      unwrap<{ id: string }>(
        await bearer(http().post('/admin/challenge-types'))
          .send(
            productionMechanicFixture(slug, {
              status: WorldContentStatus.ACTIVE,
            }),
          )
          .expect(201),
      );
    const bomb = await filler(BOMB_SLUG);
    const closest = await filler(CLOSEST_MODE_KEY);
    const ryo = await filler(RYO_MODE_KEY);

    const world = unwrap<{ id: string }>(
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'الألغاز', slug: 'moving-xo-puzzles' })
        .expect(201),
    );

    const scopes: string[] = [];
    for (const [name, slug] of [
      ['ملاحظة', 'observation-illusions'],
      ['تركيب', 'assembly-rotation'],
      ['حروف', 'wordplay-letters'],
      ['مسارات', 'paths-motion'],
    ]) {
      scopes.push(
        String(
          unwrap<{ id: string }>(
            await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
              .send({
                name,
                slug,
                status: WorldContentStatus.ACTIVE,
              })
              .expect(201),
          ).id,
        ),
      );
    }

    for (const [index, [challengeTypeId, slotKey]] of [
      [movingXo.id, MOVING_XO_SLOT],
      [bomb.id, WorldChallengeSlotKey.SLOT_2],
      [closest.id, WorldChallengeSlotKey.SLOT_3],
      [ryo.id, WorldChallengeSlotKey.SLOT_4],
    ].entries()) {
      await bearer(
        http().post(`/admin/worlds/${world.id}/challenge-configurations`),
      )
        .send({ challengeTypeId, slotKey, isEnabled: true, sortOrder: index })
        .expect(201);
    }

    const ids: string[] = [];
    for (const [scopeIndex, scopeId] of scopes.entries()) {
      for (let copy = 0; copy < 6; copy += 1) {
        const label = `${scopeIndex}-${copy}`;
        // Alternate the two V1 modes, so neither is exercised by accident only.
        const answerPayload =
          copy % 2 === 0
            ? {
                mode: ChallengeAnswerMode.MATCH,
                acceptedAnswers: ['جواب'],
              }
            : {
                mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
                options: [
                  { id: 'right', label: { ar: 'صحيح' } },
                  { id: 'wrong', label: { ar: 'خطأ' } },
                ],
                correctOptionId: 'right',
              };
        const response = await bearer(http().post('/admin/content-items')).send(
          {
            scopeId,
            prompt: { ar: `لغز ${label}` },
            // Every `match` puzzle is authored for القنبلة as well, so
            // "spent here is still unseen there" is falsifiable.
            compatibleChallengeTypeIds:
              copy % 2 === 0 ? [movingXo.id, bomb.id] : [movingXo.id],
            answerPayload,
            media: {
              type: ContentMediaType.IMAGE,
              assets: [
                { url: `/uploads/puzzles/${label}.webp`, altText: label },
              ],
            },
            status: ContentItemStatus.READY,
          },
        );
        if (response.status !== 201) {
          throw new Error(
            `moving xo item -> ${response.status} ${JSON.stringify(response.body)}`,
          );
        }
        ids.push(String(response.body.data.id));
      }
    }

    // The two remaining slots need content of their own for a unified Match;
    // القنبلة already plays the `match` puzzles seeded above.
    for (const [mechanicId, answerPayload, label, mechanicPayload] of [
      [
        closest.id,
        { mode: ChallengeAnswerMode.CLOSEST, correctValue: 42 },
        'أقرب',
        {
          closestSlider: { mode: 'numeric-range', min: 0, max: 100, step: 1 },
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
        'اقرأ',
      ],
    ] as Array<
      [string, Record<string, unknown>, string, Record<string, unknown>?]
    >) {
      for (const scopeId of scopes) {
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
    }

    await bearer(http().patch(`/admin/worlds/${world.id}`))
      .send({ status: WorldContentStatus.ACTIVE })
      .expect(200);

    return {
      worldId: String(world.id),
      scopeIds: scopes,
      puzzleIds: ids,
    };
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
    const participants: Record<string, LiveSessionActor> = {};
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
      participants[teamId] = actor;
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
    await bearer(http().post(matchRoute(sessionId, '/unified')))
      .send({
        occurrences: [0, 1, 2].map((occurrenceIndex) => ({
          occurrenceIndex,
          worldId,
          selectedScopeIds: scopeIds,
        })),
      })
      .expect(201);
    return { sessionId, teamIds, participants };
  };

  /** Prepare, then launch — the two steps a phone-required mechanic needs. */
  const launch = async (sessionId: string) => {
    const send = async (path: 'prepare' | 'launch') => {
      const current = await snapshotOf(sessionId);
      const response = await bearer(
        http().post(matchRoute(sessionId, `/unified/challenges/${path}`)),
      ).send({
        commandId: uuid(),
        expectedMatchRevision: current.match.revision,
        occurrenceIndex: 0,
        slotKey: MOVING_XO_SLOT,
        selectingTeamId: current.match.unified.selectingTeamId,
      });
      if (response.status !== 201) {
        throw new Error(
          `${path} -> ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
      return response;
    };
    if (
      (await snapshotOf(sessionId)).match.stage.key !== MatchStage.PREFLIGHT
    ) {
      await send('prepare');
    }
    return send('launch');
  };

  type Session = Awaited<ReturnType<typeof startSession>>;

  /** A started session already running Moving XO. */
  const running = async (): Promise<Session> => {
    const session = await startSession();
    await launch(session.sessionId);
    return session;
  };

  const runtimes = () =>
    app.get<GameplayRuntimeRepository>(GAMEPLAY_RUNTIME_REPOSITORY);

  const stateOf = async (sessionId: string) => {
    const document = await database
      .collection('gameplay_runtimes')
      .findOne({ sessionId }, { sort: { createdAt: -1 } });
    return (document!.state as { runtimeState: Record<string, unknown> })
      .runtimeState;
  };

  const questionOf = async (sessionId: string) =>
    (await stateOf(sessionId)).question as MovingXoQuestion | null;

  const boardOf = async (sessionId: string) =>
    (await stateOf(sessionId)).board as {
      cells: (string | null)[];
      markOrder: Record<string, number[]>;
    };

  const presentedOf = async (sessionId: string) =>
    ((await stateOf(sessionId)).presentedContentItemIds as string[]) ?? [];

  const command = async (
    sessionId: string,
    actor: LiveSessionActor,
    commandType: string,
    payload: Record<string, unknown> = {},
  ) => {
    const session = (await app
      .get<LiveGameSessionRepository>(LIVE_GAME_SESSION_REPOSITORY)
      .findById(sessionId))!;
    const runtime = (await runtimes().findBySessionId(sessionId))!;
    return app.get(SubmitGameplayCommand).execute({
      sessionId,
      roundId: runtime.serialize().activeRound!.id,
      actor,
      commandId: uuid(),
      commandType,
      payload,
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
    });
  };

  const controllerActor = (): LiveSessionActor => ({
    kind: 'user',
    actorId: controllerId,
  });

  /** Acknowledge the current Fair-Start generation from the shared screen. */
  const activate = async (sessionId: string) => {
    const runtime = (await runtimes().findBySessionId(sessionId))!;
    const checkpoint = runtime.currentPresentationCheckpoint();
    await app.get(GameplayRuntimeSocketFacade).presentationReady(
      controllerActor(),
      {
        sessionId,
        commandId: uuid(),
        expectedSessionRevision: (await app
          .get<LiveGameSessionRepository>(LIVE_GAME_SESSION_REPOSITORY)
          .findById(sessionId))!.revision,
        expectedRuntimeRevision: runtime.revision,
        ...(checkpoint
          ? { presentationGeneration: checkpoint.generation }
          : {}),
      },
      'moving-xo-shared-screen',
    );
  };

  /** The phone of whichever team is on the clock right now. */
  const activePhone = async (session: Session) =>
    session.participants[
      String((await stateOf(session.sessionId)).activeTeamId)
    ];

  /** Answer the open puzzle, correctly or not, in whichever mode it is in. */
  const answer = async (session: Session, correct: boolean) => {
    await activate(session.sessionId);
    const question = (await questionOf(session.sessionId))!;
    const payload =
      question.answerMode === 'multiple_choice'
        ? { optionId: correct ? 'right' : 'wrong' }
        : {
            answer: correct
              ? await acceptedAnswerOf(question.contentItemId)
              : 'لا شيء إطلاقًا',
          };
    return command(
      session.sessionId,
      await activePhone(session),
      MOVING_XO_COMMANDS.answer,
      payload,
    );
  };

  /**
   * The authored answer, read from the catalog.
   *
   * Deliberately not read from the runtime projection: the whole point of the
   * privacy contract is that no surface is ever told what the answer is, so a
   * test that could read it from there would be proving the opposite.
   */
  const acceptedAnswerOf = async (contentItemId: string) => {
    const item = await database
      .collection('content_items')
      .findOne({ _id: new Types.ObjectId(contentItemId) as never });
    return String(
      (item!.answerPayload as { acceptedAnswers: string[] }).acceptedAnswers[0],
    );
  };

  /** Place on the first cell the mechanic says is legal for the active team. */
  const place = async (session: Session) => {
    const runtime = (await runtimes().findBySessionId(session.sessionId))!;
    const state = runtime.serialize().runtimeState;
    const activeTeamId = String(state.activeTeamId);
    const projected = MOVING_XO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
      state,
      { teamId: activeTeamId } as never,
    ) as unknown as { legalCells: number[] };
    return command(
      session.sessionId,
      session.participants[activeTeamId],
      MOVING_XO_COMMANDS.place,
      { cell: projected.legalCells[0] },
    );
  };

  const exposures = async (filter: Record<string, unknown> = {}) =>
    database
      .collection('content_exposures')
      .find({ challengeTypeKey: MOVING_XO_MODE_KEY, ...filter })
      .toArray();

  /** The history a long-playing account would already have. */
  const burn = async (contentItemIds: string[]) => {
    if (!contentItemIds.length) return;
    await database.collection('content_exposures').insertMany(
      contentItemIds.map((contentItemId) => ({
        ownerAccountId: controllerId,
        challengeTypeKey: MOVING_XO_MODE_KEY,
        contentItemId,
        state: 'exposed',
        matchId: 'earlier-match',
        exposedAt: new Date(),
        reservationExpiresAt: null,
      })),
    );
  };

  describe('launching with no deck', () => {
    it('blocks at 23 account-selectable items', async () => {
      await burn([puzzleIds[0]]);
      await expect(running()).rejects.toThrow(/launch -> 400/);
    });

    it('blocks a concurrent launch when the first Match holds the 24th item', async () => {
      await running();
      await expect(running()).rejects.toThrow(/launch -> 400/);
    });

    it('starts a challenge the server bound no content to', async () => {
      const { sessionId } = await running();
      const challenge = (await snapshotOf(sessionId)).match.currentChallenge!;
      expect(challenge.challengeKey).toBe(MOVING_XO_MODE_KEY);
      // A deck would reserve content the game may never reach.
      expect(challenge.contentItemIds ?? []).toEqual([]);
    });

    it('opens on an empty board with the Match turn owner to play', async () => {
      const session = await running();
      const board = await boardOf(session.sessionId);
      expect(board.cells).toEqual(Array.from({ length: 9 }, () => null));
      expect((await stateOf(session.sessionId)).successfulMoveCount).toBe(0);
      expect((await stateOf(session.sessionId)).decisivePhase).toBe(false);
      // §23.11: whichever team already owns the canonical Match turn starts.
      expect(session.teamIds).toContain(
        String((await stateOf(session.sessionId)).activeTeamId),
      );
    });

    it('draws the first puzzle inside the launch request itself', async () => {
      const session = await running();
      // The supplier ran on the committed mutation: a `question-pending` is a
      // state the runtime passes through, never one it rests in.
      expect((await stateOf(session.sessionId)).phase).toBe('answering');
      const question = (await questionOf(session.sessionId))!;
      expect(puzzleIds).toContain(question.contentItemId);
      expect(['match', 'multiple_choice']).toContain(question.answerMode);
    });

    it('starts no clock until a surface says it is showing the puzzle', async () => {
      const session = await running();
      expect((await stateOf(session.sessionId)).deadlineAt).toBeNull();

      await activate(session.sessionId);

      const deadlineAt = (await stateOf(session.sessionId)).deadlineAt;
      expect(typeof deadlineAt).toBe('string');
      // Fifteen seconds from activation, not from launch.
      expect(Date.parse(String(deadlineAt)) - Date.now()).toBeGreaterThan(
        (MOVING_XO_QUESTION_SECONDS - 3) * 1000,
      );
    });

    it('reserves the first puzzle but spends nothing yet', async () => {
      const session = await running();
      // Drawn and committed, but hidden until the surfaces acknowledge.
      await expect(exposures({ state: 'exposed' })).resolves.toEqual([]);
      expect(await presentedOf(session.sessionId)).toHaveLength(1);
    });
  });

  describe('the question window', () => {
    it('spends the puzzle only once it is on screen', async () => {
      const session = await running();
      const question = (await questionOf(session.sessionId))!;

      await activate(session.sessionId);

      const rows = await exposures({ state: 'exposed' });
      expect(rows).toHaveLength(1);
      expect(rows[0].contentItemId).toBe(question.contentItemId);
      expect(rows[0].ownerAccountId).toBe(controllerId);
    });

    it('earns exactly one move for a correct answer', async () => {
      const session = await running();
      await answer(session, true);

      const state = await stateOf(session.sessionId);
      expect(state.phase).toBe('placement');
      expect(state.pendingMove).toBe(true);
      // The board does not move until the move is placed.
      expect((await boardOf(session.sessionId)).cells).toEqual(
        Array.from({ length: 9 }, () => null),
      );
      expect(state.successfulMoveCount).toBe(0);
    });

    it('earns nothing for a wrong answer and deals the opponent a new puzzle', async () => {
      const session = await running();
      const before = String((await stateOf(session.sessionId)).activeTeamId);
      const first = (await questionOf(session.sessionId))!.contentItemId;

      await answer(session, false);

      const state = await stateOf(session.sessionId);
      expect(state.activeTeamId).not.toBe(before);
      expect(state.successfulMoveCount).toBe(0);
      // A fresh puzzle, drawn on demand, and never the one just played.
      expect(state.phase).toBe('answering');
      const second = (await questionOf(session.sessionId))!.contentItemId;
      expect(second).not.toBe(first);
      expect(await presentedOf(session.sessionId)).toEqual([first, second]);
    });

    it('treats a timeout exactly as a wrong answer', async () => {
      const session = await running();
      await activate(session.sessionId);
      const before = String((await stateOf(session.sessionId)).activeTeamId);
      const first = (await questionOf(session.sessionId))!.contentItemId;

      await database.collection('gameplay_runtimes').updateOne(
        { sessionId: session.sessionId },
        {
          $set: {
            'state.runtimeState.deadlineAt': new Date(0).toISOString(),
          },
        },
      );
      await command(
        session.sessionId,
        controllerActor(),
        MOVING_XO_COMMANDS.expireQuestion,
      );

      const state = await stateOf(session.sessionId);
      expect(state.activeTeamId).not.toBe(before);
      expect(state.successfulMoveCount).toBe(0);
      // No extra penalty: the board is untouched and a new puzzle is dealt.
      expect(
        (await boardOf(session.sessionId)).cells.every((c) => c === null),
      ).toBe(true);
      expect((await questionOf(session.sessionId))!.contentItemId).not.toBe(
        first,
      );
      // Seen is seen: a timed-out puzzle stays spent.
      await expect(exposures({ state: 'exposed' })).resolves.toHaveLength(1);
    });

    it('refuses an answer from the team that is not on the clock', async () => {
      const session = await running();
      await activate(session.sessionId);
      const active = String((await stateOf(session.sessionId)).activeTeamId);
      const opponent = session.teamIds.find((id) => id !== active)!;

      await expect(
        command(
          session.sessionId,
          session.participants[opponent],
          MOVING_XO_COMMANDS.answer,
          { answer: 'أي شيء' },
        ),
      ).rejects.toThrow();
    });
  });

  describe('the placement window', () => {
    it('is owned by the server, not by the phone', async () => {
      const session = await running();
      await answer(session, true);

      const state = await stateOf(session.sessionId);
      const remaining = Date.parse(String(state.deadlineAt)) - Date.now();
      expect(remaining).toBeGreaterThan(
        (MOVING_XO_PLACEMENT_SECONDS - 3) * 1000,
      );
      expect(remaining).toBeLessThanOrEqual(MOVING_XO_PLACEMENT_SECONDS * 1000);

      // And the one scheduler arms the placement command for this phase.
      const runtime = (await runtimes().findBySessionId(session.sessionId))!;
      const armed = pendingDeadline(
        runtime.serialize(),
        MOVING_XO_GAMEPLAY_PLUGIN.deadline,
        undefined,
      );
      expect(armed).toMatchObject({
        kind: 'mode-command',
        commandType: MOVING_XO_COMMANDS.expirePlacement,
      });
    });

    it('commits a legal placement and passes the turn', async () => {
      const session = await running();
      const mover = String((await stateOf(session.sessionId)).activeTeamId);
      await answer(session, true);
      await place(session);

      const state = await stateOf(session.sessionId);
      expect(state.successfulMoveCount).toBe(1);
      expect(state.pendingMove).toBe(false);
      expect(
        (await boardOf(session.sessionId)).cells.filter((c) => c === mover),
      ).toHaveLength(1);
      expect(state.activeTeamId).not.toBe(mover);
      // The next team is already holding a fresh puzzle.
      expect(state.phase).toBe('answering');
      expect(await presentedOf(session.sessionId)).toHaveLength(2);
    });

    it('refuses an illegal cell even when the client ignores the projection', async () => {
      const session = await running();
      const mover = String((await stateOf(session.sessionId)).activeTeamId);
      await answer(session, true);
      await place(session);
      const taken = (await boardOf(session.sessionId)).cells.findIndex(
        (owner) => owner === mover,
      );

      // The opponent now earns a move and aims at the occupied cell. A disabled
      // control is presentation; the reducer is the authority.
      await answer(session, true);
      await expect(
        command(
          session.sessionId,
          session.participants[
            String((await stateOf(session.sessionId)).activeTeamId)
          ],
          MOVING_XO_COMMANDS.place,
          { cell: taken },
        ),
      ).rejects.toThrow(/Illegal placement/);
    });

    it('forfeits the earned move when the placement window runs out', async () => {
      const session = await running();
      const mover = String((await stateOf(session.sessionId)).activeTeamId);
      await answer(session, true);

      await database.collection('gameplay_runtimes').updateOne(
        { sessionId: session.sessionId },
        {
          $set: {
            'state.runtimeState.deadlineAt': new Date(0).toISOString(),
          },
        },
      );
      await command(
        session.sessionId,
        controllerActor(),
        MOVING_XO_COMMANDS.expirePlacement,
      );

      const state = await stateOf(session.sessionId);
      // No mark changes, nothing is auto-placed, and the move is not carried.
      expect(
        (await boardOf(session.sessionId)).cells.every((c) => c === null),
      ).toBe(true);
      expect(state.successfulMoveCount).toBe(0);
      expect(state.pendingMove).toBe(false);
      expect(state.activeTeamId).not.toBe(mover);
    });
  });

  describe('the obligation is discharged exactly once', () => {
    it('does not redraw when the state is read again', async () => {
      const session = await running();
      const first = (await questionOf(session.sessionId))!.contentItemId;

      // Every authoritative read re-enters the supplier's convergence path; a
      // reconnecting phone must not cost the account a second puzzle.
      await snapshotOf(session.sessionId);
      await snapshotOf(session.sessionId);
      await snapshotOf(session.sessionId);

      expect((await questionOf(session.sessionId))!.contentItemId).toBe(first);
      expect(await presentedOf(session.sessionId)).toEqual([first]);
    });

    it('holds exactly one puzzle at a time and never prefetches', async () => {
      const session = await running();
      await answer(session, false);
      // Two turns played, two items drawn — never a deck of lookahead.
      expect(await presentedOf(session.sessionId)).toHaveLength(2);
      expect(await questionOf(session.sessionId)).not.toBeNull();
    });
  });

  describe('the account never sees the same puzzle twice', () => {
    it('deals a different item every turn for a long run', async () => {
      const session = await running();
      const seen: string[] = [];
      for (let turn = 0; turn < 8; turn += 1) {
        const question = await questionOf(session.sessionId);
        if (!question) break;
        seen.push(question.contentItemId);
        await answer(session, false);
      }
      expect(seen.length).toBeGreaterThan(4);
      expect(new Set(seen).size).toBe(seen.length);
    }, 120_000);

    it('refuses a repeat owner before launch once history drops below the floor', async () => {
      await burn([puzzleIds[0]]);
      await expect(running()).rejects.toThrow(/launch -> 400/);
    });
  });

  describe('running out of content', () => {
    const exhaustAfterFirstQuestion = async () => {
      const session = await running();
      const first = (await questionOf(session.sessionId))!.contentItemId;
      await burn(puzzleIds.filter((id) => id !== first));
      await answer(session, false);
      return session;
    };

    it('ends with no winner rather than repeating an item', async () => {
      const session = await exhaustAfterFirstQuestion();

      const state = await stateOf(session.sessionId);
      expect(state.phase).toBe('completed');
      expect(state.outcome).toBe('content-exhausted');
      // No winner is invented for whoever happened to hold the turn.
      expect(state.winningTeamId).toBeNull();
      expect(await questionOf(session.sessionId)).toBeNull();
      expect(await presentedOf(session.sessionId)).toHaveLength(1);
      const runtime = (await runtimes().findBySessionId(session.sessionId))!;
      expect(runtime.status).toBe('completed');
      expect(runtime.serialize().activeRound).toBeUndefined();
    });

    it('awards no challenge win when the catalog ran out', async () => {
      const session = await exhaustAfterFirstQuestion();
      await snapshotOf(session.sessionId);

      const result = (await snapshotOf(session.sessionId)).match
        .challengeResult;
      expect(result).toBeTruthy();
      expect(result!.winnerTeamId).toBeNull();
      expect(result!.challengeKey).toBe(MOVING_XO_MODE_KEY);
      expect(result!.matchPoints.every((entry) => entry.points === 0)).toBe(
        true,
      );
      expect(result!.details).toMatchObject({
        endedBy: 'content-exhausted',
      });
    });

    it('ends mid-game when the last unseen item is played', async () => {
      const session = await running();
      const first = (await questionOf(session.sessionId))!.contentItemId;
      await burn(puzzleIds.filter((id) => id !== first));

      await answer(session, false);

      const state = await stateOf(session.sessionId);
      expect(state.phase).toBe('completed');
      expect(state.outcome).toBe('content-exhausted');
      // What was shown stays spent; nothing unseen is stranded.
      await expect(exposures({ state: 'reserved' })).resolves.toEqual([]);
    });
  });

  describe('a game someone can actually win', () => {
    it('plays turn after turn until the board decides it', async () => {
      const session = await running();

      for (let turn = 0; turn < 40; turn += 1) {
        if ((await stateOf(session.sessionId)).phase === 'completed') break;
        if (!(await questionOf(session.sessionId))) break;
        await answer(session, true);
        if ((await stateOf(session.sessionId)).phase !== 'placement') break;
        await place(session);
      }

      const state = await stateOf(session.sessionId);
      expect(state.phase).toBe('completed');
      // Both teams answer every puzzle correctly, so a line arrives long before
      // the twelve-move threshold could.
      expect(state.outcome).toBe('win');
      expect(session.teamIds).toContain(String(state.winningTeamId));

      // Every puzzle the game played was a different one, and every one of them
      // is now spent for this account.
      const presented = await presentedOf(session.sessionId);
      expect(new Set(presented).size).toBe(presented.length);
      const rows = await exposures({ state: 'exposed' });
      expect(rows.map((row) => String(row.contentItemId)).sort()).toEqual(
        [...presented].sort(),
      );

      // And the Match records the win the runtime declared.
      const result = (await snapshotOf(session.sessionId)).match
        .challengeResult;
      expect(result!.winnerTeamId).toBe(String(state.winningTeamId));
      expect(result!.challengeKey).toBe(MOVING_XO_MODE_KEY);
      const runtime = (await runtimes().findBySessionId(session.sessionId))!;
      expect(runtime.status).toBe('completed');
      expect(runtime.serialize().activeRound).toBeUndefined();
    }, 180_000);
  });

  describe('abandoning the challenge', () => {
    it('keeps what was shown and leaves nothing reserved', async () => {
      const session = await running();
      await activate(session.sessionId);
      const shown = (await questionOf(session.sessionId))!.contentItemId;

      const runtime = (await runtimes().findBySessionId(session.sessionId))!;
      await bearer(
        http().post(`/live-game-sessions/${session.sessionId}/runtime/cancel`),
      )
        .send({
          commandId: uuid(),
          expectedRuntimeRevision: runtime.serialize().revision,
          expectedSessionRevision: await sessionRevision(session.sessionId),
        })
        .expect(201);

      // An abort forgives nothing already seen and strands nothing unseen.
      const rows = await exposures();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ contentItemId: shown, state: 'exposed' });
    });
  });
});
