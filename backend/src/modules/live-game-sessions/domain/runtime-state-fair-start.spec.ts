import {
  CLOSEST_GAMEPLAY_PLUGIN,
  CLOSEST_MODE_KEY,
  CLOSEST_TIMER_SECONDS,
} from './closest-gameplay.plugin';
import {
  ONE_CLUE_GAMEPLAY_PLUGIN,
  ONE_CLUE_MODE_KEY,
  ONE_CLUE_STAGE_SECONDS,
} from './one-clue-gameplay.plugin';
import { RAKKIBHA_PLUGIN, RAKKIBHA_MODE_KEY } from './rakkibha.plugin';
import { pendingDeadline } from '../application/gameplay-deadline.scheduler';
import type {
  GameplayModePlugin,
  GameplayModeState,
} from './gameplay-mode.plugin';
import type { GameplayRuntimeState } from './gameplay-runtime';

// RAKKIBHA_TIMER_SECONDS (135) is World Content config; kept as a local literal
// here so this domain-layer spec does not reach across the world-content edge.
const RAKKIBHA_WINDOW_MS = 135 * 1000;

/**
 * Vertical 3 — the three `runtime-state` mechanics adopt the same generic
 * fair-start already proven by Combo: the initial playable window's clock is
 * anchored to the moment gameplay is presented, not to launch, and no deadline
 * is armed until then. Pure-domain proofs (opt-in declaration, the reconciler's
 * activation gate, and each plugin's own re-anchor hook) with a controlled clock
 * and no sleeps.
 */
const LAUNCH = new Date('2026-01-01T00:00:00.000Z');

function runtimeAround(
  modeKey: string,
  runtimeState: GameplayModeState,
  presentationActivatedAt: string | null,
): GameplayRuntimeState {
  return {
    id: 'runtime-1',
    sessionId: 'session-1',
    modeKey,
    modeVersion: 1,
    stateSchemaVersion: 1,
    status: 'round-active',
    revision: 4,
    presentationActivatedAt,
    runtimeState,
    completedRounds: [],
    processedCommandIds: [],
    transitions: [],
    events: [],
    createdAt: LAUNCH,
    expiresAt: new Date(LAUNCH.getTime() + 3_600_000),
    activeRound: {
      id: 'round-1',
      runtimeId: 'runtime-1',
      sequence: 1,
      status: 'active',
      createdAt: LAUNCH,
      modeStateSchemaVersion: 1,
      modeState: {},
      transitionRevision: 4,
    },
  } as GameplayRuntimeState;
}

interface FairStartCase {
  name: string;
  plugin: GameplayModePlugin;
  modeKey: string;
  phase: string;
  durationMs: number;
  launchState: () => GameplayModeState;
}

const CASES: FairStartCase[] = [
  {
    name: 'Closest',
    plugin: CLOSEST_GAMEPLAY_PLUGIN,
    modeKey: CLOSEST_MODE_KEY,
    phase: 'collecting',
    durationMs: CLOSEST_TIMER_SECONDS * 1000,
    launchState: () => ({
      phase: 'collecting',
      deadlineAt: new Date(
        LAUNCH.getTime() + CLOSEST_TIMER_SECONDS * 1000,
      ).toISOString(),
    }),
  },
  {
    name: 'One Clue',
    plugin: ONE_CLUE_GAMEPLAY_PLUGIN,
    modeKey: ONE_CLUE_MODE_KEY,
    phase: 'collecting',
    durationMs: ONE_CLUE_STAGE_SECONDS * 1000,
    launchState: () => ({
      phase: 'collecting',
      deadlineAt: new Date(
        LAUNCH.getTime() + ONE_CLUE_STAGE_SECONDS * 1000,
      ).toISOString(),
    }),
  },
  {
    name: 'Rakkibha',
    plugin: RAKKIBHA_PLUGIN,
    modeKey: RAKKIBHA_MODE_KEY,
    phase: 'active',
    durationMs: RAKKIBHA_WINDOW_MS,
    launchState: () => ({
      phase: 'active',
      startedAtMs: LAUNCH.getTime(),
      deadlineAt: new Date(LAUNCH.getTime() + RAKKIBHA_WINDOW_MS).toISOString(),
    }),
  },
];

