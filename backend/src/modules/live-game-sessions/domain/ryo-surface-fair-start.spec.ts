import {
  createTeamActionAssignmentState,
  serializeTeamActionAssignments,
  TeamActionAssignmentState,
} from './team-action-assignment';
import {
  openRyoItemAssignments,
  RYO_GAMEPLAY_PLUGIN,
  RYO_TIMER_SECONDS,
} from './ryo-gameplay.plugin';
import { GameplayRuntime } from './gameplay-runtime';
import { GameplayModeState } from './gameplay-mode.plugin';

/**
 * RYO fair-start (P0 vertical): the first item's 25-second clock is NOT armed
 * at launch. The item is held `prepared` with no deadline until the shared
 * screen, the assigned answerer, and the assigned decider have all acknowledged
 * readiness; activation then opens the item and anchors the full window to the
 * activation moment. A slow cold-start on any one surface can never burn playable
 * time. These are pure-domain proofs — surface derivation, the ready barrier,
 * connection-keyed withdrawal, reassignment re-derivation, one-time activation —
 * with a controlled clock and no sleeps.
 */
const LAUNCH = new Date('2026-01-01T00:00:00.000Z');
const CONTROLLER = 'actor-controller';
const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const ANSWERER = 'p-answerer';
const DECIDER = 'p-decider';
const CONN_SHARED = 'conn-shared';
const CONN_ANSWER = 'conn-answerer';
const CONN_DECISION = 'conn-decider';

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
  answerer: string,
  answererTeamId: string,
  decider: string,
  deciderTeamId: string,
): TeamActionAssignmentState {
  return openRyoItemAssignments({
    state: {
      rotations: [
        { teamId: answererTeamId, order: [answerer], cursor: 0 },
        { teamId: deciderTeamId, order: [decider], cursor: 0 },
      ],
      assignments: [],
      nextSequence: 1,
    },
    answeringTeamId: answererTeamId,
    opposingTeamId: deciderTeamId,
    participants: [
      { participantId: answerer, teamId: answererTeamId, connected: true },
      { participantId: decider, teamId: deciderTeamId, connected: true },
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

function buildRuntime(): GameplayRuntime {
  const built = GameplayRuntime.create({
    id: 'runtime-1',
    sessionId: 'session-1',
    plugin: RYO_GAMEPLAY_PLUGIN,
    commandId: 'cmd-runtime-create',
    actorId: CONTROLLER,
    now: LAUNCH,
    expiresAt: new Date(LAUNCH.getTime() + 3_600_000),
    initialState: ryoRuntimeState(
      openedAssignments(ANSWERER, TEAM_A, DECIDER, TEAM_B),
    ),
  });
  built.start('cmd-runtime-start', CONTROLLER, LAUNCH);
  const round = built.createRound(
    {
      commandId: 'cmd-round-create',
      actorId: CONTROLLER,
      activeTeamId: TEAM_A,
      activeParticipantId: ANSWERER,
    },
    LAUNCH,
  );
  built.startRound(round.id, 'cmd-round-start', CONTROLLER, LAUNCH);
  const prompt = RYO_GAMEPLAY_PLUGIN.interaction!.preparePrompt(
    {
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      activeTeamId: TEAM_A,
      awaitingPresentationActivation: true,
    },
    {
      itemJson: JSON.stringify(ITEM(0)),
      opposingTeamId: TEAM_B,
      answererParticipantId: ANSWERER,
      deciderParticipantId: DECIDER,
    },
    LAUNCH,
  );
  built.prepareInteraction(prompt, 'cmd-prepare', CONTROLLER, LAUNCH);
  return built;
}

function interactionState(runtime: GameplayRuntime) {
  const interaction = runtime.serialize().activeRound?.interaction;
  if (!interaction) throw new Error('expected an active interaction');
  return interaction;
}

describe('ryo multi-surface fair-start', () => {
  it('declares the three required surfaces and the activation hook', () => {
    const runtime = buildRuntime();
    expect(RYO_GAMEPLAY_PLUGIN.requiredPresentationSurfaces).toBeDefined();
    expect(typeof RYO_GAMEPLAY_PLUGIN.activatePresentation).toBe('function');
    expect(runtime.requiredPresentationSurfaces()).toEqual([
      { capability: 'shared' },
      { capability: 'answering', participantId: ANSWERER },
      { capability: 'decision', participantId: DECIDER },
    ]);
  });

  it('declares no surfaces while either participant is unassigned', () => {
    const built = GameplayRuntime.create({
      id: 'runtime-1',
      sessionId: 'session-1',
      plugin: RYO_GAMEPLAY_PLUGIN,
      commandId: 'cmd-runtime-create',
      actorId: CONTROLLER,
      now: LAUNCH,
      expiresAt: new Date(LAUNCH.getTime() + 3_600_000),
      initialState: ryoRuntimeState(
        createTeamActionAssignmentState([
          { teamId: TEAM_A, order: [ANSWERER], cursor: 0 },
          { teamId: TEAM_B, order: [DECIDER], cursor: 0 },
        ]),
      ),
    });
    expect(built.requiredPresentationSurfaces()).toBeUndefined();
  });

  it('holds the first item prepared with no exposure and no clock before the barrier clears', () => {
    const runtime = buildRuntime();
    const interaction = interactionState(runtime);
    expect(interaction.status).toBe('prepared');
    expect(interaction.prompt.visibleFrom).toBeUndefined();
    expect(interaction.prompt.deadlineAt).toBeUndefined();
    expect(interaction.openedAt).toBeUndefined();
    expect(runtime.serialize().presentationActivatedAt).toBeUndefined();
    expect(runtime.areAllRequiredSurfacesReady()).toBe(false);
  });

  it('never activates on partial acknowledgements — the last ack only makes the barrier satisfiable', () => {
    const runtime = buildRuntime();
    runtime.recordSurfaceReady(
      'shared',
      CONN_SHARED,
      'cmd-shared',
      CONTROLLER,
      LAUNCH,
    );
    runtime.recordSurfaceReady(
      'answering',
      CONN_ANSWER,
      'cmd-answer',
      CONTROLLER,
      LAUNCH,
    );
    expect(runtime.areAllRequiredSurfacesReady()).toBe(false);
    const half = interactionState(runtime);
    expect(half.status).toBe('prepared');
    expect(half.prompt.deadlineAt).toBeUndefined();

    runtime.recordSurfaceReady(
      'decision',
      CONN_DECISION,
      'cmd-decision',
      CONTROLLER,
      LAUNCH,
    );
    expect(runtime.areAllRequiredSurfacesReady()).toBe(true);
    // The aggregate records readiness; only the use case performs activation.
    // A satisfied barrier must still hold the item until activatePresentation.
    const all = interactionState(runtime);
    expect(all.status).toBe('prepared');
    expect(all.prompt.deadlineAt).toBeUndefined();
    expect(runtime.serialize().presentationActivatedAt).toBeUndefined();
  });

  it('activation opens the held item at activation time and anchors the FULL 25s window', () => {
    const runtime = buildRuntime();
    runtime.recordSurfaceReady(
      'shared',
      CONN_SHARED,
      'cmd-shared',
      CONTROLLER,
      LAUNCH,
    );
    runtime.recordSurfaceReady(
      'answering',
      CONN_ANSWER,
      'cmd-answer',
      CONTROLLER,
      LAUNCH,
    );
    runtime.recordSurfaceReady(
      'decision',
      CONN_DECISION,
      'cmd-decision',
      CONTROLLER,
      LAUNCH,
    );

    // 25 extra seconds of client cold-start before the last surface mounts.
    const activateAt = new Date(LAUNCH.getTime() + 25_000);
    runtime.activatePresentation('cmd-activate', CONTROLLER, activateAt);

    const after = runtime.serialize();
    expect(after.presentationActivatedAt).toBe(activateAt.toISOString());
    expect(after.presentationReady).toEqual([]);
    const opened = interactionState(runtime);
    expect(opened.status).toBe('open');
    expect(new Date(opened.openedAt!).getTime()).toBe(activateAt.getTime());
    expect(new Date(opened.prompt.visibleFrom!).getTime()).toBe(
      activateAt.getTime(),
    );
    expect(new Date(opened.prompt.deadlineAt!).getTime()).toBe(
      activateAt.getTime() + RYO_TIMER_SECONDS * 1000,
    );
    // The launch-to-activation gap is never charged to the playable window.
    expect(
      new Date(opened.prompt.deadlineAt!).getTime() - activateAt.getTime(),
    ).toBe(RYO_TIMER_SECONDS * 1000);
  });

  it('is idempotent: a later duplicate ready never re-stamps activation or re-opens the item', () => {
    const runtime = buildRuntime();
    runtime.recordSurfaceReady(
      'shared',
      CONN_SHARED,
      'cmd-shared',
      CONTROLLER,
      LAUNCH,
    );
    runtime.recordSurfaceReady(
      'answering',
      CONN_ANSWER,
      'cmd-answer',
      CONTROLLER,
      LAUNCH,
    );
    runtime.recordSurfaceReady(
      'decision',
      CONN_DECISION,
      'cmd-decision',
      CONTROLLER,
      LAUNCH,
    );
    const activateAt = new Date(LAUNCH.getTime() + 25_000);
    runtime.activatePresentation('cmd-activate', CONTROLLER, activateAt);
    const firstDeadline = interactionState(runtime).prompt.deadlineAt;

    const laterReady = new Date(LAUNCH.getTime() + 60_000);
    runtime.activatePresentation('cmd-activate-dup', CONTROLLER, laterReady);

    const after = runtime.serialize();
    expect(after.presentationActivatedAt).toBe(activateAt.toISOString());
    expect(interactionState(runtime).prompt.deadlineAt!.toISOString()).toBe(
      firstDeadline!.toISOString(),
    );
    expect(new Date(interactionState(runtime).openedAt!).getTime()).toBe(
      activateAt.getTime(),
    );
  });

  it('records readiness per acknowledged connection, idempotently, and withdraws by connection id', () => {
    const runtime = buildRuntime();
    runtime.recordSurfaceReady(
      'shared',
      CONN_SHARED,
      'cmd-shared',
      CONTROLLER,
      LAUNCH,
    );
    const revisionAfterShared = runtime.revision;
    // Same capability, same connection: provenance kept, no duplicate commit.
    runtime.recordSurfaceReady(
      'shared',
      CONN_SHARED,
      'cmd-shared-dup',
      CONTROLLER,
      LAUNCH,
    );
    expect(runtime.revision).toBe(revisionAfterShared);

    runtime.recordSurfaceReady(
      'answering',
      CONN_ANSWER,
      'cmd-answer',
      CONTROLLER,
      LAUNCH,
    );
    runtime.recordSurfaceReady(
      'decision',
      CONN_DECISION,
      'cmd-decision',
      CONTROLLER,
      LAUNCH,
    );
    // A second device acking the same capability is distinct provenance.
    runtime.recordSurfaceReady(
      'decision',
      'conn-decider-2',
      'cmd-decision-2',
      CONTROLLER,
      LAUNCH,
    );
    expect(runtime.areAllRequiredSurfacesReady()).toBe(true);
    expect(runtime.serialize().presentationReady).toHaveLength(4);

    // Disconnect withdraws exactly that connection: the barrier re-opens.
    runtime.clearSurfaceReadiness(CONN_ANSWER);
    expect(runtime.areAllRequiredSurfacesReady()).toBe(false);
    expect(
      (runtime.serialize().presentationReady ?? []).some(
        (entry) => entry.connectionId === CONN_ANSWER,
      ),
    ).toBe(false);

    // A fresh mount re-acknowledges and the barrier closes again.
    runtime.recordSurfaceReady(
      'answering',
      'conn-answerer-2',
      'cmd-answer-2',
      CONTROLLER,
      LAUNCH,
    );
    expect(runtime.areAllRequiredSurfacesReady()).toBe(true);
  });

  it('re-derives the required surface set after a participant reassignment', () => {
    const runtime = buildRuntime();
    // The decider disconnects mid-barrier; reassignment repoints the decision.
    const reassigned = openedAssignments(
      ANSWERER,
      TEAM_A,
      'p-decider-2',
      TEAM_B,
    );
    runtime.applyModeState({
      commandId: 'cmd-reassign',
      actorId: 'system',
      runtimeState: ryoRuntimeState(reassigned),
      roundState: runtime.serialize().activeRound!.modeState,
      eventType: 'decision-reassigned',
      eventPayload: {},
      now: LAUNCH,
      sessionRevision: runtime.serialize().revision,
    });
    expect(runtime.requiredPresentationSurfaces()).toEqual([
      { capability: 'shared' },
      { capability: 'answering', participantId: ANSWERER },
      { capability: 'decision', participantId: 'p-decider-2' },
    ]);
  });

  it('persists the ready set and activation through serialize/restore', () => {
    const runtime = buildRuntime();
    runtime.recordSurfaceReady(
      'shared',
      CONN_SHARED,
      'cmd-shared',
      CONTROLLER,
      LAUNCH,
    );
    runtime.recordSurfaceReady(
      'answering',
      CONN_ANSWER,
      'cmd-answer',
      CONTROLLER,
      LAUNCH,
    );

    const restored = GameplayRuntime.restore(
      runtime.serialize(),
      RYO_GAMEPLAY_PLUGIN,
    );
    expect(restored.requiredPresentationSurfaces()).toHaveLength(3);
    expect(restored.areAllRequiredSurfacesReady()).toBe(false);

    restored.recordSurfaceReady(
      'decision',
      CONN_DECISION,
      'cmd-decision',
      CONTROLLER,
      LAUNCH,
    );
    expect(restored.areAllRequiredSurfacesReady()).toBe(true);
    const activateAt = new Date(LAUNCH.getTime() + 15_000);
    restored.activatePresentation('cmd-activate', CONTROLLER, activateAt);

    const restoredAgain = GameplayRuntime.restore(
      restored.serialize(),
      RYO_GAMEPLAY_PLUGIN,
    );
    expect(restoredAgain.serialize().presentationActivatedAt).toBe(
      activateAt.toISOString(),
    );
    // Idempotency survives hydration.
    restoredAgain.activatePresentation('cmd-activate-dup', CONTROLLER, LAUNCH);
    expect(restoredAgain.serialize().presentationActivatedAt).toBe(
      activateAt.toISOString(),
    );
    expect(
      new Date(
        restoredAgain.serialize().activeRound!.interaction!.prompt.deadlineAt!,
      ).getTime(),
    ).toBe(activateAt.getTime() + RYO_TIMER_SECONDS * 1000);
  });

  it('writes provenance events for readiness, withdrawal, and activation', () => {
    const runtime = buildRuntime();
    runtime.recordSurfaceReady(
      'shared',
      CONN_SHARED,
      'cmd-shared',
      CONTROLLER,
      LAUNCH,
    );
    runtime.recordSurfaceReady(
      'answering',
      CONN_ANSWER,
      'cmd-answer',
      CONTROLLER,
      LAUNCH,
    );
    runtime.clearSurfaceReadiness(CONN_ANSWER);
    runtime.recordSurfaceReady(
      'decision',
      CONN_DECISION,
      'cmd-decision',
      CONTROLLER,
      LAUNCH,
    );
    runtime.activatePresentation('cmd-activate', CONTROLLER, LAUNCH);

    const types = runtime.serialize().events.map((entry) => entry.type);
    expect(types).toContain('presentation-surface-ready');
    expect(types).toContain('presentation-readiness-withdrawn');
    expect(types).toContain('presentation-activated');
    expect(
      types.filter((type) => type === 'presentation-activated'),
    ).toHaveLength(1);
  });
});
