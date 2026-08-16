import {
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
