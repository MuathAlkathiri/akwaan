import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UploadedImageFile } from '../../../common/uploads/local-image-storage.service';
import { BoardDefinition } from '../domain/board-definition.policy';
import {
  GLOBALLY_FIXED_FAMILIES,
  SLOT_KEY_TYPES,
} from '../domain/world-content.constants';
import {
  assertNoIssues,
  issue,
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
  description?: string;
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
 * required decisions. Timing, input, reveal behaviour, and scoring belong to the
 * mechanic; media belongs to the ContentItem. A globally fixed mechanic such as
 * RYO keeps one name everywhere and rejects a per-World label outright.
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
    this.assertLabelAllowed(challengeType, dto.displayName);

    const projected: WorldChallengeConfigurationView = {
      id: 'projected',
      worldId,
      challengeTypeId: dto.challengeTypeId,
      slotKey: dto.slotKey,
      slotType: SLOT_KEY_TYPES[dto.slotKey],
      ...(dto.displayName ? { displayName: dto.displayName } : {}),
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
        slotType: projected.slotType,
        displayName: dto.displayName,
        description: dto.description,
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
    if (
      dto.challengeTypeId &&
      dto.challengeTypeId !== String(existing.challengeTypeId)
    ) {
      assertNoIssues([
        issue(
          'CONFIGURATION_CHALLENGE_TYPE_IMMUTABLE',
          'Assign a different mechanic by removing this configuration and creating a new one',
        ),
      ]);
    }
    const challengeType = await this.requireChallengeType(
      String(existing.challengeTypeId),
    );
    this.assertLabelAllowed(challengeType, dto.displayName);

    const projected: WorldChallengeConfigurationView = {
      ...toConfigurationView(existing),
      ...(dto.slotKey
        ? { slotKey: dto.slotKey, slotType: SLOT_KEY_TYPES[dto.slotKey] }
        : {}),
      ...(dto.displayName === undefined
        ? {}
        : { displayName: dto.displayName }),
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
        slotKey: projected.slotKey,
        slotType: projected.slotType,
        sortOrder: projected.sortOrder,
        isEnabled: projected.isEnabled,
        ...(dto.displayName === undefined
          ? {}
          : { displayName: dto.displayName }),
        ...(dto.description === undefined
          ? {}
          : { description: dto.description }),
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
   * A globally fixed mechanic has one player-facing name everywhere. Worlds
   * differ through their Signature mechanic and their content, not by renaming a
   * shared mechanic.
   */
  private assertLabelAllowed(
    challengeType: ChallengeTypeView,
    displayName?: string,
  ): void {
    if (!displayName) return;
    if (!GLOBALLY_FIXED_FAMILIES.includes(challengeType.family)) return;
    assertNoIssues([
      issue(
        'MECHANIC_NAME_IS_GLOBAL',
        `"${challengeType.name}" keeps the same name in every World and cannot be renamed here`,
        { challengeTypeId: challengeType.id, family: challengeType.family },
      ),
    ]);
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

  private summarize(
    document: WorldChallengeConfiguration,
    challengeType: ChallengeTypeView,
  ): WorldChallengeConfigurationSummary {
    const view = toConfigurationView(document);
    return {
      ...view,
      description: document.description,
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
