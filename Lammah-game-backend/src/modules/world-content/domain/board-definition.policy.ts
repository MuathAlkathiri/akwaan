import { Injectable } from '@nestjs/common';
import { ChallengeTypePolicy } from './challenge-type.policy';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  SLOT_KEY_TYPES,
  WORLD_BOARD_SLOT_COUNT,
  WORLD_BOARD_SLOT_KEYS,
  WORLD_SLOT_ALLOWED_FAMILIES,
  WORLD_SLOT_REQUIRED_COUNTS,
  WorldChallengeSlotKey,
  WorldChallengeSlotType,
} from './world-content.constants';
import { issue } from './world-content.errors';
import {
  ChallengeTypeView,
  WorldChallengeConfigurationView,
  WorldContentIssue,
  WorldView,
} from './world-content.types';

export interface BoardSlot {
  slotKey: WorldChallengeSlotKey;
  slotType: WorldChallengeSlotType;
  configurationId: string;
  challengeTypeId: string;
  challengeTypeSlug: string;
  family: ChallengeFamily;
  /** The mechanic's own name unless this World gave it a label. */
  displayName: string;
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

export interface ForeignAssignment {
  challengeTypeId: string;
  worldId: string;
  worldName: string;
}

export interface BoardDefinitionInput {
  world: WorldView;
  /** Every configuration belonging to the World, enabled or not. */
  configurations: WorldChallengeConfigurationView[];
  challengeTypes: Map<string, ChallengeTypeView>;
  /** Same challenge types configured in other Worlds, for exclusivity checks. */
  foreignAssignments?: ForeignAssignment[];
}

/**
 * The one place board composition is decided (roadmap 3.1, 10):
 * 1 Signature + 2 RYO + 1 Flex, where Flex is Co-op or Relational.
 */
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
            'A configured challenge type no longer exists',
            {
              configurationId: configuration.id,
              challengeTypeId: configuration.challengeTypeId,
            },
          ),
        );
        continue;
      }
      blockers.push(
        ...this.challengeTypes
          .assertUsableInBoard(challengeType)
          .map((problem) => this.withConfiguration(problem, configuration.id)),
      );
      blockers.push(
        ...this.challengeTypes
          .validate(challengeType)
          .map((problem) => this.withConfiguration(problem, configuration.id)),
      );
      warnings.push(
        ...this.challengeTypes
          .warnings(challengeType)
          .map((problem) => this.withConfiguration(problem, configuration.id)),
      );
      blockers.push(
        ...this.validateSlotFamily(configuration, challengeType),
        ...this.validateForeignExclusivity(input, configuration, challengeType),
      );
      slots.push({
        slotKey: configuration.slotKey,
        slotType: SLOT_KEY_TYPES[configuration.slotKey],
        configurationId: configuration.id,
        challengeTypeId: challengeType.id,
        challengeTypeSlug: challengeType.slug,
        family: challengeType.family,
        displayName: configuration.displayName ?? challengeType.name,
        itemStructure: challengeType.itemStructure,
        answerMode: challengeType.answerMode,
        scoringRuleId: challengeType.scoringRuleId,
        sortOrder: configuration.sortOrder,
      });
    }

    blockers.push(...this.validateComposition(enabled));
    blockers.push(...this.validateSignatureReference(input.world, slots));
    return { worldId: input.world.id, slots, blockers, warnings };
  }

  isBoardReady(definition: BoardDefinition): boolean {
    return definition.blockers.length === 0;
  }

  hasRelationalFlexSlot(definition: BoardDefinition): boolean {
    return definition.slots.some(
      (slot) =>
        slot.slotType === WorldChallengeSlotType.FLEX &&
        slot.family === ChallengeFamily.RELATIONAL,
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
          `A World board must contain exactly ${WORLD_BOARD_SLOT_COUNT} enabled challenge configurations, found ${enabled.length}`,
          { expected: WORLD_BOARD_SLOT_COUNT, actual: enabled.length },
        ),
      );
    }
    for (const slotType of Object.values(WorldChallengeSlotType)) {
      const expected = WORLD_SLOT_REQUIRED_COUNTS[slotType];
      const actual = enabled.filter(
        (configuration) => SLOT_KEY_TYPES[configuration.slotKey] === slotType,
      ).length;
      if (actual !== expected) {
        issues.push(
          issue(
            'BOARD_SLOT_TYPE_COUNT_MISMATCH',
            `A World board must contain exactly ${expected} ${slotType} slot(s), found ${actual}`,
            { slotType, expected, actual },
          ),
        );
      }
    }
    // Uniqueness is per board position, not per mechanic: the one canonical RYO
    // mechanic legitimately fills both RYO positions (roadmap 3.1).
    const seenSlots = new Set<WorldChallengeSlotKey>();
    for (const configuration of enabled) {
      if (!WORLD_BOARD_SLOT_KEYS.includes(configuration.slotKey)) {
        issues.push(
          issue(
            'INVALID_BOARD_SLOT_KEY',
            `Board slot "${configuration.slotKey}" is not a board position`,
            { configurationId: configuration.id },
          ),
        );
        continue;
      }
      if (seenSlots.has(configuration.slotKey)) {
        issues.push(
          issue(
            'DUPLICATE_BOARD_SLOT',
            `Two configurations occupy the ${configuration.slotKey} board position`,
            { slotKey: configuration.slotKey },
          ),
        );
      }
      seenSlots.add(configuration.slotKey);
    }
    return issues;
  }

  private validateSlotFamily(
    configuration: WorldChallengeConfigurationView,
    challengeType: ChallengeTypeView,
  ): WorldContentIssue[] {
    const slotType = SLOT_KEY_TYPES[configuration.slotKey];
    const allowed = slotType
      ? WORLD_SLOT_ALLOWED_FAMILIES[slotType]
      : undefined;
    if (!allowed) {
      return [
        issue(
          'INVALID_BOARD_SLOT_KEY',
          `Board slot "${configuration.slotKey}" is not supported`,
          { configurationId: configuration.id },
        ),
      ];
    }
    if (allowed.includes(challengeType.family)) return [];
    return [
      issue(
        'SLOT_FAMILY_MISMATCH',
        `A ${slotType} slot accepts only ${allowed.join(' or ')} mechanics, but "${challengeType.name}" is ${challengeType.family}`,
        {
          configurationId: configuration.id,
          slotKey: configuration.slotKey,
          slotType,
          family: challengeType.family,
          allowedFamilies: allowed,
        },
      ),
    ];
  }

  private validateForeignExclusivity(
    input: BoardDefinitionInput,
    configuration: WorldChallengeConfigurationView,
    challengeType: ChallengeTypeView,
  ): WorldContentIssue[] {
    if (!challengeType.isExclusive) return [];
    const foreign = (input.foreignAssignments ?? []).filter(
      (assignment) =>
        assignment.challengeTypeId === challengeType.id &&
        assignment.worldId !== input.world.id,
    );
    if (!foreign.length) return [];
    return [
      issue(
        'EXCLUSIVE_CHALLENGE_TYPE_SHARED',
        `"${challengeType.name}" is exclusive and is already configured in ${foreign
          .map((assignment) => assignment.worldName)
          .join(', ')}`,
        {
          configurationId: configuration.id,
          challengeTypeId: challengeType.id,
          conflictingWorldIds: foreign.map((assignment) => assignment.worldId),
        },
      ),
    ];
  }

  private validateSignatureReference(
    world: WorldView,
    slots: BoardSlot[],
  ): WorldContentIssue[] {
    const signatureSlots = slots.filter(
      (slot) => slot.slotType === WorldChallengeSlotType.SIGNATURE,
    );
    if (!world.signatureMechanicId) {
      return [
        issue(
          'SIGNATURE_MECHANIC_NOT_SET',
          'A World must name its Signature mechanic before it can be activated',
          { worldId: world.id },
        ),
      ];
    }
    if (signatureSlots.length !== 1) return [];
    if (signatureSlots[0].challengeTypeId === world.signatureMechanicId) {
      return [];
    }
    return [
      issue(
        'SIGNATURE_MECHANIC_MISMATCH',
        "The World's Signature mechanic must be the challenge type configured in its Signature slot",
        {
          worldId: world.id,
          signatureMechanicId: world.signatureMechanicId,
          configuredChallengeTypeId: signatureSlots[0].challengeTypeId,
        },
      ),
    ];
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
