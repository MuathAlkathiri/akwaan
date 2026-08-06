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
  ChallengeItemStructure,
  ContentItemStatus,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../../src/modules/scoring/domain/scoring-rule';
import {
  MatchSlotStatus,
  MatchStage,
  WorldSelectionMethod,
} from '../../src/modules/match/domain/match.constants';
import {
  TOP10_MODE_KEY,
  TOP10_POISON_DECK_VARIANT,
  Top10Assignment,
  Top10Result,
} from '../../src/modules/live-game-sessions/domain/top10-poison-deck.plugin';
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
import { SubmitGameplayCommand } from '../../src/modules/live-game-sessions/application/submit-gameplay-command.use-case';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../src/modules/live-game-sessions/domain/gameplay-runtime';
import { MatchReconciliationService } from '../../src/modules/match/application/match-reconciliation.service';
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../../src/modules/match/persistence/match.repository';

type MatchBearingSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']>;
};

const CARD_COUNT = 14;
const RANKED_COUNT = 10;

/**
 * Top 10 Poison Deck, played through the Match orchestration layer.
 *
 * Every card assignment and every reveal is a real gameplay command against the
 * real runtime; nothing about the plugin's state is hand-written. The Match is
 * expected to learn the deck finished from the runtime itself.
 */
describe('Match Top 10 Poison Deck integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let contentItemId: string;
  let scopeIds: string[];

  const uuid = () =>
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

  beforeAll(async () => {
    database = await connectTestDatabase('match-top10');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('match-top10') },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    controllerId = await currentUserId();
    ({ worldId, contentItemId, scopeIds } = await seedWorld());
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

  const currentUserId = async () =>
    String(
      unwrap<{ id: string }>(await bearer(http().get('/auth/me')).expect(200))
        .id,
    );

  /** A poison deck: 14 candidates, 10 ranked answers, 4 decoys. */
  const poisonDeckPayload = () => {
    const candidates = Array.from({ length: CARD_COUNT }, (_, index) => ({
      id: `card-${index + 1}`,
      label: `مرشح ${index + 1}`,
    }));
    return {
      variant: TOP10_POISON_DECK_VARIANT,
      title: 'أكثر عشرة لاعبين تسجيلاً',
      instruction: 'وزّع البطاقات',
      rankingBasis: 'إجمالي الأهداف',
      sourceLabel: 'أرشيف البطولة',
      sourceUrl: 'https://example.invalid/top-scorers',
      asOfDate: '2026-01-01',
      candidates,
      rankedAnswer: candidates
        .slice(0, RANKED_COUNT)
        .map((candidate, index) => ({
          candidateId: candidate.id,
          rank: index + 1,
        })),
      decoyCandidateIds: candidates
        .slice(RANKED_COUNT)
        .map((candidate) => candidate.id),
    };
  };

  /** An active World whose Signature position is the canonical Top 10 mechanic. */
  const seedWorld = async () => {
    const presentation = {
      inputType: 'phone-card-choice',
      timerSeconds: 6,
      soundPack: null,
      revealStyle: 'rank-10-to-1-then-decoys',
    };
    const challengeType = async (body: Record<string, unknown>) =>
      unwrap<{ id: string }>(
        await bearer(http().post('/admin/challenge-types'))
          .send({ ...body, defaultPresentation: presentation })
          .expect(201),
      );

    const top10 = await challengeType({
      name: 'أفضل 10',
      slug: TOP10_MODE_KEY,
      family: ChallengeFamily.SIGNATURE,
      answerMode: ChallengeAnswerMode.TOP_10,
      itemStructure: ChallengeItemStructure.CONTINUOUS,
      scoringRuleId: SCORING_RULE_IDS.TOP10_POISON_DECK_RESULT,
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
    const secondary = await challengeType({
      name: 'معلومات سريعة',
      slug: 'top10-quick-facts',
      family: ChallengeFamily.RYO,
      answerMode: ChallengeAnswerMode.RYO,
      scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      status: WorldContentStatus.ACTIVE,
    });
    const relational = await challengeType({
      name: 'Same Wavelength',
      slug: 'top10-same-wavelength',
      family: ChallengeFamily.RELATIONAL,
      answerMode: ChallengeAnswerMode.VOTE,
      scoringRuleId: SCORING_RULE_IDS.RELATIONAL_ITEM_SUCCESS,
      status: WorldContentStatus.ACTIVE,
    });

    const world = unwrap<{ id: string }>(
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'عالم أفضل 10', slug: 'top10-world' })
        .expect(201),
    );
    // Four active Scopes, because a World occurrence is played from four.
    const scopes = [] as Array<{ id: string }>;
    for (const [name, slug] of [
      ['الدوري', 'top10-league'],
      ['الكأس', 'top10-cup'],
      ['القارية', 'top10-continental'],
      ['الودية', 'top10-friendlies'],
    ]) {
      scopes.push(
        unwrap<{ id: string }>(
          await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
            .send({ name, slug, status: WorldContentStatus.ACTIVE })
            .expect(201),
        ),
      );
    }
    const scope = scopes[0];
    const configure = (body: Record<string, unknown>) =>
      bearer(
        http().post(`/admin/worlds/${world.id}/challenge-configurations`),
      ).send(body);
    await configure({
      challengeTypeId: top10.id,
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
      challengeTypeId: secondary.id,
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

    const item = unwrap<{ id: string }>(
      await bearer(http().post('/admin/content-items'))
        .send({
          scopeId: scope.id,
          prompt: { ar: 'رتّب أفضل عشرة' },
          compatibleChallengeTypeIds: [top10.id],
          answerPayload: { mode: ChallengeAnswerMode.TOP_10 },
          mechanicPayload: poisonDeckPayload(),
          status: ContentItemStatus.READY,
        })
        .expect(201),
    );

    for (const [index, entry] of scopes.slice(1).entries()) {
      await bearer(http().post('/admin/content-items'))
        .send({
          scopeId: entry.id,
          prompt: { ar: `سؤال إضافي ${index}` },
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
      .send({
        status: WorldContentStatus.ACTIVE,
      })
      .expect(200);

    return {
      worldId: String(world.id),
      contentItemId: String(item.id),
      scopeIds: scopes.map((entry) => String(entry.id)),
    };
  };

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
    const participants: Array<LiveSessionActor & { teamId: string }> = [];
    for (const [index, teamId] of teamIds.entries()) {
      const joined = await join.execute({
        joinCode: access.joinCode,
        displayName: `Player ${index + 1}`,
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

  const sessionRevision = async (sessionId: string) =>
    unwrap<{ revision: number }>(
      await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    ).revision;

  const matchRoute = (sessionId: string, path = '') =>
    `/live-game-sessions/${sessionId}/match/development${path}`;

  const snapshotOf = async (sessionId: string) =>
    unwrap<MatchBearingSnapshot>(
      await bearer(http().get(matchRoute(sessionId))).expect(200),
    );

  const command = async (
    sessionId: string,
    path: string,
    body: Record<string, unknown> = {},
  ) => {
    const current = await snapshotOf(sessionId);
    return unwrap<MatchBearingSnapshot>(
      await bearer(http().post(matchRoute(sessionId, path)))
        .send({
          commandId: uuid(),
          expectedMatchRevision: current.match.revision,
          ...body,
        })
        .expect(201),
    );
  };

  const runtimes = () =>
    app.get<GameplayRuntimeRepository>(GAMEPLAY_RUNTIME_REPOSITORY);

  const runtimeState = async (
    sessionId: string,
  ): Promise<GameplayRuntimeState> =>
    (await runtimes().findBySessionId(sessionId))!.serialize();

  /** One real gameplay command against the live runtime. */
  const modeCommand = async (
    sessionId: string,
    actor: LiveSessionActor,
    commandType: string,
    payload: Record<string, unknown> = {},
  ) => {
    const runtime = await runtimeState(sessionId);
    return app.get(SubmitGameplayCommand).execute({
      sessionId,
      actor,
      commandId: uuid(),
      expectedSessionRevision: await sessionRevision(sessionId),
      expectedRuntimeRevision: runtime.revision,
      roundId: runtime.activeRound!.id,
      commandType,
      payload,
    });
  };

  /** The four Scopes the current occurrence draws its content from. */
  const selectScopes = async (sessionId: string, pool = scopeIds) =>
    command(sessionId, '/scopes/select', {
      occurrenceIndex: 0,
      scopeIds: pool,
    });

  /** Reaches the board of the first World occurrence. */
  const matchOnBoard = async (sessionId: string) => {
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
    return selectScopes(sessionId);
  };

  it('plays a full poison deck through the Match and reconciles it automatically', async () => {
    const { sessionId, participants } = await startSession();
    const board = await matchOnBoard(sessionId);
    expect(board.match.stage.key).toBe(MatchStage.BOARD);
    expect(
      board.match.board!.slots.find(
        (slot) => slot.slotKey === WorldChallengeSlotKey.SLOT_1,
      ),
    ).toMatchObject({
      challengeKey: TOP10_MODE_KEY,
      launchability: 'launchable',
    });

    // 1. Launch through the generic Match challenge-launch route.
    const launched = await command(sessionId, '/challenges/launch', {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      contentItemIds: [contentItemId],
    });
    expect(launched.match.stage.key).toBe(MatchStage.CHALLENGE);
    expect(launched.match.currentChallenge).toMatchObject({
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      challengeKey: TOP10_MODE_KEY,
    });
    const runtimeId = launched.match.currentChallenge!.runtimeId;
    expect(launched.gameplay?.runtimeId).toBe(runtimeId);
    expect(
      launched.match.board!.slots.find(
        (slot) => slot.slotKey === WorldChallengeSlotKey.SLOT_1,
      )?.status,
    ).toBe(MatchSlotStatus.IN_PROGRESS);

    // 2. All fourteen assignments, alternating teams, mixing keep, poison, and
    //    one controller-driven timeout that defaults to keep.
    const actions: string[] = [];
    for (let turn = 0; turn < CARD_COUNT; turn += 1) {
      const before = await runtimeState(sessionId);
      const activeTeamId = before.activeRound!.activeTeamId;
      const actor = participants.find(
        (participant) => participant.teamId === activeTeamId,
      )!;
      if (turn === 3) {
        // The controller expires the turn: the plugin defaults it to keep.
        await modeCommand(
          sessionId,
          { kind: 'user', actorId: controllerId },
          'timeout-card',
        );
        actions.push('timeout');
      } else {
        const action = turn % 2 === 0 ? 'keep' : 'poison';
        await modeCommand(sessionId, actor, 'assign-card', { action });
        actions.push(action);
      }
    }
    expect(
      actions.filter((action) => action === 'keep').length,
    ).toBeGreaterThan(0);
    expect(
      actions.filter((action) => action === 'poison').length,
    ).toBeGreaterThan(0);
    expect(actions).toContain('timeout');

    const assigned = await runtimeState(sessionId);
    const assignments = JSON.parse(
      String(assigned.runtimeState.assignmentsJson),
    ) as Top10Assignment[];
    expect(assignments).toHaveLength(CARD_COUNT);
    expect(assignments.filter((entry) => entry.timedOut)).toHaveLength(1);
    expect(assigned.runtimeState.phase).toBe('revealing');
    // Still mid-challenge: the Match has not been told anything yet.
    expect((await snapshotOf(sessionId)).match.stage.key).toBe(
      MatchStage.CHALLENGE,
    );

    // 3. The real reveal walk: ranks 10 down to 1, then the four decoys.
    const controller: LiveSessionActor = {
      kind: 'user',
      actorId: controllerId,
    };
    for (let reveal = 0; reveal < CARD_COUNT; reveal += 1) {
      await modeCommand(sessionId, controller, 'reveal-next');
    }

    const terminal = await runtimeState(sessionId);
    expect(terminal.runtimeState.phase).toBe('completed');
    expect(terminal.status).toBe('completed');

    // 4. Reconciliation ran on its own, from the runtime's own terminal state.
    const reconciled = await snapshotOf(sessionId);
    expect(reconciled.match.stage.key).toBe(MatchStage.BOARD);
    expect(reconciled.match.currentChallenge).toBeUndefined();
    const slot = reconciled.match.board!.slots.find(
      (candidate) => candidate.slotKey === WorldChallengeSlotKey.SLOT_1,
    )!;
    expect(slot.status).toBe(MatchSlotStatus.COMPLETED);
    expect(slot.runtimeId).toBe(runtimeId);

    // 5. Exactly one Top 10 ScoreEvent was imported, and the summary kept the
    //    mechanic's own internal scores and social metrics.
    const matches = app.get<MatchRepository>(MATCH_REPOSITORY);
    const stored = (await matches.findLatestBySessionId(sessionId))!;
    const events = stored.serialize().scoreEvents;
    expect(events).toHaveLength(1);
    expect(events[0].scoringRuleId).toBe(
      SCORING_RULE_IDS.TOP10_POISON_DECK_RESULT,
    );
    expect(events[0].challengeSessionId).toBe(runtimeId);
    const progress = stored.occurrences[0].slots[WorldChallengeSlotKey.SLOT_1]!;
    expect(progress.scoreEventIds).toEqual([events[0].id]);
    const summary = progress.summary as unknown as Top10Result;
    const pluginResult = JSON.parse(
      String(terminal.runtimeState.resultJson),
    ) as Top10Result;
    expect(summary.internalScores).toEqual(pluginResult.internalScores);
    expect(summary.validCards).toEqual(pluginResult.validCards);
    expect(summary.decoys).toEqual(pluginResult.decoys);
    expect(summary.metrics).toEqual(pluginResult.metrics);

    // 6. Reconciling the same terminal runtime again changes nothing.
    const revisionBefore = stored.revision;
    await app.get(MatchReconciliationService).onRuntimeMutated({
      sessionId,
      runtimeId,
      runtimeState: terminal,
    });
    const afterRepeat = (await matches.findLatestBySessionId(sessionId))!;
    expect(afterRepeat.revision).toBe(revisionBefore);
    expect(afterRepeat.serialize().scoreEvents).toHaveLength(1);

    // 7. The completed state is what Mongo actually holds.
    const reloadedRuntime = await runtimes().findById(runtimeId);
    expect(reloadedRuntime!.serialize().status).toBe('completed');
    const reloadedSnapshot = await snapshotOf(sessionId);
    expect(reloadedSnapshot.match.scoring.matchTotals).toHaveLength(2);
    expect(
      reloadedSnapshot.match.board!.slots.find(
        (candidate) => candidate.slotKey === WorldChallengeSlotKey.SLOT_1,
      )?.status,
    ).toBe(MatchSlotStatus.COMPLETED);
    // Nothing private about the deck leaks into the projection.
    const projected = JSON.stringify(reloadedSnapshot.match);
    expect(projected).not.toContain('deckJson');
    expect(projected).not.toContain('rankedAnswer');
  }, 120_000);

  it('refuses classic Top 10 content and leaves the board position free', async () => {
    const { sessionId } = await startSession();
    const board = await matchOnBoard(sessionId);
    const scopeId = unwrap<Array<{ id: string; worldId: string }>>(
      await bearer(http().get(`/admin/worlds/${worldId}/scopes`)).expect(200),
    )[0].id;
    const top10TypeId = board.match.board!.slots.find(
      (slot) => slot.slotKey === WorldChallengeSlotKey.SLOT_1,
    )!.challengeTypeId!;
    const classic = unwrap<{ id: string }>(
      await bearer(http().post('/admin/content-items'))
        .send({
          scopeId,
          prompt: { ar: 'أفضل عشرة بالنسخة المعتادة' },
          compatibleChallengeTypeIds: [top10TypeId],
          answerPayload: { mode: ChallengeAnswerMode.TOP_10 },
          mechanicPayload: { variant: 'classic' },
          status: ContentItemStatus.READY,
        })
        .expect(201),
    );

    const refused = await bearer(
      http().post(matchRoute(sessionId, '/challenges/launch')),
    )
      .send({
        commandId: uuid(),
        expectedMatchRevision: board.match.revision,
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_1,
        contentItemIds: [classic.id],
      })
      .expect(400);
    expect(refused.body.code).toBe('TOP10_VARIANT_INVALID');

    // A refused launch never strands the Match in the challenge stage.
    const after = await snapshotOf(sessionId);
    expect(after.match.stage.key).toBe(MatchStage.BOARD);
    expect(after.match.currentChallenge).toBeUndefined();
    expect(
      after.match.board!.slots.find(
        (slot) => slot.slotKey === WorldChallengeSlotKey.SLOT_1,
      )?.status,
    ).toBe(MatchSlotStatus.AVAILABLE);
  }, 60_000);
});
