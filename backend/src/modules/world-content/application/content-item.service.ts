import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ContentItemCompatibilityPolicy } from '../domain/content-item-compatibility.policy';
import {
  ChallengeFamily,
  ContentItemStatus,
} from '../domain/world-content.constants';
import { assertNoIssues } from '../domain/world-content.errors';
import {
  ContentAnswerPayload,
  ContentItemView,
  ReadinessReport,
} from '../domain/world-content.types';
import {
  CreateContentItemDto,
  QueryContentItemsDto,
  UpdateContentItemDto,
} from '../dto/content-item.dto';
import { ChallengeTypeRepository } from '../persistence/challenge-type.repository';
import {
  ContentItemRepository,
  ContentItemQuery,
} from '../persistence/content-item.repository';
import { ScopeRepository } from '../persistence/scope.repository';
import { WorldRepository } from '../persistence/world.repository';
import { ContentItem } from '../schemas/content-item.schema';
import {
  toChallengeTypeViewMap,
  toContentItemView,
  toScopeView,
} from './world-content.mapper';

export interface ContentItemSummary extends ContentItemView {
  readiness: ReadinessReport;
  /** Families the item can be played through; drives the reuse rule (6.4). */
  compatibleFamilies: ChallengeFamily[];
  isSessionReuseExempt: boolean;
}

@Injectable()
export class ContentItemService {
  constructor(
    private readonly contentItems: ContentItemRepository,
    private readonly scopes: ScopeRepository,
    private readonly worlds: WorldRepository,
    private readonly challengeTypes: ChallengeTypeRepository,
    private readonly policy: ContentItemCompatibilityPolicy,
  ) {}

  async list(query: QueryContentItemsDto): Promise<ContentItemSummary[]> {
    const documents = await this.contentItems.list(query as ContentItemQuery);
    return Promise.all(documents.map((document) => this.summarize(document)));
  }

  async findOne(id: string): Promise<ContentItemSummary> {
    return this.summarize(await this.require(id));
  }

  async readiness(id: string): Promise<ReadinessReport> {
    const item = await this.require(id);
    return (await this.evaluate(toContentItemView(item))).report;
  }

  async create(dto: CreateContentItemDto): Promise<ContentItemSummary> {
    const scope = await this.requireScope(dto.scopeId);
    const worldId = String(scope.worldId);
    const candidate: ContentItemView = {
      id: 'new',
      scopeId: dto.scopeId,
      worldId,
      prompt: dto.prompt,
      compatibleChallengeTypeIds: dto.compatibleChallengeTypeIds,
      ...(dto.media ? { media: dto.media } : {}),
      answerPayload: dto.answerPayload as ContentAnswerPayload,
      ...(dto.mechanicPayload ? { mechanicPayload: dto.mechanicPayload } : {}),
      // Filled in below once the mechanics have been loaded exactly once.
      isReusableAcrossSessions: dto.isReusableAcrossSessions ?? false,
      status: dto.status ?? ContentItemStatus.DRAFT,
      ...(dto.metadata ? { metadata: dto.metadata } : {}),
    };
    const { compatibleFamilies } = await this.assertWritable(candidate, dto);
    if (dto.isReusableAcrossSessions === undefined) {
      // Roadmap 6.4: Relational-only content defaults to reusable.
      candidate.isReusableAcrossSessions =
        this.policy.defaultReuseAcrossSessions(compatibleFamilies);
    }

    const created = await this.contentItems.create({
      scopeId: new Types.ObjectId(dto.scopeId),
      worldId: new Types.ObjectId(worldId),
      prompt: candidate.prompt,
      compatibleChallengeTypeIds: candidate.compatibleChallengeTypeIds.map(
        (id) => new Types.ObjectId(id),
      ),
      media: candidate.media,
      answerPayload: candidate.answerPayload,
      mechanicPayload: candidate.mechanicPayload,
      isReusableAcrossSessions: candidate.isReusableAcrossSessions,
      status: candidate.status,
      metadata: candidate.metadata,
    } as Partial<ContentItem>);
    return this.summarize(created);
  }

