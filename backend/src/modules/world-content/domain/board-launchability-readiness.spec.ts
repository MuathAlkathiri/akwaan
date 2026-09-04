import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { BoardDefinitionPolicy } from './board-definition.policy';
import { ChallengeLaunchabilityRegistry } from './challenge-launchability.registry';
import { ChallengePresentationPolicy } from './challenge-presentation.policy';
import { ChallengeTypePolicy } from './challenge-type.policy';
import { validBoard } from './world-content.fixtures';
import { MARHALA_SLUG, ODD_PIECE_SLUG } from './world-content.constants';

/**
 * A board is only ready if the game can actually open every enabled position.
 *
 * Production shipped two Worlds whose signature slot displayed a real mechanic
 * name — القطعة الدخيلة and المرحلة — over an Admin-generated ChallengeType slug
 * that no launcher answers to. Readiness reported clean, so nobody saw it until
 * players did. These pin the blocker that now refuses that state, and pin just
 * as hard that it stays out of the way of every legitimate board.
 */
describe('board launchability readiness', () => {
  const buildPolicy = (launchability?: ChallengeLaunchabilityRegistry) =>
    new BoardDefinitionPolicy(
      new ChallengeTypePolicy(
        new ChallengePresentationPolicy(),
        new ScoringRuleRegistry(),
      ),
      launchability,
    );

  /** A runtime that can launch exactly the mechanics it is told about. */
  const runtimeSupporting = (...slugs: string[]) => {
    const registry = new ChallengeLaunchabilityRegistry();
    registry.publish((slug) => slugs.includes(slug));
    return registry;
  };

  const codesFor = (
    launchability: ChallengeLaunchabilityRegistry | undefined,
    mutate: (input: ReturnType<typeof validBoard>) => void = () => {},
  ) => {
    const input = validBoard();
    mutate(input);
    return buildPolicy(launchability)
      .build(input)
      .blockers.map((problem) => problem.code);
  };

  /** Every mechanic the fixture board actually uses. */
  const boardSlugs = () => {
    const input = validBoard();
    return [...input.challengeTypes.values()].map((type) => type.slug);
  };

  it('raises no launchability blocker when every enabled mechanic has a launcher', () => {
    expect(codesFor(runtimeSupporting(...boardSlugs()))).not.toContain(
      'CHALLENGE_LAUNCHER_NOT_IMPLEMENTED',
    );
  });

  it.each([
    ['Cars / القطعة الدخيلة', ODD_PIECE_SLUG, 'mechanic-1788286859228'],
    ['Video Games / المرحلة', MARHALA_SLUG, 'mechanic-1787503326785'],
  ])(
    'blocks readiness for %s when the slot carries a generated slug',
    (_label, canonical, generated) => {
      const slugs = boardSlugs();
      const runtime = runtimeSupporting(...slugs, canonical);

      // The slot still displays the mechanic's real name; only its slug drifted.
      const codes = codesFor(runtime, (input) => {
        const [first] = [...input.challengeTypes.values()];
        input.challengeTypes.set(first.id, { ...first, slug: generated });
      });

      expect(codes).toContain('CHALLENGE_LAUNCHER_NOT_IMPLEMENTED');
    },
  );

  it('carries slot, ChallengeType id and slug so an author can find the slot', () => {
    const slugs = boardSlugs();
    const input = validBoard();
    const [first] = [...input.challengeTypes.values()];
    input.challengeTypes.set(first.id, {
      ...first,
      slug: 'mechanic-1788286859228',
    });

    const blocker = buildPolicy(runtimeSupporting(...slugs))
      .build(input)
      .blockers.find(
        (problem) => problem.code === 'CHALLENGE_LAUNCHER_NOT_IMPLEMENTED',
      );

    expect(blocker?.details).toMatchObject({
      challengeTypeId: first.id,
      challengeTypeSlug: 'mechanic-1788286859228',
    });
    expect(blocker?.details).toHaveProperty('slotKey');
    expect(blocker?.details).toHaveProperty('configurationId');
  });

  it('blocks an unknown mechanic the same way', () => {
    const codes = codesFor(runtimeSupporting(...boardSlugs()), (input) => {
      const [first] = [...input.challengeTypes.values()];
      input.challengeTypes.set(first.id, { ...first, slug: 'not-a-mechanic' });
    });

    expect(codes).toContain('CHALLENGE_LAUNCHER_NOT_IMPLEMENTED');
  });

  it('never normalises a near-miss slug into the canonical one', () => {
    for (const near of ['odd_piece', 'oddPiece', 'Odd-Piece']) {
      const codes = codesFor(
        runtimeSupporting(...boardSlugs(), ODD_PIECE_SLUG),
        (input) => {
          const [first] = [...input.challengeTypes.values()];
          input.challengeTypes.set(first.id, { ...first, slug: near });
        },
      );
      expect(codes).toContain('CHALLENGE_LAUNCHER_NOT_IMPLEMENTED');
    }
  });

  it('ignores a disabled slot, which cannot be opened in a Match anyway', () => {
    const codes = codesFor(runtimeSupporting(...boardSlugs()), (input) => {
      const [first] = [...input.challengeTypes.values()];
      input.challengeTypes.set(first.id, {
        ...first,
        slug: 'mechanic-1788286859228',
      });
      input.configurations = input.configurations.map((configuration) =>
        configuration.challengeTypeId === first.id
          ? { ...configuration, isEnabled: false }
          : configuration,
      );
    });

    expect(codes).not.toContain('CHALLENGE_LAUNCHER_NOT_IMPLEMENTED');
  });

  it('stays silent when no runtime has published what it supports', () => {
    // A policy unit test with no runtime wired asserts content rules only; it
    // must not start reporting every mechanic as unlaunchable.
    expect(codesFor(undefined)).not.toContain(
      'CHALLENGE_LAUNCHER_NOT_IMPLEMENTED',
    );
  });

  it('leaves content readiness a separate judgement', () => {
    // A launchable mechanic with no content is a *content* problem, and the
    // launchability blocker must not appear alongside it or replace it.
    const codes = codesFor(runtimeSupporting(...boardSlugs()));
    expect(codes).not.toContain('CHALLENGE_LAUNCHER_NOT_IMPLEMENTED');
  });
});

describe('ChallengeLaunchabilityRegistry', () => {
  it('answers "no opinion" until a runtime publishes', () => {
    const registry = new ChallengeLaunchabilityRegistry();
    expect(registry.wired).toBe(false);
    expect(registry.supports('anything')).toBe(true);
  });

  it('delegates to the published answer once wired', () => {
    const registry = new ChallengeLaunchabilityRegistry();
    registry.publish((slug) => slug === ODD_PIECE_SLUG);

    expect(registry.wired).toBe(true);
    expect(registry.supports(ODD_PIECE_SLUG)).toBe(true);
    expect(registry.supports('mechanic-1788286859228')).toBe(false);
  });
});
