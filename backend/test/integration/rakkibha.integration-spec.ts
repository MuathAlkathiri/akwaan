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
  RAKKIBHA_SLUG,
  RAKKIBHA_TIMER_SECONDS,
  RAKKIBHA_VARIANT,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../../src/modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../../src/modules/scoring/domain/scoring-rule';
import { productionMechanicFixture } from '../fixtures/production-mechanic.fixture';
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
import { GetGameplayRuntime } from '../../src/modules/live-game-sessions/application/gameplay-runtime.queries';
import { GameplayDeadlineScheduler } from '../../src/modules/live-game-sessions/application/gameplay-deadline.scheduler';
import { SubmitGameplayCommand } from '../../src/modules/live-game-sessions/application/submit-gameplay-command.use-case';
import {
  GameplayRuntimeRepository,
  GAMEPLAY_RUNTIME_REPOSITORY,
} from '../../src/modules/live-game-sessions/domain/gameplay-runtime.repository';
import { GameplayRuntimeState } from '../../src/modules/live-game-sessions/domain/gameplay-runtime';

type Phone = LiveSessionActor & { teamId: string; connectionId: string };
type ModeState = Record<string, string | number | boolean | null>;

describe('Rakkibha race integration', () => {
  let app: INestApplication;
  let database: Connection;
  let token: string;
  let controllerId: string;
  let worldId: string;
  let contentItemIds: string[];

  const uuid = () => crypto.randomUUID();
  const http = () => request(app.getHttpServer());
  const bearer = <T extends request.Test>(value: T): T =>
    value.set('Authorization', `Bearer ${token}`) as T;
  const unwrap = <T>(response: request.Response): T =>
    (response.body?.data ?? response.body) as T;
  const sessionRevision = async (sessionId: string) =>
    unwrap<{ revision: number }>(
      await bearer(http().get(`/live-game-sessions/${sessionId}`)).expect(200),
    ).revision;
  const runtimeRepository = () =>
    app.get<GameplayRuntimeRepository>(GAMEPLAY_RUNTIME_REPOSITORY);
  const runtimeState = async (sessionId: string) =>
    (await runtimeRepository().findBySessionId(sessionId))!.serialize();
  const viewOf = async (sessionId: string, actor: LiveSessionActor) =>
    (await app.get(GetGameplayRuntime).execute(sessionId, actor)).gameplay!
      .modeState as ModeState;

  beforeAll(async () => {
    database = await connectTestDatabase('rakkibha');
    await resetTestDatabase(database);
    await seedIntegrationFixtures(database);
    app = await createIntegrationTestApp({
      env: { MONGODB_URI: isolatedTestDatabaseUri('rakkibha') },
    });
    token = await loginForToken(app, fixtureCredentials.admin);
    controllerId = String(
      unwrap<{ id: string }>(await bearer(http().get('/auth/me')).expect(200))
        .id,
    );
    ({ worldId, contentItemIds } = await seedWorld());
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await resetTestDatabase(database);
    await database?.close();
  });

  async function seedWorld() {
    const presentation = {
      inputType: 'phone-text',
      timerSeconds: RAKKIBHA_TIMER_SECONDS,
      soundPack: null,
      revealStyle: null,
    };
    const challengeType = async (body: Record<string, unknown>) =>
      unwrap<{ id: string }>(
        await bearer(http().post('/admin/challenge-types'))
          .send({ ...body, defaultPresentation: presentation })
          .expect(201),
      );
    const rakkibha = await challengeType({
      ...productionMechanicFixture(RAKKIBHA_SLUG),
      status: WorldContentStatus.ACTIVE,
    });
    const filler = await Promise.all([
      challengeType({
        name: 'فاصل ريو',
        slug: `rakkibha-filler-ryo-${Date.now()}`,
        family: ChallengeFamily.RYO,
        itemStructure: 'discrete_triple',
        answerMode: ChallengeAnswerMode.RYO,
        scoringRuleId: SCORING_RULE_IDS.RYO_PAYOFF_MATRIX,
        status: WorldContentStatus.ACTIVE,
      }),
      challengeType({
        name: 'فاصل تصويت',
        slug: `rakkibha-filler-vote-${Date.now()}`,
        family: ChallengeFamily.RELATIONAL,
        itemStructure: 'discrete_triple',
        answerMode: ChallengeAnswerMode.VOTE,
        scoringRuleId: SCORING_RULE_IDS.RELATIONAL_ITEM_SUCCESS,
        status: WorldContentStatus.ACTIVE,
      }),
      challengeType({
        name: 'فاصل توقيع',
        slug: `rakkibha-filler-signature-${Date.now()}`,
        family: ChallengeFamily.SIGNATURE,
        itemStructure: 'continuous',
        answerMode: ChallengeAnswerMode.MATCH,
        scoringRuleId: SCORING_RULE_IDS.SIGNATURE_DECLARED_BY_MECHANIC,
        status: WorldContentStatus.ACTIVE,
      }),
    ]);
    const world = unwrap<{ id: string }>(
      await bearer(http().post('/admin/worlds'))
        .send({ name: 'عالم ركّبها', slug: `rakkibha-${Date.now()}` })
        .expect(201),
    );
    const scopes: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const scope = unwrap<{ id: string }>(
        await bearer(http().post(`/admin/worlds/${world.id}/scopes`))
          .send({
            name: `لغز ${index}`,
            slug: `rakkibha-scope-${Date.now()}-${index}`,
            status: WorldContentStatus.ACTIVE,
          })
          .expect(201),
      );
      scopes.push(scope.id);
    }
    for (const [index, challengeTypeId] of [
      rakkibha.id,
      ...filler.map((entry) => entry.id),
    ].entries()) {
      await bearer(
        http().post(`/admin/worlds/${world.id}/challenge-configurations`),
      )
        .send({
          challengeTypeId,
          slotKey: `slot_${index + 1}`,
          isEnabled: true,
          sortOrder: index,
        })
        .expect(201);
    }
    const items: string[] = [];
    for (const [index, scopeId] of scopes.entries()) {
      const created = unwrap<{ id: string }>(
        await bearer(http().post('/admin/content-items'))
          .send({
            scopeId,
            prompt: { ar: `لغز بصري ${index}` },
            compatibleChallengeTypeIds: [rakkibha.id],
            answerPayload: {
              mode: ChallengeAnswerMode.MATCH,
              acceptedAnswers: [`answer-${index}`],
            },
            mechanicPayload: {
              variant: RAKKIBHA_VARIANT,
              family: RAKKIBHA_VARIANT,
              instruction: { ar: 'صفوا الشكل ثم اختاروا القطعة المطابقة' },
              reference: {
                media: {
                  type: 'image',
                  assets: [{ url: `/reference-${index}.png` }],
                },
              },
              candidateViews: [
                {
                  id: `true-${index}`,
                  candidates: [
                    {
                      localId: 'one',
                      canonicalIdentity: `true-${index}`,
                      media: {
                        type: 'image',
                        assets: [{ url: `/true-${index}-1.png` }],
                      },
                    },
                    {
                      localId: 'two',
                      canonicalIdentity: `wrong-${index}-1`,
                      media: {
                        type: 'image',
                        assets: [{ url: `/true-${index}-2.png` }],
                      },
                    },
                  ],
                },
                {
                  id: `distractor-${index}`,
                  candidates: [
                    {
                      localId: 'one',
                      canonicalIdentity: `wrong-${index}-2`,
                      media: {
                        type: 'image',
                        assets: [{ url: `/wrong-${index}-1.png` }],
                      },
                    },
                    {
                      localId: 'two',
                      canonicalIdentity: `wrong-${index}-3`,
                      media: {
                        type: 'image',
                        assets: [{ url: `/wrong-${index}-2.png` }],
                      },
                    },
                  ],
                },
              ],
              correctCanonicalIdentity: `true-${index}`,
              supportedTeamSizes: [2, 3],
              authorSafetyConfirmation: true,
            },
            status: ContentItemStatus.READY,
          })
          .expect(201),
      );
      items.push(created.id);
    }
    await bearer(http().patch(`/admin/worlds/${world.id}`))
      .send({ status: WorldContentStatus.ACTIVE })
      .expect(200);
    return { worldId: world.id, scopeIds: scopes, contentItemIds: items };
  }

  async function startSession(playersPerTeam: 2 | 3) {
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
    const access = await app.get(CreateSessionJoinAccess).execute({
      sessionId,
      actorId: controllerId,
      assignmentPolicy: 'explicit',
    });
    const join = app.get(JoinLiveSession);
    const readiness = app.get(SetParticipantReadiness);
    const presence = app.get(UpdateParticipantPresence);
    const players: Phone[] = [];
    for (const teamId of created.teams.map((team) => team.id)) {
      for (let seat = 0; seat < playersPerTeam; seat += 1) {
        const joined = await join.execute({
          joinCode: access.joinCode,
          displayName: `${teamId}-${seat}`,
          requestedTeamId: teamId,
          joinRequestId: uuid(),
        });
        const connectionId = `rakkibha-${joined.participantId}`;
        await presence.connected(sessionId, joined.participantId, connectionId);
        const actor: Phone = {
          kind: 'participant',
          actorId: joined.participantId,
          sessionId,
          participantId: joined.participantId,
          role: 'team-player',
          credentialVersion: 1,
          teamId,
          connectionId,
        };
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
    return {
      sessionId,
      teamIds: created.teams.map((team) => team.id),
      players,
    };
  }

  // Launch Rakkibha but stop BEFORE the surface acknowledges it can present: the
  // puzzles are selected and reserved, yet no private view is projected and the
  // race clock is not armed — the fair-start pre-activation window.
  async function launchRakkibha(sessionId: string) {
    const started = unwrap<LiveGameSessionSnapshot>(
      await bearer(
        http().post(
          `/live-game-sessions/${sessionId}/runtime/development/rakkibha/start`,
        ),
      )
        .send({
          worldId,
          slotKey: WorldChallengeSlotKey.SLOT_1,
          contentItemIds: contentItemIds.slice(0, 3),
        })
        .expect(201),
    );
    return started;
  }

  // Fair-start acknowledgement: the presenting surface adopts this runtime, which
  // anchors the race clock to now and reveals each private view to its holder.
  async function present(sessionId: string) {
    const runtime = await runtimeState(sessionId);
    await bearer(
      http().post(
        `/live-game-sessions/${sessionId}/runtime/presentation-ready`,
      ),
    )
      .send({
        commandId: uuid(),
        expectedSessionRevision: await sessionRevision(sessionId),
        expectedRuntimeRevision: runtime.revision,
      })
      .expect(201);
  }

  // The normal path every gameplay test starts from: launched AND presented, so
  // the race is live and behaves exactly as it always has post-launch.
  async function launch(sessionId: string) {
    const started = await launchRakkibha(sessionId);
    await present(sessionId);
    return started;
  }

  async function submit(
    sessionId: string,
    actor: Phone,
    contentItemId: string,
    localCandidateId: string,
    commandId = uuid(),
  ) {
    const runtime = await runtimeState(sessionId);
    return app.get(SubmitGameplayCommand).execute({
      sessionId,
      actor,
      commandId,
      expectedSessionRevision: await sessionRevision(sessionId),
      expectedRuntimeRevision: runtime.revision,
      roundId: runtime.activeRound!.id,
      commandType: 'submit-candidate',
      payload: { contentItemId, localCandidateId },
    });
  }

  function currentAssignment(session: GameplayRuntimeState, teamId: string) {
    const state = JSON.parse(String(session.runtimeState.plansJson)) as Array<{
      teamId: string;
      participantIds: string[];
      order: number[];
      assignments: Array<
        Array<{
          participantId: string;
          hasReference: boolean;
          candidateViewId?: string;
        }>
      >;
    }>;
    const puzzles = JSON.parse(
      String(session.runtimeState.puzzlesJson),
    ) as Array<{ contentItemId: string; correctCanonicalIdentity: string }>;
    const progress = JSON.parse(
      String(session.runtimeState.progressJson),
    ) as Array<{ teamId: string; solved: number }>;
    const plan = state.find((entry) => entry.teamId === teamId)!;
    const solved = progress.find((entry) => entry.teamId === teamId)!.solved;
    const puzzleIndex = plan.order[solved];
    return {
      puzzle: puzzles[puzzleIndex],
      assignments: plan.assignments[solved],
    };
  }

  it('keeps private roles, actor-local correctness, penalty, progression, and reconnect stable for three players', async () => {
    const { sessionId, teamIds, players } = await startSession(3);
    const alpha = players.filter((player) => player.teamId === teamIds[0]);
    await launch(sessionId);
    const started = await runtimeState(sessionId);
    const assignment = currentAssignment(started, teamIds[0]);
    const reference = assignment.assignments.find(
      (entry) => entry.hasReference,
    )!;
    const candidates = assignment.assignments.filter(
      (entry) => !entry.hasReference,
    );
    expect(reference.candidateViewId).toBeUndefined();
    expect(candidates).toHaveLength(2);
    const views = await Promise.all(
      alpha.map((player) => viewOf(sessionId, player)),
    );
    expect(views.filter((view) => view.hasReference === true)).toHaveLength(1);
    expect(views.filter((view) => view.myCandidatesJson).length).toBe(2);
    const trueHolder = candidates.find((entry) =>
      entry.candidateViewId?.startsWith('true-'),
    )!;
    const distractor = candidates.find(
      (entry) => entry.participantId !== trueHolder.participantId,
    )!;
    const distractorActor = alpha.find(
      (player) => player.participantId === distractor.participantId,
    )!;
    const trueActor = alpha.find(
      (player) => player.participantId === trueHolder.participantId,
    )!;
    const puzzle = assignment.puzzle;
    const wrongCommandId = 'rakkibha-wrong-once';
    const wrong = await submit(
      sessionId,
      distractorActor,
      puzzle.contentItemId,
      'one',
      wrongCommandId,
    );
    expect(
      JSON.parse(String(wrong.gameplay!.modeState.progressJson)).find(
        (entry: { teamId: string }) => entry.teamId === teamIds[0],
      ),
    ).toMatchObject({ solved: 0, wrongAttempts: 1 });
    const duplicateWrong = await submit(
      sessionId,
      distractorActor,
      puzzle.contentItemId,
      'one',
      wrongCommandId,
    );
    expect(
      JSON.parse(String(duplicateWrong.gameplay!.modeState.progressJson)).find(
        (entry: { teamId: string }) => entry.teamId === teamIds[0],
      ),
    ).toMatchObject({ solved: 0, wrongAttempts: 1 });
    const reconnect = await viewOf(sessionId, trueActor);
    expect(await viewOf(sessionId, trueActor)).toEqual(reconnect);
    await new Promise((resolve) => setTimeout(resolve, 5_100));
    await submit(sessionId, trueActor, puzzle.contentItemId, 'one');
    expect((await viewOf(sessionId, trueActor)).mySolved).toBe(1);
    for (let position = 1; position < 3; position += 1) {
      const next = currentAssignment(await runtimeState(sessionId), teamIds[0]);
      const nextTrueHolder = next.assignments.find((entry) =>
        entry.candidateViewId?.startsWith('true-'),
      )!;
      const nextActor = alpha.find(
        (player) => player.participantId === nextTrueHolder.participantId,
      )!;
      await submit(sessionId, nextActor, next.puzzle.contentItemId, 'one');
    }
    const finished = await runtimeState(sessionId);
    expect(finished.runtimeState.phase).toBe('completed');
    expect(
      JSON.parse(String(finished.runtimeState.scoreEventsJson)),
    ).toHaveLength(1);
    expect(
      JSON.parse(String(finished.runtimeState.progressJson)).find(
        (entry: { teamId: string }) => entry.teamId === teamIds[0],
      ),
    ).toMatchObject({ solved: 3, wrongAttempts: 1 });
  }, 120_000);

  it('never gives a two-player reference holder any candidates', async () => {
    const { sessionId, teamIds, players } = await startSession(2);
    await launch(sessionId);
    const state = await runtimeState(sessionId);
    const assignment = currentAssignment(state, teamIds[0]);
    const alpha = players.filter((player) => player.teamId === teamIds[0]);
    const reference = assignment.assignments.find(
      (entry) => entry.hasReference,
    )!;
    const referenceView = await viewOf(
      sessionId,
      alpha.find((player) => player.participantId === reference.participantId)!,
    );
    expect(referenceView.myReferenceJson).toBeDefined();
    expect(referenceView.myCandidatesJson).toBeUndefined();
    expect(
      assignment.assignments.filter((entry) => !entry.hasReference),
    ).toHaveLength(1);
  }, 120_000);

  it('fair-start: hides every private view and arms no clock until activation, then reveals only to the right holder', async () => {
    const scheduler = () => app.get(GameplayDeadlineScheduler);
    const { sessionId, teamIds, players } = await startSession(3);
    await launchRakkibha(sessionId); // launched, NOT presented

    // Server: not activated, race clock not armed.
    const raw = await runtimeState(sessionId);
    expect(raw.presentationActivatedAt ?? null).toBeNull();
    expect(scheduler().armedKeyFor(sessionId)).toBeFalsy();

    // Roles come from the persisted plan (the plan exists; only its projection is
    // gated), so we can pick a reference holder and a candidate holder to inspect.
    const assignment = currentAssignment(raw, teamIds[0]);
    const refEntry = assignment.assignments.find(
      (entry) => entry.hasReference,
    )!;
    const candEntry = assignment.assignments.find(
      (entry) => !entry.hasReference,
    )!;
    const refActor = players.find(
      (player) => player.participantId === refEntry.participantId,
    )!;
    const candActor = players.find(
      (player) => player.participantId === candEntry.participantId,
    )!;
    const sharedActor: LiveSessionActor = {
      kind: 'user',
      actorId: controllerId,
    };

    // Client: every surface — reference holder, candidate holder, and the shared
    // screen — sees only that it is preparing. Nothing private, no identity.
    for (const actor of [refActor, candActor, sharedActor]) {
      const view = await viewOf(sessionId, actor);
      expect(
        (view as { awaitingPresentation?: boolean }).awaitingPresentation,
      ).toBe(true);
      const json = JSON.stringify(view);
      for (const secret of [
        'myReferenceJson',
        'myCandidatesJson',
        'canonicalIdentity',
        'contentItemId',
        'instruction',
      ]) {
        expect(json).not.toContain(secret);
      }
    }

    // Ledger: nothing exposed before activation.
    expect(
      await database
        .collection('content_exposures')
        .countDocuments({ state: 'exposed' }),
    ).toBe(0);

    // --- Activate ---
    await present(sessionId);
    const activated = await runtimeState(sessionId);
    expect(activated.presentationActivatedAt).toBeTruthy();
    const deadline = new Date(
      String(activated.runtimeState.deadlineAt),
    ).getTime();
    const activatedAt = new Date(
      String(activated.presentationActivatedAt),
    ).getTime();
    // The FULL race window, anchored from activation — both the race origin
    // (startedAtMs) and the deadline moved, and the window is unchanged.
    expect(deadline - activatedAt).toBeGreaterThanOrEqual(
      (RAKKIBHA_TIMER_SECONDS - 2) * 1000,
    );
    expect(deadline - activatedAt).toBeLessThanOrEqual(
      RAKKIBHA_TIMER_SECONDS * 1000 + 2000,
    );
    expect(Number(activated.runtimeState.startedAtMs)).toBeGreaterThanOrEqual(
      activatedAt - 2000,
    );
    expect(scheduler().armedKeyFor(sessionId)).toBeTruthy();

    // Private views now appear only to their holders; the identity is never sent.
    const refView = await viewOf(sessionId, refActor);
    const candView = await viewOf(sessionId, candActor);
    const sharedView = await viewOf(sessionId, sharedActor);
    expect(
      (refView as { awaitingPresentation?: boolean }).awaitingPresentation,
    ).toBeUndefined();
    expect(refView.hasReference).toBe(true);
    expect(refView.myReferenceJson).toBeDefined();
    expect(refView.myCandidatesJson).toBeUndefined();
    expect(candView.hasReference).toBe(false);
    expect(candView.myCandidatesJson).toBeDefined();
    expect(candView.myReferenceJson).toBeUndefined();
    for (const view of [refView, candView, sharedView]) {
      expect(JSON.stringify(view)).not.toContain('canonicalIdentity');
    }
    // Shared screen stays neutral: no private holder data at all.
    expect(sharedView.myReferenceJson).toBeUndefined();
    expect(sharedView.myCandidatesJson).toBeUndefined();

    // Reconnect after activation: re-reading never re-activates, re-stamps the
    // clock, or re-exposes — the same private role is served again.
    const reRef = await viewOf(sessionId, refActor);
    const afterReconnect = await runtimeState(sessionId);
    expect(afterReconnect.presentationActivatedAt).toBe(
      activated.presentationActivatedAt,
    );
    expect(afterReconnect.runtimeState.deadlineAt).toBe(
      activated.runtimeState.deadlineAt,
    );
    expect(afterReconnect.runtimeState.startedAtMs).toBe(
      activated.runtimeState.startedAtMs,
    );
    expect(reRef.hasReference).toBe(true);
  }, 120_000);
});
