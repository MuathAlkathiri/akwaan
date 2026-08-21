import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import {
  ContentExposureDocument,
  ContentExposureState,
} from './content-exposure.schema';

export interface ContentExposureKey {
  ownerAccountId: string;
  challengeTypeKey: string;
}

/**
 * The exposure ledger's only data access.
 *
 * Every method is scoped by `(ownerAccountId, challengeTypeKey)` — the unique
 * index prefix — so no query can accidentally read across accounts or across
 * mechanics.
 */
@Injectable()
export class ContentExposureRepository {
  constructor(
    @InjectModel(ContentExposureDocument.name)
    private readonly model: Model<ContentExposureDocument>,
  ) {}

  /**
   * Of these candidates, which are unavailable to this account in this mechanic.
   *
   * Returns the *blocked subset* rather than the account's history: the query is
   * an indexed `$in` bounded by the candidates the selector already has in hand,
   * so it costs the same whether the account has seen ten items or ten thousand,
   * and nothing unbounded is ever built or held in memory.
   *
   * A reservation blocks only while it is another Match's and still live —
   * `reservationExpiresAt` in the future. This Match's own reservations are not
   * blocking, so a retried draw for the same position sees the same pool.
   */
  async blockedContentItemIds(
    key: ContentExposureKey,
    candidateContentItemIds: string[],
    input: { forMatchId: string; now: Date },
  ): Promise<Set<string>> {
    if (!candidateContentItemIds.length) return new Set();
    const rows = await this.model
      .find(
        {
          ownerAccountId: key.ownerAccountId,
          challengeTypeKey: key.challengeTypeKey,
          contentItemId: { $in: candidateContentItemIds },
          $or: [
            { state: 'exposed' },
            {
              state: 'reserved',
              matchId: { $ne: input.forMatchId },
              reservationExpiresAt: { $gt: input.now },
            },
          ],
        },
        { contentItemId: 1 },
      )
      .lean<Array<{ contentItemId: string }>>()
      .exec();
    return new Set(rows.map((row) => row.contentItemId));
  }

  /**
   * Claim these items for one Match without disturbing anything already there.
   *
   * `upsert` with `$setOnInsert` means an existing row — a live exposure, or
   * another Match's reservation that slipped in between the read and this write —
   * is left exactly as it is. The unique index is the lock: this is how two
   * concurrent Matches on one account cannot both claim the same item.
   *
   * Returns the ids this call actually claimed.
   */
  async reserve(
    key: ContentExposureKey,
    contentItemIds: string[],
    input: { matchId: string; now: Date; expiresAt: Date },
    session?: ClientSession,
  ): Promise<string[]> {
    if (!contentItemIds.length) return [];
    const result = await this.model.bulkWrite(
      contentItemIds.map((contentItemId) => ({
        updateOne: {
          filter: {
            ownerAccountId: key.ownerAccountId,
            challengeTypeKey: key.challengeTypeKey,
            contentItemId,
          },
          update: {
            $setOnInsert: {
              ownerAccountId: key.ownerAccountId,
              challengeTypeKey: key.challengeTypeKey,
              contentItemId,
              state: 'reserved' as ContentExposureState,
              matchId: input.matchId,
              exposedAt: null,
              reservationExpiresAt: input.expiresAt,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false, ...(session ? { session } : {}) },
    );
    // Always read back, never infer from the upsert count. A retried or recovered
    // launch re-draws items this Match *already* holds, so nothing is inserted and
    // yet every one of them is legitimately claimed — treating "no insert" as "lost"
    // would refuse a launch its own predecessor had already reserved.
    void result;
    const rows = await this.model
      .find(
        {
          ownerAccountId: key.ownerAccountId,
          challengeTypeKey: key.challengeTypeKey,
          contentItemId: { $in: contentItemIds },
          matchId: input.matchId,
        },
        { contentItemId: 1 },
      )
      .lean<Array<{ contentItemId: string }>>()
      .exec();
    return rows.map((row) => row.contentItemId);
  }

  /**
   * Record that a player was shown these items. Permanent and idempotent.
   *
   * Upserts rather than updates, because a mechanic may present an item this
   * Match never reserved, and re-running it for an already-exposed row changes
   * nothing — which is what makes a reconnect or a duplicated command safe.
   */
  async markExposed(
    key: ContentExposureKey,
    contentItemIds: string[],
    input: { matchId: string; now: Date },
    session?: ClientSession,
  ): Promise<number> {
    if (!contentItemIds.length) return 0;
    const result = await this.model.bulkWrite(
      contentItemIds.map((contentItemId) => ({
        updateOne: {
          filter: {
            ownerAccountId: key.ownerAccountId,
            challengeTypeKey: key.challengeTypeKey,
            contentItemId,
          },
          update: {
            $set: {
              state: 'exposed' as ContentExposureState,
              // Exposure never expires, so it stops being TTL-eligible.
              reservationExpiresAt: null,
            },
            $setOnInsert: {
              ownerAccountId: key.ownerAccountId,
              challengeTypeKey: key.challengeTypeKey,
              contentItemId,
              matchId: input.matchId,
            },
            // First presentation wins; a later one must not move the timestamp.
            $min: { exposedAt: input.now },
          },
          upsert: true,
        },
      })),
      { ordered: false, ...(session ? { session } : {}) },
    );
    return (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
  }

  /**
   * Give back what a Match drew but never showed.
   *
   * Deletes only `reserved` rows, so nothing a player actually saw can be
   * released by an abort, a cancel, or a completion.
   */
  async releaseReservations(
    matchId: string,
    session?: ClientSession,
  ): Promise<number> {
    const result = await this.model
      .deleteMany({ matchId, state: 'reserved' }, session ? { session } : {})
      .exec();
    return result.deletedCount ?? 0;
  }

  /** Test and diagnostic read; never used by selection. */
  async listForOwner(
    key: ContentExposureKey,
  ): Promise<Array<{ contentItemId: string; state: ContentExposureState }>> {
    return this.model
      .find(
        {
          ownerAccountId: key.ownerAccountId,
          challengeTypeKey: key.challengeTypeKey,
        },
        { contentItemId: 1, state: 1, _id: 0 },
      )
      .lean<Array<{ contentItemId: string; state: ContentExposureState }>>()
      .exec();
  }
}
