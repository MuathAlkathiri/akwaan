import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UploadedImageFile } from '../../../common/uploads/local-image-storage.service';
import { BoardDefinition } from '../domain/board-definition.policy';
import {
  withUniqueConstraint,
  WorldContentConflictError,
} from '../domain/world-content.errors';
import {
  ChallengeTypeView,
  ContentAssetRef,
  WorldChallengeConfigurationView,
} from '../domain/world-content.types';
import {
  CreateWorldChallengeConfigurationDto,
  UpdateWorldChallengeConfigurationDto,
} from '../dto/world-challenge-configuration.dto';
import { ChallengeTypeRepository } from '../persistence/challenge-type.repository';
import { WorldChallengeConfigurationRepository } from '../persistence/world-challenge-configuration.repository';
import { WorldRepository } from '../persistence/world.repository';
import { WorldChallengeConfiguration } from '../schemas/world-challenge-configuration.schema';
import { WorldContentAssetMutator } from './world-content-asset.mutator';
import { WorldReadinessService } from './world-readiness.service';
import {
  toChallengeTypeView,
  toConfigurationView,
} from './world-content.mapper';

export interface WorldChallengeConfigurationSummary extends WorldChallengeConfigurationView {
  icon?: ContentAssetRef;
  challengeType: ChallengeTypeView;
  /** What the player sees: the World label, or the mechanic's own name. */
  effectiveName: string;
}

export interface WorldBoardView {
  worldId: string;
  configurations: WorldChallengeConfigurationSummary[];
  board: BoardDefinition;
}

/**
 * Assigns a global mechanic to one board position of one World.
 *
 * Assignment is deliberately lightweight: the slot and the mechanic are the only
 * required decisions. Runtime belongs to the mechanic; player-facing name,
 * description, and instructions may vary per World.
 */
@Injectable()
export class WorldChallengeConfigurationService {
  constructor(
    private readonly configurations: WorldChallengeConfigurationRepository,
    private readonly challengeTypes: ChallengeTypeRepository,
    private readonly worlds: WorldRepository,
    private readonly readiness: WorldReadinessService,
    private readonly assets: WorldContentAssetMutator,
  ) {}

  async listByWorld(worldId: string): Promise<WorldBoardView> {
    await this.requireWorld(worldId);
    const [documents, report] = await Promise.all([
      this.configurations.listByWorld(worldId),
      this.readiness.evaluateWorld(worldId),
    ]);
    const challengeTypes = await this.challengeTypes.findByIds(
      documents.map((document) => String(document.challengeTypeId)),
    );
    const byId = new Map(
      challengeTypes.map((challengeType) => [
        String(challengeType._id),
        toChallengeTypeView(challengeType),
      ]),
    );
    return {
      worldId,
      board: report.board,
      configurations: documents.flatMap<WorldChallengeConfigurationSummary>(
        (document) => {
          const view = toConfigurationView(document);
          const challengeType = byId.get(view.challengeTypeId);
          if (!challengeType) return [];
          return [this.summarize(document, challengeType)];
        },
      ),
    };
  }

  async create(
    worldId: string,
    dto: CreateWorldChallengeConfigurationDto,
    file?: UploadedImageFile,
  ): Promise<WorldChallengeConfigurationSummary> {
    await this.requireWorld(worldId);
    const challengeType = await this.requireChallengeType(dto.challengeTypeId);
    if (await this.configurations.findByWorldAndSlot(worldId, dto.slotKey)) {
      throw new WorldContentConflictError(
        'BOARD_SLOT_ALREADY_FILLED',
        `The ${dto.slotKey} board position is already filled in this World`,
      );
    }
    if (
      await this.configurations.findByWorldAndChallengeType(
        worldId,
        dto.challengeTypeId,
      )
    ) {
      throw this.duplicateMechanicConflict();
    }

    const projected: WorldChallengeConfigurationView = {
      id: 'projected',
      worldId,
      challengeTypeId: dto.challengeTypeId,
      slotKey: dto.slotKey,
      ...(dto.displayName ? { displayName: dto.displayName } : {}),
      ...(dto.description ? { description: dto.description } : {}),
      ...(dto.instructions ? { instructions: dto.instructions } : {}),
      sortOrder: dto.sortOrder ?? 0,
      isEnabled: dto.isEnabled ?? true,
    };
    await this.assertProjectionValid(worldId, (current) => [
      ...current,
      projected,
    ]);

    const created = await this.assets.withAsset({
      kind: 'world-challenge-configurations',
      field: 'icon',
      data: {
        worldId: new Types.ObjectId(worldId),
        challengeTypeId: new Types.ObjectId(dto.challengeTypeId),
        slotKey: projected.slotKey,
        displayName: dto.displayName,
        description: dto.description,
        instructions: dto.instructions,
        icon: dto.icon,
        sortOrder: projected.sortOrder,
        isEnabled: projected.isEnabled,
      },
      file,
      run: (payload) =>
        withUniqueConstraint(
          () =>
            this.configurations.create(
              payload as Partial<WorldChallengeConfiguration>,
            ),
          this.slotConflict(projected.slotKey),
        ),
    });
    return this.summarize(created, challengeType);
  }

