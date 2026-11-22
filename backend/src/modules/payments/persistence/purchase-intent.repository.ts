import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PurchaseIntentDocument } from './purchase-intent.schema';

export interface PurchaseIntent {
  providerPaymentId: string;
  provider: string;
  accountId: string;
  packId: string;
  amountHalalas: number;
  fulfilledAt?: Date;
  /** Set by the schema's timestamps. Used to bound what the sweeper re-checks. */
  createdAt?: Date;
}

@Injectable()
export class PurchaseIntentRepository {
  constructor(
    @InjectModel(PurchaseIntentDocument.name)
    private readonly intents: Model<PurchaseIntentDocument>,
  ) {}

  async record(intent: PurchaseIntent): Promise<void> {
    await this.intents.create(intent);
  }

  async findByProviderPaymentId(
    provider: string,
    providerPaymentId: string,
  ): Promise<PurchaseIntent | undefined> {
    const found = await this.intents
      .findOne({ provider, providerPaymentId })
      .lean()
      .exec();
    return found ?? undefined;
  }

  /**
   * Charges nobody has settled yet, oldest first.
   *
   * Bounded at both ends on purpose. `startedBefore` keeps the sweeper from
   * racing a webhook that is still in flight for a charge opened seconds ago.
   * `startedAfter` is what stops it: most unsettled intents are checkouts the
   * player simply abandoned, and without a floor every one of them would be
   * re-queried against the provider on every sweep, for ever.
   */
  async findUnfulfilled(query: {
    provider: string;
    startedBefore: Date;
    startedAfter: Date;
    limit: number;
  }): Promise<PurchaseIntent[]> {
    return this.intents
      .find({
        provider: query.provider,
        fulfilledAt: { $exists: false },
        createdAt: { $lt: query.startedBefore, $gt: query.startedAfter },
      })
      .sort({ createdAt: 1 })
      .limit(query.limit)
      .lean()
      .exec() as unknown as Promise<PurchaseIntent[]>;
  }

  /** Marks the charge as honoured. Safe to call twice. */
  async markFulfilled(
    provider: string,
    providerPaymentId: string,
    at: Date,
  ): Promise<void> {
    await this.intents
      .updateOne({ provider, providerPaymentId }, { $set: { fulfilledAt: at } })
      .exec();
  }
}
