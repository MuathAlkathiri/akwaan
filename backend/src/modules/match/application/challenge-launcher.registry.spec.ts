import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import {
  ChallengeLauncherRegistry,
  MatchChallengeLauncher,
} from './challenge-launcher.registry';

const launcher = (key: string): MatchChallengeLauncher => ({
  key,
  launchRequirements: { contentItemCount: 3, requiresPhones: true },
  supports: (input) => input.challengeTypeSlug === key,
  validateLaunch: () => Promise.resolve(),
  launch: () => Promise.resolve({ runtimeId: `${key}-runtime` }),
  detectTerminal: (runtime: GameplayRuntimeState) =>
    runtime.runtimeState.phase === 'completed',
  buildCompletionSummary: () => ({ challengeKey: key, details: {} }),
});

describe('ChallengeLauncherRegistry', () => {
  it('resolves a launcher by the mechanic slug', () => {
    const registry = new ChallengeLauncherRegistry();
    registry.register(launcher('read-your-opponent'));
    registry.register(launcher('top-5'));

    expect(
      registry.find({ challengeTypeSlug: 'read-your-opponent' })?.key,
    ).toBe('read-your-opponent');
    expect(registry.keys()).toEqual(['read-your-opponent', 'top-5']);
  });

  it('refuses a second launcher for the same mechanic', () => {
    const registry = new ChallengeLauncherRegistry();
    registry.register(launcher('top-5'));

    expect(() => registry.register(launcher('top-5'))).toThrow(
      /already registered/,
    );
  });

  it('reports an unregistered mechanic instead of guessing one', () => {
    const registry = new ChallengeLauncherRegistry();
    registry.register(launcher('top-5'));

    expect(
      registry.find({ challengeTypeSlug: 'same-wavelength' }),
    ).toBeUndefined();
    expect(() =>
      registry.require({ challengeTypeSlug: 'same-wavelength' }),
    ).toThrow(/No launcher is registered/);
  });
});
