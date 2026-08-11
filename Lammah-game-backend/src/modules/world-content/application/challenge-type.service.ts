import { Injectable, NotFoundException } from '@nestjs/common';
import { UploadedImageFile } from '../../../common/uploads/local-image-storage.service';
import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { ChallengeTypePolicy } from '../domain/challenge-type.policy';
import {
  PRODUCTION_MECHANICS,
  productionMechanicDefinition,
  ProductionMechanicDefinition,
} from '../domain/production-mechanic.definition';
import {
  ANSWER_MODE_COMPATIBLE_ITEM_MODES,
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  FAMILY_ALLOWED_ANSWER_MODES,
  FAMILY_DEFAULT_TIMER_SECONDS,
  WORLD_BOARD_SLOT_COUNT,
  WORLD_BOARD_SLOT_KEYS,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from '../domain/world-content.constants';
import {
  assertNoIssues,
  issue,
  withUniqueConstraint,
  WorldContentConflictError,
} from '../domain/world-content.errors';
import {
  buildReadinessReport,
  ChallengeTypeView,
  ContentAssetRef,
  normalizePresentation,
  ReadinessReport,
} from '../domain/world-content.types';
import {
  CreateChallengeTypeDto,
  UpdateChallengeTypeDto,
} from '../dto/challenge-type.dto';
import { ChallengeTypeRepository } from '../persistence/challenge-type.repository';
import { ContentItemRepository } from '../persistence/content-item.repository';
import { ScopeRepository } from '../persistence/scope.repository';
import { ProductionMechanicLifecycleRepository } from '../persistence/production-mechanic-lifecycle.repository';
import { WorldChallengeConfigurationRepository } from '../persistence/world-challenge-configuration.repository';
import { ChallengeType } from '../schemas/challenge-type.schema';
import { WorldContentAssetMutator } from './world-content-asset.mutator';
import { WorldContentReferenceRegistry } from './world-content-reference.registry';
import { toChallengeTypeView } from './world-content.mapper';

export interface ChallengeTypeSummary extends ChallengeTypeView {
  description?: string;
  icon?: ContentAssetRef;
  sortOrder: number;
  /** How many Worlds currently configure this mechanic. */
  worldConfigurationCount: number;
  contentItemCount: number;
  readiness: ReadinessReport;
}

export interface ChallengeTypeDeletionPreview {
  challengeTypeId: string;
  name: string;
  historicalMatchUsageCount: number;
  contentItemCount: number;
  worldAssignmentCount: number;
  scopeExclusionCount: number;
  canHardDelete: boolean;
  archiveRequired: boolean;
  productionMechanic: boolean;
}

/**
 * Every rule the admin UI needs in order to offer only valid choices, served from
 * the same domain constants the policies enforce. Without this the frontend would
 * keep its own copy of the slot, family, and compatibility tables and they would
 * drift (roadmap 21).
 */
export interface WorldContentMetadata {
  productionMechanics: Array<Omit<ProductionMechanicDefinition, 'seed'>>;
  families: Array<{
    value: ChallengeFamily;
    allowedAnswerModes: ChallengeAnswerMode[];
    mustBeExclusive: boolean;
    /** The family's pacing budget, so no author has to invent a timer. */
    defaultTimerSeconds: number | null;
  }>;
  itemStructures: ChallengeItemStructure[];
  scoringRules: Array<{
    id: string;
    description: string;
    perfectClearBonusEligible: boolean;
    allowsNegativeDelta: boolean;
    requiresMechanicBinding: boolean;
  }>;
  /** Board composition: four generic positions. */
  boardSlotCount: number;
  slots: Array<{ key: WorldChallengeSlotKey }>;
  /** Which item answer payloads each challenge answer mode can consume. */
  answerModeCompatibility: Array<{
    challengeAnswerMode: ChallengeAnswerMode;
    itemAnswerModes: ChallengeAnswerMode[];
  }>;
}

@Injectable()
export class ChallengeTypeService {
  constructor(
    private readonly challengeTypes: ChallengeTypeRepository,
    private readonly configurations: WorldChallengeConfigurationRepository,
    private readonly contentItems: ContentItemRepository,
    private readonly scopes: ScopeRepository,
    private readonly policy: ChallengeTypePolicy,
    private readonly scoringRules: ScoringRuleRegistry,
    private readonly assets: WorldContentAssetMutator,
    private readonly references: WorldContentReferenceRegistry,
    private readonly lifecycle: ProductionMechanicLifecycleRepository,
  ) {}

  metadata(): WorldContentMetadata {
    return {
      productionMechanics: PRODUCTION_MECHANICS.map((entry) => ({
        slug: entry.slug,
        runtimeKey: entry.runtimeKey,
        family: entry.family,
        itemStructure: entry.itemStructure,
        answerMode: entry.answerMode,
        matchScoringRuleId: entry.matchScoringRuleId,
      })),
      families: Object.values(ChallengeFamily).map((family) => ({
        value: family,
        allowedAnswerModes: [...FAMILY_ALLOWED_ANSWER_MODES[family]],
        mustBeExclusive: false,
        defaultTimerSeconds: FAMILY_DEFAULT_TIMER_SECONDS[family],
      })),
      itemStructures: Object.values(ChallengeItemStructure),
      scoringRules: this.scoringRules.list().map((rule) => ({ ...rule })),
      boardSlotCount: WORLD_BOARD_SLOT_COUNT,
      slots: WORLD_BOARD_SLOT_KEYS.map((key) => ({ key })),
      answerModeCompatibility: Object.values(ChallengeAnswerMode).map(
        (mode) => ({
          challengeAnswerMode: mode,
          itemAnswerModes: [...ANSWER_MODE_COMPATIBLE_ITEM_MODES[mode]],
        }),
      ),
    };
  }

  async list(): Promise<ChallengeTypeSummary[]> {
    const challengeTypes = await this.challengeTypes.list();
    return Promise.all(
      challengeTypes.map((challengeType) => this.summarize(challengeType)),
    );
  }

  async findOne(id: string): Promise<ChallengeTypeSummary> {
    return this.summarize(await this.require(id));
  }

  async readiness(id: string): Promise<ReadinessReport> {
    return this.evaluate(await this.require(id));
  }

  async deletionPreview(id: string): Promise<ChallengeTypeDeletionPreview> {
    const challengeType = await this.require(id);
    const [
      historicalMatchUsageCount,
      contentItemCount,
      worldAssignmentCount,
      scopeExclusionCount,
    ] = await Promise.all([
      this.references.countReferencesFrom(
        'persisted-matches',
        'challengeType',
        id,
        { slug: challengeType.slug },
      ),
      this.contentItems.countByChallengeType(id),
      this.configurations.countByChallengeType(id),
      this.scopes.countExcludingChallengeType(id),
    ]);
    const archiveRequired = historicalMatchUsageCount > 0;
    return {
      challengeTypeId: id,
      name: challengeType.name,
      historicalMatchUsageCount,
      contentItemCount,
      worldAssignmentCount,
      scopeExclusionCount,
      canHardDelete: !archiveRequired,
      archiveRequired,
      productionMechanic: Boolean(
        productionMechanicDefinition(challengeType.slug),
      ),
    };
  }

  async archive(id: string): Promise<ChallengeTypeSummary> {
    const existing = await this.require(id);
    const matchUsageCount = await this.references.countReferencesFrom(
      'persisted-matches',
      'challengeType',
      id,
      { slug: existing.slug },
    );
    if (matchUsageCount === 0) {
      throw new WorldContentConflictError(
        'CHALLENGE_TYPE_ARCHIVE_NOT_REQUIRED',
        'This mechanic has no persisted Match history and should be hard deleted instead',
      );
    }
    const updated = await this.challengeTypes.updateById(id, {
      status: WorldContentStatus.ARCHIVED,
    });
    if (!updated) throw new NotFoundException('Challenge type not found');
    return this.summarize(updated);
  }

  async create(
    dto: CreateChallengeTypeDto,
    file?: UploadedImageFile,
  ): Promise<ChallengeTypeSummary> {
    await this.assertSlugAvailable(dto.slug);
    const candidate = this.toCandidate(dto);
    assertNoIssues(
      this.policy.validate(candidate),
      'Challenge type is invalid',
    );
    const created = await this.assets.withAsset({
      kind: 'challenge-types',
      field: 'icon',
      data: {
        ...this.toPersistable(candidate),
        description: dto.description,
        icon: dto.icon,
        sortOrder: dto.sortOrder ?? 0,
      },
      file,
      run: (payload) =>
        withUniqueConstraint(
          () => this.challengeTypes.create(payload as Partial<ChallengeType>),
          this.slugConflict(candidate.slug),
        ),
    });
    return this.summarize(created);
  }

  async update(
    id: string,
    dto: UpdateChallengeTypeDto,
    file?: UploadedImageFile,
  ): Promise<ChallengeTypeSummary> {
    const existing = await this.require(id);
    if (dto.slug && dto.slug !== existing.slug) {
      await this.assertSlugAvailable(dto.slug, id);
    }
    const candidate = this.mergeCandidate(toChallengeTypeView(existing), dto);
    const canonical = productionMechanicDefinition(existing.slug);
    if (canonical) {
      if (candidate.slug !== canonical.slug) {
        assertNoIssues([
          issue(
            'PRODUCTION_MECHANIC_SLUG_RUNTIME_OWNED',
            `Production mechanic identifier "${canonical.slug}" is runtime-owned`,
            { expected: canonical.slug, actual: candidate.slug },
          ),
        ]);
      }
      assertNoIssues(
        this.policy.validate({ ...candidate, slug: canonical.slug }),
        'Production mechanic system fields are runtime-owned',
      );
    }
    assertNoIssues(
      this.policy.validate(candidate),
      'Challenge type is invalid',
    );
    const updated = await this.assets.withAsset({
      kind: 'challenge-types',
      field: 'icon',
      data: {
        ...this.toPersistable(candidate),
        ...(dto.description === undefined
          ? {}
          : { description: dto.description }),
        ...(dto.icon === undefined ? {} : { icon: dto.icon }),
        ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
      },
      file,
      previous: existing.icon,
      run: async (payload) => {
        const value = await withUniqueConstraint(
          () =>
            this.challengeTypes.updateById(
              id,
              payload as Partial<ChallengeType>,
            ),
          this.slugConflict(candidate.slug),
        );
        if (!value) throw new NotFoundException('Challenge type not found');
        return value;
      },
    });
    return this.summarize(updated);
  }

  async remove(id: string): Promise<{ id: string }> {
    const existing = await this.require(id);
    const matchUsageCount = await this.references.countReferencesFrom(
      'persisted-matches',
      'challengeType',
      id,
      { slug: existing.slug },
    );
    if (matchUsageCount > 0) {
      throw new WorldContentConflictError(
        'CHALLENGE_TYPE_HAS_MATCH_HISTORY',
        `This mechanic is referenced by ${matchUsageCount} persisted Match(es) and must be archived instead`,
      );
    }
    if (productionMechanicDefinition(existing.slug)) {
      await this.lifecycle.markDeleted(existing.slug, id);
    }
    // Standalone Mongo has no transactions. References are removed first and
    // the root last, so a failure cannot leave a dangling reference.
    await this.configurations.deleteByChallengeType(id);
    await this.contentItems.deleteByChallengeType(id);
    await this.scopes.removeChallengeTypeFromExclusions(id);
    await this.challengeTypes.deleteById(id);
    await this.assets.discard(existing.icon);
    return { id };
  }

  private toCandidate(
    dto: CreateChallengeTypeDto,
    id = 'new',
  ): ChallengeTypeView {
    return {
      id,
      name: dto.name,
      slug: dto.slug,
      family: dto.family,
      itemStructure:
        dto.itemStructure ?? ChallengeItemStructure.DISCRETE_TRIPLE,
      answerMode: dto.answerMode,
      defaultPresentation: normalizePresentation(dto.defaultPresentation),
      scoringRuleId: dto.scoringRuleId,
      status: dto.status ?? WorldContentStatus.DRAFT,
    };
  }

  private mergeCandidate(
    existing: ChallengeTypeView,
    dto: UpdateChallengeTypeDto,
  ): ChallengeTypeView {
    const family = dto.family ?? existing.family;
    return {
      id: existing.id,
      name: dto.name ?? existing.name,
      slug: dto.slug ?? existing.slug,
      family,
      itemStructure: dto.itemStructure ?? existing.itemStructure,
      answerMode: dto.answerMode ?? existing.answerMode,
      defaultPresentation: normalizePresentation(
        dto.defaultPresentation ?? existing.defaultPresentation,
      ),
      scoringRuleId: dto.scoringRuleId ?? existing.scoringRuleId,
      status: dto.status ?? existing.status,
    };
  }

  private toPersistable(candidate: ChallengeTypeView): Record<string, unknown> {
    return {
      name: candidate.name,
      slug: candidate.slug,
      family: candidate.family,
      itemStructure: candidate.itemStructure,
      answerMode: candidate.answerMode,
      defaultPresentation: candidate.defaultPresentation,
      scoringRuleId: candidate.scoringRuleId,
      status: candidate.status,
    };
  }

  private evaluate(challengeType: ChallengeType): ReadinessReport {
    const view = toChallengeTypeView(challengeType);
    return buildReadinessReport(
      this.policy.validate(view),
      this.policy.warnings(view),
    );
  }

  private async summarize(
    challengeType: ChallengeType,
  ): Promise<ChallengeTypeSummary> {
    const view = toChallengeTypeView(challengeType);
    const [worldConfigurationCount, contentItemCount] = await Promise.all([
      this.configurations.countByChallengeType(view.id),
      this.contentItems.countByChallengeType(view.id),
    ]);
    return {
      ...view,
      description: challengeType.description,
      icon: challengeType.icon,
      sortOrder: challengeType.sortOrder ?? 0,
      worldConfigurationCount,
      contentItemCount,
      readiness: this.evaluate(challengeType),
    };
  }

  private async require(id: string): Promise<ChallengeType> {
    const challengeType = await this.challengeTypes.findById(id);
    if (!challengeType) throw new NotFoundException('Challenge type not found');
    return challengeType;
  }

  private slugConflict(slug: string) {
    return {
      code: 'CHALLENGE_TYPE_SLUG_TAKEN',
      message: `Mechanic identifier "${slug}" is already used; challenge type slugs are globally unique`,
    };
  }

  private async assertSlugAvailable(
    slug: string,
    exceptId?: string,
  ): Promise<void> {
    if (await this.challengeTypes.slugTaken(slug, exceptId)) {
      assertNoIssues([
        issue(
          'CHALLENGE_TYPE_SLUG_TAKEN',
          `Mechanic identifier "${slug}" is already used; challenge type slugs are globally unique`,
          { slug },
        ),
      ]);
    }
  }
}
