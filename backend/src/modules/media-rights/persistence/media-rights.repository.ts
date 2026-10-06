import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { MediaRightsDocument } from '../schemas/media-rights.schema';

/** One ContentItem that would be affected by a change to an asset. */
export interface AffectedContentItem {
  contentItemId: string;
  worldId: string | null;
  scopeId: string | null;
  status: string | null;
}

@Injectable()
export class MediaRightsRepository {
  constructor(
    @InjectModel(MediaRightsDocument.name)
    private readonly model: Model<MediaRightsDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  findByAssetUrl(assetUrl: string): Promise<MediaRightsDocument | null> {
    return this.model.findOne({ assetUrl }).lean<MediaRightsDocument>().exec();
  }

  /** Bulk read for a promotion plan — one query, not one per asset. */
  async findManyByAssetUrl(
    assetUrls: string[],
  ): Promise<Map<string, MediaRightsDocument>> {
    if (!assetUrls.length) return new Map();
    const rows = await this.model
      .find({ assetUrl: { $in: assetUrls } })
      .lean<MediaRightsDocument[]>()
      .exec();
    return new Map(rows.map((row) => [row.assetUrl, row]));
  }

  /**
   * Create or update the record for one asset.
   *
   * Upsert on the unique key, so recording evidence twice converges instead of
   * racing into a duplicate.
   */
  async upsert(
    assetUrl: string,
    patch: Partial<MediaRightsDocument>,
  ): Promise<MediaRightsDocument> {
    return this.model
      .findOneAndUpdate(
        { assetUrl },
        { $set: { ...patch, assetUrl } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .lean<MediaRightsDocument>()
      .exec() as Promise<MediaRightsDocument>;
  }

  /**
   * Which ContentItems use this asset.
   *
   * Read through the raw collection rather than the World Content model on
   * purpose. The registry is keyed only by `assetUrl` and knows nothing about
   * content modelling; importing the content module here would add an import
   * edge that `world-content.architecture.spec.ts` deliberately pins to an
   * explicit allowlist, for a projection of four fields.
   *
   * The relationship stays query-derived. Copying ContentItem ids into the
   * rights record would be a second source of truth that goes stale the moment
   * an item is promoted, retired or re-scoped.
   */
  async affectedContentItems(assetUrl: string): Promise<AffectedContentItem[]> {
    const rows = await this.connection
      .collection('content_items')
      .find(
        { 'media.assets.url': assetUrl },
        { projection: { _id: 1, worldId: 1, scopeId: 1, status: 1 } },
      )
      .toArray();
    return rows.map((row) => ({
      contentItemId: String(row._id),
      worldId: row.worldId ? String(row.worldId) : null,
      scopeId: row.scopeId ? String(row.scopeId) : null,
      status: typeof row.status === 'string' ? row.status : null,
    }));
  }
}
