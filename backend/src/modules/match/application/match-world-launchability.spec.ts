import { MatchWorldCatalog } from './match-world.catalog';
import { ChallengeLauncherRegistry } from './challenge-launcher.registry';
import type { MatchChallengeLauncher } from './challenge-launcher.registry';
import { MatchSlotLaunchability } from '../domain/match.constants';
import { WorldReadinessService } from '../../world-content/application/world-readiness.service';
import { ODD_PIECE_MODE_KEY } from '../../live-game-sessions/domain/odd-piece-gameplay.plugin';
import { MARHALA_MODE_KEY } from '../../live-game-sessions/domain/marhala-board';

/**
 * Which configured board slots a player may actually open.
 *
 * The Cars board shipped a `slot_1` displaying **القطعة الدخيلة** whose
 * ChallengeType carried the Admin-generated slug `mechanic-1788286859228`
 * instead of the canonical `odd-piece`. Every layer then behaved correctly and
 * the player still saw a dead card: no launcher answers to that slug, so the
 * slot projected `configured_but_unimplemented` and the board rendered
 * "هذا التحدي مو مفعّل في أكوان" — on a brand-new Match, because the wrong slug
 * lives on the configuration, not on the Match.
 *
 * Every other spec that touches launchability stubs `launchabilityFor`, so
 * nothing exercised the real registry lookup. These do: the gate is driven by
 * the actual `ChallengeLauncherRegistry`, and the canonical slug is asserted
 * against the mechanic's own exported key rather than a copy of the string.
 */
describe('MatchWorldCatalog launchability (real registry)', () => {
  const launcherFor = (key: string): MatchChallengeLauncher =>
    ({
      key,
      supports: (input: { challengeTypeSlug: string; runtimeKey?: string }) =>
        input.runtimeKey === key || input.challengeTypeSlug === key,
    }) as unknown as MatchChallengeLauncher;

  const catalogWith = (...keys: string[]) => {
    const registry = new ChallengeLauncherRegistry();
    for (const key of keys) registry.register(launcherFor(key));
    return new MatchWorldCatalog(
      {} as unknown as WorldReadinessService,
      registry,
    );
  };

  it('marks a slot launchable when its slug is the canonical mechanic key', () => {
    const catalog = catalogWith(ODD_PIECE_MODE_KEY);

    expect(
      catalog.launchabilityFor({ challengeTypeSlug: ODD_PIECE_MODE_KEY }),
    ).toBe(MatchSlotLaunchability.LAUNCHABLE);
  });

  it('keeps the canonical Odd Piece key spelled exactly one way', () => {
    // A rename to odd_piece/oddPiece would silently unlaunch every Cars board.
    expect(ODD_PIECE_MODE_KEY).toBe('odd-piece');
  });

  it('marks the canonical Marhala key launchable', () => {
    const catalog = catalogWith(MARHALA_MODE_KEY);

    expect(
      catalog.launchabilityFor({ challengeTypeSlug: MARHALA_MODE_KEY }),
    ).toBe(MatchSlotLaunchability.LAUNCHABLE);
    expect(MARHALA_MODE_KEY).toBe('marhala');
  });

  it('reproduces the Video Games defect: المرحلة bound to a generated slug', () => {
    const catalog = catalogWith(MARHALA_MODE_KEY);

    // The exact slug production bound to the المرحلة slot.
    expect(
      catalog.launchabilityFor({
        challengeTypeSlug: 'mechanic-1787503326785',
      }),
    ).toBe(MatchSlotLaunchability.CONFIGURED_BUT_UNIMPLEMENTED);
  });

  it('reproduces the Cars defect: an Admin-generated slug is not launchable', () => {
    const catalog = catalogWith(ODD_PIECE_MODE_KEY);

    // The exact slug production bound to the القطعة الدخيلة slot.
    expect(
      catalog.launchabilityFor({
        challengeTypeSlug: 'mechanic-1788286859228',
      }),
    ).toBe(MatchSlotLaunchability.CONFIGURED_BUT_UNIMPLEMENTED);
  });

  it.each(['odd_piece', 'oddPiece', 'Odd-Piece', ' odd-piece'])(
    'does not silently normalise the near-miss slug %p',
    (slug) => {
      const catalog = catalogWith(ODD_PIECE_MODE_KEY);

      expect(catalog.launchabilityFor({ challengeTypeSlug: slug })).toBe(
        MatchSlotLaunchability.CONFIGURED_BUT_UNIMPLEMENTED,
      );
    },
  );

  it('keeps a genuinely unregistered mechanic locked', () => {
    const catalog = catalogWith(ODD_PIECE_MODE_KEY);

    expect(
      catalog.launchabilityFor({ challengeTypeSlug: 'not-a-mechanic' }),
    ).toBe(MatchSlotLaunchability.CONFIGURED_BUT_UNIMPLEMENTED);
  });

  it('reports an absent slot as unavailable rather than launchable', () => {
    expect(catalogWith(ODD_PIECE_MODE_KEY).launchabilityFor(undefined)).toBe(
      MatchSlotLaunchability.UNAVAILABLE,
    );
  });
});
