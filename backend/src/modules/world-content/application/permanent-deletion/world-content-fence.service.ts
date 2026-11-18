import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';

export const WORLD_CONTENT_FENCE_COLLECTION = 'world_content_fences';

/**
 * Serialises Match creation against permanent deletion, per World.
 *
 * Both sides write the World's fence document as the first operation of their
 * transaction. MongoDB lets only one in-flight transaction write a document, so
 * the other aborts with a transient write conflict and `withTransaction` retries
 * it once the first has committed. The retry then reads the committed result:
 * - a Match created first is seen by the deletion, which blocks on it;
 * - a deletion committed first is seen by the Match's re-validation, which fails
 *   cleanly (World not found / not active).
 *
 * A deliberate twin of the content engine's `engine_inventory_fences` (which is
 * Scope-scoped and owned by content-engine). The documents carry no data beyond
 * a counter; a fence row left behind for a deleted World is harmless.
 */
@Injectable()
export class WorldContentFenceService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Creates missing fence documents. Runs outside any transaction because a
   * transaction cannot always create a collection or upsert under contention;
   * this mirrors how the content engine prepares its fence.
   */
  async ensure(worldIds: readonly string[]): Promise<void> {
    const ids = this.objectIds(worldIds);
    if (!ids.length) return;
    try {
      await this.collection().bulkWrite(
        ids.map((_id) => ({
          updateOne: {
            filter: { _id },
            update: { $setOnInsert: { revision: 0 } },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    } catch (error) {
      // Two writers upserting the same new fence: the loser's duplicate key is
      // the document existing, which is all this needed.
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }

  /** Bumps every fence inside the caller's transaction. */
  async bump(
    worldIds: readonly string[],
    session: ClientSession,
  ): Promise<void> {
    const ids = this.objectIds(worldIds);
    if (!ids.length) return;
    // Sorted so two transactions fencing the same Worlds take them in the same
    // order, which keeps conflicts to a single retry rather than a livelock.
    ids.sort((left, right) =>
      left.toHexString().localeCompare(right.toHexString()),
    );
    for (const _id of ids) {
      await this.collection().updateOne(
        { _id },
        { $inc: { revision: 1 } },
        // Upsert: a missing fence must still be written, or two transactions
        // could pass each other without the write conflict this relies on.
        { session, upsert: true },
      );
    }
  }

  private objectIds(worldIds: readonly string[]): Types.ObjectId[] {
    const unique = [...new Set(worldIds.map(String))];
    return unique
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
  }

  private collection() {
    return this.connection.collection(WORLD_CONTENT_FENCE_COLLECTION);
  }
}
