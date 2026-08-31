import {
  COMBO_GAMEPLAY_PLUGIN,
  COMBO_MODE_KEY,
  COMBO_QUESTION_SECONDS,
} from './combo-gameplay.plugin';
import { pendingDeadline } from '../application/gameplay-deadline.scheduler';
import { GameplayRuntime } from './gameplay-runtime';
import type { GameplayRuntimeState } from './gameplay-runtime';
import type {
  GameplayModeState,
  GameplayPresentationActivationResult,
} from './gameplay-mode.plugin';

/**
 * Combo fair-start (P0 vertical): the 30-second question clock is anchored to the
 * moment gameplay is presented, not to launch, and no deadline is armed until then.
 * These are pure-domain proofs — the plugin's re-anchor hook plus the reconciler's
 * opt-in gate — with a controlled clock and no sleeps.
 */
const LAUNCH = new Date('2026-01-01T00:00:00.000Z');
const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const ACTIVATION_CONTEXT = {
  sessionId: 'session-1',
  runtimeId: 'runtime-1',
};

function activationRuntimeState(
  result: ReturnType<
    NonNullable<typeof COMBO_GAMEPLAY_PLUGIN.activatePresentation>
  >,
): GameplayModeState {
  return isActivationResult(result) ? result.runtimeState : result;
}

function isActivationResult(
  result: GameplayModeState | GameplayPresentationActivationResult,
): result is GameplayPresentationActivationResult {
  return (
    typeof result.runtimeState === 'object' &&
    result.runtimeState !== null &&
    !Array.isArray(result.runtimeState)
  );
}

function comboQuestionState(deadlineAt: string | null): GameplayModeState {
  const question = (run: number, stage: 1 | 2 | 3 | 4) => ({
    contentItemId: `item-${run}-${stage}`,
    scopeId: `scope-${stage}`,
    stage,
    prompt: { ar: `سؤال ${stage}` },
    acceptedAnswers: [`answer-${run}-${stage}`],
  });
  const plan = [
    ([1, 2, 3, 4] as const).map((stage) => question(0, stage)),
    ([1, 2, 3, 4] as const).map((stage) => question(1, stage)),
  ];
  return COMBO_GAMEPLAY_PLUGIN.validateRuntimeState({
    teamIdsJson: JSON.stringify([TEAM_A, TEAM_B]),
    questionPlanJson: JSON.stringify(plan),
    runResultsJson: '[]',
    chargesJson: JSON.stringify({
      [TEAM_A]: 'available',
      [TEAM_B]: 'available',
    }),
    runIndex: 0,
    questionIndex: 0,
    unbankedPoints: 0,
    phase: 'question',
    forcedQuestion: false,
    armedBreakByTeamId: null,
    deadlineAt,
  });
}

