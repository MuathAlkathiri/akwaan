import { Injectable, NotFoundException } from '@nestjs/common';
import { UploadedImageFile } from '../../../common/uploads/local-image-storage.service';
import { WorldReadinessReport } from '../domain/world-readiness.policy';
import { WorldContentStatus } from '../domain/world-content.constants';
import {
  assertNoIssues,
  issue,
  withUniqueConstraint,
  WorldContentConflictError,
  WorldContentValidationError,
} from '../domain/world-content.errors';
import { ContentAssetRef, WorldView } from '../domain/world-content.types';
import { CreateWorldDto, UpdateWorldDto } from '../dto/world.dto';
import { ChallengeTypeRepository } from '../persistence/challenge-type.repository';
import { ContentItemRepository } from '../persistence/content-item.repository';
import { ScopeRepository } from '../persistence/scope.repository';
import { WorldChallengeConfigurationRepository } from '../persistence/world-challenge-configuration.repository';
import { WorldRepository } from '../persistence/world.repository';
import { World } from '../schemas/world.schema';
import { WorldContentAssetMutator } from './world-content-asset.mutator';
import { WorldContentReferenceRegistry } from './world-content-reference.registry';
import { WorldReadinessService } from './world-readiness.service';
import { toWorldView } from './world-content.mapper';

export interface WorldSummary extends WorldView {
  description?: string;
  icon?: ContentAssetRef;
  banner?: ContentAssetRef;
  sortOrder: number;
  scopeCount: number;
  challengeConfigurationCount: number;
  contentItemCount: number;
  readiness: WorldReadinessReport;
}

@Injectable()
export class WorldService {
  constructor(
    private readonly worlds: WorldRepository,
    private readonly scopes: ScopeRepository,
    private readonly configurations: WorldChallengeConfigurationRepository,
    private readonly contentItems: ContentItemRepository,
    private readonly challengeTypes: ChallengeTypeRepository,
    private readonly readiness: WorldReadinessService,
    private readonly assets: WorldContentAssetMutator,
    private readonly references: WorldContentReferenceRegistry,
  ) {}

  async list(): Promise<WorldSummary[]> {
    const [documents, evaluated] = await Promise.all([
      this.worlds.list(),
      this.readiness.evaluateAllWorlds(),
    ]);
    const readinessByWorld = new Map(
      evaluated.map(({ world, report }) => [world.id, report]),
    );
    return Promise.all(
      documents.flatMap((document) => {
        const readiness = readinessByWorld.get(String(document._id));
        return readiness ? [this.summarize(document, readiness)] : [];
      }),
    );
  }

  async findOne(id: string): Promise<WorldSummary> {
    const world = await this.require(id);
    return this.summarize(world, await this.readiness.evaluateWorld(id));
  }

  worldReadiness(id: string): Promise<WorldReadinessReport> {
    return this.readiness.evaluateWorld(id);
  }

  async create(
    dto: CreateWorldDto,
    file?: UploadedImageFile,
  ): Promise<WorldSummary> {
    if (dto.status === WorldContentStatus.ACTIVE) {
      // A brand new World has no board, so it can never satisfy the activation
      // rules. Activation is a separate, validated transition (roadmap 5).
      throw new WorldContentValidationError([
        issue(
          'WORLD_ACTIVATION_REQUIRES_BOARD',
          'A World is created as a draft and can only be activated once its four-slot board and Signature mechanic are configured',
        ),
      ]);
    }
    if (dto.signatureMechanicId) {
      await this.assertChallengeTypeExists(dto.signatureMechanicId);
    }
    await this.assertSlugAvailable(dto.slug);
    const created = await this.assets.withAsset({
      kind: 'worlds',
      field: 'banner',
      data: { ...dto, status: dto.status ?? WorldContentStatus.DRAFT },
      file,
      run: (payload) =>
        withUniqueConstraint(
          () => this.worlds.create(payload as Partial<World>),
          this.slugConflict(dto.slug),
        ),
    });
    return this.summarize(
      created,
      await this.readiness.evaluateWorld(String(created._id)),
    );
  }

