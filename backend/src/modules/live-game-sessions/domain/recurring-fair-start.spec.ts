import { GameplayRuntime } from './gameplay-runtime';
import { GameplayModePlugin, GameplayModeState } from './gameplay-mode.plugin';
import { pendingDeadline } from '../application/gameplay-deadline.scheduler';

/**
 * A3 recurring fair-start — deadline semantics, proven end to end on the runtime
 * aggregate with a TEST-ONLY recurring plugin (no Cars, no production mechanic).
 * Each prepared generation shows a safe shell with no armable deadline; each
 * activation re-anchors a full, independent window from its own activation time.
 * Controlled clock, no sleeps.
 */
const DURATION_MS = 30_000;
const RECURRING_MODE_KEY = 'recurring-test';
const CONTROLLER = 'actor-controller';

const passthrough = (state: GameplayModeState): GameplayModeState => ({
  ...state,
});

// A minimal mechanic: a single timed "playing" phase whose clock is a runtime
// `deadlineAt`, re-anchored to activation time on both initial and recurring
// activation (the hook does not distinguish — a full window from `now`).
const RECURRING_TEST_PLUGIN: GameplayModePlugin = {
  key: RECURRING_MODE_KEY,
  version: 1,
  stateSchemaVersion: 1,
  deadline: {
    source: 'runtime-state',
    commandType: 'expire-recurring-item',
    activePhases: ['playing'],
    requiresPresentationActivation: true,
  },
  activatePresentation: (state, now) => ({
    ...state,
    deadlineAt: new Date(now.getTime() + DURATION_MS).toISOString(),
  }),
  createInitialRuntimeState: (context) =>
    (context.initialState as GameplayModeState | undefined) ?? {
      phase: 'playing',
      deadlineAt: null,
      currentItemId: 'item-0',
    },
  createInitialRoundState: () => ({ phase: 'playing' }),
  validateRuntimeState: passthrough,
  validateRoundState: passthrough,
  command: () => undefined,
  handleCommand: () => {
    throw new Error('not used');
  },
  projectRuntimeState: passthrough,
  projectRoundState: passthrough,
  presentedContentItemIds: ({ runtimeState }) =>
    runtimeState.currentItemId ? [String(runtimeState.currentItemId)] : [],
};

const LAUNCH = new Date('2026-01-01T00:00:00.000Z');

function activeRuntime(): GameplayRuntime {
  const runtime = GameplayRuntime.create({
    id: 'runtime-1',
    sessionId: 'session-1',
    plugin: RECURRING_TEST_PLUGIN,
    commandId: 'cmd-create',
    actorId: CONTROLLER,
    now: LAUNCH,
    expiresAt: new Date(LAUNCH.getTime() + 3_600_000),
    initialState: {
      phase: 'playing',
      deadlineAt: new Date(LAUNCH.getTime() + DURATION_MS).toISOString(),
      currentItemId: 'item-0',
    },
  });
  runtime.start('cmd-start', CONTROLLER, LAUNCH);
  const round = runtime.createRound(
    { commandId: 'cmd-round', actorId: CONTROLLER },
    LAUNCH,
  );
  runtime.startRound(round.id, 'cmd-round-start', CONTROLLER, LAUNCH);
  return runtime;
}

const deadlineOf = (runtime: GameplayRuntime) => {
  const state = runtime.serialize();
  return pendingDeadline(state, RECURRING_TEST_PLUGIN.deadline);
};

const anchor = (runtime: GameplayRuntime) => {
  const value = runtime.serialize().runtimeState.deadlineAt;
  return value ? Date.parse(String(value)) : null;
};

// Bring a runtime through the INITIAL activation so recurring generations apply.
function initiallyActivated(): GameplayRuntime {
  const runtime = activeRuntime();
  runtime.activatePresentation('cmd-initial', CONTROLLER, LAUNCH);
  return runtime;
}

