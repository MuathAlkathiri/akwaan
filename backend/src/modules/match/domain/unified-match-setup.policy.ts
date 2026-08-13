import { ConfiguredWorldOccurrence } from './configured-world-occurrence';
import {
  MATCH_SCOPES_PER_OCCURRENCE,
  MATCH_WORLD_OCCURRENCE_COUNT,
} from './match.constants';
import { MatchDomainError } from './match.errors';

/**
 * Whether one World may appear at more than one position of the same Match.
 *
 * This is the single expression of the rule. Turning repetition off is a one-line
 * change here plus its tests — no validator, controller, or aggregate restates
 * it, and it is deliberately not exposed as an admin or World-level override.
 */
export interface MatchWorldRepetitionPolicy {
  allowRepeatedWorlds: boolean;
}

export const MATCH_WORLD_REPETITION_POLICY: MatchWorldRepetitionPolicy = {
  allowRepeatedWorlds: true,
};

/**
 * The structural contract of a unified Match setup.
 *
 * Exactly three occurrences, indexed 0/1/2, each naming one World and exactly
 * four distinct Scopes. Whether those ids actually exist, are active, and belong
 * to that World is a World Content question and is asserted by
 * `UnifiedMatchSetupValidator`; this policy owns only the shape, and it is the
 * one place the shape is decided — the aggregate calls it too, so a Match can
 * never be constructed around a configuration nobody checked.
 */
export class UnifiedMatchSetupPolicy {
  constructor(
    private readonly repetition: MatchWorldRepetitionPolicy = MATCH_WORLD_REPETITION_POLICY,
  ) {}

  /** Returns the occurrences in index order, or throws. */
  assertConfiguration(
    occurrences: readonly ConfiguredWorldOccurrence[],
  ): ConfiguredWorldOccurrence[] {
    if (occurrences.length !== MATCH_WORLD_OCCURRENCE_COUNT) {
      throw new MatchDomainError(
        'UNIFIED_OCCURRENCE_COUNT_INVALID',
        `A match is configured with exactly ${MATCH_WORLD_OCCURRENCE_COUNT} World occurrences, received ${occurrences.length}`,
      );
    }

    const indexes = occurrences.map((occurrence) => occurrence.occurrenceIndex);
    if (new Set(indexes).size !== indexes.length) {
      throw new MatchDomainError(
        'UNIFIED_OCCURRENCE_INDEX_DUPLICATED',
        'Every configured World occurrence needs its own index',
      );
    }
    const expected = [...Array(MATCH_WORLD_OCCURRENCE_COUNT).keys()];
    if (expected.some((index) => !indexes.includes(index))) {
      throw new MatchDomainError(
        'UNIFIED_OCCURRENCE_INDEX_INVALID',
        `The configured World occurrences must be indexed ${expected.join(', ')}`,
      );
    }

    const ordered = expected.map(
      (index) =>
        occurrences.find(
          (occurrence) => occurrence.occurrenceIndex === index,
        ) as ConfiguredWorldOccurrence,
    );

    for (const occurrence of ordered) {
      if (!occurrence.worldId) {
        throw new MatchDomainError(
          'UNIFIED_OCCURRENCE_WORLD_REQUIRED',
          `World occurrence ${occurrence.occurrenceIndex} names no World`,
        );
      }
      if (occurrence.selectedScopeIds.length !== MATCH_SCOPES_PER_OCCURRENCE) {
        throw new MatchDomainError(
          'SCOPE_SELECTION_COUNT_INVALID',
          `Each World occurrence is played from exactly ${MATCH_SCOPES_PER_OCCURRENCE} Scopes, occurrence ${occurrence.occurrenceIndex} received ${occurrence.selectedScopeIds.length}`,
        );
      }
      if (
        new Set(occurrence.selectedScopeIds).size !==
        occurrence.selectedScopeIds.length
      ) {
        throw new MatchDomainError(
          'SCOPE_SELECTION_DUPLICATED',
          `The same Scope cannot be selected twice for World occurrence ${occurrence.occurrenceIndex}`,
        );
      }
    }

    // Repeated Scope pools across *different* occurrences are legitimate: two
    // occurrences of one World may deliberately be played from the same four.
    if (!this.repetition.allowRepeatedWorlds) {
      const worldIds = ordered.map((occurrence) => occurrence.worldId);
      if (new Set(worldIds).size !== worldIds.length) {
        throw new MatchDomainError(
          'UNIFIED_WORLD_REPEATED',
          'A World may be played only once in a match',
        );
      }
    }

    return ordered.map((occurrence) => ({
      occurrenceIndex: occurrence.occurrenceIndex,
      worldId: occurrence.worldId,
      selectedScopeIds: [...occurrence.selectedScopeIds],
    }));
  }
}

/**
 * The shared instance. The aggregate is not a Nest provider, so the policy is a
 * plain stateless object and the module binds this same instance rather than
 * constructing a second one.
 */
export const unifiedMatchSetupPolicy = new UnifiedMatchSetupPolicy();
