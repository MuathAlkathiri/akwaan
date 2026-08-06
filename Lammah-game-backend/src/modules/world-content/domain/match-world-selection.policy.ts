import { Injectable } from '@nestjs/common';
import {
  MATCH_MINIMUM_RELATIONAL_CHALLENGE_COUNT,
  MATCH_WORLD_SELECTION_COUNT,
  WorldContentStatus,
} from './world-content.constants';
import { issue } from './world-content.errors';
import {
  buildReadinessReport,
  ReadinessReport,
  WorldContentIssue,
} from './world-content.types';

/**
 * One selectable World, reduced to the facts the constraint needs.
 */
export interface MatchWorldCandidate {
  worldId: string;
  worldName: string;
  status: WorldContentStatus;
  boardReady: boolean;
  hasRelationalChallenge: boolean;
}

export interface MatchWorldSelectionReport extends ReadinessReport {
  /** The three chosen World occurrences, in order, repeats included. */
  worldIds: string[];
  /** How many distinct Worlds those occurrences cover. */
  distinctWorldIds: string[];
  relationalChallengeCount: number;
  /** True when the three occurrences are playable at all. */
  structurallyValid: boolean;
  /**
   * Composition rules a *published* Match must satisfy. Kept apart from the
   * structural blockers so a development Match can be played while mechanics are
   * still being built, without the rule being quietly dropped.
   */
  productionBlockers: WorldContentIssue[];
  productionReady: boolean;
}

/**
 * Roadmap 3.1: every Match plays exactly three World occurrences.
 *
 * Two distinct concerns live here and are reported separately:
 *
 * - **Structural validity** (`blockers`): three occurrences, each naming a World
 *   that exists, is active, and has a valid board. A World may legitimately be
 *   chosen more than once — each occurrence keeps its own board progress — so a
 *   repeat is not an error.
 * - **Production composition readiness** (`productionBlockers`): at least one
 *   Relational challenge across the three Worlds. Relational is not implemented
 *   yet, so this must not block a development Match; it is reported explicitly
 *   rather than removed.
 *
 * Whether a configured mechanic can actually be launched is a third concern
 * entirely, and belongs to the Match layer's launcher registry.
 */
@Injectable()
export class MatchWorldSelectionPolicy {
  validateSelectedWorldsForMatch(
    worldIds: string[],
    candidates: MatchWorldCandidate[],
  ): MatchWorldSelectionReport {
    const blockers: WorldContentIssue[] = [];
    const byId = new Map(
      candidates.map((candidate) => [candidate.worldId, candidate]),
    );

    if (worldIds.length !== MATCH_WORLD_SELECTION_COUNT) {
      blockers.push(
        issue(
          'MATCH_WORLD_COUNT_INVALID',
          `A match requires exactly ${MATCH_WORLD_SELECTION_COUNT} World occurrences, received ${worldIds.length}`,
          { expected: MATCH_WORLD_SELECTION_COUNT, actual: worldIds.length },
        ),
      );
    }

    // Repeats are deliberate: each occurrence is validated once, on its merits.
    const distinct = [...new Set(worldIds)];
    const selected: MatchWorldCandidate[] = [];
    for (const worldId of distinct) {
      const candidate = byId.get(worldId);
      if (!candidate) {
        blockers.push(
          issue('MATCH_WORLD_NOT_FOUND', 'A selected World does not exist', {
            worldId,
          }),
        );
        continue;
      }
      selected.push(candidate);
      if (candidate.status !== WorldContentStatus.ACTIVE) {
        blockers.push(
          issue(
            'MATCH_WORLD_NOT_ACTIVE',
            `"${candidate.worldName}" is ${candidate.status} and cannot be selected`,
            { worldId, status: candidate.status },
          ),
        );
      }
      if (!candidate.boardReady) {
        blockers.push(
          issue(
            'MATCH_WORLD_BOARD_NOT_READY',
            `"${candidate.worldName}" does not have a complete four-slot board`,
            { worldId },
          ),
        );
      }
    }

    const relationalChallengeCount = selected.filter(
      (candidate) => candidate.hasRelationalChallenge,
    ).length;
    const productionBlockers: WorldContentIssue[] = [];
    if (relationalChallengeCount < MATCH_MINIMUM_RELATIONAL_CHALLENGE_COUNT) {
      productionBlockers.push(
        issue(
          'MATCH_WITHOUT_RELATIONAL_CHALLENGE',
          `A published match must contain at least ${MATCH_MINIMUM_RELATIONAL_CHALLENGE_COUNT} Relational challenge across its Worlds`,
          {
            required: MATCH_MINIMUM_RELATIONAL_CHALLENGE_COUNT,
            actual: relationalChallengeCount,
          },
        ),
      );
    }

    return {
      // Production composition is surfaced as a warning on the structural
      // report, so it is visible everywhere without blocking development play.
      ...buildReadinessReport(blockers, productionBlockers),
      worldIds: [...worldIds],
      distinctWorldIds: distinct,
      relationalChallengeCount,
      structurallyValid: blockers.length === 0,
      productionBlockers,
      productionReady: blockers.length === 0 && productionBlockers.length === 0,
    };
  }
}