const omitTiming = (state: GameplayModeState) => {
  const clone = { ...state } as Record<string, unknown>;
  delete clone.deadlineAt;
  delete clone.startedAtMs;
  return clone;
};

/**
 * These runtime-state mechanics re-anchor their own clock, so `activatePresentation`
 * returns the mode state directly; the union with the session-effect result (used
 * by session-clock mechanics like Bomb) is normalized here.
 */
const activatedState = (
  plugin: GameplayModePlugin,
  state: GameplayModeState,
  now: Date,
): GameplayModeState => {
  const result = plugin.activatePresentation!(
    state,
    now,
    {} as never,
  ) as Record<string, unknown>;
  return (result.runtimeState ?? result) as GameplayModeState;
};

describe.each(CASES)(
  '$name fair-start (runtime-state)',
  ({ plugin, modeKey, phase, durationMs, launchState }) => {
    it('opts into presentation activation through its deadline declaration', () => {
      expect(plugin.deadline).toMatchObject({
        source: 'runtime-state',
        requiresPresentationActivation: true,
      });
      expect(typeof plugin.activatePresentation).toBe('function');
    });

    it('arms no deadline before activation (no time consumed at launch)', () => {
      const state = runtimeAround(modeKey, launchState(), null);
      expect(pendingDeadline(state, plugin.deadline)).toBeUndefined();
    });

    it('arms the deadline once presentation is activated', () => {
      const state = runtimeAround(
        modeKey,
        launchState(),
        new Date(LAUNCH).toISOString(),
      );
      expect(pendingDeadline(state, plugin.deadline)).toBeDefined();
    });

    it('anchors the FULL configured window from activation, not launch', () => {
      const activateAt = new Date(LAUNCH.getTime() + 20_000);
      const reanchored = activatedState(plugin, launchState(), activateAt);
      expect(reanchored.phase).toBe(phase);
      const armed = new Date(String(reanchored.deadlineAt)).getTime();
      expect(armed - activateAt.getTime()).toBe(durationMs);
      // Strictly later than a launch-anchored deadline would have been.
      expect(armed).toBeGreaterThan(LAUNCH.getTime() + durationMs);
    });

    it('re-anchor changes only the timing, never content or phase', () => {
      const activateAt = new Date(LAUNCH.getTime() + 12_000);
      const before = launchState();
      const after = activatedState(plugin, before, activateAt);
      expect(omitTiming(after)).toEqual(omitTiming(before));
    });

    it('does not re-anchor once the initial phase has passed', () => {
      const resolved = { ...launchState(), phase: 'completed' };
      expect(
        activatedState(plugin, resolved, new Date(LAUNCH.getTime() + 5000)),
      ).toEqual(resolved);
    });
  },
);

describe('Rakkibha race clock re-anchoring', () => {
  it('moves BOTH the race origin and the deadline to activation time', () => {
    const launchStart = LAUNCH.getTime();
    const state: GameplayModeState = {
      phase: 'active',
      startedAtMs: launchStart,
      deadlineAt: new Date(launchStart + RAKKIBHA_WINDOW_MS).toISOString(),
    };
    const activateAt = new Date(launchStart + 18_000);
    const reanchored = activatedState(RAKKIBHA_PLUGIN, state, activateAt);
    // The origin every elapsed measurement is taken from is now activation time.
    expect(Number(reanchored.startedAtMs)).toBe(activateAt.getTime());
    // And the configured race window is preserved exactly from that new origin.
    expect(
      new Date(String(reanchored.deadlineAt)).getTime() -
        Number(reanchored.startedAtMs),
    ).toBe(RAKKIBHA_WINDOW_MS);
  });
});