describe('recurring fair-start deadline', () => {
  it('a prepared generation has no pending deadline', () => {
    const runtime = initiallyActivated();
    runtime.prepareNextPresentation(
      'cmd-prep1',
      CONTROLLER,
      new Date(LAUNCH.getTime() + 40_000),
    );
    expect(deadlineOf(runtime)).toBeUndefined();
  });

  it('the scheduler cannot arm a stale deadline while a generation is prepared', () => {
    const runtime = initiallyActivated();
    // The runtime still carries the initial window's deadlineAt, but preparing a
    // recurring generation suppresses it until the generation activates.
    const beforePrepare = anchor(runtime);
    runtime.prepareNextPresentation(
      'cmd-prep',
      CONTROLLER,
      new Date(LAUNCH.getTime() + 40_000),
    );
    expect(anchor(runtime)).toBe(beforePrepare); // prepare never moves the clock
    expect(deadlineOf(runtime)).toBeUndefined();
  });

  it('activation re-anchors a full window from activatedAt', () => {
    const runtime = initiallyActivated();
    const gen = runtime.prepareNextPresentation(
      'cmd-prep',
      CONTROLLER,
      new Date(LAUNCH.getTime() + 40_000),
    );
    const activateAt = new Date(LAUNCH.getTime() + 52_000); // 12s of loading
    runtime.activateCurrentPresentation(gen, 'cmd-act', CONTROLLER, activateAt);
    const pending = deadlineOf(runtime);
    expect(pending).toBeDefined();
    expect(Date.parse(pending!.deadlineAt) - activateAt.getTime()).toBe(
      DURATION_MS,
    );
    // Anchored from activation, never from prepare or launch.
    expect(Date.parse(pending!.deadlineAt)).toBe(
      activateAt.getTime() + DURATION_MS,
    );
  });

  it('gives generation 2 a fresh full window, independent of generation 1', () => {
    const runtime = initiallyActivated();
    const g1 = runtime.prepareNextPresentation(
      'cmd-p1',
      CONTROLLER,
      new Date(LAUNCH.getTime() + 40_000),
    );
    const act1 = new Date(LAUNCH.getTime() + 50_000);
    runtime.activateCurrentPresentation(g1, 'cmd-a1', CONTROLLER, act1);
    const gen1Deadline = anchor(runtime);
    expect(gen1Deadline).toBe(act1.getTime() + DURATION_MS);

    const g2 = runtime.prepareNextPresentation(
      'cmd-p2',
      CONTROLLER,
      new Date(LAUNCH.getTime() + 200_000),
    );
    // While generation 2 is prepared, generation 1's deadline can no longer govern.
    expect(deadlineOf(runtime)).toBeUndefined();
    const act2 = new Date(LAUNCH.getTime() + 220_000); // long loading delay
    runtime.activateCurrentPresentation(g2, 'cmd-a2', CONTROLLER, act2);
    const pending = deadlineOf(runtime);
    expect(Date.parse(pending!.deadlineAt)).toBe(act2.getTime() + DURATION_MS);
    expect(Date.parse(pending!.deadlineAt)).not.toBe(gen1Deadline! + 0);
  });

  it('gives generation 3 its own independent window', () => {
    const runtime = initiallyActivated();
    let t = 40_000;
    let lastDeadline = 0;
    for (let generation = 1; generation <= 3; generation += 1) {
      const g = runtime.prepareNextPresentation(
        `cmd-p${generation}`,
        CONTROLLER,
        new Date(LAUNCH.getTime() + t),
      );
      const activateAt = new Date(LAUNCH.getTime() + t + 15_000);
      runtime.activateCurrentPresentation(
        g,
        `cmd-a${generation}`,
        CONTROLLER,
        activateAt,
      );
      const pending = deadlineOf(runtime)!;
      expect(Date.parse(pending.deadlineAt)).toBe(
        activateAt.getTime() + DURATION_MS,
      );
      expect(Date.parse(pending.deadlineAt)).not.toBe(lastDeadline);
      lastDeadline = Date.parse(pending.deadlineAt);
      t += 100_000;
    }
  });

  it('never touches the initial presentationActivatedAt across generations', () => {
    const runtime = initiallyActivated();
    const initial = runtime.serialize().presentationActivatedAt;
    const g1 = runtime.prepareNextPresentation(
      'cmd-p1',
      CONTROLLER,
      new Date(LAUNCH.getTime() + 40_000),
    );
    runtime.activateCurrentPresentation(
      g1,
      'cmd-a1',
      CONTROLLER,
      new Date(LAUNCH.getTime() + 50_000),
    );
    const g2 = runtime.prepareNextPresentation(
      'cmd-p2',
      CONTROLLER,
      new Date(LAUNCH.getTime() + 150_000),
    );
    runtime.activateCurrentPresentation(
      g2,
      'cmd-a2',
      CONTROLLER,
      new Date(LAUNCH.getTime() + 160_000),
    );
    expect(runtime.serialize().presentationActivatedAt).toBe(initial);
  });

  it('is idempotent: re-activating an activated generation does not move its deadline', () => {
    const runtime = initiallyActivated();
    const g = runtime.prepareNextPresentation(
      'cmd-p',
      CONTROLLER,
      new Date(LAUNCH.getTime() + 40_000),
    );
    const activateAt = new Date(LAUNCH.getTime() + 50_000);
    const effects = runtime.activateCurrentPresentation(
      g,
      'cmd-a',
      CONTROLLER,
      activateAt,
    );
    expect(effects).toEqual([]);
    const deadline = anchor(runtime);
    const again = runtime.activateCurrentPresentation(
      g,
      'cmd-a2',
      CONTROLLER,
      new Date(LAUNCH.getTime() + 90_000),
    );
    expect(again).toEqual([]);
    expect(anchor(runtime)).toBe(deadline);
  });

  it('restores an activated generation without re-arming from restore time', () => {
    const runtime = initiallyActivated();
    const g = runtime.prepareNextPresentation(
      'cmd-p',
      CONTROLLER,
      new Date(LAUNCH.getTime() + 40_000),
    );
    const activateAt = new Date(LAUNCH.getTime() + 50_000);
    runtime.activateCurrentPresentation(g, 'cmd-a', CONTROLLER, activateAt);
    const restored = GameplayRuntime.restore(
      runtime.serialize(),
      RECURRING_TEST_PLUGIN,
    );
    const pending = pendingDeadline(
      restored.serialize(),
      RECURRING_TEST_PLUGIN.deadline,
    );
    expect(Date.parse(pending!.deadlineAt)).toBe(
      activateAt.getTime() + DURATION_MS,
    );
    expect(restored.serialize().currentPresentation!.activatedAt).toBe(
      activateAt.toISOString(),
    );
  });
});
