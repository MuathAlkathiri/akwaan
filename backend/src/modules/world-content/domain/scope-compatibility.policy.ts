import { Injectable } from '@nestjs/common';
import { BoardSlot } from './board-definition.policy';
import {
  WORLD_BOARD_SLOT_COUNT,
  WorldContentStatus,
} from './world-content.constants';
import { issue } from './world-content.errors';
import { ScopeView, WorldContentIssue } from './world-content.types';

export interface ScopeCompatibilityInput {
  scope: ScopeView;
  /** The World board this Scope draws from. */
  boardSlots: BoardSlot[];
  /** Every challenge type id that currently exists, for reference checking. */
  knownChallengeTypeIds: ReadonlySet<string>;
}

export interface ScopeCompatibility {
  scopeId: string;
  usableSlots: BoardSlot[];
  excludedSlots: BoardSlot[];
  blockers: WorldContentIssue[];
  warnings: WorldContentIssue[];
}

/**
 * Roadmap 5.2: not every Scope is compatible with every mechanic, and the
 * readiness calculation must respect exclusions rather than silently ignore
 * them. The first thing that breaks is a narrow Scope falling below the
 * four-challenge board minimum, so that case is a first-class blocker.
 */
@Injectable()
export class ScopeCompatibilityPolicy {
  evaluate(input: ScopeCompatibilityInput): ScopeCompatibility {
    const blockers: WorldContentIssue[] = [];
    const warnings: WorldContentIssue[] = [];
    const excludedIds = new Set<string>();

    for (const challengeTypeId of input.scope.excludedChallengeTypeIds) {
      if (excludedIds.has(challengeTypeId)) {
        warnings.push(
          issue(
            'DUPLICATE_SCOPE_EXCLUSION',
            'A challenge type is excluded more than once',
            { scopeId: input.scope.id, challengeTypeId },
          ),
        );
        continue;
      }
      excludedIds.add(challengeTypeId);
      if (!input.knownChallengeTypeIds.has(challengeTypeId)) {
        blockers.push(
          issue(
            'SCOPE_EXCLUDES_UNKNOWN_CHALLENGE_TYPE',
            'A Scope excludes a challenge type that no longer exists',
            { scopeId: input.scope.id, challengeTypeId },
          ),
        );
      }
    }

    const usableSlots = input.boardSlots.filter(
      (slot) => !excludedIds.has(slot.challengeTypeId),
    );
    const excludedSlots = input.boardSlots.filter((slot) =>
      excludedIds.has(slot.challengeTypeId),
    );

    if (usableSlots.length < WORLD_BOARD_SLOT_COUNT) {
      blockers.push(
        issue(
          'SCOPE_EXCLUSIONS_BELOW_BOARD_MINIMUM',
          `After Scope exclusions only ${usableSlots.length} of the ${WORLD_BOARD_SLOT_COUNT} World challenges remain playable for this Scope`,
          {
            scopeId: input.scope.id,
            usableCount: usableSlots.length,
            requiredCount: WORLD_BOARD_SLOT_COUNT,
            excludedChallengeTypeIds: excludedSlots.map(
              (slot) => slot.challengeTypeId,
            ),
          },
        ),
      );
    }

    if (input.scope.status === WorldContentStatus.ARCHIVED) {
      warnings.push(
        issue(
          'SCOPE_ARCHIVED',
          'An archived Scope contributes no content to its World',
          { scopeId: input.scope.id },
        ),
      );
    }

    return {
      scopeId: input.scope.id,
      usableSlots,
      excludedSlots,
      blockers,
      warnings,
    };
  }

  /**
   * The single expression of "may this Scope's content be played through this
   * mechanic?" — used by content compatibility and by the legacy classification
   * bridge so the exclusion rule is never restated.
   */
  static isChallengeTypeAllowed(
    scope: Pick<ScopeView, 'excludedChallengeTypeIds'>,
    challengeTypeId: string,
  ): boolean {
    return !scope.excludedChallengeTypeIds.includes(challengeTypeId);
  }
}
