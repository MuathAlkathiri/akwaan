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
import { productionMechanicFixture } from '../fixtures/production-mechanic.fixture';
import {
  MatchSetupMode,
  MatchSlotStatus,
  MatchStage,
  MatchStatus,
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
 * One live session is configured completely before gameplay and the Match opens
 * on its board; then an explicit RYO challenge binds a board position to the
 * mechanic's own runtime, the mechanic runs untouched, and the Match learns it
 * finished from the runtime rather than from a controller command. The
 * controller-owned launch route (`POST .../match/challenges/launch`) is the
 * legacy-free survivor this spec uniquely exercises: it accepts the caller's
 * own ContentItem ids, still validated against the occurrence's Scope pool.
 */
type MatchBearingSnapshot = LiveGameSessionSnapshot & {
  match: NonNullable<LiveGameSessionSnapshot['match']> & {
    unified: NonNullable<
      NonNullable<LiveGameSessionSnapshot['match']>['unified']
    >;
  };
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
      ...productionMechanicFixture(RYO_MODE_KEY),
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
      await presence.connected(
        sessionId,
        joined.participantId,
        // One simulated socket per participant. Presence is keyed by
        // connection now, so a test phone needs an identity like a real one.
        `test-socket-${joined.participantId}`,
      );
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

  /**
   * Three occurrences of the one seeded World, each drawing from the same four
   * Scopes. The fifth Scope stays out of the pool so a launch can prove content
   * outside it is refused.
   */
  const configuration = () =>
    [0, 1, 2].map((occurrenceIndex) => ({
      occurrenceIndex,
      worldId,
      selectedScopeIds: scopeIds.slice(0, 4),
    }));

  /** The one way a Match is created now: a complete preconfigured setup. */
  const createUnified = async (sessionId: string, expected = 201) =>
    unwrap<MatchBearingSnapshot>(
      await bearer(http().post(matchRoute(sessionId, '/unified')))
        .send({ occurrences: configuration() })
        .expect(expected),
    );

  /** The board position `occurrence#slotKey`, with its own launchability. */
  const position = (
    match: MatchBearingSnapshot['match'],
    occurrenceIndex: number,
    slotKey: WorldChallengeSlotKey,
  ) =>
    match.unified.board.positions.find(
      (candidate) => candidate.positionKey === `${occurrenceIndex}#${slotKey}`,
    )!;

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

  it('drives a Match from an empty session to a bound RYO challenge', async () => {
    const { sessionId, teamIds } = await startSession();

    const created = await createUnified(sessionId);
    expect(created.match).toMatchObject({
      setupMode: MatchSetupMode.UNIFIED_PRECONFIGURED,
      status: MatchStatus.ACTIVE,
      revision: 0,
      stage: { key: MatchStage.BOARD },
      coinToss: { status: 'resolved' },
    });
    // Stage presentation is served, so no client invents timings.
    expect(created.match.stage).toMatchObject({
      minimumDisplayDurationMs: 0,
      audioCue: 'board-enter',
      animationCue: 'board-reveal',
    });
    expect(teamIds).toContain(created.match.coinToss.winnerTeamId);
    // The coin toss winner chooses the first position.
    expect(created.match.unified.selectingTeamId).toBe(
      created.match.coinToss.winnerTeamId,
    );
    expect(created.match.availableActions).toEqual([
      'match:launch-challenge',
      'match:cancel',
    ]);
    // Three occurrences, one board of twelve independently playable positions.
    expect(created.match.unified.occurrences).toHaveLength(3);
    expect(created.match.unified.board.positions).toHaveLength(12);

    // Every configured position is reported, including the three with no launcher.
    const launchabilityBySlot = [
      WorldChallengeSlotKey.SLOT_1,
      WorldChallengeSlotKey.SLOT_2,
      WorldChallengeSlotKey.SLOT_3,
      WorldChallengeSlotKey.SLOT_4,
    ].map((slotKey) => [
      slotKey,
      position(created.match, 0, slotKey).launchability,
    ]);
    expect(launchabilityBySlot).toEqual([
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
        expectedMatchRevision: created.match.revision,
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
      position(launched.match, 0, WorldChallengeSlotKey.SLOT_2).status,
    ).toBe(MatchSlotStatus.IN_PROGRESS);
  });

  it('completes the challenge from the runtime and imports its scores once', async () => {
    const { sessionId, participants } = await startSession();
    await createUnified(sessionId);
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

    // Nobody sent a "finish challenge" command: the runtime said it was done —
    // and the Match stopped on its result instead of returning to the board.
    const resolved = await snapshotOf(sessionId);
    expect(resolved.match.stage.key).toBe(MatchStage.CHALLENGE_RESULT);
    expect(resolved.match.challengeResult).toMatchObject({
      challengeKey: 'read-your-opponent',
    });
    expect(resolved.match.challengeHistory).toHaveLength(1);
    await command(sessionId, '/unified/challenges/continue');
    const reconciled = await snapshotOf(sessionId);
    expect(reconciled.match.stage.key).toBe(MatchStage.BOARD);
    expect(reconciled.match.currentChallenge).toBeUndefined();
    const slot = position(reconciled.match, 0, WorldChallengeSlotKey.SLOT_2);
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
      'challenge-launched',
      'challenge-completed',
      // Leaving the result is its own announced transition, because it is its
      // own authoritative stage change rather than a client-side dismissal.
      'result-acknowledged',
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
    const created = await createUnified(sessionId);

    // Content from a Scope that was not selected is refused outright.
    const outside = await bearer(
      http().post(matchRoute(sessionId, '/challenges/launch')),
    )
      .send({
        commandId: uuid(),
        expectedMatchRevision: created.match.revision,
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

  it('rejects stale revisions, replays, and non-controller callers', async () => {
    const { sessionId } = await startSession();
    const created = await createUnified(sessionId);

    // A replayed command id is accepted and changes nothing.
    const commandId = uuid();
    const first = unwrap<MatchBearingSnapshot>(
      await bearer(http().post(matchRoute(sessionId, '/challenges/launch')))
        .send({
          commandId,
          expectedMatchRevision: created.match.revision,
          occurrenceIndex: 0,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          contentItemIds,
        })
        .expect(201),
    );
    const replay = unwrap<MatchBearingSnapshot>(
      await bearer(http().post(matchRoute(sessionId, '/challenges/launch')))
        .send({
          commandId,
          expectedMatchRevision: first.match.revision,
          occurrenceIndex: 0,
          slotKey: WorldChallengeSlotKey.SLOT_2,
          contentItemIds,
        })
        .expect(201),
    );
    expect(replay.match.revision).toBe(first.match.revision);

    // A stale revision is refused outright.
    await bearer(http().post(matchRoute(sessionId, '/cancel')))
      .send({ commandId: uuid(), expectedMatchRevision: 0 })
      .expect(409);

    // A different authenticated user is not this session's controller.
    const otherToken = await loginForToken(app, fixtureCredentials.user);
    await http()
      .post(matchRoute(sessionId, '/challenges/launch'))
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        commandId: uuid(),
        expectedMatchRevision: first.match.revision,
        occurrenceIndex: 0,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        contentItemIds,
      })
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
    await createUnified(sessionId);

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

    expect(snapshot.match?.stage.key).toBe(MatchStage.BOARD);
    expect(snapshot.match?.availableActions).toEqual([]);
    // Nothing a participant must not know reaches the projection.
    expect(JSON.stringify(snapshot.match)).not.toContain('scoreEvent');
  });
});
