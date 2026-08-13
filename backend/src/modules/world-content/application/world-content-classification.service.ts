import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ScopeCompatibilityPolicy } from '../domain/scope-compatibility.policy';
import { assertNoIssues, issue } from '../domain/world-content.errors';
import { ChallengeTypeRepository } from '../persistence/challenge-type.repository';
import { ScopeRepository } from '../persistence/scope.repository';
import { WorldChallengeConfigurationRepository } from '../persistence/world-challenge-configuration.repository';
import { WorldRepository } from '../persistence/world.repository';

export interface WorldContentClassification {
  worldId: string;
  scopeId: string;
  challengeTypeId: string;
}

/**
 * The only surface the legacy question module is allowed to use, so that legacy
 * content stays classified against the real World Content rules while it waits
 * to be migrated into Content Items (roadmap 17, 18).
 *
 * Note the direction: legacy depends on this service, never the reverse.
 */
@Injectable()
export class WorldContentClassificationService {
  constructor(
    private readonly worlds: WorldRepository,
    private readonly scopes: ScopeRepository,
    private readonly challengeTypes: ChallengeTypeRepository,
    private readonly configurations: WorldChallengeConfigurationRepository,
  ) {}

  async assertClassification(
    classification: WorldContentClassification,
  ): Promise<void> {
    const invalidIds = Object.entries(classification).filter(
      ([, value]) => !Types.ObjectId.isValid(value),
    );
    if (invalidIds.length) {
      assertNoIssues(
        invalidIds.map(([field]) =>
          issue('INVALID_IDENTIFIER', `"${field}" is not a valid identifier`, {
            field,
          }),
        ),
      );
    }

    const [world, scope, challengeType, configuration] = await Promise.all([
      this.worlds.findById(classification.worldId),
      this.scopes.findById(classification.scopeId),
      this.challengeTypes.findById(classification.challengeTypeId),
      this.configurations.findByWorldAndChallengeType(
        classification.worldId,
        classification.challengeTypeId,
      ),
    ]);

    const issues = [];
    if (!world) {
      issues.push(issue('WORLD_NOT_FOUND', 'World does not exist'));
    }
    if (!scope) {
      issues.push(issue('SCOPE_NOT_FOUND', 'Scope does not exist'));
    } else if (String(scope.worldId) !== classification.worldId) {
      issues.push(
        issue(
          'SCOPE_WORLD_MISMATCH',
          'The Scope does not belong to the selected World',
        ),
      );
    }
    if (!challengeType) {
      issues.push(
        issue('CHALLENGE_TYPE_NOT_FOUND', 'Challenge type does not exist'),
      );
    } else if (!configuration) {
      // Challenge types are global, so belonging to a World means being
      // configured for it (roadmap 7, 8).
      issues.push(
        issue(
          'CHALLENGE_TYPE_NOT_CONFIGURED_FOR_WORLD',
          `"${challengeType.name}" is not configured in this World`,
        ),
      );
    }
    if (
      scope &&
      challengeType &&
      !ScopeCompatibilityPolicy.isChallengeTypeAllowed(
        {
          excludedChallengeTypeIds: (scope.excludedChallengeTypeIds ?? []).map(
            (excluded) => String(excluded),
          ),
        },
        classification.challengeTypeId,
      )
    ) {
      issues.push(
        issue(
          'CHALLENGE_TYPE_EXCLUDED_BY_SCOPE',
          `"${challengeType.name}" is excluded by the Scope "${scope.name}"`,
        ),
      );
    }
    assertNoIssues(issues, 'Content classification is invalid');
  }
}
