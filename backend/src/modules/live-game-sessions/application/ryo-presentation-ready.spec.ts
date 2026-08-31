import {
  GameplayTransactionContext,
  GameplayTransactionUnitOfWork,
} from './gameplay-transaction.unit-of-work';
import { PresentationReady } from './gameplay-runtime.lifecycle';
import { LiveSessionClock } from './live-session-clock';
import { LiveSessionTransitionPublisher } from './live-session-transition.publisher';
import { GameplayObserverRegistry } from './gameplay-observer.registry';
import { GameplayDeadlineSynchronizer } from './gameplay-deadline.port';
import { GameplayRuntimeExecutor } from './gameplay-runtime.executor';
import { LiveSessionActor } from './live-session-actor';
import { GameplayRuntime } from '../domain/gameplay-runtime';
import {
  LiveGameSession,
  LiveGameSessionState,
} from '../domain/live-game-session';
import { LiveGameModeRules } from '../domain/live-game-mode.registry';
import { TeamClock } from '../domain/team-clock';
import {
  serializeTeamActionAssignments,
  TeamActionAssignmentState,
} from '../domain/team-action-assignment';
import {
  openRyoItemAssignments,
  RYO_GAMEPLAY_PLUGIN,
  RYO_MODE_KEY,
  RYO_TIMER_SECONDS,
} from '../domain/ryo-gameplay.plugin';
import { GameplayModeState } from '../domain/gameplay-mode.plugin';
import {
  LiveSessionForbiddenError,
  StaleLiveSessionRevisionError,
  StaleGameplayRuntimeRevisionError,
} from '../domain/live-session.errors';

/**
 * The multi-surface presentation acknowledgement use case: for RYO, activation
 * must be held until the shared screen, the assigned answerer, and the assigned
 * decider have all acknowledged over their own socket connections. This spec
 * proves the enforcement the domain cannot — identity/security (who may ack which
 * surface, connection-bound, reassignment-aware), the withhold-until-final-ack
 * barrier, and one-time commit under CAS — with a fake unit of work and a
 * controlled clock, no sleeps, no Mongo.
 */
const LAUNCH = new Date('2026-01-01T00:00:00.000Z');
const SESSION_ID = 'session-1';
const CONTROLLER = 'actor-controller';
const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const ANSWERER_ID = 'p-answerer';
const DECIDER_ID = 'p-decider';
const CONN_SHARED = 'conn-shared';
const CONN_ANSWER = 'conn-answerer';
const CONN_DECISION = 'conn-decider';

const RYO_RULES: LiveGameModeRules = {
  key: RYO_MODE_KEY,
  version: 1,
  initialTeamDurationMs: 120_000,
  minimumTeamCount: 2,
  maximumTeamCount: 2,
  onlyOneClockRuns: true,
  timePersistsBetweenTurns: true,
  expirationMs: 24 * 60 * 60 * 1000,
  defaultJoinPolicy: 'host-assigned',
  readyPlayersRequiredPerTeam: 1,
};

const CONTROLLER_ACTOR: LiveSessionActor = {
  kind: 'user',
  actorId: CONTROLLER,
};

function teamPlayerActor(
  participantId: string,
  role: 'team-player' | 'observer' = 'team-player',
): LiveSessionActor {
  return {
    kind: 'participant',
    actorId: `actor-of-${participantId}`,
    sessionId: SESSION_ID,
    participantId,
    role,
    credentialVersion: 1,
  };
}

const ANSWERER_ACTOR = teamPlayerActor(ANSWERER_ID);
const DECIDER_ACTOR = teamPlayerActor(DECIDER_ID);

const ITEM = (index: number) => ({
  id: `item-${index}`,
  itemIndex: index,
  prompt: { ar: `سؤال ${index + 1}` },
  answerMode: 'multiple_choice',
  correctOptionId: `item-${index}-opt-2`,
  options: [
    { id: `item-${index}-opt-1`, label: { ar: 'خيار ١' } },
    { id: `item-${index}-opt-2`, label: { ar: 'خيار ٢' } },
  ],
});

