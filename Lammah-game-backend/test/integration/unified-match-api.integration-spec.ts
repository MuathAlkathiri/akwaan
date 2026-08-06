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
  MatchSetupMode,
  MatchSlotStatus,
  MatchStage,
  MatchStatus,
} from '../../src/modules/match/domain/match.constants';
import { RYO_MODE_KEY } from '../../src/modules/live-game-sessions/domain/ryo-gameplay.plugin';
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
import { GameplayInteractionUseCases } from '../../src/modules/live-game-sessions/application/gameplay-interaction.use-cases';
import { LiveSessionActor } from '../../src/modules/live-game-sessions/application/live-session-actor';
import { LiveGameSessionSnapshot } from '../../src/modules/live-game-sessions/application/live-game-session.snapshot';
import { MATCH_CHANGED_EVENT } from '../../src/modules/match/application/match-transition.notifier';
import { LIVE_SESSION_TRANSITION_PUBLISHER } from '../../src/modules/live-game-sessions/application/live-session-transition.publisher';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../../src/modules/match/persistence/match.repository';

/**
 * The preconfigured Match contract over HTTP, through the production route.
 *
 * One live session is configured completely before gameplay — Anime, Football,
 * Anime again from a different Scope pool — and the Match that comes back is
 * already on its board with all twelve positions playable. A challenge from the
 * *third* occurrence is played first, which the sequential journey could not
 * express at all, and everything survives a reload from Mongo.
 */
type MatchBearingSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']> & {
    unified: NonNullable<
      NonNullable<LiveGameSessionSnapshot['match']>['unified']
    >;
  };
};

interface SeededWorld {
  worldId: string;
  /** Scope ids, in creation order. */
  scopeIds: string[];
  /** One ready RYO ContentItem id per Scope, in the same order. */
  itemIdsByScope: string[][];
}

