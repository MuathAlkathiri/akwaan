import { Injectable } from '@nestjs/common';
import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { ChallengePresentationPolicy } from './challenge-presentation.policy';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  FAMILY_ALLOWED_ANSWER_MODES,
  WorldContentStatus,
} from './world-content.constants';
import {
  productionMechanicDefinition,
  productionMechanicSystemFields,
} from './production-mechanic.definition';
import { issue } from './world-content.errors';
import { ChallengeTypeView, WorldContentIssue } from './world-content.types';

/**
 * Rules that make a mechanic definition coherent on its own, before any World
 * assigns it (roadmap 7). Behaviour is not modelled here: mechanics resolve
 * through the existing gameplay plugin registry in a later phase.
 */
@Injectable()
export class ChallengeTypePolicy {
  constructor(
    private readonly presentation: ChallengePresentationPolicy,
    private readonly scoringRules: ScoringRuleRegistry,
  ) {}

  /** Blocking issues that prevent a Challenge Type from becoming active. */
  validate(challengeType: ChallengeTypeView): WorldContentIssue[] {
    const issues: WorldContentIssue[] = [];

    if (!Object.values(ChallengeFamily).includes(challengeType.family)) {
      issues.push(
        issue('INVALID_CHALLENGE_FAMILY', 'Challenge family is not supported', {
          family: challengeType.family,
        }),
      );
      return issues;
    }
    const productionDefinition = productionMechanicDefinition(
      challengeType.slug,
    );
    if (productionDefinition) {
      const expected = productionMechanicSystemFields(productionDefinition);
      const actual = productionMechanicSystemFields({
        ...productionDefinition,
        family: challengeType.family,
        itemStructure: challengeType.itemStructure,
        answerMode: challengeType.answerMode,
        matchScoringRuleId: challengeType.scoringRuleId as never,
      });
      const drift = Object.keys(expected).filter(
        (field) => expected[field] !== actual[field],
      );
      if (drift.length) {
        issues.push(
          issue(
            'PRODUCTION_MECHANIC_CONFIGURATION_DRIFT',
            `Production mechanic "${challengeType.slug}" does not match its canonical runtime definition`,
            { fields: drift, expected, actual },
          ),
        );
      }
    }
    if (
      !Object.values(ChallengeAnswerMode).includes(challengeType.answerMode)
    ) {
      issues.push(
        issue('INVALID_ANSWER_MODE', 'Answer mode is not supported', {
          answerMode: challengeType.answerMode,
        }),
      );
    } else if (
      !FAMILY_ALLOWED_ANSWER_MODES[challengeType.family].includes(
        challengeType.answerMode,
      )
    ) {
      issues.push(
        issue(
          'ANSWER_MODE_NOT_ALLOWED_FOR_FAMILY',
          `The ${challengeType.family} family cannot resolve the "${challengeType.answerMode}" answer mode automatically`,
          {
            family: challengeType.family,
            answerMode: challengeType.answerMode,
            allowed: FAMILY_ALLOWED_ANSWER_MODES[challengeType.family],
          },
        ),
      );
    }
    if (
      !Object.values(ChallengeItemStructure).includes(
        challengeType.itemStructure,
      )
    ) {
      issues.push(
        issue('INVALID_ITEM_STRUCTURE', 'Item structure is not supported', {
          itemStructure: challengeType.itemStructure,
        }),
      );
    }

    issues.push(
      ...this.presentation.validateShape(
        challengeType.defaultPresentation,
        'defaultPresentation',
      ),
    );
    issues.push(...this.validateScoringRule(challengeType));
    return issues;
  }

  /** Warnings do not block activation but are surfaced to the admin. */
  warnings(challengeType: ChallengeTypeView): WorldContentIssue[] {
    if (!this.scoringRules.isRegistered(challengeType.scoringRuleId)) return [];
    const declaration = this.scoringRules.declaration(
      challengeType.scoringRuleId,
    );
    if (!declaration.requiresMechanicBinding) return [];
    return [
      issue(
        'SCORING_RULE_AWAITING_MECHANIC',
        `Scoring rule "${declaration.id}" is declared but has no bound calculator yet, so this challenge is not playable until its mechanic ships`,
        { scoringRuleId: declaration.id },
      ),
    ];
  }

  assertUsableInBoard(challengeType: ChallengeTypeView): WorldContentIssue[] {
    if (challengeType.status === WorldContentStatus.ACTIVE) return [];
    return [
      issue(
        'CHALLENGE_TYPE_NOT_ACTIVE',
        `Challenge type "${challengeType.name}" is ${challengeType.status} and cannot fill a board slot`,
        { challengeTypeId: challengeType.id, status: challengeType.status },
      ),
    ];
  }

  private validateScoringRule(
    challengeType: ChallengeTypeView,
  ): WorldContentIssue[] {
    if (!challengeType.scoringRuleId) {
      return [
        issue(
          'SCORING_RULE_REQUIRED',
          'A challenge type must reference a scoring rule',
          { challengeTypeId: challengeType.id },
        ),
      ];
    }
    if (!this.scoringRules.isRegistered(challengeType.scoringRuleId)) {
      return [
        issue(
          'SCORING_RULE_NOT_REGISTERED',
          `Scoring rule "${challengeType.scoringRuleId}" is not registered in the central scoring registry`,
          { scoringRuleId: challengeType.scoringRuleId },
        ),
      ];
    }
    return [];
  }
}
