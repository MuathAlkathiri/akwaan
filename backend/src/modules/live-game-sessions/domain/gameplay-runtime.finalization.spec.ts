import { CORE_ROUND_RUNTIME_PLUGIN } from './gameplay-mode.plugin';
import { GameplayRuntime, isTerminalRuntimeStatus } from './gameplay-runtime';

/**
 * Finalization is reached from several directions for the same challenge — the
 * last player command, an expired deadline resolving the final item, a
 * reconnect replaying a resolution. Before this was idempotent, the second
 * arrival threw, and because finalization runs inside the same transaction as
 * the completion itself, that exception rolled the completion back. The
 * challenge stayed non-terminal in Mongo while looking finished on screen, and
 * `GAMEPLAY_RUNTIME_EXISTS` then blocked the next challenge in the session.
 */
describe('GameplayRuntime finalization is idempotent', () => {
  const now = new Date('2026-08-14T00:00:00.000Z');

  const started = () => {
    const runtime = GameplayRuntime.create({
      id: 'runtime-1',
      sessionId: 'session-1',
      plugin: CORE_ROUND_RUNTIME_PLUGIN,
      commandId: 'create',
      actorId: 'host-1',
      now,
      expiresAt: new Date(now.getTime() + 600_000),
    });
    runtime.start('start-runtime', 'host-1', now);
    const round = runtime.createRound(
      { commandId: 'create-round', actorId: 'host-1', activeTeamId: 'team-1' },
      now,
    );
    runtime.startRound(round.id, 'start-round', 'host-1', now);
    return { runtime, round };
  };

  const finish = (
    runtime: GameplayRuntime,
    roundId: string,
    suffix: string,
  ) => {
    runtime.completeRound({
      roundId,
      commandId: `round-complete:${suffix}`,
      actorId: 'host-1',
      reason: 'items_completed',
      now,
    });
    runtime.complete(`runtime-complete:${suffix}`, 'host-1', now);
  };

  it('reaches a terminal status the session guard accepts', () => {
    const { runtime, round } = started();
    finish(runtime, round.id, 'first');

    expect(runtime.status).toBe('completed');
    expect(runtime.isTerminal).toBe(true);
    expect(isTerminalRuntimeStatus(runtime.serialize().status)).toBe(true);
    expect(runtime.serialize().activeRound).toBeUndefined();
  });

  it('survives the same completion arriving twice', () => {
    const { runtime, round } = started();
    finish(runtime, round.id, 'first');
    const afterFirst = runtime.serialize();

    expect(() => finish(runtime, round.id, 'second')).not.toThrow();

    const afterSecond = runtime.serialize();
    expect(afterSecond.status).toBe('completed');
    // No second completion recorded: one challenge, one result.
    expect(afterSecond.completedRounds).toHaveLength(1);
    expect(afterSecond.completedRounds).toEqual(afterFirst.completedRounds);
    expect(afterSecond.completedAt).toEqual(afterFirst.completedAt);
  });

  it('does not advance the revision on a repeated completion', () => {
    const { runtime, round } = started();
    finish(runtime, round.id, 'first');
    const revision = runtime.revision;

    finish(runtime, round.id, 'second');
    finish(runtime, round.id, 'third');

    // A revision bump here would be a phantom transition that clients would
    // resync against, and would make the runtime look mutable after the end.
    expect(runtime.revision).toBe(revision);
  });

  it('records exactly one round completion under a timeout/answer race', () => {
    const { runtime, round } = started();

    // Two resolutions for the same round, as when a player answers at the
    // deadline and the server timeout fires for the same item.
    finish(runtime, round.id, 'answer');
    finish(runtime, round.id, 'timeout');

    const state = runtime.serialize();
    expect(state.completedRounds).toHaveLength(1);
    expect(state.status).toBe('completed');
    expect(
      state.transitions.filter((t) => t.type === 'runtime-completed'),
    ).toHaveLength(1);
    expect(
      state.transitions.filter((t) => t.type === 'round-completed'),
    ).toHaveLength(1);
  });

  it('still refuses to complete while a round is unresolved', () => {
    const { runtime } = started();
    // The guard that keeps a challenge from being closed mid-round has to
    // survive making completion idempotent.
    expect(() => runtime.complete('premature', 'host-1', now)).toThrow(
      expect.objectContaining({ code: 'INVALID_GAMEPLAY_RUNTIME_TRANSITION' }),
    );
    expect(runtime.isTerminal).toBe(false);
  });

  it('keeps a cancelled runtime terminal and immutable', () => {
    const { runtime } = started();
    runtime.cancel('cancel', 'host-1', now);

    expect(runtime.isTerminal).toBe(true);
    expect(() => runtime.cancel('cancel-again', 'host-1', now)).toThrow(
      expect.objectContaining({ code: 'GAMEPLAY_RUNTIME_IMMUTABLE' }),
    );
  });

  it('leaves a completed runtime unable to start another round', () => {
    const { runtime, round } = started();
    finish(runtime, round.id, 'first');

    // Terminal means terminal: the next challenge gets its own runtime rather
    // than reusing this one.
    expect(() =>
      runtime.createRound({ commandId: 'next', actorId: 'host-1' }, now),
    ).toThrow(
      expect.objectContaining({ code: 'INVALID_GAMEPLAY_RUNTIME_TRANSITION' }),
    );
  });
});
