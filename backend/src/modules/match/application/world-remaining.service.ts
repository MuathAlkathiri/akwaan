import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ContentItem } from '../../world-content/schemas/content-item.schema';
import { ChallengeType } from '../../world-content/schemas/challenge-type.schema';
import { ContentItemStatus } from '../../world-content/domain/world-content.constants';
import { ContentExposureRepository } from '../persistence/content-exposure.repository';
import { WorldRemainingRepository } from '../persistence/world-remaining.repository';

/**
 * How many questions a World still owes one account.
 *
 * The rule, decided deliberately: a question is spent only once the account has
 * been shown it in EVERY challenge it can be played through. That is the same
 * rule the exposure ledger already keeps — the same fact asked a different way
 * is a different experience — and it means a question seen once in القنبلة is
 * still owed in اقرأ خصمك, so the counter keeps owing it.
 *
 * The number is summarised rather than derived on every read, because the home
 * page asks for it once per World on every visit while it only ever changes
 * when a player is actually shown something.
 *
 * Two ways it is kept true, and both are needed:
 *
 * - **counting down** as questions are exhausted, which is exact and costs one
 *   guarded update;
 * - **deriving from scratch** when no summary exists, when it has aged out, or
 *   when the World's catalogue has changed size underneath it — because an item
 *   added or retired in the admin panel moves the truth without passing through
 *   here at all.
 */
@Injectable()
export class WorldRemainingService {
  private readonly logger = new Logger(WorldRemainingService.name);

  /**
   * How long a summary is trusted without re-deriving it.
   *
   * The catalogue grows through the admin panel, which this never hears about.
   * An hour is short enough that a newly published batch shows up in the same
   * sitting, and long enough that the derivation stays rare.
   */
  private static readonly TRUSTED_FOR_MS = 60 * 60 * 1000;

  constructor(
    @InjectModel(ContentItem.name)
    private readonly items: Model<ContentItem>,
    @InjectModel(ChallengeType.name)
    private readonly challengeTypes: Model<ChallengeType>,
    private readonly exposures: ContentExposureRepository,
    private readonly summaries: WorldRemainingRepository,
  ) {}

  /**
   * The number for each World, as the home page needs it.
   *
   * Anything missing or no longer trusted is derived now rather than guessed
   * at, because a wrong number here is a number a player decides what to buy on.
   */
  async remainingFor(
    accountId: string,
    worldIds: string[],
    now: Date = new Date(),
  ): Promise<Map<string, number>> {
    const answer = new Map<string, number>();
    if (!worldIds.length) return answer;

    const stored = await this.summaries.findForAccount(accountId, worldIds);
    const byWorld = new Map(stored.map((row) => [row.worldId, row]));

    for (const worldId of worldIds) {
      const row = byWorld.get(worldId);
      const fresh =
        row &&
        now.getTime() - row.rebuiltAt.getTime() <
          WorldRemainingService.TRUSTED_FOR_MS;
      if (fresh && row) {
        answer.set(worldId, row.remaining);
        continue;
      }
      answer.set(worldId, await this.rebuild(accountId, worldId, now));
    }
    return answer;
  }

  /**
   * Derives a World's number from the catalogue and the account's history.
   *
   * Bounded by what the ACCOUNT has played, not by the size of the catalogue:
   * the total is a counted index scan, and only the items this account has
   * actually been shown are loaded and checked for exhaustion. A new player
   * costs one count and nothing else.
   */
  async rebuild(
    accountId: string,
    worldId: string,
    now: Date = new Date(),
  ): Promise<number> {
    const world = new Types.ObjectId(worldId);
    const totalReady = await this.items.countDocuments({
      worldId: world,
      status: ContentItemStatus.READY,
    });

    const seenItemIds = await this.exposures.exposedContentItemIds(accountId);
    const exhausted = await this.countExhausted(accountId, world, seenItemIds);

    const remaining = Math.max(0, totalReady - exhausted);
    await this.summaries.put(accountId, {
      worldId,
      remaining,
      totalReady,
      exhausted,
      rebuiltAt: now,
    });
    return remaining;
  }

