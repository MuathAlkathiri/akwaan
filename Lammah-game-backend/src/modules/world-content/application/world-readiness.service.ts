import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BoardDefinition,
  BoardDefinitionPolicy,
} from '../domain/board-definition.policy';
import {
  MatchWorldCandidate,
  MatchWorldSelectionPolicy,
  MatchWorldSelectionReport,
} from '../domain/match-world-selection.policy';
import {
  ScopeCompatibility,
  ScopeCompatibilityPolicy,
} from '../domain/scope-compatibility.policy';
import {
  WorldReadinessPolicy,
  WorldReadinessReport,
} from '../domain/world-readiness.policy';
import { WorldContentStatus } from '../domain/world-content.constants';
import { assertNoIssues } from '../domain/world-content.errors';
import {
  ChallengeTypeView,
  ScopeView,
  WorldChallengeConfigurationView,
  WorldView,
} from '../domain/world-content.types';
import { ChallengeTypeRepository } from '../persistence/challenge-type.repository';
import { ContentItemRepository } from '../persistence/content-item.repository';
import { ScopeRepository } from '../persistence/scope.repository';
import { WorldChallengeConfigurationRepository } from '../persistence/world-challenge-configuration.repository';
import { WorldRepository } from '../persistence/world.repository';
import {
  toChallengeTypeViewMap,
  toConfigurationView,
  toScopeView,
  toWorldView,
} from './world-content.mapper';

export interface EvaluatedWorld {
  world: WorldView;
  report: WorldReadinessReport;
}

interface WorldContentContext {
  worlds: Map<string, WorldView>;
  scopesByWorld: Map<string, ScopeView[]>;
  challengeTypes: Map<string, ChallengeTypeView>;
  configurationsByWorld: Map<string, WorldChallengeConfigurationView[]>;
}

/**
 * Loads what the readiness policies need and delegates every decision to them.
 * No rule is implemented here.
 */
@Injectable()
export class WorldReadinessService {
  constructor(
    private readonly worlds: WorldRepository,
    private readonly scopes: ScopeRepository,
    private readonly challengeTypes: ChallengeTypeRepository,
    private readonly configurations: WorldChallengeConfigurationRepository,
    private readonly contentItems: ContentItemRepository,
    private readonly readinessPolicy: WorldReadinessPolicy,
    private readonly boardPolicy: BoardDefinitionPolicy,
    private readonly scopePolicy: ScopeCompatibilityPolicy,
    private readonly matchPolicy: MatchWorldSelectionPolicy,
  ) {}

  async evaluateWorld(worldId: string): Promise<WorldReadinessReport> {
    const context = await this.loadContext();
    const world = context.worlds.get(worldId);
    if (!world) throw new NotFoundException('World not found');
    const readyContentCountByChallengeType =
      await this.contentItems.readyCountsByChallengeType(worldId);
    return this.evaluateFromContext(
      world,
      context,
      readyContentCountByChallengeType,
    );
  }

  /** Readiness for every World, loading shared data exactly once. */
  async evaluateAllWorlds(): Promise<EvaluatedWorld[]> {
    const context = await this.loadContext();
    return [...context.worlds.values()].map((world) => ({
      world,
      report: this.evaluateFromContext(world, context),
    }));
  }

  /**
   * Readiness for a World as it *would* be after a pending change. Callers
   * project the change in memory and only write when the projection is valid,
   * so an active World is never left in a broken state and nothing needs
   * rolling back.
   */
  async evaluateWorldProjection(input: {
    worldId: string;
    worldOverrides?: Partial<WorldView>;
    configurationOverrides?: WorldChallengeConfigurationView[];
    scopeOverrides?: ScopeView[];
  }): Promise<WorldReadinessReport> {
    const context = await this.loadContext();
    const current = context.worlds.get(input.worldId);
    if (!current) throw new NotFoundException('World not found');
    const world = { ...current, ...(input.worldOverrides ?? {}) };
    if (input.configurationOverrides) {
      context.configurationsByWorld.set(
        input.worldId,
        input.configurationOverrides,
      );
    }
    if (input.scopeOverrides) {
      context.scopesByWorld.set(input.worldId, input.scopeOverrides);
    }
    context.worlds.set(world.id, world);
    return this.evaluateFromContext(world, context);
  }

