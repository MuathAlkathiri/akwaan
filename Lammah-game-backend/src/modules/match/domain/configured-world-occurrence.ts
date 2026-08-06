/**
 * One World occurrence as it is configured *before* gameplay begins.
 *
 * This is the whole pre-match answer for one of the three positions: which World
 * is played there, and which four Scopes that position draws its content from.
 * Two occurrences may name the same World; they stay independent, because
 * identity is the index, never the worldId.
 *
 * The cardinalities (three occurrences, four Scopes each) are enforced in one
 * place only — `UnifiedMatchSetupPolicy`.
 */
export interface ConfiguredWorldOccurrence {
  occurrenceIndex: number;
  worldId: string;
  selectedScopeIds: string[];
}
