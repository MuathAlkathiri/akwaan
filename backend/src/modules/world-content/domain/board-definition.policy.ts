import { Injectable } from '@nestjs/common';
import { ChallengeTypePolicy } from './challenge-type.policy';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  WORLD_BOARD_SLOT_COUNT,
  WORLD_BOARD_SLOT_KEYS,
  WorldChallengeSlotKey,
} from './world-content.constants';
import { issue } from './world-content.errors';
import {
  ChallengeTypeView,
  PlayerInstructions,
  WorldChallengeConfigurationView,
  WorldContentIssue,
  WorldView,
} from './world-content.types';

export interface BoardSlot {
  slotKey: WorldChallengeSlotKey;
  configurationId: string;
  challengeTypeId: string;
  challengeTypeSlug: string;
  family: ChallengeFamily;
  displayName: string;
  description?: string;
  instructions?: string;
  /** Mechanic-canonical player explanation, from the ChallengeType. */
  playerInstructions?: PlayerInstructions;
  itemStructure: ChallengeItemStructure;
  answerMode: ChallengeAnswerMode;
  scoringRuleId: string;
  sortOrder: number;
}

export interface BoardDefinition {
  worldId: string;
  slots: BoardSlot[];
  blockers: WorldContentIssue[];
  warnings: WorldContentIssue[];
}

export interface BoardDefinitionInput {
  world: WorldView;
  configurations: WorldChallengeConfigurationView[];
  challengeTypes: Map<string, ChallengeTypeView>;
}

/** The single policy for four generic positions and four distinct mechanics. */
@Injectable()
export class BoardDefinitionPolicy {
  constructor(private readonly challengeTypes: ChallengeTypePolicy) {}

  build(input: BoardDefinitionInput): BoardDefinition {
    const blockers: WorldContentIssue[] = [];
    const warnings: WorldContentIssue[] = [];
    const enabled = input.configurations
      .filter((configuration) => configuration.isEnabled)
      .sort((left, right) => left.sortOrder - right.sortOrder);

    const slots: BoardSlot[] = [];
    for (const configuration of enabled) {
      const challengeType = input.challengeTypes.get(
        configuration.challengeTypeId,
      );
      if (!challengeType) {
        blockers.push(
          issue(
            'CONFIGURED_CHALLENGE_TYPE_MISSING',
            'Every board slot must contain one mechanic.',
            {
              configurationId: configuration.id,
              challengeTypeId: configuration.challengeTypeId,
              slotKey: configuration.slotKey,
            },
          ),
        );
        continue;
      }
      blockers.push(
        ...this.challengeTypes
          .assertUsableInBoard(challengeType)
          .map((problem) => this.withConfiguration(problem, configuration.id)),
        ...this.challengeTypes
          .validate(challengeType)
          .map((problem) => this.withConfiguration(problem, configuration.id)),
      );
      warnings.push(
        ...this.challengeTypes
          .warnings(challengeType)
          .map((problem) => this.withConfiguration(problem, configuration.id)),
      );
      slots.push({
        slotKey: configuration.slotKey,
        configurationId: configuration.id,
        challengeTypeId: challengeType.id,
        challengeTypeSlug: challengeType.slug,
        family: challengeType.family,
        displayName: configuration.displayName ?? challengeType.name,
        ...(configuration.description
          ? { description: configuration.description }
          : {}),
        ...(configuration.instructions
          ? { instructions: configuration.instructions }
          : {}),
        // Canonical, World-invariant: it comes from the mechanic, not from the
        // per-World configuration, so every World that plays this mechanic shows
        // the same explanation.
        ...(challengeType.defaultPresentation.playerInstructions
          ? {
              playerInstructions:
                challengeType.defaultPresentation.playerInstructions,
            }
          : {}),
        itemStructure: challengeType.itemStructure,
        answerMode: challengeType.answerMode,
        scoringRuleId: challengeType.scoringRuleId,
        sortOrder: configuration.sortOrder,
      });
    }

    blockers.push(...this.validateComposition(enabled));
    return { worldId: input.world.id, slots, blockers, warnings };
  }

  isBoardReady(definition: BoardDefinition): boolean {
    return definition.blockers.length === 0;
  }

  hasRelationalChallenge(definition: BoardDefinition): boolean {
    return definition.slots.some(
      (slot) => slot.family === ChallengeFamily.RELATIONAL,
    );
  }

  private validateComposition(
    enabled: WorldChallengeConfigurationView[],
  ): WorldContentIssue[] {
    const issues: WorldContentIssue[] = [];
    if (enabled.length !== WORLD_BOARD_SLOT_COUNT) {
      issues.push(
        issue(
          'BOARD_SLOT_COUNT_MISMATCH',
          `World must contain exactly ${WORLD_BOARD_SLOT_COUNT} enabled mechanics.`,
          { expected: WORLD_BOARD_SLOT_COUNT, actual: enabled.length },
        ),
      );
    }

    const slotCounts = new Map<WorldChallengeSlotKey, number>();
    const challengeTypeCounts = new Map<string, number>();
    for (const configuration of enabled) {
      if (!WORLD_BOARD_SLOT_KEYS.includes(configuration.slotKey)) {
        issues.push(
          issue(
            'INVALID_BOARD_SLOT_KEY',
            'Every board slot must contain one mechanic.',
            {
              configurationId: configuration.id,
              slotKey: configuration.slotKey,
            },
          ),
        );
      } else {
        slotCounts.set(
          configuration.slotKey,
          (slotCounts.get(configuration.slotKey) ?? 0) + 1,
        );
      }
      challengeTypeCounts.set(
        configuration.challengeTypeId,
        (challengeTypeCounts.get(configuration.challengeTypeId) ?? 0) + 1,
      );
    }

    for (const slotKey of WORLD_BOARD_SLOT_KEYS) {
      const count = slotCounts.get(slotKey) ?? 0;
      if (count === 0) {
        issues.push(
          issue(
            'BOARD_SLOT_EMPTY',
            'Every board slot must contain one mechanic.',
            { slotKey },
          ),
        );
      } else if (count > 1) {
        issues.push(
          issue(
            'DUPLICATE_BOARD_SLOT',
            'Every board position may be used only once.',
            { slotKey, actual: count },
          ),
        );
      }
    }

    for (const [challengeTypeId, count] of challengeTypeCounts) {
      if (count > 1) {
        issues.push(
          issue(
            'DUPLICATE_BOARD_CHALLENGE_TYPE',
            'Duplicate mechanics are not allowed in the same World.',
            { challengeTypeId, actual: count },
          ),
        );
      }
    }
    return issues;
  }

  private withConfiguration(
    problem: WorldContentIssue,
    configurationId: string,
  ): WorldContentIssue {
    return {
      ...problem,
      details: { ...(problem.details ?? {}), configurationId },
    };
  }
}
