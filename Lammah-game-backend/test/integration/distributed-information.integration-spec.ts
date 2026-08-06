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
  DISTRIBUTED_INFORMATION_SLUG,
  DISTRIBUTED_INFORMATION_TIMER_SECONDS,
  DISTRIBUTED_INFORMATION_VARIANT,
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
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';
import { DistributedResult } from '../../src/modules/live-game-sessions/domain/distributed-information.plugin';
import { MatchReconciliationService } from '../../src/modules/match/application/match-reconciliation.service';

/**
 * A real two-team "ركّبها" race over the real runtime.
 *
 * Every submission is a genuine gameplay command from a genuine participant, and
 * every private view is read through the authoritative snapshot the phone would
 * receive — so a leak here is a leak in production.
 */
describe('distributed-information race integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let contentItemIds: string[];
  let matchScopeIds: string[];

  const uuid = () =>
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

  beforeAll(async () => {
    database = await connectTestDatabase('distributed-information');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: {
        MONGODB_URI: isolatedTestDatabaseUri('distributed-information'),
      },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    controllerId = String(
      unwrap<{ id: string }>(await bearer(http().get('/auth/me')).expect(200))
        .id,
    );
    ({ worldId, contentItemIds, matchScopeIds } = await seedWorld());
  }, 60_000);

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

  /** Three authored puzzles: short text, number, and multiple choice. */
  const puzzlePayloads = () => [
    {
      prompt: 'من هو اللاعب؟',
      answer: {
        mode: ChallengeAnswerMode.MATCH,
        acceptedAnswers: ['ميسي'],
      },
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
  ];

  /** An active World whose board carries the canonical ركّبها mechanic. */
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
      slug: DISTRIBUTED_INFORMATION_SLUG,
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.DISTRIBUTED,
      scoringRuleId: SCORING_RULE_IDS.DISTRIBUTED_INFORMATION_RACE_RESULT,
      status: WorldContentStatus.ACTIVE,
    });

    const world = unwrap<{ id: string }>(
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'عالم ركّبها', slug: 'distributed-world' })
        .expect(201),
    );
    const scopes: Array<{ id: string }> = [];
    for (const [index, name] of [
      'الأول',
      'الثاني',
      'الثالث',
      'الرابع',
    ].entries()) {
      scopes.push(
        unwrap<{ id: string }>(
          await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
            .send({
              name: `النطاق ${name}`,
              slug: `distributed-scope-${index}`,
              status: WorldContentStatus.ACTIVE,
            })
            .expect(201),
        ),
      );
    }
    const scope = scopes[0];
    // A Match will only select an active, board-ready World, so all four board
    // positions get a distinct mechanic and the World is activated.
    const filler = [] as Array<{ id: string }>;
    for (const [index, family] of [
      ChallengeFamily.SIGNATURE,
      ChallengeFamily.RYO,
      ChallengeFamily.RELATIONAL,
    ].entries()) {
      filler.push(
        await challengeType({
          name: `تحدٍّ ${index}`,
          slug: `distributed-filler-${index}`,
          family,
          answerMode:
            family === ChallengeFamily.RYO
              ? ChallengeAnswerMode.RYO
              : family === ChallengeFamily.RELATIONAL
                ? ChallengeAnswerMode.VOTE
                : ChallengeAnswerMode.MULTIPLE_CHOICE,
          scoringRuleId:
            family === ChallengeFamily.RYO
              ? SCORING_RULE_IDS.RYO_PAYOFF_MATRIX
              : family === ChallengeFamily.RELATIONAL
                ? SCORING_RULE_IDS.RELATIONAL_ITEM_SUCCESS
                : SCORING_RULE_IDS.SIGNATURE_DECLARED_BY_MECHANIC,
          status: WorldContentStatus.ACTIVE,
        }),
      );
    }
    const configure = (
      challengeTypeId: string,
      slotKey: string,
      sortOrder: number,
    ) =>
      bearer(http().post(`/admin/worlds/${world.id}/challenge-configurations`))
        .send({ challengeTypeId, slotKey, isEnabled: true, sortOrder })
        .expect(201);
    await configure(distributed.id, WorldChallengeSlotKey.SLOT_1, 0);
    await configure(filler[0].id, WorldChallengeSlotKey.SLOT_2, 1);
    await configure(filler[1].id, WorldChallengeSlotKey.SLOT_3, 2);
    await configure(filler[2].id, WorldChallengeSlotKey.SLOT_4, 3);

    const items: string[] = [];
    for (const [index, puzzle] of puzzlePayloads().entries()) {
      const created = unwrap<{ id: string }>(
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId: scope.id,
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
          .expect(201),
      );
      items.push(String(created.id));
      expect(index).toBeLessThan(3);
    }

    // Every Scope needs ready content to be selectable for an occurrence.
    for (const [index, entry] of scopes.slice(1).entries()) {
      await bearer(http().post('/admin/content-items'))
        .send({
          scopeId: entry.id,
          prompt: { ar: `سؤال إضافي ${index}` },
          compatibleChallengeTypeIds: [distributed.id],
          answerPayload: {
            mode: ChallengeAnswerMode.MATCH,
            acceptedAnswers: ['نعم'],
          },
          mechanicPayload: {
            variant: DISTRIBUTED_INFORMATION_VARIANT,
            publicPrompt: { ar: `سؤال إضافي ${index}` },
            segments: ['A', 'B', 'C'].map((id) => ({
              id,
              content: { ar: `معلومة ${id}` },
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

    await bearer(http().patch(`/admin/worlds/${world.id}`))
      // Generic board slots: activation needs a complete board, not a
      // nominated signature mechanic.
      .send({ status: WorldContentStatus.ACTIVE })
      .expect(200);

    return {
      worldId: String(world.id),
      contentItemIds: items,
      matchScopeIds: scopes.map((entry) => String(entry.id)),
    };
  };

  /** Two teams, three connected players each. */
  const startSession = async (playersPerTeam = 3) => {
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
    const players: Array<LiveSessionActor & { teamId: string }> = [];
    for (const teamId of teamIds) {
      for (let seat = 0; seat < playersPerTeam; seat += 1) {
        const joined = await join.execute({
          joinCode: access.joinCode,
          displayName: `لاعب ${teamId}-${seat}`,
          requestedTeamId: teamId,
          joinRequestId: uuid(),
        });
        const actor = {
          kind: 'participant' as const,
          actorId: joined.participantId,
          sessionId,
          participantId: joined.participantId,
          role: 'team-player' as const,
          credentialVersion: 1,
          teamId,
        };
        await presence.connected(sessionId, joined.participantId);
        await readiness.execute({
          actor,
          ready: true,
          expectedRevision: await sessionRevision(sessionId),
          commandId: uuid(),
        });
        players.push(actor);
      }
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
    return { sessionId, teamIds, players };
  };

  const sessionRevision = async (sessionId: string) =>
    unwrap<{ revision: number }>(
      await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    ).revision;

  const launch = (sessionId: string) =>
    bearer(
      http().post(
        `/live-game-sessions/${sessionId}/runtime/development/distributed-information/start`,
      ),
    )
      .send({
        worldId,
        slotKey: WorldChallengeSlotKey.SLOT_1,
        contentItemIds,
      })
      .expect(201);

  const runtimes = () =>
    app.get<GameplayRuntimeRepository>(GAMEPLAY_RUNTIME_REPOSITORY);

  /** The snapshot a specific phone would receive. */
  const viewOf = async (sessionId: string, actor: LiveSessionActor) =>
    (await app.get(GetGameplayRuntime).execute(sessionId, actor)).gameplay!
      .modeState as Record<string, string | number | boolean | null>;

  const submit = async (
    sessionId: string,
    actor: LiveSessionActor,
    contentItemId: string,
    answer: string | number,
  ) => {
    const runtime = (await runtimes().findBySessionId(sessionId))!.serialize();
    return app.get(SubmitGameplayCommand).execute({
      sessionId,
      actor,
      commandId: uuid(),
      expectedSessionRevision: await sessionRevision(sessionId),
      expectedRuntimeRevision: runtime.revision,
      roundId: runtime.activeRound!.id,
      commandType: 'submit-answer',
      payload: { contentItemId, answer },
    });
  };

  /** The correct answer for whichever puzzle this player is looking at. */
  const answerFor = (prompt: string): string | number => {
    const puzzle = puzzlePayloads().find((entry) => entry.prompt === prompt)!;
    if (puzzle.answer.mode === ChallengeAnswerMode.CLOSEST) {
      return puzzle.answer.correctValue!;
    }
    if (puzzle.answer.mode === ChallengeAnswerMode.MULTIPLE_CHOICE) {
      return puzzle.answer.correctOptionId!;
    }
    return puzzle.answer.acceptedAnswers![0];
  };

  /** Plays one puzzle for a team through its assigned answerer. */
  const solveCurrentPuzzle = async (
    sessionId: string,
    teamPlayers: Array<LiveSessionActor & { teamId: string }>,
  ) => {
    for (const player of teamPlayers) {
      const view = await viewOf(sessionId, player);
      if (view.isAnswerer === true) {
        return submit(
          sessionId,
          player,
          String(view.contentItemId),
          answerFor(String(view.publicPrompt)),
        );
      }
    }
    throw new Error('No assigned answerer found for this team');
  };

  it('runs a full two-team race and pays the winner exactly one point', async () => {
    const { sessionId, teamIds, players } = await startSession(3);
    const alpha = players.filter((player) => player.teamId === teamIds[0]);
    const beta = players.filter((player) => player.teamId === teamIds[1]);

    await launch(sessionId);

    // Both teams start together, each on its own first puzzle.
    const alphaStart = await viewOf(sessionId, alpha[0]);
    const betaStart = await viewOf(sessionId, beta[0]);
    expect(alphaStart.phase).toBe('active');
    expect(alphaStart.puzzlePosition).toBe(1);
    expect(betaStart.puzzlePosition).toBe(1);
    expect(alphaStart.myTeamId).toBe(teamIds[0]);
    expect(betaStart.myTeamId).toBe(teamIds[1]);

    // Exactly one answerer per team, and only that phone gets input.
    const alphaAnswerers = await Promise.all(
      alpha.map(async (player) => (await viewOf(sessionId, player)).isAnswerer),
    );
    expect(alphaAnswerers.filter(Boolean)).toHaveLength(1);

    // A wrong answer locks only that team, and does not advance it.
    const answerer = alpha[alphaAnswerers.indexOf(true)];
    const wrongView = await viewOf(sessionId, answerer);
    await submit(
      sessionId,
      answerer,
      String(wrongView.contentItemId),
      'إجابة خاطئة',
    );
    const locked = await viewOf(sessionId, answerer);
    expect(Number(locked.myLockUntil)).toBeGreaterThan(0);
    expect(locked.mySolved).toBe(0);
    // The opponent is untouched.
    expect(Number((await viewOf(sessionId, beta[0])).myLockUntil)).toBe(0);
    await expect(
      submit(
        sessionId,
        answerer,
        String(wrongView.contentItemId),
        answerFor(String(wrongView.publicPrompt)),
      ),
    ).rejects.toMatchObject({ code: 'DISTRIBUTED_TEAM_LOCKED' });

    // Beta races ahead through all three puzzles while alpha sits out its lock.
    await solveCurrentPuzzle(sessionId, beta);
    expect((await viewOf(sessionId, beta[0])).mySolved).toBe(1);
    // Alpha has not moved.
    expect((await viewOf(sessionId, alpha[0])).mySolved).toBe(0);

    await solveCurrentPuzzle(sessionId, beta);
    await solveCurrentPuzzle(sessionId, beta);

    // The first team to finish resolves the whole race immediately.
    const runtime = (await runtimes().findBySessionId(sessionId))!.serialize();
    expect(runtime.runtimeState.phase).toBe('completed');
    expect(runtime.status).toBe('completed');
    const result = JSON.parse(
      String(runtime.runtimeState.resultJson),
    ) as DistributedResult;
    expect(result).toMatchObject({
      winnerTeamId: teamIds[1],
      tie: false,
      reason: 'first_finished',
    });
    expect(result.solved[teamIds[1]]).toBe(3);
    expect(result.wrongAttempts[teamIds[0]]).toBe(1);

    // Exactly one +1 ScoreEvent, minted centrally.
    const events = JSON.parse(
      String(runtime.runtimeState.scoreEventsJson),
    ) as Array<{ teamId: string; delta: number; scoringRuleId: string }>;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      teamId: teamIds[1],
      delta: 1,
      scoringRuleId: SCORING_RULE_IDS.DISTRIBUTED_INFORMATION_RACE_RESULT,
    });

    // Reload from Mongo: the resolved race and its private plan survive intact.
    const reloaded = (await runtimes().findById(runtime.id))!.serialize();
    expect(reloaded.runtimeState.phase).toBe('completed');
    expect(reloaded.runtimeState.plansJson).toBe(
      runtime.runtimeState.plansJson,
    );
  }, 120_000);

  it('never leaks a teammate, an opponent, or an answer to a phone', async () => {
    const { sessionId, teamIds, players } = await startSession(3);
    const alpha = players.filter((player) => player.teamId === teamIds[0]);
    await launch(sessionId);

    const views = await Promise.all(
      alpha.map((player) => viewOf(sessionId, player)),
    );
    const segmentsOf = (view: Record<string, unknown>) =>
      JSON.parse(String(view.mySegmentsJson)) as Array<{
        id: string;
        content: string;
      }>;

    // Each teammate holds exactly one segment, and all three are different.
    for (const view of views) expect(segmentsOf(view)).toHaveLength(1);
    expect(new Set(views.map((view) => segmentsOf(view)[0].id)).size).toBe(3);

    // No phone can read another player's segment or any answer.
    for (const [index, view] of views.entries()) {
      const serialized = JSON.stringify(view);
      const othersContent = views
        .filter((_, other) => other !== index)
        .map((other) => segmentsOf(other)[0].content);
      for (const foreign of othersContent) {
        expect(serialized).not.toContain(foreign);
      }
      expect(serialized).not.toContain('ميسي');
      expect(serialized).not.toContain('acceptedAnswers');
      expect(serialized).not.toContain('plansJson');
      expect(serialized).not.toContain('answererIds');
    }

    // A reconnect re-reads the same assignment rather than randomising again.
    const before = await viewOf(sessionId, alpha[1]);
    const after = await viewOf(sessionId, alpha[1]);
    expect(after).toEqual(before);
  }, 120_000);

  it('supports a two-player team through an approved merge', async () => {
    const { sessionId, teamIds, players } = await startSession(2);
    await launch(sessionId);

    const alpha = players.filter((player) => player.teamId === teamIds[0]);
    const holdings = await Promise.all(
      alpha.map(async (player) => {
        const view = await viewOf(sessionId, player);
        return (
          JSON.parse(String(view.mySegmentsJson)) as Array<{ id: string }>
        ).map((segment) => segment.id);
      }),
    );

    // One player holds two segments, the other holds the remaining one.
    expect(holdings.map((held) => held.length).sort()).toEqual([1, 2]);
    expect(new Set(holdings.flat())).toEqual(new Set(['A', 'B', 'C']));
  }, 120_000);

  it('runs through the Match board and returns to it with one point imported', async () => {
    const { sessionId, teamIds, players } = await startSession(3);

    // A Match owns the board, so the challenge is launched from it.
    await bearer(
      http().post(`/live-game-sessions/${sessionId}/match/development/create`),
    ).expect(201);
    const matchSnapshot = async () =>
      unwrap<{ match: Record<string, never> }>(
        await bearer(
          http().get(`/live-game-sessions/${sessionId}/match/development`),
        ).expect(200),
      ).match as unknown as {
        revision: number;
        stage: { key: string };
        board?: { slots: Array<{ slotKey: string; status: string }> };
        currentChallenge?: { runtimeId: string; slotKey: string };
        scoring: {
          matchTotals: Array<{ teamId: string; signedTotal: number }>;
        };
      };
    const matchCommand = async (
      path: string,
      body: Record<string, unknown> = {},
    ) => {
      const current = await matchSnapshot();
      await bearer(
        http().post(
          `/live-game-sessions/${sessionId}/match/development${path}`,
        ),
      )
        .send({
          commandId: uuid(),
          expectedMatchRevision: current.revision,
          ...body,
        })
        .expect(201);
    };

    await matchCommand('/start');
    await matchCommand('/coin-toss');
    const tossed = await matchSnapshot();
    void tossed;
    for (let occurrence = 0; occurrence < 3; occurrence += 1) {
      const current = await matchSnapshot();
      const selection = current as unknown as {
        worldSelection: { nextTeamId?: string; requiresAgreement: boolean };
      };
      await matchCommand('/worlds/select', {
        worldId,
        method: selection.worldSelection.requiresAgreement
          ? 'agreed'
          : 'team_pick',
        ...(selection.worldSelection.requiresAgreement
          ? {}
          : { selectedByTeamId: selection.worldSelection.nextTeamId }),
      });
    }
    // The occurrence draws its content from four Scopes.
    await matchCommand('/scopes/select', {
      occurrenceIndex: 0,
      scopeIds: matchScopeIds,
    });

    const onBoard = await matchSnapshot();
    expect(onBoard.stage.key).toBe('board');
    expect(
      onBoard.board?.slots.find((slot) => slot.slotKey === 'slot_1'),
    ).toMatchObject({ status: 'available' });

    await matchCommand('/challenges/launch', {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      contentItemIds,
    });
    const playing = await matchSnapshot();
    expect(playing.stage.key).toBe('challenge');
    const runtimeId = playing.currentChallenge!.runtimeId;

    // Play the whole race for one team.
    const alpha = players.filter((player) => player.teamId === teamIds[0]);
    await solveCurrentPuzzle(sessionId, alpha);
    await solveCurrentPuzzle(sessionId, alpha);
    await solveCurrentPuzzle(sessionId, alpha);

    // Reconciliation ran on its own and the board is open again.
    const reconciled = await matchSnapshot();
    expect(reconciled.stage.key).toBe('board');
    expect(reconciled.currentChallenge).toBeUndefined();
    expect(
      reconciled.board?.slots.find((slot) => slot.slotKey === 'slot_1'),
    ).toMatchObject({ status: 'completed' });
    // Exactly one Match point, imported once.
    expect(
      reconciled.scoring.matchTotals.find(
        (score) => score.teamId === teamIds[0],
      )?.signedTotal,
    ).toBe(1);

    // A duplicate terminal notification changes nothing.
    const runtime = (await runtimes().findById(runtimeId))!.serialize();
    await app.get(MatchReconciliationService).onRuntimeMutated({
      sessionId,
      runtimeId,
      runtimeState: runtime,
    });
    const again = await matchSnapshot();
    expect(again.revision).toBe(reconciled.revision);
    expect(again.scoring.matchTotals).toEqual(reconciled.scoring.matchTotals);
  }, 180_000);

  it('refuses to launch a team that is too small', async () => {
    const { sessionId } = await startSession(1);

    await bearer(
      http().post(
        `/live-game-sessions/${sessionId}/runtime/development/distributed-information/start`,
      ),
    )
      .send({ worldId, slotKey: WorldChallengeSlotKey.SLOT_1, contentItemIds })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe('DISTRIBUTED_TEAM_SIZE_UNSUPPORTED');
      });
  }, 120_000);
});