  async update(
    id: string,
    dto: UpdateContentItemDto,
  ): Promise<ContentItemSummary> {
    const existing = await this.require(id);
    const existingView = toContentItemView(existing);
    const scopeId = dto.scopeId ?? existingView.scopeId;
    const scope = await this.requireScope(scopeId);
    const candidate: ContentItemView = {
      ...existingView,
      scopeId,
      // The denormalized World always follows the Scope (roadmap 12).
      worldId: String(scope.worldId),
      ...(dto.prompt ? { prompt: dto.prompt } : {}),
      ...(dto.compatibleChallengeTypeIds
        ? { compatibleChallengeTypeIds: dto.compatibleChallengeTypeIds }
        : {}),
      ...(dto.media === undefined ? {} : { media: dto.media }),
      ...(dto.answerPayload
        ? { answerPayload: dto.answerPayload as ContentAnswerPayload }
        : {}),
      ...(dto.mechanicPayload === undefined
        ? {}
        : { mechanicPayload: dto.mechanicPayload }),
      ...(dto.isReusableAcrossSessions === undefined
        ? {}
        : { isReusableAcrossSessions: dto.isReusableAcrossSessions }),
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.metadata === undefined ? {} : { metadata: dto.metadata }),
    };
    await this.assertWritable(candidate, dto);

    const updated = await this.contentItems.updateById(id, {
      scopeId: new Types.ObjectId(candidate.scopeId),
      worldId: new Types.ObjectId(candidate.worldId),
      prompt: candidate.prompt,
      compatibleChallengeTypeIds: candidate.compatibleChallengeTypeIds.map(
        (value) => new Types.ObjectId(value),
      ),
      media: candidate.media,
      answerPayload: candidate.answerPayload,
      mechanicPayload: candidate.mechanicPayload,
      isReusableAcrossSessions: candidate.isReusableAcrossSessions,
      status: candidate.status,
      metadata: candidate.metadata,
    } as Partial<ContentItem>);
    if (!updated) throw new NotFoundException('Content item not found');
    return this.summarize(updated);
  }

  async remove(id: string): Promise<{ id: string }> {
    await this.require(id);
    await this.contentItems.deleteById(id);
    return { id };
  }

  /**
   * One gate for every write: legacy fields are refused, and a `ready` item must
   * satisfy the full compatibility policy (roadmap 14).
   */
  private async assertWritable(
    candidate: ContentItemView,
    raw: CreateContentItemDto | UpdateContentItemDto,
  ): Promise<{ compatibleFamilies: ChallengeFamily[] }> {
    assertNoIssues(
      this.policy.findLegacyFields(raw as unknown as Record<string, unknown>),
      'Legacy question fields are not part of the World Content domain',
    );
    const { report, compatibleFamilies } = await this.evaluate(candidate);
    assertNoIssues(
      report.blockers.filter((problem) =>
        [
          'ONE_CLUE_STRUCTURE_INVALID',
          'RAKKIBHA_STRUCTURE_REQUIRED',
        ].includes(problem.code),
      ),
      'The selected mechanic content pattern is invalid',
    );
    if (candidate.status === ContentItemStatus.READY) {
      assertNoIssues(
        report.blockers,
        'This content item cannot be marked ready yet',
      );
    }
    return { compatibleFamilies };
  }

  private async evaluate(candidate: ContentItemView): Promise<{
    report: ReadinessReport;
    compatibleFamilies: ChallengeFamily[];
  }> {
    const [scope, world, challengeTypes] = await Promise.all([
      this.scopes.findById(candidate.scopeId),
      this.worlds.findById(candidate.worldId),
      this.challengeTypes.findByIds(candidate.compatibleChallengeTypeIds),
    ]);
    const challengeTypeViews = toChallengeTypeViewMap(challengeTypes);
    return {
      report: this.policy.evaluate({
        item: candidate,
        ...(scope ? { scope: toScopeView(scope) } : {}),
        ...(world ? { worldStatus: world.status } : {}),
        challengeTypes: challengeTypeViews,
      }),
      compatibleFamilies: [...challengeTypeViews.values()].map(
        (challengeType) => challengeType.family,
      ),
    };
  }

  private async familiesFor(
    challengeTypeIds: string[],
  ): Promise<ChallengeFamily[]> {
    const challengeTypes =
      await this.challengeTypes.findByIds(challengeTypeIds);
    return challengeTypes.map((challengeType) => challengeType.family);
  }

  private async summarize(document: ContentItem): Promise<ContentItemSummary> {
    const view = toContentItemView(document);
    const { report, compatibleFamilies } = await this.evaluate(view);
    return {
      ...view,
      readiness: report,
      compatibleFamilies: [...new Set(compatibleFamilies)],
      isSessionReuseExempt:
        this.policy.isSessionReuseExempt(compatibleFamilies),
    };
  }

  private async require(id: string): Promise<ContentItem> {
    const item = await this.contentItems.findById(id);
    if (!item) throw new NotFoundException('Content item not found');
    return item;
  }

  private async requireScope(scopeId: string) {
    const scope = await this.scopes.findById(scopeId);
    if (!scope) throw new NotFoundException('Scope not found');
    return scope;
  }
}
