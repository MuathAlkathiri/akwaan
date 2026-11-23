import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorldRemainingDocument } from './world-remaining.schema';

export interface WorldRemaining {
  worldId: string;
  remaining: number;
  totalReady: number;
  exhausted: number;
  rebuiltAt: Date;
}

/** The remaining-questions summary's only data access. */
@Injectable()
export class WorldRemainingRepository {
  constructor(
    @InjectModel(WorldRemainingDocument.name)
    private readonly model: Model<WorldRemainingDocument>,
  ) {}

  async findForAccount(
    accountId: string,
    worldIds: string[],
  ): Promise<WorldRemaining[]> {
    if (!worldIds.length) return [];
    return this.model
      .find(
        { accountId, worldId: { $in: worldIds } },
        {
          worldId: 1,
          remaining: 1,
          totalReady: 1,
          exhausted: 1,
          rebuiltAt: 1,
          _id: 0,
        },
      )
      .lean<WorldRemaining[]>()
      .exec();
  }

  /** Replaces a World's summary with a freshly derived one. */
  async put(accountId: string, summary: WorldRemaining): Promise<void> {
    await this.model
      .updateOne(
        { accountId, worldId: summary.worldId },
        {
          $set: {
            remaining: summary.remaining,
            totalReady: summary.totalReady,
            exhausted: summary.exhausted,
            rebuiltAt: summary.rebuiltAt,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  /**
   * Books newly exhausted questions against a World.
   *
   * Guarded on `remaining` staying at or above the amount, so a double-counted
   * exposure cannot drive the number negative; the summary is only ever a
   * summary, and a wrong one is corrected by a rebuild rather than by arithmetic
   * that is allowed to go impossible. A summary that does not exist yet is not
   * created here — there is nothing to count down from until it is derived.
   */
  async spend(
    accountId: string,
    worldId: string,
    amount: number,
  ): Promise<boolean> {
    if (amount <= 0) return false;
    const result = await this.model
      .updateOne(
        { accountId, worldId, remaining: { $gte: amount } },
        { $inc: { remaining: -amount, exhausted: amount } },
      )
      .exec();
    return (result.modifiedCount ?? 0) > 0;
  }

  /** Drops a World's summary so the next read derives it again. */
  async forget(accountId: string, worldId: string): Promise<void> {
    await this.model.deleteOne({ accountId, worldId }).exec();
  }
}