  /**
   * Books whatever these items have just used up.
   *
   * Called where exposure is already recorded. It asks the question the ledger
   * cannot answer from inside one mechanic: of the items just shown, which have
   * now been seen in every challenge they can appear in. Only those are spent.
   */
  async noteExposed(
    accountId: string,
    contentItemIds: string[],
  ): Promise<void> {
    if (!contentItemIds.length) return;
    try {
      const items = await this.items
        .find(
          { _id: { $in: contentItemIds.map((id) => new Types.ObjectId(id)) } },
          { worldId: 1, compatibleChallengeTypeIds: 1 },
        )
        .lean<
          Array<{
            _id: Types.ObjectId;
            worldId: Types.ObjectId;
            compatibleChallengeTypeIds: Types.ObjectId[];
          }>
        >()
        .exec();
      if (!items.length) return;

      const slugById = await this.challengeSlugsById(
        items.flatMap((item) => item.compatibleChallengeTypeIds ?? []),
      );
      const exposedKeys = await this.exposures.exposedChallengeKeysByItem(
        accountId,
        items.map((item) => item._id.toString()),
      );

      const spentPerWorld = new Map<string, number>();
      for (const item of items) {
        if (!this.isExhausted(item, slugById, exposedKeys)) continue;
        const worldId = item.worldId.toString();
        spentPerWorld.set(worldId, (spentPerWorld.get(worldId) ?? 0) + 1);
      }

      for (const [worldId, amount] of spentPerWorld) {
        const booked = await this.summaries.spend(accountId, worldId, amount);
        if (!booked) {
          // Either no summary exists yet, or counting down would take it below
          // zero. Both mean the stored number can no longer be trusted, and a
          // derivation is the only honest repair.
          await this.summaries.forget(accountId, worldId);
        }
      }
    } catch (error) {
      // The counter is a convenience on a screen. It must never be the reason a
      // challenge fails to record what a player was shown.
      this.logger.error({
        event: 'world_remaining_update_failed',
        accountId,
        items: contentItemIds.length,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Of the account's seen items, how many belong to this World and are used up. */
  private async countExhausted(
    accountId: string,
    worldId: Types.ObjectId,
    seenItemIds: string[],
  ): Promise<number> {
    if (!seenItemIds.length) return 0;
    const items = await this.items
      .find(
        {
          _id: { $in: seenItemIds.map((id) => new Types.ObjectId(id)) },
          worldId,
          status: ContentItemStatus.READY,
        },
        { compatibleChallengeTypeIds: 1 },
      )
      .lean<
        Array<{
          _id: Types.ObjectId;
          compatibleChallengeTypeIds: Types.ObjectId[];
        }>
      >()
      .exec();
    if (!items.length) return 0;

    const slugById = await this.challengeSlugsById(
      items.flatMap((item) => item.compatibleChallengeTypeIds ?? []),
    );
    const exposedKeys = await this.exposures.exposedChallengeKeysByItem(
      accountId,
      items.map((item) => item._id.toString()),
    );

    return items.filter((item) => this.isExhausted(item, slugById, exposedKeys))
      .length;
  }

  /**
   * Seen in every challenge it can be played through.
   *
   * An item compatible with nothing is NOT exhausted: it cannot be played at
   * all, so it was never owed, and counting it as spent would quietly subtract
   * questions the player never had a chance at.
   */
  private isExhausted(
    item: {
      _id: Types.ObjectId;
      compatibleChallengeTypeIds?: Types.ObjectId[];
    },
    slugById: Map<string, string>,
    exposedKeys: Map<string, Set<string>>,
  ): boolean {
    const slugs = (item.compatibleChallengeTypeIds ?? [])
      .map((id) => slugById.get(id.toString()))
      .filter((slug): slug is string => Boolean(slug));
    if (!slugs.length) return false;
    const seen = exposedKeys.get(item._id.toString());
    if (!seen) return false;
    return slugs.every((slug) => seen.has(slug));
  }

  private async challengeSlugsById(
    ids: Types.ObjectId[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.map((id) => id.toString()))];
    if (!unique.length) return new Map();
    const rows = await this.challengeTypes
      .find(
        { _id: { $in: unique.map((id) => new Types.ObjectId(id)) } },
        { slug: 1 },
      )
      .lean<Array<{ _id: Types.ObjectId; slug: string }>>()
      .exec();
    return new Map(rows.map((row) => [row._id.toString(), row.slug]));
  }
}