function openedAssignments(
  deciderId: string,
  deciderTeamId: string,
): TeamActionAssignmentState {
  return openRyoItemAssignments({
    state: {
      rotations: [
        { teamId: TEAM_A, order: [ANSWERER_ID], cursor: 0 },
        { teamId: deciderTeamId, order: [deciderId], cursor: 0 },
      ],
      assignments: [],
      nextSequence: 1,
    },
    answeringTeamId: TEAM_A,
    opposingTeamId: deciderTeamId,
    participants: [
      { participantId: ANSWERER_ID, teamId: TEAM_A, connected: true },
      { participantId: deciderId, teamId: deciderTeamId, connected: true },
    ],
  }).state;
}

function ryoRuntimeState(
  assignments: TeamActionAssignmentState,
): GameplayModeState {
  return RYO_GAMEPLAY_PLUGIN.validateRuntimeState({
    challengeId: 'challenge-1',
    worldId: 'world-1',
    slotKey: 'slot_2',
    currentItemIndex: 0,
    startingTeamId: TEAM_A,
    phase: 'intro',
    itemsJson: JSON.stringify([ITEM(0), ITEM(1), ITEM(2)]),
    teamIdsJson: JSON.stringify([TEAM_A, TEAM_B]),
    scoreEventsJson: '[]',
    resultsJson: '[]',
    teamActionJson: serializeTeamActionAssignments(assignments),
  });
}

function buildRuntime(
  assignments = openedAssignments(DECIDER_ID, TEAM_B),
): GameplayRuntime {
  const built = GameplayRuntime.create({
    id: 'runtime-1',
    sessionId: SESSION_ID,
    plugin: RYO_GAMEPLAY_PLUGIN,
    commandId: 'cmd-runtime-create',
    actorId: CONTROLLER,
    now: LAUNCH,
    expiresAt: new Date(LAUNCH.getTime() + 3_600_000),
    initialState: ryoRuntimeState(assignments),
  });
  built.start('cmd-runtime-start', CONTROLLER, LAUNCH);
  const round = built.createRound(
    { commandId: 'cmd-round-create', actorId: CONTROLLER },
    LAUNCH,
  );
  built.startRound(round.id, 'cmd-round-start', CONTROLLER, LAUNCH);
  const prompt = RYO_GAMEPLAY_PLUGIN.interaction!.preparePrompt(
    {
      sessionId: SESSION_ID,
      runtimeId: 'runtime-1',
      activeTeamId: TEAM_A,
      awaitingPresentationActivation: true,
    },
    {
      itemJson: JSON.stringify(ITEM(0)),
      opposingTeamId: TEAM_B,
      answererParticipantId: ANSWERER_ID,
      deciderParticipantId: DECIDER_ID,
    },
    LAUNCH,
  );
  built.prepareInteraction(prompt, 'cmd-prepare', CONTROLLER, LAUNCH);
  return built;
}

function sessionState(): LiveGameSessionState {
  const clock = TeamClock.create(120_000).serialize();
  return {
    id: SESSION_ID,
    parentGameId: 'game-1',
    parentGameQuestionId: 'game-question-1',
    modeKey: RYO_MODE_KEY,
    modeVersion: 1,
    status: 'active',
    controllerActorId: CONTROLLER,
    teams: [
      {
        id: TEAM_A,
        name: 'الفريق الأول',
        active: true,
        colorId: 'crimson',
        clock,
      },
      {
        id: TEAM_B,
        name: 'الفريق الثاني',
        active: true,
        colorId: 'sky',
        clock,
      },
    ],
    participants: [
      {
        id: 'p-controller',
        actorId: CONTROLLER,
        displayName: 'Host',
        normalizedDisplayName: 'host',
        role: 'controller',
        reconnectTokenHash: 'h1',
        ready: true,
        joinedAt: LAUNCH,
        connected: true,
        connectedDeviceCount: 1,
        lastSeenAt: LAUNCH,
        credentialVersion: 1,
      },
      {
        id: ANSWERER_ID,
        actorId: `actor-of-${ANSWERER_ID}`,
        displayName: 'Answerer',
        normalizedDisplayName: 'answerer',
        role: 'team-player',
        teamId: TEAM_A,
        reconnectTokenHash: 'h2',
        ready: true,
        joinedAt: LAUNCH,
        connected: true,
        connectedDeviceCount: 1,
        lastSeenAt: LAUNCH,
        credentialVersion: 1,
      },
      {
        id: DECIDER_ID,
        actorId: `actor-of-${DECIDER_ID}`,
        displayName: 'Decider',
        normalizedDisplayName: 'decider',
        role: 'team-player',
        teamId: TEAM_B,
        reconnectTokenHash: 'h3',
        ready: true,
        joinedAt: LAUNCH,
        connected: true,
        connectedDeviceCount: 1,
        lastSeenAt: LAUNCH,
        credentialVersion: 1,
      },
    ],
    activeTeamId: TEAM_A,
    currentRound: 1,
    turnHistory: [],
    processedCommandIds: [],
    createdAt: LAUNCH,
    lastTransitionAt: LAUNCH,
    expiresAt: new Date(LAUNCH.getTime() + 24 * 60 * 60 * 1000),
    revision: 5,
  };
}

