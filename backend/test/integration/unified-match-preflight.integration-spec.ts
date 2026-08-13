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
  DISTRIBUTED_INFORMATION_TIMER_SECONDS,
  DISTRIBUTED_INFORMATION_VARIANT,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../../src/modules/scoring/domain/scoring-rule';
import {
  MatchStage,
  MatchStatus,
} from '../../src/modules/match/domain/match.constants';
import { DISTRIBUTED_INFORMATION_MODE_KEY } from '../../src/modules/live-game-sessions/domain/distributed-information.plugin';
import { RYO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/ryo-gameplay.plugin';
import {
  JoinLiveSession,
  RemoveLiveParticipant,
} from '../../src/modules/live-game-sessions/application/live-participant.use-cases';
import { UpdateParticipantPresence } from '../../src/modules/live-game-sessions/application/update-participant-presence.use-case';
import { GetGameplayRuntime } from '../../src/modules/live-game-sessions/application/gameplay-runtime.queries';
import { SubmitGameplayCommand } from '../../src/modules/live-game-sessions/application/submit-gameplay-command.use-case';
import { LiveSessionActor } from '../../src/modules/live-game-sessions/application/live-session-actor';
import { LiveGameSessionSnapshot } from '../../src/modules/live-game-sessions/application/live-game-session.snapshot';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';

/**
 * The challenge preflight, end to end.
 *
 * The defect this closes: a phone-required mechanic used to start the moment its
 * tile was clicked, and then fail because nobody was in the room. Now the position
 * is *prepared*, the host is given the session's join code, phones pair, and only a
 * server-side readiness check lets the runtime start.
 *
 * It runs the real ركّبها race to completion so the whole loop is proven: prepare →
 * pair → launch → play → reconcile → board, with the same participants still
 * available for the next challenge.
 */
type MatchSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']> & {
    unified: NonNullable<
      NonNullable<LiveGameSessionSnapshot['match']>['unified']
    >;
  };
};

type Phone = LiveSessionActor & { teamId: string };

