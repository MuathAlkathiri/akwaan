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
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../../src/modules/scoring/domain/scoring-rule';
import {
  MatchSlotStatus,
  MatchStage,
  MatchStatus,
  WorldSelectionMethod,
} from '../../src/modules/match/domain/match.constants';
import { RYO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/ryo-gameplay.plugin';
import { MarkSessionReady } from '../../src/modules/live-game-sessions/application/live-session-lifecycle.use-cases';
import { StartLiveGameSession } from '../../src/modules/live-game-sessions/application/live-session-lifecycle.use-cases';
import { CreateSessionJoinAccess } from '../../src/modules/live-game-sessions/application/live-session-join-access.use-cases';
import {
  JoinLiveSession,
  SetParticipantReadiness,
} from '../../src/modules/live-game-sessions/application/live-participant.use-cases';
import { UpdateParticipantPresence } from '../../src/modules/live-game-sessions/application/update-participant-presence.use-case';
import { GameplayInteractionUseCases } from '../../src/modules/live-game-sessions/application/gameplay-interaction.use-cases';
import { LiveSessionSnapshotComposer } from '../../src/modules/live-game-sessions/application/live-session-snapshot.composer';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../../src/modules/live-game-sessions/domain/live-game-session.repository';
import { LiveSessionActor } from '../../src/modules/live-game-sessions/application/live-session-actor';
import { LiveGameSessionSnapshot } from '../../src/modules/live-game-sessions/application/live-game-session.snapshot';
import { MatchReconciliationService } from '../../src/modules/match/application/match-reconciliation.service';
import { MATCH_CHANGED_EVENT } from '../../src/modules/match/application/match-transition.notifier';
import { LIVE_SESSION_TRANSITION_PUBLISHER } from '../../src/modules/live-game-sessions/application/live-session-transition.publisher';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';

/**
 * The Match vertical slice over HTTP.
 *
 * One live session is driven from an empty lobby to a completed Read Your Opponent
 * challenge: the Match binds a board position to the mechanic's own runtime, the
 * mechanic runs untouched, and the Match learns it finished from the runtime rather
 * than from a controller command.
 */
type MatchBearingSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']>;
};

