import { CORE_ROUND_RUNTIME_PLUGIN } from './gameplay-mode.plugin';
import { GameplayRuntime } from './gameplay-runtime';

describe('GameplayRuntime', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const create = () =>
    GameplayRuntime.create({
      id: 'runtime-1',
      sessionId: 'session-1',
      plugin: CORE_ROUND_RUNTIME_PLUGIN,
      commandId: 'create-command',
      actorId: 'host-1',
      now,
      expiresAt: new Date(now.getTime() + 60_000),
    });

  it('enforces runtime and round lifecycle transitions', () => {
    const runtime = create();
    expect(() =>
      runtime.createRound({ commandId: 'round-early', actorId: 'host-1' }, now),
    ).toThrow(
      expect.objectContaining({ code: 'INVALID_GAMEPLAY_RUNTIME_TRANSITION' }),
    );
    runtime.start('start-runtime', 'host-1', now);
    const round = runtime.createRound(
      {
        commandId: 'create-round',
        actorId: 'host-1',
        activeTeamId: 'team-1',
      },
      now,
    );
    expect(() =>
      runtime.createRound(
        { commandId: 'second-round', actorId: 'host-1' },
        now,
      ),
    ).toThrow(expect.objectContaining({ code: 'ACTIVE_ROUND_EXISTS' }));
    runtime.startRound(round.id, 'start-round', 'host-1', now);
    runtime.pauseRound(round.id, 'pause-round', 'host-1', now);
    runtime.resumeRound(round.id, 'resume-round', 'host-1', now);
    runtime.completeRound({
      roundId: round.id,
      commandId: 'complete-round',
      actorId: 'host-1',
      reason: 'complete',
      now,
    });
    runtime.complete('complete-runtime', 'host-1', now);
    expect(runtime.serialize()).toMatchObject({
      status: 'completed',
      revision: 8,
      completedRounds: [{ id: round.id, sequence: 1 }],
    });
    expect(() => runtime.start('late', 'host-1', now)).toThrow(
      expect.objectContaining({ code: 'INVALID_GAMEPLAY_RUNTIME_TRANSITION' }),
    );
  });

  it('protects revisions, duplicate IDs, and validated mode state', () => {
    const runtime = create();
    expect(runtime.isDuplicate('create-command')).toBe(true);
    expect(() => runtime.assertRevision(0)).toThrow(
      expect.objectContaining({ code: 'STALE_RUNTIME_REVISION' }),
    );
    runtime.start('start-runtime', 'host-1', now);
    const round = runtime.createRound(
      { commandId: 'create-round', actorId: 'host-1' },
      now,
    );
    runtime.startRound(round.id, 'start-round', 'host-1', now);
    expect(() =>
      runtime.applyModeState({
        commandId: 'bad-state',
        actorId: 'host-1',
        runtimeState: { arbitrary: true },
        roundState: { phase: 'presenting' },
        eventType: 'round-state-changed',
        eventPayload: {},
        now,
        sessionRevision: 1,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_MODE_STATE' }));
  });

  it('bounds commands, transitions, events, and completed summaries', () => {
    const state = create().serialize();
    state.processedCommandIds = Array.from(
      { length: 150 },
      (_, index) => `command-${index}`,
    );
    state.transitions = Array.from({ length: 150 }, (_, index) => ({
      revision: index,
      type: 'test',
      timestamp: now,
    }));
    state.events = Array.from({ length: 150 }, (_, index) => ({
      id: `event-${index}`,
      sequence: index,
      type: 'test',
      timestamp: now,
      payload: {},
      runtimeRevision: index,
    }));
    const restored = GameplayRuntime.restore(state, CORE_ROUND_RUNTIME_PLUGIN);
    restored.start('bounded', 'host-1', now);
    const bounded = restored.serialize();
    expect(bounded.processedCommandIds).toHaveLength(100);
    expect(bounded.transitions).toHaveLength(100);
    expect(bounded.events).toHaveLength(100);
  });
});
