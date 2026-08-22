import { Injectable } from '@nestjs/common';
import { ConfiguredWorldOccurrence } from '../domain/configured-world-occurrence';
import {
  MatchBoardPositionConfiguration,
  UnifiedBoardSlotDefinition,
  UnifiedBoardWorldDefinition,
  UnifiedMatchBoardPolicy,
} from '../domain/unified-match-board.policy';
import { UnifiedMatchSetupPolicy } from '../domain/unified-match-setup.policy';
import { MatchContentPool } from './match-content-pool.service';
import { MatchWorldCatalog } from './match-world.catalog';

export interface ValidatedUnifiedMatchSetup {
  occurrences: ConfiguredWorldOccurrence[];
  boardPositions: MatchBoardPositionConfiguration[];
}

/**
 * The one place a proposed unified Match setup is checked.
 *
 * The structural contract — three occurrences, indexed 0/1/2, four distinct
 * Scopes each, and whether a repeated World is allowed — belongs to
 * `UnifiedMatchSetupPolicy`. Whether the ids name real, active, playable World
 * Content belongs to `MatchWorldCatalog` and `MatchContentPool`. This validator
 * only sequences them and hands back everything a Match needs to exist, so no
 * controller, use case, or aggregate restates any of it.
 *
 * Nothing here writes. A configuration that fails leaves no Match behind because
 * no Match has been built yet.
 */
@Injectable()
export class UnifiedMatchSetupValidator {
  constructor(
    private readonly worlds: MatchWorldCatalog,
    private readonly contentPool: MatchContentPool,
    private readonly setupPolicy: UnifiedMatchSetupPolicy,
    private readonly boardPolicy: UnifiedMatchBoardPolicy,
  ) {}

  async validate(
    occurrences: readonly ConfiguredWorldOccurrence[],
  ): Promise<ValidatedUnifiedMatchSetup> {
    const configured = this.setupPolicy.assertConfiguration(occurrences);

    const slotsByOccurrenceIndex = new Map<
      number,
      UnifiedBoardSlotDefinition[]
    >();
    const worldsById = new Map<string, UnifiedBoardWorldDefinition>();
    for (const occurrence of configured) {
      // Asserts the World exists, is active, and has a valid four-position board.
      // A repeated World is resolved again on purpose: the two occurrences are
      // independent, and nothing is shared between them but the worldId.
      const schedule = await this.worlds.scheduleFor(occurrence.worldId);
      worldsById.set(occurrence.worldId, {
        worldId: occurrence.worldId,
        name: schedule.worldName,
      });
      slotsByOccurrenceIndex.set(
        occurrence.occurrenceIndex,
        schedule.slots.map((slot) => ({
          slotKey: slot.slotKey,
          challengeTypeId: slot.challengeTypeId,
          challengeTypeSlug: slot.challengeTypeSlug,
          displayName: slot.displayName,
          ...(slot.description ? { description: slot.description } : {}),
          ...(slot.instructions ? { instructions: slot.instructions } : {}),
          ...(slot.playerInstructions
            ? { playerInstructions: slot.playerInstructions }
            : {}),
        })),
      );
      await this.contentPool.assertOccurrencePool({
        occurrenceIndex: occurrence.occurrenceIndex,
        worldId: occurrence.worldId,
        scopeIds: occurrence.selectedScopeIds,
        boardChallengeTypeIds: schedule.slots.map(
          (slot) => slot.challengeTypeId,
        ),
      });
    }

    return {
      occurrences: configured,
      boardPositions: this.boardPolicy.buildPositions(
        configured,
        slotsByOccurrenceIndex,
        worldsById,
      ),
    };
  }
}
