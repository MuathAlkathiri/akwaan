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
  TOP5_MODE_KEY,
  Top5Ownership,
  Top5Result,
} from '../../src/modules/live-game-sessions/domain/top5-keep-or-give.plugin';
import {
  TOP5_ENTRY_COUNT,
  TOP5_RANKED_COUNT,
  TOP5_VARIANT,
} from '../../src/modules/world-content/domain/world-content.constants';
import { parseTeamActionAssignments } from '../../src/modules/live-game-sessions/domain/team-action-assignment';
import { LiveSessionForbiddenError } from '../../src/modules/live-game-sessions/domain/live-session.errors';
import { RYO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/ryo-gameplay.plugin';
import { LiveGameSessionSnapshot } from '../../src/modules/live-game-sessions/application/live-game-session.snapshot';
import { LiveSessionActor } from '../../src/modules/live-game-sessions/application/live-session-actor';
import {
  MarkSessionReady,
  StartLiveGameSession,
} from '../../src/modules/live-game-sessions/application/live-session-lifecycle.use-cases';
import { CreateSessionJoinAccess } from '../../src/modules/live-game-sessions/application/live-session-join-access.use-cases';
import { GameplayInteractionUseCases } from '../../src/modules/live-game-sessions/application/gameplay-interaction.use-cases';
import { ryoAssignedParticipants } from '../../src/modules/live-game-sessions/domain/ryo-gameplay.plugin';
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

const CARD_COUNT = TOP5_ENTRY_COUNT;

/**
 * أفضل 5, played through the unified Match orchestration layer.
 *
 * Every decision is a real gameplay command from a real participant's actor;
 * nothing about the plugin's state is hand-written. Two players per team, so the
 * rotation is observable: exactly one of them is authorised per card, and the
 * server refuses the other one. The Match learns the deck finished from the
 * runtime itself, records an immutable result, and *stops there* until the host
 * says otherwise.
 */
describe('Match Top 5 integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let contentItemId: string;
  let scopeIds: string[];
  /** An active World whose Top 5 position holds only unplayable content. */
  let classicWorldId: string;
  let classicScopeIds: string[];

  const uuid = () =>
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

  beforeAll(async () => {
    database = await connectTestDatabase('match-top5');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('match-top5') },
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

  /** Ten entries: five ranked 1..5 and five traps. */
  const top5Payload = () => ({
    variant: TOP5_VARIANT,
    title: 'أكثر خمسة لاعبين تسجيلاً',
    instruction: 'احتفظ بها أو دسّها للخصم',
    rankingBasis: 'إجمالي الأهداف',
    sourceLabel: 'أرشيف البطولة',
    sourceUrl: 'https://example.invalid/top-scorers',
    asOfDate: '2026-01-01',
    entries: Array.from({ length: CARD_COUNT }, (_, index) => ({
      id: `entry-${index + 1}`,
      label: `مرشح ${index + 1}`,
      rank: index < TOP5_RANKED_COUNT ? index + 1 : null,
    })),
  });

  /**
   * Two active Worlds sharing one complete board of mechanics.
   *
   * `top5-world` holds one playable Top 5 item plus an unplayable sibling the
   * server must never draw. `top5-empty-world` holds nothing playable at all, so
   * launching its Top 5 position has nothing to draw.
   */
  const seedWorld = async () => {
    const presentation = {
      inputType: 'phone-card-choice',
      timerSeconds: 6,
      soundPack: null,
      revealStyle: 'random-ownership-reveal',
    };
    const challengeType = async (body: Record<string, unknown>) =>
      unwrap<{ id: string }>(
        await bearer(http().post('/admin/challenge-types'))
          .send({ ...body, defaultPresentation: presentation })
          .expect(201),
      );

    const top5 = await challengeType({
      name: 'أفضل 5',
      slug: TOP5_MODE_KEY,
      family: ChallengeFamily.SIGNATURE,
      answerMode: ChallengeAnswerMode.TOP_5,
      itemStructure: ChallengeItemStructure.CONTINUOUS,
      scoringRuleId: SCORING_RULE_IDS.TOP5_RESULT,
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
      slug: 'top5-quick-facts',
      family: ChallengeFamily.RYO,
      answerMode: ChallengeAnswerMode.RYO,
      scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
      status: WorldContentStatus.ACTIVE,
    });
    const relational = await challengeType({
      name: 'Same Wavelength',
      slug: 'top5-same-wavelength',
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
        challengeTypeId: top5.id,
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

    const top5World = await createConfiguredWorld({
      name: 'عالم أفضل 5',
      slug: 'top5-world',
      scopeNames: ['الدوري', 'الكأس', 'القارية', 'الودية'],
      seedItems: async (scopes) => {
        const [scope, ...rest] = scopes;
        const item = unwrap<{ id: string }>(
          await bearer(http().post('/admin/content-items'))
            .send({
              scopeId: scope.id,
              prompt: { ar: 'رتّب أفضل خمسة' },
              compatibleChallengeTypeIds: [top5.id],
              answerPayload: { mode: ChallengeAnswerMode.TOP_5 },
              mechanicPayload: top5Payload(),
              status: ContentItemStatus.READY,
            })
            .expect(201),
        );
        contentItemId = String(item.id);
        // A sibling in the same Scope that Top 5 must never draw: it answers a
        // different way and is compatible with a different mechanic entirely.
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId: scope.id,
            prompt: { ar: 'سؤال في نفس النطاق لآلية أخرى' },
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
      name: 'عالم أفضل 5 بلا محتوى',
      slug: 'top5-empty-world',
      scopeNames: ['الموسم', 'النهائيات', 'المنتخبات', 'التجارب'],
      seedItems: async (scopes) => {
        for (const [index, scope] of scopes.entries()) {
          await bearer(http().post('/admin/content-items'))
            .send({
              scopeId: scope.id,
              prompt: { ar: `سؤال عادي ${index + 1}` },
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

    return {
      worldId: top5World.worldId,
      contentItemId,
      scopeIds: top5World.scopeIds,
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
    // Two per team on purpose: with one player each, "the assigned participant"
    // and "anyone on the team" would be indistinguishable.
    for (const [index, teamId] of teamIds.entries()) {
      for (const seat of [1, 2]) {
        const joined = await join.execute({
          joinCode: access.joinCode,
          displayName: `Player ${index + 1}-${seat}`,
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

  /** All three occurrences are the same Top 5 World, from its four Scopes. */
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
    path: 'prepare' | 'launch' | 'cancel' | 'continue',
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

  /** Who the server currently authorises to decide, straight from the runtime. */
  const assignedDecider = async (sessionId: string) => {
    const state = await runtimeState(sessionId);
    return parseTeamActionAssignments(
      state.runtimeState.teamActionJson,
    ).assignments.find((entry) => entry.action === 'top5.decision')!;
  };

  it('plays all ten cards, stops on its result, and reconciles automatically', async () => {
    const { sessionId, participants } = await startSession();
    const created = await createUnified(sessionId);
    expect(created.match.setupMode).toBe(MatchSetupMode.UNIFIED_PRECONFIGURED);
    expect(created.match.status).toBe(MatchStatus.ACTIVE);
    expect(created.match.stage.key).toBe(MatchStage.BOARD);
    expect(positionOf(created, '0#slot_1')).toMatchObject({
      challengeKey: TOP5_MODE_KEY,
      launchability: 'launchable',
    });

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
      challengeKey: TOP5_MODE_KEY,
    });
    const runtimeId = launched.match.currentChallenge!.runtimeId;
    expect(launched.gameplay?.runtimeId).toBe(runtimeId);
    // The server drew exactly the playable Top 5 item; the sibling was filtered.
    expect(
      await boundContentItemIds(sessionId, 0, WorldChallengeSlotKey.SLOT_1),
    ).toEqual([contentItemId]);

    // 2. Ten decisions, alternating teams, each from the one authorised phone.
    const actions: string[] = [];
    const deciders: string[] = [];
    const decidingTeams: string[] = [];
    for (let turn = 0; turn < CARD_COUNT; turn += 1) {
      const assignment = await assignedDecider(sessionId);
      deciders.push(assignment.participantId);
      decidingTeams.push(assignment.teamId);
      const holder = participants.find(
        (participant) => participant.participantId === assignment.participantId,
      )!;

      if (turn === 0) {
        // A teammate on the *correct* team is still refused: this is exactly
        // what a team-level check would have let through.
        const teammate = participants.find(
          (participant) =>
            participant.teamId === assignment.teamId &&
            participant.participantId !== assignment.participantId,
        )!;
        await expect(
          modeCommand(sessionId, teammate, 'decide-card', { action: 'keep' }),
        ).rejects.toBeInstanceOf(LiveSessionForbiddenError);
        // And so is the opposing team.
        const opponent = participants.find(
          (participant) => participant.teamId !== assignment.teamId,
        )!;
        await expect(
          modeCommand(sessionId, opponent, 'decide-card', { action: 'keep' }),
        ).rejects.toBeInstanceOf(LiveSessionForbiddenError);
        // A decision against an assignment the server has moved past is refused
        // even from the right phone.
        await expect(
          modeCommand(sessionId, holder, 'decide-card', {
            action: 'keep',
            assignmentSequence: assignment.sequence + 99,
          }),
        ).rejects.toThrow(/moved past/);
      }

      const action = turn % 2 === 0 ? 'keep' : 'give';
      await modeCommand(sessionId, holder, 'decide-card', {
        action,
        assignmentSequence: assignment.sequence,
      });
      actions.push(action);
    }
    expect(actions.filter((action) => action === 'keep')).toHaveLength(5);
    expect(actions.filter((action) => action === 'give')).toHaveLength(5);
    // A -> B -> A -> B across the ten cards…
    expect(decidingTeams[0]).not.toBe(decidingTeams[1]);
    expect(decidingTeams[0]).toBe(decidingTeams[2]);
    // …and inside each team, its two players took turns.
    expect(new Set(deciders).size).toBe(4);
    expect(deciders[0]).not.toBe(deciders[2]);
    expect(deciders[0]).toBe(deciders[4]);

    const terminal = await runtimeState(sessionId);
    expect(terminal.runtimeState.phase).toBe('completed');
    expect(terminal.status).toBe('completed');
    const pluginResult = JSON.parse(
      String(terminal.runtimeState.resultJson),
    ) as Top5Result;
    const ownership = pluginResult.ownership as Top5Ownership[];
    expect(ownership).toHaveLength(CARD_COUNT);
    // Exactly one owner per entry, and every entry owned.
    expect(new Set(ownership.map((record) => record.entryId)).size).toBe(
      CARD_COUNT,
    );
    // Five scoring entries between two teams: it cannot tie.
    const [teamA, teamB] = Object.keys(pluginResult.top5Counts);
    expect(
      pluginResult.top5Counts[teamA] + pluginResult.top5Counts[teamB],
    ).toBe(TOP5_RANKED_COUNT);
    expect(pluginResult.top5Counts[teamA]).not.toBe(
      pluginResult.top5Counts[teamB],
    );
    expect(pluginResult.winnerTeamId).toBeTruthy();
    // The reveal order is the server's, once, and covers every entry.
    expect(pluginResult.revealOrder).toHaveLength(CARD_COUNT);
    expect(new Set(pluginResult.revealOrder).size).toBe(CARD_COUNT);

    // 3. The Match stopped on its result rather than returning to the board.
    const resolved = await snapshotOf(sessionId);
    expect(resolved.match.stage.key).toBe(MatchStage.CHALLENGE_RESULT);
    expect(resolved.match.currentChallenge).toBeUndefined();
    expect(positionOf(resolved, '0#slot_1').status).toBe(
      MatchSlotStatus.COMPLETED,
    );
    const result = resolved.match.challengeResult!;
    expect(result).toMatchObject({
      positionKey: '0#slot_1',
      challengeKey: TOP5_MODE_KEY,
      winnerTeamId: pluginResult.winnerTeamId,
    });
    expect(result.teamPoints).toEqual(
      expect.arrayContaining([
        { teamId: pluginResult.winnerTeamId, points: 1 },
      ]),
    );
    const details = result.details as unknown as Top5Result;
    expect(details.revealOrder).toEqual(pluginResult.revealOrder);
    expect(details.entries).toHaveLength(CARD_COUNT);
    expect(resolved.match.challengeHistory).toHaveLength(1);

    // 4. A refresh during the result restores exactly the same result.
    const refreshed = await snapshotOf(sessionId);
    expect(refreshed.match.stage.key).toBe(MatchStage.CHALLENGE_RESULT);
    expect(refreshed.match.challengeResult!.id).toBe(result.id);
    expect(
      (refreshed.match.challengeResult!.details as unknown as Top5Result)
        .revealOrder,
    ).toEqual(pluginResult.revealOrder);

    // 5. Exactly one Top 5 ScoreEvent, imported once.
    const matches = app.get<MatchRepository>(MATCH_REPOSITORY);
    const stored = (await matches.findLatestBySessionId(sessionId))!;
    const events = stored.serialize().scoreEvents;
    expect(events).toHaveLength(1);
    expect(events[0].scoringRuleId).toBe(SCORING_RULE_IDS.TOP5_RESULT);
    expect(events[0].delta).toBe(1);
    expect(events[0].challengeSessionId).toBe(runtimeId);

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
    expect(afterRepeat.challengeResults).toHaveLength(1);

    // 7. Continuing returns to the board and awards nothing further.
    const continued = await challengeCommand(sessionId, 'continue');
    expect(continued.match.stage.key).toBe(MatchStage.BOARD);
    expect(continued.match.challengeResult).toBeUndefined();
    expect(continued.match.challengeHistory).toHaveLength(1);
    expect(
      (await matches.findLatestBySessionId(sessionId))!.serialize().scoreEvents,
    ).toHaveLength(1);

    // 8. A repeated continue is refused rather than double-advancing, and the
    //    score is untouched either way.
    await challengeCommand(sessionId, 'continue', {}, 400);
    const afterRepeatedContinue = await snapshotOf(sessionId);
    expect(afterRepeatedContinue.match.stage.key).toBe(MatchStage.BOARD);
    expect(
      (await matches.findLatestBySessionId(sessionId))!.serialize().scoreEvents,
    ).toHaveLength(1);

    // 9. Nothing private about the deck ever leaked into the live projection.
    const projected = JSON.stringify(afterRepeatedContinue.match.unified);
    expect(projected).not.toContain('deckJson');
    expect(projected).not.toContain('revealOrderJson');
  }, 180_000);

  it('gives RYO one authoritative answerer and one authoritative decider per item', async () => {
    const { sessionId, participants } = await startSession();
    const created = await createUnified(sessionId);
    const launched = await launchUnified(sessionId, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      selectingTeamId: created.match.unified.selectingTeamId,
    });
    expect(launched.match.currentChallenge!.challengeKey).toBe(RYO_MODE_KEY);

    const interactions = app.get(GameplayInteractionUseCases);
    const submit = async (
      actor: LiveSessionActor,
      payload: Record<string, unknown>,
    ) => {
      const runtime = await runtimeState(sessionId);
      const round = runtime.activeRound!;
      return interactions.submit({
        sessionId,
        roundId: round.id,
        actor,
        commandId: uuid(),
        expectedSessionRevision: await sessionRevision(sessionId),
        expectedRuntimeRevision: runtime.revision,
        expectedInteractionRevision: round.interaction!.revision,
        payload: payload as never,
      });
    };

    const seenAnswerers: string[] = [];
    const seenDeciders: string[] = [];
    for (let item = 0; item < 3; item += 1) {
      const runtime = await runtimeState(sessionId);
      const assigned = ryoAssignedParticipants(runtime.runtimeState);
      const answeringTeamId = String(
        runtime.activeRound!.modeState.answeringTeamId,
      );
      seenAnswerers.push(assigned.answererParticipantId);
      seenDeciders.push(assigned.deciderParticipantId);

      const answerer = participants.find(
        (person) => person.participantId === assigned.answererParticipantId,
      )!;
      const decider = participants.find(
        (person) => person.participantId === assigned.deciderParticipantId,
      )!;
      expect(answerer.teamId).toBe(answeringTeamId);
      expect(decider.teamId).not.toBe(answeringTeamId);

      if (item === 0) {
        // A teammate of the answerer is on the answering team and still refused.
        const answerersTeammate = participants.find(
          (person) =>
            person.teamId === answerer.teamId &&
            person.participantId !== answerer.participantId,
        )!;
        await expect(
          submit(answerersTeammate, {
            kind: 'answer',
            mode: 'multiple_choice',
            optionId: 'right',
          }),
        ).rejects.toThrow(/assigned player/);
        // Same on the reading side.
        const decidersTeammate = participants.find(
          (person) =>
            person.teamId === decider.teamId &&
            person.participantId !== decider.participantId,
        )!;
        await expect(
          submit(decidersTeammate, { kind: 'decision', decision: 'steal' }),
        ).rejects.toThrow(/assigned player/);
        // And the sides themselves are still enforced.
        await expect(
          submit(decider, {
            kind: 'answer',
            mode: 'multiple_choice',
            optionId: 'right',
          }),
        ).rejects.toThrow(/not available to your team/);
      }

      // Blind and simultaneous is preserved: the answer alone resolves nothing,
      // and neither side can read the other before both have arrived.
      await submit(answerer, {
        kind: 'answer',
        mode: 'multiple_choice',
        optionId: 'right',
      });
      const midItem = await runtimeState(sessionId);
      expect(midItem.activeRound!.interaction!.status).toBe('open');
      expect(midItem.activeRound!.interaction!.outcome).toBeUndefined();

      await submit(decider, { kind: 'decision', decision: 'trust' });
    }

    // Both teams acted once per item, so both rotations advanced: with two
    // players a side, the second item used the other pair.
    expect(seenAnswerers[0]).not.toBe(seenAnswerers[1]);
    expect(seenAnswerers[0]).toBe(seenAnswerers[2]);
    expect(seenDeciders[0]).not.toBe(seenDeciders[1]);
    expect(new Set([...seenAnswerers, ...seenDeciders]).size).toBe(4);

    // Three items completed and the Match stopped on the RYO result.
    const resolved = await snapshotOf(sessionId);
    expect(resolved.match.stage.key).toBe(MatchStage.CHALLENGE_RESULT);
    const result = resolved.match.challengeResult!;
    expect(result.challengeKey).toBe(RYO_MODE_KEY);
    const details = result.details as unknown as {
      itemsPlayed: number;
      items: Array<Record<string, unknown>>;
    };
    expect(details.itemsPlayed).toBe(3);
    // The recap can explain all three interactions, including who took them.
    expect(details.items[0]).toMatchObject({
      answererParticipantId: seenAnswerers[0],
      deciderParticipantId: seenDeciders[0],
      decision: 'trust',
      correct: true,
    });
    await challengeCommand(sessionId, 'continue');
    expect((await snapshotOf(sessionId)).match.stage.key).toBe(
      MatchStage.BOARD,
    );
  }, 120_000);

  it('refuses unplayable content and leaves the board position free', async () => {
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
      challengeKey: TOP5_MODE_KEY,
      launchability: 'launchable',
    });

    // Every item in the pool answers a different way, which Top 5 never
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