describe('Unified Match preflight integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let scopeIds: string[];

  const uuid = () =>
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

  /** Three authored ركّبها puzzles, plus one spare so a draw has a choice. */
  const puzzles = () => [
    {
      prompt: 'من هو اللاعب؟',
      answer: { mode: ChallengeAnswerMode.MATCH, acceptedAnswers: ['ميسي'] },
      segments: ['لعب في إسبانيا', 'كرة ذهبية', 'اعتزل 2019'],
    },
    {
      prompt: 'كم هدفاً سجّل؟',
      answer: { mode: ChallengeAnswerMode.CLOSEST, correctValue: 34 },
      segments: ['في الدوري', 'موسم واحد', 'رقم قياسي'],
    },
    {
      prompt: 'أي نادٍ؟',
      answer: {
        mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        options: [
          { id: 'a', label: { ar: 'الأول' } },
          { id: 'b', label: { ar: 'الثاني' } },
        ],
        correctOptionId: 'b',
      },
      segments: ['مدينة ساحلية', 'قميص أزرق', 'تأسس 1899'],
    },
    {
      prompt: 'أي مدينة؟',
      answer: { mode: ChallengeAnswerMode.MATCH, acceptedAnswers: ['برشلونة'] },
      segments: ['على البحر', 'معمار مميز', 'مهرجان صيفي'],
    },
  ];

  beforeAll(async () => {
    database = await connectTestDatabase('unified-preflight');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('unified-preflight') },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    controllerId = String(
      unwrap<{ id: string }>(await bearer(http().get('/auth/me')).expect(200))
        .id,
    );
    ({ worldId, scopeIds } = await seedWorld());
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

  /**
   * One active World: ركّبها in the first position, the canonical RYO mechanic in
   * the second, and two unimplemented fillers. Four Scopes, each holding one ركّبها
   * puzzle and one RYO item, so both mechanics can draw.
   */
  const seedWorld = async () => {
    const presentation = {
      inputType: 'phone-text',
      timerSeconds: DISTRIBUTED_INFORMATION_TIMER_SECONDS,
      soundPack: null,
      revealStyle: null,
    };
    const challengeType = async (body: Record<string, unknown>) =>
      unwrap<{ id: string }>(
        await bearer(http().post('/admin/challenge-types'))
          .send({ ...body, defaultPresentation: presentation })
          .expect(201),
      );

    const distributed = await challengeType({
      name: 'ركّبها',
      slug: DISTRIBUTED_INFORMATION_MODE_KEY,
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.DISTRIBUTED,
      scoringRuleId: SCORING_RULE_IDS.COOP_ITEM_SUCCESS,
      status: WorldContentStatus.ACTIVE,
    });
    const ryo = await challengeType({
      name: 'اقرأ خصمك',
      slug: RYO_MODE_KEY,
      family: ChallengeFamily.RYO,
      answerMode: ChallengeAnswerMode.RYO,
      scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      status: WorldContentStatus.ACTIVE,
    });
    const filler = [];
    for (const [index, name] of ['Signature', 'Relational'].entries()) {
      filler.push(
        await challengeType({
          name,
          slug: `preflight-filler-${index}`,
          family:
            index === 0
              ? ChallengeFamily.SIGNATURE
              : ChallengeFamily.RELATIONAL,
          answerMode: ChallengeAnswerMode.MULTIPLE_CHOICE,
          scoringRuleId: SCORING_RULE_IDS.SIGNATURE_DECLARED_BY_MECHANIC,
          status: WorldContentStatus.ACTIVE,
        }),
      );
    }

    const world = unwrap<{ id: string }>(
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'عالم التجهيز', slug: 'preflight-world' })
        .expect(201),
    );
    const scopes: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const scope = unwrap<{ id: string }>(
        await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
          .send({
            name: `نطاق ${index}`,
            slug: `preflight-scope-${index}`,
            status: WorldContentStatus.ACTIVE,
          })
          .expect(201),
      );
      scopes.push(String(scope.id));
    }

    for (const [index, [challengeTypeId, slotKey]] of [
      [distributed.id, WorldChallengeSlotKey.SLOT_1],
      [ryo.id, WorldChallengeSlotKey.SLOT_2],
      [filler[0].id, WorldChallengeSlotKey.SLOT_3],
      [filler[1].id, WorldChallengeSlotKey.SLOT_4],
    ].entries()) {
      await bearer(
        http().post(`/admin/worlds/${world.id}/challenge-configurations`),
      )
        .send({ challengeTypeId, slotKey, isEnabled: true, sortOrder: index })
        .expect(201);
    }

    // One ركّبها puzzle per Scope.
    for (const [index, puzzle] of puzzles().entries()) {
      await bearer(http().post('/admin/content-items'))
        .send({
          scopeId: scopes[index],
          prompt: { ar: puzzle.prompt },
          compatibleChallengeTypeIds: [distributed.id],
          answerPayload: puzzle.answer,
          mechanicPayload: {
            variant: DISTRIBUTED_INFORMATION_VARIANT,
            publicPrompt: { ar: puzzle.prompt },
            segments: ['A', 'B', 'C'].map((id, segmentIndex) => ({
              id,
              content: { ar: puzzle.segments[segmentIndex] },
            })),
            twoPlayerMergeOptions: [
              {
                firstParticipantSegmentIds: ['A', 'C'],
                secondParticipantSegmentIds: ['B'],
              },
            ],
            supportedTeamSizes: [2, 3],
            authorSafetyConfirmation: true,
          },
          status: ContentItemStatus.READY,
        })
        .expect(201);
    }
    // One RYO item per Scope, so the second challenge can draw its three.
    for (const [index, scopeId] of scopes.entries()) {
      await bearer(http().post('/admin/content-items'))
        .send({
          scopeId,
          prompt: { ar: `سؤال ${index}` },
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
        .expect(201);
    }

    await bearer(http().patch(`/admin/worlds/${world.id}`))
      .send({ status: WorldContentStatus.ACTIVE })
      .expect(200);
    return { worldId: String(world.id), scopeIds: scopes };
  };

  /** An active session with two teams and, deliberately, no phones at all. */
  const startSession = async () => {
    const created = unwrap<{ snapshot: LiveGameSessionSnapshot }>(
      await bearer(http().post('/live-game-sessions'))
        .send({
          modeKey: 'core-timed-turns',
          modeVersion: 1,
          teamNames: ['البنفسجي', 'الأخضر'],
        })
        .expect(201),
    ).snapshot;
    const sessionId = created.snapshot?.sessionId ?? created.sessionId;
    const lifecycle = async (path: string) =>
      bearer(http().post(`/live-game-sessions/${sessionId}/${path}`))
        .send({
          commandId: crypto.randomUUID(),
          expectedRevision: await sessionRevision(sessionId),
        })
        .expect(201);
    await lifecycle('ready');
    await lifecycle('start');
    return { sessionId, teamIds: created.teams.map((team) => team.id) };
  };

  const sessionRevision = async (sessionId: string) =>
    unwrap<{ revision: number }>(
      await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    ).revision;

  const matchRoute = (sessionId: string, path = '') =>
    `/live-game-sessions/${sessionId}/match${path}`;

  const snapshotOf = async (sessionId: string) =>
    unwrap<MatchSnapshot>(
      await bearer(http().get(matchRoute(sessionId))).expect(200),
    );

  /** One World at all three occurrences, each with the same four Scopes. */
  const createMatch = async (sessionId: string) =>
    unwrap<MatchSnapshot>(
      await bearer(http().post(matchRoute(sessionId, '/unified')))
        .send({
          occurrences: [0, 1, 2].map((occurrenceIndex) => ({
            occurrenceIndex,
            worldId,
            selectedScopeIds: scopeIds,
          })),
        })
        .expect(201),
    );

  const unifiedCommand = async (
    sessionId: string,
    path: string,
    body: Record<string, unknown> = {},
    expected = 201,
  ) => {
    const current = await snapshotOf(sessionId);
    const response = await bearer(
      http().post(matchRoute(sessionId, `/unified/challenges/${path}`)),
    )
      .send({
        commandId: uuid(),
        expectedMatchRevision: current.match.revision,
        ...body,
      })
      .expect(expected);
    return unwrap<MatchSnapshot>(response);
  };

  const prepare = (
    sessionId: string,
    occurrenceIndex: number,
    slotKey: WorldChallengeSlotKey,
    expected = 201,
  ) =>
    unifiedCommand(
      sessionId,
      'prepare',
      { occurrenceIndex, slotKey },
      expected,
    );

  const launch = (
    sessionId: string,
    occurrenceIndex: number,
    slotKey: WorldChallengeSlotKey,
    expected = 201,
  ) =>
    unifiedCommand(sessionId, 'launch', { occurrenceIndex, slotKey }, expected);

  const runtimes = () =>
    app.get<GameplayRuntimeRepository>(GAMEPLAY_RUNTIME_REPOSITORY);

  /** Pairs one phone to a team through the real public join route. */
  const pairPhone = async (
    sessionId: string,
    joinCode: string,
    teamId: string,
    seat: number,
  ): Promise<Phone> => {
    const joined = await app.get(JoinLiveSession).execute({
      joinCode,
      displayName: `لاعب ${teamId}-${seat}`,
      requestedTeamId: teamId,
      joinRequestId: uuid(),
    });
    await app
      .get(UpdateParticipantPresence)
      .connected(sessionId, joined.participantId);
    return {
      kind: 'participant',
      actorId: joined.participantId,
      sessionId,
      participantId: joined.participantId,
      role: 'team-player',
      credentialVersion: 1,
      teamId,
    };
  };

  const viewOf = async (sessionId: string, actor: LiveSessionActor) =>
    (await app.get(GetGameplayRuntime).execute(sessionId, actor)).gameplay!
      .modeState as Record<string, string | number | boolean | null>;

  const answerFor = (prompt: string): string | number => {
    const puzzle = puzzles().find((entry) => entry.prompt === prompt)!;
    if (puzzle.answer.mode === ChallengeAnswerMode.CLOSEST) {
      return puzzle.answer.correctValue!;
    }
    if (puzzle.answer.mode === ChallengeAnswerMode.MULTIPLE_CHOICE) {
      return puzzle.answer.correctOptionId!;
    }
    return puzzle.answer.acceptedAnswers![0];
  };

  /** Plays one puzzle for a team through whichever phone was made answerer. */
  const solveOnePuzzle = async (sessionId: string, team: Phone[]) => {
    for (const phone of team) {
      const view = await viewOf(sessionId, phone);
      if (view.isAnswerer !== true) continue;
      const runtime = (await runtimes().findBySessionId(
        sessionId,
      ))!.serialize();
      return app.get(SubmitGameplayCommand).execute({
        sessionId,
        actor: phone,
        commandId: uuid(),
        expectedSessionRevision: await sessionRevision(sessionId),
        expectedRuntimeRevision: runtime.revision,
        roundId: runtime.activeRound!.id,
        commandType: 'submit-answer',
        payload: {
          contentItemId: String(view.contentItemId),
          answer: answerFor(String(view.publicPrompt)),
        },
      });
    }
    throw new Error('No assigned answerer found for this team');
  };

  it('prepares without starting anything, then launches only once phones are ready', async () => {
    const { sessionId, teamIds } = await startSession();
    const created = await createMatch(sessionId);
    expect(created.match.stage.key).toBe(MatchStage.BOARD);
    expect(created.match.unified.board.positions).toHaveLength(12);
    // Nothing is on screen before a tile is chosen.
    expect(created.match.unified.preflight).toBeUndefined();

    // ── Prepare ركّبها at occurrence 2 ─────────────────────────────────────────
    const prepared = await prepare(sessionId, 2, WorldChallengeSlotKey.SLOT_1);
    expect(prepared.match.stage.key).toBe(MatchStage.PREFLIGHT);
    // The defect this phase fixes: no runtime exists yet.
    expect(await runtimes().findBySessionId(sessionId)).toBeNull();
    expect(prepared.gameplay).toBeUndefined();
    expect(prepared.match.currentChallenge).toBeUndefined();

    const preflight = prepared.match.unified.preflight!;
    expect(preflight).toMatchObject({
      positionKey: '2#slot_1',
      occurrenceIndex: 2,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      challengeKey: DISTRIBUTED_INFORMATION_MODE_KEY,
      requiresPhones: true,
      readyToLaunch: false,
    });
    // Its own Scope pool, and the range ركّبها actually needs.
    expect(preflight.selectedScopes).toHaveLength(4);
    expect(preflight.requirement).toEqual({
      minParticipantsPerTeam: 2,
      maxParticipantsPerTeam: 3,
      requiresBothTeams: true,
    });
    // A join code the phones can use, and no private credential.
    const joinCode = preflight.join!.joinCode;
    expect(joinCode).toMatch(/^[A-Z0-9]+$/);
    expect(preflight.join!.joinPath).toBe(
      `/join/live-session/${encodeURIComponent(joinCode)}`,
    );
    expect(JSON.stringify(preflight)).not.toContain('contentItem');
    expect(JSON.stringify(preflight)).not.toContain('credential');
    // The position is still available; preparing consumed nothing.
    expect(
      prepared.match.unified.board.positions.find(
        (position) => position.positionKey === '2#slot_1',
      )!.status,
    ).toBe('available');

    // A refresh restores the same preflight.
    const reread = await snapshotOf(sessionId);
    expect(reread.match.unified.preflight).toEqual(preflight);
    expect(reread.match.stage.key).toBe(MatchStage.PREFLIGHT);

    // ── Launching before the phones arrive is refused ─────────────────────────
    const tooEarly = await launch(
      sessionId,
      2,
      WorldChallengeSlotKey.SLOT_1,
      400,
    );
    expect((tooEarly as unknown as { code: string }).code).toBe(
      'MATCH_CHALLENGE_NOT_READY',
    );
    expect(await runtimes().findBySessionId(sessionId)).toBeNull();

    // ── Pair two phones per team through the real join route ──────────────────
    const alpha = [
      await pairPhone(sessionId, joinCode, teamIds[0], 0),
      await pairPhone(sessionId, joinCode, teamIds[0], 1),
    ];
    await pairPhone(sessionId, joinCode, teamIds[1], 0);
    await pairPhone(sessionId, joinCode, teamIds[1], 1);

    const ready = await snapshotOf(sessionId);
    const readyPreflight = ready.match.unified.preflight!;
    expect(readyPreflight.readyToLaunch).toBe(true);
    expect(readyPreflight.allTeamsReady).toBe(true);
    expect(readyPreflight.blockingReasons).toEqual([]);
    expect(
      readyPreflight.teams.map((team) => [team.connectedCount, team.ready]),
    ).toEqual([
      [2, true],
      [2, true],
    ]);
    // The host can see who is in the room.
    expect(
      readyPreflight.teams.flatMap((team) => team.participants),
    ).toHaveLength(4);

    // ── Launch ───────────────────────────────────────────────────────────────
    const launched = await launch(sessionId, 2, WorldChallengeSlotKey.SLOT_1);
    expect(launched.match.stage.key).toBe(MatchStage.CHALLENGE);
    expect(launched.match.unified.preflight).toBeUndefined();
    expect(launched.match.currentChallenge).toMatchObject({
      occurrenceIndex: 2,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      challengeKey: DISTRIBUTED_INFORMATION_MODE_KEY,
    });
    // Exactly one runtime, and it is the bound one.
    const runtime = (await runtimes().findBySessionId(sessionId))!;
    expect(runtime.id).toBe(launched.match.currentChallenge!.runtimeId);

    // Every phone sees only its own segments.
    const segmentsOf = (view: Record<string, unknown>) =>
      JSON.parse(String(view.mySegmentsJson)) as Array<{
        id: string;
        content: string;
      }>;
    const alphaViews = await Promise.all(
      alpha.map((phone) => viewOf(sessionId, phone)),
    );
    for (const view of alphaViews) {
      expect(segmentsOf(view).length).toBeGreaterThan(0);
      // No phone holds the whole puzzle, which is the point of the mechanic.
      expect(segmentsOf(view).length).toBeLessThan(3);
    }
    // Between the two of them the team holds all three segments.
    expect(
      new Set(
        alphaViews.flatMap((view) => segmentsOf(view)).map((entry) => entry.id),
      ).size,
    ).toBe(3);
    // And no phone can read a teammate's segment.
    for (const [index, view] of alphaViews.entries()) {
      const others = alphaViews
        .filter((_, other) => other !== index)
        .flatMap((other) => segmentsOf(other))
        .map((entry) => entry.content);
      const serialized = JSON.stringify(view);
      for (const content of others) {
        if (segmentsOf(view).some((entry) => entry.content === content))
          continue;
        expect(serialized).not.toContain(content);
      }
    }

    // ── Play the race to the end ─────────────────────────────────────────────
    for (let puzzle = 0; puzzle < 3; puzzle += 1) {
      await solveOnePuzzle(sessionId, alpha);
    }

    // ── Stop on the result, then continue back to the board ──────────────────
    const resolved = await snapshotOf(sessionId);
    expect(resolved.match.stage.key).toBe(MatchStage.CHALLENGE_RESULT);
    await unifiedCommand(sessionId, 'continue');
    const reconciled = await snapshotOf(sessionId);
    expect(reconciled.match.stage.key).toBe(MatchStage.BOARD);
    expect(reconciled.match.status).toBe(MatchStatus.ACTIVE);
    expect(reconciled.match.currentChallenge).toBeUndefined();
    expect(reconciled.match.unified.preflight).toBeUndefined();
    expect(
      reconciled.match.unified.board.positions.find(
        (position) => position.positionKey === '2#slot_1',
      )!.status,
    ).toBe('completed');
    expect(reconciled.match.unified.board.completedPositionCount).toBe(1);
    // Somebody scored.
    expect(
      reconciled.match.scoring.matchTotals.reduce(
        (total, team) => total + team.signedTotal,
        0,
      ),
    ).toBeGreaterThan(0);

    // ── The phones are still paired ──────────────────────────────────────────
    const session = unwrap<LiveGameSessionSnapshot>(
      await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    );
    const players = session.participants.filter(
      (participant) => participant.role === 'team-player',
    );
    expect(players).toHaveLength(4);
    expect(players.every((participant) => participant.connected)).toBe(true);

    // ── A second challenge reuses them, with no rescanning ───────────────────
    const second = await prepare(sessionId, 0, WorldChallengeSlotKey.SLOT_2);
    const secondPreflight = second.match.unified.preflight!;
    expect(secondPreflight.challengeKey).toBe(RYO_MODE_KEY);
    // Ready immediately: the players never left.
    expect(secondPreflight.readyToLaunch).toBe(true);
    // The same join code, so an existing phone is never invalidated.
    expect(secondPreflight.join!.joinCode).toBe(joinCode);
    // RYO declares its own requirement, not ركّبها's.
    expect(secondPreflight.requirement).toEqual({
      minParticipantsPerTeam: 1,
      requiresBothTeams: true,
    });

    const relaunched = await launch(sessionId, 0, WorldChallengeSlotKey.SLOT_2);
    expect(relaunched.match.stage.key).toBe(MatchStage.CHALLENGE);
    expect(relaunched.match.currentChallenge).toMatchObject({
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      challengeKey: RYO_MODE_KEY,
    });
  }, 120_000);

  describe('preflight guards', () => {
    it('cancels back to the board without consuming anything', async () => {
      const { sessionId } = await startSession();
      const created = await createMatch(sessionId);
      const prepared = await prepare(
        sessionId,
        1,
        WorldChallengeSlotKey.SLOT_1,
      );
      expect(prepared.match.stage.key).toBe(MatchStage.PREFLIGHT);

      const current = await snapshotOf(sessionId);
      const cancelled = unwrap<MatchSnapshot>(
        await bearer(
          http().post(matchRoute(sessionId, '/unified/challenges/cancel')),
        )
          .send({
            commandId: uuid(),
            expectedMatchRevision: current.match.revision,
          })
          .expect(201),
      );

      expect(cancelled.match.stage.key).toBe(MatchStage.BOARD);
      expect(cancelled.match.unified.preflight).toBeUndefined();
      expect(await runtimes().findBySessionId(sessionId)).toBeNull();
      // Same board, same turn, same score.
      expect(cancelled.match.unified.board.completedPositionCount).toBe(0);
      expect(cancelled.match.unified.selectingTeamId).toBe(
        created.match.unified.selectingTeamId,
      );
      expect(
        cancelled.match.unified.board.positions.find(
          (position) => position.positionKey === '1#slot_1',
        )!.status,
      ).toBe('available');
      // And it can be prepared again.
      expect(
        (await prepare(sessionId, 1, WorldChallengeSlotKey.SLOT_1)).match.stage
          .key,
      ).toBe(MatchStage.PREFLIGHT);
    });

    it('holds only one prepared position at a time', async () => {
      const { sessionId } = await startSession();
      await createMatch(sessionId);
      await prepare(sessionId, 1, WorldChallengeSlotKey.SLOT_1);

      const second = await prepare(
        sessionId,
        0,
        WorldChallengeSlotKey.SLOT_1,
        400,
      );
      expect((second as unknown as { code: string }).code).toBe(
        'MATCH_STAGE_INVALID',
      );
      expect(
        (await snapshotOf(sessionId)).match.unified.preflight!.positionKey,
      ).toBe('1#slot_1');
    });

    it('drops readiness when a required phone disconnects, and refuses the launch', async () => {
      const { sessionId, teamIds } = await startSession();
      await createMatch(sessionId);
      const prepared = await prepare(
        sessionId,
        1,
        WorldChallengeSlotKey.SLOT_1,
      );
      const joinCode = prepared.match.unified.preflight!.join!.joinCode;

      const alpha = [
        await pairPhone(sessionId, joinCode, teamIds[0], 0),
        await pairPhone(sessionId, joinCode, teamIds[0], 1),
      ];
      await pairPhone(sessionId, joinCode, teamIds[1], 0);
      await pairPhone(sessionId, joinCode, teamIds[1], 1);
      expect(
        (await snapshotOf(sessionId)).match.unified.preflight!.readyToLaunch,
      ).toBe(true);

      // One phone leaves the room.
      await app
        .get(UpdateParticipantPresence)
        .disconnected(sessionId, alpha[0].participantId!);

      const dropped = (await snapshotOf(sessionId)).match.unified.preflight!;
      expect(dropped.readyToLaunch).toBe(false);
      expect(dropped.teams[0].connectedCount).toBe(1);
      expect(dropped.blockingReasons[0]).toMatchObject({
        code: 'TEAM_NEEDS_MORE_PLAYERS',
        connectedCount: 1,
        required: 2,
      });
      // The server refuses even though the host may still be looking at a stale page.
      const refused = await launch(
        sessionId,
        1,
        WorldChallengeSlotKey.SLOT_1,
        400,
      );
      expect((refused as unknown as { code: string }).code).toBe(
        'MATCH_CHALLENGE_NOT_READY',
      );
      expect(await runtimes().findBySessionId(sessionId)).toBeNull();

      // It comes back when the phone does, without a duplicate participant.
      await app
        .get(UpdateParticipantPresence)
        .connected(sessionId, alpha[0].participantId!);
      const recovered = (await snapshotOf(sessionId)).match.unified.preflight!;
      expect(recovered.readyToLaunch).toBe(true);
      expect(recovered.teams.flatMap((team) => team.participants)).toHaveLength(
        4,
      );
    });

    it('counts neither the controller nor a removed phone', async () => {
      const { sessionId, teamIds } = await startSession();
      await createMatch(sessionId);
      const prepared = await prepare(
        sessionId,
        2,
        WorldChallengeSlotKey.SLOT_1,
      );
      const joinCode = prepared.match.unified.preflight!.join!.joinCode;

      const extra = await pairPhone(sessionId, joinCode, teamIds[0], 0);
      await pairPhone(sessionId, joinCode, teamIds[0], 1);
      await pairPhone(sessionId, joinCode, teamIds[0], 2);
      await pairPhone(sessionId, joinCode, teamIds[1], 0);
      await pairPhone(sessionId, joinCode, teamIds[1], 1);

      const before = (await snapshotOf(sessionId)).match.unified.preflight!;
      // Three is inside ركّبها's range, and the host is not one of them.
      expect(before.teams[0].connectedCount).toBe(3);
      expect(before.readyToLaunch).toBe(true);

      await app.get(RemoveLiveParticipant).execute({
        sessionId,
        participantId: extra.participantId!,
        actorId: controllerId,
        expectedRevision: await sessionRevision(sessionId),
        commandId: uuid(),
      });
      const after = (await snapshotOf(sessionId)).match.unified.preflight!;
      expect(after.teams[0].connectedCount).toBe(2);
      expect(after.readyToLaunch).toBe(true);
    });

    it('does not duplicate a participant when the same phone rejoins', async () => {
      const { sessionId, teamIds } = await startSession();
      await createMatch(sessionId);
      const prepared = await prepare(
        sessionId,
        0,
        WorldChallengeSlotKey.SLOT_1,
      );
      const joinCode = prepared.match.unified.preflight!.join!.joinCode;

      const joinRequestId = uuid();
      const join = app.get(JoinLiveSession);
      const first = await join.execute({
        joinCode,
        displayName: 'لاعب متكرر',
        requestedTeamId: teamIds[0],
        joinRequestId,
      });
      // The same phone retrying its join, exactly as a flaky network would.
      const again = await join.execute({
        joinCode,
        displayName: 'لاعب متكرر',
        requestedTeamId: teamIds[0],
        joinRequestId,
      });

      expect(again.participantId).toBe(first.participantId);
      const session = unwrap<LiveGameSessionSnapshot>(
        await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(
          200,
        ),
      );
      expect(
        session.participants.filter(
          (participant) => participant.role === 'team-player',
        ),
      ).toHaveLength(1);
    });

    it('needs no join code for a mechanic with no launcher', async () => {
      const { sessionId } = await startSession();
      await createMatch(sessionId);
      // slot_3 is configured but unimplemented, so it cannot even be prepared.
      const refused = await prepare(
        sessionId,
        0,
        WorldChallengeSlotKey.SLOT_3,
        400,
      );
      expect((refused as unknown as { code: string }).code).toBe(
        'CHALLENGE_NOT_LAUNCHABLE',
      );
      expect((await snapshotOf(sessionId)).match.stage.key).toBe(
        MatchStage.BOARD,
      );
    });
  });
});