function buildSession(): LiveGameSession {
  return LiveGameSession.restore(sessionState(), RYO_RULES);
}

interface Harness {
  useCase: PresentationReady;
  session: LiveGameSession;
  runtime: GameplayRuntime;
  snapshot: jest.Mock;
  notifyRuntimeMutated: jest.Mock;
  publishEvent: jest.Mock;
  synchronize: jest.Mock;
  setNow: (date: Date) => void;
}

function makeHarness(overrides?: {
  assignments?: TeamActionAssignmentState;
}): Harness {
  const session = buildSession();
  const runtime = buildRuntime(overrides?.assignments);
  let now = LAUNCH;
  const clock: LiveSessionClock = { now: () => now };
  const snapshot = jest.fn(
    (_s: unknown, _r: unknown, actor: unknown, at: unknown) => ({
      sessionId: SESSION_ID,
      actor,
      at,
    }),
  );
  const executor = {
    snapshot,
  } as unknown as GameplayRuntimeExecutor;
  const notifyRuntimeMutated = jest.fn();
  const publishEvent = jest.fn();
  const synchronize = jest.fn();
  const observers = {
    notifyRuntimeMutated,
    enrichSnapshot: jest.fn(async (value: unknown) => value),
  } as unknown as GameplayObserverRegistry;
  const publisher = {
    publishEvent,
  } as unknown as LiveSessionTransitionPublisher;
  const deadlines = {
    synchronize,
  } as unknown as GameplayDeadlineSynchronizer;

  const unitOfWork: GameplayTransactionUnitOfWork = {
    execute: async (work) => {
      const context = {
        findSession: async () => session,
        findRuntime: async () => runtime,
        saveSession: jest.fn(async () => undefined),
        saveRuntime: jest.fn(async () => undefined),
      } satisfies GameplayTransactionContext;
      return work(context);
    },
  };

  const useCase = new PresentationReady(
    executor,
    unitOfWork,
    clock,
    observers,
    publisher,
    deadlines,
  );

  return {
    useCase,
    session,
    runtime,
    snapshot,
    notifyRuntimeMutated,
    publishEvent,
    synchronize,
    setNow: (date) => {
      now = date;
    },
  };
}

function ack(
  h: Harness,
  actor: LiveSessionActor,
  connectionId: string,
  commandId: string,
) {
  return h.useCase.execute({
    sessionId: SESSION_ID,
    actor,
    commandId,
    expectedRuntimeRevision: h.runtime.revision,
    expectedSessionRevision: h.session.revision,
    connectionId,
  });
}