  /**
   * Guards live Worlds without deadlocking authoring.
   *
   * A World whose board is already invalid — a legacy record, or one still being
   * built — must stay editable, otherwise it can never be repaired: every
   * intermediate state of a four-slot board is incomplete. What is refused is a
   * change that takes a World which is currently valid and breaks it.
   */
  async assertChangeKeepsActiveWorldValid(
    input: {
      worldId: string;
      worldOverrides?: Partial<WorldView>;
      configurationOverrides?: WorldChallengeConfigurationView[];
      scopeOverrides?: ScopeView[];
    },
    message: string,
  ): Promise<void> {
    const world = await this.worlds.findById(input.worldId);
    if (!world || world.status !== WorldContentStatus.ACTIVE) return;
    const current = await this.evaluateWorld(input.worldId);
    if (current.blockers.length) return;
    const projected = await this.evaluateWorldProjection(input);
    assertNoIssues(projected.blockers, message);
  }

  async buildBoard(worldId: string): Promise<BoardDefinition> {
    return (await this.evaluateWorld(worldId)).board;
  }

  async evaluateScope(scopeId: string): Promise<ScopeCompatibility> {
    const scope = await this.scopes.findById(scopeId);
    if (!scope) throw new NotFoundException('Scope not found');
    const scopeView = toScopeView(scope);
    const board = await this.buildBoard(scopeView.worldId);
    return this.scopePolicy.evaluate({
      scope: scopeView,
      boardSlots: board.slots,
      knownChallengeTypeIds: await this.challengeTypes.allIds(),
    });
  }

  /**
   * Roadmap 11: the reusable contract the future Match aggregate will call.
   */
  async validateSelectedWorldsForMatch(
    worldIds: string[],
  ): Promise<MatchWorldSelectionReport> {
    const evaluated = await this.evaluateAllWorlds();
    const candidates: MatchWorldCandidate[] = evaluated.map(
      ({ world, report }) => ({
        worldId: world.id,
        worldName: world.name,
        status: world.status,
        boardReady: report.boardReady,
        hasRelationalChallenge: report.hasRelationalChallenge,
      }),
    );
    return this.matchPolicy.validateSelectedWorldsForMatch(
      worldIds,
      candidates,
    );
  }

  private evaluateFromContext(
    world: WorldView,
    context: WorldContentContext,
    readyContentCountByChallengeType?: Map<string, number>,
  ): WorldReadinessReport {
    const configurations = context.configurationsByWorld.get(world.id) ?? [];
    return this.readinessPolicy.evaluate({
      world,
      scopes: context.scopesByWorld.get(world.id) ?? [],
      configurations,
      challengeTypes: context.challengeTypes,
      ...(readyContentCountByChallengeType
        ? { readyContentCountByChallengeType }
        : {}),
    });
  }

  private async loadContext(): Promise<WorldContentContext> {
    const [worlds, scopes, challengeTypes, configurations] = await Promise.all([
      this.worlds.list(),
      this.scopes.list(),
      this.challengeTypes.list(),
      this.configurations.list(),
    ]);

    const scopesByWorld = new Map<string, ScopeView[]>();
    for (const scope of scopes) {
      const view = toScopeView(scope);
      const bucket = scopesByWorld.get(view.worldId) ?? [];
      bucket.push(view);
      scopesByWorld.set(view.worldId, bucket);
    }

    const configurationsByWorld = new Map<
      string,
      WorldChallengeConfigurationView[]
    >();
    for (const configuration of configurations) {
      const view = toConfigurationView(configuration);
      const worldBucket = configurationsByWorld.get(view.worldId) ?? [];
      worldBucket.push(view);
      configurationsByWorld.set(view.worldId, worldBucket);
    }

    return {
      worlds: new Map(
        worlds.map((world) => {
          const view = toWorldView(world);
          return [view.id, view];
        }),
      ),
      scopesByWorld,
      challengeTypes: toChallengeTypeViewMap(challengeTypes),
      configurationsByWorld,
    };
  }
}
