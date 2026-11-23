import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DiscountCode, normaliseCode } from '../domain/discount-code';
import { DiscountCodeDocument } from './discount-code.schema';

export interface DiscountCodeRecord extends DiscountCode {
  createdBy?: string;
  note?: string;
  createdAt?: Date;
}

@Injectable()
export class DiscountCodeRepository {
  constructor(
    @InjectModel(DiscountCodeDocument.name)
    private readonly codes: Model<DiscountCodeDocument>,
  ) {}

  /** Looks a code up in the one spelling codes are stored in. */
  async findByCode(raw: string): Promise<DiscountCode | undefined> {
    const found = await this.codes
      .findOne({ code: normaliseCode(raw) })
      .lean()
      .exec();
    return found ?? undefined;
  }

  async create(input: {
    code: string;
    percentOff?: number;
    amountOffHalalas?: number;
    packIds?: string[];
    maxRedemptions?: number | null;
    expiresAt?: Date;
    createdBy?: string;
    note?: string;
  }): Promise<DiscountCodeRecord> {
    const created = await this.codes.create({
      ...input,
      code: normaliseCode(input.code),
      packIds: input.packIds ?? [],
      maxRedemptions: input.maxRedemptions ?? null,
      redeemedCount: 0,
      active: true,
    });
    return created.toObject() as unknown as DiscountCodeRecord;
  }

  async list(): Promise<DiscountCodeRecord[]> {
    return this.codes
      .find()
      .sort({ createdAt: -1 })
      .lean()
      .exec() as unknown as Promise<DiscountCodeRecord[]>;
  }

  async setActive(raw: string, active: boolean): Promise<boolean> {
    const result = await this.codes
      .updateOne({ code: normaliseCode(raw) }, { $set: { active } })
      .exec();
    return result.matchedCount > 0;
  }

  /**
   * Counts one paid use.
   *
   * Deliberately unconditional. The cap is checked when the quote is made and
   * again when the charge is opened; by the time this runs the player has
   * already paid, and refusing to count a redemption would not give them their
   * money back — it would only hide that the code went over. A small overshoot
   * when two people pay in the same instant is the right failure: the honest
   * number is in the field, and nobody is charged for a discount they were
   * promised and then denied.
   */
  async countRedemption(raw: string): Promise<void> {
    await this.codes
      .updateOne({ code: normaliseCode(raw) }, { $inc: { redeemedCount: 1 } })
      .exec();
  }
}
