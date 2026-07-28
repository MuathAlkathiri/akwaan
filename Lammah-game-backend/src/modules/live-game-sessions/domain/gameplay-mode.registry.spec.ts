import { GameplayModeRegistry } from './gameplay-mode.registry';

describe('GameplayModeRegistry', () => {
  const registry = new GameplayModeRegistry();

  it('resolves plugins by exact key and version', () => {
    const plugin = registry.resolve('core-round-runtime', 1);
    expect(plugin.createInitialRuntimeState({} as never)).toEqual({
      phase: 'waiting',
    });
    expect(() => registry.resolve('core-round-runtime', 2)).toThrow(
      expect.objectContaining({ code: 'GAMEPLAY_PLUGIN_NOT_FOUND' }),
    );
  });

  it('validates payloads and reduces deterministically', () => {
    const plugin = registry.resolve('core-round-runtime', 1);
    const definition = plugin.command('advance-phase');
    expect(definition?.validatePayload({})).toEqual({});
    expect(() => definition?.validatePayload({ unsafe: true })).toThrow(
      expect.objectContaining({ code: 'INVALID_GAMEPLAY_COMMAND' }),
    );
    const input = {
      type: 'advance-phase',
      payload: {},
      runtimeState: { phase: 'waiting' },
      roundState: { phase: 'waiting' },
    };
    expect(plugin.handleCommand({} as never, input)).toEqual(
      plugin.handleCommand({} as never, input),
    );
    expect(plugin.handleCommand({} as never, input).roundState).toEqual({
      phase: 'presenting',
    });
  });
});