  async update(
    id: string,
    dto: UpdateWorldDto,
    file?: UploadedImageFile,
  ): Promise<WorldSummary> {
    const existing = await this.require(id);
    if (dto.signatureMechanicId) {
      await this.assertChallengeTypeExists(dto.signatureMechanicId);
    }
    if (dto.slug && dto.slug !== existing.slug) {
      await this.assertSlugAvailable(dto.slug, id);
    }
    const targetStatus = dto.status ?? existing.status;
    if (targetStatus === WorldContentStatus.ACTIVE) {
      await this.assertProjectionActivatable(id, {
        status: WorldContentStatus.ACTIVE,
        ...(dto.signatureMechanicId
          ? { signatureMechanicId: dto.signatureMechanicId }
          : {}),
      });
    }
    const updated = await this.assets.withAsset({
      kind: 'worlds',
      field: 'banner',
      data: { ...dto },
      file,
      previous: existing.banner,
      run: async (payload) => {
        const value = await withUniqueConstraint(
          () => this.worlds.updateById(id, payload as Partial<World>),
          this.slugConflict(dto.slug ?? existing.slug),
        );
        if (!value) throw new NotFoundException('World not found');
        return value;
      },
    });
    return this.summarize(updated, await this.readiness.evaluateWorld(id));
  }

  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.require(id);
    const [scopeCount, configurationCount, contentItemCount] =
      await Promise.all([
        this.scopes.countByWorld(id),
        this.configurations.countByWorld(id),
        this.contentItems.countByWorld(id),
      ]);
    if (scopeCount || configurationCount || contentItemCount) {
      throw new WorldContentConflictError(
        'WORLD_NOT_EMPTY',
        "Remove this World's scopes, challenge configurations, and content items before deleting it",
      );
    }
    await this.references.assertUnreferenced('world', id);
    await this.worlds.deleteById(id);
    await this.assets.discard(existing.banner);
    return { id };
  }

  /** Shared by the World and configuration services before any write. */
  async assertProjectionActivatable(
    worldId: string,
    worldOverrides: Partial<WorldView>,
  ): Promise<void> {
    const report = await this.readiness.evaluateWorldProjection({
      worldId,
      worldOverrides,
    });
    assertNoIssues(
      report.blockers,
      'This World does not satisfy the activation rules yet',
    );
  }

  private async summarize(
    world: World,
    readiness: WorldReadinessReport,
  ): Promise<WorldSummary> {
    const view = toWorldView(world);
    const [scopeCount, challengeConfigurationCount, contentItemCount] =
      await Promise.all([
        this.scopes.countByWorld(view.id),
        this.configurations.countByWorld(view.id),
        this.contentItems.countByWorld(view.id),
      ]);
    return {
      ...view,
      description: world.description,
      icon: world.icon,
      banner: world.banner,
      sortOrder: world.sortOrder ?? 0,
      scopeCount,
      challengeConfigurationCount,
      contentItemCount,
      readiness,
    };
  }

  private async require(id: string): Promise<World> {
    const world = await this.worlds.findById(id);
    if (!world) throw new NotFoundException('World not found');
    return world;
  }

  private async assertSlugAvailable(
    slug: string,
    exceptId?: string,
  ): Promise<void> {
    if (await this.worlds.slugTaken(slug, exceptId)) {
      assertNoIssues([
        issue(
          'WORLD_SLUG_TAKEN',
          `A World with the short name "${slug}" already exists`,
          { slug },
        ),
      ]);
    }
  }

  private slugConflict(slug: string) {
    return {
      code: 'WORLD_SLUG_TAKEN',
      message: `A World with the short name "${slug}" already exists`,
    };
  }

  private async assertChallengeTypeExists(id: string): Promise<void> {
    if (!(await this.challengeTypes.findById(id))) {
      throw new WorldContentValidationError([
        issue(
          'SIGNATURE_MECHANIC_NOT_FOUND',
          'The referenced Signature mechanic does not exist',
          { challengeTypeId: id },
        ),
      ]);
    }
  }
}
