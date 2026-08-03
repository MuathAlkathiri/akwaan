import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UploadedImageFile } from '../../../common/uploads/local-image-storage.service';
import { ScopeCompatibility } from '../domain/scope-compatibility.policy';
import { WorldContentStatus } from '../domain/world-content.constants';
import {
  assertNoIssues,
  issue,
  withUniqueConstraint,
  WorldContentConflictError,
} from '../domain/world-content.errors';
import { ContentAssetRef, ScopeView } from '../domain/world-content.types';
import { CreateScopeDto, UpdateScopeDto } from '../dto/scope.dto';
import { ChallengeTypeRepository } from '../persistence/challenge-type.repository';
import { ContentItemRepository } from '../persistence/content-item.repository';
import { ScopeRepository } from '../persistence/scope.repository';
import { WorldRepository } from '../persistence/world.repository';
import { Scope } from '../schemas/scope.schema';
import { WorldContentAssetMutator } from './world-content-asset.mutator';
import { WorldContentReferenceRegistry } from './world-content-reference.registry';
import { WorldReadinessService } from './world-readiness.service';
import { toScopeView } from './world-content.mapper';

export interface ScopeSummary extends ScopeView {
  description?: string;
  image?: ContentAssetRef;
  sortOrder: number;
  contentItemCount: number;
  readyContentItemCount: number;
  compatibility: ScopeCompatibility;
}

@Injectable()
export class ScopeService {
  constructor(
    private readonly scopes: ScopeRepository,
    private readonly worlds: WorldRepository,
    private readonly challengeTypes: ChallengeTypeRepository,
    private readonly contentItems: ContentItemRepository,
    private readonly readiness: WorldReadinessService,
    private readonly assets: WorldContentAssetMutator,
    private readonly references: WorldContentReferenceRegistry,
  ) {}

  async listByWorld(worldId: string): Promise<ScopeSummary[]> {
    await this.requireWorld(worldId);
    // The World readiness report already evaluates every Scope, so the list
    // reuses it instead of re-running the policy per row.
    const [scopes, readyByScope, worldReadiness] = await Promise.all([
      this.scopes.listByWorld(worldId),
      this.contentItems.readyCountsByScope(worldId),
      this.readiness.evaluateWorld(worldId),
    ]);
    const compatibilityByScope = new Map(
      worldReadiness.scopeCompatibility.map((entry) => [entry.scopeId, entry]),
    );
    return Promise.all(
      scopes.map(async (scope) => {
        const view = toScopeView(scope);
        return {
          ...view,
          description: scope.description,
          image: scope.image,
          sortOrder: scope.sortOrder ?? 0,
          contentItemCount: await this.contentItems.countByScope(view.id),
          readyContentItemCount: readyByScope.get(view.id) ?? 0,
          compatibility:
            compatibilityByScope.get(view.id) ??
            (await this.readiness.evaluateScope(view.id)),
        };
      }),
    );
  }

  async findOne(id: string): Promise<ScopeSummary> {
    const scope = await this.require(id);
    return this.summarize(scope);
  }

  scopeReadiness(id: string): Promise<ScopeCompatibility> {
    return this.readiness.evaluateScope(id);
  }

  async create(
    worldId: string,
    dto: CreateScopeDto,
    file?: UploadedImageFile,
  ): Promise<ScopeSummary> {
    await this.requireWorld(worldId);
    await this.assertSlugAvailable(worldId, dto.slug);
    const excludedChallengeTypeIds = await this.resolveExclusions(
      dto.excludedChallengeTypeIds,
    );
    const created = await this.assets.withAsset({
      kind: 'scopes',
      field: 'image',
      data: {
        ...dto,
        worldId: new Types.ObjectId(worldId),
        excludedChallengeTypeIds,
        status: dto.status ?? WorldContentStatus.DRAFT,
      },
      file,
      run: (payload) =>
        withUniqueConstraint(
          () => this.scopes.create(payload as Partial<Scope>),
          this.slugConflict(dto.slug),
        ),
    });
    return this.summarize(created);
  }

