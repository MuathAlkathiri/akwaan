import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { ContentItemStatus } from '../domain/world-content.constants';
import { ContentItem } from '../schemas/content-item.schema';

export interface ContentItemQuery {
  worldId?: string;
  scopeId?: string;
  challengeTypeId?: string;
  status?: ContentItemStatus;
}

/** Admin listings are bounded so a large library cannot stall the workspace. */
const CONTENT_ITEM_LIST_LIMIT = 200;

@Injectable()
export class ContentItemRepository {
  constructor(
    @InjectModel(ContentItem.name) private readonly model: Model<ContentItem>,
  ) {}

  list(query: ContentItemQuery = {}): Promise<ContentItem[]> {
    return this.model
      .find(this.toFilter(query))
      .sort({ updatedAt: -1 })
      .limit(CONTENT_ITEM_LIST_LIMIT)
      .exec();
  }

  findById(id: string): Promise<ContentItem | null> {
    return this.model.findById(id).exec();
  }

  create(data: Partial<ContentItem>): Promise<ContentItem> {
    return this.model.create(data);
  }

  updateById(
    id: string,
    data: Partial<ContentItem>,
  ): Promise<ContentItem | null> {
    return this.model
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .exec();
  }

  deleteById(id: string): Promise<ContentItem | null> {
    return this.model.findByIdAndDelete(id).exec();
  }

  /**
   * Every ready item a Match may play for one occurrence: in this World, in one of
   * that occurrence's Scopes, and compatible with the mechanic in the board
   * position. Unbounded on purpose — this is a gameplay draw, not an admin
   * listing, and silently truncating the pool would silently bias selection.
   */
  listPlayableForOccurrence(query: {
    worldId: string;
    scopeIds: string[];
    challengeTypeId: string;
  }): Promise<ContentItem[]> {
    return (
      this.model
        .find({
          worldId: new Types.ObjectId(query.worldId),
          scopeId: { $in: query.scopeIds.map((id) => new Types.ObjectId(id)) },
          compatibleChallengeTypeIds: new Types.ObjectId(query.challengeTypeId),
          status: ContentItemStatus.READY,
        })
        // Stable order, so a deterministic draw over it is reproducible.
        .sort({ _id: 1 })
        .exec()
    );
  }

  countByScope(scopeId: string): Promise<number> {
    return this.model
      .countDocuments({ scopeId: new Types.ObjectId(scopeId) })
      .exec();
  }

  countByWorld(worldId: string): Promise<number> {
    return this.model
      .countDocuments({ worldId: new Types.ObjectId(worldId) })
      .exec();
  }

  countByChallengeType(challengeTypeId: string): Promise<number> {
    return this.model
      .countDocuments({
        compatibleChallengeTypeIds: new Types.ObjectId(challengeTypeId),
      })
      .exec();
  }

  async deleteByChallengeType(challengeTypeId: string): Promise<number> {
    const result = await this.model
      .deleteMany({
        compatibleChallengeTypeIds: new Types.ObjectId(challengeTypeId),
      })
      .exec();
    return result.deletedCount ?? 0;
  }

  /** Ready-item counts per challenge type, used by readiness coverage. */
  async readyCountsByChallengeType(
    worldId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.model.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      {
        $match: {
          worldId: new Types.ObjectId(worldId),
          status: ContentItemStatus.READY,
        },
      },
      { $unwind: '$compatibleChallengeTypeIds' },
      { $group: { _id: '$compatibleChallengeTypeIds', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [String(row._id), row.count]));
  }

  async readyCountsByScope(worldId: string): Promise<Map<string, number>> {
    const rows = await this.model.aggregate<{
      _id: Types.ObjectId;
      total: number;
      ready: number;
    }>([
      { $match: { worldId: new Types.ObjectId(worldId) } },
      {
        $group: {
          _id: '$scopeId',
          total: { $sum: 1 },
          ready: {
            $sum: {
              $cond: [{ $eq: ['$status', ContentItemStatus.READY] }, 1, 0],
            },
          },
        },
      },
    ]);
    return new Map(rows.map((row) => [String(row._id), row.ready]));
  }

  private toFilter(query: ContentItemQuery): FilterQuery<ContentItem> {
    const filter: FilterQuery<ContentItem> = {};
    if (query.worldId) filter.worldId = new Types.ObjectId(query.worldId);
    if (query.scopeId) filter.scopeId = new Types.ObjectId(query.scopeId);
    if (query.challengeTypeId) {
      filter.compatibleChallengeTypeIds = new Types.ObjectId(
        query.challengeTypeId,
      );
    }
    if (query.status) filter.status = query.status;
    return filter;
  }
}
