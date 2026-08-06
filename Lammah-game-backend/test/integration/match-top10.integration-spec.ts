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
  MatchSetupMode,
  MatchSlotStatus,
  MatchStage,
  MatchStatus,
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
  match: NonNullable<LiveGameSessionSnapshot['match']> & {
    unified: NonNullable<
      NonNullable<LiveGameSessionSnapshot['match']>['unified']
    >;
  };
};

const CARD_COUNT = 14;
const RANKED_COUNT = 10;

/**
 * Top 10 Poison Deck, played through the unified Match orchestration layer.
 *
 * Every card assignment and every reveal is a real gameplay command against the
 * real runtime; nothing about the plugin's state is hand-written. The Match is
 * expected to learn the deck finished from the runtime itself. The host names a
 * *position* and nothing else: the server draws the one poison deck from the
 * occurrence's own Scope pool, and a classic-variant sibling in the same pool is
 * never handed to the mechanic.
 */
describe('Match Top 10 Poison Deck integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let contentItemId: string;
  let scopeIds: string[];
  /** An active World whose Top 10 position holds only classic-variant content. */
  let classicWorldId: string;
  let classicScopeIds: string[];

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
    ({ worldId, contentItemId, scopeIds, classicWorldId, classicScopeIds } =
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

  /**
   * Two active Worlds sharing one complete board of mechanics.
   *
   * `top10-world` holds the canonical poison deck plus a classic-variant sibling
   * the server must never draw. `top10-classic-world` holds nothing but classic
   * variant content, so launching its Top 10 position has nothing playable to
   * draw — the honest unified analogue of the old variant-level refusal.
   */
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

    /** A World whose four board positions are the mechanics created above. */
    const createConfiguredWorld = async ({
      name,
      slug,
      scopeNames,
      seedItems,
    }: {
      name: string;
      slug: string;
      scopeNames: string[];
      seedItems: (scopes: Array<{ id: string }>) => Promise<void>;
    }) => {
      const world = unwrap<{ id: string }>(
        await bearer(http().post('/admin/worlds'))
          .send({ name, slug })
          .expect(201),
      );
      const scopes = [] as Array<{ id: string }>;
      for (const [index, scopeName] of scopeNames.entries()) {
        scopes.push(
          unwrap<{ id: string }>(
            await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
              .send({
                name: scopeName,
                slug: `${slug}-scope-${index}`,
                status: WorldContentStatus.ACTIVE,
              })
              .expect(201),
          ),
        );
      }
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
      await seedItems(scopes);
      await bearer(http().patch(`/admin/worlds/${world.id}`))
        .send({ status: WorldContentStatus.ACTIVE })
        .expect(200);
      return {
        worldId: String(world.id),
        scopeIds: scopes.map((entry) => String(entry.id)),
      };
    };

    const top10World = await createConfiguredWorld({
      name: 'عالم أفضل 10',
      slug: 'top10-world',
      scopeNames: ['الدوري', 'الكأس', 'القارية', 'الودية'],
      seedItems: async (scopes) => {
        const [scope, ...rest] = scopes;
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
        contentItemId = String(item.id);
        // A classic-variant sibling in the same Scope: the server draws from the
        // pool through the mechanic's own playability contract, so this one must
        // never be handed to the deck.
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId: scope.id,
            prompt: { ar: 'أفضل عشرة بالنسخة المعتادة' },
            compatibleChallengeTypeIds: [top10.id],
            answerPayload: { mode: ChallengeAnswerMode.TOP_10 },
            mechanicPayload: { variant: 'classic' },
            status: ContentItemStatus.READY,
          })
          .expect(201);
        for (const [index, entry] of rest.entries()) {
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
      },
    });

    const classicWorld = await createConfiguredWorld({
      name: 'عالم أفضل 10 كلاسيكي',
      slug: 'top10-classic-world',
      scopeNames: ['الموسم', 'النهائيات', 'المنتخبات', 'التجارب'],
      seedItems: async (scopes) => {
        for (const [index, scope] of scopes.entries()) {
          await bearer(http().post('/admin/content-items'))
            .send({
              scopeId: scope.id,
              prompt: { ar: `أفضل عشرة كلاسيكي ${index + 1}` },
              compatibleChallengeTypeIds: [top10.id],
              answerPayload: { mode: ChallengeAnswerMode.TOP_10 },
              mechanicPayload: { variant: 'classic' },
              status: ContentItemStatus.READY,
            })
            .expect(201);
        }
      },
    });

    return {
      worldId: top10World.worldId,
      contentItemId,
      scopeIds: top10World.scopeIds,
      classicWorldId: classicWorld.worldId,
      classicScopeIds: classicWorld.scopeIds,
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
    `/live-game-sessions/${sessionId}/match${path}`;

  const snapshotOf = async (sessionId: string) =>
    unwrap<MatchBearingSnapshot>(
      await bearer(http().get(matchRoute(sessionId))).expect(200),
    );

  /** All three occurrences are the same poison-deck World, from its four Scopes. */
  const configuration = () => [
    { occurrenceIndex: 0, worldId, selectedScopeIds: scopeIds },
    { occurrenceIndex: 1, worldId, selectedScopeIds: scopeIds },
    { occurrenceIndex: 2, worldId, selectedScopeIds: scopeIds },
  ];

  const createUnified = async (
    sessionId: string,
    occurrences: ReturnType<typeof configuration> = configuration(),
  ) =>
    unwrap<MatchBearingSnapshot>(
      await bearer(http().post(matchRoute(sessionId, '/unified')))
        .send({ occurrences })
        .expect(201),
    );

  /** One unified challenge command: a position, and nothing else. */
  const challengeCommand = async (
    sessionId: string,
    path: 'prepare' | 'launch' | 'cancel',
    body: {
      occurrenceIndex?: number;
      slotKey?: WorldChallengeSlotKey;
      selectingTeamId?: string;
      commandId?: string;
      expectedMatchRevision?: number;
    } = {},
    expected = 201,
  ) => {
    const current = await snapshotOf(sessionId);
    const response = await bearer(
      http().post(matchRoute(sessionId, `/unified/challenges/${path}`)),
    )
      .send({
        commandId: body.commandId ?? uuid(),
        expectedMatchRevision:
          body.expectedMatchRevision ?? current.match.revision,
        ...(body.occurrenceIndex !== undefined
          ? { occurrenceIndex: body.occurrenceIndex }
          : {}),
        ...(body.slotKey ? { slotKey: body.slotKey } : {}),
        ...(body.selectingTeamId
          ? { selectingTeamId: body.selectingTeamId }
          : {}),
      })
      .expect(expected);
    return unwrap<MatchBearingSnapshot>(response);
  };

  /**
   * Prepare, then launch — the two-step flow a phone-required mechanic needs.
   *
   * No ContentItem id travels in either direction: the server draws the content at
   * launch, after it has re-checked that the phones are in the room.
   */
  const launchUnified = async (
    sessionId: string,
    body: {
      occurrenceIndex: number;
      slotKey: WorldChallengeSlotKey;
      selectingTeamId?: string;
      commandId?: string;
      expectedMatchRevision?: number;
    },
    expected = 201,
  ) => {
    const stage = (await snapshotOf(sessionId)).match.stage.key;
    if (stage !== MatchStage.PREFLIGHT) {
      const prepared = await challengeCommand(
        sessionId,
        'prepare',
        body,
        expected === 201 ? 201 : undefined,
      );
      // A refusal at prepare is the answer; there is nothing to launch.
      if ((prepared as unknown as { code?: string }).code) return prepared;
    }
    return challengeCommand(
      sessionId,
      'launch',
      {
        occurrenceIndex: body.occurrenceIndex,
        slotKey: body.slotKey,
        ...(body.selectingTeamId
          ? { selectingTeamId: body.selectingTeamId }
          : {}),
      },
      expected,
    );
  };

  /** The ContentItems the server actually bound, read from stored Match state. */
  const boundContentItemIds = async (
    sessionId: string,
    occurrenceIndex: number,
    slotKey: WorldChallengeSlotKey,
  ) => {
    const match = (await app
      .get<MatchRepository>(MATCH_REPOSITORY)
      .findActiveBySessionId(sessionId))!;
    const occurrence = match
      .serialize()
      .occurrences.find((entry) => entry.index === occurrenceIndex)!;
    return occurrence.slots[slotKey]?.contentItemIds ?? [];
  };

  const positionOf = (snapshot: MatchBearingSnapshot, positionKey: string) =>
    snapshot.match.unified.board.positions.find(
      (position) => position.positionKey === positionKey,
    )!;

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

  it('plays a full poison deck through the Match and reconciles it automatically', async () => {
    const { sessionId, participants } = await startSession();
    const created = await createUnified(sessionId);
    expect(created.match.setupMode).toBe(MatchSetupMode.UNIFIED_PRECONFIGURED);
    expect(created.match.status).toBe(MatchStatus.ACTIVE);
    expect(created.match.stage.key).toBe(MatchStage.BOARD);
    expect(positionOf(created, '0#slot_1')).toMatchObject({
      challengeKey: TOP10_MODE_KEY,
      launchability: 'launchable',
    });
    // The sequential sections are absent rather than filled with a guess.
    expect(created.match.board).toBeUndefined();
    expect(created.match.currentOccurrence).toBeUndefined();
    expect(created.match.scopeSelection).toBeUndefined();

    // 1. Launch the position through the unified challenge-launch route.
    const launched = await launchUnified(sessionId, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      selectingTeamId: created.match.unified.selectingTeamId,
    });
    expect(launched.match.stage.key).toBe(MatchStage.CHALLENGE);
    expect(launched.match.currentChallenge).toMatchObject({
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_1,
      challengeKey: TOP10_MODE_KEY,
    });
    const runtimeId = launched.match.currentChallenge!.runtimeId;
    expect(launched.gameplay?.runtimeId).toBe(runtimeId);
    expect(positionOf(launched, '0#slot_1').status).toBe(
      MatchSlotStatus.IN_PROGRESS,
    );
    // The server drew exactly the poison deck from the pool — the classic
    // sibling was filtered out, never played through the Match.
    expect(
      await boundContentItemIds(sessionId, 0, WorldChallengeSlotKey.SLOT_1),
    ).toEqual([contentItemId]);

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
    expect(positionOf(reconciled, '0#slot_1').status).toBe(
      MatchSlotStatus.COMPLETED,
    );
    expect(positionOf(reconciled, '0#slot_1').runtimeId).toBe(runtimeId);

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
    expect(positionOf(reloadedSnapshot, '0#slot_1').status).toBe(
      MatchSlotStatus.COMPLETED,
    );
    // Nothing private about the deck leaks into the projection.
    const projected = JSON.stringify(reloadedSnapshot.match);
    expect(projected).not.toContain('deckJson');
    expect(projected).not.toContain('rankedAnswer');
  }, 120_000);

  it('refuses classic Top 10 content and leaves the board position free', async () => {
    const { sessionId } = await startSession();
    const created = await createUnified(sessionId, [
      {
        occurrenceIndex: 0,
        worldId: classicWorldId,
        selectedScopeIds: classicScopeIds,
      },
      {
        occurrenceIndex: 1,
        worldId: classicWorldId,
        selectedScopeIds: classicScopeIds,
      },
      {
        occurrenceIndex: 2,
        worldId: classicWorldId,
        selectedScopeIds: classicScopeIds,
      },
    ]);
    expect(created.match.stage.key).toBe(MatchStage.BOARD);
    // The mechanic itself is launchable; it is the content that cannot be played.
    expect(positionOf(created, '0#slot_1')).toMatchObject({
      challengeKey: TOP10_MODE_KEY,
      launchability: 'launchable',
    });

    // Every item in the pool is the classic variant, which the poison deck never
    // accepts — so the server has nothing to draw.
    const refused = await launchUnified(
      sessionId,
      { occurrenceIndex: 0, slotKey: WorldChallengeSlotKey.SLOT_1 },
      400,
    );
    expect((refused as unknown as { code: string }).code).toBe(
      'MATCH_INSUFFICIENT_PLAYABLE_CONTENT',
    );

    // A refused launch never strands the Match: no content was bound, no runtime
    // was created, and the preflight is still held so the host can back out.
    const after = await snapshotOf(sessionId);
    expect(after.match.stage.key).toBe(MatchStage.PREFLIGHT);
    expect(after.match.currentChallenge).toBeUndefined();
    expect(positionOf(after, '0#slot_1').status).toBe(
      MatchSlotStatus.AVAILABLE,
    );
    expect(
      await boundContentItemIds(sessionId, 0, WorldChallengeSlotKey.SLOT_1),
    ).toEqual([]);
    expect(after.gameplay).toBeUndefined();

    // Backing out returns to the board with the position still free.
    const cancelled = await challengeCommand(sessionId, 'cancel');
    expect(cancelled.match.stage.key).toBe(MatchStage.BOARD);
    expect(positionOf(cancelled, '0#slot_1').status).toBe(
      MatchSlotStatus.AVAILABLE,
    );
  }, 60_000);
});
