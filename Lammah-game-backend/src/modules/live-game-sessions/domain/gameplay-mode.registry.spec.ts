import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { GameplayModeRegistry } from './gameplay-mode.registry';
import { MODE_COMMAND_TYPES } from './gameplay-mode.plugin';

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

/**
 * A command nothing advertises is a command no phone can send.
 *
 * `GameplayAuthorization.availableActions` asks each plugin about commands by
 * name, from `MODE_COMMAND_TYPES`. Renaming a plugin's command without updating
 * that list leaves the server accepting it while every client is told it cannot
 * — which is what silently removed Top 5's keep/give buttons. This walks the
 * plugin sources so the list cannot drift again.
 */
describe('mode command advertisement', () => {
  const pluginDir = join(__dirname);

  it('advertises every command type any plugin answers to', () => {
    const declared = new Set<string>();
    for (const file of readdirSync(pluginDir).filter(
      (name) => name.endsWith('.plugin.ts') && !name.endsWith('.spec.ts'),
    )) {
      const source = readFileSync(join(pluginDir, file), 'utf8');
      for (const match of source.matchAll(/type === '([a-z-]+)'/g)) {
        declared.add(match[1]);
      }
    }
    expect(declared.size).toBeGreaterThan(0);
    expect(
      [...declared].filter((type) => !MODE_COMMAND_TYPES.includes(type)),
    ).toEqual([]);
  });

  it('advertises the Top 5 decision, so a phone can be offered it', () => {
    expect(MODE_COMMAND_TYPES).toContain('decide-card');
    expect(MODE_COMMAND_TYPES).toContain('skip-card');
    // The retired Top 10 commands are gone rather than left advertised.
    expect(MODE_COMMAND_TYPES).not.toContain('assign-card');
    expect(MODE_COMMAND_TYPES).not.toContain('reveal-next');
    expect(MODE_COMMAND_TYPES).not.toContain('timeout-card');
  });
});
