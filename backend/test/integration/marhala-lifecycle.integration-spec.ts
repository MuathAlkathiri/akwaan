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
  BOMB_SLUG,
  ChallengeAnswerMode,
  ContentItemStatus,
  ContentMediaType,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
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
import { SubmitGameplayCommand } from '../../src/modules/live-game-sessions/application/submit-gameplay-command.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../../src/modules/live-game-sessions/domain/live-game-session.repository';
import {
  MARHALA_FINISH_POSITION,
  MARHALA_MODE_KEY,
  MARHALA_START_POSITION,
} from '../../src/modules/live-game-sessions/domain/marhala-board';
import {
  MARHALA_COMMANDS,
  MarhalaResult,
  MarhalaRuntimeQuestion,
  MarhalaTurnResult,
} from '../../src/modules/live-game-sessions/domain/marhala-gameplay.plugin';

/**
 * "المرحلة" on real replica-set Mongo.
 *
 * The plugin spec proves the state machine in isolation. This proves the part
 * only a real stack can: that a race launched with **no deck at all** actually
 * feeds itself — that a committed `question-pending` is an obligation the server
 * discharges within the same request, that the question it draws is unseen and of
 * exactly the band the team elected, that putting it on screen is what spends it,
 * and that when a band runs dry the runtime says so instead of quietly serving an
 * easier question or sitting in `question-pending` forever.
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

const MARHALA_SLOT = WorldChallengeSlotKey.SLOT_1;
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

describe('marhala lifecycle integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let scopeIds: string[];
  /** contentItemId -> authored band, so a test can assert what it was dealt. */
  let bandById: Map<string, string>;

  const uuid = () => crypto.randomUUID();

  beforeAll(async () => {
    database = await connectTestDatabase('marhala-lifecycle');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('marhala-lifecycle') },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    controllerId = await currentUserId();
    ({ worldId, scopeIds, bandById } = await seedWorld());
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
   * A Video-Games-shaped World whose first slot is المرحلة.
   *
   * Four Scopes, each carrying more than one band, and deliberately *not* one
   * Scope per band: a Scope answers what a question is about and a band answers
   * how far it can move you, so a draw that conflated them would still pass a
   * one-band-per-Scope fixture.
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

    const marhala = await challengeType(MARHALA_MODE_KEY);
    const bomb = await challengeType(BOMB_SLUG);
    const closest = await challengeType(CLOSEST_MODE_KEY);
    const ryo = await challengeType(RYO_MODE_KEY);

    const world = (
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'فيديو قيمز', slug: 'marhala-video-games' })
        .expect(201)
    ).body.data as { id: string };

    const scopes: string[] = [];
    for (const [index, name] of ['GTA', 'كود', 'فيفا', 'اوفرواتش'].entries()) {
      const scope = (
        await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
          .send({
            name,
            slug: `marhala-scope-${index}`,
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
      [marhala.id, MARHALA_SLOT],
      [closest.id, WorldChallengeSlotKey.SLOT_2],
      [ryo.id, WorldChallengeSlotKey.SLOT_3],
      [bomb.id, WorldChallengeSlotKey.SLOT_4],
    ].entries()) {
      await configure({
        challengeTypeId,
        slotKey,
        isEnabled: true,
        sortOrder: index,
      }).expect(201);
    }

    // A mixed spread: no Scope holds a single band, and every item is authored
    // for القنبلة as well, so "spent here is still unseen there" is falsifiable.
    const bands = new Map<string, string>();
    const spread = [
      ['easy', 'medium', 'hard'],
      ['easy', 'hard'],
      ['medium', 'hard'],
      ['easy', 'medium'],
    ];
    for (const [scopeIndex, difficulties] of spread.entries()) {
      for (const difficulty of difficulties) {
        for (let copy = 0; copy < 4; copy += 1) {
          const label = `${difficulty}-${scopeIndex}-${copy}`;
          const response = await bearer(
            http().post('/admin/content-items'),
          ).send({
            scopeId: scopes[scopeIndex],
            prompt: { ar: `سؤال ${label}` },
            compatibleChallengeTypeIds: [marhala.id, bomb.id],
            answerPayload: {
              mode: ChallengeAnswerMode.MATCH,
              acceptedAnswers: [`جواب ${label}`],
            },
            // Authored for القنبلة too, which is played by looking at a picture.
            media: {
              type: ContentMediaType.IMAGE,
              assets: [
                { url: `/uploads/marhala/${label}.webp`, altText: label },
              ],
            },
            mechanicPayload: { marhalaDifficulty: difficulty },
            status: ContentItemStatus.READY,
          });
          if (response.status !== 201) {
            throw new Error(
              `marhala item -> ${response.status} ${JSON.stringify(response.body)}`,
            );
          }
          bands.set(String(response.body.data.id), difficulty);
        }
      }
    }

    // The other two slots need content of their own for a unified Match.
    for (const [mechanicId, answerPayload, label] of [
      [
        closest.id,
        { mode: ChallengeAnswerMode.CLOSEST, correctValue: 42 },
        'أقرب',
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
    ] as Array<[string, Record<string, unknown>, string]>) {
      for (const scopeId of scopes) {
        for (let round = 0; round < 3; round += 1) {
          await bearer(http().post('/admin/content-items'))
            .send({
              scopeId,
              prompt: { ar: `${label} ${round}` },
              compatibleChallengeTypeIds: [mechanicId],
              answerPayload,
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
      bandById: bands,
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
  const launch = async (
    sessionId: string,
    slotKey: WorldChallengeSlotKey = MARHALA_SLOT,
  ) => {
    const send = async (path: 'prepare' | 'launch') => {
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
      if (response.status !== 201) {
        // The body is the whole diagnosis when a launch is refused.
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

  /** A started session already running المرحلة. */
  const running = async () => {
    const session = await startSession();
    await launch(session.sessionId);
    return session;
  };

  const runtimes = () =>
    app.get<GameplayRuntimeRepository>(GAMEPLAY_RUNTIME_REPOSITORY);

  const rawRuntime = async (sessionId: string) =>
    database
      .collection('gameplay_runtimes')
      .findOne({ sessionId }, { sort: { createdAt: -1 } });

  const stateOf = async (sessionId: string) => {
    const document = await rawRuntime(sessionId);
    return (document!.state as { runtimeState: Record<string, unknown> })
      .runtimeState;
  };

  const questionOf = async (sessionId: string) => {
    const raw = (await stateOf(sessionId)).questionJson;
    return typeof raw === 'string' && raw
      ? (JSON.parse(raw) as MarhalaRuntimeQuestion)
      : null;
  };

  const turnsOf = async (sessionId: string) =>
    JSON.parse(
      String((await stateOf(sessionId)).turnsJson ?? '[]'),
    ) as MarhalaTurnResult[];

  const positionsOf = async (sessionId: string) =>
    JSON.parse(String((await stateOf(sessionId)).positionsJson)) as Record<
      string,
      number
    >;

  const availabilityOf = async (sessionId: string) =>
    (
      JSON.parse(
        String((await stateOf(sessionId)).availableDifficultiesJson),
      ) as string[]
    ).slice();

  /**
   * Drive a mode command as the given actor, through the production use case.
   *
   * Both revisions are read directly, and after everything else — an authoritative
   * *read* of this mechanic can itself commit a convergence (that is the point of
   * the supplier), so fetching a revision over HTTP and then guarding a command
   * with a revision captured before it is a race this harness would lose, not a
   * product defect. The read-side convergence has its own tests, over HTTP.
   */
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

  /** The phone of whichever team is on the clock right now. */
  const activePhone = async (
    sessionId: string,
    participants: LiveSessionActor[],
  ) => participants[Number((await stateOf(sessionId)).activeTeamIndex)];

  const choose = async (
    session: { sessionId: string; participants: LiveSessionActor[] },
    difficulty: string,
  ) =>
    command(
      session.sessionId,
      await activePhone(session.sessionId, session.participants),
      MARHALA_COMMANDS.chooseDifficulty,
      { difficulty },
    );

  /** Answer the open question, correctly or not. */
  const answer = async (
    session: { sessionId: string; participants: LiveSessionActor[] },
    correct: boolean,
  ) => {
    const question = (await questionOf(session.sessionId))!;
    return command(
      session.sessionId,
      await activePhone(session.sessionId, session.participants),
      MARHALA_COMMANDS.submitAnswer,
      { answer: correct ? question.acceptedAnswers[0] : 'لا شيء إطلاقًا' },
    );
  };

  const exposures = async (filter: Record<string, unknown> = {}) =>
    database
      .collection('content_exposures')
      .find({ challengeTypeKey: MARHALA_MODE_KEY, ...filter })
      .toArray();

  /** The history a long-playing account would already have. */
  const burn = async (contentItemIds: string[]) => {
    if (!contentItemIds.length) return;
    await database.collection('content_exposures').insertMany(
      contentItemIds.map((contentItemId) => ({
        ownerAccountId: controllerId,
        challengeTypeKey: MARHALA_MODE_KEY,
        contentItemId,
        state: 'exposed',
        matchId: 'earlier-match',
        exposedAt: new Date(),
        reservationExpiresAt: null,
      })),
    );
  };

  const itemsOfBand = (band: string) =>
    [...bandById.entries()]
      .filter(([, value]) => value === band)
      .map(([id]) => id);

  describe('launching with no deck', () => {
    it('starts a race the server bound no content to', async () => {
      const { sessionId } = await running();
      const snapshot = await snapshotOf(sessionId);
      const challenge = snapshot.match.currentChallenge!;
      expect(challenge.challengeKey).toBe(MARHALA_MODE_KEY);
      // The one launcher that draws nothing up front: a deck would reserve
      // content the race may never reach.
      expect(challenge.contentItemIds ?? []).toEqual([]);
      expect(await questionOf(sessionId)).toBeNull();
      await expect(exposures()).resolves.toEqual([]);
    });

    it('puts both tokens on the opening tile', async () => {
      const { sessionId } = await running();
      const positions = await positionsOf(sessionId);
      expect(Object.values(positions)).toEqual([
        MARHALA_START_POSITION,
        MARHALA_START_POSITION,
      ]);
      expect((await stateOf(sessionId)).phase).toBe('difficulty-choice');
    });

    it('offers the bands the catalog can actually serve', async () => {
      const { sessionId } = await running();
      expect((await availabilityOf(sessionId)).sort()).toEqual([
        'easy',
        'hard',
        'medium',
      ]);
    });
  });

  describe('a turn feeds itself', () => {
    it('draws exactly one question of the chosen band', async () => {
      const session = await running();
      await choose(session, 'hard');

      const state = await stateOf(session.sessionId);
      // The supplier ran on the committed mutation: pending became a question
      // inside the same request, with no second call from a client.
      expect(state.phase).toBe('question');
      const question = (await questionOf(session.sessionId))!;
      expect(question.difficulty).toBe('hard');
      // A Hard request is a hard filter, never an easier band relabelled.
      expect(bandById.get(question.contentItemId)).toBe('hard');
      expect(state.deadlineAt).toBeTruthy();
    });

    it.each(DIFFICULTIES)('honours a %s request exactly', async (band) => {
      const session = await running();
      await choose(session, band);
      const question = (await questionOf(session.sessionId))!;
      expect(question.difficulty).toBe(band);
      expect(bandById.get(question.contentItemId)).toBe(band);
    });

    it('spends the item only once it is on screen', async () => {
      const session = await running();
      await expect(exposures()).resolves.toEqual([]);

      await choose(session, 'easy');

      const question = (await questionOf(session.sessionId))!;
      const rows = await exposures({ state: 'exposed' });
      expect(rows).toHaveLength(1);
      expect(rows[0].contentItemId).toBe(question.contentItemId);
      expect(rows[0].ownerAccountId).toBe(controllerId);
      await expect(exposures({ state: 'reserved' })).resolves.toEqual([]);
    });

    it('moves the team on a correct answer', async () => {
      const session = await running();
      await choose(session, 'easy');
      const before = Number((await stateOf(session.sessionId)).activeTeamIndex);
      const teamId = Object.keys(await positionsOf(session.sessionId))[before];

      await answer(session, true);

      const turns = await turnsOf(session.sessionId);
      expect(turns).toHaveLength(1);
      expect(turns[0]).toMatchObject({ correct: true, teamId });
      // Easy moves one or two tiles; the roll is the server's, not the client's.
      expect(turns[0].movement).toBeGreaterThanOrEqual(1);
      const positions = await positionsOf(session.sessionId);
      expect(positions[teamId]).toBeGreaterThan(MARHALA_START_POSITION);
    });

    it('gives no movement for a wrong answer and hands over', async () => {
      const session = await running();
      await choose(session, 'medium');
      const before = Number((await stateOf(session.sessionId)).activeTeamIndex);

      await answer(session, false);

      expect(Object.values(await positionsOf(session.sessionId))).toEqual([
        MARHALA_START_POSITION,
        MARHALA_START_POSITION,
      ]);
      expect(
        Number((await stateOf(session.sessionId)).activeTeamIndex),
      ).not.toBe(before);
      // The question was seen, so it stays spent either way.
      await expect(exposures({ state: 'exposed' })).resolves.toHaveLength(1);
    });

    it('spends the question on a timeout too', async () => {
      const session = await running();
      await choose(session, 'medium');
      const question = (await questionOf(session.sessionId))!;

      await command(
        session.sessionId,
        controllerActor(),
        MARHALA_COMMANDS.expireQuestion,
      );

      const turns = await turnsOf(session.sessionId);
      expect(turns).toHaveLength(1);
      expect(turns[0]).toMatchObject({
        correct: false,
        resolvedBy: 'timeout',
        contentItemId: question.contentItemId,
      });
      expect(Object.values(await positionsOf(session.sessionId))).toEqual([
        MARHALA_START_POSITION,
        MARHALA_START_POSITION,
      ]);
      await expect(exposures({ state: 'exposed' })).resolves.toHaveLength(1);
    });

    it('reopens the choice for the next team', async () => {
      const session = await running();
      await choose(session, 'easy');
      await answer(session, false);

      const state = await stateOf(session.sessionId);
      expect(state.phase).toBe('difficulty-choice');
      expect(state.questionJson ?? null).toBeNull();
      // Availability is recomputed against the ledger as it now stands, not
      // carried over from launch.
      expect((await availabilityOf(session.sessionId)).length).toBeGreaterThan(
        0,
      );
    });
  });

  describe('the obligation is discharged exactly once', () => {
    it('does not redraw when the state is read again', async () => {
      const session = await running();
      await choose(session, 'easy');
      const first = (await questionOf(session.sessionId))!;

      // Every authoritative read re-enters the supplier's convergence path; a
      // reconnecting phone must not cost the account a second question.
      await snapshotOf(session.sessionId);
      await snapshotOf(session.sessionId);
      await snapshotOf(session.sessionId);

      expect((await questionOf(session.sessionId))!.contentItemId).toBe(
        first.contentItemId,
      );
      await expect(exposures({ state: 'exposed' })).resolves.toHaveLength(1);
    });

    it('never leaves a chosen band stuck without a question', async () => {
      const session = await running();
      await choose(session, 'hard');
      // The whole point of the supplier: `question-pending` is a state the
      // runtime passes through, never one it rests in.
      expect((await stateOf(session.sessionId)).phase).toBe('question');
    });
  });

  describe('the account never sees the same question twice', () => {
    it('excludes items it has already been shown', async () => {
      const session = await running();
      const seen: string[] = [];
      for (let turn = 0; turn < 4; turn += 1) {
        await choose(session, 'easy');
        const question = await questionOf(session.sessionId);
        if (!question) break;
        seen.push(question.contentItemId);
        await answer(session, false);
      }
      expect(seen.length).toBeGreaterThan(1);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('leaves the same item unseen in another mechanic', async () => {
      const session = await running();
      await choose(session, 'easy');
      const burned = (await questionOf(session.sessionId))!.contentItemId;

      // Every seeded item is authored for القنبلة as well, and that mechanic
      // keeps its own history: seeing a fact here does not spend it there.
      const rows = await database
        .collection('content_exposures')
        .find({ contentItemId: burned })
        .toArray();
      expect(rows.map((row) => row.challengeTypeKey)).toEqual([
        MARHALA_MODE_KEY,
      ]);
    });

    it('does not spend a second account’s content', async () => {
      const session = await running();
      await choose(session, 'easy');
      const rows = await exposures();
      expect(rows).toHaveLength(1);
      expect(rows[0].ownerAccountId).toBe(controllerId);
    });
  });

  describe('a race someone can actually win', () => {
    it('runs turn after turn until a team reaches the finish', async () => {
      const session = await running();
      const teamIds = Object.keys(await positionsOf(session.sessionId));
      const drawn: string[] = [];

      // Play the race for real: every turn elects the boldest band still on
      // offer and answers it correctly, until the board itself ends the race.
      for (let turn = 0; turn < 40; turn += 1) {
        const state = await stateOf(session.sessionId);
        if (state.phase === 'completed') break;
        const available = await availabilityOf(session.sessionId);
        const band =
          ['hard', 'medium', 'easy'].find((candidate) =>
            available.includes(candidate),
          ) ?? null;
        if (!band) break;
        await choose(session, band);
        const question = await questionOf(session.sessionId);
        if (!question) break;
        drawn.push(question.contentItemId);
        await answer(session, true);
      }

      const state = await stateOf(session.sessionId);
      expect(state.phase).toBe('completed');
      const result = JSON.parse(String(state.resultJson)) as MarhalaResult;
      expect(result.endedBy).toBe('finish');
      expect(teamIds).toContain(result.winnerTeamId);
      expect(result.positions[result.winnerTeamId!]).toBe(
        MARHALA_FINISH_POSITION,
      );
      expect(result.turnsPlayed).toBeGreaterThan(1);
      // Every question the race played was a different one, and every one of them
      // is now spent for this account.
      expect(new Set(drawn).size).toBe(drawn.length);
      const rows = await exposures({ state: 'exposed' });
      expect(rows.map((row) => row.contentItemId).sort()).toEqual(
        [...drawn].sort(),
      );

      // And the Match records the win the runtime declared.
      const snapshot = await snapshotOf(session.sessionId);
      expect(snapshot.match.challengeResult).toBeTruthy();
      expect(snapshot.match.challengeResult!.winnerTeamId).toBe(
        result.winnerTeamId,
      );
      expect(snapshot.match.challengeResult!.challengeKey).toBe(
        MARHALA_MODE_KEY,
      );
    }, 120_000);
  });

  describe('running out of content', () => {
    it('withdraws only the depleted band', async () => {
      const session = await running();
      await burn(itemsOfBand('hard'));

      // A read reconciles availability against the ledger as it now stands.
      await snapshotOf(session.sessionId);

      const available = await availabilityOf(session.sessionId);
      expect(available).not.toContain('hard');
      expect(available.sort()).toEqual(['easy', 'medium']);
    });

    it('refuses a withdrawn band rather than downgrading it', async () => {
      const session = await running();
      await burn(itemsOfBand('hard'));
      await snapshotOf(session.sessionId);

      await expect(choose(session, 'hard')).rejects.toThrow(
        /MARHALA_DIFFICULTY_UNAVAILABLE|unseen content/i,
      );
      // And the runtime is still waiting on a real choice, not stuck pending.
      expect((await stateOf(session.sessionId)).phase).toBe(
        'difficulty-choice',
      );
    });

    it('withdraws a band that empties mid-race', async () => {
      const session = await running();
      // Leave exactly one Easy item unseen, then take it in play.
      const easy = itemsOfBand('easy');
      await burn(easy.slice(1));
      await choose(session, 'easy');
      expect((await questionOf(session.sessionId))!.contentItemId).toBe(
        easy[0],
      );

      await answer(session, false);

      expect(await availabilityOf(session.sessionId)).not.toContain('easy');
      expect((await stateOf(session.sessionId)).phase).toBe(
        'difficulty-choice',
      );
    });

    it('ends the race honestly when nothing is left at any band', async () => {
      const session = await running();
      await burn([...bandById.keys()]);

      await snapshotOf(session.sessionId);

      const state = await stateOf(session.sessionId);
      expect(state.phase).toBe('completed');
      const result = JSON.parse(String(state.resultJson)) as MarhalaResult;
      // No winner is invented for a race nobody finished.
      expect(result).toMatchObject({
        winnerTeamId: null,
        endedBy: 'content-exhausted',
      });
    });

    it('awards no challenge win when the content ran out', async () => {
      const session = await running();
      await burn([...bandById.keys()]);
      await snapshotOf(session.sessionId);

      const snapshot = await snapshotOf(session.sessionId);
      const result = snapshot.match.challengeResult;
      expect(result).toBeTruthy();
      expect(result!.winnerTeamId).toBeNull();
    });
  });

  describe('abandoning the challenge', () => {
    it('keeps what was shown and leaves nothing reserved', async () => {
      const session = await running();
      await choose(session, 'easy');
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