function runtimeAround(
  runtimeState: GameplayModeState,
  presentationActivatedAt: string | null,
): GameplayRuntimeState {
  return {
    id: 'runtime-1',
    sessionId: 'session-1',
    modeKey: COMBO_MODE_KEY,
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

describe('combo fair-start', () => {
  it('opts into presentation activation in its deadline declaration', () => {
    expect(COMBO_GAMEPLAY_PLUGIN.deadline).toMatchObject({
      source: 'runtime-state',
      requiresPresentationActivation: true,
    });
    expect(typeof COMBO_GAMEPLAY_PLUGIN.activatePresentation).toBe('function');
  });

  it('does NOT arm the question deadline before activation (no time consumed at launch)', () => {
    // Launch-time state: deadline already stamped, but not yet activated.
    const state = runtimeAround(
      comboQuestionState(
        new Date(
          LAUNCH.getTime() + COMBO_QUESTION_SECONDS * 1000,
        ).toISOString(),
      ),
      null,
    );
    expect(
      pendingDeadline(state, COMBO_GAMEPLAY_PLUGIN.deadline),
    ).toBeUndefined();
  });

  it('anchors the FULL 30s from activation time, not launch (delay costs no gameplay time)', () => {
    const launchState = comboQuestionState(
      new Date(LAUNCH.getTime() + COMBO_QUESTION_SECONDS * 1000).toISOString(),
    );
    // A 20-second client cold-start before the surface is ready.
    const activateAt = new Date(LAUNCH.getTime() + 20_000);
    const reanchored = COMBO_GAMEPLAY_PLUGIN.activatePresentation!(
      launchState,
      activateAt,
      ACTIVATION_CONTEXT,
    );
    const reanchoredState = activationRuntimeState(reanchored);
    // Invariant preserved: still the question phase, still carrying a clock.
    expect(reanchoredState.phase).toBe('question');
    expect(typeof reanchoredState.deadlineAt).toBe('string');

    const activated = runtimeAround(reanchoredState, activateAt.toISOString());
    const pending = pendingDeadline(activated, COMBO_GAMEPLAY_PLUGIN.deadline);
    expect(pending).toBeDefined();
    expect(pending!.kind).toBe('mode-command');
    // The full 30 seconds is measured from activation, not from launch.
    expect(new Date(pending!.deadlineAt).getTime() - activateAt.getTime()).toBe(
      COMBO_QUESTION_SECONDS * 1000,
    );
    // And strictly later than a launch-anchored deadline would have been.
    const launchDeadline = LAUNCH.getTime() + COMBO_QUESTION_SECONDS * 1000;
    expect(new Date(pending!.deadlineAt).getTime()).toBeGreaterThan(
      launchDeadline,
    );
  });

  it('re-anchor changes only the deadline — never content, phase, plan, or scoring', () => {
    const launchState = comboQuestionState(
      new Date(LAUNCH.getTime() + COMBO_QUESTION_SECONDS * 1000).toISOString(),
    );
    const activateAt = new Date(LAUNCH.getTime() + 12_000);
    const reanchored = COMBO_GAMEPLAY_PLUGIN.activatePresentation!(
      launchState,
      activateAt,
      ACTIVATION_CONTEXT,
    );
    const reanchoredState = activationRuntimeState(reanchored);
    const withoutDeadline = (state: GameplayModeState) => {
      const clone = { ...state };
      delete (clone as { deadlineAt?: unknown }).deadlineAt;
      return clone;
    };
    expect(withoutDeadline(reanchoredState)).toEqual(
      withoutDeadline(launchState),
    );
  });

  describe('aggregate one-time activation', () => {
    const launchDeadline = new Date(
      LAUNCH.getTime() + COMBO_QUESTION_SECONDS * 1000,
    ).toISOString();

    // Restore without an active round: the activation seam operates purely on
    // the mode-level runtimeState, so the round's own progress is irrelevant here
    // (and the combo round validator rejects the empty placeholder round).
    const restoreAround = (presentationActivatedAt: string | null) => {
      const withoutRound = {
        ...runtimeAround(
          comboQuestionState(launchDeadline),
          presentationActivatedAt,
        ),
      };
      delete (withoutRound as { activeRound?: unknown }).activeRound;
      return GameplayRuntime.restore(
        withoutRound as GameplayRuntimeState,
        COMBO_GAMEPLAY_PLUGIN,
      );
    };

    it('stamps activation once and re-anchors the deadline to activation time', () => {
      const runtime = restoreAround(null);
      const activateAt = new Date(LAUNCH.getTime() + 20_000);
      runtime.activatePresentation('cmd-1', 'actor-1', activateAt);

      const after = runtime.serialize();
      expect(after.presentationActivatedAt).toBe(activateAt.toISOString());
      expect(after.runtimeState.deadlineAt).toBe(
        new Date(
          activateAt.getTime() + COMBO_QUESTION_SECONDS * 1000,
        ).toISOString(),
      );
    });

    it('is idempotent: a second ready never re-stamps activation or the deadline', () => {
      const runtime = restoreAround(null);
      const activateAt = new Date(LAUNCH.getTime() + 20_000);
      runtime.activatePresentation('cmd-1', 'actor-1', activateAt);
      const firstDeadline = runtime.serialize().runtimeState.deadlineAt;

      // A later duplicate ready (e.g. a reconnect) must not move either anchor.
      const laterReady = new Date(LAUNCH.getTime() + 50_000);
      runtime.activatePresentation('cmd-2', 'actor-1', laterReady);

      const after = runtime.serialize();
      expect(after.presentationActivatedAt).toBe(activateAt.toISOString());
      expect(after.runtimeState.deadlineAt).toBe(firstDeadline);
    });
  });
});