  async update(
    id: string,
    dto: UpdateScopeDto,
    file?: UploadedImageFile,
  ): Promise<ScopeSummary> {
    const existing = await this.require(id);
    const worldId = String(existing.worldId);
    if (dto.slug && dto.slug !== existing.slug) {
      await this.assertSlugAvailable(worldId, dto.slug, id);
    }
    const excludedChallengeTypeIds =
      dto.excludedChallengeTypeIds === undefined
        ? undefined
        : await this.resolveExclusions(dto.excludedChallengeTypeIds);

    await this.assertActiveWorldStaysReady(worldId, {
      ...toScopeView(existing),
      ...(dto.status ? { status: dto.status } : {}),
      ...(excludedChallengeTypeIds
        ? {
            excludedChallengeTypeIds: excludedChallengeTypeIds.map((value) =>
              String(value),
            ),
          }
        : {}),
    });

    const updated = await this.assets.withAsset({
      kind: 'scopes',
      field: 'image',
      data: {
        ...dto,
        ...(excludedChallengeTypeIds ? { excludedChallengeTypeIds } : {}),
      },
      file,
      previous: existing.image,
      run: async (payload) => {
        const value = await withUniqueConstraint(
          () => this.scopes.updateById(id, payload as Partial<Scope>),
          this.slugConflict(dto.slug ?? existing.slug),
        );
        if (!value) throw new NotFoundException('Scope not found');
        return value;
      },
    });
    return this.summarize(updated);
  }

  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.require(id);
    if (await this.contentItems.countByScope(id)) {
      throw new WorldContentConflictError(
        'SCOPE_NOT_EMPTY',
        'This Scope still owns content items',
      );
    }
    await this.references.assertUnreferenced('scope', id);
    await this.scopes.deleteById(id);
    await this.assets.discard(existing.image);
    return { id };
  }

  private async summarize(scope: Scope): Promise<ScopeSummary> {
    const view = toScopeView(scope);
    const [contentItemCount, readyByScope, compatibility] = await Promise.all([
      this.contentItems.countByScope(view.id),
      this.contentItems.readyCountsByScope(view.worldId),
      this.readiness.evaluateScope(view.id),
    ]);
    return {
      ...view,
      description: scope.description,
      image: scope.image,
      sortOrder: scope.sortOrder ?? 0,
      contentItemCount,
      readyContentItemCount: readyByScope.get(view.id) ?? 0,
      compatibility,
    };
  }

  /**
   * Exclusions only mean something if they point at mechanics that exist
   * (roadmap 6), so an unknown id is rejected at the boundary instead of
   * surfacing later as a readiness failure.
   */
  private async resolveExclusions(
    ids: string[] | undefined,
  ): Promise<Types.ObjectId[]> {
    if (!ids?.length) return [];
    const unique = [...new Set(ids)];
    const found = await this.challengeTypes.findByIds(unique);
    const foundIds = new Set(
      found.map((challengeType) => String(challengeType._id)),
    );
    const missing = unique.filter((id) => !foundIds.has(id));
    if (missing.length) {
      assertNoIssues(
        missing.map((challengeTypeId) =>
          issue(
            'SCOPE_EXCLUDES_UNKNOWN_CHALLENGE_TYPE',
            'A Scope cannot exclude a challenge type that does not exist',
            { challengeTypeId },
          ),
        ),
      );
    }
    return unique.map((id) => new Types.ObjectId(id));
  }

  /**
   * An active World must never be left below the four-challenge minimum by a
   * Scope edit, so the change is validated as a projection before it is written.
   */
  private async assertActiveWorldStaysReady(
    worldId: string,
    projectedScope: ScopeView,
  ): Promise<void> {
    const scopes = (await this.scopes.listByWorld(worldId)).map(toScopeView);
    await this.readiness.assertChangeKeepsActiveWorldValid(
      {
        worldId,
        scopeOverrides: scopes.map((scope) =>
          scope.id === projectedScope.id ? projectedScope : scope,
        ),
      },
      'This change would break an active World',
    );
  }

  private async require(id: string): Promise<Scope> {
    const scope = await this.scopes.findById(id);
    if (!scope) throw new NotFoundException('Scope not found');
    return scope;
  }

  private async requireWorld(worldId: string): Promise<void> {
    if (!(await this.worlds.findById(worldId))) {
      throw new NotFoundException('World not found');
    }
  }

  private slugConflict(slug: string) {
    return {
      code: 'SCOPE_SLUG_TAKEN',
      message: `Scope slug "${slug}" is already used in this World`,
    };
  }

  private async assertSlugAvailable(
    worldId: string,
    slug: string,
    exceptId?: string,
  ): Promise<void> {
    if (await this.scopes.slugTakenInWorld(worldId, slug, exceptId)) {
      assertNoIssues([
        issue(
          'SCOPE_SLUG_TAKEN',
          `Scope slug "${slug}" is already used in this World`,
          { slug },
        ),
      ]);
    }
  }
}