describe('Match API integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let contentItemIds: string[];
  let outsideContentItemIds: string[];
  let scopeIds: string[];

  const published: Array<{
    sessionId: string;
    event: string;
    payload: Record<string, unknown>;
  }> = [];

  const uuid = () =>
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

  const matchEvents = (sessionId: string) =>
    published.filter(
      (entry) =>
        entry.sessionId === sessionId && entry.event === MATCH_CHANGED_EVENT,
    );

  beforeAll(async () => {
    database = await connectTestDatabase('match-api');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('match-api') },
      // Records what would reach the socket room; the real publisher is a no-op
      // here anyway because no gateway namespace is attached in tests.
      configure: (builder) =>
        builder.overrideProvider(LIVE_SESSION_TRANSITION_PUBLISHER).useValue({
          publish: () => undefined,
          publishEvent: (
            sessionId: string,
            event: string,
            payload: Record<string, unknown>,
          ) => published.push({ sessionId, event, payload }),
        }),
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    controllerId = await currentUserId();
    ({ worldId, contentItemIds, outsideContentItemIds, scopeIds } =
      await seedWorld());
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  const http = () => request(app.getHttpServer());
  const bearer = <T extends request.Test>(value: T): T =>
    value.set('Authorization', `Bearer ${token}`) as T;

  /** Admin routes wrap in `data`; live-session routes return the snapshot itself. */
  const unwrap = <T>(response: request.Response): T =>
    (response.body?.data ?? response.body) as T;

  const currentUserId = async () => {
    const response = await bearer(http().get('/auth/me')).expect(200);
    return String(unwrap<{ id: string }>(response).id);
  };

  /**
   * A complete, active World with four distinct mechanics and three ready
   * ContentItems the canonical RYO mechanic can play.
   */
  const seedWorld = async () => {
    const presentation = {
      inputType: 'phone-multiple-choice',
      timerSeconds: 25,
      soundPack: null,
      revealStyle: null,
    };
    const challengeType = async (body: Record<string, unknown>) =>
      (
        await bearer(http().post('/admin/challenge-types'))
          .send({ ...body, defaultPresentation: presentation })
          .expect(201)
      ).body.data;

    // The mechanic key is the slug: the launcher registry and the runtime plugin
    // both key on it, so nothing maps names anywhere.
    const ryo = await challengeType({
      name: 'اقرأ خصمك',
      slug: RYO_MODE_KEY,
      family: ChallengeFamily.RYO,
      answerMode: ChallengeAnswerMode.RYO,
      scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      status: WorldContentStatus.ACTIVE,
    });
    const signature = await challengeType({
      name: 'Formation Builder',
      slug: 'match-formation-builder',
      family: ChallengeFamily.SIGNATURE,
      answerMode: ChallengeAnswerMode.MULTIPLE_CHOICE,
      scoringRuleId: SCORING_RULE_IDS.SIGNATURE_DECLARED_BY_MECHANIC,
      status: WorldContentStatus.ACTIVE,
    });
    const ryoNumbers = await challengeType({
      name: 'اقرأ الأرقام',
      slug: 'match-ryo-numbers',
      family: ChallengeFamily.RYO,
      answerMode: ChallengeAnswerMode.RYO,
      scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      status: WorldContentStatus.ACTIVE,
    });
    const relational = await challengeType({
      name: 'Same Wavelength',
      slug: 'match-same-wavelength',
      family: ChallengeFamily.RELATIONAL,
      answerMode: ChallengeAnswerMode.VOTE,
      scoringRuleId: SCORING_RULE_IDS.RELATIONAL_ITEM_SUCCESS,
      status: WorldContentStatus.ACTIVE,
    });

    const world = (
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'مباراة كرة القدم', slug: 'match-football' })
        .expect(201)
    ).body.data;
    // A World occurrence is played from four Scopes, so the World needs at
    // least four active ones with ready content.
    const scopes = [] as Array<{ id: string }>;
    for (const [name, slug] of [
      ['كأس العالم', 'match-world-cup'],
      ['الدوري الإنجليزي', 'match-premier-league'],
      ['الدوري السعودي', 'match-saudi-league'],
      ['أبطال أوروبا', 'match-champions-league'],
      ['كأس الملك', 'match-kings-cup'],
    ]) {
      scopes.push(
        (
          await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
            .send({ name, slug, status: WorldContentStatus.ACTIVE })
            .expect(201)
        ).body.data as { id: string },
      );
    }

    const configure = (body: Record<string, unknown>) =>
      bearer(authedConfigure(world.id)).send(body);
    await configure({
      challengeTypeId: signature.id,
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
      challengeTypeId: ryoNumbers.id,
      slotKey: WorldChallengeSlotKey.SLOT_3,
      isEnabled: true,
      sortOrder: 2,
    }).expect(201);
    await configure({
      challengeTypeId: relational.id,
      slotKey: WorldChallengeSlotKey.SLOT_4,
      isEnabled: true,
      sortOrder: 3,
    }).expect(201);

    const item = async (scopeIndex: number, round: number) =>
      (
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId: scopes[scopeIndex].id,
            prompt: { ar: `سؤال ${scopeIndex}-${round}` },
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
    // Three ready items per Scope, recorded per Scope so a test can pick
    // content that is deliberately outside the selected pool.
    const itemsByScope: string[][] = scopes.map(() => []);
    for (let round = 0; round < 3; round += 1) {
      for (const [scopeIndex] of scopes.entries()) {
        const created = await item(scopeIndex, round);
        itemsByScope[scopeIndex].push(String(created.id));
      }
    }

    await bearer(http().patch(`/admin/worlds/${world.id}`))
      .send({
        status: WorldContentStatus.ACTIVE,
      })
      .expect(200);

    return {
      worldId: String(world.id),
      // One item from each of three selected Scopes: a launch really does
      // cross the pool rather than draining a single Scope.
      contentItemIds: [
        itemsByScope[0][0],
        itemsByScope[1][0],
        itemsByScope[2][0],
      ],
      // Content that lives only in the Scope the Match will not select.
      outsideContentItemIds: itemsByScope[4].slice(0, 3),
      scopeIds: scopes.slice(0, 4).map((entry) => String(entry.id)),
    };
  };

  const authedConfigure = (id: string) =>
    http().post(`/admin/worlds/${id}/challenge-configurations`);

  /** An active live session with two teams and two connected, ready players. */
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
      await presence.connected(sessionId, joined.participantId);
      await readiness.execute({
        actor,
        ready: true,
        expectedRevision: (await sessionRevision(sessionId)) as number,
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

  const sessionRevision = async (sessionId: string): Promise<number> => {
    const response = await bearer(
      http().get(`/live-game-sessions/${sessionId}`),
    ).expect(200);
    return unwrap<{ revision: number }>(response).revision;
  };

  const matchRoute = (sessionId: string, path = '') =>
    `/live-game-sessions/${sessionId}/match${path}`;

  const snapshotOf = async (sessionId: string) =>
    unwrap<Record<string, never>>(
      await bearer(http().get(matchRoute(sessionId))).expect(200),
    ) as unknown as MatchBearingSnapshot;

  const command = async (
    sessionId: string,
    path: string,
    body: Record<string, unknown> = {},
    expected = 201,
  ) => {
    const current = await snapshotOf(sessionId);
    const response = await bearer(http().post(matchRoute(sessionId, path)))
      .send({
        commandId: uuid(),
        expectedMatchRevision: current.match.revision,
        ...body,
      })
      .expect(expected);
    return unwrap<MatchBearingSnapshot>(response);
  };

  /** The four Scopes the current occurrence draws its content from. */
  const selectScopes = async (sessionId: string, pool = scopeIds) =>
    command(sessionId, '/scopes/select', {
      occurrenceIndex: 0,
      scopeIds: pool,
    });

  /** Drives one RYO item to resolution through real participant submissions. */
  const playRyoItem = async (
    sessionId: string,
    participants: LiveSessionActor[],
  ) => {
    const interactions = app.get(GameplayInteractionUseCases);
    const runtimes = app.get<GameplayRuntimeRepository>(
      GAMEPLAY_RUNTIME_REPOSITORY,
    );
    const runtime = (await runtimes.findBySessionId(sessionId))!.serialize();
    const round = runtime.activeRound!;
    const interaction = round.interaction!;
    const answeringTeamId = String(round.modeState.answeringTeamId);
    const session = unwrap<{
      revision: number;
      participants: Array<{ id: string; teamId?: string }>;
    }>(
      await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    );
    const participantTeam = (actor: LiveSessionActor) =>
      session.participants.find(
        (candidate: { id: string; teamId?: string }) =>
          candidate.id ===
          (actor.kind === 'participant' ? actor.participantId : ''),
      )?.teamId;

    const answering = participants.find(
      (actor) => participantTeam(actor) === answeringTeamId,
    )!;
    const opposing = participants.find(
      (actor) => participantTeam(actor) !== answeringTeamId,
    )!;

    await interactions.submit({
      sessionId,
      roundId: round.id,
      actor: answering,
      commandId: uuid(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
      expectedInteractionRevision: interaction.revision,
      payload: { kind: 'answer', mode: 'multiple_choice', optionId: 'right' },
    });
    const afterAnswer = (await runtimes.findBySessionId(
      sessionId,
    ))!.serialize();
    // The second submission completes the pair, so the mechanic auto-resolves.
    await interactions.submit({
      sessionId,
      roundId: round.id,
      actor: opposing,
      commandId: uuid(),
      expectedSessionRevision: await sessionRevision(sessionId),
      expectedRuntimeRevision: afterAnswer.revision,
      expectedInteractionRevision:
        afterAnswer.activeRound!.interaction!.revision,
      payload: { kind: 'decision', decision: 'trust' },
    });
  };

  it('drives a Match from the lobby to a bound RYO challenge', async () => {
    const { sessionId, teamIds } = await startSession();
    const stageSequence: string[] = [];

    const created = unwrap<MatchBearingSnapshot>(
      await bearer(http().post(matchRoute(sessionId, '/create'))).expect(201),
    );
    expect(created.match).toMatchObject({
      status: MatchStatus.DRAFT,
      revision: 0,
      stage: { key: MatchStage.LOBBY },
    });
    stageSequence.push(created.match.stage.key);
    // Stage presentation is served, so no client invents timings.
    expect(created.match.stage.minimumDisplayDurationMs).toBe(0);
    expect(created.match.availableActions).toEqual(['match:start']);

    const started = await command(sessionId, '/start');
    stageSequence.push(started.match.stage.key);
    expect(started.match.stage).toMatchObject({
      key: MatchStage.COIN_TOSS,
      minimumDisplayDurationMs: 3500,
      audioCue: 'coin-spin',
      animationCue: 'coin-toss',
    });
    expect(started.match.coinToss.status).toBe('pending');

    const tossed = await command(sessionId, '/coin-toss');
    stageSequence.push(tossed.match.stage.key);
    expect(tossed.match.coinToss.status).toBe('resolved');
    expect(teamIds).toContain(tossed.match.coinToss.winnerTeamId);
    expect(tossed.match.worldSelection.nextTeamId).toBe(
      tossed.match.coinToss.winnerTeamId,
    );

    const worlds = unwrap<Array<{ worldId: string }>>(
      await bearer(http().get(matchRoute(sessionId, '/worlds'))).expect(200),
    );
    expect(worlds.map((world: { worldId: string }) => world.worldId)).toContain(
      worldId,
    );

    const first = await command(sessionId, '/worlds/select', {
      worldId,
      method: WorldSelectionMethod.TEAM_PICK,
      selectedByTeamId: tossed.match.coinToss.winnerTeamId,
    });
    stageSequence.push(first.match.stage.key);
    expect(first.match.worldSelection.remainingCount).toBe(2);
    const second = await command(sessionId, '/worlds/select', {
      worldId,
      method: WorldSelectionMethod.TEAM_PICK,
      selectedByTeamId: first.match.worldSelection.nextTeamId,
    });
    stageSequence.push(second.match.stage.key);
    expect(second.match.worldSelection.requiresAgreement).toBe(true);
    // The same World is chosen three times on purpose: occurrences are distinct.
    const worldsChosen = await command(sessionId, '/worlds/select', {
      worldId,
      method: WorldSelectionMethod.AGREED,
    });
    stageSequence.push(worldsChosen.match.stage.key);
    // The board does not open until the occurrence has its four Scopes.
    expect(worldsChosen.match.stage.key).toBe(MatchStage.SCOPE_SELECTION);
    expect(worldsChosen.match.board).toBeUndefined();
    expect(worldsChosen.match.scopeSelection).toMatchObject({
      occurrenceIndex: 0,
      worldId,
      required: 4,
      selectedScopeIds: [],
    });

    const offered = unwrap<Array<{ scopeId: string }>>(
      await bearer(http().get(matchRoute(sessionId, '/scopes'))).expect(200),
    );
    expect(offered.length).toBeGreaterThanOrEqual(4);

    const third = await selectScopes(sessionId);
    stageSequence.push(third.match.stage.key);
    expect(third.match.stage.key).toBe(MatchStage.BOARD);
    expect(third.match.currentOccurrence?.selectedScopeIds).toEqual(scopeIds);
    expect(
      third.match.currentOccurrence?.selectedScopes.map(
        (scope: { name: string }) => scope.name,
      ),
    ).toEqual([
      'كأس العالم',
      'الدوري الإنجليزي',
      'الدوري السعودي',
      'أبطال أوروبا',
    ]);
    expect(third.match.worldSelection.complete).toBe(true);
    expect(third.match.currentOccurrence).toMatchObject({
      index: 0,
      worldId,
      status: 'in_progress',
    });
    const reloadedBoard = await snapshotOf(sessionId);
    expect(reloadedBoard.match.stage.key).toBe(MatchStage.BOARD);
    expect(reloadedBoard.match.currentOccurrence).toEqual(
      third.match.currentOccurrence,
    );
    expect(stageSequence).toEqual([
      MatchStage.LOBBY,
      MatchStage.COIN_TOSS,
      MatchStage.WORLD_SELECTION,
      MatchStage.WORLD_SELECTION,
      MatchStage.WORLD_SELECTION,
      MatchStage.SCOPE_SELECTION,
      MatchStage.BOARD,
    ]);

    // Every configured position is reported, including the two with no launcher.
    expect(
      third.match.board!.slots.map(
        (slot: { slotKey: string; launchability: string }) => [
          slot.slotKey,
          slot.launchability,
        ],
      ),
    ).toEqual([
      [WorldChallengeSlotKey.SLOT_1, 'configured_but_unimplemented'],
      [WorldChallengeSlotKey.SLOT_2, 'launchable'],
      [WorldChallengeSlotKey.SLOT_3, 'configured_but_unimplemented'],
      [WorldChallengeSlotKey.SLOT_4, 'configured_but_unimplemented'],
    ]);

    // An unimplemented mechanic refuses to launch instead of being auto-completed.
    const refused = await bearer(
      http().post(matchRoute(sessionId, '/challenges/launch')),
    )
      .send({
        commandId: uuid(),
        expectedMatchRevision: third.match.revision,
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_1,
        contentItemIds: [contentItemIds[0]],
      })
      .expect(400);
    expect(refused.body.code).toBe('CHALLENGE_NOT_LAUNCHABLE');

    const launched = await command(sessionId, '/challenges/launch', {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      contentItemIds,
    });
    expect(launched.match.stage.key).toBe(MatchStage.CHALLENGE);
    expect(launched.match.currentChallenge).toMatchObject({
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      challengeKey: RYO_MODE_KEY,
    });
    // The mechanic runs in its own runtime; the Match only holds the binding.
    expect(launched.gameplay?.mode.key).toBe(RYO_MODE_KEY);
    expect(launched.gameplay?.runtimeId).toBe(
      launched.match.currentChallenge.runtimeId,
    );
    expect(
      launched.match.board!.slots.find(
        (slot: { slotKey: string }) =>
          slot.slotKey === WorldChallengeSlotKey.SLOT_2,
      ).status,
    ).toBe(MatchSlotStatus.IN_PROGRESS);
  });

  it('completes the challenge from the runtime and imports its scores once', async () => {
    const { sessionId, participants } = await startSession();
    await bearer(http().post(matchRoute(sessionId, '/create'))).expect(201);
    await command(sessionId, '/start');
    const tossed = await command(sessionId, '/coin-toss');
    await command(sessionId, '/worlds/select', {
      worldId,
      method: WorldSelectionMethod.TEAM_PICK,
      selectedByTeamId: tossed.match.coinToss.winnerTeamId,
    });
    const second = await command(sessionId, '/worlds/select', {
      worldId,
      method: WorldSelectionMethod.TEAM_PICK,
      selectedByTeamId: (await snapshotOf(sessionId)).match.worldSelection
        .nextTeamId,
    });
    expect(second.match.worldSelection.remainingCount).toBe(1);
    await command(sessionId, '/worlds/select', {
      worldId,
      method: WorldSelectionMethod.AGREED,
    });
    await selectScopes(sessionId);
    const launched = await command(sessionId, '/challenges/launch', {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      contentItemIds,
    });
    const runtimeId: string = launched.match.currentChallenge.runtimeId;

    // Three items, played the way players play them.
    await playRyoItem(sessionId, participants);
    await playRyoItem(sessionId, participants);
    const midway = await snapshotOf(sessionId);
    expect(midway.match.stage.key).toBe(MatchStage.CHALLENGE);
    await playRyoItem(sessionId, participants);

    const reconciled = await snapshotOf(sessionId);
    // Nobody sent a "finish challenge" command: the runtime said it was done.
    expect(reconciled.match.stage.key).toBe(MatchStage.BOARD);
    expect(reconciled.match.currentChallenge).toBeUndefined();
    const slot = reconciled.match.board!.slots.find(
      (candidate: { slotKey: string }) =>
        candidate.slotKey === WorldChallengeSlotKey.SLOT_2,
    );
    expect(slot.status).toBe(MatchSlotStatus.COMPLETED);
    expect(slot.runtimeId).toBe(runtimeId);
    expect(slot.scoreSummary).toHaveLength(2);
    const totals = reconciled.match.scoring.matchTotals;
    expect(totals).toHaveLength(2);
    expect(
      totals.reduce(
        (sum: number, team: { signedTotal: number }) => sum + team.signedTotal,
        0,
      ),
    ).not.toBe(0);

    // The whole journey was announced on one channel, ending with the
    // reconciliation the runtime triggered.
    const announced = matchEvents(sessionId).map(
      (entry) => entry.payload.reason,
    );
    expect(announced).toEqual([
      'created',
      'started',
      'coin-toss-resolved',
      'world-selected',
      'world-selected',
      'world-selection-completed',
      'scopes-selected',
      'challenge-launched',
      'challenge-completed',
    ]);
    expect(matchEvents(sessionId).at(-1)!.payload).toMatchObject({
      matchRevision: reconciled.match.revision,
      stage: MatchStage.BOARD,
    });
    // No mechanic or scoring detail rides along.
    expect(JSON.stringify(matchEvents(sessionId))).not.toContain('contentItem');
    expect(JSON.stringify(matchEvents(sessionId))).not.toContain('scoringRule');

    // Re-running reconciliation on the same terminal runtime changes nothing.
    const runtimes = app.get<GameplayRuntimeRepository>(
      GAMEPLAY_RUNTIME_REPOSITORY,
    );
    const runtime = (await runtimes.findBySessionId(sessionId))!.serialize();
    await app.get(MatchReconciliationService).onRuntimeMutated({
      sessionId,
      runtimeId,
      runtimeState: runtime,
    });
    const again = await snapshotOf(sessionId);
    expect(again.match.scoring.matchTotals).toEqual(totals);
    expect(again.match.revision).toBe(reconciled.match.revision);
    // A duplicate terminal never produces a second completion transition.
    expect(
      matchEvents(sessionId).filter(
        (entry) => entry.payload.reason === 'challenge-completed',
      ),
    ).toHaveLength(1);

    // The finished runtime releases the Match back to its board.
    expect(again.match.currentChallenge).toBeUndefined();
    expect(midway.match.currentChallenge.runtimeId).toBe(runtimeId);
  });

  it('only plays content that belongs to the four selected Scopes', async () => {
    const { sessionId } = await startSession();
    await bearer(http().post(matchRoute(sessionId, '/create'))).expect(201);
    await command(sessionId, '/start');
    const tossed = await command(sessionId, '/coin-toss');
    await command(sessionId, '/worlds/select', {
      worldId,
      method: WorldSelectionMethod.TEAM_PICK,
      selectedByTeamId: tossed.match.coinToss.winnerTeamId,
    });
    await command(sessionId, '/worlds/select', {
      worldId,
      method: WorldSelectionMethod.TEAM_PICK,
      selectedByTeamId: (await snapshotOf(sessionId)).match.worldSelection
        .nextTeamId,
    });
    await command(sessionId, '/worlds/select', {
      worldId,
      method: WorldSelectionMethod.AGREED,
    });
    const board = await selectScopes(sessionId);

    // Content from a Scope that was not selected is refused outright.
    const outside = await bearer(
      http().post(matchRoute(sessionId, '/challenges/launch')),
    )
      .send({
        commandId: uuid(),
        expectedMatchRevision: board.match.revision,
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        contentItemIds: outsideContentItemIds,
      })
      .expect(400);
    expect(outside.body.code).toBe('CONTENT_ITEM_OUTSIDE_SCOPE_POOL');

    // The refused launch left the position free.
    const stillFree = await snapshotOf(sessionId);
    expect(stillFree.match.stage.key).toBe(MatchStage.BOARD);

    // A launch from the pool is accepted...
    await command(sessionId, '/challenges/launch', {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      contentItemIds,
    });
    // ...and the occurrence records exactly the content it consumed, so a later
    // launch cannot replay it. The reuse rule itself is asserted in the
    // MatchContentPool unit tests, which can reach a second launch directly.
    const playing = await snapshotOf(sessionId);
    expect(playing.match.stage.key).toBe(MatchStage.CHALLENGE);
    expect(playing.match.currentChallenge?.slotKey).toBe(
      WorldChallengeSlotKey.SLOT_2,
    );

    // A second launch while a challenge is running is refused outright.
    const busy = await bearer(
      http().post(matchRoute(sessionId, '/challenges/launch')),
    )
      .send({
        commandId: uuid(),
        expectedMatchRevision: playing.match.revision,
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        contentItemIds,
      })
      .expect(400);
    expect(busy.body.code).toBe('MATCH_STAGE_INVALID');
  });

  it('refuses a Scope selection that is not exactly four distinct eligible Scopes', async () => {
    const { sessionId } = await startSession();
    await bearer(http().post(matchRoute(sessionId, '/create'))).expect(201);
    await command(sessionId, '/start');
    const tossed = await command(sessionId, '/coin-toss');
    await command(sessionId, '/worlds/select', {
      worldId,
      method: WorldSelectionMethod.TEAM_PICK,
      selectedByTeamId: tossed.match.coinToss.winnerTeamId,
    });
    await command(sessionId, '/worlds/select', {
      worldId,
      method: WorldSelectionMethod.TEAM_PICK,
      selectedByTeamId: (await snapshotOf(sessionId)).match.worldSelection
        .nextTeamId,
    });
    const ready = await command(sessionId, '/worlds/select', {
      worldId,
      method: WorldSelectionMethod.AGREED,
    });

    const reject = async (scopeIdsToSend: string[], expected: string) => {
      const response = await bearer(
        http().post(matchRoute(sessionId, '/scopes/select')),
      )
        .send({
          commandId: uuid(),
          expectedMatchRevision: ready.match.revision,
          occurrenceIndex: 0,
          scopeIds: scopeIdsToSend,
        })
        .expect(400);
      expect(JSON.stringify(response.body)).toContain(expected);
    };

    await reject(scopeIds.slice(0, 3), 'scopeIds');
    await reject([scopeIds[0], scopeIds[0], scopeIds[1], scopeIds[2]], 'SCOPE');
    await reject(
      [scopeIds[0], scopeIds[1], scopeIds[2], 'ffffffffffffffffffffffff'],
      'SCOPE_NOT_SELECTABLE',
    );

    // The board is still closed after every refusal.
    const after = await snapshotOf(sessionId);
    expect(after.match.stage.key).toBe(MatchStage.SCOPE_SELECTION);
    expect(after.match.board).toBeUndefined();
  });

  it('rejects stale revisions, replays, and non-controller callers', async () => {
    const { sessionId } = await startSession();
    await bearer(http().post(matchRoute(sessionId, '/create'))).expect(201);

    // A replayed command id is accepted and changes nothing.
    const commandId = uuid();
    const first = unwrap<MatchBearingSnapshot>(
      await bearer(http().post(matchRoute(sessionId, '/start')))
        .send({ commandId, expectedMatchRevision: 0 })
        .expect(201),
    );
    const replay = unwrap<MatchBearingSnapshot>(
      await bearer(http().post(matchRoute(sessionId, '/start')))
        .send({ commandId, expectedMatchRevision: first.match.revision })
        .expect(201),
    );
    expect(replay.match.revision).toBe(first.match.revision);

    // A stale revision is refused outright.
    await bearer(http().post(matchRoute(sessionId, '/coin-toss')))
      .send({ commandId: uuid(), expectedMatchRevision: 0 })
      .expect(409);

    // A different authenticated user is not this session's controller.
    const otherToken = await loginForToken(app, fixtureCredentials.user);
    await http()
      .post(matchRoute(sessionId, '/coin-toss'))
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ commandId: uuid(), expectedMatchRevision: 1 })
      .expect(403);
    await http()
      .get(matchRoute(sessionId))
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    await http().get(matchRoute(sessionId)).expect(401);
  });

  it('leaves a session without a Match untouched', async () => {
    const { sessionId, participants } = await startSession();
    const session = unwrap<{ match?: unknown }>(
      await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    );
    expect(session.match).toBeUndefined();
    expect(participants).toHaveLength(2);

    await bearer(http().get(matchRoute(sessionId))).expect(404);
  });

  it('hides controller-only Match actions from participants', async () => {
    const { sessionId, participants } = await startSession();
    await bearer(http().post(matchRoute(sessionId, '/create'))).expect(201);
    await command(sessionId, '/start');

    // A participant reads the Match through the session snapshot it already gets.
    const composer = app.get(LiveSessionSnapshotComposer);
    const sessions = app.get<LiveGameSessionRepository>(
      LIVE_GAME_SESSION_REPOSITORY,
    );
    const session = (await sessions.findById(sessionId))!;
    const snapshot = await composer.compose(
      session,
      participants[0],
      new Date(),
    );

    expect(snapshot.match?.stage.key).toBe(MatchStage.COIN_TOSS);
    expect(snapshot.match?.availableActions).toEqual([]);
    // Nothing a participant must not know reaches the projection.
    expect(JSON.stringify(snapshot.match)).not.toContain('scoreEvent');
  });
});