  async update(
    id: string,
    dto: UpdateWorldChallengeConfigurationDto,
    file?: UploadedImageFile,
  ): Promise<WorldChallengeConfigurationSummary> {
    const existing = await this.require(id);
    const worldId = String(existing.worldId);
    const challengeTypeId =
      dto.challengeTypeId ?? String(existing.challengeTypeId);
    const challengeType = await this.requireChallengeType(challengeTypeId);
    const duplicate = await this.configurations.findByWorldAndChallengeType(
      worldId,
      challengeTypeId,
    );
    if (duplicate && String(duplicate._id) !== id) {
      throw this.duplicateMechanicConflict();
    }

    const projected: WorldChallengeConfigurationView = {
      ...toConfigurationView(existing),
      challengeTypeId,
      ...(dto.slotKey ? { slotKey: dto.slotKey } : {}),
      ...(dto.displayName === undefined
        ? {}
        : { displayName: dto.displayName }),
      ...(dto.description === undefined
        ? {}
        : { description: dto.description }),
      ...(dto.instructions === undefined
        ? {}
        : { instructions: dto.instructions }),
      ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
      ...(dto.isEnabled === undefined ? {} : { isEnabled: dto.isEnabled }),
    };
    await this.assertProjectionValid(worldId, (current) =>
      current.map((configuration) =>
        configuration.id === projected.id ? projected : configuration,
      ),
    );

    const updated = await this.assets.withAsset({
      kind: 'world-challenge-configurations',
      field: 'icon',
      data: {
        challengeTypeId: new Types.ObjectId(projected.challengeTypeId),
        slotKey: projected.slotKey,
        sortOrder: projected.sortOrder,
        isEnabled: projected.isEnabled,
        ...(dto.displayName === undefined
          ? {}
          : { displayName: dto.displayName }),
        ...(dto.description === undefined
          ? {}
          : { description: dto.description }),
        ...(dto.instructions === undefined
          ? {}
          : { instructions: dto.instructions }),
        ...(dto.icon === undefined ? {} : { icon: dto.icon }),
      },
      file,
      previous: existing.icon,
      run: async (payload) => {
        const value = await withUniqueConstraint(
          () =>
            this.configurations.updateById(
              id,
              payload as Partial<WorldChallengeConfiguration>,
            ),
          this.slotConflict(projected.slotKey),
        );
        if (!value) {
          throw new NotFoundException('Challenge configuration not found');
        }
        return value;
      },
    });
    return this.summarize(updated, challengeType);
  }

  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.require(id);
    const worldId = String(existing.worldId);
    await this.assertProjectionValid(worldId, (current) =>
      current.filter((configuration) => configuration.id !== id),
    );
    await this.configurations.deleteById(id);
    await this.assets.discard(existing.icon);
    return { id };
  }

  /**
   * Board edits are validated as a projection before anything is written, so a
   * live World is never left broken and nothing has to be rolled back. A World
   * whose board is already incomplete stays editable — that is how it gets
   * finished.
   */
  private async assertProjectionValid(
    worldId: string,
    project: (
      current: WorldChallengeConfigurationView[],
    ) => WorldChallengeConfigurationView[],
  ): Promise<void> {
    const current = (await this.configurations.listByWorld(worldId)).map(
      toConfigurationView,
    );
    await this.readiness.assertChangeKeepsActiveWorldValid(
      { worldId, configurationOverrides: project(current) },
      'This change would break the board of an active World',
    );
  }

  private slotConflict(slotKey: string) {
    return {
      code: 'BOARD_SLOT_ALREADY_FILLED',
      message: `The ${slotKey} board position is already filled in this World`,
    };
  }

  private duplicateMechanicConflict(): WorldContentConflictError {
    return new WorldContentConflictError(
      'DUPLICATE_BOARD_CHALLENGE_TYPE',
      'Duplicate mechanics are not allowed in the same World.',
    );
  }

  private summarize(
    document: WorldChallengeConfiguration,
    challengeType: ChallengeTypeView,
  ): WorldChallengeConfigurationSummary {
    const view = toConfigurationView(document);
    return {
      ...view,
      icon: document.icon,
      challengeType,
      effectiveName: view.displayName ?? challengeType.name,
    };
  }

  private async require(id: string): Promise<WorldChallengeConfiguration> {
    const configuration = await this.configurations.findById(id);
    if (!configuration) {
      throw new NotFoundException('Challenge configuration not found');
    }
    return configuration;
  }

  private async requireWorld(worldId: string): Promise<void> {
    if (!(await this.worlds.findById(worldId))) {
      throw new NotFoundException('World not found');
    }
  }

  private async requireChallengeType(id: string): Promise<ChallengeTypeView> {
    const challengeType = await this.challengeTypes.findById(id);
    if (!challengeType) throw new NotFoundException('Challenge type not found');
    return toChallengeTypeView(challengeType);
  }
}