describe('Unified Match API integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let anime: SeededWorld;
  let football: SeededWorld;
  /** Active, complete board, ready content — but none of it playable through RYO. */
  let barren: SeededWorld;

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
    database = await connectTestDatabase('unified-match-api');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('unified-match-api') },
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
    const mechanics = await seedChallengeTypes();
    // Eight Anime Scopes, so the two Anime occurrences can be configured from two
    // completely different four-Scope pools.
    anime = await seedWorld('انمي', 'unified-anime', 8, mechanics);
    football = await seedWorld('كرة القدم', 'unified-football', 4, mechanics);
    // Its Scopes all hold ready content, so it configures fine — but the content
    // is authored for a mechanic that is not in the RYO position.
    barren = await seedWorld(
      'عالم بلا محتوى متوافق',
      'unified-barren',
      4,
      mechanics,
      {
        compatibleWith: mechanics.ryoNumbers,
      },
    );
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

  const currentUserId = async () => {
    const response = await bearer(http().get('/auth/me')).expect(200);
    return String(unwrap<{ id: string }>(response).id);
  };

  /**
   * Four distinct mechanics, shared by both Worlds. Only the canonical
   * `read-your-opponent` slug has a launcher; the other three are honestly
   * reported as configured-but-unimplemented.
   */
  const seedChallengeTypes = async () => {
    const presentation = {
      inputType: 'phone-multiple-choice',
      timerSeconds: 25,
      soundPack: null,
      revealStyle: null,
    };
    const create = async (body: Record<string, unknown>) =>
      (
        await bearer(http().post('/admin/challenge-types'))
          .send({ ...body, defaultPresentation: presentation })
          .expect(201)
      ).body.data as { id: string };

    return {
      signature: await create({
        name: 'Formation Builder',
        slug: 'unified-formation-builder',
        family: ChallengeFamily.SIGNATURE,
        answerMode: ChallengeAnswerMode.MULTIPLE_CHOICE,
        scoringRuleId: SCORING_RULE_IDS.SIGNATURE_DECLARED_BY_MECHANIC,
        status: WorldContentStatus.ACTIVE,
      }),
      ryo: await create({
        name: 'اقرأ خصمك',
        slug: RYO_MODE_KEY,
        family: ChallengeFamily.RYO,
        answerMode: ChallengeAnswerMode.RYO,
        scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
        status: WorldContentStatus.ACTIVE,
      }),
      ryoNumbers: await create({
        name: 'اقرأ الأرقام',
        slug: 'unified-ryo-numbers',
        family: ChallengeFamily.RYO,
        answerMode: ChallengeAnswerMode.RYO,
        scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
        status: WorldContentStatus.ACTIVE,
      }),
      relational: await create({
        name: 'Same Wavelength',
        slug: 'unified-same-wavelength',
        family: ChallengeFamily.RELATIONAL,
        answerMode: ChallengeAnswerMode.VOTE,
        scoringRuleId: SCORING_RULE_IDS.RELATIONAL_ITEM_SUCCESS,
        status: WorldContentStatus.ACTIVE,
      }),
    };
  };

  /** An active World with a complete four-position board and ready content. */
  const seedWorld = async (
    name: string,
    slug: string,
    scopeCount: number,
    mechanics: Awaited<ReturnType<typeof seedChallengeTypes>>,
    options: {
      /** Which mechanic the seeded content is authored for. Defaults to RYO. */
      compatibleWith?: { id: string };
    } = {},
  ): Promise<SeededWorld> => {
    const world = (
      await bearer(http().post('/admin/worlds'))
        .send({ name, slug })
        .expect(201)
    ).body.data as { id: string };

    const scopeIds: string[] = [];
    for (let index = 0; index < scopeCount; index += 1) {
      const scope = (
        await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
          .send({
            name: `${name} ${index}`,
            slug: `${slug}-scope-${index}`,
            status: WorldContentStatus.ACTIVE,
          })
          .expect(201)
      ).body.data as { id: string };
      scopeIds.push(String(scope.id));
    }

    const configure = (body: Record<string, unknown>) =>
      bearer(
        http().post(`/admin/worlds/${world.id}/challenge-configurations`),
      ).send(body);
    for (const [index, [challengeTypeId, slotKey]] of [
      [mechanics.signature.id, WorldChallengeSlotKey.SLOT_1],
      [mechanics.ryo.id, WorldChallengeSlotKey.SLOT_2],
      [mechanics.ryoNumbers.id, WorldChallengeSlotKey.SLOT_3],
      [mechanics.relational.id, WorldChallengeSlotKey.SLOT_4],
    ].entries()) {
      await configure({
        challengeTypeId,
        slotKey,
        isEnabled: true,
        sortOrder: index,
      }).expect(201);
    }

    // Two ready RYO items per Scope: enough for a three-item challenge drawn
    // across a pool, and enough that every Scope is eligible on its own.
    const itemIdsByScope: string[][] = scopeIds.map(() => []);
    for (const [scopeIndex, scopeId] of scopeIds.entries()) {
      for (let round = 0; round < 2; round += 1) {
        const item = (
          await bearer(http().post('/admin/content-items'))
            .send({
              scopeId,
              prompt: { ar: `${slug} ${scopeIndex}-${round}` },
              compatibleChallengeTypeIds: [
                (options.compatibleWith ?? mechanics.ryo).id,
              ],
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
        ).body.data as { id: string };
        itemIdsByScope[scopeIndex].push(String(item.id));
      }
    }

    await bearer(http().patch(`/admin/worlds/${world.id}`))
      .send({ status: WorldContentStatus.ACTIVE })
      .expect(200);

    return { worldId: String(world.id), scopeIds, itemIdsByScope };
  };

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

  const sessionRevision = async (sessionId: string): Promise<number> => {
    const response = await bearer(
      http().get(`/live-game-sessions/${sessionId}`),
    ).expect(200);
    return unwrap<{ revision: number }>(response).revision;
  };

  const matchRoute = (sessionId: string, path = '') =>
    `/live-game-sessions/${sessionId}/match${path}`;

  const snapshotOf = async (sessionId: string) =>
    unwrap<MatchBearingSnapshot>(
      await bearer(http().get(matchRoute(sessionId))).expect(200),
    );

  /**
   * The product contract's own example: Anime, Football, Anime again — the third
   * occurrence deliberately drawing from four different Anime Scopes.
   */
  const configuration = () => [
    {
      occurrenceIndex: 0,
      worldId: anime.worldId,
      selectedScopeIds: anime.scopeIds.slice(0, 4),
    },
    {
      occurrenceIndex: 1,
      worldId: football.worldId,
      selectedScopeIds: football.scopeIds.slice(0, 4),
    },
    {
      occurrenceIndex: 2,
      worldId: anime.worldId,
      selectedScopeIds: anime.scopeIds.slice(4, 8),
    },
  ];

  const createUnified = async (
    sessionId: string,
    occurrences: ReturnType<typeof configuration> = configuration(),
    expected = 201,
  ) =>
    unwrap<MatchBearingSnapshot>(
      await bearer(http().post(matchRoute(sessionId, '/unified')))
        .send({ occurrences })
        .expect(expected),
    );

  /** Three items from occurrence 2's own Anime Scope pool. */
  const occurrenceTwoItems = () =>
    [4, 5, 6].map((scopeIndex) => anime.itemIdsByScope[scopeIndex][0]);

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
        (candidate) =>
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

  const positionOf = (snapshot: MatchBearingSnapshot, positionKey: string) =>
    snapshot.match.unified.board.positions.find(
      (position) => position.positionKey === positionKey,
    )!;

  it('creates a fully configured Match that opens on its board', async () => {
    const { sessionId, teamIds } = await startSession();
    const created = await createUnified(sessionId);

    expect(created.match.setupMode).toBe(MatchSetupMode.UNIFIED_PRECONFIGURED);
    expect(created.match.status).toBe(MatchStatus.ACTIVE);
    expect(created.match.revision).toBe(0);
    // Straight to the board: no coin-toss, world-selection, or scope-selection
    // stage was ever entered, and no such command was sent.
    expect(created.match.stage.key).toBe(MatchStage.BOARD);
    expect(created.match.availableActions).toEqual([
      'match:launch-challenge',
      'match:cancel',
    ]);
    // The toss is settled server-side and simply reported.
    expect(created.match.coinToss.status).toBe('resolved');
    expect(teamIds).toContain(created.match.coinToss.winnerTeamId);
    expect(created.match.unified.selectingTeamId).toBe(
      created.match.coinToss.winnerTeamId,
    );
    expect(matchEvents(sessionId).map((entry) => entry.payload.reason)).toEqual(
      ['created'],
    );

    // Three ordered occurrences, four Scopes each, Anime repeated with a
    // different pool.
    expect(
      created.match.unified.occurrences.map((occurrence) => [
        occurrence.occurrenceIndex,
        occurrence.worldId,
        occurrence.selectedScopeIds.length,
      ]),
    ).toEqual(
      [
        [0, anime.worldId],
        [1, football.worldId],
        [2, anime.worldId],
      ].map(([index, worldId]) => [index, worldId, 4]),
    );
    expect(created.match.unified.occurrences[0].selectedScopeIds).not.toEqual(
      created.match.unified.occurrences[2].selectedScopeIds,
    );

    // Twelve positions, all available, each keyed by occurrence and slot.
    const positions = created.match.unified.board.positions;
    expect(created.match.unified.board.totalPositionCount).toBe(12);
    expect(positions).toHaveLength(12);
    expect(created.match.unified.board.completedPositionCount).toBe(0);
    expect(positions.map((position) => position.positionKey)).toEqual([
      '0#slot_1',
      '0#slot_2',
      '0#slot_3',
      '0#slot_4',
      '1#slot_1',
      '1#slot_2',
      '1#slot_3',
      '1#slot_4',
      '2#slot_1',
      '2#slot_2',
      '2#slot_3',
      '2#slot_4',
    ]);
    expect(
      positions.every(
        (position) => position.status === MatchSlotStatus.AVAILABLE,
      ),
    ).toBe(true);
    // Only the canonical RYO mechanic has a launcher; the rest say so honestly.
    expect(
      positions.filter((position) => position.launchability === 'launchable')
        .length,
    ).toBe(3);
    expect(positionOf(created, '2#slot_2').challengeKey).toBe(RYO_MODE_KEY);
    // The sequential sections are absent rather than filled with a guess.
    expect(created.match.board).toBeUndefined();
    expect(created.match.currentOccurrence).toBeUndefined();
    expect(created.match.scopeSelection).toBeUndefined();
    // Nothing authoring-only or content-private travels on the snapshot.
    const serialized = JSON.stringify(created.match);
    expect(serialized).not.toContain('contentItemIds');
    expect(serialized).not.toContain('correctOptionId');
    expect(serialized).not.toContain('scoringRuleId');
  });

  it('plays a challenge from the third occurrence first and returns to the board', async () => {
    const { sessionId, participants } = await startSession();
    const created = await createUnified(sessionId);
    const selectingTeamId = created.match.unified.selectingTeamId;

    // Occurrence 2, before occurrence 0 or 1 has been touched at all — and with no
    // ContentItem id in the request: the server draws the content.
    const launched = await launchUnified(sessionId, {
      occurrenceIndex: 2,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      selectingTeamId,
    });
    // What it drew came only from occurrence 2's four Scopes.
    const bound = await boundContentItemIds(
      sessionId,
      2,
      WorldChallengeSlotKey.SLOT_2,
    );
    expect(bound).toHaveLength(3);
    const occurrenceTwoScopeItems = new Set(
      [4, 5, 6, 7].flatMap((scopeIndex) => anime.itemIdsByScope[scopeIndex]),
    );
    const occurrenceZeroScopeItems = new Set(
      [0, 1, 2, 3].flatMap((scopeIndex) => anime.itemIdsByScope[scopeIndex]),
    );
    for (const id of bound) {
      expect(occurrenceTwoScopeItems.has(id)).toBe(true);
      expect(occurrenceZeroScopeItems.has(id)).toBe(false);
    }
    expect(launched.match.stage.key).toBe(MatchStage.CHALLENGE);
    expect(launched.match.currentChallenge).toMatchObject({
      occurrenceIndex: 2,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      challengeKey: RYO_MODE_KEY,
    });
    expect(positionOf(launched, '2#slot_2').status).toBe(
      MatchSlotStatus.IN_PROGRESS,
    );
    // The identically-slotted position of the other Anime occurrence is untouched.
    expect(positionOf(launched, '0#slot_2').status).toBe(
      MatchSlotStatus.AVAILABLE,
    );

    await playRyoItem(sessionId, participants);
    await playRyoItem(sessionId, participants);
    await playRyoItem(sessionId, participants);

    // Nobody sent a "finish" command: the runtime reported it was done.
    const reconciled = await snapshotOf(sessionId);
    expect(reconciled.match.stage.key).toBe(MatchStage.BOARD);
    expect(reconciled.match.status).toBe(MatchStatus.ACTIVE);
    expect(reconciled.match.currentChallenge).toBeUndefined();
    expect(positionOf(reconciled, '2#slot_2').status).toBe(
      MatchSlotStatus.COMPLETED,
    );
    expect(reconciled.match.unified.board.completedPositionCount).toBe(1);
    // The other eleven positions are exactly as they were.
    expect(
      reconciled.match.unified.board.positions.filter(
        (position) => position.status === MatchSlotStatus.AVAILABLE,
      ),
    ).toHaveLength(11);
    expect(positionOf(reconciled, '0#slot_2').status).toBe(
      MatchSlotStatus.AVAILABLE,
    );
    expect(positionOf(reconciled, '1#slot_2').status).toBe(
      MatchSlotStatus.AVAILABLE,
    );
    // Board selection alternated.
    expect(reconciled.match.unified.selectingTeamId).not.toBe(selectingTeamId);
    // No World was "completed" and no interstitial was announced.
    const reasons = matchEvents(sessionId).map((entry) => entry.payload.reason);
    expect(reasons).toEqual([
      'created',
      // Preparing is its own announcement: the clients move to the preflight.
      'challenge-prepared',
      'challenge-launched',
      'challenge-completed',
    ]);
    expect(reasons).not.toContain('world-completed');
    expect(reasons).not.toContain('advanced-to-next-world');
    expect(
      matchEvents(sessionId).map((entry) => entry.payload.stage),
    ).not.toContain(MatchStage.WORLD_COMPLETE);
    // Only occurrence 2 carries the score it produced.
    const totals = reconciled.match.scoring.matchTotals;
    expect(totals.reduce((sum, team) => sum + team.signedTotal, 0)).not.toBe(0);
    expect(
      reconciled.match.unified.occurrences[2].subtotals.reduce(
        (sum, team) => sum + team.signedTotal,
        0,
      ),
    ).not.toBe(0);
    expect(
      reconciled.match.unified.occurrences[0].subtotals.every(
        (team) => team.signedTotal === 0,
      ),
    ).toBe(true);

    // A reload from Mongo restores the same Match, board included.
    const matches = app.get<MatchRepository>(MATCH_REPOSITORY);
    const stored = (await matches.findActiveBySessionId(sessionId))!;
    expect(stored.setupMode).toBe(MatchSetupMode.UNIFIED_PRECONFIGURED);
    expect(stored.stage).toBe(MatchStage.BOARD);
    expect(stored.unifiedBoard()).toHaveLength(12);
    expect(
      stored
        .unifiedBoard()
        .filter((position) => position.status === MatchSlotStatus.COMPLETED)
        .map((position) => position.positionKey),
    ).toEqual(['2#slot_2']);
    expect(stored.selectedScopeIds(2)).toEqual(anime.scopeIds.slice(4, 8));
    expect(stored.selectedScopeIds(0)).toEqual(anime.scopeIds.slice(0, 4));
    const reread = await snapshotOf(sessionId);
    expect(reread.match.unified).toEqual(reconciled.match.unified);
    expect(reread.match.revision).toBe(reconciled.match.revision);

    // The completed position cannot even be prepared again.
    const relaunch = await challengeCommand(
      sessionId,
      'prepare',
      { occurrenceIndex: 2, slotKey: WorldChallengeSlotKey.SLOT_2 },
      400,
    );
    expect((relaunch as unknown as { code: string }).code).toBe(
      'BOARD_SLOT_NOT_AVAILABLE',
    );

    // And the next position is launchable from a different occurrence, with the
    // turn already alternated.
    const second = await launchUnified(sessionId, {
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
      selectingTeamId: reread.match.unified.selectingTeamId,
    });
    expect(second.match.currentChallenge).toMatchObject({
      occurrenceIndex: 0,
      slotKey: WorldChallengeSlotKey.SLOT_2,
    });
    // Its content came from occurrence 0's pool, never occurrence 2's.
    const zeroBound = await boundContentItemIds(
      sessionId,
      0,
      WorldChallengeSlotKey.SLOT_2,
    );
    expect(zeroBound).toHaveLength(3);
    for (const id of zeroBound) {
      expect(occurrenceZeroScopeItems.has(id)).toBe(true);
      expect(occurrenceTwoScopeItems.has(id)).toBe(false);
    }
  });

  describe('the unified launch contract', () => {
    it('refuses a request that names its own ContentItems', async () => {
      const { sessionId } = await startSession();
      const created = await createUnified(sessionId);

      const rejected = await bearer(
        http().post(matchRoute(sessionId, '/unified/challenges/launch')),
      )
        .send({
          commandId: uuid(),
          expectedMatchRevision: created.match.revision,
          occurrenceIndex: 0,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          // The whole point: the client cannot choose what gets played.
          contentItemIds: occurrenceTwoItems(),
        })
        .expect(400);
      expect(JSON.stringify(rejected.body)).toContain('contentItemIds');

      // Nothing was launched.
      const after = await snapshotOf(sessionId);
      expect(after.match.stage.key).toBe(MatchStage.BOARD);
      expect(after.match.revision).toBe(created.match.revision);
    });

    it('draws the same content when the same command is retried', async () => {
      const { sessionId } = await startSession();
      const created = await createUnified(sessionId);
      const position = {
        occurrenceIndex: 1,
        slotKey: WorldChallengeSlotKey.SLOT_2,
      };
      await challengeCommand(sessionId, 'prepare', {
        ...position,
        expectedMatchRevision: created.match.revision,
      });

      // One launch command, sent twice — exactly what a double click or a retried
      // request looks like.
      const commandId = uuid();
      const first = await challengeCommand(sessionId, 'launch', {
        ...position,
        commandId,
      });
      const bound = await boundContentItemIds(
        sessionId,
        1,
        WorldChallengeSlotKey.SLOT_2,
      );
      const replay = await challengeCommand(sessionId, 'launch', {
        ...position,
        commandId,
        expectedMatchRevision: first.match.revision,
      });
      expect(replay.match.revision).toBe(first.match.revision);
      expect(
        await boundContentItemIds(sessionId, 1, WorldChallengeSlotKey.SLOT_2),
      ).toEqual(bound);
      // One runtime, not two.
      expect(replay.match.currentChallenge?.runtimeId).toBe(
        first.match.currentChallenge?.runtimeId,
      );
      expect(
        replay.match.unified.board.positions.filter(
          (position) => position.status === MatchSlotStatus.IN_PROGRESS,
        ),
      ).toHaveLength(1);
    });

    it('rejects a stale expectedMatchRevision with a conflict', async () => {
      const { sessionId } = await startSession();
      const created = await createUnified(sessionId);

      // Preparing bumps the revision; a second command still carrying the
      // creation revision is stale and refused outright with a conflict.
      await challengeCommand(sessionId, 'prepare', {
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_2,
      });
      const stale = await bearer(
        http().post(matchRoute(sessionId, '/unified/challenges/launch')),
      )
        .send({
          commandId: uuid(),
          expectedMatchRevision: created.match.revision,
          occurrenceIndex: 0,
          slotKey: WorldChallengeSlotKey.SLOT_2,
        })
        .expect(409);
      expect(stale.body.code).toBe('MATCH_STALE_REVISION');

      // The board is untouched: the position is still preflight, nothing launched.
      const after = await snapshotOf(sessionId);
      expect(after.match.stage.key).toBe(MatchStage.PREFLIGHT);
      expect(after.match.revision).toBe(created.match.revision + 1);
    });

    it('refuses a launch claimed by the team whose turn it is not', async () => {
      const { sessionId, teamIds } = await startSession();
      const created = await createUnified(sessionId);
      const waiting = teamIds.find(
        (teamId) => teamId !== created.match.unified.selectingTeamId,
      )!;

      const refused = await challengeCommand(
        sessionId,
        'prepare',
        {
          occurrenceIndex: 0,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          selectingTeamId: waiting,
        },
        400,
      );
      expect((refused as unknown as { code: string }).code).toBe(
        'MATCH_SELECTION_OUT_OF_TURN',
      );

      const after = await snapshotOf(sessionId);
      expect(after.match.stage.key).toBe(MatchStage.BOARD);
      expect(after.match.revision).toBe(created.match.revision);
      expect(after.match.unified.board.completedPositionCount).toBe(0);
    });

    it('refuses a position whose mechanic has no launcher', async () => {
      const { sessionId } = await startSession();
      await createUnified(sessionId);

      const refused = await challengeCommand(
        sessionId,
        'prepare',
        { occurrenceIndex: 0, slotKey: WorldChallengeSlotKey.SLOT_1 },
        400,
      );
      expect((refused as unknown as { code: string }).code).toBe(
        'CHALLENGE_NOT_LAUNCHABLE',
      );
    });

    /**
     * `barren` is a real shape a content library can be in: an active World whose
     * board is complete and whose Scopes all hold ready content, but whose content
     * was authored for a different mechanic than the one in this position.
     */
    it('leaves the position available when no playable content exists', async () => {
      const { sessionId } = await startSession();
      const created = await createUnified(sessionId, [
        {
          occurrenceIndex: 0,
          worldId: barren.worldId,
          selectedScopeIds: barren.scopeIds.slice(0, 4),
        },
        {
          occurrenceIndex: 1,
          worldId: football.worldId,
          selectedScopeIds: football.scopeIds.slice(0, 4),
        },
        {
          occurrenceIndex: 2,
          worldId: anime.worldId,
          selectedScopeIds: anime.scopeIds.slice(0, 4),
        },
      ]);
      expect(created.match.unified.board.positions).toHaveLength(12);

      const refused = await launchUnified(
        sessionId,
        { occurrenceIndex: 0, slotKey: WorldChallengeSlotKey.SLOT_2 },
        400,
      );
      expect((refused as unknown as { code: string }).code).toBe(
        'MATCH_INSUFFICIENT_PLAYABLE_CONTENT',
      );

      // No partial challenge state: the position is still available, no content was
      // bound, and no runtime was created. The preflight is still held, so the host
      // can retry or back out — it is their workspace and it consumed nothing.
      const after = await snapshotOf(sessionId);
      expect(after.match.stage.key).toBe(MatchStage.PREFLIGHT);
      expect(after.match.currentChallenge).toBeUndefined();
      expect(positionOf(after, '0#slot_2').status).toBe(
        MatchSlotStatus.AVAILABLE,
      );
      expect(
        await boundContentItemIds(sessionId, 0, WorldChallengeSlotKey.SLOT_2),
      ).toEqual([]);
      expect(after.gameplay).toBeUndefined();

      // Backing out returns to the board with nothing spent.
      const cancelled = await challengeCommand(sessionId, 'cancel');
      expect(cancelled.match.stage.key).toBe(MatchStage.BOARD);
      expect(cancelled.match.unified.board.completedPositionCount).toBe(0);

      // A different occurrence, whose World does have playable content, still works.
      const playable = await launchUnified(sessionId, {
        occurrenceIndex: 2,
        slotKey: WorldChallengeSlotKey.SLOT_2,
      });
      expect(playable.match.currentChallenge).toMatchObject({
        occurrenceIndex: 2,
      });
    });
  });

  it('keeps the two Anime occurrences drawing from their own Scope pools', async () => {
    const { sessionId } = await startSession();
    const created = await createUnified(sessionId);

    // The unified launch route structurally refuses any client-named content, so
    // no request can cross pools or Worlds: content that belongs to the other
    // Anime occurrence, and content from the Football World, are both refused by
    // the DTO before a single Match rule runs.
    for (const items of [
      occurrenceTwoItems(),
      [0, 1, 2].map((scopeIndex) => football.itemIdsByScope[scopeIndex][0]),
    ]) {
      const rejected = await bearer(
        http().post(matchRoute(sessionId, '/unified/challenges/launch')),
      )
        .send({
          commandId: uuid(),
          expectedMatchRevision: created.match.revision,
          occurrenceIndex: 0,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          // The whole point: the client cannot choose what gets played.
          contentItemIds: items,
        })
        .expect(400);
      expect(JSON.stringify(rejected.body)).toContain('contentItemIds');
    }

    // Every refusal left the board untouched.
    const after = await snapshotOf(sessionId);
    expect(after.match.stage.key).toBe(MatchStage.BOARD);
    expect(after.match.revision).toBe(created.match.revision);
    expect(after.match.unified.board.completedPositionCount).toBe(0);
  });

  it('leaves the legacy sequential setup routes dead', async () => {
    const { sessionId } = await startSession();
    const created = await createUnified(sessionId);

    // Phase 5 removed the whole sequential surface: none of these routes exist,
    // so each one 404s as if it never did — a client can no longer drive the
    // legacy journey at all.
    for (const [path, body] of [
      ['/create', {}],
      ['/start', {}],
      ['/coin-toss', {}],
      ['/worlds', {}],
      ['/worlds/select', { worldId: anime.worldId, method: 'agreed' }],
      [
        '/scopes/select',
        { occurrenceIndex: 0, scopeIds: anime.scopeIds.slice(0, 4) },
      ],
      ['/worlds/continue', {}],
    ] as Array<[string, Record<string, unknown>]>) {
      await bearer(http().post(matchRoute(sessionId, path)))
        .send({
          commandId: uuid(),
          expectedMatchRevision: created.match.revision,
          ...body,
        })
        .expect(404);
    }
    const after = await snapshotOf(sessionId);
    expect(after.match.revision).toBe(created.match.revision);
    expect(after.match.stage.key).toBe(MatchStage.BOARD);
  });

  describe('a configuration that does not validate', () => {
    const countMatches = (sessionId: string) =>
      database
        .collection('matches')
        .countDocuments({ liveSessionId: sessionId });

    it('writes no Match when a Scope belongs to another World', async () => {
      const { sessionId } = await startSession();
      const crossWorld = configuration();
      crossWorld[0].selectedScopeIds = [
        ...anime.scopeIds.slice(0, 3),
        football.scopeIds[0],
      ];

      const response = await bearer(
        http().post(matchRoute(sessionId, '/unified')),
      )
        .send({ occurrences: crossWorld })
        .expect(400);
      expect(response.body.code).toBe('SCOPE_NOT_IN_OCCURRENCE_WORLD');

      // Nothing at all was persisted: not a draft, not a partial Match.
      expect(await countMatches(sessionId)).toBe(0);
      await bearer(http().get(matchRoute(sessionId))).expect(404);
      expect(matchEvents(sessionId)).toEqual([]);
    });

    it('writes no Match for a wrong occurrence or Scope count', async () => {
      const { sessionId } = await startSession();
      await bearer(http().post(matchRoute(sessionId, '/unified')))
        .send({ occurrences: configuration().slice(0, 2) })
        .expect(400);

      const threeScopes = configuration();
      threeScopes[1].selectedScopeIds = football.scopeIds.slice(0, 3);
      await bearer(http().post(matchRoute(sessionId, '/unified')))
        .send({ occurrences: threeScopes })
        .expect(400);

      const duplicatedScope = configuration();
      duplicatedScope[1].selectedScopeIds = [
        football.scopeIds[0],
        football.scopeIds[0],
        football.scopeIds[1],
        football.scopeIds[2],
      ];
      const duplicate = await bearer(
        http().post(matchRoute(sessionId, '/unified')),
      )
        .send({ occurrences: duplicatedScope })
        .expect(400);
      expect(duplicate.body.code).toBe('SCOPE_SELECTION_DUPLICATED');

      const badIndexes = configuration();
      badIndexes[2].occurrenceIndex = 1;
      const indexes = await bearer(
        http().post(matchRoute(sessionId, '/unified')),
      )
        .send({ occurrences: badIndexes })
        .expect(400);
      expect(indexes.body.code).toBe('UNIFIED_OCCURRENCE_INDEX_DUPLICATED');

      expect(await countMatches(sessionId)).toBe(0);
    });

    it('writes no Match for a World that is not selectable', async () => {
      const { sessionId } = await startSession();
      const missingWorld = configuration();
      missingWorld[1].worldId = 'ffffffffffffffffffffffff';
      await bearer(http().post(matchRoute(sessionId, '/unified')))
        .send({ occurrences: missingWorld })
        .expect(404);

      expect(await countMatches(sessionId)).toBe(0);
    });

    it('refuses a second Match rather than discarding the configuration', async () => {
      const { sessionId } = await startSession();
      await createUnified(sessionId);
      const second = await bearer(
        http().post(matchRoute(sessionId, '/unified')),
      )
        .send({ occurrences: configuration() })
        .expect(400);
      expect(second.body.code).toBe('MATCH_ALREADY_IN_PROGRESS');
      expect(await countMatches(sessionId)).toBe(1);
    });
  });

  it('is authenticated and controller-only', async () => {
    const { sessionId } = await startSession();
    await http()
      .post(matchRoute(sessionId, '/unified'))
      .send({ occurrences: configuration() })
      .expect(401);

    const otherToken = await loginForToken(app, fixtureCredentials.user);
    const forbidden = await http()
      .post(matchRoute(sessionId, '/unified'))
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ occurrences: configuration() })
      .expect(403);
    expect(forbidden.body.code).toBe('MATCH_FORBIDDEN');
    expect(
      await database
        .collection('matches')
        .countDocuments({ liveSessionId: sessionId }),
    ).toBe(0);
  });

  /**
   * The pre-match setup journey: a host configures a whole Match before anybody
   * is in the room, so the session has to reach `active` with two teams and no
   * phone participants at all. Phones join later, during challenge preflight.
   */
  it('creates a Match over HTTP with two teams and no participants', async () => {
    const created = unwrap<{
      snapshot: LiveGameSessionSnapshot;
      reconnectToken: string;
    }>(
      await bearer(http().post('/live-game-sessions'))
        .send({
          modeKey: 'core-timed-turns',
          modeVersion: 1,
          teamNames: ['البنفسجي', 'الأخضر'],
        })
        .expect(201),
    );
    const sessionId = created.snapshot.sessionId;
    const players = (snapshot: LiveGameSessionSnapshot) =>
      snapshot.participants.filter(
        (participant) => participant.role === 'team-player',
      );
    // The host itself is enrolled as the controller; no phone player exists.
    expect(created.snapshot.participants.map((entry) => entry.role)).toEqual([
      'controller',
    ]);
    expect(players(created.snapshot)).toHaveLength(0);
    expect(created.snapshot.teams).toHaveLength(2);

    const lifecycle = async (path: string) => {
      const current = unwrap<{ revision: number }>(
        await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(
          200,
        ),
      );
      return unwrap<LiveGameSessionSnapshot>(
        await bearer(http().post(`/live-game-sessions/${sessionId}/${path}`))
          .send({
            commandId: crypto.randomUUID(),
            expectedRevision: current.revision,
          })
          .expect(201),
      );
    };
    // Both lifecycle steps are reachable over HTTP, with no socket and no phones.
    expect((await lifecycle('ready')).status).toBe('ready');
    expect((await lifecycle('start')).status).toBe('active');

    const match = await createUnified(sessionId);
    expect(match.match.setupMode).toBe(MatchSetupMode.UNIFIED_PRECONFIGURED);
    expect(match.match.stage.key).toBe(MatchStage.BOARD);
    expect(match.match.unified.occurrences).toHaveLength(3);
    expect(match.match.unified.board.positions).toHaveLength(12);
    // Still no phone in the room, and the board is already open.
    expect(
      players(
        unwrap<LiveGameSessionSnapshot>(
          await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(
            200,
          ),
        ),
      ),
    ).toHaveLength(0);
  });

  it('is not reachable through the development alias', async () => {
    const { sessionId } = await startSession();
    await bearer(http().post(matchRoute(sessionId, '/development/unified')))
      .send({ occurrences: configuration() })
      .expect(404);
  });
});