describe('PresentationReady (RYO multi-surface)', () => {
  describe('surface identity and security enforcement', () => {
    it('maps the controller to the shared surface', async () => {
      const h = makeHarness();
      await ack(h, CONTROLLER_ACTOR, CONN_SHARED, 'cmd-shared');

      const ready = h.runtime.serialize().presentationReady!;
      expect(ready).toEqual([
        { capability: 'shared', connectionId: CONN_SHARED },
      ]);
      expect(h.runtime.serialize().presentationActivatedAt).toBeUndefined();
      expect(h.runtime.serialize().activeRound!.interaction!.status).toBe(
        'prepared',
      );
    });

    it('maps the assigned answerer and decider to the participant surfaces', async () => {
      const h = makeHarness();
      await ack(h, ANSWERER_ACTOR, CONN_ANSWER, 'cmd-answerer');
      await ack(h, DECIDER_ACTOR, CONN_DECISION, 'cmd-decider');
      const ready = h.runtime
        .serialize()
        .presentationReady!.map((entry) => entry.capability);
      expect(ready).toEqual(['answering', 'decision']);
    });

    it('refuses an unassigned team-player (not the current answerer or decider)', async () => {
      const h = makeHarness();
      await expect(
        ack(h, teamPlayerActor('p-other'), 'conn-other', 'cmd-other'),
      ).rejects.toMatchObject({ code: 'PRESENTATION_SURFACE_INVALID' });
      expect(h.runtime.serialize().presentationReady ?? []).toHaveLength(0);
    });

    it('refuses an observer-role participant', async () => {
      const h = makeHarness();
      await expect(
        ack(
          h,
          teamPlayerActor(DECIDER_ID, 'observer'),
          CONN_DECISION,
          'cmd-decider',
        ),
      ).rejects.toMatchObject({ code: 'PRESENTATION_SURFACE_INVALID' });
    });

    it('refuses a multi-surface acknowledgement that is not over a socket connection', async () => {
      const h = makeHarness();
      await expect(
        h.useCase.execute({
          sessionId: SESSION_ID,
          actor: CONTROLLER_ACTOR,
          commandId: 'cmd-nosocket',
          expectedRuntimeRevision: h.runtime.revision,
          expectedSessionRevision: h.session.revision,
        }),
      ).rejects.toMatchObject({
        code: 'PRESENTATION_SURFACE_INVALID',
        message: expect.stringContaining('socket connection'),
      });
    });

    it('refuses a participant actor claiming another session', async () => {
      const h = makeHarness();
      await expect(
        h.useCase.execute({
          sessionId: SESSION_ID,
          actor: {
            kind: 'participant',
            actorId: 'actor-of-answerer',
            sessionId: 'session-other',
            participantId: ANSWERER_ID,
            role: 'team-player',
            credentialVersion: 1,
          },
          commandId: 'cmd-foreign',
          expectedRuntimeRevision: h.runtime.revision,
          expectedSessionRevision: h.session.revision,
          connectionId: 'conn-foreign',
        }),
      ).rejects.toBeInstanceOf(LiveSessionForbiddenError);
    });

    it('re-checks the binding against committed state after a reassignment', async () => {
      const h = makeHarness();
      await ack(h, CONTROLLER_ACTOR, CONN_SHARED, 'cmd-shared');
      await ack(h, ANSWERER_ACTOR, CONN_ANSWER, 'cmd-answer');

      const reassigned = openedAssignments('p-decider-2', TEAM_B);
      h.runtime.applyModeState({
        commandId: 'cmd-reassign',
        actorId: 'system',
        runtimeState: ryoRuntimeState(reassigned),
        roundState: h.runtime.serialize().activeRound!.modeState,
        eventType: 'decision-reassigned',
        eventPayload: {},
        now: LAUNCH,
        sessionRevision: h.session.revision,
      });

      // The displaced decider can no longer acknowledge the decision surface.
      await expect(
        ack(h, DECIDER_ACTOR, CONN_DECISION, 'cmd-decider-stale'),
      ).rejects.toMatchObject({ code: 'PRESENTATION_SURFACE_INVALID' });

      // The replacement decider closes the barrier and activates.
      await ack(
        h,
        teamPlayerActor('p-decider-2'),
        'conn-decider-2',
        'cmd-decider-new',
      );
      expect(h.runtime.serialize().presentationActivatedAt).toBeDefined();
    });

    it('enforces the stale-revision CAS guard without committing anything', async () => {
      const h = makeHarness();
      await expect(
        h.useCase.execute({
          sessionId: SESSION_ID,
          actor: CONTROLLER_ACTOR,
          commandId: 'cmd-stale',
          expectedRuntimeRevision: h.runtime.revision - 1,
          expectedSessionRevision: h.session.revision,
          connectionId: CONN_SHARED,
        }),
      ).rejects.toBeInstanceOf(StaleGameplayRuntimeRevisionError);
      expect(h.runtime.serialize().presentationReady ?? []).toHaveLength(0);
    });

    it('enforces the session CAS guard', async () => {
      const h = makeHarness();
      await expect(
        h.useCase.execute({
          sessionId: SESSION_ID,
          actor: CONTROLLER_ACTOR,
          commandId: 'cmd-stale-session',
          expectedRuntimeRevision: h.runtime.revision,
          expectedSessionRevision: h.session.revision - 1,
          connectionId: CONN_SHARED,
        }),
      ).rejects.toBeInstanceOf(StaleLiveSessionRevisionError);
    });

    it('treats a duplicate command id as a safe no-op that still returns a snapshot', async () => {
      const h = makeHarness();
      await ack(h, CONTROLLER_ACTOR, CONN_SHARED, 'cmd-shared');
      const revisionBefore = h.runtime.revision;
      const publishCountAfterFirst = h.publishEvent.mock.calls.length;
      const notifyCountAfterFirst = h.notifyRuntimeMutated.mock.calls.length;

      await h.useCase.execute({
        sessionId: SESSION_ID,
        actor: CONTROLLER_ACTOR,
        commandId: 'cmd-shared',
        expectedRuntimeRevision: revisionBefore,
        expectedSessionRevision: h.session.revision,
        connectionId: CONN_SHARED,
      });

      expect(h.runtime.revision).toBe(revisionBefore);
      expect(h.runtime.serialize().presentationReady ?? []).toHaveLength(1);
      expect(h.notifyRuntimeMutated).toHaveBeenCalledTimes(
        notifyCountAfterFirst,
      );
      expect(h.publishEvent).toHaveBeenCalledTimes(publishCountAfterFirst);
    });
  });

  describe('the withhold-until-final-ack barrier', () => {
    it('does not activate on a cold start that outlives the old window', async () => {
      const h = makeHarness();
      await ack(h, CONTROLLER_ACTOR, CONN_SHARED, 'cmd-shared');
      await ack(h, ANSWERER_ACTOR, CONN_ANSWER, 'cmd-answer');

      // The decider's phone is a cold start that would have missed a
      // launch-anchored 25-second window entirely.
      h.setNow(new Date(LAUNCH.getTime() + 60_000));
      const withheld = h.runtime.serialize();
      expect(withheld.presentationActivatedAt).toBeUndefined();
      expect(withheld.activeRound!.interaction!.status).toBe('prepared');
      expect(
        withheld.activeRound!.interaction!.prompt.deadlineAt,
      ).toBeUndefined();

      // The final ack activates and anchors the FULL window to that late moment.
      const late = new Date(LAUNCH.getTime() + 60_000);
      await h.useCase.execute({
        sessionId: SESSION_ID,
        actor: DECIDER_ACTOR,
        commandId: 'cmd-decider',
        expectedRuntimeRevision: h.runtime.revision,
        expectedSessionRevision: h.session.revision,
        connectionId: CONN_DECISION,
      });
      const activated = h.runtime.serialize();
      expect(activated.presentationActivatedAt).toBe(late.toISOString());
      const opened = activated.activeRound!.interaction!;
      expect(opened.status).toBe('open');
      expect(new Date(opened.prompt.deadlineAt!).getTime()).toBe(
        late.getTime() + RYO_TIMER_SECONDS * 1000,
      );
    });

    it('activates exactly once when the final surface acknowledges', async () => {
      const h = makeHarness();
      await ack(h, CONTROLLER_ACTOR, CONN_SHARED, 'cmd-shared');
      await ack(h, ANSWERER_ACTOR, CONN_ANSWER, 'cmd-answer');
      const activateAt = new Date(LAUNCH.getTime() + 25_000);
      h.setNow(activateAt);

      await ack(h, DECIDER_ACTOR, CONN_DECISION, 'cmd-decider');

      const after = h.runtime.serialize();
      expect(after.presentationActivatedAt).toBe(activateAt.toISOString());
      expect(after.presentationReady).toEqual([]);
      expect(after.activeRound!.interaction!.status).toBe('open');
      // RYO activation carries no session effects, so only the runtime commits.
      expect(h.notifyRuntimeMutated).toHaveBeenCalledTimes(3);
      expect(h.publishEvent).toHaveBeenCalledTimes(3);
      expect(h.publishEvent).toHaveBeenLastCalledWith(
        SESSION_ID,
        'live-session:presentation-activated',
        expect.objectContaining({ runtimeRevision: after.revision }),
      );
      // Snapshot is produced for the acking actor on every ack.
      expect(h.snapshot).toHaveBeenCalledTimes(3);
      const [sessionArg, runtimeArg, actorArg, nowArg] =
        h.snapshot.mock.calls[h.snapshot.mock.calls.length - 1];
      expect(actorArg).toEqual(DECIDER_ACTOR);
      expect(nowArg).toBe(activateAt);
      expect(sessionArg).toBe(h.session);
      expect(runtimeArg).toBe(h.runtime);
    });
  });
});
