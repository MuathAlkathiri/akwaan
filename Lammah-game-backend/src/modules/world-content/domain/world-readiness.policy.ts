import { Injectable } from '@nestjs/common';
import {
  BoardDefinition,
  BoardDefinitionPolicy,
  ForeignAssignment,
} from './board-definition.policy';
import {
  ScopeCompatibility,
  ScopeCompatibilityPolicy,
} from './scope-compatibility.policy';
import { WorldContentStatus } from './world-content.constants';
import { issue } from './world-content.errors';
import {
  buildReadinessReport,
  ChallengeTypeView,
  ReadinessReport,
  ScopeView,
  WorldChallengeConfigurationView,
  WorldContentIssue,
  WorldView,
} from './world-content.types';

export interface WorldReadinessInput {
  world: WorldView;
  scopes: ScopeView[];
  configurations: WorldChallengeConfigurationView[];
  challengeTypes: Map<string, ChallengeTypeView>;
  foreignAssignments?: ForeignAssignment[];
  /** Ready content item counts per challenge type, for coverage warnings. */
  readyContentCountByChallengeType?: Map<string, number>;
}

export interface WorldReadinessReport extends ReadinessReport {
  worldId: string;
  board: BoardDefinition;
  scopeCompatibility: ScopeCompatibility[];
  boardReady: boolean;
  hasRelationalFlexSlot: boolean;
}

/**
 * Composes the individual policies into the single answer to "can this World be
 * activated?" (roadmap 5, 9, 10). Controllers never assemble these rules
 * themselves.
 */
@Injectable()
export class WorldReadinessPolicy {
  constructor(
    private readonly boards: BoardDefinitionPolicy,
    private readonly scopes: ScopeCompatibilityPolicy,
  ) {}

  evaluate(input: WorldReadinessInput): WorldReadinessReport {
    const board = this.boards.build({
      world: input.world,
      configurations: input.configurations,
      challengeTypes: input.challengeTypes,
      foreignAssignments: input.foreignAssignments,
    });
    const blockers: WorldContentIssue[] = [...board.blockers];
    const warnings: WorldContentIssue[] = [...board.warnings];

    const activeScopes = input.scopes.filter(
      (scope) => scope.status === WorldContentStatus.ACTIVE,
    );
    if (!activeScopes.length) {
      blockers.push(
        issue(
          'WORLD_WITHOUT_ACTIVE_SCOPE',
          'A World needs at least one active Scope',
          { worldId: input.world.id },
        ),
      );
    }

    const knownChallengeTypeIds = new Set(input.challengeTypes.keys());
    const scopeCompatibility = input.scopes.map((scope) =>
      this.scopes.evaluate({
        scope,
        boardSlots: board.slots,
        knownChallengeTypeIds,
      }),
    );
    for (const compatibility of scopeCompatibility) {
      const scope = input.scopes.find(
        (candidate) => candidate.id === compatibility.scopeId,
      );
      const isActive = scope?.status === WorldContentStatus.ACTIVE;
      // An inactive Scope's exclusions cannot block the World, but they are
      // still surfaced so the problem is visible before it is activated.
      if (isActive) blockers.push(...compatibility.blockers);
      else warnings.push(...compatibility.blockers);
      warnings.push(...compatibility.warnings);
    }

    warnings.push(...this.coverageWarnings(input, board));

    const report = buildReadinessReport(blockers, warnings);
    return {
      ...report,
      worldId: input.world.id,
      board,
      scopeCompatibility,
      boardReady: this.boards.isBoardReady(board),
      hasRelationalFlexSlot: this.boards.hasRelationalFlexSlot(board),
    };
  }

  canActivate(input: WorldReadinessInput): boolean {
    return this.evaluate(input).blockers.length === 0;
  }

  private coverageWarnings(
    input: WorldReadinessInput,
    board: BoardDefinition,
  ): WorldContentIssue[] {
    if (!input.readyContentCountByChallengeType) return [];
    return board.slots
      .filter(
        (slot) =>
          (input.readyContentCountByChallengeType?.get(slot.challengeTypeId) ??
            0) === 0,
      )
      .map((slot) =>
        issue(
          'CHALLENGE_WITHOUT_READY_CONTENT',
          `"${slot.displayName}" has no ready content items yet`,
          { challengeTypeId: slot.challengeTypeId, slotType: slot.slotType },
        ),
      );
  }
}
