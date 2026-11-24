import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import {
  CampaignSettingsDocument,
  FreeMatchClaimDocument,
  GiftCodeDocument,
  GiftCodeRedemptionDocument,
} from './campaign.schema';

const SETTINGS_KEY = 'launch-campaign';

export const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 11000;

@Injectable()
export class CampaignRepository {
  constructor(
    @InjectModel(FreeMatchClaimDocument.name)
    private readonly claims: Model<FreeMatchClaimDocument>,
    @InjectModel(CampaignSettingsDocument.name)
    private readonly settings: Model<CampaignSettingsDocument>,
    @InjectModel(GiftCodeDocument.name)
    private readonly codes: Model<GiftCodeDocument>,
    @InjectModel(GiftCodeRedemptionDocument.name)
    private readonly redemptions: Model<GiftCodeRedemptionDocument>,
  ) {}

  // --- free Matches ---------------------------------------------------------

  claimedIn(
    accountId: string,
    windowKey: string,
    transaction?: ClientSession,
  ): Promise<number> {
    return this.claims
      .countDocuments({ accountId, windowKey })
      .session(transaction ?? null)
      .exec();
  }

  claimedEver(accountId: string, transaction?: ClientSession): Promise<number> {
    return this.claims
      .countDocuments({ accountId })
      .session(transaction ?? null)
      .exec();
  }

  async claimOfMatch(
    matchId: string,
    transaction?: ClientSession,
  ): Promise<boolean> {
    return Boolean(
      await this.claims
        .exists({ matchId })
        .session(transaction ?? null)
        .exec(),
    );
  }

  /** False when another request took this slot first. */
  async claim(
    input: {
      accountId: string;
      windowKey: string;
      slot: number;
      matchId: string;
    },
    transaction?: ClientSession,
  ): Promise<boolean> {
    try {
      await this.claims.create([input], { session: transaction });
      return true;
    } catch (error) {
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  }

  // --- settings -------------------------------------------------------------

  async weeklyFreeMatches(): Promise<number | undefined> {
    const found = await this.settings
      .findOne({ key: SETTINGS_KEY })
      .lean()
      .exec();
    return found?.weeklyFreeMatches;
  }

  async setWeeklyFreeMatches(value: number, updatedBy: string): Promise<void> {
    await this.settings
      .updateOne(
        { key: SETTINGS_KEY },
        { $set: { weeklyFreeMatches: value, updatedBy } },
        { upsert: true },
      )
      .exec();
  }

  // --- gift codes -----------------------------------------------------------

  findCode(code: string) {
    return this.codes.findOne({ code }).lean().exec();
  }

  listCodes() {
    return this.codes.find().sort({ createdAt: -1 }).lean().exec();
  }

  async createCode(input: {
    code: string;
    tokens: number;
    maxRedemptions: number;
    note?: string;
  }): Promise<boolean> {
    try {
      await this.codes.create(input);
      return true;
    } catch (error) {
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  }

  async setCodeActive(code: string, active: boolean): Promise<boolean> {
    const result = await this.codes
      .updateOne({ code }, { $set: { active } })
      .exec();
    return result.matchedCount > 0;
  }

  /** False when this account has already used this code. */
  async recordRedemption(code: string, accountId: string): Promise<boolean> {
    try {
      await this.redemptions.create({ code, accountId });
      return true;
    } catch (error) {
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  }

  async forgetRedemption(code: string, accountId: string): Promise<void> {
    await this.redemptions.deleteOne({ code, accountId }).exec();
  }

  /**
   * Takes one use of the code, if any is left.
   *
   * One conditional update, so the fiftieth and fifty-first people to press
   * the button at once cannot both get in.
   */
  async takeUse(code: string): Promise<boolean> {
    const result = await this.codes
      .updateOne(
        {
          code,
          active: true,
          $expr: { $lt: ['$redemptionCount', '$maxRedemptions'] },
        },
        { $inc: { redemptionCount: 1 } },
      )
      .exec();
    return result.modifiedCount === 1;
  }
}
