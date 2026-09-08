import {
  PRODUCTION_MECHANICS,
  productionMechanicDefinition,
  productionMechanicSystemFields,
} from '../../src/modules/world-content/domain/production-mechanic.definition';

/** Canonical admin fixture derived from the production runtime contract. */
export function productionMechanicFixture(
  slug: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const definition = productionMechanicDefinition(slug);
  if (!definition) throw new Error(`Unknown production mechanic: ${slug}`);
  return {
    name: definition.seed.name,
    description: definition.seed.description,
    ...productionMechanicSystemFields(definition),
    defaultPresentation: { ...definition.seed.defaultPresentation },
    ...overrides,
  };
}

/**
 * Canonical launchable mechanics to pad a four-slot board with.
 *
 * A World only activates when all four slots hold a mechanic the runtime can
 * actually launch, so a suite testing one mechanic still needs three real ones
 * beside it. Inventing slugs for those slots is what made these fixtures rot:
 * readiness correctly refuses a board holding a mechanic with no launcher, and
 * the suite then fails long before the behaviour it was written to check.
 *
 * `exclude` keeps the mechanic under test out of the padding, so a suite never
 * accidentally seats it twice and trips the duplicate-mechanic rule.
 */
export function canonicalFillerFixtures(input: {
  exclude?: readonly string[];
  count: number;
  overrides?: Record<string, unknown>;
}): Record<string, unknown>[] {
  const exclude = new Set(input.exclude ?? []);
  const available = PRODUCTION_MECHANICS.map(
    (mechanic) => mechanic.slug,
  ).filter((slug) => !exclude.has(slug));
  if (available.length < input.count) {
    throw new Error(
      `Only ${available.length} canonical mechanics remain after exclusions; ${input.count} requested`,
    );
  }
  return available
    .slice(0, input.count)
    .map((slug) => productionMechanicFixture(slug, input.overrides ?? {}));
}
