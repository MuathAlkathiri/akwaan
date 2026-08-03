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
 * One selectable World, reduced to the facts the constraint needs. The full
 * Match aggregate is a later phase; this contract is what it will call.
 */
export interface MatchWorldCandidate {
  worldId: string;
  worldName: string;
  status: WorldContentStatus;
  boardReady: boolean;
  hasRelationalFlexSlot: boolean;
}

export interface MatchWorldSelectionReport extends ReadinessReport {
  worldIds: string[];
  relationalChallengeCount: number;
}

/**
 * Roadmap 3.1: every Match selects exactly three Worlds, and at least one of
 * them must carry a Relational challenge. A match with zero Relational
 * challenges is a misconfiguration, not a valid variation.
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
          `A match requires exactly ${MATCH_WORLD_SELECTION_COUNT} Worlds, received ${worldIds.length}`,
          { expected: MATCH_WORLD_SELECTION_COUNT, actual: worldIds.length },
        ),
      );
    }
    const unique = new Set(worldIds);
    if (unique.size !== worldIds.length) {
      blockers.push(
        issue(
          'MATCH_WORLD_DUPLICATED',
          'The same World cannot be selected twice in one match',
          { worldIds },
        ),
      );
    }

    const selected: MatchWorldCandidate[] = [];
    for (const worldId of unique) {
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
      (candidate) => candidate.hasRelationalFlexSlot,
    ).length;
    if (relationalChallengeCount < MATCH_MINIMUM_RELATIONAL_CHALLENGE_COUNT) {
      blockers.push(
        issue(
          'MATCH_WITHOUT_RELATIONAL_CHALLENGE',
          `A match must contain at least ${MATCH_MINIMUM_RELATIONAL_CHALLENGE_COUNT} Relational challenge across its Worlds`,
          {
            required: MATCH_MINIMUM_RELATIONAL_CHALLENGE_COUNT,
            actual: relationalChallengeCount,
          },
        ),
      );
    }

    return {
      ...buildReadinessReport(blockers),
      worldIds: [...unique],
      relationalChallengeCount,
    };
  }
}
